export function legacyMenuDestination(
  pathname: string,
  hash: string,
): string | null {
  if (pathname !== "/") return null;
  if (hash === "#articles") return "/articles";
  if (hash === "#current-opportunities") return "/opportunities";
  return null;
}
