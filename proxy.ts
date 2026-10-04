import { NextResponse, type NextRequest } from "next/server";

import { isStagingEnvironment } from "@/src/config/deployment-environment";

export function proxy(request: NextRequest): NextResponse {
  if (
    request.nextUrl.pathname === "/schoolmap" &&
    request.nextUrl.searchParams.get("area") === ""
  ) {
    const canonical = request.nextUrl.clone();
    canonical.searchParams.delete("area");
    return NextResponse.redirect(canonical, 308);
  }
  const response = NextResponse.next();
  if (isStagingEnvironment()) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
}

export const config = {
  matcher:
    "/((?!_next/static|_next/image|favicon\\.ico$|robots\\.txt$|sitemap\\.xml$|.*\\.(?:css|js|map|woff2?|ttf|otf|eot)$).*)",
};
