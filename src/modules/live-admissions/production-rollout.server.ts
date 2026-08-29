import "server-only";

import { readFile } from "node:fs/promises";

import { sql } from "drizzle-orm";

import { parseRuntimeDatabaseEnv } from "@/src/config/runtime-env";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
  type DatabaseExecutor,
  type RuntimeDatabaseResources,
  type TransactionManager,
} from "@/src/infrastructure/db/runtime.server";
import { EXPECTED_REPOSITORY_MIGRATIONS } from "@/src/modules/production-safety/migration-manifest";
import { normalizeDiscoveryUrl } from "@/src/modules/http-collector/url-policy";

import {
  loadCollectedHtml,
  parseLiveAdmissionReviewManifest,
  proposalReport,
  type LiveAdmissionReviewManifest,
} from "./cli.server";
import {
  collectReviewedAdmissionSource,
  type ReviewedAdmissionCollection,
} from "./collection.server";
import { extractLiveAdmissionProposal } from "./extractor";
import {
  prepareLiveAdmissionDraft,
  liveAdmissionContentFingerprint,
} from "./preparation.server";
import {
  PRODUCTION_FIVE_SCHOOL_TARGETS,
  ProductionFiveSchoolRolloutError,
  assertProductionFiveSchoolEnvironment,
  parseProductionFiveSchoolCliArgs,
  type ProductionFiveSchoolCliOptions,
  type ProductionFiveSchoolTarget,
} from "./production-contract";
import { reviewAndPublishLiveAdmissionDraft } from "./review.server";

type RolloutStage = "PREPARE" | "REVIEW";
export type ProductionSchoolRolloutState = Readonly<{
  institutionId: string;
  slug: string;
  institutionName: string;
  state: "ALREADY_PUBLISHED" | "READY" | "CONFLICT" | "BLOCKED";
  stage?: RolloutStage;
  reason?: string;
  rootSourceId?: string;
  opportunityId?: string;
  preparedVersionId?: string;
  currentVersionId?: string;
  evidenceId?: string;
  sourceId?: string;
  observationId?: string;
  snapshotId?: string;
}>;

type InstitutionRow = Readonly<{
  id: string;
  slug: string;
  displayName: string;
  publicationState: string;
}>;

type RootSourceRow = Readonly<{
  sourceId: string;
  canonicalUrl: string;
  sourceType: string;
  authorityLevel: string;
  lifecycleStatus: string;
}>;

type OpportunityRow = Readonly<{
  id: string;
  institutionId: string;
  publicationState: string;
  truthMode: string;
}>;

type VersionEvidenceRow = Readonly<{
  id: string;
  versionNumber: number;
  verificationState: string;
  isCurrent: boolean;
  contentFingerprint: string | null;
  evidenceId: string | null;
  sourceId: string | null;
  observationId: string | null;
  snapshotId: string | null;
  sourceCanonicalUrl: string | null;
  sourceType: string | null;
  authorityLevel: string | null;
  sourceLifecycle: string | null;
  bindingActive: boolean | null;
}>;

function opportunityNamespace(target: ProductionFiveSchoolTarget): string {
  return `live-admissions-${target.institutionId}-`;
}

function stateBase(target: ProductionFiveSchoolTarget) {
  return {
    institutionId: target.institutionId,
    slug: target.slug,
    institutionName: target.institutionName,
  } as const;
}

function fixedFailure(
  target: ProductionFiveSchoolTarget,
  state: "CONFLICT" | "BLOCKED",
  reason: string,
): ProductionSchoolRolloutState {
  return Object.freeze({ ...stateBase(target), state, reason });
}

function validEvidence(
  row: VersionEvidenceRow,
  target: ProductionFiveSchoolTarget,
): boolean {
  return (
    row.evidenceId !== null &&
    row.sourceId !== null &&
    row.observationId !== null &&
    row.snapshotId !== null &&
    row.sourceCanonicalUrl !== null &&
    normalizeDiscoveryUrl(row.sourceCanonicalUrl) ===
      normalizeDiscoveryUrl(target.admissionUrl) &&
    [
      "OFFICIAL_ADMISSION_PAGE",
      "OFFICIAL_NOTICE_BOARD",
      "OFFICIAL_APPLICATION_PORTAL",
      "OFFICIAL_SCHOOL_PAGE",
    ].includes(row.sourceType ?? "") &&
    ["PRIMARY", "SECONDARY_OFFICIAL"].includes(row.authorityLevel ?? "") &&
    row.sourceLifecycle === "ACTIVE" &&
    row.bindingActive === true
  );
}

export async function assertProductionRolloutMigrationReady(
  executor: DatabaseExecutor,
): Promise<void> {
  let rows: Array<{ hash: string }>;
  try {
    rows = (await executor.raw(sql`
      select hash from drizzle.__drizzle_migrations order by created_at, id
    `)) as unknown as Array<{ hash: string }>;
  } catch {
    throw new ProductionFiveSchoolRolloutError(
      "MIGRATION_BLOCKED",
      "Production migration ledger is unavailable",
    );
  }
  if (
    rows.length !== EXPECTED_REPOSITORY_MIGRATIONS.length ||
    rows.some(
      (migration, index) =>
        migration.hash !== EXPECTED_REPOSITORY_MIGRATIONS[index]?.hash,
    )
  ) {
    throw new ProductionFiveSchoolRolloutError(
      "MIGRATION_BLOCKED",
      "Production migration ledger does not match this repository",
    );
  }
}

export async function inspectProductionSchoolRolloutState(
  executor: DatabaseExecutor,
  target: ProductionFiveSchoolTarget,
): Promise<ProductionSchoolRolloutState> {
  const institutions = (await executor.raw(sql`
    select id, slug, display_name as "displayName",
      publication_state as "publicationState"
    from institutions
    where id=${target.institutionId} or slug=${target.slug}
    order by id
  `)) as unknown as InstitutionRow[];
  if (institutions.length === 0) {
    return fixedFailure(target, "BLOCKED", "INSTITUTION_NOT_SEEDED");
  }
  const institution = institutions[0]!;
  if (
    institutions.length !== 1 ||
    institution.id !== target.institutionId ||
    institution.slug !== target.slug ||
    institution.displayName !== target.institutionName
  ) {
    return fixedFailure(target, "CONFLICT", "INSTITUTION_IDENTITY_MISMATCH");
  }

  const roots = (await executor.raw(sql`
    select s.id as "sourceId", s.canonical_url as "canonicalUrl",
      s.source_type as "sourceType", s.authority_level as "authorityLevel",
      s.lifecycle_status as "lifecycleStatus"
    from institution_source_bindings b
    join sources s on s.id=b.source_id
    where b.institution_id=${target.institutionId}
      and b.role='OFFICIAL_MAIN' and b.is_primary=true and b.is_active=true
    order by s.id
  `)) as unknown as RootSourceRow[];
  if (roots.length === 0) {
    return fixedFailure(target, "BLOCKED", "OFFICIAL_MAIN_SOURCE_MISSING");
  }
  const root = roots[0]!;
  if (
    roots.length !== 1 ||
    root.lifecycleStatus !== "ACTIVE" ||
    root.authorityLevel !== "PRIMARY" ||
    root.sourceType !== "OFFICIAL_SCHOOL_PAGE"
  ) {
    return fixedFailure(target, "CONFLICT", "OFFICIAL_MAIN_SOURCE_CONFLICT");
  }

  const opportunities = (await executor.raw(sql`
    select id, institution_id as "institutionId",
      publication_state as "publicationState", truth_mode as "truthMode"
    from opportunities
    where institution_id=${target.institutionId}
      and left(slug, length(${opportunityNamespace(target)}))=${opportunityNamespace(target)}
    order by id
  `)) as unknown as OpportunityRow[];
  if (opportunities.length === 0) {
    if (institution.publicationState !== "DRAFT") {
      return fixedFailure(
        target,
        "CONFLICT",
        "PUBLISHED_INSTITUTION_WITHOUT_CANONICAL_OPPORTUNITY",
      );
    }
    return Object.freeze({
      ...stateBase(target),
      state: "READY" as const,
      stage: "PREPARE" as const,
      rootSourceId: root.sourceId,
    });
  }
  const opportunity = opportunities[0]!;
  if (
    opportunities.length !== 1 ||
    opportunity.institutionId !== target.institutionId ||
    opportunity.truthMode !== "NATIVE"
  ) {
    return fixedFailure(target, "CONFLICT", "OPPORTUNITY_IDENTITY_CONFLICT");
  }

  const versions = (await executor.raw(sql`
    select v.id, v.version_number as "versionNumber",
      v.verification_state as "verificationState", v.is_current as "isCurrent",
      v.content_fingerprint as "contentFingerprint", e.id as "evidenceId",
      e.source_id as "sourceId", e.source_observation_id::text as "observationId",
      e.source_snapshot_id as "snapshotId", s.canonical_url as "sourceCanonicalUrl",
      s.source_type as "sourceType", s.authority_level as "authorityLevel",
      s.lifecycle_status as "sourceLifecycle", ob.is_active as "bindingActive"
    from opportunity_versions v
    left join opportunity_version_evidence e on e.opportunity_version_id=v.id
    left join sources s on s.id=e.source_id
    left join opportunity_source_bindings ob
      on ob.opportunity_id=v.opportunity_id and ob.source_id=e.source_id
        and ob.is_active=true
    where v.opportunity_id=${opportunity.id}
    order by v.version_number, e.id
  `)) as unknown as VersionEvidenceRow[];

  if (
    institution.publicationState === "DRAFT" &&
    opportunity.publicationState === "DRAFT" &&
    versions.length === 1
  ) {
    const prepared = versions[0]!;
    if (
      prepared.versionNumber === 1 &&
      prepared.verificationState === "UNVERIFIED" &&
      prepared.isCurrent === false &&
      prepared.contentFingerprint !== null &&
      validEvidence(prepared, target)
    ) {
      return Object.freeze({
        ...stateBase(target),
        state: "READY" as const,
        stage: "REVIEW" as const,
        rootSourceId: root.sourceId,
        opportunityId: opportunity.id,
        preparedVersionId: prepared.id,
        evidenceId: prepared.evidenceId!,
        sourceId: prepared.sourceId!,
        observationId: prepared.observationId!,
        snapshotId: prepared.snapshotId!,
      });
    }
  }

  if (
    institution.publicationState === "PUBLISHED" &&
    opportunity.publicationState === "PUBLISHED" &&
    versions.length === 2
  ) {
    const prepared = versions.find((version) => version.versionNumber === 1);
    const current = versions.find((version) => version.versionNumber === 2);
    if (
      prepared?.verificationState === "SUPERSEDED" &&
      prepared.isCurrent === false &&
      current?.verificationState === "VERIFIED" &&
      current.isCurrent === true &&
      validEvidence(current, target)
    ) {
      return Object.freeze({
        ...stateBase(target),
        state: "ALREADY_PUBLISHED" as const,
        rootSourceId: root.sourceId,
        opportunityId: opportunity.id,
        preparedVersionId: prepared.id,
        currentVersionId: current.id,
        evidenceId: current.evidenceId!,
        sourceId: current.sourceId!,
        observationId: current.observationId!,
        snapshotId: current.snapshotId!,
      });
    }
  }
  return fixedFailure(target, "CONFLICT", "CANONICAL_LIVE_ADMISSION_CONFLICT");
}

type RolloutRuntimeDependencies = Readonly<{
  executor: DatabaseExecutor;
  transactionManager: TransactionManager;
  targets?: readonly ProductionFiveSchoolTarget[];
  collectReviewed?: typeof collectReviewedAdmissionSource;
  prepare?: typeof prepareLiveAdmissionDraft;
  review?: typeof reviewAndPublishLiveAdmissionDraft;
  loadHtml?: typeof loadCollectedHtml;
  readJsonFile?: (path: string) => Promise<unknown>;
  now?: () => Date;
}>;

async function inspectAll(
  executor: DatabaseExecutor,
  targets: readonly ProductionFiveSchoolTarget[],
): Promise<readonly ProductionSchoolRolloutState[]> {
  const states = [];
  for (const target of targets) {
    states.push(await inspectProductionSchoolRolloutState(executor, target));
  }
  return Object.freeze(states);
}

function assertWriteEligible(state: ProductionSchoolRolloutState): void {
  if (state.state === "BLOCKED") {
    throw new ProductionFiveSchoolRolloutError(
      "STATE_BLOCKED",
      "Selected production school is blocked by incomplete seed state",
    );
  }
  if (state.state === "CONFLICT") {
    throw new ProductionFiveSchoolRolloutError(
      "STATE_CONFLICT",
      "Selected production school has conflicting canonical state",
    );
  }
}

async function proposalForPreparedState(
  state: ProductionSchoolRolloutState,
  target: ProductionFiveSchoolTarget,
  dependencies: RolloutRuntimeDependencies,
) {
  if (
    !state.sourceId ||
    !state.observationId ||
    !state.snapshotId ||
    !state.preparedVersionId ||
    !state.opportunityId
  ) {
    throw new ProductionFiveSchoolRolloutError(
      "STATE_CONFLICT",
      "Prepared production state is incomplete",
    );
  }
  const html = await (dependencies.loadHtml ?? loadCollectedHtml)(
    dependencies.executor,
    {
      sourceId: state.sourceId,
      observationId: state.observationId,
      snapshotId: state.snapshotId,
    },
  );
  const proposal = extractLiveAdmissionProposal({
    html,
    sourceUrl: target.admissionUrl,
    classificationHint: target.classificationHint,
    targetAcademicYearLabel: target.targetAcademicYearLabel,
    referenceTime: dependencies.now?.() ?? new Date(),
  });
  return { proposal, state };
}

function reviewInputReport(
  target: ProductionFiveSchoolTarget,
  proposal: ReturnType<typeof extractLiveAdmissionProposal>,
  prepared: Readonly<{
    institutionId: string;
    opportunityId: string;
    versionId: string;
    contentFingerprint: string;
    sourceId: string;
    observationId: string;
    snapshotId: string;
  }>,
) {
  return Object.freeze({
    target: Object.freeze({
      slug: target.slug,
      institutionName: target.institutionName,
    }),
    reviewInput: Object.freeze({
      institutionId: prepared.institutionId,
      opportunityId: prepared.opportunityId,
      expectedVersionId: prepared.versionId,
      expectedContentFingerprint: prepared.contentFingerprint,
      sourceId: prepared.sourceId,
      observationId: prepared.observationId,
      snapshotId: prepared.snapshotId,
      approvedProposal: proposalReport(proposal),
    }),
  });
}

export async function runProductionFiveSchoolRollout(
  options: ProductionFiveSchoolCliOptions,
  dependencies: RolloutRuntimeDependencies,
) {
  const targets = dependencies.targets ?? PRODUCTION_FIVE_SCHOOL_TARGETS;
  await assertProductionRolloutMigrationReady(dependencies.executor);
  const before = await inspectAll(dependencies.executor, targets);
  if (options.mode === "inspect") {
    return Object.freeze({
      mode: "inspect" as const,
      migration: Object.freeze({
        status: "MATCH" as const,
        latest: EXPECTED_REPOSITORY_MIGRATIONS.at(-1)!.identifier,
      }),
      records: before,
    });
  }
  if (options.mode === "prepare") {
    const targetIndex = targets.findIndex(
      (target) => target.slug === options.slug,
    );
    const target = targets[targetIndex];
    const state = before[targetIndex];
    if (target === undefined || state === undefined) {
      throw new ProductionFiveSchoolRolloutError(
        "ALLOWLIST_REJECTED",
        "Selected production school is outside the five-school allowlist",
      );
    }
    assertWriteEligible(state);
    const records = [];
    if (state.state === "ALREADY_PUBLISHED") {
      records.push(Object.freeze({ target: target.slug, state }));
    } else if (state.stage === "REVIEW") {
      const existing = await proposalForPreparedState(
        state,
        target,
        dependencies,
      );
      const fingerprint = liveAdmissionContentFingerprint(existing.proposal);
      const [stored] = (await dependencies.executor.raw(sql`
        select content_fingerprint as "contentFingerprint"
        from opportunity_versions where id=${state.preparedVersionId!}
      `)) as unknown as Array<{ contentFingerprint: string | null }>;
      if (stored?.contentFingerprint !== fingerprint) {
        throw new ProductionFiveSchoolRolloutError(
          "STATE_CONFLICT",
          "Stored production proposal no longer matches its evidence",
        );
      }
      records.push(
        reviewInputReport(target, existing.proposal, {
          institutionId: target.institutionId,
          opportunityId: state.opportunityId!,
          versionId: state.preparedVersionId!,
          contentFingerprint: fingerprint,
          sourceId: state.sourceId!,
          observationId: state.observationId!,
          snapshotId: state.snapshotId!,
        }),
      );
    } else {
      const collection: ReviewedAdmissionCollection = await (
        dependencies.collectReviewed ?? collectReviewedAdmissionSource
      )(
        {
          institutionId: target.institutionId,
          rootSourceId: state.rootSourceId!,
          admissionUrl: target.admissionUrl,
          sourceName: target.sourceName,
          sourceType: target.sourceType,
          institutionBindingRole: target.institutionBindingRole,
        },
        {
          executor: dependencies.executor,
          transactionManager: dependencies.transactionManager,
        },
      );
      const html = await (dependencies.loadHtml ?? loadCollectedHtml)(
        dependencies.executor,
        collection,
      );
      const proposal = extractLiveAdmissionProposal({
        html,
        sourceUrl: collection.canonicalUrl,
        classificationHint: target.classificationHint,
        targetAcademicYearLabel: target.targetAcademicYearLabel,
        referenceTime: dependencies.now?.() ?? new Date(),
      });
      const prepared = await (
        dependencies.prepare ?? prepareLiveAdmissionDraft
      )(
        {
          institutionId: target.institutionId,
          sourceId: collection.sourceId,
          observationId: collection.observationId,
          snapshotId: collection.snapshotId,
          proposal,
        },
        {
          transactionManager: dependencies.transactionManager,
          ...(dependencies.now ? { now: dependencies.now } : {}),
        },
      );
      records.push(reviewInputReport(target, proposal, prepared));
    }
    return Object.freeze({
      mode: "prepare" as const,
      records: Object.freeze(records),
      after: await inspectAll(dependencies.executor, targets),
    });
  }

  if (options.mode !== "review") {
    throw new ProductionFiveSchoolRolloutError(
      "INVOCATION_REJECTED",
      "Production five-school rollout invocation rejected",
    );
  }
  const raw = await (
    dependencies.readJsonFile ??
    (async (path: string) =>
      JSON.parse(await readFile(path, "utf8")) as unknown)
  )(options.filePath);
  const manifest = parseLiveAdmissionReviewManifest(raw);
  const targetIndex = targets.findIndex(
    (target) => target.institutionId === manifest.institutionId,
  );
  const target = targets[targetIndex];
  if (
    target === undefined ||
    normalizeDiscoveryUrl(manifest.approvedProposal.actionUrl) !==
      normalizeDiscoveryUrl(target.admissionUrl)
  ) {
    throw new ProductionFiveSchoolRolloutError(
      "REVIEW_REJECTED",
      "Production review record is outside the five-school allowlist",
    );
  }
  const state = before[targetIndex]!;
  assertWriteEligible(state);
  if (state.state === "ALREADY_PUBLISHED") {
    if (
      state.opportunityId !== manifest.opportunityId ||
      state.preparedVersionId !== manifest.expectedVersionId ||
      state.sourceId !== manifest.sourceId
    ) {
      throw new ProductionFiveSchoolRolloutError(
        "REVIEW_REJECTED",
        "Already-published production state does not match the review record",
      );
    }
    return Object.freeze({ mode: "review" as const, state });
  }
  if (
    state.state !== "READY" ||
    state.stage !== "REVIEW" ||
    state.opportunityId !== manifest.opportunityId ||
    state.preparedVersionId !== manifest.expectedVersionId ||
    state.sourceId !== manifest.sourceId ||
    state.observationId !== manifest.observationId ||
    state.snapshotId !== manifest.snapshotId
  ) {
    throw new ProductionFiveSchoolRolloutError(
      "REVIEW_REJECTED",
      "Production review record does not match the prepared evidence chain",
    );
  }
  const reviewed = await (
    dependencies.review ?? reviewAndPublishLiveAdmissionDraft
  )(manifest, {
    transactionManager: dependencies.transactionManager,
    ...(dependencies.now ? { now: dependencies.now } : {}),
  });
  return Object.freeze({
    mode: "review" as const,
    reviewed,
    state: await inspectProductionSchoolRolloutState(
      dependencies.executor,
      target,
    ),
  });
}

export type ProductionFiveSchoolCliDependencies = Readonly<{
  environment?: Readonly<Record<string, string | undefined>>;
  openRuntime?: () => RuntimeDatabaseResources;
  closeRuntime?: typeof closeRuntimeDatabase;
  readJsonFile?: (path: string) => Promise<unknown>;
  now?: () => Date;
}>;

export async function runProductionFiveSchoolCli(
  arguments_: readonly string[],
  dependencies: ProductionFiveSchoolCliDependencies = {},
) {
  const options = parseProductionFiveSchoolCliArgs(arguments_);
  const environment = dependencies.environment ?? process.env;
  assertProductionFiveSchoolEnvironment(environment);
  const runtime =
    dependencies.openRuntime?.() ??
    getRuntimeDatabase(parseRuntimeDatabaseEnv(environment));
  try {
    return await runProductionFiveSchoolRollout(options, {
      executor: runtime.executor,
      transactionManager: runtime.transactionManager,
      ...(dependencies.readJsonFile
        ? { readJsonFile: dependencies.readJsonFile }
        : {}),
      ...(dependencies.now ? { now: dependencies.now } : {}),
    });
  } finally {
    await (dependencies.closeRuntime ?? closeRuntimeDatabase)();
  }
}

export type { LiveAdmissionReviewManifest };
