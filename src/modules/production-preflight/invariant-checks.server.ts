import "server-only";

import type { PreflightCheck } from "@/src/modules/production-preflight/contracts";
import type { ReadOnlyPreflightSession } from "@/src/modules/production-preflight/read-only-database.server";

type CheckDefinition = {
  code: string;
  severity: PreflightCheck["severity"];
  message: string;
};

function addCount(
  checks: PreflightCheck[],
  count: number,
  definition: CheckDefinition,
): void {
  if (count > 0 || definition.severity === "INFO") {
    checks.push({ ...definition, count });
  }
}

export async function collectInvariantChecks(
  session: ReadOnlyPreflightSession,
  options: { now: Date; staleLeaseSeconds: number; appBaseUrl: string },
): Promise<PreflightCheck[]> {
  const staleBefore = new Date(
    options.now.getTime() - options.staleLeaseSeconds * 1_000,
  );
  const [bridge, identity, notification, article] = await Promise.all([
    session.getBridgeIntegrityCounts(),
    session.getIdentityIntegrityCounts(),
    session.getNotificationIntegrityCounts(staleBefore),
    session.getArticleIntegrityCounts(options.appBaseUrl),
  ]);
  const checks: PreflightCheck[] = [];

  const blockers: Array<[number, string, string]> = [
    [
      bridge.orphanInstitutionBridge,
      "ORPHAN_INSTITUTION_BRIDGE",
      "Institution-School bridge has a missing parent.",
    ],
    [
      bridge.orphanOpportunityBridge,
      "ORPHAN_OPPORTUNITY_BRIDGE",
      "Opportunity-AdmissionEvent bridge has a missing parent.",
    ],
    [
      bridge.bridgeOwnershipContradiction,
      "BRIDGE_OWNERSHIP_CONTRADICTION",
      "Opportunity bridge composite ownership is inconsistent.",
    ],
    [
      bridge.legacyOpportunityMissingBridge,
      "LEGACY_OPPORTUNITY_MISSING_BRIDGE",
      "Legacy-backed Opportunity has no explicit AdmissionEvent bridge.",
    ],
    [
      bridge.nativeOpportunityWithBridge,
      "NATIVE_OPPORTUNITY_WITH_LEGACY_BRIDGE",
      "Native Opportunity has an invalid legacy bridge.",
    ],
    [
      bridge.invalidMixedOwnership,
      "INVALID_MIXED_OWNERSHIP",
      "Institution contains contradictory native/legacy ownership.",
    ],
    [
      bridge.orphanInstitutionSourceBinding,
      "ORPHAN_INSTITUTION_SOURCE_BINDING",
      "Institution Source binding has a missing parent.",
    ],
    [
      bridge.orphanOpportunitySourceBinding,
      "ORPHAN_OPPORTUNITY_SOURCE_BINDING",
      "Opportunity Source binding has a missing parent.",
    ],
    [
      bridge.multipleInstitutionPrimary,
      "MULTIPLE_INSTITUTION_ACTIVE_PRIMARY",
      "Institution has multiple active primary official Sources.",
    ],
    [
      bridge.multipleOpportunityPrimary,
      "MULTIPLE_OPPORTUNITY_ACTIVE_PRIMARY",
      "Opportunity has multiple active primary Sources for one role.",
    ],
    [
      identity.duplicateAuthIdentity,
      "AUTH_IDENTITY_NOT_UNIQUE",
      "Auth identity uniqueness is violated.",
    ],
    [
      identity.duplicateUserEmail,
      "USER_EMAIL_NOT_UNIQUE",
      "User Email ownership uniqueness is violated.",
    ],
    [
      identity.duplicateNotificationPreference,
      "NOTIFICATION_PREFERENCE_NOT_UNIQUE",
      "Notification preference uniqueness is violated.",
    ],
    [
      identity.duplicateFollow,
      "FOLLOW_NOT_UNIQUE",
      "Follow uniqueness is violated.",
    ],
    [
      identity.invalidFollowEpisodeInterval,
      "INVALID_FOLLOW_EPISODE_INTERVAL",
      "FollowEpisode has an invalid interval.",
    ],
    [
      identity.activeFollowWithoutOpenEpisode,
      "ACTIVE_FOLLOW_WITHOUT_OPEN_EPISODE",
      "Active Follow has no active FollowEpisode.",
    ],
    [
      identity.multipleOpenEpisodes,
      "MULTIPLE_OPEN_FOLLOW_EPISODES",
      "Follow has multiple active FollowEpisodes.",
    ],
    [
      identity.inactiveFollowWithOpenEpisode,
      "INACTIVE_FOLLOW_WITH_OPEN_EPISODE",
      "Inactive Follow still has an active FollowEpisode.",
    ],
    [
      identity.activeUserMissingRequiredConsent,
      "ACTIVE_USER_CONSENT_INTEGRITY",
      "Active User lacks a latest granted required consent.",
    ],
    [
      identity.activeUserMissingEmailPreference,
      "ACTIVE_USER_PREFERENCE_INTEGRITY",
      "Active User lacks an Email notification preference.",
    ],
    [
      notification.orphanDelivery,
      "ORPHAN_NOTIFICATION_DELIVERY",
      "Notification Delivery has a missing parent.",
    ],
    [
      notification.orphanDeliveryAttempt,
      "ORPHAN_DELIVERY_ATTEMPT",
      "Delivery Attempt has a missing parent.",
    ],
    [
      notification.duplicateProviderMessage,
      "PROVIDER_MESSAGE_NOT_UNIQUE",
      "Provider message identity is duplicated.",
    ],
    [
      article.redirectChain,
      "REDIRECT_CHAIN_PRESENT",
      "Active Article redirects are not flattened.",
    ],
    [
      article.redirectSourceCollision,
      "REDIRECT_SOURCE_COLLISION",
      "Redirect source collides with a current Article path.",
    ],
  ];
  for (const [count, code, message] of blockers) {
    addCount(checks, count, { code, severity: "BLOCKER", message });
  }

  const warnings: Array<[number, string, string]> = [
    [
      notification.staleProcessingLease,
      "STALE_OUTBOX_PROCESSING_LEASE",
      "Outbox contains stale PROCESSING leases.",
    ],
    [
      notification.failedOutbox,
      "FAILED_OUTBOX_EVENT",
      "Outbox contains FAILED events.",
    ],
    [
      notification.deadLetterOutbox,
      "DEAD_LETTER_OUTBOX_EVENT",
      "Outbox contains DEAD_LETTER events.",
    ],
    [
      notification.resultUnknownAttempt,
      "RESULT_UNKNOWN_DELIVERY_ATTEMPT",
      "Delivery Attempt has an unresolved provider result.",
    ],
    [
      notification.orphanProviderEvent,
      "ORPHAN_PROVIDER_EVENT",
      "Provider event has no matching Delivery Attempt message identity.",
    ],
    [
      article.unsafeArticleBody,
      "HISTORICAL_UNSAFE_ARTICLE_BODY",
      "Stored Article content matches an unsafe historical-body signature.",
    ],
    [
      article.nonpublicRedirectTarget,
      "NONPUBLIC_REDIRECT_TARGET",
      "Historical redirect targets a nonpublic Article.",
    ],
    [
      article.sameOriginCanonicalMismatch,
      "SAME_ORIGIN_CANONICAL_MISMATCH",
      "Article same-origin canonical URL does not match its canonical path.",
    ],
  ];
  for (const [count, code, message] of warnings) {
    addCount(checks, count, { code, severity: "WARNING", message });
  }

  addCount(checks, bridge.legacyBackedInstitutions, {
    code: "LEGACY_BACKED_INSTITUTIONS",
    severity: "INFO",
    message: "Institutions with an explicit legacy School bridge.",
  });
  addCount(checks, bridge.nativeInstitutions, {
    code: "NATIVE_INSTITUTIONS",
    severity: "INFO",
    message: "Native Institutions without a School bridge.",
  });
  addCount(checks, article.publishedArticle, {
    code: "PUBLISHED_ARTICLES",
    severity: "INFO",
    message: "Currently published Articles.",
  });
  return checks;
}
