import "server-only";

import { and, eq, sql } from "drizzle-orm";

import {
  institutions,
  opportunities,
  opportunityVersionEvidence,
  opportunityVersions,
} from "@/src/db/schema";
import type { TransactionManager } from "@/src/infrastructure/db/runtime.server";

import type { LiveAdmissionProposal } from "./contracts";
import { liveAdmissionContentFingerprint } from "./preparation.server";

export type ReviewLiveAdmissionDraftInput = Readonly<{
  institutionId: string;
  opportunityId: string;
  expectedVersionId: string;
  expectedContentFingerprint: string;
  sourceId: string;
  observationId: string;
  snapshotId: string;
  operatorAdminId: string;
  approvedProposal: LiveAdmissionProposal;
}>;

export type ReviewedLiveAdmission = Readonly<{
  institutionId: string;
  opportunityId: string;
  supersededVersionId: string;
  verifiedVersionId: string;
  verifiedVersionNumber: 2;
  lastCollectedAt: string;
  lastVerifiedAt: string;
  institutionPublicationState: "PUBLISHED";
  opportunityPublicationState: "PUBLISHED";
  sideEffectDelta: Readonly<{
    outboxEvents: number;
    notifications: number;
    notificationDeliveries: number;
    notificationDeliveryAttempts: number;
  }>;
}>;

export class LiveAdmissionReviewError extends Error {
  constructor(
    readonly code:
      | "REVIEW_CONFLICT"
      | "INVALID_OPERATOR"
      | "INVALID_EVIDENCE"
      | "SIDE_EFFECT_DETECTED",
    message: string,
  ) {
    super(message);
    this.name = "LiveAdmissionReviewError";
  }
}

type SideEffectCounts = Readonly<{
  outboxEvents: number;
  notifications: number;
  notificationDeliveries: number;
  notificationDeliveryAttempts: number;
}>;

async function sideEffectCounts(
  executor: Parameters<Parameters<TransactionManager["run"]>[0]>[0],
): Promise<SideEffectCounts> {
  const rows = (await executor.raw(sql`
    select
      (select count(*)::int from outbox_events) as "outboxEvents",
      (select count(*)::int from notifications) as notifications,
      (select count(*)::int from notification_deliveries) as "notificationDeliveries",
      (select count(*)::int from notification_delivery_attempts) as "notificationDeliveryAttempts"
  `)) as unknown as SideEffectCounts[];
  return rows[0]!;
}

function delta(before: SideEffectCounts, after: SideEffectCounts) {
  return Object.freeze({
    outboxEvents: after.outboxEvents - before.outboxEvents,
    notifications: after.notifications - before.notifications,
    notificationDeliveries:
      after.notificationDeliveries - before.notificationDeliveries,
    notificationDeliveryAttempts:
      after.notificationDeliveryAttempts - before.notificationDeliveryAttempts,
  });
}

function iso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

export async function reviewAndPublishLiveAdmissionDraft(
  input: ReviewLiveAdmissionDraftInput,
  dependencies: Readonly<{
    transactionManager: TransactionManager;
    now?: () => Date;
  }>,
): Promise<ReviewedLiveAdmission> {
  const reviewedAt = dependencies.now?.() ?? new Date();
  if (!Number.isFinite(reviewedAt.getTime())) {
    throw new RangeError("review time must be valid");
  }
  const approvedFingerprint = liveAdmissionContentFingerprint(
    input.approvedProposal,
  );
  return dependencies.transactionManager.run(async (executor) => {
    const before = await sideEffectCounts(executor);
    const rows = (await executor.raw(sql`
      select i.publication_state as "institutionPublicationState",
        o.publication_state as "opportunityPublicationState",
        o.truth_mode as "truthMode", o.kind,
        v.version_number as "versionNumber",
        v.verification_state as "verificationState",
        v.is_current as "isCurrent",
        v.content_fingerprint as "contentFingerprint",
        a.status as "operatorStatus",
        s.source_type as "sourceType",
        s.authority_level as "authorityLevel",
        s.lifecycle_status as "sourceLifecycle",
        so.observed_at as "observedAt"
      from institutions i
      join opportunities o on o.institution_id=i.id
      join opportunity_versions v on v.opportunity_id=o.id
      join opportunity_version_evidence e
        on e.opportunity_version_id=v.id
        and e.source_id=${input.sourceId}
        and e.source_observation_id=${BigInt(input.observationId)}
        and e.source_snapshot_id=${input.snapshotId}
      join opportunity_source_bindings ob
        on ob.opportunity_id=o.id and ob.source_id=e.source_id
        and ob.is_active=true
      join sources s on s.id=e.source_id
      join source_observations so on so.id=e.source_observation_id
        and so.source_id=e.source_id and so.snapshot_id=e.source_snapshot_id
      join source_snapshots ss on ss.id=e.source_snapshot_id
        and ss.source_id=e.source_id
      join admin_users a on a.id=${input.operatorAdminId}
      where i.id=${input.institutionId}
        and o.id=${input.opportunityId}
        and v.id=${input.expectedVersionId}
      for update of i, o, v, e, ob, s, so, ss, a
    `)) as unknown as Array<{
      institutionPublicationState: string;
      opportunityPublicationState: string;
      truthMode: string;
      kind: string;
      versionNumber: number;
      verificationState: string;
      isCurrent: boolean;
      contentFingerprint: string | null;
      operatorStatus: string;
      sourceType: string;
      authorityLevel: string;
      sourceLifecycle: string;
      observedAt: Date | string;
    }>;
    const current = rows[0];
    if (current === undefined) {
      throw new LiveAdmissionReviewError(
        "INVALID_EVIDENCE",
        "Review tuple does not resolve to one canonical evidence chain",
      );
    }
    if (current.operatorStatus !== "ACTIVE") {
      throw new LiveAdmissionReviewError(
        "INVALID_OPERATOR",
        "Local review requires an active Admin identity",
      );
    }
    if (
      current.institutionPublicationState !== "DRAFT" ||
      current.opportunityPublicationState !== "DRAFT" ||
      current.truthMode !== "NATIVE" ||
      current.kind !== input.approvedProposal.kind ||
      current.versionNumber !== 1 ||
      current.verificationState !== "UNVERIFIED" ||
      current.isCurrent ||
      current.contentFingerprint !== input.expectedContentFingerprint
    ) {
      throw new LiveAdmissionReviewError(
        "REVIEW_CONFLICT",
        "Automatic proposal changed or is no longer eligible for review",
      );
    }
    if (
      ![
        "OFFICIAL_ADMISSION_PAGE",
        "OFFICIAL_NOTICE_BOARD",
        "OFFICIAL_APPLICATION_PORTAL",
        "OFFICIAL_SCHOOL_PAGE",
      ].includes(current.sourceType) ||
      !["PRIMARY", "SECONDARY_OFFICIAL"].includes(current.authorityLevel) ||
      current.sourceLifecycle !== "ACTIVE"
    ) {
      throw new LiveAdmissionReviewError(
        "INVALID_EVIDENCE",
        "Review evidence Source is no longer official and active",
      );
    }

    const [verified] = await executor.drizzle
      .insert(opportunityVersions)
      .values({
        opportunityId: input.opportunityId,
        truthMode: "NATIVE",
        versionNumber: 2,
        supersedesVersionId: input.expectedVersionId,
        verificationState: "VERIFIED",
        businessState: input.approvedProposal.businessState,
        isCurrent: true,
        title: input.approvedProposal.title,
        summary: input.approvedProposal.summary,
        targetAudience: input.approvedProposal.targetAudience,
        eventStartAt: input.approvedProposal.eventStartAt,
        eventEndAt: input.approvedProposal.eventEndAt,
        applicationOpenAt: input.approvedProposal.applicationOpenAt,
        applicationCloseAt: input.approvedProposal.applicationCloseAt,
        actionUrl: input.approvedProposal.actionUrl,
        verifiedAt: reviewedAt,
        verifiedByAdminId: input.operatorAdminId,
        contentFingerprint: approvedFingerprint,
        createdAt: reviewedAt,
      })
      .returning({ id: opportunityVersions.id });
    if (verified === undefined) {
      throw new Error("VERIFIED Opportunity Version insert failed");
    }
    await executor.drizzle.insert(opportunityVersionEvidence).values({
      opportunityVersionId: verified.id,
      sourceId: input.sourceId,
      sourceObservationId: BigInt(input.observationId),
      sourceSnapshotId: input.snapshotId,
      evidenceRole: "PRIMARY",
      createdAt: reviewedAt,
    });
    const [superseded] = await executor.drizzle
      .update(opportunityVersions)
      .set({ verificationState: "SUPERSEDED" })
      .where(
        and(
          eq(opportunityVersions.id, input.expectedVersionId),
          eq(opportunityVersions.opportunityId, input.opportunityId),
          eq(opportunityVersions.verificationState, "UNVERIFIED"),
          eq(opportunityVersions.isCurrent, false),
        ),
      )
      .returning({ id: opportunityVersions.id });
    if (superseded === undefined) {
      throw new LiveAdmissionReviewError(
        "REVIEW_CONFLICT",
        "Automatic proposal changed during review",
      );
    }
    const [publishedOpportunity] = await executor.drizzle
      .update(opportunities)
      .set({
        publicationState: "PUBLISHED",
        publishedAt: reviewedAt,
        updatedAt: reviewedAt,
      })
      .where(
        and(
          eq(opportunities.id, input.opportunityId),
          eq(opportunities.institutionId, input.institutionId),
          eq(opportunities.publicationState, "DRAFT"),
        ),
      )
      .returning({ id: opportunities.id });
    if (publishedOpportunity === undefined) {
      throw new LiveAdmissionReviewError(
        "REVIEW_CONFLICT",
        "Opportunity publication state changed during review",
      );
    }
    const [publishedInstitution] = await executor.drizzle
      .update(institutions)
      .set({
        publicationState: "PUBLISHED",
        publishedAt: reviewedAt,
        updatedAt: reviewedAt,
      })
      .where(
        and(
          eq(institutions.id, input.institutionId),
          eq(institutions.publicationState, "DRAFT"),
        ),
      )
      .returning({ id: institutions.id });
    if (publishedInstitution === undefined) {
      throw new LiveAdmissionReviewError(
        "REVIEW_CONFLICT",
        "Institution publication state changed during review",
      );
    }
    const after = await sideEffectCounts(executor);
    const sideEffectDelta = delta(before, after);
    if (Object.values(sideEffectDelta).some((value) => value !== 0)) {
      throw new LiveAdmissionReviewError(
        "SIDE_EFFECT_DETECTED",
        "Local review unexpectedly created notification side effects",
      );
    }
    return Object.freeze({
      institutionId: input.institutionId,
      opportunityId: input.opportunityId,
      supersededVersionId: input.expectedVersionId,
      verifiedVersionId: verified.id,
      verifiedVersionNumber: 2 as const,
      lastCollectedAt: iso(current.observedAt),
      lastVerifiedAt: reviewedAt.toISOString(),
      institutionPublicationState: "PUBLISHED" as const,
      opportunityPublicationState: "PUBLISHED" as const,
      sideEffectDelta,
    });
  });
}
