import "server-only";

import { sql } from "drizzle-orm";

import type { NotificationDeliverySuppressReason } from "@/src/db/schema";
import type { TransactionExecutor } from "@/src/infrastructure/db/runtime.server";

export type EligibleDelivery = Readonly<{
  eligible: true;
  email: string;
  notificationId: string;
  opportunityId: string;
  institutionName: string;
  opportunityTitle: string;
  changeSummary: string;
  deepLinkPath: string;
}>;

export type IneligibleDelivery = Readonly<{
  eligible: false;
  reason: NotificationDeliverySuppressReason;
}>;

type EligibilityRow = {
  notificationId: string;
  opportunityId: string;
  institutionName: string;
  opportunityTitle: string | null;
  opportunityKind: string;
  changeSummary: string;
  deepLinkPath: string;
  userStatus: string;
  followStatus: string | null;
  email: string | null;
  verificationState: string | null;
  deliveryState: string | null;
  removedAt: Date | string | null;
  consentDecision: string | null;
  preferenceState: string | null;
};

export async function evaluateDeliveryEligibility(
  executor: TransactionExecutor,
  deliveryId: string,
): Promise<EligibleDelivery | IneligibleDelivery | null> {
  const [row] = (await executor.raw(sql`
    select notification.id as "notificationId",
      opportunity.id as "opportunityId",
      institution.display_name as "institutionName",
      current_version.title as "opportunityTitle",
      opportunity.kind as "opportunityKind",
      change.summary as "changeSummary",
      notification.deep_link_path as "deepLinkPath",
      identity.status as "userStatus",
      follow.status as "followStatus",
      email.email,
      email.verification_state as "verificationState",
      email.delivery_state as "deliveryState",
      email.removed_at as "removedAt",
      consent.decision as "consentDecision",
      preference.state as "preferenceState"
    from notification_deliveries as delivery
    join notifications as notification on notification.id=delivery.notification_id
    join opportunity_changes as change on change.id=notification.opportunity_change_id
    join opportunities as opportunity on opportunity.id=notification.opportunity_id
    join institutions as institution on institution.id=opportunity.institution_id
    join users as identity on identity.id=delivery.user_id
    left join follows as follow
      on follow.user_id=delivery.user_id
      and follow.institution_id=opportunity.institution_id
    left join user_emails as email on email.user_id=delivery.user_id
    left join notification_preferences as preference
      on preference.user_id=delivery.user_id and preference.channel='EMAIL'
    left join lateral (
      select decision
      from consent_decisions
      where user_id=delivery.user_id
        and consent_type='SERVICE_EMAIL_UPDATES'
      order by decided_at desc, id desc
      limit 1
    ) as consent on true
    left join lateral (
      select title
      from opportunity_versions
      where opportunity_id=opportunity.id
        and is_current=true and verification_state='VERIFIED'
      limit 1
    ) as current_version on true
    where delivery.id=${deliveryId}
    limit 1
  `)) as unknown as EligibilityRow[];
  if (!row) return null;
  if (row.userStatus !== "ACTIVE") {
    return { eligible: false, reason: "USER_INACTIVE" };
  }
  if (row.followStatus !== "ACTIVE") {
    return { eligible: false, reason: "FOLLOW_INACTIVE" };
  }
  if (
    row.email === null ||
    row.verificationState !== "VERIFIED" ||
    row.removedAt !== null ||
    row.deliveryState === "REMOVED"
  ) {
    return { eligible: false, reason: "EMAIL_UNAVAILABLE" };
  }
  if (row.deliveryState !== "USABLE") {
    return { eligible: false, reason: "EMAIL_SUPPRESSED" };
  }
  if (row.consentDecision !== "GRANTED") {
    return { eligible: false, reason: "CONSENT_REVOKED" };
  }
  if (row.preferenceState !== "ENABLED") {
    return { eligible: false, reason: "PREFERENCE_DISABLED" };
  }
  return {
    eligible: true,
    email: row.email,
    notificationId: row.notificationId,
    opportunityId: row.opportunityId,
    institutionName: row.institutionName,
    opportunityTitle: row.opportunityTitle ?? row.opportunityKind,
    changeSummary: row.changeSummary,
    deepLinkPath: row.deepLinkPath,
  };
}
