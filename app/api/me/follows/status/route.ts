import {
  createFollowStatusHandler,
  createFollowStatusRuntimeHandler,
} from "@/src/modules/follow/http.server";
import { getFollowRuntime } from "@/src/modules/follow/runtime.server";

export const dynamic = "force-dynamic";

const handler = createFollowStatusRuntimeHandler(
  getFollowRuntime,
  createFollowStatusHandler,
);

export async function GET(request: Request): Promise<Response> {
  return handler(request);
}
