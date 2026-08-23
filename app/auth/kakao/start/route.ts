import {
  createKakaoStartHandler,
  createRuntimeRouteHandler,
} from "@/src/modules/auth/http.server";
import { getAuthRuntime } from "@/src/modules/auth/runtime.server";

export const dynamic = "force-dynamic";

const handler = createRuntimeRouteHandler(
  getAuthRuntime,
  createKakaoStartHandler,
);

export async function GET(request: Request): Promise<Response> {
  return handler(request);
}
