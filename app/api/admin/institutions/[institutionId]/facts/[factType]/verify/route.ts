import { handleAdminVerifyInstitutionFactRequest } from "@/src/modules/admin/http/verify-institution-fact.server";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: {
    params: Promise<{ institutionId: string; factType: string }>;
  },
): Promise<Response> {
  return handleAdminVerifyInstitutionFactRequest(request, await context.params);
}
