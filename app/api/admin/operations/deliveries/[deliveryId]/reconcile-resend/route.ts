import { handleAdminReconcileResendRequest } from "@/src/modules/admin/http/outbox-operations.server";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ deliveryId: string }> },
) {
  return handleAdminReconcileResendRequest(request, await context.params);
}
