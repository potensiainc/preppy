const FORBIDDEN_ACTION_URL_CODE_POINT = /[\p{White_Space}\p{Cc}\p{Cf}\\]/u;
const CANONICAL_WEB_AUTHORITY_PREFIX = /^(?:http|https):\/\//;

/**
 * Accepts only byte-canonical absolute HTTP(S) URLs. The sole intentional
 * WHATWG serialization exception is a host-only URL without a trailing slash.
 */
export function isCanonicalAdminActionUrl(value: string): boolean {
  if (
    value.length === 0 ||
    FORBIDDEN_ACTION_URL_CODE_POINT.test(value) ||
    !CANONICAL_WEB_AUTHORITY_PREFIX.test(value)
  ) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.hostname.length === 0 ||
    parsed.username !== "" ||
    parsed.password !== ""
  ) {
    return false;
  }

  if (parsed.href === value) return true;

  const canonicalHostOnly = `${parsed.protocol}//${parsed.host}`;
  return (
    value === canonicalHostOnly &&
    parsed.pathname === "/" &&
    parsed.search === "" &&
    parsed.hash === ""
  );
}
