import "server-only";
import { planSessionCampuses } from "./campus-plan.server";
import { captureReviewedSource } from "./capture-reviewed-source.server";
import { createHash, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import {
  adminUsers,
  institutions,
  opportunities,
  opportunityVersions,
  opportunitySourceBindings,
  opportunityVersionEvidence,
  institutionSourceBindings,
  institutionSectionCoverages,
} from "@/src/db/schema";
import {
  ConflictError,
  ForbiddenError,
  ValidationError,
} from "@/src/application/errors";
import { AuditWriter } from "@/src/application/audit-writer.server";
import type { AdminCommandContext } from "@/src/application/context";
import type { TransactionManager } from "@/src/infrastructure/db/runtime.server";
import { enqueueDataRevalidation } from "@/src/modules/cache/data-revalidation.server";
import { verifyNativeOpportunityInTransaction } from "@/src/modules/monitoring/verify-opportunity.server";
import {
  packageChecksum,
  sessionAudience,
  sessionIdentityFingerprint,
  sessionPackageSchema,
  sessionSlug,
  sessionState,
} from "./session-package";

/** Existing-campus, reviewed package command. Never sends customer notification events. */
export async function registerEnglishKindergartenSessions(
  ctx: AdminCommandContext,
  raw: unknown,
  options: {
    apply: boolean;
    expectedChecksum?: string;
    cacheConsumersV2Ready: boolean;
  },
  transactionManager: Pick<TransactionManager, "run">,
) {
  const data = sessionPackageSchema.parse(raw);
  const checksum = packageChecksum(data);
  if (
    options.apply &&
    (options.expectedChecksum !== checksum || !options.cacheConsumersV2Ready)
  )
    throw ValidationError.invalidRequest();
  if (
    data.sources.some((source) => new Date(source.checkedAt) > ctx.occurredAt)
  )
    throw ValidationError.invalidRequest();
  return transactionManager.run(async (executor) => {
    const [admin] = await executor.drizzle
      .select({ status: adminUsers.status })
      .from(adminUsers)
      .where(eq(adminUsers.id, ctx.adminUserId))
      .for("update")
      .limit(1);
    if (admin?.status !== "ACTIVE") throw new ForbiddenError();
    // Scope lock also protects two packages attempting the same campus/date identity.
    await executor.raw(
      sql`select pg_advisory_xact_lock(hashtext('preppy-english-kindergarten-sessions'))`,
    );
    const campuses = await planSessionCampuses(executor, data);
    const plan = [];
    for (const row of data.sessions) {
      const institution = campuses.resolved.get(row.institutionSlug);
      if (
        !institution ||
        institution.category !== "ENGLISH_KINDERGARTEN" ||
        institution.publicationState !== "PUBLISHED"
      ) {
        plan.push({
          row,
          reject: "CAMPUS_MAPPING_OR_PUBLICATION_REQUIRED" as const,
        });
        continue;
      }
      const slug = sessionSlug(row);
      const opportunity = (
        await executor.drizzle
          .select()
          .from(opportunities)
          .where(eq(opportunities.slug, slug))
          .for("update")
          .limit(1)
      ).at(0);
      if (
        opportunity &&
        (opportunity.institutionId !== institution.id ||
          opportunity.truthMode !== "NATIVE" ||
          opportunity.kind !== "INFORMATION_SESSION")
      )
        throw new ConflictError();
      const [current] = opportunity
        ? await executor.drizzle
            .select()
            .from(opportunityVersions)
            .where(
              and(
                eq(opportunityVersions.opportunityId, opportunity.id),
                eq(opportunityVersions.isCurrent, true),
              ),
            )
            .for("update")
            .limit(1)
        : [];
      if (opportunity && opportunity.publicationState !== "PUBLISHED") {
        plan.push({
          row,
          opportunity,
          current,
          slug,
          reject:
            "EXISTING_SESSION_PUBLICATION_RECONCILIATION_REQUIRED" as const,
        });
        continue;
      }
      // A pre-existing differently named event at this campus/time must be explicitly reconciled.
      const fingerprint = sessionIdentityFingerprint(row);
      const collisions =
        await executor.raw(sql`select o.id, identity.fingerprint
        from opportunities o join opportunity_versions v on v.opportunity_id=o.id and v.is_current=true
        left join english_session_identities identity on identity.opportunity_id=o.id
        where o.institution_id=${institution.id} and o.kind='INFORMATION_SESSION'
          and (v.event_start_at=${row.eventStartsAt}::timestamptz or (${Boolean(row.officialSessionId)} and identity.fingerprint=${fingerprint}))`);
      if (
        collisions.some(
          (item) =>
            item.id !== opportunity?.id &&
            (item.fingerprint == null ||
              item.fingerprint === fingerprint ||
              String(item.fingerprint).split(":")[0] !==
                fingerprint.split(":")[0]),
        )
      ) {
        plan.push({
          row,
          reject: "EXISTING_SESSION_RECONCILIATION_REQUIRED" as const,
        });
        continue;
      }
      const audience = sessionAudience(row);
      const candidate = {
        businessState: sessionState(row),
        title: `${data.campuses.find((c) => c.slug === row.institutionSlug)?.name ?? institution.displayName} ${row.academicYear}학년도 설명회`,
        summary: row.note,
        targetAudience: audience,
        eventStartAt: row.eventStartsAt,
        eventEndAt: row.eventEndsAt,
        applicationOpenAt: row.applicationOpensAt,
        applicationCloseAt: row.applicationClosesAt,
        actionUrl: row.actionUrl,
        locationText: current?.locationText ?? null,
        validFrom: current?.validFrom?.toISOString() ?? null,
        validUntil: current?.validUntil?.toISOString() ?? null,
      };
      const same =
        current &&
        current.title === candidate.title &&
        current.summary === candidate.summary &&
        current.targetAudience === audience &&
        current.businessState === candidate.businessState &&
        current.actionUrl === candidate.actionUrl &&
        current.eventStartAt?.getTime() ===
          new Date(row.eventStartsAt).getTime() &&
        (current.eventEndAt?.toISOString() ?? null) ===
          (row.eventEndsAt ? new Date(row.eventEndsAt).toISOString() : null) &&
        (current.applicationOpenAt?.toISOString() ?? null) ===
          (row.applicationOpensAt
            ? new Date(row.applicationOpensAt).toISOString()
            : null) &&
        (current.applicationCloseAt?.toISOString() ?? null) ===
          (row.applicationClosesAt
            ? new Date(row.applicationClosesAt).toISOString()
            : null);
      if (!same && (current?.id ?? null) !== row.expectedCurrentVersionId)
        throw new ConflictError();
      if (same && current) {
        let evidenceChanged = false;
        for (const key of row.evidenceKeys) {
          const source = data.sources.find((s) => s.key === key)!;
          const hash = createHash("sha256")
            .update(source.normalizedText)
            .digest("hex");
          const captured = await executor.raw(
            sql`select 1 from opportunity_version_evidence evidence join sources source on source.id=evidence.source_id join source_snapshots snapshot on snapshot.id=evidence.source_snapshot_id and snapshot.source_id=source.id where evidence.opportunity_version_id=${current.id} and source.canonical_url=${source.url} and snapshot.content_hash=${hash} limit 1`,
          );
          if (!captured.length) evidenceChanged = true;
        }
        if (evidenceChanged) {
          plan.push({
            row,
            current,
            reject: "EVIDENCE_ONLY_REVIEW_REQUIRED" as const,
          });
          continue;
        }
      }
      plan.push({
        row,
        institution,
        opportunity,
        current,
        slug,
        candidate,
        fingerprint,
        same: Boolean(same),
      });
    }
    const sessionRejects = plan
      .filter((item) => "reject" in item)
      .map((item) => ({
        institutionSlug: item.row.institutionSlug,
        eventStartsAt: item.row.eventStartsAt,
        code: item.reject,
        ...("opportunity" in item
          ? {
              publicationState: item.opportunity?.publicationState,
              opportunityId: item.opportunity?.id,
            }
          : {}),
        ...("current" in item ? { current: item.current } : {}),
      }));
    const rejects = [...campuses.rejects, ...sessionRejects];
    const before = plan
      .filter((item) => "slug" in item)
      .map((item) => ({
        slug: item.slug,
        publicationState: item.opportunity?.publicationState ?? null,
        current: item.current ?? null,
        operation:
          "reject" in item
            ? "RECONCILIATION_REQUIRED"
            : item.same
              ? "UNCHANGED"
              : item.opportunity
                ? "NEW_VERSION"
                : "CREATE_SESSION",
      }));
    if (!options.apply || rejects.length)
      return {
        applied: false,
        checksum,
        before,
        campusBefore: campuses.before,
        rejects,
        changed: 0,
        createdCampuses: 0,
      };
    let updatedCampuses = 0;
    for (const campus of [...campuses.creates, ...campuses.links]) {
      const isNew = campuses.creates.some(
        (c) => c.desired.id === campus.desired.id,
      );
      if (isNew)
        await executor.drizzle
          .insert(institutions)
          .values({ ...campus.desired, publishedAt: ctx.occurredAt });
      else if (
        campus.row.updateAddress &&
        campus.desired.addressLine !== campus.row.officialAddress
      ) {
        await executor.drizzle
          .update(institutions)
          .set({
            addressLine: campus.row.officialAddress,
            updatedAt: ctx.occurredAt,
          })
          .where(eq(institutions.id, campus.desired.id));
        await AuditWriter.write(
          {
            ...ctx,
            actionType: "EK_CAMPUS_ADDRESS_CORRECTED_NO_NOTIFY",
            entityType: "INSTITUTION",
            entityId: campus.desired.id,
            reason: "VERIFIED_SESSION_PACKAGE",
            metadata: {
              changedFields: ["ADDRESS_LINE"],
              contentFingerprint: `sha256:${checksum}`,
            },
          },
          executor,
        );
        updatedCampuses++;
      }
      if (campus.row.officialCampusId) {
        const identity = campus.row.officialCampusId;
        await executor.raw(
          sql`insert into english_campus_identities(namespace,external_id,institution_id) values(${identity.namespace},${identity.value},${campus.desired.id}) on conflict(namespace,external_id) do nothing`,
        );
      }
      if (campus.row.officialCampusId) {
        const identity = campus.row.officialCampusId;
        const owners = await executor.raw(
          sql`select institution_id from english_campus_identities where namespace=${identity.namespace} and external_id=${identity.value}`,
        );
        if (
          owners.length !== 1 ||
          owners[0]?.institution_id !== campus.desired.id
        )
          throw new ConflictError();
      }
      for (const name of new Set([campus.desired.displayName, campus.row.name]))
        await executor.raw(
          sql`insert into english_campus_aliases(institution_id,name) values(${campus.desired.id},${name}) on conflict do nothing`,
        );
      for (const [index, key] of campus.row.identityEvidenceKeys.entries()) {
        const evidence = data.sources.find((source) => source.key === key)!;
        const existingBinding = await executor.raw(
          sql`select 1 from institution_source_bindings binding join sources source on source.id=binding.source_id where binding.institution_id=${campus.desired.id} and binding.is_active=true and source.canonical_url=${evidence.url} limit 1`,
        );
        if (existingBinding.length) continue;
        const capture = await captureReviewedSource(
          executor,
          data.sources.find((source) => source.key === key)!,
        );
        await executor.drizzle.insert(institutionSourceBindings).values({
          institutionId: campus.desired.id,
          sourceId: capture.sourceId,
          role: isNew ? "OFFICIAL_MAIN" : "ADMISSIONS",
          isPrimary: isNew && index === 0,
          isActive: true,
        });
        if (isNew && index === 0)
          await executor.drizzle.insert(institutionSectionCoverages).values({
            institutionId: campus.desired.id,
            section: "OPERATING_INFO",
            status: "CONFIRMED",
            sourceId: capture.sourceId,
            sourceSnapshotId: capture.snapshotId,
            lastCollectedAt: new Date(
              data.sources.find((source) => source.key === key)!.checkedAt,
            ),
            lastCheckedAt: ctx.occurredAt,
          });
        await AuditWriter.write(
          {
            ...ctx,
            actionType: isNew
              ? "EK_CAMPUS_CREATED_NO_NOTIFY"
              : "EK_CAMPUS_IDENTITY_LINKED_NO_NOTIFY",
            entityType: "INSTITUTION",
            entityId: campus.desired.id,
            reason: "VERIFIED_SESSION_PACKAGE",
            metadata: {
              sourceId: capture.sourceId,
              observationId: capture.observationId,
              contentFingerprint: `sha256:${checksum}`,
            },
          },
          executor,
        );
      }
    }
    let changed = 0;
    for (const item of plan) {
      if ("reject" in item || item.same) continue;
      const opportunityId = item.opportunity?.id ?? randomUUID();
      if (!item.opportunity) {
        await executor.drizzle.insert(opportunities).values({
          id: opportunityId,
          institutionId: item.institution.id,
          slug: item.slug,
          kind: "INFORMATION_SESSION",
          truthMode: "NATIVE",
          publicationState: "PUBLISHED",
          publishedAt: ctx.occurredAt,
        });
        await AuditWriter.write(
          {
            ...ctx,
            actionType: "EK_SESSION_CREATED_NO_NOTIFY",
            entityType: "OPPORTUNITY",
            entityId: opportunityId,
            reason: "VERIFIED_SESSION_PACKAGE",
            metadata: { targetId: item.institution.id },
          },
          executor,
        );
      }
      await executor.raw(
        sql`insert into english_session_identities(opportunity_id,fingerprint) values(${opportunityId},${item.fingerprint}) on conflict(opportunity_id) do update set fingerprint=excluded.fingerprint`,
      );
      const captures = [];
      for (const key of item.row.evidenceKeys) {
        const evidence = data.sources.find((source) => source.key === key)!;
        const capture = await captureReviewedSource(executor, evidence);
        await executor.drizzle
          .insert(opportunitySourceBindings)
          .values({
            opportunityId,
            sourceId: capture.sourceId,
            role: "SUPPORTING",
            isPrimary: false,
            isActive: true,
          })
          .onConflictDoNothing();
        const [binding] = await executor.drizzle
          .select()
          .from(opportunitySourceBindings)
          .where(
            and(
              eq(opportunitySourceBindings.opportunityId, opportunityId),
              eq(opportunitySourceBindings.sourceId, capture.sourceId),
              eq(opportunitySourceBindings.isActive, true),
            ),
          )
          .limit(1);
        if (!binding) throw new ConflictError();
        captures.push(capture);
      }
      const primary = captures[0]!;
      const dates = (value: string | null) =>
        value === null ? null : new Date(value);
      const result = await verifyNativeOpportunityInTransaction(executor, ctx, {
        opportunityId,
        expectedCurrentVersionId: item.current?.id ?? null,
        proposedState: {
          ...item.candidate,
          eventStartAt: new Date(item.candidate.eventStartAt),
          eventEndAt: dates(item.candidate.eventEndAt),
          applicationOpenAt: dates(item.candidate.applicationOpenAt),
          applicationCloseAt: dates(item.candidate.applicationCloseAt),
          validFrom: dates(item.candidate.validFrom),
          validUntil: dates(item.candidate.validUntil),
        },
        sourceId: primary.sourceId,
        correction: {
          mode: "ADMIN_CORRECTION_NO_NOTIFY",
          reason: "CORRECTION_CONTENT_NO_NOTIFY",
        },
        evidence: {
          observationId: primary.observationId,
          snapshotId: primary.snapshotId,
          evidenceRole: "PRIMARY",
        },
      });
      if (result.outcome === "CHANGED")
        await enqueueDataRevalidation(executor, {
          version: 2,
          targetType: "OPPORTUNITY",
          targetId: opportunityId,
          versionId: result.currentVersionId,
          reason: "ADMIN_CORRECTION",
        });
      for (const capture of captures.slice(1))
        await executor.drizzle.insert(opportunityVersionEvidence).values({
          opportunityVersionId: result.currentVersionId,
          sourceId: capture.sourceId,
          sourceObservationId: BigInt(capture.observationId),
          sourceSnapshotId: capture.snapshotId,
          evidenceRole: "SUPPORTING",
        });
      changed++;
    }
    return {
      applied: true,
      checksum,
      before,
      campusBefore: campuses.before,
      rejects,
      changed,
      createdCampuses: campuses.creates.length,
      updatedCampuses,
    };
  });
}
