import { handleAdminBindOpportunitySourceRequest } from "@/src/modules/admin/http/source-commands.server";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ opportunityId: string }> },
): Promise<Response> {
  return handleAdminBindOpportunitySourceRequest(request, await context.params);
}
