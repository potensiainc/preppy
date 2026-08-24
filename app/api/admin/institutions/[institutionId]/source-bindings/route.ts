import { handleAdminBindInstitutionSourceRequest } from "@/src/modules/admin/http/source-commands.server";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ institutionId: string }> },
): Promise<Response> {
  return handleAdminBindInstitutionSourceRequest(request, await context.params);
}
