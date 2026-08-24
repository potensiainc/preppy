import { handleResendWebhookRequest } from "@/src/modules/notification/resend-webhook-http.server";

export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return handleResendWebhookRequest(request);
}
