import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type VettedAddress = Readonly<{
  address: string;
  family: 4 | 6;
}>;

export type DnsResolver = (
  hostname: string,
) => Promise<readonly VettedAddress[]>;

export class CollectorNetworkError extends Error {
  constructor(
    readonly code: "DNS_ERROR" | "SSRF_BLOCKED",
    message: string,
  ) {
    super(message);
    this.name = "CollectorNetworkError";
  }
}

function ipv4Number(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    if (value > 255) return null;
    result = (result * 256 + value) >>> 0;
  }
  return result;
}

function ipv4InCidr(address: number, network: string, prefix: number): boolean {
  const networkNumber = ipv4Number(network)!;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (address & mask) >>> 0 === (networkNumber & mask) >>> 0;
}

const blockedIpv4Cidrs = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.31.196.0", 24],
  ["192.52.193.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const;

function parseIpv6(address: string): bigint | null {
  if (address.includes("%")) return null;
  let value = address.toLowerCase();
  const ipv4Match = value.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/);
  if (ipv4Match) {
    const ipv4 = ipv4Number(ipv4Match[1]!);
    if (ipv4 === null) return null;
    const high = ((ipv4 >>> 16) & 0xffff).toString(16);
    const low = (ipv4 & 0xffff).toString(16);
    value = `${value.slice(0, -ipv4Match[1]!.length)}${high}:${low}`;
  }
  if ((value.match(/::/g) ?? []).length > 1) return null;
  const [leftText, rightText] = value.split("::");
  const left = leftText ? leftText.split(":") : [];
  const right = rightText ? rightText.split(":") : [];
  const omitted = value.includes("::") ? 8 - left.length - right.length : 0;
  if (omitted < 0 || (!value.includes("::") && left.length !== 8)) return null;
  const groups = [
    ...left,
    ...Array.from({ length: omitted }, () => "0"),
    ...right,
  ];
  if (
    groups.length !== 8 ||
    groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))
  ) {
    return null;
  }
  return groups.reduce(
    (result, group) => (result << 16n) | BigInt(`0x${group}`),
    0n,
  );
}

function ipv6InCidr(address: bigint, network: string, prefix: number): boolean {
  const networkNumber = parseIpv6(network)!;
  const shift = BigInt(128 - prefix);
  return address >> shift === networkNumber >> shift;
}

const blockedIpv6Cidrs = [
  ["::", 8],
  ["100::", 64],
  ["2001:2::", 48],
  ["2001:10::", 28],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const;

const publicIpv6Cidrs = [["2000::", 4]] as const;

const blockedPublicIpv6Exceptions = [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
] as const;

export function assertSafeAddress(address: string): void {
  const family = isIP(address);
  let blocked = family === 0;
  if (family === 4) {
    const numeric = ipv4Number(address)!;
    blocked = blockedIpv4Cidrs.some(([network, prefix]) =>
      ipv4InCidr(numeric, network, prefix),
    );
  } else if (family === 6) {
    const numeric = parseIpv6(address);
    blocked =
      numeric === null ||
      !publicIpv6Cidrs.some(([network, prefix]) =>
        ipv6InCidr(numeric, network, prefix),
      ) ||
      blockedIpv6Cidrs.some(([network, prefix]) =>
        ipv6InCidr(numeric, network, prefix),
      ) ||
      blockedPublicIpv6Exceptions.some(([network, prefix]) =>
        ipv6InCidr(numeric, network, prefix),
      );
  }
  if (blocked) {
    throw new CollectorNetworkError(
      "SSRF_BLOCKED",
      "Network destination is blocked",
    );
  }
}

async function defaultResolver(hostname: string): Promise<VettedAddress[]> {
  const answers = await lookup(hostname, { all: true, verbatim: true });
  return answers.map((answer) => {
    if (answer.family !== 4 && answer.family !== 6) {
      throw new CollectorNetworkError("DNS_ERROR", "DNS resolution failed");
    }
    return { address: answer.address, family: answer.family };
  });
}

export async function resolveVettedAddresses(
  hostname: string,
  resolver: DnsResolver = defaultResolver,
  addressAssertion: (address: string) => void = assertSafeAddress,
): Promise<readonly VettedAddress[]> {
  let answers: readonly VettedAddress[];
  try {
    answers = await resolver(hostname);
  } catch (error) {
    if (error instanceof CollectorNetworkError) throw error;
    throw new CollectorNetworkError("DNS_ERROR", "DNS resolution failed");
  }
  if (answers.length === 0) {
    throw new CollectorNetworkError("DNS_ERROR", "DNS resolution failed");
  }
  for (const answer of answers) addressAssertion(answer.address);
  return Object.freeze(answers.map((answer) => Object.freeze({ ...answer })));
}
