import { handleAdminRetryOutboxRequest } from "@/src/modules/admin/http/outbox-operations.server";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  return handleAdminRetryOutboxRequest(request, await context.params);
}
