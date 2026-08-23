import "server-only";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export class OriginMismatchError extends Error {
  constructor() {
    super("Request origin is missing or does not match the application origin");
    this.name = "OriginMismatchError";
  }
}

function parseSerializedOrigin(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (
      parsed.origin !== value ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.pathname !== "/" ||
      parsed.search !== "" ||
      parsed.hash !== ""
    ) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function assertSameOriginForMutation(
  request: Request,
  appBaseUrl: string,
): void {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return;

  const configuredOrigin = new URL(appBaseUrl).origin;
  const requestOriginHeader = request.headers.get("origin");
  const requestOrigin = requestOriginHeader
    ? parseSerializedOrigin(requestOriginHeader)
    : null;
  if (requestOrigin === null || requestOrigin !== configuredOrigin) {
    throw new OriginMismatchError();
  }
}
