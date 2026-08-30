import "server-only";

import { sql } from "drizzle-orm";

import type {
  TransactionExecutor,
  TransactionManager,
} from "@/src/infrastructure/db/runtime.server";
import { normalizeDiscoveryUrl } from "@/src/modules/http-collector/url-policy";
import { liveAdmissionContentFingerprint } from "@/src/modules/live-admissions/preparation.server";

import { PrivateElementaryBootstrapError } from "./contracts";
import type {
  BootstrapEvidencePage,
  CollectedPrivateElementarySchool,
} from "./discovery.server";
import type { ExtractedInstitutionFact } from "./fact-extractor";
import { isStaleAdmissionCycle } from "./admission-extractor";
import type { CorrectionSchool } from "./correction.server";

export type SchoolTruthCorrection = Readonly<{
  admissions: readonly Readonly<{
    key: string;
    admission: NonNullable<CollectedPrivateElementarySchool["admission"]>;
    sourceUrls: readonly string[];
  }>[];
  factSourceUrls: Readonly<Record<string, readonly string[]>>;
  retireFacts: CorrectionSchool["retireFacts"];
}>;

type SourceType = BootstrapEvidencePage["sourceType"] | "OFFICIAL_REGISTRY";
type InstitutionBindingRole =
  | "OFFICIAL_MAIN"
  | "REGISTRY_IDENTITY"
  | "ADMISSIONS"
  | "TUITION"
  | "CURRICULUM"
  | "OTHER";

type SourceDefinition = Readonly<{
  canonicalUrl: string;
  sourceName: string;
  sourceType: SourceType;
  authorityLevel: "PRIMARY" | "SECONDARY_OFFICIAL";
  contentTypeHint: string | null;
}>;

type Provenance = Readonly<{
  sourceId: string;
  observationId: string | null;
  snapshotId: string | null;
}>;

export type BootstrapCreatedCounts = Readonly<{
  sources: number;
  bindings: number;
  snapshots: number;
  observations: number;
  facts: number;
  factVersions: number;
  factEvidence: number;
  opportunities: number;
  opportunityVersions: number;
  opportunityEvidence: number;
  opportunityBindings: number;
}>;

type MutableCreatedCounts = {
  -readonly [Key in keyof BootstrapCreatedCounts]: number;
};

export type BootstrapSideEffectDelta = Readonly<{
  outboxEvents: number;
  notifications: number;
  deliveries: number;
  deliveryAttempts: number;
  meaningfulChanges: number;
  opportunityChanges: number;
}>;

export type PersistedPrivateElementarySchool = Readonly<{
  institutionId: string;
  slug: string;
  status: "PERSISTED";
  created: BootstrapCreatedCounts;
  sideEffectDelta: BootstrapSideEffectDelta;
  factVersionIds: readonly string[];
  opportunityId: string | null;
  opportunityVersionId: string | null;
  admissionVerifiedAt: string | null;
}>;

const OFFICIAL_SOURCE_TYPES = new Set<string>([
  "OFFICIAL_ADMISSION_PAGE",
  "OFFICIAL_NOTICE_BOARD",
  "OFFICIAL_DOCUMENT",
  "OFFICIAL_APPLICATION_PORTAL",
  "OFFICIAL_SCHOOL_PAGE",
  "OFFICIAL_REGISTRY",
  "OFFICIAL_SOCIAL",
]);

function emptyCounts(): MutableCreatedCounts {
  return {
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
  };
}

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, candidate]) => [key, canonicalizeJson(candidate)]),
    );
  }
  return value;
}

function sameJson(left: unknown, right: unknown): boolean {
  return (
    JSON.stringify(canonicalizeJson(left)) ===
    JSON.stringify(canonicalizeJson(right))
  );
}

function databaseTime(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

async function sideEffectCounts(executor: TransactionExecutor) {
  const rows = (await executor.raw(sql`
    select
      (select count(*)::int from outbox_events) as "outboxEvents",
      (select count(*)::int from notifications) as notifications,
      (select count(*)::int from notification_deliveries) as deliveries,
      (select count(*)::int from notification_delivery_attempts) as "deliveryAttempts",
      (select count(*)::int from meaningful_changes) as "meaningfulChanges",
      (select count(*)::int from opportunity_changes) as "opportunityChanges"
  `)) as unknown as Array<{
    outboxEvents: number;
    notifications: number;
    deliveries: number;
    deliveryAttempts: number;
    meaningfulChanges: number;
    opportunityChanges: number;
  }>;
  return rows[0]!;
}

function sideEffectDelta(
  before: Awaited<ReturnType<typeof sideEffectCounts>>,
  after: Awaited<ReturnType<typeof sideEffectCounts>>,
): BootstrapSideEffectDelta {
  return Object.freeze({
    outboxEvents: after.outboxEvents - before.outboxEvents,
    notifications: after.notifications - before.notifications,
    deliveries: after.deliveries - before.deliveries,
    deliveryAttempts: after.deliveryAttempts - before.deliveryAttempts,
    meaningfulChanges: after.meaningfulChanges - before.meaningfulChanges,
    opportunityChanges: after.opportunityChanges - before.opportunityChanges,
  });
}

async function ensureSource(
  executor: TransactionExecutor,
  definition: SourceDefinition,
  now: Date,
  counts: MutableCreatedCounts,
): Promise<string> {
  // Several seed rows share the registry root URL. Serialize only Source reuse,
  // while keeping each school's writes in its own atomic transaction.
  await executor.raw(sql`
    select pg_advisory_xact_lock(hashtext(${"preppy-bootstrap-source:" + definition.canonicalUrl}))
  `);
  const rows = (await executor.raw(sql`
    select id, source_type as "sourceType", authority_level as "authorityLevel",
      lifecycle_status as "lifecycleStatus"
    from sources where canonical_url=${definition.canonicalUrl}
    for update
  `)) as unknown as Array<{
    id: string;
    sourceType: string;
    authorityLevel: string;
    lifecycleStatus: string;
  }>;
  const existing = rows[0];
  if (existing !== undefined) {
    if (
      rows.length !== 1 ||
      !OFFICIAL_SOURCE_TYPES.has(existing.sourceType) ||
      !["PRIMARY", "SECONDARY_OFFICIAL"].includes(existing.authorityLevel) ||
      existing.lifecycleStatus !== "ACTIVE"
    ) {
      throw new PrivateElementaryBootstrapError(
        "INSTITUTION_CONFLICT",
        "Existing Source is not one active official Source",
      );
    }
    return existing.id;
  }
  const inserted = (await executor.raw(sql`
    insert into sources (
      canonical_url, source_type, authority_level, lifecycle_status,
      source_name, requires_js, content_type_hint, created_at, updated_at
    ) values (
      ${definition.canonicalUrl}, ${definition.sourceType},
      ${definition.authorityLevel}, 'ACTIVE', ${definition.sourceName}, false,
      ${definition.contentTypeHint}, ${databaseTime(now)}, ${databaseTime(now)}
    ) returning id
  `)) as unknown as Array<{ id: string }>;
  counts.sources += 1;
  return inserted[0]!.id;
}

async function ensureInstitutionBinding(
  executor: TransactionExecutor,
  input: Readonly<{
    institutionId: string;
    sourceId: string;
    role: InstitutionBindingRole;
    isPrimary: boolean;
    now: Date;
  }>,
  counts: MutableCreatedCounts,
): Promise<void> {
  if (input.role === "OFFICIAL_MAIN" && input.isPrimary) {
    const conflicts = (await executor.raw(sql`
      select source_id as "sourceId" from institution_source_bindings
      where institution_id=${input.institutionId} and role='OFFICIAL_MAIN'
        and is_primary=true and is_active=true and source_id<>${input.sourceId}
      for update
    `)) as unknown as Array<{ sourceId: string }>;
    if (conflicts.length > 0) {
      throw new PrivateElementaryBootstrapError(
        "INSTITUTION_CONFLICT",
        "Institution already has a different active primary OFFICIAL_MAIN Source",
      );
    }
  }
  const inserted = (await executor.raw(sql`
    insert into institution_source_bindings (
      institution_id, source_id, role, is_primary, is_active, bound_at, unbound_at
    ) values (
      ${input.institutionId}, ${input.sourceId}, ${input.role},
      ${input.isPrimary}, true, ${databaseTime(input.now)}, null
    )
    on conflict (institution_id, source_id, role) do update set
      is_primary=excluded.is_primary, is_active=true, unbound_at=null
    returning (xmax = 0) as inserted
  `)) as unknown as Array<{ inserted: boolean }>;
  if (inserted[0]?.inserted) counts.bindings += 1;
}

async function ensurePageProvenance(
  executor: TransactionExecutor,
  page: BootstrapEvidencePage,
  sourceId: string,
  counts: MutableCreatedCounts,
): Promise<Provenance> {
  const insertedSnapshots = (await executor.raw(sql`
    insert into source_snapshots (
      source_id, captured_at, content_hash, text_hash, normalized_text,
      mime_type, created_at
    ) values (
      ${sourceId}, ${databaseTime(page.collectedAt)}, ${page.contentHash}, ${page.textHash},
      ${page.normalizedText}, ${page.mimeType}, ${databaseTime(page.collectedAt)}
    )
    on conflict (source_id, content_hash) do nothing
    returning id
  `)) as unknown as Array<{ id: string }>;
  if (insertedSnapshots.length > 0) counts.snapshots += 1;
  const snapshots = (await executor.raw(sql`
    select id, metadata from source_snapshots
    where source_id=${sourceId} and content_hash=${page.contentHash}
    order by created_at, id limit 1 for update
  `)) as unknown as Array<{ id: string; metadata: unknown }>;
  const snapshotId = snapshots[0]?.id;
  if (snapshotId === undefined) throw new Error("Snapshot persistence failed");
  if (page.captureMethod) {
    // This column predates optional observation metadata. Keep each acquisition
    // on its immutable original snapshot without replacing unrelated provenance.
    const existing = snapshots[0]!.metadata;
    if (
      existing !== null &&
      (typeof existing !== "object" || Array.isArray(existing))
    )
      throw new PrivateElementaryBootstrapError(
        "INSTITUTION_CONFLICT",
        "Existing snapshot metadata is not an object",
      );
    const metadata = (existing ?? {}) as Record<string, unknown>;
    const captures = metadata.preppyCorrectionCaptures ?? [];
    if (!Array.isArray(captures))
      throw new PrivateElementaryBootstrapError(
        "INSTITUTION_CONFLICT",
        "Existing snapshot capture provenance is not an array",
      );
    const capture = {
      captureMethod: page.captureMethod,
      requestedUrl: page.url,
      evidenceTextKind: "OPERATOR_REVIEWED_TRANSCRIPTION",
      originalContentHash: page.contentHash,
      observedAt: databaseTime(page.collectedAt),
    };
    if (!captures.some((previous) => sameJson(previous, capture))) {
      await executor.raw(sql`
        update source_snapshots set metadata=${JSON.stringify({ ...metadata, preppyCorrectionCaptures: [...captures, capture] })}::jsonb
        where id=${snapshotId}
      `);
    }
  }
  const existingObservations = (await executor.raw(sql`
    select id::text as id from source_observations
    where source_id=${sourceId} and snapshot_id=${snapshotId}
      and outcome in ('SUCCESS','UNCHANGED','CHANGED')
      ${page.captureMethod ? sql`and observed_at=${databaseTime(page.collectedAt)}` : sql``}
    order by observed_at, id limit 1
  `)) as unknown as Array<{ id: string }>;
  let observationId = existingObservations[0]?.id;
  if (observationId === undefined) {
    const inserted = (await executor.raw(sql`
      insert into source_observations (
        source_id, observed_at, outcome, http_status, final_url,
        content_hash, text_hash, response_bytes, duration_ms, snapshot_id,
        created_at
      ) values (
        ${sourceId}, ${databaseTime(page.collectedAt)}, 'SUCCESS', ${page.httpStatus},
        ${page.finalUrl}, ${page.contentHash}, ${page.textHash},
        ${page.responseBytes === null ? null : BigInt(page.responseBytes)}, ${page.durationMs}, ${snapshotId},
        ${databaseTime(page.collectedAt)}
      ) returning id::text as id
    `)) as unknown as Array<{ id: string }>;
    observationId = inserted[0]!.id;
    counts.observations += 1;
  }
  return Object.freeze({ sourceId, observationId, snapshotId });
}

async function ensureFactEvidence(
  executor: TransactionExecutor,
  input: Readonly<{
    versionId: string;
    provenance: Provenance;
    role: string;
    now: Date;
  }>,
  counts: MutableCreatedCounts,
): Promise<void> {
  const rows = (await executor.raw(sql`
    insert into institution_fact_version_evidence (
      institution_fact_version_id, source_id, source_observation_id,
      source_snapshot_id, evidence_role, created_at
    ) values (
      ${input.versionId}, ${input.provenance.sourceId},
      ${input.provenance.observationId === null ? null : BigInt(input.provenance.observationId)},
      ${input.provenance.snapshotId}, ${input.role}, ${databaseTime(input.now)}
    )
    on conflict (
      institution_fact_version_id, source_id, source_observation_id,
      source_snapshot_id
    ) do nothing returning id
  `)) as unknown as Array<{ id: string }>;
  if (rows.length > 0) counts.factEvidence += 1;
}

async function persistFact(
  executor: TransactionExecutor,
  input: Readonly<{
    institutionId: string;
    fact: ExtractedInstitutionFact;
    primary: Provenance;
    supporting?: Provenance;
    now: Date;
    correction?: boolean;
  }>,
  counts: MutableCreatedCounts,
): Promise<string> {
  let facts = (await executor.raw(sql`
    select id from institution_facts
    where institution_id=${input.institutionId} and fact_type=${input.fact.factType}
    for update
  `)) as unknown as Array<{ id: string }>;
  if (facts.length === 0) {
    facts = (await executor.raw(sql`
      insert into institution_facts (institution_id, fact_type, created_at)
      values (${input.institutionId}, ${input.fact.factType}, ${databaseTime(input.now)})
      returning id
    `)) as unknown as Array<{ id: string }>;
    counts.facts += 1;
  }
  const factId = facts[0]!.id;
  const currentRows = (await executor.raw(sql`
    select id, version_number as "versionNumber", value_json as "valueJson",
      display_text as "displayText", verified_at as "verifiedAt"
    from institution_fact_versions
    where institution_fact_id=${factId} and is_current=true
    for update
  `)) as unknown as Array<{
    id: string;
    versionNumber: number;
    valueJson: unknown;
    displayText: string | null;
    verifiedAt: Date | string | null;
  }>;
  const current = currentRows[0];
  let versionId: string;
  if (
    current !== undefined &&
    sameJson(current.valueJson, input.fact.valueJson) &&
    current.displayText === input.fact.displayText &&
    (!input.correction ||
      (current.verifiedAt !== null &&
        new Date(current.verifiedAt).getTime() === input.now.getTime()))
  ) {
    versionId = current.id;
  } else {
    const maximumRows = (await executor.raw(sql`
      select coalesce(max(version_number), 0)::int as maximum
      from institution_fact_versions where institution_fact_id=${factId}
    `)) as unknown as Array<{ maximum: number }>;
    if (current !== undefined) {
      await executor.raw(sql`
        update institution_fact_versions
        set is_current=false, verification_state='SUPERSEDED'
        where id=${current.id} and institution_fact_id=${factId}
      `);
    }
    const inserted = (await executor.raw(sql`
      insert into institution_fact_versions (
        institution_fact_id, version_number, supersedes_version_id,
        verification_state, is_current, value_json, display_text,
        verified_at, verified_by_admin_id, created_at
      ) values (
        ${factId}, ${(maximumRows[0]?.maximum ?? 0) + 1}, ${current?.id ?? null},
        'VERIFIED', true, ${JSON.stringify(input.fact.valueJson)}::jsonb,
        ${input.fact.displayText}, ${databaseTime(input.now)}, null, ${databaseTime(input.now)}
      ) returning id
    `)) as unknown as Array<{ id: string }>;
    versionId = inserted[0]!.id;
    counts.factVersions += 1;
  }
  await ensureFactEvidence(
    executor,
    { versionId, provenance: input.primary, role: "PRIMARY", now: input.now },
    counts,
  );
  if (input.supporting !== undefined) {
    await ensureFactEvidence(
      executor,
      {
        versionId,
        provenance: input.supporting,
        role: "SUPPORTING",
        now: input.now,
      },
      counts,
    );
  }
  return versionId;
}

async function ensureOpportunityBinding(
  executor: TransactionExecutor,
  input: Readonly<{
    opportunityId: string;
    sourceId: string;
    now: Date;
    supporting?: boolean;
  }>,
  counts: MutableCreatedCounts,
): Promise<void> {
  const rows = (await executor.raw(sql`
    insert into opportunity_source_bindings (
      opportunity_id, source_id, role, is_primary, is_active, bound_at, unbound_at
    ) values (
      ${input.opportunityId}, ${input.sourceId}, ${input.supporting ? "SUPPORTING" : "PRIMARY_NOTICE"}, ${!input.supporting}, true,
      ${databaseTime(input.now)}, null
    )
    on conflict (opportunity_id, source_id, role) do update set
      is_primary=excluded.is_primary, is_active=true, unbound_at=null
    returning (xmax = 0) as inserted
  `)) as unknown as Array<{ inserted: boolean }>;
  if (rows[0]?.inserted) counts.opportunityBindings += 1;
}

async function ensureOpportunityEvidence(
  executor: TransactionExecutor,
  input: Readonly<{
    versionId: string;
    provenance: Provenance;
    now: Date;
  }>,
  counts: MutableCreatedCounts,
): Promise<void> {
  const rows = (await executor.raw(sql`
    insert into opportunity_version_evidence (
      opportunity_version_id, source_id, source_observation_id,
      source_snapshot_id, evidence_role, created_at
    ) values (
      ${input.versionId}, ${input.provenance.sourceId},
      ${input.provenance.observationId === null ? null : BigInt(input.provenance.observationId)},
      ${input.provenance.snapshotId}, 'PRIMARY', ${databaseTime(input.now)}
    )
    on conflict (
      opportunity_version_id, source_id, source_observation_id,
      source_snapshot_id
    ) do nothing returning id
  `)) as unknown as Array<{ id: string }>;
  if (rows.length > 0) counts.opportunityEvidence += 1;
}

async function persistAdmission(
  executor: TransactionExecutor,
  input: Readonly<{
    institutionId: string;
    admission: NonNullable<CollectedPrivateElementarySchool["admission"]>;
    provenance: Provenance;
    now: Date;
    key?: string;
    supporting?: readonly Provenance[];
    correction?: boolean;
  }>,
  counts: MutableCreatedCounts,
): Promise<Readonly<{ opportunityId: string; versionId: string }>> {
  const proposal = input.admission.proposal;
  const year = proposal.academicYearLabel?.match(/20\d{2}/u)?.[0] ?? "current";
  const slug = `live-admissions-${input.institutionId}-${year}${input.key && input.key !== "main" ? `-event-${input.key}` : ""}`;
  let opportunities = (await executor.raw(sql`
    select id, institution_id as "institutionId", truth_mode as "truthMode",
      publication_state as "publicationState"
    from opportunities where slug=${slug} for update
  `)) as unknown as Array<{
    id: string;
    institutionId: string;
    truthMode: string;
    publicationState: string;
  }>;
  if (opportunities.length === 0) {
    opportunities = (await executor.raw(sql`
      insert into opportunities (
        institution_id, slug, kind, truth_mode, publication_state,
        created_at, updated_at, published_at
      ) values (
        ${input.institutionId}, ${slug}, ${proposal.kind}, 'NATIVE',
        'PUBLISHED', ${databaseTime(input.now)}, ${databaseTime(input.now)}, ${databaseTime(input.now)}
      ) returning id, institution_id as "institutionId",
        truth_mode as "truthMode", publication_state as "publicationState"
    `)) as unknown as typeof opportunities;
    counts.opportunities += 1;
  }
  const opportunity = opportunities[0]!;
  if (
    opportunities.length !== 1 ||
    opportunity.institutionId !== input.institutionId ||
    opportunity.truthMode !== "NATIVE" ||
    (opportunity.publicationState !== "PUBLISHED" &&
      !(input.correction && opportunity.publicationState === "HIDDEN"))
  ) {
    throw new PrivateElementaryBootstrapError(
      "INSTITUTION_CONFLICT",
      "Existing admission Opportunity conflicts with the bootstrap identity",
    );
  }
  await executor.raw(sql`
    update opportunities set kind=${proposal.kind}, publication_state='PUBLISHED', updated_at=${databaseTime(input.now)}
    where id=${opportunity.id}
  `);
  if (input.correction)
    await executor.raw(sql`
    update opportunity_source_bindings set is_primary=false,is_active=false,unbound_at=${databaseTime(input.now)}
    where opportunity_id=${opportunity.id} and role='PRIMARY_NOTICE' and source_id<>${input.provenance.sourceId} and is_active=true
  `);
  await ensureOpportunityBinding(
    executor,
    {
      opportunityId: opportunity.id,
      sourceId: input.provenance.sourceId,
      now: input.now,
    },
    counts,
  );
  const fingerprint = liveAdmissionContentFingerprint(proposal);
  const currentRows = (await executor.raw(sql`
    select id, version_number as "versionNumber",
      content_fingerprint as "contentFingerprint", verified_at as "verifiedAt"
    from opportunity_versions
    where opportunity_id=${opportunity.id} and is_current=true
    for update
  `)) as unknown as Array<{
    id: string;
    versionNumber: number;
    contentFingerprint: string | null;
    verifiedAt: Date | string | null;
  }>;
  const current = currentRows[0];
  let versionId: string;
  if (
    current?.contentFingerprint === fingerprint &&
    (!input.correction ||
      (current.verifiedAt !== null &&
        new Date(current.verifiedAt).getTime() === input.now.getTime()))
  ) {
    versionId = current.id;
  } else {
    const maximumRows = (await executor.raw(sql`
      select coalesce(max(version_number), 0)::int as maximum
      from opportunity_versions where opportunity_id=${opportunity.id}
    `)) as unknown as Array<{ maximum: number }>;
    if (current !== undefined) {
      await executor.raw(sql`
        update opportunity_versions
        set is_current=false, verification_state='SUPERSEDED'
        where id=${current.id} and opportunity_id=${opportunity.id}
      `);
    }
    const inserted = (await executor.raw(sql`
      insert into opportunity_versions (
        opportunity_id, truth_mode, version_number, supersedes_version_id,
        verification_state, business_state, is_current, title, summary,
        target_audience, event_start_at, event_end_at, application_open_at,
        application_close_at, action_url, verified_at, verified_by_admin_id,
        content_fingerprint, created_at
      ) values (
        ${opportunity.id}, 'NATIVE', ${(maximumRows[0]?.maximum ?? 0) + 1},
        ${current?.id ?? null}, 'VERIFIED', ${proposal.businessState}, true,
        ${proposal.title}, ${proposal.summary}, ${proposal.targetAudience},
        ${databaseTime(proposal.eventStartAt)}, ${databaseTime(proposal.eventEndAt)},
        ${databaseTime(proposal.applicationOpenAt)}, ${databaseTime(proposal.applicationCloseAt)},
        ${proposal.actionUrl}, ${databaseTime(input.now)}, null, ${fingerprint}, ${databaseTime(input.now)}
      ) returning id
    `)) as unknown as Array<{ id: string }>;
    versionId = inserted[0]!.id;
    counts.opportunityVersions += 1;
  }
  await ensureOpportunityEvidence(
    executor,
    { versionId, provenance: input.provenance, now: input.now },
    counts,
  );
  for (const provenance of input.supporting ?? []) {
    await ensureOpportunityBinding(
      executor,
      {
        opportunityId: opportunity.id,
        sourceId: provenance.sourceId,
        now: input.now,
        supporting: true,
      },
      counts,
    );
    await ensureOpportunityEvidence(
      executor,
      { versionId, provenance, now: input.now },
      counts,
    );
  }
  return Object.freeze({ opportunityId: opportunity.id, versionId });
}

function bindingRole(fact: ExtractedInstitutionFact): InstitutionBindingRole {
  if (fact.factType === "TUITION") return "TUITION";
  if (fact.factType === "CURRICULUM") return "CURRICULUM";
  return "OTHER";
}

export async function persistPrivateElementarySchool(
  collection: CollectedPrivateElementarySchool,
  dependencies: Readonly<{
    transactionManager: TransactionManager;
    supportsOfficialRegistrySourceType: boolean;
    supportsRegistryIdentityBindingRole: boolean;
    now?: () => Date;
    correction?: SchoolTruthCorrection;
  }>,
): Promise<PersistedPrivateElementarySchool> {
  if (collection.facts.length === 0 && collection.admission === null) {
    throw new PrivateElementaryBootstrapError(
      "PERSISTENCE_FAILED",
      "School has neither registry baseline nor collected evidence to persist",
    );
  }
  const institutionId = collection.target.institutionId;
  if (institutionId === null) {
    throw new PrivateElementaryBootstrapError(
      "INSTITUTION_CONFLICT",
      "Production Institution identity must be resolved before persistence",
    );
  }
  const now = dependencies.now?.() ?? new Date();
  if (!Number.isFinite(now.getTime()))
    throw new RangeError("now must be valid");
  return dependencies.transactionManager.run(async (executor) => {
    await executor.raw(sql`
      select pg_advisory_xact_lock(
        hashtext(${"preppy-private-elementary-bootstrap:" + institutionId})
      )
    `);
    const institutions = (await executor.raw(sql`
      select id, slug, display_name as "displayName", category,
        publication_state as "publicationState"
      from institutions where id=${institutionId} or slug=${collection.target.slug}
      order by id for update
    `)) as unknown as Array<{
      id: string;
      slug: string;
      displayName: string;
      category: string;
      publicationState: string;
    }>;
    const institution = institutions[0];
    if (
      institutions.length !== 1 ||
      institution?.id !== institutionId ||
      institution.slug !== collection.target.slug ||
      institution.displayName !== collection.target.institutionName ||
      institution.category !== "PRIVATE_ELEMENTARY" ||
      institution.publicationState !== "PUBLISHED"
    ) {
      throw new PrivateElementaryBootstrapError(
        "INSTITUTION_CONFLICT",
        "Production Institution does not match the exact published allowlist target",
      );
    }
    const before = await sideEffectCounts(executor);
    if (dependencies.correction) {
      const newer = (await executor.raw(sql`
        select v.id from opportunity_versions v join opportunities o on o.id=v.opportunity_id
        where o.institution_id=${institutionId} and o.truth_mode='NATIVE'
          and o.slug like ${`live-admissions-${institutionId}-%`} and v.is_current=true
          and v.verified_at>${databaseTime(now)}
        union all
        select v.id from institution_fact_versions v join institution_facts f on f.id=v.institution_fact_id
        where f.institution_id=${institutionId} and v.is_current=true and v.verified_at>${databaseTime(now)}
      `)) as unknown as Array<{ id: string }>;
      if (newer.length)
        throw new PrivateElementaryBootstrapError(
          "INSTITUTION_CONFLICT",
          "Newer reviewed truth exists; correction is stale",
        );
      // Validate retirement preconditions before changing any fact, including replacements.
      for (const retirement of dependencies.correction.retireFacts) {
        const rows = (await executor.raw(sql`
          select v.display_text as "displayText",v.is_current as "isCurrent",v.verification_state as state
          from institution_fact_versions v join institution_facts f on f.id=v.institution_fact_id
          where v.id=${retirement.versionId} and f.institution_id=${institutionId} and f.fact_type=${retirement.factType}
          for update of v
        `)) as unknown as Array<{
          displayText: string;
          isCurrent: boolean;
          state: string;
        }>;
        if (
          rows.length !== 1 ||
          rows[0]!.displayText !== retirement.expectedDisplayText ||
          (!rows[0]!.isCurrent && rows[0]!.state !== "SUPERSEDED")
        )
          throw new PrivateElementaryBootstrapError(
            "INSTITUTION_CONFLICT",
            "Fact retirement no longer matches reviewed version",
          );
      }
    }
    const counts = emptyCounts();
    const rootPage = collection.pages.find(
      (page) => page.sourceType === "OFFICIAL_SCHOOL_PAGE",
    );

    const definitions = new Map<string, SourceDefinition>();
    const register = (definition: SourceDefinition) => {
      const url = normalizeDiscoveryUrl(definition.canonicalUrl);
      const existing = definitions.get(url);
      if (
        existing === undefined ||
        existing.sourceType === "OFFICIAL_SCHOOL_PAGE"
      ) {
        definitions.set(
          url,
          Object.freeze({ ...definition, canonicalUrl: url }),
        );
      }
    };
    register({
      canonicalUrl: collection.target.registryUrl,
      sourceName: `${collection.target.institutionName} 학교알리미 공식 등록정보`,
      sourceType: dependencies.supportsOfficialRegistrySourceType
        ? "OFFICIAL_REGISTRY"
        : "OFFICIAL_DOCUMENT",
      authorityLevel: "SECONDARY_OFFICIAL",
      contentTypeHint: "text/html",
    });
    for (const page of collection.pages) {
      register({
        canonicalUrl: page.url,
        sourceName: page.sourceName,
        sourceType: page.sourceType,
        authorityLevel: "PRIMARY",
        contentTypeHint: page.mimeType,
      });
    }
    const sourceIds = new Map<string, string>();
    for (const [url, definition] of [...definitions].sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      sourceIds.set(url, await ensureSource(executor, definition, now, counts));
    }
    const rootUrl =
      rootPage === undefined ? null : normalizeDiscoveryUrl(rootPage.url);
    const registryUrl = normalizeDiscoveryUrl(collection.target.registryUrl);
    if (rootUrl !== null)
      await ensureInstitutionBinding(
        executor,
        {
          institutionId,
          sourceId: sourceIds.get(rootUrl)!,
          role: "OFFICIAL_MAIN",
          isPrimary: true,
          now,
        },
        counts,
      );
    await ensureInstitutionBinding(
      executor,
      {
        institutionId,
        sourceId: sourceIds.get(registryUrl)!,
        role: dependencies.supportsRegistryIdentityBindingRole
          ? "REGISTRY_IDENTITY"
          : "OTHER",
        isPrimary: false,
        now,
      },
      counts,
    );
    const provenanceByUrl = new Map<string, Provenance>();
    for (const page of collection.pages) {
      const url = normalizeDiscoveryUrl(page.url);
      if (provenanceByUrl.has(url)) continue;
      provenanceByUrl.set(
        url,
        await ensurePageProvenance(executor, page, sourceIds.get(url)!, counts),
      );
    }
    const registryProvenance: Provenance = Object.freeze({
      sourceId: sourceIds.get(registryUrl)!,
      observationId: null,
      snapshotId: null,
    });
    const rootProvenance =
      rootUrl === null ? undefined : provenanceByUrl.get(rootUrl);
    const factVersionIds: string[] = [];
    for (const fact of collection.facts) {
      const url = normalizeDiscoveryUrl(fact.sourceUrl);
      const primary =
        url === registryUrl ? registryProvenance : provenanceByUrl.get(url);
      if (primary === undefined) {
        throw new PrivateElementaryBootstrapError(
          "PERSISTENCE_FAILED",
          "Fact evidence URL was not collected from an official Source",
        );
      }
      await ensureInstitutionBinding(
        executor,
        {
          institutionId,
          sourceId: primary.sourceId,
          role:
            fact.factType === "OPERATING_INFO"
              ? dependencies.supportsRegistryIdentityBindingRole
                ? "REGISTRY_IDENTITY"
                : "OTHER"
              : bindingRole(fact),
          isPrimary: false,
          now,
        },
        counts,
      );
      factVersionIds.push(
        await persistFact(
          executor,
          {
            institutionId,
            fact,
            primary,
            correction: dependencies.correction !== undefined,
            ...(fact.factType === "OPERATING_INFO" &&
            rootProvenance !== undefined
              ? { supporting: rootProvenance }
              : {}),
            now,
          },
          counts,
        ),
      );
      for (const sourceUrl of dependencies.correction?.factSourceUrls[
        fact.factType
      ] ?? []) {
        const supporting = provenanceByUrl.get(
          normalizeDiscoveryUrl(sourceUrl),
        );
        if (!supporting)
          throw new PrivateElementaryBootstrapError(
            "PERSISTENCE_FAILED",
            "Fact supporting evidence missing",
          );
        await ensureFactEvidence(
          executor,
          {
            versionId: factVersionIds[factVersionIds.length - 1]!,
            provenance: supporting,
            role: sourceUrl === fact.sourceUrl ? "PRIMARY" : "SUPPORTING",
            now,
          },
          counts,
        );
      }
    }
    let admissionResult: Readonly<{
      opportunityId: string;
      versionId: string;
    }> | null = null;
    const admissions =
      dependencies.correction?.admissions ??
      (collection.admission
        ? [
            {
              key: "main",
              admission: collection.admission,
              sourceUrls: [collection.admission.sourceUrl],
            },
          ]
        : []);
    const retainedOpportunityIds: string[] = [];
    for (const item of admissions) {
      if (isStaleAdmissionCycle(item.admission.proposal.academicYearLabel))
        continue;
      const admissionUrl = normalizeDiscoveryUrl(item.admission.sourceUrl);
      const admissionProvenance = provenanceByUrl.get(admissionUrl);
      if (admissionProvenance === undefined) {
        throw new PrivateElementaryBootstrapError(
          "PERSISTENCE_FAILED",
          "Admission evidence URL was not collected from an official Source",
        );
      }
      await ensureInstitutionBinding(
        executor,
        {
          institutionId,
          sourceId: admissionProvenance.sourceId,
          role: "ADMISSIONS",
          isPrimary: true,
          now,
        },
        counts,
      );
      const result = await persistAdmission(
        executor,
        {
          institutionId,
          admission: item.admission,
          provenance: admissionProvenance,
          key: item.key,
          correction: dependencies.correction !== undefined,
          supporting: item.sourceUrls
            .filter((url) => normalizeDiscoveryUrl(url) !== admissionUrl)
            .map((url) => {
              const provenance = provenanceByUrl.get(
                normalizeDiscoveryUrl(url),
              );
              if (!provenance)
                throw new PrivateElementaryBootstrapError(
                  "PERSISTENCE_FAILED",
                  "Admission supporting evidence missing",
                );
              return provenance;
            }),
          now,
        },
        counts,
      );
      if (item.key === "main") admissionResult = result;
      retainedOpportunityIds.push(result.opportunityId);
    }
    if (dependencies.correction) {
      if (!admissionResult)
        throw new PrivateElementaryBootstrapError(
          "PERSISTENCE_FAILED",
          "Correction requires reviewed main admission",
        );
      // Only our exact canonical identities are retired. Unrelated/legacy opportunities remain untouched.
      const old = (await executor.raw(sql`
        select id,slug from opportunities where institution_id=${institutionId} and truth_mode='NATIVE'
        and publication_state='PUBLISHED' and slug like ${`live-admissions-${institutionId}-%`} for update
      `)) as unknown as Array<{ id: string; slug: string }>;
      const identity = new RegExp(
        `^live-admissions-${institutionId}-(?:20\\d{2}|current)(?:-event-[a-z0-9]+(?:-[a-z0-9]+)*)?$`,
        "u",
      );
      for (const row of old) {
        if (retainedOpportunityIds.includes(row.id) || !identity.test(row.slug))
          continue;
        await executor.raw(
          sql`update opportunity_versions set is_current=false,verification_state='SUPERSEDED' where opportunity_id=${row.id} and is_current=true`,
        );
        await executor.raw(
          sql`update opportunities set publication_state='HIDDEN',updated_at=${databaseTime(now)} where id=${row.id}`,
        );
      }
      for (const retirement of dependencies.correction.retireFacts) {
        await executor.raw(
          sql`update institution_fact_versions set is_current=false,verification_state='SUPERSEDED' where id=${retirement.versionId} and is_current=true`,
        );
      }
    }
    const after = await sideEffectCounts(executor);
    const delta = sideEffectDelta(before, after);
    if (Object.values(delta).some((value) => value !== 0)) {
      throw new PrivateElementaryBootstrapError(
        "SIDE_EFFECT_DETECTED",
        "Private elementary bootstrap created a Product side effect",
      );
    }
    const admissionVerifiedAt =
      admissionResult === null
        ? null
        : (
            (await executor.raw(sql`
            select verified_at::text as "verifiedAt"
            from opportunity_versions where id=${admissionResult.versionId}
          `)) as unknown as Array<{ verifiedAt: string }>
          )[0]!.verifiedAt;
    return Object.freeze({
      institutionId,
      slug: collection.target.slug,
      status: "PERSISTED" as const,
      created: Object.freeze({ ...counts }),
      sideEffectDelta: delta,
      factVersionIds: Object.freeze(factVersionIds),
      opportunityId: admissionResult?.opportunityId ?? null,
      opportunityVersionId: admissionResult?.versionId ?? null,
      admissionVerifiedAt,
    });
  });
}
