import "server-only";

import { sql } from "drizzle-orm";

import type {
  DatabaseExecutor,
  TransactionManager,
} from "@/src/infrastructure/db/runtime.server";

import {
  PrivateElementaryBootstrapError,
  type PrivateElementaryBootstrapCliOptions,
  type PrivateElementaryBootstrapTarget,
} from "./contracts";
import {
  collectPrivateElementarySchool,
  createPrivateElementaryCollectionRuntime,
  type CollectedPrivateElementarySchool,
  type PrivateElementaryCollectionRuntime,
} from "./discovery.server";
import {
  persistPrivateElementarySchool,
  type BootstrapCreatedCounts,
  type BootstrapSideEffectDelta,
  type PersistedPrivateElementarySchool,
} from "./persistence.server";
import {
  inspectBootstrapSchema,
  type BootstrapSchemaCompatibility,
} from "./schema-preflight.server";
import { buildRegistryBaselineFacts } from "./fact-extractor";
import { isStaleAdmissionCycle } from "./admission-extractor";

export type ResolvedPrivateElementaryBootstrapTarget = Readonly<
  Omit<PrivateElementaryBootstrapTarget, "institutionId"> & {
    institutionId: string;
  }
>;

export type PrivateElementaryProductionInventoryRow = Readonly<{
  id: string;
  slug: string;
  displayName: string;
  category: string;
  publicationState: string;
}>;

export function resolvePrivateElementaryProductionTargetsFromInventory(
  allowlist: readonly PrivateElementaryBootstrapTarget[],
  inventory: readonly PrivateElementaryProductionInventoryRow[],
): readonly ResolvedPrivateElementaryBootstrapTarget[] {
  if (allowlist.length !== inventory.length) {
    throw new PrivateElementaryBootstrapError(
      "ALLOWLIST_REJECTED",
      "Production must contain the exact private elementary allowlist",
    );
  }
  const bySlug = new Map(inventory.map((row) => [row.slug, row]));
  if (bySlug.size !== inventory.length) {
    throw new PrivateElementaryBootstrapError(
      "ALLOWLIST_REJECTED",
      "Production private elementary slugs are not unique",
    );
  }
  const resolved = allowlist.map((target) => {
    const row = bySlug.get(target.slug);
    if (
      row === undefined ||
      row.displayName !== target.institutionName ||
      row.category !== "PRIVATE_ELEMENTARY" ||
      row.publicationState !== "PUBLISHED" ||
      (target.institutionId !== null && target.institutionId !== row.id)
    ) {
      throw new PrivateElementaryBootstrapError(
        "ALLOWLIST_REJECTED",
        "Production Institution differs from the exact private elementary allowlist",
      );
    }
    return Object.freeze({ ...target, institutionId: row.id });
  });
  if (
    new Set(resolved.map((target) => target.institutionId)).size !==
    resolved.length
  ) {
    throw new PrivateElementaryBootstrapError(
      "ALLOWLIST_REJECTED",
      "Production private elementary Institution identities are not unique",
    );
  }
  return Object.freeze(resolved);
}

export async function resolvePrivateElementaryProductionTargets(
  executor: DatabaseExecutor,
  allowlist: readonly PrivateElementaryBootstrapTarget[],
): Promise<readonly ResolvedPrivateElementaryBootstrapTarget[]> {
  const inventory = (await executor.raw(sql`
    select id, slug, display_name as "displayName", category,
      publication_state as "publicationState"
    from institutions
    where category='PRIVATE_ELEMENTARY'
    order by slug, id
  `)) as unknown as PrivateElementaryProductionInventoryRow[];
  return resolvePrivateElementaryProductionTargetsFromInventory(
    allowlist,
    inventory,
  );
}

type SchoolRecordStatus =
  "DRY_RUN_READY" | "PERSISTED" | "SCHOOL_FETCH_FAILED" | "PERSISTENCE_FAILED";

export type PrivateElementaryBootstrapSchoolRecord = Readonly<{
  slug: string;
  name: string;
  institutionId: string;
  status: SchoolRecordStatus;
  registryBootstrap: "SUCCESS" | "FAILED" | null;
  websiteCollection: "SUCCESS" | "PARTIAL" | "FETCH_FAILED";
  admissionKnowledge:
    | "SCHEDULE_FOUND"
    | "GUIDANCE_FOUND"
    | "NOT_ANNOUNCED"
    | "NOT_FOUND"
    | "FETCH_FAILED";
  admissionPublicationEligible: boolean;
  pagesFetched: number;
  pagesScheduled: number;
  candidateUrls: readonly string[];
  selectedAdmissionUrl: string | null;
  academicYear: string | null;
  knowledgeState:
    | "SCHEDULE_FOUND"
    | "GUIDANCE_FOUND"
    | "NOT_ANNOUNCED"
    | "NOT_FOUND"
    | "FETCH_FAILED";
  factsExtracted: readonly Readonly<{
    factType: string;
    displayText: string;
    sourceUrl: string;
    evidenceExcerpt: string;
  }>[];
  officialSources: readonly string[];
  admission: Readonly<{
    title: string;
    kind: string;
    businessState: string;
    summary: string | null;
    targetAudience: string | null;
    applicationOpenAt: string | null;
    applicationCloseAt: string | null;
    eventStartAt: string | null;
    eventEndAt: string | null;
    collectedAt: string;
    verifiedAt: string | null;
    evidenceExcerpt: string;
  }> | null;
  created: BootstrapCreatedCounts | null;
  ids: Readonly<{
    factVersionIds: readonly string[];
    opportunityId: string | null;
    opportunityVersionId: string | null;
  }> | null;
  sideEffectDelta: BootstrapSideEffectDelta | null;
  warnings: readonly string[];
  errors: readonly string[];
}>;

export type PrivateElementaryBootstrapReport = Readonly<{
  mode: "dry-run" | "apply";
  applied: boolean;
  totalSchools: number;
  selectedSchools: number;
  attempted: number;
  registryBootstrap: Readonly<{ succeeded: number; failed: number }>;
  websiteCollection: Readonly<{
    succeeded: number;
    partial: number;
    failed: number;
  }>;
  schoolsWithBaselineFacts: number;
  fetchSucceeded: number;
  fetchFailed: number;
  readyToPersist: number;
  persisted: number;
  failed: number;
  schoolsWithFacts: number;
  factCounts: Readonly<Record<string, number>>;
  admissions: Readonly<{
    SCHEDULE_FOUND: number;
    GUIDANCE_FOUND: number;
    NOT_ANNOUNCED: number;
    NOT_FOUND: number;
    FETCH_FAILED: number;
  }>;
  academicYears: Readonly<Record<string, number>>;
  created: BootstrapCreatedCounts;
  sideEffects: Readonly<{
    outboxEvents: number;
    notifications: number;
    deliveries: number;
    deliveryAttempts: number;
    meaningfulChanges: number;
    opportunityChanges: number;
  }>;
  schema: BootstrapSchemaCompatibility;
  records: readonly PrivateElementaryBootstrapSchoolRecord[];
  exitCode: 0 | 1;
}>;

type RunnerDependencies = Readonly<{
  executor: DatabaseExecutor;
  transactionManager: TransactionManager;
  allowlist: readonly PrivateElementaryBootstrapTarget[];
  schemaCompatibility?: BootstrapSchemaCompatibility;
  resolvedTargets?: readonly ResolvedPrivateElementaryBootstrapTarget[];
  collectionRuntime?: PrivateElementaryCollectionRuntime;
  collect?: typeof collectPrivateElementarySchool;
  persist?: typeof persistPrivateElementarySchool;
  now?: () => Date;
}>;

function zeroCreated(): BootstrapCreatedCounts {
  return Object.freeze({
    sources: 0,
    bindings: 0,
    snapshots: 0,
    observations: 0,
    facts: 0,
    factVersions: 0,
    factEvidence: 0,
    opportunities: 0,
    opportunityVersions: 0,
    opportunityEvidence: 0,
    opportunityBindings: 0,
  });
}

function zeroSideEffects(): BootstrapSideEffectDelta {
  return Object.freeze({
    outboxEvents: 0,
    notifications: 0,
    deliveries: 0,
    deliveryAttempts: 0,
    meaningfulChanges: 0,
    opportunityChanges: 0,
  });
}

function safeErrorCode(error: unknown): string {
  return error instanceof PrivateElementaryBootstrapError
    ? error.code
    : "UNEXPECTED_FAILURE";
}

function iso(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

function recordFromCollection(
  collection: CollectedPrivateElementarySchool,
  status: SchoolRecordStatus,
  persisted: PersistedPrivateElementarySchool | null,
  errorCode?: string,
): PrivateElementaryBootstrapSchoolRecord {
  const admission = collection.admission;
  const knowledgeState =
    collection.status === "SCHOOL_FETCH_FAILED"
      ? ("FETCH_FAILED" as const)
      : (admission?.proposal.knowledgeState ?? "NOT_FOUND");
  const stale = isStaleAdmissionCycle(
    admission?.proposal.academicYearLabel ?? null,
  );
  const baselinePrepared = collection.facts.some(
    (fact) =>
      fact.factType === "OPERATING_INFO" &&
      fact.sourceUrl === collection.target.registryUrl,
  );
  return Object.freeze({
    slug: collection.target.slug,
    name: collection.target.institutionName,
    institutionId: collection.target.institutionId!,
    status,
    registryBootstrap: baselinePrepared
      ? status === "PERSISTENCE_FAILED"
        ? ("FAILED" as const)
        : ("SUCCESS" as const)
      : errorCode === "REGISTRY_BASELINE_INVALID"
        ? ("FAILED" as const)
        : null,
    websiteCollection:
      collection.status === "SCHOOL_FETCH_FAILED"
        ? ("FETCH_FAILED" as const)
        : collection.partialFetchWarning
          ? ("PARTIAL" as const)
          : ("SUCCESS" as const),
    admissionKnowledge: knowledgeState,
    admissionPublicationEligible:
      admission !== null && !stale && collection.status === "COLLECTED",
    pagesFetched: collection.pagesFetched,
    pagesScheduled: collection.pagesScheduled,
    candidateUrls: Object.freeze(collection.candidateUrls.slice(0, 60)),
    selectedAdmissionUrl: admission?.sourceUrl ?? null,
    academicYear: admission?.proposal.academicYearLabel ?? null,
    knowledgeState,
    factsExtracted: Object.freeze(
      collection.facts.map((fact) =>
        Object.freeze({
          factType: fact.factType,
          displayText: fact.displayText,
          sourceUrl: fact.sourceUrl,
          evidenceExcerpt: fact.evidenceExcerpt,
        }),
      ),
    ),
    officialSources: Object.freeze([
      ...new Set([
        ...collection.pages.map((page) => page.url),
        ...collection.facts.map((fact) => fact.sourceUrl),
      ]),
    ]),
    admission:
      admission === null
        ? null
        : Object.freeze({
            title: admission.proposal.title,
            kind: admission.proposal.kind,
            businessState: admission.proposal.businessState,
            summary: admission.proposal.summary,
            targetAudience: admission.proposal.targetAudience,
            applicationOpenAt: iso(admission.proposal.applicationOpenAt),
            applicationCloseAt: iso(admission.proposal.applicationCloseAt),
            eventStartAt: iso(admission.proposal.eventStartAt),
            eventEndAt: iso(admission.proposal.eventEndAt),
            collectedAt: admission.collectedAt.toISOString(),
            verifiedAt: persisted?.admissionVerifiedAt ?? null,
            evidenceExcerpt: admission.proposal.evidenceExcerpt,
          }),
    created: persisted?.created ?? null,
    ids:
      persisted === null
        ? null
        : Object.freeze({
            factVersionIds: persisted.factVersionIds,
            opportunityId: persisted.opportunityId,
            opportunityVersionId: persisted.opportunityVersionId,
          }),
    sideEffectDelta: persisted?.sideEffectDelta ?? null,
    warnings: Object.freeze([
      ...new Set([
        ...collection.warnings,
        ...(stale ? ["STALE_ADMISSION_CYCLE_NOT_PUBLISHED"] : []),
      ]),
    ]),
    errors: Object.freeze([
      ...collection.errors,
      ...(errorCode === undefined ? [] : [errorCode]),
    ]),
  });
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T) => Promise<R>,
): Promise<readonly R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= values.length) return;
        results[index] = await operation(values[index]!);
      }
    },
  );
  await Promise.all(workers);
  return Object.freeze(results);
}

function addCreated(
  target: Record<keyof BootstrapCreatedCounts, number>,
  source: BootstrapCreatedCounts,
): void {
  for (const key of Object.keys(source) as Array<
    keyof BootstrapCreatedCounts
  >) {
    target[key] += source[key];
  }
}

function addSideEffects(
  target: Record<keyof BootstrapSideEffectDelta, number>,
  source: BootstrapSideEffectDelta,
): void {
  for (const key of Object.keys(source) as Array<
    keyof BootstrapSideEffectDelta
  >) {
    target[key] += source[key];
  }
}

export async function runPrivateElementaryBootstrap(
  options: PrivateElementaryBootstrapCliOptions,
  dependencies: RunnerDependencies,
): Promise<PrivateElementaryBootstrapReport> {
  const schema =
    dependencies.schemaCompatibility ??
    (await inspectBootstrapSchema(dependencies.executor));
  if (!schema.compatible) {
    throw new PrivateElementaryBootstrapError(
      "SCHEMA_BLOCKED",
      "Production schema lacks a required existing bootstrap capability",
    );
  }
  const resolved =
    dependencies.resolvedTargets ??
    (await resolvePrivateElementaryProductionTargets(
      dependencies.executor,
      dependencies.allowlist,
    ));
  const selected =
    options.slug === null
      ? resolved
      : resolved.filter((target) => target.slug === options.slug);
  if (selected.length < 1) {
    throw new PrivateElementaryBootstrapError(
      "ALLOWLIST_REJECTED",
      "Selected slug is outside the exact private elementary allowlist",
    );
  }
  const runtime =
    dependencies.collectionRuntime ??
    createPrivateElementaryCollectionRuntime();
  const collect = dependencies.collect ?? collectPrivateElementarySchool;
  const persist = dependencies.persist ?? persistPrivateElementarySchool;
  const records = await mapWithConcurrency(selected, 3, async (target) => {
    let collection: CollectedPrivateElementarySchool;
    try {
      collection = await collect(
        { target, work: options.work },
        { runtime, ...(dependencies.now ? { now: dependencies.now } : {}) },
      );
    } catch (error) {
      collection = Object.freeze({
        target,
        status: "SCHOOL_FETCH_FAILED" as const,
        partialFetchWarning: false,
        pagesScheduled: 0,
        pagesFetched: 0,
        candidateUrls: Object.freeze([]),
        pages: Object.freeze([]),
        facts: Object.freeze([]),
        admission: null,
        warnings: Object.freeze([]),
        errors: Object.freeze([safeErrorCode(error)]),
      });
    }
    // Registry evidence is independent of HTTP success; preparation stays outside the transaction.
    if (options.work !== "admissions") {
      try {
        const baseline = buildRegistryBaselineFacts(target);
        const baselineTypes = new Set(baseline.map((fact) => fact.factType));
        collection = Object.freeze({
          ...collection,
          facts: Object.freeze([
            ...baseline,
            ...collection.facts.filter(
              (fact) => !baselineTypes.has(fact.factType),
            ),
          ]),
        });
      } catch {
        return recordFromCollection(
          collection,
          "PERSISTENCE_FAILED",
          null,
          "REGISTRY_BASELINE_INVALID",
        );
      }
    }
    if (
      collection.status === "SCHOOL_FETCH_FAILED" &&
      collection.facts.length === 0
    ) {
      return recordFromCollection(collection, "SCHOOL_FETCH_FAILED", null);
    }
    if (options.mode === "dry-run") {
      return recordFromCollection(collection, "DRY_RUN_READY", null);
    }
    try {
      const result = await persist(collection, {
        transactionManager: dependencies.transactionManager,
        supportsOfficialRegistrySourceType:
          schema.supportsOfficialRegistrySourceType,
        supportsRegistryIdentityBindingRole:
          schema.supportsRegistryIdentityBindingRole,
        ...(dependencies.now ? { now: dependencies.now } : {}),
      });
      return recordFromCollection(collection, "PERSISTED", result);
    } catch (error) {
      return recordFromCollection(
        collection,
        "PERSISTENCE_FAILED",
        null,
        safeErrorCode(error),
      );
    }
  });

  const factCounts: Record<string, number> = {};
  const admissions = {
    SCHEDULE_FOUND: 0,
    GUIDANCE_FOUND: 0,
    NOT_ANNOUNCED: 0,
    NOT_FOUND: 0,
    FETCH_FAILED: 0,
  };
  const academicYears: Record<string, number> = { staleSkipped: 0, unknown: 0 };
  const created = { ...zeroCreated() };
  const sideEffects = { ...zeroSideEffects() };
  for (const record of records) {
    for (const fact of record.factsExtracted) {
      factCounts[fact.factType] = (factCounts[fact.factType] ?? 0) + 1;
    }
    admissions[record.knowledgeState] += 1;
    const year = isStaleAdmissionCycle(record.academicYear)
      ? "staleSkipped"
      : (record.academicYear ?? "unknown");
    academicYears[year] = (academicYears[year] ?? 0) + 1;
    if (record.created !== null) addCreated(created, record.created);
    if (record.sideEffectDelta !== null) {
      addSideEffects(sideEffects, record.sideEffectDelta);
    }
  }
  const failed = records.filter((record) =>
    ["SCHOOL_FETCH_FAILED", "PERSISTENCE_FAILED"].includes(record.status),
  ).length;
  const websiteFetchFailed = records.filter(
    (record) => record.websiteCollection === "FETCH_FAILED",
  ).length;
  return Object.freeze({
    mode: options.mode,
    applied: options.mode === "apply",
    totalSchools: dependencies.allowlist.length,
    selectedSchools: selected.length,
    attempted: records.length,
    registryBootstrap: Object.freeze({
      succeeded: records.filter(
        (record) => record.registryBootstrap === "SUCCESS",
      ).length,
      failed: records.filter((record) => record.registryBootstrap === "FAILED")
        .length,
    }),
    websiteCollection: Object.freeze({
      succeeded: records.length - websiteFetchFailed,
      partial: records.filter(
        (record) => record.websiteCollection === "PARTIAL",
      ).length,
      failed: websiteFetchFailed,
    }),
    schoolsWithBaselineFacts: records.filter(
      (record) => record.registryBootstrap === "SUCCESS",
    ).length,
    fetchSucceeded: records.length - websiteFetchFailed,
    fetchFailed: websiteFetchFailed,
    readyToPersist: records.filter(
      (record) => record.status === "DRY_RUN_READY",
    ).length,
    persisted: records.filter((record) => record.status === "PERSISTED").length,
    failed,
    schoolsWithFacts: records.filter(
      (record) => record.factsExtracted.length > 0,
    ).length,
    factCounts: Object.freeze(factCounts),
    admissions: Object.freeze(admissions),
    academicYears: Object.freeze(academicYears),
    created: Object.freeze(created),
    sideEffects: Object.freeze(sideEffects),
    schema,
    records,
    // Preserve the operator-visible non-zero outcome for incomplete web collection, without undoing baseline writes.
    exitCode:
      failed === 0 && websiteFetchFailed === 0 ? (0 as const) : (1 as const),
  });
}
