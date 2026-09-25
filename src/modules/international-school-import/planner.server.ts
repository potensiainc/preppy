import { createHash } from "node:crypto";

import { sql } from "drizzle-orm";

import type { ReadOnlyDatabaseExecutor } from "@/src/infrastructure/db/runtime.server";
import { institutionIdForRegistryIdentity } from "@/src/modules/institution-seed/planner";
import type {
  EvidenceArtifactRecord,
  InstitutionArtifactRecord,
  InternationalSchoolImportPackage,
} from "./artifact-schema";
import {
  canonicalJson,
  validateInternationalSchoolPackage,
} from "./validator";

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
  Readonly<{
    institutionId: string;
    registryExternalId: string;
  }>;

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
  outcome:
    | "SUCCESS"
    | "NOT_FOUND"
    | "ACCESS_ERROR"
    | "OTHER_ERROR";
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

function sourceRole(evidence: EvidenceArtifactRecord): BindingAction["desired"]["role"] {
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
    return new URL(left).hostname.toLowerCase() ===
      new URL(right).hostname.toLowerCase();
  } catch {
    return false;
  }
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

function packageChecksum(pkg: InternationalSchoolImportPackage): string {
  const hash = createHash("sha256");
  hash.update(canonicalJson(pkg));
  return hash.digest("hex");
}

function sourceIdForUrl(canonicalUrl: string): string {
  return deterministicUuid(`preppy:source:${canonicalUrl}`);
}

function snapshotIdForEvidence(evidenceId: string): string {
  return deterministicUuid(`preppy:snapshot:${evidenceId}`);
}

function observationRefForEvidence(evidenceId: string): string {
  return `obs:${evidenceId}`;
}

function factIdForInstitution(
  institutionId: string,
  factType: string,
): string {
  return deterministicUuid(`preppy:fact:${institutionId}:${factType}`);
}

function factVersionIdForFact(factId: string, version: number): string {
  return deterministicUuid(`preppy:fact-version:${factId}:${version}`);
}

function factVersionEvidenceId(
  factVersionId: string,
  sourceId: string,
): string {
  return deterministicUuid(
    `preppy:fact-version-evidence:${factVersionId}:${sourceId}`,
  );
}

function opportunityIdForInstitution(
  institutionId: string,
  slug: string,
): string {
  return deterministicUuid(`preppy:opportunity:${institutionId}:${slug}`);
}

function opportunityVersionId(opportunityId: string, version: number): string {
  return deterministicUuid(
    `preppy:opportunity-version:${opportunityId}:${version}`,
  );
}

function opportunityVersionEvidenceId(
  opportunityVersionId: string,
  sourceId: string,
): string {
  return deterministicUuid(
    `preppy:opportunity-version-evidence:${opportunityVersionId}:${sourceId}`,
  );
}

function registryIdentityId(
  registryName: string,
  registryExternalId: string,
): string {
  return deterministicUuid(
    `preppy:registry-identity:${registryName}:${registryExternalId}`,
  );
}

/**
 * Plans an international school import by comparing the package against
 * the current database state.
 */
export async function planInternationalSchoolImport(
  executor: ReadOnlyDatabaseExecutor,
  pkg: InternationalSchoolImportPackage,
): Promise<InternationalSchoolImportPlan> {
  const validation = validateInternationalSchoolPackage(pkg);
  if (validation.status !== "PASS") {
    return {
      applyAllowed: false,
      packageId: pkg.snapshot.packageId,
      packageChecksum: packageChecksum(pkg),
      created: emptyCounts(),
      updated: emptyCounts(),
      unchanged: emptyCounts(),
      ignored: {
        specialAccess: pkg.specialAccess?.length ?? 0,
        candidates: pkg.candidates?.length ?? 0,
        socialEvidence: pkg.socialEvidence?.length ?? 0,
      },
      rejects: [
        {
          code: "INVALID_PACKAGE",
          key: "package",
          message: validation.errors.join("; "),
        },
      ],
      warnings: [],
      sideEffects: {
        outboxEvents: 0,
        notifications: 0,
        deliveries: 0,
        meaningfulChanges: 0,
        opportunityChanges: 0,
      },
      actions: emptyActions(),
    };
  }

  const created = emptyCounts();
  const updated = emptyCounts();
  const unchanged = emptyCounts();
  const rejects: InternationalSchoolImportReject[] = [];
  const warnings: InternationalSchoolImportWarning[] = [];
  const actions = emptyActions();

  // Query existing institutions with ISI identities
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
      on identity.institution_id = i.id
      and identity.registry_name = 'ISI'
    where i.category = 'INTERNATIONAL_SCHOOL'
  `)) as unknown as ExistingInstitutionRow[];

  const existingByRegistryId = new Map<string, ExistingInstitutionRow>();
  const existingBySlug = new Map<string, ExistingInstitutionRow>();
  const existingByHost = new Map<string, ExistingInstitutionRow[]>();

  for (const row of existingRows) {
    if (row.registryExternalId) {
      existingByRegistryId.set(row.registryExternalId, row);
    }
    existingBySlug.set(row.slug, row);
    if (row.websiteUrl) {
      try {
        const host = new URL(row.websiteUrl).hostname.toLowerCase();
        const list = existingByHost.get(host) ?? [];
        list.push(row);
        existingByHost.set(host, list);
      } catch {
        // Invalid URL, skip
      }
    }
  }

  // Build evidence lookup
  const evidenceById = new Map(
    pkg.evidence.map((ev) => [ev.evidenceId, ev]),
  );

  // Process only OFFICIAL institutions (sorted by ISI number for determinism)
  const officialInstitutions = pkg.institutions
    .filter((inst) => inst.status === "OFFICIAL")
    .sort((a, b) => isiNumber(a.registryExternalId) - isiNumber(b.registryExternalId));

  for (const inst of officialInstitutions) {
    const institutionId = institutionIdForRegistryIdentity(
      "ISI",
      inst.registryExternalId,
    );

    const desired: InstitutionAction["desired"] = {
      id: institutionId,
      slug: inst.slug,
      displayName: inst.canonicalNameKo,
      category: "INTERNATIONAL_SCHOOL",
      internationalSubtype: "FOREIGN_SCHOOL",
      operationalState: "ACTIVE",
      publicationState: "DRAFT",
      regionCode: inst.regionCode,
      city: inst.city,
      district: inst.district,
      addressLine: inst.addressLine,
      websiteUrl: inst.websiteUrl,
      shortDescription: null,
      publishedAt: null,
      archivedAt: null,
    };

    const existing = existingByRegistryId.get(inst.registryExternalId);
    let operation: Operation = "CREATE";

    if (existing) {
      // Check for identity collision (different institution ID)
      if (existing.id !== institutionId) {
        rejects.push({
          code: "ISI_IDENTITY_COLLISION",
          key: inst.registryExternalId,
          message: `ISI identity ${inst.registryExternalId} is attached to institution ${existing.id} instead of deterministic ${institutionId}`,
        });
        continue;
      }

      // Check for publication state collision
      if (existing.publicationState !== "DRAFT") {
        rejects.push({
          code: "PUBLICATION_STATE_COLLISION",
          key: inst.registryExternalId,
          message: `Institution ${existing.id} has publication state ${existing.publicationState}, not DRAFT`,
        });
        continue;
      }

      // Check for material field collision
      if (!materialMatches(existing, desired)) {
        rejects.push({
          code: "MATERIAL_FIELD_COLLISION",
          key: inst.registryExternalId,
          message: `Institution ${existing.id} has material differences from import package`,
        });
        continue;
      }

      operation = "NONE";
    } else {
      // Check for possible identity collision by name/domain
      const host = new URL(inst.websiteUrl).hostname.toLowerCase();
      const similarByHost = existingByHost.get(host) ?? [];
      for (const similar of similarByHost) {
        if (
          similar.displayName === inst.canonicalNameKo ||
          sameHost(similar.websiteUrl, inst.websiteUrl)
        ) {
          warnings.push({
            code: "POSSIBLE_IDENTITY_COLLISION",
            key: inst.registryExternalId,
            message: `Institution ${similar.id} shares name or domain with ${inst.registryExternalId}`,
          });
          break;
        }
      }
    }

    count(operation, "institutions", created, updated, unchanged);
    (actions.institutions as InstitutionAction[]).push({
      operation,
      key: inst.registryExternalId,
      desired,
      institutionId,
      registryExternalId: inst.registryExternalId,
    });

    // Registry identity
    const identityOperation: Operation = existing?.identityId ? "NONE" : "CREATE";
    count(identityOperation, "registryIdentities", created, updated, unchanged);
    (actions.registryIdentities as RegistryIdentityAction[]).push({
      operation: identityOperation,
      key: `ISI:${inst.registryExternalId}`,
      desired: {
        id: registryIdentityId("ISI", inst.registryExternalId),
        institutionId,
        registryName: "ISI",
        registryExternalId: inst.registryExternalId,
        registryRecordUrl: inst.registryRecordUrl,
        registryLocator: inst.registryExternalId,
        metadataJson: { packageId: pkg.snapshot.packageId },
      },
      institutionId,
      registryExternalId: inst.registryExternalId,
    });

    // Find evidence for this institution
    const instEvidence = pkg.evidence.filter(
      (ev) => ev.institutionRef === inst.institutionRef,
    );

    // Create sources, snapshots, observations, and bindings for evidence
    const processedSourceUrls = new Set<string>();
    for (const ev of instEvidence) {
      if (processedSourceUrls.has(ev.sourceUrl)) continue;
      processedSourceUrls.add(ev.sourceUrl);

      const sourceId = sourceIdForUrl(ev.sourceUrl);
      const snapshotId = snapshotIdForEvidence(ev.evidenceId);
      const observationRef = observationRefForEvidence(ev.evidenceId);

      // Source
      count("CREATE", "sources", created, updated, unchanged);
      (actions.sources as SourceAction[]).push({
        operation: "CREATE",
        key: ev.sourceUrl,
        desired: {
          id: sourceId,
          canonicalUrl: ev.sourceUrl,
          sourceType: ev.sourceType,
          authorityLevel: "PRIMARY",
          lifecycleStatus: "ACTIVE",
          sourceName: `${inst.canonicalNameKo} ${ev.field}`,
          requiresJs: false,
          contentTypeHint: "text/html",
        },
      });

      // Snapshot
      count("CREATE", "snapshots", created, updated, unchanged);
      (actions.snapshots as SnapshotAction[]).push({
        operation: "CREATE",
        key: ev.evidenceId,
        desired: {
          id: snapshotId,
          sourceId,
          capturedAt: new Date(ev.capturedAt),
          contentHash: ev.contentHash,
          textHash: ev.textHash,
          normalizedText: ev.normalizedText,
          rawStorageKey: null,
          rawBody: null,
          mimeType: "text/html",
          metadata: ev.metadata,
        },
      });

      // Observation
      count("CREATE", "observations", created, updated, unchanged);
      (actions.observations as ObservationAction[]).push({
        operation: "CREATE",
        key: observationRef,
        desired: {
          sourceId,
          observationRef,
          observedAt: new Date(ev.capturedAt),
          outcome: observationOutcome(ev),
          finalUrl: ev.sourceUrl,
          contentHash: ev.contentHash,
          textHash: ev.textHash,
          snapshotId,
          errorCode: null,
          errorMessage: null,
          metadata: ev.metadata,
        },
      });

      // Binding
      count("CREATE", "bindings", created, updated, unchanged);
      (actions.bindings as BindingAction[]).push({
        operation: "CREATE",
        key: `${institutionId}:${sourceId}`,
        desired: {
          institutionId,
          sourceId,
          role: sourceRole(ev),
          isPrimary: ev.field === "IDENTITY",
          isActive: true,
          unboundAt: null,
        },
      });
    }

    // Create coverages for this institution
    const instCoverages = pkg.coverages.filter(
      (cov) => cov.institutionRef === inst.institutionRef,
    );
    for (const cov of instCoverages) {
      const sourceEv = cov.sourceEvidenceId
        ? evidenceById.get(cov.sourceEvidenceId)
        : null;

      count("CREATE", "coverages", created, updated, unchanged);
      (actions.coverages as CoverageAction[]).push({
        operation: "CREATE",
        key: `${institutionId}:${cov.section}`,
        desired: {
          institutionId,
          section: cov.section,
          status: cov.status,
          sourceId: sourceEv ? sourceIdForUrl(sourceEv.sourceUrl) : null,
          sourceSnapshotId: sourceEv
            ? snapshotIdForEvidence(sourceEv.evidenceId)
            : null,
          academicYearLabel: cov.academicYearLabel,
          publicNote: cov.publicNote,
          internalNote: cov.internalNote,
          lastCollectedAt: cov.lastCollectedAt
            ? new Date(cov.lastCollectedAt)
            : null,
          lastCheckedAt: new Date(cov.lastCheckedAt),
        },
      });
    }
  }

  // Process facts
  for (const fact of pkg.facts) {
    const inst = pkg.institutions.find(
      (i) => i.institutionRef === fact.institutionRef,
    );
    if (!inst || inst.status !== "OFFICIAL") continue;

    const institutionId = institutionIdForRegistryIdentity(
      "ISI",
      inst.registryExternalId,
    );
    const factId = factIdForInstitution(institutionId, fact.factType);
    const versionId = factVersionIdForFact(factId, 1);

    count("CREATE", "facts", created, updated, unchanged);
    (actions.facts as FactAction[]).push({
      operation: "CREATE",
      key: `${institutionId}:${fact.factType}`,
      desired: {
        id: factId,
        institutionId,
        factType: fact.factType,
      },
    });

    count("CREATE", "factVersions", created, updated, unchanged);
    (actions.factVersions as FactVersionAction[]).push({
      operation: "CREATE",
      key: `${factId}:1`,
      desired: {
        id: versionId,
        institutionFactId: factId,
        versionNumber: 1,
        supersedesVersionId: null,
        verificationState: "VERIFIED",
        isCurrent: true,
        valueJson: fact.valueJson,
        displayText: fact.displayText,
        verifiedAt: new Date(fact.verifiedAt),
        validFrom: null,
        validUntil: null,
      },
    });

    // Create evidence links for facts
    for (const evidenceId of fact.evidenceIds) {
      const ev = evidenceById.get(evidenceId);
      if (!ev) continue;

      const sourceId = sourceIdForUrl(ev.sourceUrl);
      const snapshotId = snapshotIdForEvidence(ev.evidenceId);
      const fveId = factVersionEvidenceId(versionId, sourceId);

      count("CREATE", "factVersionEvidence", created, updated, unchanged);
      (actions.factVersionEvidence as FactVersionEvidenceAction[]).push({
        operation: "CREATE",
        key: `${versionId}:${sourceId}`,
        desired: {
          id: fveId,
          institutionFactVersionId: versionId,
          sourceId,
          sourceObservationRef: observationRefForEvidence(ev.evidenceId),
          sourceSnapshotId: snapshotId,
          evidenceRole: "primary",
        },
      });
    }
  }

  // Process opportunities
  for (const opp of pkg.opportunities) {
    const inst = pkg.institutions.find(
      (i) => i.institutionRef === opp.institutionRef,
    );
    if (!inst || inst.status !== "OFFICIAL") continue;

    const institutionId = institutionIdForRegistryIdentity(
      "ISI",
      inst.registryExternalId,
    );
    const oppId = opportunityIdForInstitution(institutionId, opp.slug);
    const versionId = opportunityVersionId(oppId, 1);

    count("CREATE", "opportunities", created, updated, unchanged);
    (actions.opportunities as OpportunityAction[]).push({
      operation: "CREATE",
      key: `${institutionId}:${opp.slug}`,
      desired: {
        id: oppId,
        institutionId,
        slug: opp.slug,
        kind: opp.kind,
        truthMode: "NATIVE",
        publicationState: "DRAFT",
        publishedAt: null,
        archivedAt: null,
      },
    });

    const sourceEvidenceIds: string[] = [];
    for (const evidenceId of opp.evidenceIds) {
      const ev = evidenceById.get(evidenceId);
      if (!ev) continue;
      const sourceId = sourceIdForUrl(ev.sourceUrl);
      const oveId = opportunityVersionEvidenceId(versionId, sourceId);
      sourceEvidenceIds.push(oveId);
    }

    count("CREATE", "opportunityVersions", created, updated, unchanged);
    (actions.opportunityVersions as OpportunityVersionAction[]).push({
      operation: "CREATE",
      key: `${oppId}:1`,
      desired: {
        id: versionId,
        opportunityId: oppId,
        versionNumber: 1,
        supersedesVersionId: null,
        verificationState: "VERIFIED",
        isCurrent: true,
        title: opp.title,
        businessState: opp.businessState,
        eventStartsAt: opp.eventStartsAt ? new Date(opp.eventStartsAt) : null,
        applicationClosesAt: opp.applicationClosesAt
          ? new Date(opp.applicationClosesAt)
          : null,
        actionUrl: opp.actionUrl,
        verifiedAt: new Date(opp.verifiedAt),
      },
      sourceEvidenceIds,
    });

    // Create evidence links for opportunities
    for (const evidenceId of opp.evidenceIds) {
      const ev = evidenceById.get(evidenceId);
      if (!ev) continue;

      const sourceId = sourceIdForUrl(ev.sourceUrl);
      const snapshotId = snapshotIdForEvidence(ev.evidenceId);
      const oveId = opportunityVersionEvidenceId(versionId, sourceId);

      count(
        "CREATE",
        "opportunityVersionEvidence",
        created,
        updated,
        unchanged,
      );
      (
        actions.opportunityVersionEvidence as OpportunityVersionEvidenceAction[]
      ).push({
        operation: "CREATE",
        key: `${versionId}:${sourceId}`,
        desired: {
          id: oveId,
          opportunityVersionId: versionId,
          sourceId,
          sourceObservationRef: observationRefForEvidence(ev.evidenceId),
          sourceSnapshotId: snapshotId,
          evidenceRole: "primary",
        },
      });
    }
  }

  return {
    applyAllowed: rejects.length === 0,
    packageId: pkg.snapshot.packageId,
    packageChecksum: packageChecksum(pkg),
    created,
    updated,
    unchanged,
    ignored: {
      specialAccess: pkg.specialAccess?.length ?? 0,
      candidates: pkg.candidates?.length ?? 0,
      socialEvidence: pkg.socialEvidence?.length ?? 0,
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
