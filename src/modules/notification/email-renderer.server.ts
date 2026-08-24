import "server-only";

import type { RenderedEmailMessage } from "@/src/modules/notification/email-sender";

export type OpportunityChangeEmailInput = Readonly<{
  to: string;
  notificationId: string;
  deliveryId: string;
  institutionName: string;
  opportunityTitle: string;
  changeSummary: string;
  deepLinkPath: string;
}>;

function absoluteUrl(appBaseUrl: string, path: string) {
  return new URL(path, new URL(appBaseUrl).origin).toString();
}

export function renderOpportunityChangeEmail(
  input: OpportunityChangeEmailInput,
  options: { readonly appBaseUrl?: string } = {},
): RenderedEmailMessage {
  const appBaseUrl =
    options.appBaseUrl ?? process.env.APP_BASE_URL ?? "http://localhost:3000";
  return {
    to: input.to,
    subject: `[PREPPY] ${input.institutionName} 입학정보가 변경되었습니다`,
    text: [
      input.institutionName,
      input.opportunityTitle,
      input.changeSummary,
      absoluteUrl(appBaseUrl, input.deepLinkPath),
      absoluteUrl(appBaseUrl, "/me/settings"),
    ].join("\n\n"),
    notificationId: input.notificationId,
    deliveryId: input.deliveryId,
  };
}
