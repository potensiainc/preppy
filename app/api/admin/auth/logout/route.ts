import { handleAdminLogoutRoute } from "@/src/modules/admin/auth/http.server";
import { getAdminLogoutRuntime } from "@/src/modules/admin/auth/runtime.server";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleAdminLogoutRoute(request, getAdminLogoutRuntime);
}
