const SAFE_REDIRECT_PATTERNS = [
  /^\/$/,
  /^\/institutions(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/,
  /^\/opportunities\/[a-z0-9]+(?:-[a-z0-9]+)*$/,
  /^\/articles\/[a-z0-9]+(?:-[a-z0-9]+)*$/,
  /^\/my-preppy$/,
  /^\/onboarding$/,
] as const;

const ENCODED_PATH_SEPARATOR_OR_CONTROL = /%(?:2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/i;

export function isSafeRedirectPath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 256) {
    return false;
  }
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value) ||
    ENCODED_PATH_SEPARATOR_OR_CONTROL.test(value) ||
    value.includes("?") ||
    value.includes("#")
  ) {
    return false;
  }
  return SAFE_REDIRECT_PATTERNS.some((pattern) => pattern.test(value));
}

export function safeRedirectPath(
  value: unknown,
  fallback: "/" | "/my-preppy" = "/",
): string {
  return isSafeRedirectPath(value) ? value : fallback;
}
