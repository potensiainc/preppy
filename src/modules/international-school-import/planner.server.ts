import { createHash } from "node:crypto";
import { inArray, sql } from "drizzle-orm";

import {
  institutionFacts as institutionFactsTable,
  institutionFactVersions as institutionFactVersionsTable,
  institutionFactVersionEvidence as institutionFactVersionEvidenceTable,
  institutionSectionCoverages as institutionSectionCoveragesTable,
  institutionSourceBindings as institutionSourceBindingsTable,
  opportunities as opportunitiesTable,
  opportunityVersions as opportunityVersionsTable,
  opportunityVersionEvidence as opportunityVersionEvidenceTable,
  sourceObservations as sourceObservationsTable,
  sources as sourcesTable,
  sourceSnapshots as sourceSnapshotsTable,
} from "@/src/db/schema";
import type { ReadOnlyDatabaseExecutor } from "@/src/infrastructure/db/runtime.server";
import { institutionIdForRegistryIdentity } from "@/src/modules/institution-seed/planner";
import type {
  EvidenceArtifactRecord,
  InternationalSchoolImportPackage,
} from "./artifact-schema";
import { canonicalJson, validateInternationalSchoolPackage } from "./validator";

const PREPPY_SEED_NAMESPACE = "9c930974-2c56-5d2d-8833-11e4df9bc18e";
type Operation = "CREATE" | "UPDATE" | "NONE";

export type ImportCountSet = {
  institutions: number;
  registryIdentities: number;
  sources: number;
  snapshots: number;
  observations: number;
  bindings: number;
  coverages: number;
  facts: number;
  factVersions: number;
  factVersionEvidence: number;
  opportunities: number;
  opportunityVersions: number;
  opportunityVersionEvidence: number;
  total: number;
};

export type InternationalSchoolImportRejectCode =
  | "INVALID_PACKAGE"
  | "ISI_IDENTITY_COLLISION"
  | "MATERIAL_FIELD_COLLISION"
  | "PUBLICATION_STATE_COLLISION"
  | "SOURCE_COLLISION";

export type InternationalSchoolImportReject = Readonly<{
  code: InternationalSchoolImportRejectCode;
  key: string;
  message: string;
}>;

export type InternationalSchoolImportWarning = Readonly<{
  code: "POSSIBLE_IDENTITY_COLLISION";
  key: string;
  message: string;
}>;

export type PlannedAction<T> = Readonly<{
  operation: Operation;
  key: string;
  desired: T;
}>;

export type InstitutionAction = PlannedAction<{
  id: string;
  slug: string;
  displayName: string;
  category: "INTERNATIONAL_SCHOOL";
  internationalSubtype: "FOREIGN_SCHOOL";
  operationalState: "ACTIVE";
  publicationState: "DRAFT";
  regionCode: string;
  city: string;
  district: string | null;
  addressLine: string | null;
  websiteUrl: string;
  shortDescription: null;
  publishedAt: null;
  archivedAt: null;
}> &
  Readonly<{ institutionId: string; registryExternalId: string }>;

export type RegistryIdentityAction = PlannedAction<{
  id: string;
  institutionId: string;
  registryName: "ISI";
  registryExternalId: string;
  registryRecordUrl: string;
  registryLocator: string;
  metadataJson: Record<string, unknown>;
}> &
  Readonly<{ institutionId: string; registryExternalId: string }>;

export type SourceAction = PlannedAction<{
  id: string;
  canonicalUrl: string;
  sourceType: string;
  authorityLevel: string;
  lifecycleStatus: "ACTIVE";
  sourceName: string;
  requiresJs: false;
  contentTypeHint: "text/html";
}>;

export type SnapshotAction = PlannedAction<{
  id: string;
  sourceId: string;
  capturedAt: Date;
  contentHash: string;
  textHash: string;
  normalizedText: string | null;
  rawStorageKey: null;
  rawBody: null;
  mimeType: "text/html";
  metadata: Record<string, unknown>;
}>;

export type ObservationAction = PlannedAction<{
  sourceId: string;
  observationRef: string;
  observedAt: Date;
  outcome: "SUCCESS" | "NOT_FOUND" | "ACCESS_ERROR" | "OTHER_ERROR";
  finalUrl: string;
  contentHash: string | null;
  textHash: string | null;
  snapshotId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  metadata: Record<string, unknown>;
}>;

export type BindingAction = PlannedAction<{
  institutionId: string;
  sourceId: string;
  role:
    | "OFFICIAL_MAIN"
    | "REGISTRY_IDENTITY"
    | "ADMISSIONS"
    | "TUITION"
    | "CURRICULUM"
    | "APPLICATION"
    | "OTHER";
  isPrimary: boolean;
  isActive: true;
  unboundAt: null;
}>;

export type CoverageAction = PlannedAction<{
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
}>;

export type FactAction = PlannedAction<{
  id: string;
  institutionId: string;
  factType: string;
}>;

export type FactVersionAction = PlannedAction<{
  id: string;
  institutionFactId: string;
  versionNumber: number;
  supersedesVersionId: string | null;
  verificationState: "VERIFIED";
  isCurrent: true;
  valueJson: Record<string, unknown>;
  displayText: string | null;
  verifiedAt: Date;
  validFrom: null;
  validUntil: null;
}>;

export type FactVersionEvidenceAction = PlannedAction<{
  id: string;
  institutionFactVersionId: string;
  sourceId: string;
  sourceObservationRef: string;
  sourceSnapshotId: string;
  evidenceRole: "primary";
}>;

export type OpportunityAction = PlannedAction<{
  id: string;
  institutionId: string;
  slug: string;
  kind: string;
  truthMode: "NATIVE";
  publicationState: "DRAFT";
  publishedAt: null;
  archivedAt: null;
}>;

export type OpportunityVersionAction = PlannedAction<{
  id: string;
  opportunityId: string;
  versionNumber: number;
  supersedesVersionId: string | null;
  verificationState: "VERIFIED";
  isCurrent: true;
  title: string;
  businessState: string;
  eventStartsAt: Date | null;
  applicationClosesAt: Date | null;
  actionUrl: string | null;
  verifiedAt: Date;
}> &
  Readonly<{ sourceEvidenceIds: readonly string[] }>;

export type OpportunityVersionEvidenceAction = PlannedAction<{
  id: string;
  opportunityVersionId: string;
  sourceId: string;
  sourceObservationRef: string;
  sourceSnapshotId: string;
  evidenceRole: "primary";
}>;

export type InternationalSchoolImportPlan = Readonly<{
  applyAllowed: boolean;
  packageId: string;
  packageChecksum: string;
  created: ImportCountSet;
  updated: ImportCountSet;
  unchanged: ImportCountSet;
  ignored: Readonly<{
    specialAccess: number;
    candidates: number;
    socialEvidence: number;
  }>;
  rejects: readonly InternationalSchoolImportReject[];
  warnings: readonly InternationalSchoolImportWarning[];
  sideEffects: Readonly<{
    outboxEvents: 0;
    notifications: 0;
    deliveries: 0;
    meaningfulChanges: 0;
    opportunityChanges: 0;
  }>;
  actions: Readonly<{
    institutions: readonly InstitutionAction[];
    registryIdentities: readonly RegistryIdentityAction[];
    sources: readonly SourceAction[];
    snapshots: readonly SnapshotAction[];
    observations: readonly ObservationAction[];
    bindings: readonly BindingAction[];
    coverages: readonly CoverageAction[];
    facts: readonly FactAction[];
    factVersions: readonly FactVersionAction[];
    factVersionEvidence: readonly FactVersionEvidenceAction[];
    opportunities: readonly OpportunityAction[];
    opportunityVersions: readonly OpportunityVersionAction[];
    opportunityVersionEvidence: readonly OpportunityVersionEvidenceAction[];
  }>;
}>;

type ExistingInstitutionRow = {
  id: string;
  slug: string;
  displayName: string;
  category: string;
  internationalSubtype: string | null;
  operationalState: string;
  publicationState: string;
  regionCode: string | null;
  city: string | null;
  district: string | null;
  addressLine: string | null;
  websiteUrl: string | null;
  shortDescription: string | null;
  publishedAt: Date | string | null;
  archivedAt: Date | string | null;
  identityId: string | null;
  registryExternalId: string | null;
  registryRecordUrl: string | null;
  registryLocator: string | null;
};

function deterministicUuid(name: string): string {
  const hash = createHash("sha1")
    .update(
      Buffer.concat([
        Buffer.from(PREPPY_SEED_NAMESPACE.replaceAll("-", ""), "hex"),
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
    registryIdentities: 0,
    sources: 0,
    snapshots: 0,
    observations: 0,
    bindings: 0,
    coverages: 0,
    facts: 0,
    factVersions: 0,
    factVersionEvidence: 0,
    opportunities: 0,
    opportunityVersions: 0,
    opportunityVersionEvidence: 0,
    total: 0,
  };
}

function count(
  operation: Operation,
  key: keyof Omit<ImportCountSet, "total">,
  created: ImportCountSet,
  updated: ImportCountSet,
  unchanged: ImportCountSet,
) {
  const target =
    operation === "CREATE"
      ? created
      : operation === "UPDATE"
        ? updated
        : unchanged;
  target[key] += 1;
  target.total += 1;
}

function isiNumber(value: string): number {
  return Number(value.slice("ST01:".length));
}

function sourceRole(
  evidence: EvidenceArtifactRecord,
): BindingAction["desired"]["role"] {
  if (evidence.sourceType === "OFFICIAL_REGISTRY") return "REGISTRY_IDENTITY";
  if (evidence.field === "TUITION") return "TUITION";
  if (evidence.field === "CURRICULUM") return "CURRICULUM";
  if (
    evidence.field === "ELIGIBILITY" ||
    evidence.field === "ADMISSION_PROCESS" ||
    evidence.field === "INFORMATION_SESSION"
  ) {
    return "ADMISSIONS";
  }
  if (evidence.field === "IDENTITY") return "OFFICIAL_MAIN";
  return "OTHER";
}

function observationOutcome(
  evidence: EvidenceArtifactRecord,
): ObservationAction["desired"]["outcome"] {
  if (
    evidence.status === "VERIFIED" ||
    evidence.status === "VERIFIED_WITH_WARNING" ||
    evidence.status === "VERIFIED_WITH_DATE_LIMIT" ||
    evidence.status === "NEEDS_REVIEW"
  ) {
    return "SUCCESS";
  }
  if (evidence.status === "NOT_FOUND_IN_CHECKED_OFFICIAL_SOURCES") {
    return "NOT_FOUND";
  }
  if (evidence.status === "ACCESS_FAILED") return "ACCESS_ERROR";
  return "OTHER_ERROR";
}

function materialMatches(
  existing: ExistingInstitutionRow,
  desired: InstitutionAction["desired"],
): boolean {
  return (
    existing.slug === desired.slug &&
    existing.displayName === desired.displayName &&
    existing.category === desired.category &&
    existing.internationalSubtype === desired.internationalSubtype &&
    existing.operationalState === desired.operationalState &&
    existing.regionCode === desired.regionCode &&
    existing.city === desired.city &&
    existing.district === desired.district &&
    existing.addressLine === desired.addressLine &&
    existing.websiteUrl === desired.websiteUrl &&
    existing.shortDescription === desired.shortDescription &&
    existing.publishedAt === null &&
    existing.archivedAt === null
  );
}

function sameHost(left: string | null, right: string): boolean {
  if (left === null) return false;
  try {
    return (
      new URL(left).hostname.toLowerCase() ===
      new URL(right).hostname.toLowerCase()
    );
  } catch {
    return false;
  }
}

function dateEqual(
  left: Date | string | null,
  right: Date | string | null,
): boolean {
  if (left === null || right === null) return left === right;
  return new Date(left).toISOString() === new Date(right).toISOString();
}

function emptyActions(): InternationalSchoolImportPlan["actions"] {
  return {
    institutions: [],
    registryIdentities: [],
    sources: [],
    snapshots: [],
    observations: [],
    bindings: [],
    coverages: [],
    facts: [],
    factVersions: [],
    factVersionEvidence: [],
    opportunities: [],
    opportunityVersions: [],
    opportunityVersionEvidence: [],
  };
}

function planShell(
  packageValue: InternationalSchoolImportPackage,
  created: ImportCountSet,
  updated: ImportCountSet,
  unchanged: ImportCountSet,
  actions: InternationalSchoolImportPlan["actions"],
  rejects: InternationalSchoolImportReject[],
  warnings: InternationalSchoolImportWarning[],
): InternationalSchoolImportPlan {
  rejects.sort(
    (left, right) =>
      left.code.localeCompare(right.code) || left.key.localeCompare(right.key),
  );
  warnings.sort(
    (left, right) =>
      left.code.localeCompare(right.code) || left.key.localeCompare(right.key),
  );
  return {
    applyAllowed: rejects.length === 0,
    packageId: packageValue.snapshot.packageId,
    packageChecksum: packageValue.manifest.preppyImportChecksum,
    created,
    updated,
    unchanged,
    ignored: {
      specialAccess: packageValue.specialAccess.length,
      candidates: packageValue.candidates.length,
      socialEvidence: packageValue.socialEvidence.length,
    },
    rejects,
    warnings,
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

export async function planInternationalSchoolImport(
  executor: ReadOnlyDatabaseExecutor,
  packageValue: InternationalSchoolImportPackage,
): Promise<InternationalSchoolImportPlan> {
  const created = emptyCounts();
  const updated = emptyCounts();
  const unchanged = emptyCounts();
  const rejects: InternationalSchoolImportReject[] = [];
  const warnings: InternationalSchoolImportWarning[] = [];
  const actions = {
    institutions: [] as InstitutionAction[],
    registryIdentities: [] as RegistryIdentityAction[],
    sources: [] as SourceAction[],
    snapshots: [] as SnapshotAction[],
    observations: [] as ObservationAction[],
    bindings: [] as BindingAction[],
    coverages: [] as CoverageAction[],
    facts: [] as FactAction[],
    factVersions: [] as FactVersionAction[],
    factVersionEvidence: [] as FactVersionEvidenceAction[],
    opportunities: [] as OpportunityAction[],
    opportunityVersions: [] as OpportunityVersionAction[],
    opportunityVersionEvidence: [] as OpportunityVersionEvidenceAction[],
  };
  const validation = validateInternationalSchoolPackage(packageValue);
  if (validation.status === "FAIL") {
    for (const error of validation.errors) {
      rejects.push({
        code: "INVALID_PACKAGE",
        key: error.path,
        message: error.message,
      });
    }
    return planShell(
      packageValue,
      created,
      updated,
      unchanged,
      emptyActions(),
      rejects,
      warnings,
    );
  }

  const institutions = [...packageValue.institutions].sort(
    (left, right) =>
      isiNumber(left.registryExternalId) - isiNumber(right.registryExternalId),
  );
  const expectedIds = institutions.map((institution) =>
    institutionIdForRegistryIdentity("ISI", institution.registryExternalId),
  );
  const slugs = institutions.map((institution) => institution.slug);
  const registryIds = institutions.map(
    (institution) => institution.registryExternalId,
  );
  const names = institutions.map((institution) => institution.canonicalNameKo);
  const websites = institutions.map((institution) => institution.websiteUrl);
  const existingRows = (await executor.raw(sql`
    select
      i.id,
      i.slug,
      i.display_name as "displayName",
      i.category,
      i.international_subtype as "internationalSubtype",
      i.operational_state as "operationalState",
      i.publication_state as "publicationState",
      i.region_code as "regionCode",
      i.city,
      i.district,
      i.address_line as "addressLine",
      i.website_url as "websiteUrl",
      i.short_description as "shortDescription",
      i.published_at as "publishedAt",
      i.archived_at as "archivedAt",
      identity.id as "identityId",
      identity.registry_external_id as "registryExternalId",
      identity.registry_record_url as "registryRecordUrl",
      identity.registry_locator as "registryLocator"
    from institutions i
    left join institution_registry_identities identity
      on identity.institution_id=i.id and identity.registry_name='ISI'
    where i.id in (${sql.join(
      expectedIds.map((id) => sql`${id}`),
      sql`, `,
    )})
       or i.slug in (${sql.join(
         slugs.map((slug) => sql`${slug}`),
         sql`, `,
       )})
       or identity.registry_external_id in (
         ${sql.join(
           registryIds.map((id) => sql`${id}`),
           sql`, `,
         )}
       )
       or i.display_name in (
         ${sql.join(
           names.map((name) => sql`${name}`),
           sql`, `,
         )}
       )
       or i.website_url in (
         ${sql.join(
           websites.map((url) => sql`${url}`),
           sql`, `,
         )}
       )
    order by i.id, identity.registry_external_id
  `)) as unknown as ExistingInstitutionRow[];

  const institutionIdByRegistryId = new Map<string, string>();
  for (const institution of institutions) {
    const institutionId = institutionIdForRegistryIdentity(
      "ISI",
      institution.registryExternalId,
    );
    institutionIdByRegistryId.set(
      institution.registryExternalId,
      institutionId,
    );
    const desired: InstitutionAction["desired"] = {
      id: institutionId,
      slug: institution.slug,
      displayName: institution.canonicalNameKo,
      category: "INTERNATIONAL_SCHOOL",
      internationalSubtype: "FOREIGN_SCHOOL",
      operationalState: "ACTIVE",
      publicationState: "DRAFT",
      regionCode: institution.regionCode,
      city: institution.city,
      district: institution.district,
      addressLine:
        institution.addressConflict === null ? institution.addressLine : null,
      websiteUrl: institution.websiteUrl,
      shortDescription: null,
      publishedAt: null,
      archivedAt: null,
    };
    const identityRow = existingRows.find(
      (row) => row.registryExternalId === institution.registryExternalId,
    );
    const idRow = existingRows.find((row) => row.id === institutionId);
    const slugRow = existingRows.find((row) => row.slug === institution.slug);
    let existing = identityRow;
    if (identityRow && identityRow.id !== institutionId) {
      rejects.push({
        code: "ISI_IDENTITY_COLLISION",
        key: institution.registryExternalId,
        message: "ISI 등록키가 결정적 기관 ID와 다른 기관에 연결돼 있어요.",
      });
    } else if (!identityRow && idRow) {
      rejects.push({
        code: "ISI_IDENTITY_COLLISION",
        key: institution.registryExternalId,
        message: "결정적 기관 ID가 ISI 등록키 없이 이미 사용 중이에요.",
      });
      existing = idRow;
    } else if (!identityRow && slugRow) {
      rejects.push({
        code: "MATERIAL_FIELD_COLLISION",
        key: institution.slug,
        message: "기관 slug가 다른 등록 신원에 사용 중이에요.",
      });
      existing = slugRow;
    }
    if (identityRow && identityRow.publicationState !== "DRAFT") {
      rejects.push({
        code: "PUBLICATION_STATE_COLLISION",
        key: institution.registryExternalId,
        message: "공개 또는 보관 상태의 기관은 자동 반입으로 변경할 수 없어요.",
      });
    } else if (identityRow && !materialMatches(identityRow, desired)) {
      rejects.push({
        code: "MATERIAL_FIELD_COLLISION",
        key: institution.registryExternalId,
        message: "기존 기관의 중요 필드가 반입 스냅샷과 달라요.",
      });
    }
    for (const candidate of existingRows) {
      if (
        candidate.id === institutionId ||
        candidate.registryExternalId === institution.registryExternalId ||
        candidate.slug === institution.slug
      ) {
        continue;
      }
      if (
        candidate.displayName === institution.canonicalNameKo ||
        sameHost(candidate.websiteUrl, institution.websiteUrl) ||
        (institution.addressLine !== null &&
          candidate.addressLine === institution.addressLine)
      ) {
        warnings.push({
          code: "POSSIBLE_IDENTITY_COLLISION",
          key: institution.registryExternalId,
          message:
            "이름·도메인·주소가 비슷한 별도 기관이 있어 자동 병합하지 않았어요.",
        });
        break;
      }
    }
    const institutionOperation: Operation = existing ? "NONE" : "CREATE";
    actions.institutions.push({
      operation: institutionOperation,
      key: institution.registryExternalId,
      institutionId,
      registryExternalId: institution.registryExternalId,
      desired,
    });
    count(institutionOperation, "institutions", created, updated, unchanged);

    const identityDesired: RegistryIdentityAction["desired"] = {
      id:
        identityRow?.identityId ??
        deterministicUuid(
          `preppy:registry-identity:ISI:${institution.registryExternalId}`,
        ),
      institutionId,
      registryName: "ISI",
      registryExternalId: institution.registryExternalId,
      registryRecordUrl: institution.registryRecordUrl,
      registryLocator: institution.registryExternalId,
      metadataJson: {
        canonicalNameEn: institution.canonicalNameEn,
        aliases: institution.aliases,
        packageId: packageValue.snapshot.packageId,
      },
    };
    const identityExact =
      identityRow !== undefined &&
      identityRow.id === institutionId &&
      identityRow.registryRecordUrl === institution.registryRecordUrl &&
      identityRow.registryLocator === institution.registryExternalId;
    const identityOperation: Operation = identityExact ? "NONE" : "CREATE";
    actions.registryIdentities.push({
      operation: identityOperation,
      key: institution.registryExternalId,
      institutionId,
      registryExternalId: institution.registryExternalId,
      desired: identityDesired,
    });
    count(identityOperation, "registryIdentities", created, updated, unchanged);
  }

  const evidenceById = new Map(
    packageValue.evidence.map((evidence) => [evidence.evidenceId, evidence]),
  );
  const evidenceByUrl = new Map<string, EvidenceArtifactRecord[]>();
  for (const evidence of packageValue.evidence) {
    const items = evidenceByUrl.get(evidence.sourceUrl) ?? [];
    items.push(evidence);
    evidenceByUrl.set(evidence.sourceUrl, items);
  }
  const sourceIdByEvidenceId = new Map<string, string>();
  for (const [sourceUrl, evidenceItems] of [...evidenceByUrl.entries()].sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    const first = evidenceItems[0]!;
    if (
      evidenceItems.some(
        (item) =>
          item.sourceType !== first.sourceType ||
          item.authorityLevel !== first.authorityLevel,
      )
    ) {
      rejects.push({
        code: "SOURCE_COLLISION",
        key: sourceUrl,
        message: "한 URL이 서로 다른 출처 의미로 사용됐어요.",
      });
    }
    const sourceId = deterministicUuid(`preppy:source:${sourceUrl}`);
    for (const evidence of evidenceItems) {
      sourceIdByEvidenceId.set(evidence.evidenceId, sourceId);
    }
    const desired: SourceAction["desired"] = {
      id: sourceId,
      canonicalUrl: sourceUrl,
      sourceType: first.sourceType,
      authorityLevel: first.authorityLevel,
      lifecycleStatus: "ACTIVE",
      sourceName: first.sourceName,
      requiresJs: false,
      contentTypeHint: "text/html",
    };
    actions.sources.push({
      operation: "CREATE",
      key: sourceUrl,
      desired,
    });
    count("CREATE", "sources", created, updated, unchanged);
  }

  const bindingKeys = new Set<string>();
  for (const evidence of [...packageValue.evidence].sort((left, right) =>
    left.evidenceId.localeCompare(right.evidenceId),
  )) {
    const institutionId = institutionIdByRegistryId.get(
      evidence.institutionRegistryId,
    )!;
    const sourceId = sourceIdByEvidenceId.get(evidence.evidenceId)!;
    if (evidence.sourceSnapshotId !== null) {
      const snapshotDesired: SnapshotAction["desired"] = {
        id: evidence.sourceSnapshotId,
        sourceId,
        capturedAt: new Date(evidence.collectedAt),
        contentHash: evidence.sourceContentSha256,
        textHash: evidence.sourceContentSha256,
        normalizedText: evidence.excerpt,
        rawStorageKey: null,
        rawBody: null,
        mimeType: "text/html",
        metadata: {
          packageId: packageValue.snapshot.packageId,
          evidenceId: evidence.evidenceId,
        },
      };
      actions.snapshots.push({
        operation: "CREATE",
        key: evidence.sourceSnapshotId,
        desired: snapshotDesired,
      });
      count("CREATE", "snapshots", created, updated, unchanged);
    }
    if (
      evidence.sourceObservationRef !== null &&
      evidence.observedAt !== null
    ) {
      const observationDesired: ObservationAction["desired"] = {
        sourceId,
        observationRef: evidence.sourceObservationRef,
        observedAt: new Date(evidence.observedAt),
        outcome: observationOutcome(evidence),
        finalUrl: evidence.finalUrl,
        contentHash:
          evidence.sourceSnapshotId === null
            ? null
            : evidence.sourceContentSha256,
        textHash:
          evidence.sourceSnapshotId === null
            ? null
            : evidence.sourceContentSha256,
        snapshotId: evidence.sourceSnapshotId,
        errorCode: evidence.status === "ACCESS_FAILED" ? "ACCESS_FAILED" : null,
        errorMessage: null,
        metadata: {
          packageId: packageValue.snapshot.packageId,
          evidenceId: evidence.evidenceId,
          artifactObservationRef: evidence.sourceObservationRef,
        },
      };
      actions.observations.push({
        operation: "CREATE",
        key: evidence.sourceObservationRef,
        desired: observationDesired,
      });
      count("CREATE", "observations", created, updated, unchanged);
    }
    const role = sourceRole(evidence);
    const bindingKey = `${institutionId}\u0000${sourceId}\u0000${role}`;
    if (!bindingKeys.has(bindingKey)) {
      bindingKeys.add(bindingKey);
      actions.bindings.push({
        operation: "CREATE",
        key: bindingKey,
        desired: {
          institutionId,
          sourceId,
          role,
          isPrimary: role === "OFFICIAL_MAIN",
          isActive: true,
          unboundAt: null,
        },
      });
      count("CREATE", "bindings", created, updated, unchanged);
    }
  }

  for (const item of [...packageValue.snapshot.institutions].sort(
    (left, right) =>
      isiNumber(left.registryExternalId) - isiNumber(right.registryExternalId),
  )) {
    const institutionId = institutionIdByRegistryId.get(
      item.registryExternalId,
    )!;
    for (const coverage of [...item.coverages].sort((left, right) =>
      left.section.localeCompare(right.section),
    )) {
      const evidence =
        coverage.evidenceId === null
          ? undefined
          : evidenceById.get(coverage.evidenceId);
      const desired: CoverageAction["desired"] = {
        institutionId,
        section: coverage.section,
        status: coverage.status,
        sourceId:
          coverage.evidenceId === null
            ? null
            : sourceIdByEvidenceId.get(coverage.evidenceId)!,
        sourceSnapshotId: evidence?.sourceSnapshotId ?? null,
        academicYearLabel: coverage.academicYearLabel,
        publicNote: coverage.publicNote,
        internalNote: coverage.internalNote,
        lastCollectedAt:
          coverage.lastCollectedAt === null
            ? null
            : new Date(coverage.lastCollectedAt),
        lastCheckedAt: new Date(coverage.lastCheckedAt),
      };
      actions.coverages.push({
        operation: "CREATE",
        key: `${institutionId}\u0000${coverage.section}`,
        desired,
      });
      count("CREATE", "coverages", created, updated, unchanged);
    }
    for (const fact of [...item.facts].sort((left, right) =>
      left.factType.localeCompare(right.factType),
    )) {
      const factId = deterministicUuid(
        `preppy:international-school:fact:${institutionId}:${fact.factType}`,
      );
      actions.facts.push({
        operation: "CREATE",
        key: `${institutionId}\u0000${fact.factType}`,
        desired: {
          id: factId,
          institutionId,
          factType: fact.factType,
        },
      });
      count("CREATE", "facts", created, updated, unchanged);
      const { factType, ...valueJson } = fact.value;
      void factType;
      const versionId = deterministicUuid(
        `preppy:international-school:fact-version:${factId}:${canonicalJson(valueJson)}`,
      );
      actions.factVersions.push({
        operation: "CREATE",
        key: versionId,
        desired: {
          id: versionId,
          institutionFactId: factId,
          versionNumber: 1,
          supersedesVersionId: null,
          verificationState: "VERIFIED",
          isCurrent: true,
          valueJson,
          displayText: fact.displayText,
          verifiedAt: new Date(fact.verifiedAt),
          validFrom: null,
          validUntil: null,
        },
      });
      count("CREATE", "factVersions", created, updated, unchanged);
      for (const evidenceId of [...fact.evidenceIds].sort()) {
        const evidence = evidenceById.get(evidenceId)!;
        const sourceId = sourceIdByEvidenceId.get(evidenceId)!;
        const evidenceActionId = deterministicUuid(
          `preppy:international-school:fact-evidence:${versionId}:${sourceId}:${evidence.sourceSnapshotId}`,
        );
        actions.factVersionEvidence.push({
          operation: "CREATE",
          key: evidenceActionId,
          desired: {
            id: evidenceActionId,
            institutionFactVersionId: versionId,
            sourceId,
            sourceObservationRef: evidence.sourceObservationRef!,
            sourceSnapshotId: evidence.sourceSnapshotId!,
            evidenceRole: "primary",
          },
        });
        count("CREATE", "factVersionEvidence", created, updated, unchanged);
      }
    }
    for (const opportunity of [...item.opportunities].sort((left, right) =>
      left.slug.localeCompare(right.slug),
    )) {
      const opportunityId = deterministicUuid(
        `preppy:international-school:opportunity:${institutionId}:${opportunity.slug}`,
      );
      actions.opportunities.push({
        operation: "CREATE",
        key: opportunity.slug,
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
      count("CREATE", "opportunities", created, updated, unchanged);
      const versionId = deterministicUuid(
        `preppy:international-school:opportunity-version:${opportunityId}:${canonicalJson(opportunity)}`,
      );
      actions.opportunityVersions.push({
        operation: "CREATE",
        key: versionId,
        sourceEvidenceIds: [...opportunity.evidenceIds].sort(),
        desired: {
          id: versionId,
          opportunityId,
          versionNumber: 1,
          supersedesVersionId: null,
          verificationState: "VERIFIED",
          isCurrent: true,
          title: opportunity.title,
          businessState: opportunity.businessState,
          eventStartsAt:
            opportunity.eventStartsAt === null
              ? null
              : new Date(opportunity.eventStartsAt),
          applicationClosesAt:
            opportunity.applicationClosesAt === null
              ? null
              : new Date(opportunity.applicationClosesAt),
          actionUrl: opportunity.actionUrl,
          verifiedAt: new Date(opportunity.verifiedAt),
        },
      });
      count("CREATE", "opportunityVersions", created, updated, unchanged);
      for (const evidenceId of [...opportunity.evidenceIds].sort()) {
        const evidence = evidenceById.get(evidenceId)!;
        const sourceId = sourceIdByEvidenceId.get(evidenceId)!;
        const evidenceActionId = deterministicUuid(
          `preppy:international-school:opportunity-evidence:${versionId}:${sourceId}:${evidence.sourceSnapshotId}`,
        );
        actions.opportunityVersionEvidence.push({
          operation: "CREATE",
          key: evidenceActionId,
          desired: {
            id: evidenceActionId,
            opportunityVersionId: versionId,
            sourceId,
            sourceObservationRef: evidence.sourceObservationRef!,
            sourceSnapshotId: evidence.sourceSnapshotId!,
            evidenceRole: "primary",
          },
        });
        count(
          "CREATE",
          "opportunityVersionEvidence",
          created,
          updated,
          unchanged,
        );
      }
    }
  }

  const institutionIds = actions.institutions.map(
    (action) => action.institutionId,
  );
  const sourceUrls = actions.sources.map(
    (action) => action.desired.canonicalUrl,
  );
  const sourceIds = actions.sources.map((action) => action.desired.id);
  const [
    existingSources,
    existingSnapshots,
    existingObservations,
    existingBindings,
    existingCoverages,
    existingFacts,
    existingOpportunities,
  ] = await Promise.all([
    executor.drizzle
      .select()
      .from(sourcesTable)
      .where(inArray(sourcesTable.canonicalUrl, sourceUrls)),
    executor.drizzle
      .select()
      .from(sourceSnapshotsTable)
      .where(inArray(sourceSnapshotsTable.sourceId, sourceIds)),
    executor.drizzle
      .select()
      .from(sourceObservationsTable)
      .where(inArray(sourceObservationsTable.sourceId, sourceIds)),
    executor.drizzle
      .select()
      .from(institutionSourceBindingsTable)
      .where(
        inArray(institutionSourceBindingsTable.institutionId, institutionIds),
      ),
    executor.drizzle
      .select()
      .from(institutionSectionCoveragesTable)
      .where(
        inArray(institutionSectionCoveragesTable.institutionId, institutionIds),
      ),
    executor.drizzle
      .select()
      .from(institutionFactsTable)
      .where(inArray(institutionFactsTable.institutionId, institutionIds)),
    executor.drizzle
      .select()
      .from(opportunitiesTable)
      .where(inArray(opportunitiesTable.institutionId, institutionIds)),
  ]);

  const existingSourceByUrl = new Map(
    existingSources.map((row) => [row.canonicalUrl, row]),
  );
  for (let index = 0; index < actions.sources.length; index += 1) {
    const action = actions.sources[index]!;
    const row = existingSourceByUrl.get(action.desired.canonicalUrl);
    if (!row) continue;
    const exact =
      row.id === action.desired.id &&
      row.sourceType === action.desired.sourceType &&
      row.authorityLevel === action.desired.authorityLevel &&
      row.lifecycleStatus === action.desired.lifecycleStatus &&
      row.sourceName === action.desired.sourceName &&
      row.requiresJs === action.desired.requiresJs &&
      row.contentTypeHint === action.desired.contentTypeHint;
    if (exact) {
      actions.sources[index] = { ...action, operation: "NONE" };
    } else {
      rejects.push({
        code: "SOURCE_COLLISION",
        key: action.key,
        message: "같은 공식 URL의 기존 출처가 스냅샷과 달라요.",
      });
    }
  }

  const existingSnapshotById = new Map(
    existingSnapshots.map((row) => [row.id, row]),
  );
  for (let index = 0; index < actions.snapshots.length; index += 1) {
    const action = actions.snapshots[index]!;
    const row = existingSnapshotById.get(action.desired.id);
    if (!row) continue;
    const exact =
      row.sourceId === action.desired.sourceId &&
      row.contentHash === action.desired.contentHash &&
      row.textHash === action.desired.textHash &&
      row.normalizedText === action.desired.normalizedText &&
      row.mimeType === action.desired.mimeType;
    if (exact) {
      actions.snapshots[index] = { ...action, operation: "NONE" };
    } else {
      rejects.push({
        code: "MATERIAL_FIELD_COLLISION",
        key: action.key,
        message: "기존 공식 스냅샷이 검토한 내용과 달라요.",
      });
    }
  }

  const existingObservationByReference = new Map(
    existingObservations.flatMap((row) => {
      const reference = row.metadata?.artifactObservationRef;
      return typeof reference === "string"
        ? [[`${row.sourceId}\u0000${reference}`, row] as const]
        : [];
    }),
  );
  for (let index = 0; index < actions.observations.length; index += 1) {
    const action = actions.observations[index]!;
    const row = existingObservationByReference.get(
      `${action.desired.sourceId}\u0000${action.desired.observationRef}`,
    );
    if (!row) continue;
    const exact =
      row.outcome === action.desired.outcome &&
      dateEqual(row.observedAt, action.desired.observedAt) &&
      row.finalUrl === action.desired.finalUrl &&
      row.contentHash === action.desired.contentHash &&
      row.textHash === action.desired.textHash &&
      row.snapshotId === action.desired.snapshotId;
    if (exact) {
      actions.observations[index] = { ...action, operation: "NONE" };
    } else {
      rejects.push({
        code: "MATERIAL_FIELD_COLLISION",
        key: action.key,
        message: "기존 공식 관찰 결과가 검토한 내용과 달라요.",
      });
    }
  }

  const existingBindingByKey = new Map(
    existingBindings.map((row) => [
      `${row.institutionId}\u0000${row.sourceId}\u0000${row.role}`,
      row,
    ]),
  );
  for (let index = 0; index < actions.bindings.length; index += 1) {
    const action = actions.bindings[index]!;
    const row = existingBindingByKey.get(action.key);
    if (!row) continue;
    const exact =
      row.isPrimary === action.desired.isPrimary &&
      row.isActive === action.desired.isActive &&
      row.unboundAt === action.desired.unboundAt;
    if (exact) {
      actions.bindings[index] = { ...action, operation: "NONE" };
    } else {
      rejects.push({
        code: "MATERIAL_FIELD_COLLISION",
        key: action.key,
        message: "기존 기관 출처 연결이 검토한 상태와 달라요.",
      });
    }
  }

  const existingCoverageByKey = new Map(
    existingCoverages.map((row) => [
      `${row.institutionId}\u0000${row.section}`,
      row,
    ]),
  );
  for (let index = 0; index < actions.coverages.length; index += 1) {
    const action = actions.coverages[index]!;
    const row = existingCoverageByKey.get(action.key);
    if (!row) continue;
    const exact =
      row.status === action.desired.status &&
      row.sourceId === action.desired.sourceId &&
      row.sourceSnapshotId === action.desired.sourceSnapshotId &&
      row.academicYearLabel === action.desired.academicYearLabel &&
      row.publicNote === action.desired.publicNote &&
      row.internalNote === action.desired.internalNote &&
      dateEqual(row.lastCollectedAt, action.desired.lastCollectedAt) &&
      dateEqual(row.lastCheckedAt, action.desired.lastCheckedAt);
    actions.coverages[index] = {
      ...action,
      operation: exact ? "NONE" : "UPDATE",
    };
  }

  const existingFactByKey = new Map(
    existingFacts.map((row) => [
      `${row.institutionId}\u0000${row.factType}`,
      row,
    ]),
  );
  for (let index = 0; index < actions.facts.length; index += 1) {
    const action = actions.facts[index]!;
    const row = existingFactByKey.get(action.key);
    if (!row) continue;
    if (row.id === action.desired.id) {
      actions.facts[index] = { ...action, operation: "NONE" };
    } else {
      rejects.push({
        code: "MATERIAL_FIELD_COLLISION",
        key: action.key,
        message: "기존 사실 루트의 식별자가 검토한 결정적 ID와 달라요.",
      });
    }
  }

  const factIds = actions.facts.map((action) => action.desired.id);
  const existingFactVersions =
    factIds.length === 0
      ? []
      : await executor.drizzle
          .select()
          .from(institutionFactVersionsTable)
          .where(
            inArray(institutionFactVersionsTable.institutionFactId, factIds),
          );
  const existingFactVersionById = new Map(
    existingFactVersions.map((row) => [row.id, row]),
  );
  for (let index = 0; index < actions.factVersions.length; index += 1) {
    const action = actions.factVersions[index]!;
    const row = existingFactVersionById.get(action.desired.id);
    if (!row) continue;
    const exact =
      row.institutionFactId === action.desired.institutionFactId &&
      row.versionNumber === action.desired.versionNumber &&
      row.supersedesVersionId === action.desired.supersedesVersionId &&
      row.verificationState === action.desired.verificationState &&
      row.isCurrent === action.desired.isCurrent &&
      canonicalJson(row.valueJson) ===
        canonicalJson(action.desired.valueJson) &&
      row.displayText === action.desired.displayText &&
      dateEqual(row.verifiedAt, action.desired.verifiedAt);
    if (exact) {
      actions.factVersions[index] = { ...action, operation: "NONE" };
    } else {
      rejects.push({
        code: "MATERIAL_FIELD_COLLISION",
        key: action.key,
        message: "기존 사실 버전이 검토한 값과 달라요.",
      });
    }
  }

  const factEvidenceIds = actions.factVersionEvidence.map(
    (action) => action.desired.id,
  );
  const existingFactEvidence =
    factEvidenceIds.length === 0
      ? []
      : await executor.drizzle
          .select()
          .from(institutionFactVersionEvidenceTable)
          .where(
            inArray(institutionFactVersionEvidenceTable.id, factEvidenceIds),
          );
  const existingFactEvidenceById = new Map(
    existingFactEvidence.map((row) => [row.id, row]),
  );
  const observationReferenceById = new Map(
    existingObservations.flatMap((row) => {
      const reference = row.metadata?.artifactObservationRef;
      return typeof reference === "string"
        ? [[row.id.toString(), reference] as const]
        : [];
    }),
  );
  for (let index = 0; index < actions.factVersionEvidence.length; index += 1) {
    const action = actions.factVersionEvidence[index]!;
    const row = existingFactEvidenceById.get(action.desired.id);
    if (!row) continue;
    const exact =
      row.institutionFactVersionId ===
        action.desired.institutionFactVersionId &&
      row.sourceId === action.desired.sourceId &&
      row.sourceSnapshotId === action.desired.sourceSnapshotId &&
      row.evidenceRole === action.desired.evidenceRole &&
      row.sourceObservationId !== null &&
      observationReferenceById.get(row.sourceObservationId.toString()) ===
        action.desired.sourceObservationRef;
    if (exact) {
      actions.factVersionEvidence[index] = {
        ...action,
        operation: "NONE",
      };
    } else {
      rejects.push({
        code: "MATERIAL_FIELD_COLLISION",
        key: action.key,
        message: "기존 사실 근거 연결이 검토한 공식 근거와 달라요.",
      });
    }
  }

  const existingOpportunityBySlug = new Map(
    existingOpportunities.map((row) => [row.slug, row]),
  );
  for (let index = 0; index < actions.opportunities.length; index += 1) {
    const action = actions.opportunities[index]!;
    const row = existingOpportunityBySlug.get(action.desired.slug);
    if (!row) continue;
    const exact =
      row.id === action.desired.id &&
      row.institutionId === action.desired.institutionId &&
      row.kind === action.desired.kind &&
      row.truthMode === action.desired.truthMode &&
      row.publicationState === action.desired.publicationState &&
      row.publishedAt === action.desired.publishedAt &&
      row.archivedAt === action.desired.archivedAt;
    if (exact) {
      actions.opportunities[index] = { ...action, operation: "NONE" };
    } else {
      rejects.push({
        code: "MATERIAL_FIELD_COLLISION",
        key: action.key,
        message: "기존 행사 루트가 검토한 값과 달라요.",
      });
    }
  }

  const opportunityIds = actions.opportunities.map(
    (action) => action.desired.id,
  );
  const existingOpportunityVersions =
    opportunityIds.length === 0
      ? []
      : await executor.drizzle
          .select()
          .from(opportunityVersionsTable)
          .where(
            inArray(opportunityVersionsTable.opportunityId, opportunityIds),
          );
  const existingOpportunityVersionById = new Map(
    existingOpportunityVersions.map((row) => [row.id, row]),
  );
  for (let index = 0; index < actions.opportunityVersions.length; index += 1) {
    const action = actions.opportunityVersions[index]!;
    const row = existingOpportunityVersionById.get(action.desired.id);
    if (!row) continue;
    const exact =
      row.opportunityId === action.desired.opportunityId &&
      row.versionNumber === action.desired.versionNumber &&
      row.supersedesVersionId === action.desired.supersedesVersionId &&
      row.verificationState === action.desired.verificationState &&
      row.isCurrent === action.desired.isCurrent &&
      row.title === action.desired.title &&
      row.businessState === action.desired.businessState &&
      dateEqual(row.eventStartAt, action.desired.eventStartsAt) &&
      dateEqual(row.applicationCloseAt, action.desired.applicationClosesAt) &&
      row.actionUrl === action.desired.actionUrl &&
      dateEqual(row.verifiedAt, action.desired.verifiedAt);
    if (exact) {
      actions.opportunityVersions[index] = {
        ...action,
        operation: "NONE",
      };
    } else {
      rejects.push({
        code: "MATERIAL_FIELD_COLLISION",
        key: action.key,
        message: "기존 행사 버전이 검토한 값과 달라요.",
      });
    }
  }

  const opportunityEvidenceIds = actions.opportunityVersionEvidence.map(
    (action) => action.desired.id,
  );
  const existingOpportunityEvidence =
    opportunityEvidenceIds.length === 0
      ? []
      : await executor.drizzle
          .select()
          .from(opportunityVersionEvidenceTable)
          .where(
            inArray(opportunityVersionEvidenceTable.id, opportunityEvidenceIds),
          );
  const existingOpportunityEvidenceById = new Map(
    existingOpportunityEvidence.map((row) => [row.id, row]),
  );
  for (
    let index = 0;
    index < actions.opportunityVersionEvidence.length;
    index += 1
  ) {
    const action = actions.opportunityVersionEvidence[index]!;
    const row = existingOpportunityEvidenceById.get(action.desired.id);
    if (!row) continue;
    const exact =
      row.opportunityVersionId === action.desired.opportunityVersionId &&
      row.sourceId === action.desired.sourceId &&
      row.sourceSnapshotId === action.desired.sourceSnapshotId &&
      row.evidenceRole === action.desired.evidenceRole &&
      row.sourceObservationId !== null &&
      observationReferenceById.get(row.sourceObservationId.toString()) ===
        action.desired.sourceObservationRef;
    if (exact) {
      actions.opportunityVersionEvidence[index] = {
        ...action,
        operation: "NONE",
      };
    } else {
      rejects.push({
        code: "MATERIAL_FIELD_COLLISION",
        key: action.key,
        message: "기존 행사 근거 연결이 검토한 공식 근거와 달라요.",
      });
    }
  }

  Object.assign(created, emptyCounts());
  Object.assign(updated, emptyCounts());
  Object.assign(unchanged, emptyCounts());
  const actionGroups = [
    ["institutions", actions.institutions],
    ["registryIdentities", actions.registryIdentities],
    ["sources", actions.sources],
    ["snapshots", actions.snapshots],
    ["observations", actions.observations],
    ["bindings", actions.bindings],
    ["coverages", actions.coverages],
    ["facts", actions.facts],
    ["factVersions", actions.factVersions],
    ["factVersionEvidence", actions.factVersionEvidence],
    ["opportunities", actions.opportunities],
    ["opportunityVersions", actions.opportunityVersions],
    ["opportunityVersionEvidence", actions.opportunityVersionEvidence],
  ] as const;
  for (const [key, group] of actionGroups) {
    for (const action of group) {
      count(action.operation, key, created, updated, unchanged);
    }
  }

  return planShell(
    packageValue,
    created,
    updated,
    unchanged,
    actions,
    rejects,
    warnings,
  );
}
