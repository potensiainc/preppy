import { NextResponse, type NextRequest } from "next/server";

import { isStagingEnvironment } from "@/src/config/deployment-environment";

export function proxy(_request: NextRequest): NextResponse {
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
