export type RouteScrollAction = "TOP" | "PRESERVE";

export function resolveRouteScrollAction({
  previousPathname,
  nextPathname,
  hash,
}: {
  previousPathname: string | null;
  nextPathname: string;
  hash: string;
}): RouteScrollAction {
  if (previousPathname === null || previousPathname === nextPathname || hash) {
    return "PRESERVE";
  }

  return "TOP";
}
