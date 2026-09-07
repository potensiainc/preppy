import "server-only";

import { createHash } from "node:crypto";

import { inArray } from "drizzle-orm";

import {
  institutionFacts,
  institutionFactVersions,
  institutionReviewInsights,
  institutionReviewInsightVersions,
  institutions,
  institutionSectionCoverages,
  institutionSourceBindings,
  opportunities,
  opportunityVersions,
  sourceObservations,
  sources,
  sourceSnapshots,
} from "@/src/db/schema";
import type { ReadOnlyDatabaseExecutor } from "@/src/infrastructure/db/runtime.server";
import type {
  EnglishKindergartenImportPackage,
  EvidenceRecord,
} from "@/src/modules/english-kindergarten-import/artifact-schema";
import {
  canonicalJson,
  validateEnglishKindergartenPackage,
} from "@/src/modules/english-kindergarten-import/validator";

const UUID_NAMESPACE = "0a01771b-2ef7-586b-90fc-3f38a91b5cf3";

export type ImportCountSet = {
  institutions: number;
  sources: number;
  snapshots: number;
  observations: number;
  bindings: number;
  coverages: number;
  facts: number;
  factVersions: number;
  factEvidence: number;
  reviewInsights: number;
  reviewInsightVersions: number;
  reviewInsightEvidence: number;
  opportunities: number;
  opportunityVersions: number;
  opportunityEvidence: number;
  outboxEvents: number;
  total: number;
};

export type EnglishKindergartenImportReject = Readonly<{
  code:
    | "INVALID_PACKAGE"
    | "CATEGORY_COLLISION"
    | "SLUG_COLLISION"
    | "IDENTITY_COLLISION"
    | "SOURCE_COLLISION"
    | "OPPORTUNITY_COLLISION";
  campusId?: string;
  message: string;
}>;

type Operation = "CREATE" | "UPDATE" | "NONE";

export type EnglishKindergartenImportPlan = Readonly<{
  applyAllowed: boolean;
  packageId: string;
  packageChecksum: string;
  created: ImportCountSet;
  updated: ImportCountSet;
  unchanged: ImportCountSet;
  rejects: readonly EnglishKindergartenImportReject[];
  sideEffects: Readonly<{
    outboxEvents: 0;
    notifications: 0;
    deliveries: 0;
    meaningfulChanges: 0;
    opportunityChanges: 0;
  }>;
  actions: Readonly<{
    institutions: readonly InstitutionAction[];
    sources: readonly SourceAction[];
    snapshots: readonly SnapshotAction[];
    observations: readonly ObservationAction[];
    bindings: readonly BindingAction[];
    coverages: readonly CoverageAction[];
    facts: readonly FactAction[];
    factVersions: readonly FactVersionAction[];
    factEvidence: readonly VersionEvidenceAction[];
    reviewInsights: readonly ReviewInsightAction[];
    reviewInsightVersions: readonly ReviewInsightVersionAction[];
    reviewInsightEvidence: readonly VersionEvidenceAction[];
    opportunities: readonly OpportunityAction[];
    opportunityVersions: readonly OpportunityVersionAction[];
    opportunityEvidence: readonly VersionEvidenceAction[];
  }>;
}>;

export type InstitutionAction = Readonly<{
  operation: Exclude<Operation, "UPDATE">;
  campusId: string;
  institutionId: string;
  desired: {
    id: string;
    slug: string;
    displayName: string;
    category: "ENGLISH_KINDERGARTEN";
    internationalSubtype: null;
    operationalState: "ACTIVE" | "UNKNOWN";
    publicationState: "DRAFT" | "PUBLISHED";
    regionCode: "KR-11";
    city: "서울특별시";
    district: "강남구" | "서초구";
    addressLine: string;
    websiteUrl: string | null;
    shortDescription: null;
    publishedAt: Date | null;
    archivedAt: null;
  };
}>;

export type SourceAction = Readonly<{
  operation: Exclude<Operation, "UPDATE">;
  sourceId: string;
  canonicalUrl: string;
  desired: {
    id: string;
    canonicalUrl: string;
    sourceType: string;
    authorityLevel: "PRIMARY" | "SECONDARY_OFFICIAL" | "DISCOVERY_ONLY";
    lifecycleStatus: "ACTIVE";
    sourceName: string;
    requiresJs: false;
    contentTypeHint: "text/html";
  };
}>;

export type SnapshotAction = Readonly<{
  operation: Exclude<Operation, "UPDATE">;
  snapshotId: string;
  sourceId: string;
  sourceUrl: string;
  contentHash: string;
  desired: {
    id: string;
    sourceId: string;
    capturedAt: Date;
    contentHash: string;
    textHash: string;
    normalizedText: string;
    mimeType: "text/plain";
    metadata: Record<string, unknown>;
  };
}>;

export type ObservationAction = Readonly<{
  operation: Exclude<Operation, "UPDATE">;
  sourceId: string;
  sourceUrl: string;
  desired: {
    sourceId: string;
    observedAt: Date;
    outcome: "SUCCESS" | "ACCESS_ERROR" | "NOT_FOUND";
    finalUrl: string;
    contentHash: string | null;
    textHash: string | null;
    snapshotId: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    metadata: Record<string, unknown>;
  };
}>;

export type BindingAction = Readonly<{
  operation: Exclude<Operation, "UPDATE">;
  institutionId: string;
  sourceId: string;
  desired: {
    institutionId: string;
    sourceId: string;
    role: "OFFICIAL_MAIN" | "OTHER";
    isPrimary: boolean;
    isActive: true;
  };
}>;

export type CoverageAction = Readonly<{
  operation: Operation;
  institutionId: string;
  section: string;
  desired: {
    institutionId: string;
    section: string;
    status: string;
    sourceId: string | null;
    sourceSnapshotId: string | null;
    academicYearLabel: string | null;
    publicNote: string | null;
    internalNote: string | null;
    lastCollectedAt: Date | null;
    lastCheckedAt: Date;
  };
}>;

export type FactAction = Readonly<{
  operation: Exclude<Operation, "UPDATE">;
  factId: string;
  desired: { id: string; institutionId: string; factType: string };
}>;

export type FactVersionAction = Readonly<{
  operation: Exclude<Operation, "UPDATE">;
  factVersionId: string;
  previousCurrentId: string | null;
  desired: {
    id: string;
    institutionFactId: string;
    versionNumber: number;
    supersedesVersionId: string | null;
    verificationState: "VERIFIED";
    isCurrent: true;
    valueJson: Record<string, unknown>;
    displayText: string | null;
    verifiedAt: Date;
  };
}>;

export type ReviewInsightAction = Readonly<{
  operation: Exclude<Operation, "UPDATE">;
  reviewInsightId: string;
  desired: { id: string; institutionId: string };
}>;

export type ReviewInsightVersionAction = Readonly<{
  operation: Exclude<Operation, "UPDATE">;
  reviewInsightVersionId: string;
  previousCurrentId: string | null;
  desired: {
    id: string;
    institutionReviewInsightId: string;
    versionNumber: number;
    supersedesVersionId: string | null;
    verificationState: "VERIFIED";
    isCurrent: true;
    periodStart: string | null;
    periodEnd: string | null;
    sampleSize: number;
    themes: Array<{ summary: string; mentionCount?: number }>;
    limitations: string | null;
    verifiedAt: Date;
  };
}>;

export type OpportunityAction = Readonly<{
  operation: Exclude<Operation, "UPDATE">;
  opportunityId: string;
  desired: {
    id: string;
    institutionId: string;
    slug: string;
    kind: "INFORMATION_SESSION";
    truthMode: "NATIVE";
    publicationState: "DRAFT";
    publishedAt: null;
    archivedAt: null;
  };
}>;

export type OpportunityVersionAction = Readonly<{
  operation: Exclude<Operation, "UPDATE">;
  opportunityVersionId: string;
  previousCurrentId: string | null;
  desired: {
    id: string;
    opportunityId: string;
    truthMode: "NATIVE";
    versionNumber: number;
    supersedesVersionId: string | null;
    verificationState: "VERIFIED";
    businessState: string;
    isCurrent: true;
    title: string;
    eventStartAt: Date;
    applicationCloseAt: Date | null;
    actionUrl: string | null;
    verifiedAt: Date;
    contentFingerprint: string;
  };
}>;

export type VersionEvidenceAction = Readonly<{
  operation: Exclude<Operation, "UPDATE">;
  id: string;
  versionId: string;
  sourceId: string;
  sourceSnapshotId: string;
  evidenceRole: "PRIMARY" | "SUPPORTING";
}>;

function deterministicUuid(name: string) {
  const hash = createHash("sha1")
    .update(
      Buffer.concat([
        Buffer.from(UUID_NAMESPACE.replaceAll("-", ""), "hex"),
        Buffer.from(name),
      ]),
    )
    .digest()
    .subarray(0, 16);
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const value = hash.toString("hex");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function emptyCounts(): ImportCountSet {
  return {
    institutions: 0,
    sources: 0,
    snapshots: 0,
    observations: 0,
    bindings: 0,
    coverages: 0,
    facts: 0,
    factVersions: 0,
    factEvidence: 0,
    reviewInsights: 0,
    reviewInsightVersions: 0,
    reviewInsightEvidence: 0,
    opportunities: 0,
    opportunityVersions: 0,
    opportunityEvidence: 0,
    outboxEvents: 0,
    total: 0,
  };
}

function increment(counts: ImportCountSet, key: keyof ImportCountSet) {
  if (key === "total" || key === "outboxEvents") return;
  counts[key] += 1;
  counts.total += 1;
}

function dateEqual(left: Date | null, right: Date | null) {
  return left?.toISOString() === right?.toISOString();
}

function evidenceKey(
  evidence: Pick<EvidenceRecord, "sourceUrl" | "sourceContentSha256">,
) {
  return `${evidence.sourceUrl}\u0000${evidence.sourceContentSha256}`;
}

function sourceAuthority(
  value: EvidenceRecord["authorityLevel"],
): "PRIMARY" | "SECONDARY_OFFICIAL" | "DISCOVERY_ONLY" {
  return value === "THIRD_PARTY" ? "DISCOVERY_ONLY" : value;
}

function countOperation(
  operation: Operation,
  key: keyof ImportCountSet,
  created: ImportCountSet,
  updated: ImportCountSet,
  unchanged: ImportCountSet,
) {
  increment(
    operation === "CREATE"
      ? created
      : operation === "UPDATE"
        ? updated
        : unchanged,
    key,
  );
}

export async function planEnglishKindergartenImport(
  executor: ReadOnlyDatabaseExecutor,
  packageValue: EnglishKindergartenImportPackage,
): Promise<EnglishKindergartenImportPlan> {
  const validation = validateEnglishKindergartenPackage(packageValue);
  const created = emptyCounts();
  const updated = emptyCounts();
  const unchanged = emptyCounts();
  const rejects: EnglishKindergartenImportReject[] = [];
  const actions = {
    institutions: [] as InstitutionAction[],
    sources: [] as SourceAction[],
    snapshots: [] as SnapshotAction[],
    observations: [] as ObservationAction[],
    bindings: [] as BindingAction[],
    coverages: [] as CoverageAction[],
    facts: [] as FactAction[],
    factVersions: [] as FactVersionAction[],
    factEvidence: [] as VersionEvidenceAction[],
    reviewInsights: [] as ReviewInsightAction[],
    reviewInsightVersions: [] as ReviewInsightVersionAction[],
    reviewInsightEvidence: [] as VersionEvidenceAction[],
    opportunities: [] as OpportunityAction[],
    opportunityVersions: [] as OpportunityVersionAction[],
    opportunityEvidence: [] as VersionEvidenceAction[],
  };
  if (validation.status !== "PASS") {
    rejects.push({
      code: "INVALID_PACKAGE",
      message: validation.errors.join(" ") || "패키지 검증에 실패했어요.",
    });
    return {
      applyAllowed: false,
      packageId: packageValue.snapshot.packageId,
      packageChecksum: validation.packageChecksum,
      created,
      updated,
      unchanged,
      rejects,
      sideEffects: {
        outboxEvents: 0,
        notifications: 0,
        deliveries: 0,
        meaningfulChanges: 0,
        opportunityChanges: 0,
      },
      actions,
    };
  }

  const campusById = new Map(
    packageValue.campuses.map((campus) => [campus.campusId, campus]),
  );
  const targetSlugs = packageValue.campuses.map((campus) => campus.slug);
  const targetUrls = [
    ...new Set(packageValue.evidence.map((evidence) => evidence.sourceUrl)),
  ];
  const existingInstitutions = await executor.drizzle
    .select()
    .from(institutions)
    .where(inArray(institutions.slug, targetSlugs));
  const existingSources = await executor.drizzle
    .select()
    .from(sources)
    .where(inArray(sources.canonicalUrl, targetUrls));

  const institutionBySlug = new Map(
    existingInstitutions.map((row) => [row.slug, row]),
  );
  const resolvedInstitutionIds = new Map<string, string>();
  for (const campus of packageValue.campuses) {
    const existing = institutionBySlug.get(campus.slug);
    const generatedId = deterministicUuid(`institution:${campus.campusId}`);
    const websiteUrl =
      campus.officialChannels.find((channel) => channel.kind === "WEBSITE")
        ?.value ?? null;
    const preservePublishedState = existing?.publicationState === "PUBLISHED";
    const desired = {
      id: existing?.id ?? generatedId,
      slug: campus.slug,
      displayName: campus.displayName,
      category: "ENGLISH_KINDERGARTEN" as const,
      internationalSubtype: null,
      operationalState: campus.operationalState,
      publicationState: preservePublishedState
        ? ("PUBLISHED" as const)
        : ("DRAFT" as const),
      regionCode: "KR-11" as const,
      city: "서울특별시" as const,
      district: campus.district,
      addressLine: campus.addressLine,
      websiteUrl,
      shortDescription: null,
      publishedAt: preservePublishedState ? existing.publishedAt : null,
      archivedAt: null,
    };
    if (existing) {
      if (existing.category !== "ENGLISH_KINDERGARTEN") {
        rejects.push({
          code: "CATEGORY_COLLISION",
          campusId: campus.campusId,
          message: `${campus.slug} slug가 다른 기관 유형에 사용 중이에요.`,
        });
        continue;
      }
      const exact =
        existing.displayName === desired.displayName &&
        existing.operationalState === desired.operationalState &&
        (existing.publicationState === "DRAFT" ||
          existing.publicationState === "PUBLISHED") &&
        existing.regionCode === desired.regionCode &&
        existing.city === desired.city &&
        existing.district === desired.district &&
        existing.addressLine === desired.addressLine &&
        existing.websiteUrl === desired.websiteUrl &&
        (existing.publicationState === "DRAFT"
          ? existing.publishedAt === null
          : existing.publishedAt !== null);
      if (!exact) {
        rejects.push({
          code: "SLUG_COLLISION",
          campusId: campus.campusId,
          message: `${campus.slug} slug의 기존 기관 신원이 스냅샷과 달라요.`,
        });
        continue;
      }
    }
    const operation = existing ? "NONE" : "CREATE";
    actions.institutions.push({
      operation,
      campusId: campus.campusId,
      institutionId: desired.id,
      desired,
    });
    resolvedInstitutionIds.set(campus.campusId, desired.id);
    countOperation(operation, "institutions", created, updated, unchanged);
  }

  const existingSourceByUrl = new Map(
    existingSources.map((row) => [row.canonicalUrl, row]),
  );
  const evidenceByUrl = new Map<string, EvidenceRecord[]>();
  for (const evidence of packageValue.evidence) {
    const items = evidenceByUrl.get(evidence.sourceUrl) ?? [];
    items.push(evidence);
    evidenceByUrl.set(evidence.sourceUrl, items);
  }
  const resolvedSourceIds = new Map<string, string>();
  for (const [url, evidenceItems] of evidenceByUrl) {
    const first = evidenceItems[0]!;
    const campus = campusById.get(first.campusId)!;
    const existing = existingSourceByUrl.get(url);
    const desired = {
      id: existing?.id ?? deterministicUuid(`source:${url}`),
      canonicalUrl: url,
      sourceType: first.sourceType,
      authorityLevel: sourceAuthority(first.authorityLevel),
      lifecycleStatus: "ACTIVE" as const,
      sourceName: `${campus.displayName} 수집 근거`,
      requiresJs: false as const,
      contentTypeHint: "text/html" as const,
    };
    if (
      existing &&
      (existing.sourceType !== desired.sourceType ||
        existing.authorityLevel !== desired.authorityLevel)
    ) {
      rejects.push({
        code: "SOURCE_COLLISION",
        campusId: first.campusId,
        message: `${url} 출처가 다른 의미로 이미 등록되어 있어요.`,
      });
      continue;
    }
    const operation = existing ? "NONE" : "CREATE";
    actions.sources.push({
      operation,
      sourceId: desired.id,
      canonicalUrl: url,
      desired,
    });
    resolvedSourceIds.set(url, desired.id);
    countOperation(operation, "sources", created, updated, unchanged);
  }

  if (rejects.length > 0) {
    return {
      applyAllowed: false,
      packageId: packageValue.snapshot.packageId,
      packageChecksum: validation.packageChecksum,
      created,
      updated,
      unchanged,
      rejects,
      sideEffects: {
        outboxEvents: 0,
        notifications: 0,
        deliveries: 0,
        meaningfulChanges: 0,
        opportunityChanges: 0,
      },
      actions,
    };
  }

  const institutionIds = [...resolvedInstitutionIds.values()];
  const sourceIds = [...resolvedSourceIds.values()];
  const [
    existingSnapshots,
    existingObservations,
    existingBindings,
    existingCoverage,
  ] = await Promise.all([
    executor.drizzle
      .select()
      .from(sourceSnapshots)
      .where(inArray(sourceSnapshots.sourceId, sourceIds)),
    executor.drizzle
      .select()
      .from(sourceObservations)
      .where(inArray(sourceObservations.sourceId, sourceIds)),
    executor.drizzle
      .select()
      .from(institutionSourceBindings)
      .where(inArray(institutionSourceBindings.institutionId, institutionIds)),
    executor.drizzle
      .select()
      .from(institutionSectionCoverages)
      .where(
        inArray(institutionSectionCoverages.institutionId, institutionIds),
      ),
  ]);

  const snapshotByKey = new Map(
    existingSnapshots.map((row) => [
      `${row.sourceId}\u0000${row.contentHash}`,
      row,
    ]),
  );
  const resolvedSnapshotIds = new Map<string, string>();
  const uniqueEvidenceCaptures = new Map<string, EvidenceRecord>();
  for (const evidence of packageValue.evidence) {
    uniqueEvidenceCaptures.set(evidenceKey(evidence), evidence);
  }
  for (const evidence of uniqueEvidenceCaptures.values()) {
    const sourceId = resolvedSourceIds.get(evidence.sourceUrl)!;
    const existing = snapshotByKey.get(
      `${sourceId}\u0000${evidence.sourceContentSha256}`,
    );
    const snapshotId =
      existing?.id ??
      deterministicUuid(`snapshot:${sourceId}:${evidence.sourceContentSha256}`);
    const operation = existing ? "NONE" : "CREATE";
    const relatedEvidenceIds = packageValue.evidence
      .filter((candidate) => evidenceKey(candidate) === evidenceKey(evidence))
      .map((candidate) => candidate.evidenceId);
    actions.snapshots.push({
      operation,
      snapshotId,
      sourceId,
      sourceUrl: evidence.sourceUrl,
      contentHash: evidence.sourceContentSha256,
      desired: {
        id: snapshotId,
        sourceId,
        capturedAt: new Date(evidence.collectedAt),
        contentHash: evidence.sourceContentSha256,
        textHash: evidence.sourceContentSha256,
        normalizedText: evidence.sourceTextExcerpt,
        mimeType: "text/plain" as const,
        metadata: {
          importPackageId: packageValue.snapshot.packageId,
          evidenceIds: relatedEvidenceIds,
          contentHashBasis: "BOUNDED_SOURCE_CAPTURE",
        },
      },
    });
    resolvedSnapshotIds.set(evidenceKey(evidence), snapshotId);
    countOperation(operation, "snapshots", created, updated, unchanged);
  }

  for (const [url, evidenceItems] of evidenceByUrl) {
    const first = evidenceItems[0]!;
    const sourceId = resolvedSourceIds.get(url)!;
    const failed = first.fetchOutcome === "ACCESS_FAILED";
    const notFound = first.fetchOutcome === "CHECKED_NOT_FOUND";
    const outcome = failed
      ? "ACCESS_ERROR"
      : notFound
        ? "NOT_FOUND"
        : "SUCCESS";
    const checkedAt = packageValue.snapshot.institutions
      .find((item) => item.campusId === first.campusId)!
      .coverages.reduce(
        (latest, coverage) =>
          coverage.lastCheckedAt > latest ? coverage.lastCheckedAt : latest,
        "",
      );
    const observedAt = new Date(checkedAt);
    const desiredHash = failed || notFound ? null : first.sourceContentSha256;
    const existing = existingObservations.find(
      (row) =>
        row.sourceId === sourceId &&
        row.outcome === outcome &&
        row.observedAt.toISOString() === observedAt.toISOString() &&
        row.contentHash === desiredHash,
    );
    const operation = existing ? "NONE" : "CREATE";
    actions.observations.push({
      operation,
      sourceId,
      sourceUrl: url,
      desired: {
        sourceId,
        observedAt,
        outcome,
        finalUrl: first.finalUrl,
        contentHash: desiredHash,
        textHash: desiredHash,
        snapshotId:
          failed || notFound
            ? null
            : resolvedSnapshotIds.get(evidenceKey(first))!,
        errorCode: failed ? "SNAPSHOT_RECHECK_ACCESS_FAILED" : null,
        errorMessage: failed
          ? "2026-09-07 재확인에서 페이지에 접근하지 못했어요."
          : null,
        metadata: { importPackageId: packageValue.snapshot.packageId },
      },
    });
    countOperation(operation, "observations", created, updated, unchanged);
  }

  const bindingKeys = new Set(
    existingBindings.map(
      (row) => `${row.institutionId}\u0000${row.sourceId}\u0000${row.role}`,
    ),
  );
  const bindingEvidence = new Map<string, EvidenceRecord>();
  for (const evidence of packageValue.evidence) {
    bindingEvidence.set(
      `${evidence.campusId}\u0000${evidence.sourceUrl}`,
      evidence,
    );
  }
  for (const first of bindingEvidence.values()) {
    const url = first.sourceUrl;
    const institutionId = resolvedInstitutionIds.get(first.campusId)!;
    const sourceId = resolvedSourceIds.get(url)!;
    const role: "OFFICIAL_MAIN" | "OTHER" =
      first.authorityLevel === "PRIMARY" ? "OFFICIAL_MAIN" : "OTHER";
    const desired = {
      institutionId,
      sourceId,
      role,
      isPrimary: role === "OFFICIAL_MAIN",
      isActive: true as const,
    };
    const operation = bindingKeys.has(
      `${institutionId}\u0000${sourceId}\u0000${role}`,
    )
      ? "NONE"
      : "CREATE";
    actions.bindings.push({ operation, institutionId, sourceId, desired });
    countOperation(operation, "bindings", created, updated, unchanged);
  }

  const evidenceById = new Map(
    packageValue.evidence.map((evidence) => [evidence.evidenceId, evidence]),
  );
  const coverageByKey = new Map(
    existingCoverage.map((row) => [
      `${row.institutionId}\u0000${row.section}`,
      row,
    ]),
  );
  for (const item of packageValue.snapshot.institutions) {
    const institutionId = resolvedInstitutionIds.get(item.campusId)!;
    for (const coverage of item.coverages) {
      const evidence = coverage.evidenceId
        ? evidenceById.get(coverage.evidenceId)!
        : null;
      const desired = {
        institutionId,
        section: coverage.section,
        status: coverage.status,
        sourceId: evidence ? resolvedSourceIds.get(evidence.sourceUrl)! : null,
        sourceSnapshotId: evidence
          ? resolvedSnapshotIds.get(evidenceKey(evidence))!
          : null,
        academicYearLabel: coverage.academicYearLabel,
        publicNote: coverage.publicNote,
        internalNote: coverage.internalNote,
        lastCollectedAt: coverage.lastCollectedAt
          ? new Date(coverage.lastCollectedAt)
          : null,
        lastCheckedAt: new Date(coverage.lastCheckedAt),
      };
      const existing = coverageByKey.get(
        `${institutionId}\u0000${coverage.section}`,
      );
      const exact =
        existing &&
        existing.status === desired.status &&
        existing.sourceId === desired.sourceId &&
        existing.sourceSnapshotId === desired.sourceSnapshotId &&
        existing.academicYearLabel === desired.academicYearLabel &&
        existing.publicNote === desired.publicNote &&
        existing.internalNote === desired.internalNote &&
        dateEqual(existing.lastCollectedAt, desired.lastCollectedAt) &&
        dateEqual(existing.lastCheckedAt, desired.lastCheckedAt);
      const operation = exact ? "NONE" : existing ? "UPDATE" : "CREATE";
      actions.coverages.push({
        operation,
        institutionId,
        section: coverage.section,
        desired,
      });
      countOperation(operation, "coverages", created, updated, unchanged);
    }
  }

  const existingFacts = await executor.drizzle
    .select()
    .from(institutionFacts)
    .where(inArray(institutionFacts.institutionId, institutionIds));
  const existingFactIds = existingFacts.map((row) => row.id);
  const existingFactVersions = existingFactIds.length
    ? await executor.drizzle
        .select()
        .from(institutionFactVersions)
        .where(
          inArray(institutionFactVersions.institutionFactId, existingFactIds),
        )
    : [];
  const currentFactVersionByRoot = new Map(
    existingFactVersions
      .filter((row) => row.isCurrent)
      .map((row) => [row.institutionFactId, row]),
  );
  for (const item of packageValue.snapshot.institutions) {
    const institutionId = resolvedInstitutionIds.get(item.campusId)!;
    for (const fact of item.facts) {
      const existingRoot = existingFacts.find(
        (row) =>
          row.institutionId === institutionId && row.factType === fact.factType,
      );
      const factId =
        existingRoot?.id ??
        deterministicUuid(`fact:${institutionId}:${fact.factType}`);
      const rootOperation = existingRoot ? "NONE" : "CREATE";
      actions.facts.push({
        operation: rootOperation,
        factId,
        desired: { id: factId, institutionId, factType: fact.factType },
      });
      countOperation(rootOperation, "facts", created, updated, unchanged);
      const current = currentFactVersionByRoot.get(factId);
      const valueJson = Object.fromEntries(
        Object.entries(fact.value).filter(([key]) => key !== "factType"),
      );
      const exactCurrent =
        current &&
        canonicalJson(current.valueJson) === canonicalJson(valueJson) &&
        current.displayText === fact.displayText;
      const deterministicVersionId = deterministicUuid(
        `fact-version:${factId}:${canonicalJsonSha(valueJson)}:${fact.displayText ?? ""}`,
      );
      const existingVersion = exactCurrent
        ? current
        : existingFactVersions.find((row) => row.id === deterministicVersionId);
      const versionId = existingVersion?.id ?? deterministicVersionId;
      const versionOperation = existingVersion ? "NONE" : "CREATE";
      actions.factVersions.push({
        operation: versionOperation,
        factVersionId: versionId,
        previousCurrentId: existingVersion ? null : (current?.id ?? null),
        desired: {
          id: versionId,
          institutionFactId: factId,
          versionNumber: existingVersion
            ? existingVersion.versionNumber
            : Math.max(
                0,
                ...existingFactVersions
                  .filter((row) => row.institutionFactId === factId)
                  .map((row) => row.versionNumber),
              ) + 1,
          supersedesVersionId: existingVersion
            ? existingVersion.supersedesVersionId
            : (current?.id ?? null),
          verificationState: "VERIFIED",
          isCurrent: true,
          valueJson,
          displayText: fact.displayText,
          verifiedAt: new Date(fact.verifiedAt),
        },
      });
      countOperation(
        versionOperation,
        "factVersions",
        created,
        updated,
        unchanged,
      );
      if (!existingVersion) {
        for (const [evidenceIndex, evidenceId] of fact.evidenceIds.entries()) {
          const evidence = evidenceById.get(evidenceId)!;
          actions.factEvidence.push({
            operation: "CREATE",
            id: deterministicUuid(`fact-evidence:${versionId}:${evidenceId}`),
            versionId,
            sourceId: resolvedSourceIds.get(evidence.sourceUrl)!,
            sourceSnapshotId: resolvedSnapshotIds.get(evidenceKey(evidence))!,
            evidenceRole: evidenceIndex === 0 ? "PRIMARY" : "SUPPORTING",
          });
          countOperation("CREATE", "factEvidence", created, updated, unchanged);
        }
      }
    }
  }

  const existingReviewInsights = await executor.drizzle
    .select()
    .from(institutionReviewInsights)
    .where(inArray(institutionReviewInsights.institutionId, institutionIds));
  const existingReviewInsightIds = existingReviewInsights.map((row) => row.id);
  const existingReviewInsightVersions = existingReviewInsightIds.length
    ? await executor.drizzle
        .select()
        .from(institutionReviewInsightVersions)
        .where(
          inArray(
            institutionReviewInsightVersions.institutionReviewInsightId,
            existingReviewInsightIds,
          ),
        )
    : [];
  for (const item of packageValue.snapshot.institutions) {
    if (!item.reviewInsight) continue;
    const institutionId = resolvedInstitutionIds.get(item.campusId)!;
    const existingRoot = existingReviewInsights.find(
      (row) => row.institutionId === institutionId,
    );
    const reviewInsightId =
      existingRoot?.id ?? deterministicUuid(`review-insight:${institutionId}`);
    const rootOperation = existingRoot ? "NONE" : "CREATE";
    actions.reviewInsights.push({
      operation: rootOperation,
      reviewInsightId,
      desired: { id: reviewInsightId, institutionId },
    });
    countOperation(
      rootOperation,
      "reviewInsights",
      created,
      updated,
      unchanged,
    );

    const desiredValue = {
      periodStart: item.reviewInsight.periodStart,
      periodEnd: item.reviewInsight.periodEnd,
      sampleSize: item.reviewInsight.sampleSize,
      themes: item.reviewInsight.themes,
      limitations: item.reviewInsight.limitations,
    };
    const current = existingReviewInsightVersions.find(
      (row) =>
        row.institutionReviewInsightId === reviewInsightId && row.isCurrent,
    );
    const exactCurrent =
      current &&
      canonicalJson({
        periodStart: current.periodStart,
        periodEnd: current.periodEnd,
        sampleSize: current.sampleSize,
        themes: current.themes,
        limitations: current.limitations,
      }) === canonicalJson(desiredValue);
    const deterministicVersionId = deterministicUuid(
      `review-insight-version:${reviewInsightId}:${canonicalJsonSha(desiredValue)}`,
    );
    const existingVersion = exactCurrent
      ? current
      : existingReviewInsightVersions.find(
          (row) => row.id === deterministicVersionId,
        );
    const reviewInsightVersionId =
      existingVersion?.id ?? deterministicVersionId;
    const versionOperation = existingVersion ? "NONE" : "CREATE";
    actions.reviewInsightVersions.push({
      operation: versionOperation,
      reviewInsightVersionId,
      previousCurrentId: existingVersion ? null : (current?.id ?? null),
      desired: {
        id: reviewInsightVersionId,
        institutionReviewInsightId: reviewInsightId,
        versionNumber: existingVersion
          ? existingVersion.versionNumber
          : Math.max(
              0,
              ...existingReviewInsightVersions
                .filter(
                  (row) => row.institutionReviewInsightId === reviewInsightId,
                )
                .map((row) => row.versionNumber),
            ) + 1,
        supersedesVersionId: existingVersion
          ? existingVersion.supersedesVersionId
          : (current?.id ?? null),
        verificationState: "VERIFIED",
        isCurrent: true,
        ...desiredValue,
        verifiedAt: new Date(item.reviewInsight.verifiedAt),
      },
    });
    countOperation(
      versionOperation,
      "reviewInsightVersions",
      created,
      updated,
      unchanged,
    );
    if (!existingVersion) {
      for (const [
        evidenceIndex,
        evidenceId,
      ] of item.reviewInsight.evidenceIds.entries()) {
        const evidence = evidenceById.get(evidenceId)!;
        actions.reviewInsightEvidence.push({
          operation: "CREATE",
          id: deterministicUuid(
            `review-insight-evidence:${reviewInsightVersionId}:${evidenceId}`,
          ),
          versionId: reviewInsightVersionId,
          sourceId: resolvedSourceIds.get(evidence.sourceUrl)!,
          sourceSnapshotId: resolvedSnapshotIds.get(evidenceKey(evidence))!,
          evidenceRole: evidenceIndex === 0 ? "PRIMARY" : "SUPPORTING",
        });
        countOperation(
          "CREATE",
          "reviewInsightEvidence",
          created,
          updated,
          unchanged,
        );
      }
    }
  }

  const opportunitySlugs = packageValue.snapshot.institutions.flatMap((item) =>
    item.opportunities.map((opportunity) => opportunity.slug),
  );
  const existingOpportunities = opportunitySlugs.length
    ? await executor.drizzle
        .select()
        .from(opportunities)
        .where(inArray(opportunities.slug, opportunitySlugs))
    : [];
  const existingOpportunityIds = existingOpportunities.map((row) => row.id);
  const existingOpportunityVersions = existingOpportunityIds.length
    ? await executor.drizzle
        .select()
        .from(opportunityVersions)
        .where(
          inArray(opportunityVersions.opportunityId, existingOpportunityIds),
        )
    : [];
  for (const item of packageValue.snapshot.institutions) {
    const institutionId = resolvedInstitutionIds.get(item.campusId)!;
    for (const opportunity of item.opportunities) {
      const existingRoot = existingOpportunities.find(
        (row) => row.slug === opportunity.slug,
      );
      if (
        existingRoot &&
        (existingRoot.institutionId !== institutionId ||
          existingRoot.kind !== opportunity.kind ||
          existingRoot.truthMode !== "NATIVE" ||
          existingRoot.publicationState !== "DRAFT")
      ) {
        rejects.push({
          code: "OPPORTUNITY_COLLISION",
          campusId: item.campusId,
          message: `${opportunity.slug} 일정 slug가 다른 일정에 사용 중이에요.`,
        });
        continue;
      }
      const opportunityId =
        existingRoot?.id ??
        deterministicUuid(`opportunity:${item.campusId}:${opportunity.slug}`);
      const rootOperation = existingRoot ? "NONE" : "CREATE";
      actions.opportunities.push({
        operation: rootOperation,
        opportunityId,
        desired: {
          id: opportunityId,
          institutionId,
          slug: opportunity.slug,
          kind: opportunity.kind,
          truthMode: "NATIVE",
          publicationState: "DRAFT",
          publishedAt: null,
          archivedAt: null,
        },
      });
      countOperation(
        rootOperation,
        "opportunities",
        created,
        updated,
        unchanged,
      );
      const current = existingOpportunityVersions.find(
        (row) => row.opportunityId === opportunityId && row.isCurrent,
      );
      const fingerprint = canonicalJsonSha({
        title: opportunity.title,
        businessState: opportunity.businessState,
        eventStartsAt: opportunity.eventStartsAt,
        applicationClosesAt: opportunity.applicationClosesAt,
        actionUrl: opportunity.actionUrl,
      });
      const deterministicVersionId = deterministicUuid(
        `opportunity-version:${opportunityId}:${fingerprint}`,
      );
      const existingVersion =
        current?.contentFingerprint === fingerprint
          ? current
          : existingOpportunityVersions.find(
              (row) => row.id === deterministicVersionId,
            );
      const versionId = existingVersion?.id ?? deterministicVersionId;
      const versionOperation = existingVersion ? "NONE" : "CREATE";
      actions.opportunityVersions.push({
        operation: versionOperation,
        opportunityVersionId: versionId,
        previousCurrentId: existingVersion ? null : (current?.id ?? null),
        desired: {
          id: versionId,
          opportunityId,
          truthMode: "NATIVE",
          versionNumber: existingVersion
            ? existingVersion.versionNumber
            : Math.max(
                0,
                ...existingOpportunityVersions
                  .filter((row) => row.opportunityId === opportunityId)
                  .map((row) => row.versionNumber),
              ) + 1,
          supersedesVersionId: existingVersion
            ? existingVersion.supersedesVersionId
            : (current?.id ?? null),
          verificationState: "VERIFIED",
          businessState: opportunity.businessState,
          isCurrent: true,
          title: opportunity.title,
          eventStartAt: new Date(opportunity.eventStartsAt),
          applicationCloseAt: opportunity.applicationClosesAt
            ? new Date(opportunity.applicationClosesAt)
            : null,
          actionUrl: opportunity.actionUrl,
          verifiedAt: new Date(opportunity.verifiedAt),
          contentFingerprint: fingerprint,
        },
      });
      countOperation(
        versionOperation,
        "opportunityVersions",
        created,
        updated,
        unchanged,
      );
      if (!existingVersion) {
        for (const [
          evidenceIndex,
          evidenceId,
        ] of opportunity.evidenceIds.entries()) {
          const evidence = evidenceById.get(evidenceId)!;
          actions.opportunityEvidence.push({
            operation: "CREATE",
            id: deterministicUuid(
              `opportunity-evidence:${versionId}:${evidenceId}`,
            ),
            versionId,
            sourceId: resolvedSourceIds.get(evidence.sourceUrl)!,
            sourceSnapshotId: resolvedSnapshotIds.get(evidenceKey(evidence))!,
            evidenceRole: evidenceIndex === 0 ? "PRIMARY" : "SUPPORTING",
          });
          countOperation(
            "CREATE",
            "opportunityEvidence",
            created,
            updated,
            unchanged,
          );
        }
      }
    }
  }

  return {
    applyAllowed: rejects.length === 0,
    packageId: packageValue.snapshot.packageId,
    packageChecksum: validation.packageChecksum,
    created,
    updated,
    unchanged,
    rejects,
    sideEffects: {
      outboxEvents: 0,
      notifications: 0,
      deliveries: 0,
      meaningfulChanges: 0,
      opportunityChanges: 0,
    },
    actions,
  };
}

function canonicalJsonSha(value: unknown) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
