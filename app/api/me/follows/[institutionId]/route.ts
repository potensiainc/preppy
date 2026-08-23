import {
  createFollowDeleteHandler,
  createFollowMutationRuntimeHandler,
} from "@/src/modules/follow/http.server";
import { getFollowRuntime } from "@/src/modules/follow/runtime.server";

export const dynamic = "force-dynamic";

const handler = createFollowMutationRuntimeHandler(
  getFollowRuntime,
  createFollowDeleteHandler,
);

export async function DELETE(
  request: Request,
  context: { params: Promise<{ institutionId: string }> },
): Promise<Response> {
  const { institutionId } = await context.params;
  return handler(request, institutionId);
}
