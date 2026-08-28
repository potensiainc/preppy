import { describe, expect, it } from "vitest";

import {
  assertSafeAddress,
  resolveVettedAddresses,
} from "@/src/modules/http-collector/network-safety.server";

describe("HTTP collector SSRF address policy", () => {
  it.each([
    "0.0.0.0",
    "10.0.0.1",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.0.2.1",
    "192.168.1.1",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "240.0.0.1",
    "::",
    "::1",
    "::ffff:127.0.0.1",
    "::ffff:8.8.8.8",
    "64:ff9b::1",
    "100::1",
    "2001::1",
    "2001:2::1",
    "2001:db8::1",
    "2002::1",
    "3fff::1",
    "3fff:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
    "4000::1",
    "fc00::1",
    "fe80::1",
    "fec0::1",
    "feff:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
    "ff02::1",
  ])("rejects non-global address %s", (address) => {
    expect(() => assertSafeAddress(address)).toThrowError(
      expect.objectContaining({ code: "SSRF_BLOCKED" }),
    );
  });

  it.each([
    "8.8.8.8",
    "93.184.216.34",
    "2001:4860:4860::8888",
    "2606:4700:4700::1111",
  ])("accepts globally routable address %s", (address) => {
    expect(() => assertSafeAddress(address)).not.toThrow();
  });

  it("rejects the hostname when any DNS answer is unsafe", async () => {
    await expect(
      resolveVettedAddresses("mixed.example.test", async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ]),
    ).rejects.toMatchObject({ code: "SSRF_BLOCKED" });
  });

  it("returns every vetted DNS answer for pinned dialing", async () => {
    await expect(
      resolveVettedAddresses("safe.example.test", async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "2606:4700:4700::1111", family: 6 },
      ]),
    ).resolves.toEqual([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:4700:4700::1111", family: 6 },
    ]);
  });

  it("classifies resolver failures without leaking the resolver error", async () => {
    await expect(
      resolveVettedAddresses("missing.example.test", async () => {
        throw new Error("resolver internal detail");
      }),
    ).rejects.toMatchObject({
      code: "DNS_ERROR",
      message: "DNS resolution failed",
    });
  });
});
