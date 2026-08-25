const DIRECT_PROHIBITED_KEYS = new Set([
  "address",
  "adminfreetext",
  "authorization",
  "email",
  "fullname",
  "jku",
  "locationsearch",
  "name",
  "oauthsubject",
  "providermetadata",
  "providerpayload",
  "providersubject",
  "query",
  "rawquery",
  "rawsearch",
  "snapshot",
  "sourcesnapshot",
  "url",
  "x5u",
]);

const PROHIBITED_KEY_FRAGMENTS = [
  "admissionevent",
  "birth",
  "bridgeid",
  "child",
  "firstname",
  "kakao",
  "lastname",
  "legacyid",
  "memo",
  "oauth",
  "phone",
  "providerpayload",
  "schoolid",
  "searchtext",
  "subject",
] as const;

const EXPLICIT_SAFE_KEYS = new Set(["emailstate", "querylengthbucket"]);

function normalizedKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isProhibitedAnalyticsKey(key: string): boolean {
  const normalized = normalizedKey(key);
  if (EXPLICIT_SAFE_KEYS.has(normalized)) return false;
  return (
    DIRECT_PROHIBITED_KEYS.has(normalized) ||
    PROHIBITED_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment))
  );
}

export class AnalyticsPrivacyError extends Error {
  constructor() {
    super("Analytics payload contains a prohibited property");
    this.name = "AnalyticsPrivacyError";
  }
}

export function assertAnalyticsPayloadHasNoProhibitedKeys(
  value: unknown,
): void {
  if (Array.isArray(value)) {
    for (const item of value) assertAnalyticsPayloadHasNoProhibitedKeys(item);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, nested] of Object.entries(value)) {
    if (isProhibitedAnalyticsKey(key)) throw new AnalyticsPrivacyError();
    assertAnalyticsPayloadHasNoProhibitedKeys(nested);
  }
}
