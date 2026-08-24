import { handleAdminLoginStartRoute } from "@/src/modules/admin/auth/http.server";
import { getAdminAuthRuntime } from "@/src/modules/admin/auth/runtime.server";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return handleAdminLoginStartRoute(request, getAdminAuthRuntime);
}
