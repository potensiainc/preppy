export class CollectorUrlError extends Error {
  readonly code = "INVALID_URL";

  constructor(message = "Collector URL is invalid or unsupported") {
    super(message);
    this.name = "CollectorUrlError";
  }
}

export function parseCollectorUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CollectorUrlError();
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.hostname.length === 0 ||
    url.username.length > 0 ||
    url.password.length > 0
  ) {
    throw new CollectorUrlError();
  }
  return url;
}

export function normalizeDiscoveryUrl(value: string): string {
  const url = parseCollectorUrl(value);
  url.hash = "";
  return url.href;
}

export function discoveryDomainKey(value: string): string {
  const hostname = parseCollectorUrl(value).hostname.toLowerCase();
  return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
}

export function isSameDiscoveryDomain(left: string, right: string): boolean {
  return discoveryDomainKey(left) === discoveryDomainKey(right);
}
