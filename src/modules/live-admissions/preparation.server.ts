import "server-only";

import { createHash } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import {
  opportunities,
  opportunitySourceBindings,
  opportunityVersionEvidence,
  opportunityVersions,
} from "@/src/db/schema";
import type { TransactionManager } from "@/src/infrastructure/db/runtime.server";

import type { LiveAdmissionProposal } from "./contracts";

export type PrepareLiveAdmissionDraftInput = Readonly<{
  institutionId: string;
  sourceId: string;
  observationId: string;
  snapshotId: string;
  proposal: LiveAdmissionProposal;
}>;

export type PreparedLiveAdmissionDraft = Readonly<{
  institutionId: string;
  opportunityId: string;
  versionId: string;
  versionNumber: 1;
  sourceId: string;
  observationId: string;
  snapshotId: string;
  contentFingerprint: string;
  evidenceExcerpt: string;
  created: boolean;
}>;

export class LiveAdmissionPreparationError extends Error {
  constructor(
    readonly code:
      "INVALID_PROVENANCE" | "INSTITUTION_NOT_DRAFT" | "PREPARATION_CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "LiveAdmissionPreparationError";
  }
}

export function liveAdmissionContentFingerprint(
  proposal: LiveAdmissionProposal,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        businessState: proposal.businessState,
        title: proposal.title.trim(),
        summary: proposal.summary?.trim() ?? null,
        targetAudience: proposal.targetAudience?.trim() ?? null,
        eventStartAt: proposal.eventStartAt?.toISOString() ?? null,
        eventEndAt: proposal.eventEndAt?.toISOString() ?? null,
        applicationOpenAt: proposal.applicationOpenAt?.toISOString() ?? null,
        applicationCloseAt: proposal.applicationCloseAt?.toISOString() ?? null,
        actionUrl: proposal.actionUrl.trim(),
        knowledgeState: proposal.knowledgeState,
        academicYearLabel: proposal.academicYearLabel,
      }),
    )
    .digest("hex");
}

function opportunitySlug(
  institutionId: string,
  academicYearLabel: string | null,
): string {
  const year = academicYearLabel?.match(/20\d{2}/u)?.[0] ?? "current";
  return `live-admissions-${institutionId}-${year}`;
}

export async function prepareLiveAdmissionDraft(
  input: PrepareLiveAdmissionDraftInput,
  dependencies: Readonly<{
    transactionManager: TransactionManager;
    now?: () => Date;
  }>,
): Promise<PreparedLiveAdmissionDraft> {
  const now = dependencies.now?.() ?? new Date();
  if (!Number.isFinite(now.getTime())) {
    throw new RangeError("preparation time must be valid");
  }
  const contentFingerprint = liveAdmissionContentFingerprint(input.proposal);
  const slug = opportunitySlug(
    input.institutionId,
    input.proposal.academicYearLabel,
  );
  return dependencies.transactionManager.run(async (executor) => {
    const rows = (await executor.raw(sql`
      select i.publication_state as "institutionPublicationState",
        s.source_type as "sourceType", s.authority_level as "authorityLevel",
        s.lifecycle_status as "sourceLifecycle", b.role as "bindingRole",
        so.snapshot_id as "observationSnapshotId"
      from institutions i
      join institution_source_bindings b
        on b.institution_id=i.id and b.is_active=true
      join sources s on s.id=b.source_id
      join source_snapshots ss on ss.id=${input.snapshotId}
        and ss.source_id=s.id
      join source_observations so on so.id=${BigInt(input.observationId)}
        and so.source_id=s.id
      where i.id=${input.institutionId} and s.id=${input.sourceId}
        and b.role in ('ADMISSIONS','APPLICATION','OFFICIAL_MAIN')
      for update of i, s, b, ss, so
    `)) as unknown as Array<{
      institutionPublicationState: string;
      sourceType: string;
      authorityLevel: string;
      sourceLifecycle: string;
      bindingRole: string;
      observationSnapshotId: string | null;
    }>;
    const provenance = rows[0];
    if (
      provenance === undefined ||
      ![
        "OFFICIAL_ADMISSION_PAGE",
        "OFFICIAL_NOTICE_BOARD",
        "OFFICIAL_APPLICATION_PORTAL",
        "OFFICIAL_SCHOOL_PAGE",
      ].includes(provenance.sourceType) ||
      !["PRIMARY", "SECONDARY_OFFICIAL"].includes(provenance.authorityLevel) ||
      provenance.sourceLifecycle !== "ACTIVE" ||
      provenance.observationSnapshotId !== input.snapshotId
    ) {
      throw new LiveAdmissionPreparationError(
        "INVALID_PROVENANCE",
        "Automatic proposal must reference one active official Source Observation and Snapshot",
      );
    }
    if (provenance.institutionPublicationState !== "DRAFT") {
      throw new LiveAdmissionPreparationError(
        "INSTITUTION_NOT_DRAFT",
        "Automatic preparation is restricted to DRAFT Institutions",
      );
    }

    const [existingOpportunity] = await executor.drizzle
      .select({
        id: opportunities.id,
        institutionId: opportunities.institutionId,
        publicationState: opportunities.publicationState,
        kind: opportunities.kind,
      })
      .from(opportunities)
      .where(eq(opportunities.slug, slug))
      .limit(1);
    if (existingOpportunity !== undefined) {
      const [existingVersion] = await executor.drizzle
        .select({
          id: opportunityVersions.id,
          versionNumber: opportunityVersions.versionNumber,
          verificationState: opportunityVersions.verificationState,
          isCurrent: opportunityVersions.isCurrent,
          contentFingerprint: opportunityVersions.contentFingerprint,
        })
        .from(opportunityVersions)
        .where(
          and(
            eq(opportunityVersions.opportunityId, existingOpportunity.id),
            eq(opportunityVersions.versionNumber, 1),
          ),
        )
        .limit(1);
      const [existingEvidence] =
        existingVersion === undefined
          ? []
          : await executor.drizzle
              .select({ id: opportunityVersionEvidence.id })
              .from(opportunityVersionEvidence)
              .where(
                and(
                  eq(
                    opportunityVersionEvidence.opportunityVersionId,
                    existingVersion.id,
                  ),
                  eq(opportunityVersionEvidence.sourceId, input.sourceId),
                  eq(
                    opportunityVersionEvidence.sourceObservationId,
                    BigInt(input.observationId),
                  ),
                  eq(
                    opportunityVersionEvidence.sourceSnapshotId,
                    input.snapshotId,
                  ),
                ),
              )
              .limit(1);
      if (
        existingOpportunity.institutionId === input.institutionId &&
        existingOpportunity.publicationState === "DRAFT" &&
        existingOpportunity.kind === input.proposal.kind &&
        existingVersion?.verificationState === "UNVERIFIED" &&
        existingVersion.isCurrent === false &&
        existingVersion.contentFingerprint === contentFingerprint &&
        existingEvidence !== undefined
      ) {
        return Object.freeze({
          institutionId: input.institutionId,
          opportunityId: existingOpportunity.id,
          versionId: existingVersion.id,
          versionNumber: 1 as const,
          sourceId: input.sourceId,
          observationId: input.observationId,
          snapshotId: input.snapshotId,
          contentFingerprint,
          evidenceExcerpt: input.proposal.evidenceExcerpt,
          created: false,
        });
      }
      throw new LiveAdmissionPreparationError(
        "PREPARATION_CONFLICT",
        "Existing automatic proposal does not match the reviewed evidence",
      );
    }

    const [opportunity] = await executor.drizzle
      .insert(opportunities)
      .values({
        institutionId: input.institutionId,
        slug,
        kind: input.proposal.kind,
        truthMode: "NATIVE",
        publicationState: "DRAFT",
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: opportunities.id });
    if (opportunity === undefined) {
      throw new Error("DRAFT Opportunity insert did not return a row");
    }
    await executor.drizzle.insert(opportunitySourceBindings).values({
      opportunityId: opportunity.id,
      sourceId: input.sourceId,
      role:
        provenance.bindingRole === "APPLICATION"
          ? "APPLICATION"
          : "PRIMARY_NOTICE",
      isPrimary: true,
      isActive: true,
      boundAt: now,
    });
    const [version] = await executor.drizzle
      .insert(opportunityVersions)
      .values({
        opportunityId: opportunity.id,
        truthMode: "NATIVE",
        versionNumber: 1,
        supersedesVersionId: null,
        verificationState: "UNVERIFIED",
        businessState: input.proposal.businessState,
        isCurrent: false,
        title: input.proposal.title,
        summary: input.proposal.summary,
        targetAudience: input.proposal.targetAudience,
        eventStartAt: input.proposal.eventStartAt,
        eventEndAt: input.proposal.eventEndAt,
        applicationOpenAt: input.proposal.applicationOpenAt,
        applicationCloseAt: input.proposal.applicationCloseAt,
        actionUrl: input.proposal.actionUrl,
        verifiedAt: null,
        verifiedByAdminId: null,
        contentFingerprint,
        createdAt: now,
      })
      .returning({ id: opportunityVersions.id });
    if (version === undefined) {
      throw new Error("UNVERIFIED Opportunity Version insert failed");
    }
    await executor.drizzle.insert(opportunityVersionEvidence).values({
      opportunityVersionId: version.id,
      sourceId: input.sourceId,
      sourceObservationId: BigInt(input.observationId),
      sourceSnapshotId: input.snapshotId,
      evidenceRole: "PRIMARY",
      createdAt: now,
    });
    return Object.freeze({
      institutionId: input.institutionId,
      opportunityId: opportunity.id,
      versionId: version.id,
      versionNumber: 1 as const,
      sourceId: input.sourceId,
      observationId: input.observationId,
      snapshotId: input.snapshotId,
      contentFingerprint,
      evidenceExcerpt: input.proposal.evidenceExcerpt,
      created: true,
    });
  });
}
