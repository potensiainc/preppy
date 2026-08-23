import {
  createFollowMutationRuntimeHandler,
  createFollowPostHandler,
} from "@/src/modules/follow/http.server";
import { getFollowRuntime } from "@/src/modules/follow/runtime.server";

export const dynamic = "force-dynamic";

const handler = createFollowMutationRuntimeHandler(
  getFollowRuntime,
  createFollowPostHandler,
);

export async function POST(request: Request): Promise<Response> {
  return handler(request);
}
