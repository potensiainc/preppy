import { NextResponse, type NextRequest } from "next/server";

export function proxy(_request: NextRequest): NextResponse {
  const response = NextResponse.next();
  if (process.env.PREPPY_ENVIRONMENT === "STAGING") {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
}

export const config = {
  matcher: "/((?!_next/static|_next/image).*)",
};
