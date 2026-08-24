import { handleAdminMoveSourceRequest } from "@/src/modules/admin/http/source-commands.server";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ sourceId: string }> },
): Promise<Response> {
  return handleAdminMoveSourceRequest(request, await context.params);
}
