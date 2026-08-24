import { handleAdminUnbindInstitutionSourceRequest } from "@/src/modules/admin/http/source-commands.server";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  context: {
    params: Promise<{ institutionId: string; sourceId: string; role: string }>;
  },
): Promise<Response> {
  return handleAdminUnbindInstitutionSourceRequest(
    request,
    await context.params,
  );
}
