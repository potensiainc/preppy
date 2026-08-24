import { handleAdminUnbindOpportunitySourceRequest } from "@/src/modules/admin/http/source-commands.server";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  context: {
    params: Promise<{ opportunityId: string; sourceId: string; role: string }>;
  },
): Promise<Response> {
  return handleAdminUnbindOpportunitySourceRequest(
    request,
    await context.params,
  );
}
