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
    subject: `[PREPPY] ${input.institutionName} 입학정보가 변경됐어요`,
    text: [
      input.institutionName,
      input.opportunityTitle,
      input.changeSummary,
      `변경된 입학정보 보기\n${absoluteUrl(appBaseUrl, input.deepLinkPath)}`,
      `알림 설정 보기\n${absoluteUrl(appBaseUrl, "/me/settings")}`,
    ].join("\n\n"),
    notificationId: input.notificationId,
    deliveryId: input.deliveryId,
  };
}
