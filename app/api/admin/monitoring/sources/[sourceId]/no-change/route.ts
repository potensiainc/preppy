import { handleAdminNoChangeRequest } from "@/src/modules/admin/http/no-change.server";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ sourceId: string }> },
): Promise<Response> {
  return handleAdminNoChangeRequest(request, await context.params);
}
