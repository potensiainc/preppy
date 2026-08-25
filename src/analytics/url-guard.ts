export type SafeGa4LocationContext = Readonly<{
  pageLocation: string;
  pageReferrer?: string;
}>;

function httpOriginRoot(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return `${url.origin}/`;
  } catch {
    return null;
  }
}

export function safeGa4LocationContext(
  currentUrl: string,
  referrer: string,
): SafeGa4LocationContext {
  const pageLocation = httpOriginRoot(currentUrl);
  if (!pageLocation) throw new Error("Invalid analytics page origin");
  const pageReferrer = httpOriginRoot(referrer);
  return {
    pageLocation,
    ...(pageReferrer ? { pageReferrer } : {}),
  };
}
