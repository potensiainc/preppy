import { handleAdminVerifyOpportunityRequest } from "@/src/modules/admin/http/verify-opportunity.server";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ opportunityId: string }> },
): Promise<Response> {
  return handleAdminVerifyOpportunityRequest(request, await context.params);
}
