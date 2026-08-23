import {
  createLogoutHandler,
  createLogoutRuntimeRouteHandler,
} from "@/src/modules/auth/http.server";
import { getLogoutRuntime } from "@/src/modules/auth/runtime.server";

export const dynamic = "force-dynamic";

const handler = createLogoutRuntimeRouteHandler(
  getLogoutRuntime,
  createLogoutHandler,
  { getTrustedAppBaseUrl: () => process.env.APP_BASE_URL },
);

export async function POST(request: Request): Promise<Response> {
  return handler(request);
}
