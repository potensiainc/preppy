import { createSessionHandler } from "@/src/modules/auth/http.server";
import { getAuthRuntime } from "@/src/modules/auth/runtime.server";

export const dynamic = "force-dynamic";

const handler = createSessionHandler({
  getCurrentUser: (sessionCookie) =>
    sessionCookie === null
      ? Promise.resolve(null)
      : getAuthRuntime().getCurrentUser(sessionCookie),
});

export async function GET(request: Request): Promise<Response> {
  return handler(request);
}
