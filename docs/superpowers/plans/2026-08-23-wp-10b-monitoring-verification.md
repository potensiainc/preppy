# WP-10B Monitoring / Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build PREPPY's canonical-binding monitoring queue and atomic Source/Opportunity/InstitutionFact verification commands without creating Admin transport or Notification/Delivery rows.

**Architecture:** A server-only `monitoring` module separates strict command contracts, pure deterministic policies, narrow PostgreSQL repository operations, read-only queue projection, Source lifecycle commands, and Native/Legacy verification strategies. Every mutation receives `AdminCommandContext`, executes through one caller-owned `TransactionManager` root transaction, and uses the existing Audit/Outbox writers.

**Tech Stack:** TypeScript 5.9, Node.js 22+, Next.js 16 server modules, Zod 4, Drizzle ORM 0.45, PostgreSQL, Vitest 4.

**Spec:** `docs/plans/2026-08-23-wp-10b-monitoring-verification-design.md`

## Global Constraints

- Use only WP-10A canonical `institution_source_bindings` and `opportunity_source_bindings`; never infer bindings from Evidence.
- `Source checked != Truth changed != Notification created`.
- `truth_mode` is loaded from the database and is never client-selectable.
- Native truth writes `opportunity_versions`; Legacy-backed truth writes `admission_event_versions` and never writes `opportunity_versions`.
- Verified meaningful Opportunity changes converge on exactly one canonical `opportunity_changes` row.
- Only `NOTIFIABLE` canonical changes enqueue `OPPORTUNITY_CHANGE_PUBLISHED`; InstitutionFact and Source lifecycle commands enqueue no customer Outbox.
- Audit and applicable Outbox writes are in the same root transaction as truth.
- No Admin UI/API, Notification resolver/rows, Delivery rows, worker, provider, CMS, GA4 transport, migrations, schema changes, or packages.
- Do not commit or push. The plan's normal commit checkpoints are replaced by diff/test checkpoints because the controlling WP-10B prompt forbids commit/push.

## File Structure

- Create `src/modules/monitoring/contracts.ts`: strict input schemas and public result/DTO types.
- Create `src/modules/monitoring/policy.ts`: pure priority/cadence, semantic comparison, change classification, materiality, and key policies.
- Create `src/modules/monitoring/database-errors.server.ts`: safe PostgreSQL/application conflict mapping.
- Create `src/modules/monitoring/repository.server.ts`: Source/config/Observation/binding/version/evidence/change persistence primitives.
- Create `src/modules/monitoring/queue-query.server.ts`: side-effect-free canonical binding queue projection.
- Create `src/modules/monitoring/source-commands.server.ts`: observation, no-change, unavailable, bind/unbind, and explicit move commands.
- Create `src/modules/monitoring/opportunity-change.server.ts`: canonical Change/Audit/Outbox creation inside an existing transaction.
- Create `src/modules/monitoring/verify-opportunity.server.ts`: server-owned dispatcher and Native/Legacy strategies.
- Create `src/modules/monitoring/verify-institution-fact.server.ts`: Fact verification command.
- Modify `src/application/audit-writer.server.ts`: narrowly allow required UUID/identifier metadata fields.
- Modify `src/modules/admissions/repository.server.ts`: only ownership-preserving legacy/current lock helpers not suitable for the monitoring repository.
- Modify `src/modules/institution/repository.server.ts`: only logical Fact lock helper if needed by institution ownership.
- Create `tests/unit/wp10b-monitoring-policy.test.ts`: deterministic policy tests.
- Create `tests/integration/wp10b-monitoring-query.test.ts`: queue projection tests.
- Create `tests/integration/wp10b-source-commands.test.ts`: Source/binding/check/move tests.
- Create `tests/integration/wp10b-opportunity-verification.test.ts`: Native/Legacy/atomicity/concurrency tests.
- Create `tests/integration/wp10b-institution-fact-verification.test.ts`: Fact tests.

---

### Task 1: Strict Contracts and Pure Monitoring Policies

**Files:**
- Create: `src/modules/monitoring/contracts.ts`
- Create: `src/modules/monitoring/policy.ts`
- Test: `tests/unit/wp10b-monitoring-policy.test.ts`

**Interfaces:**
- Produces: `SourceMoveMode`, `MonitoringPriority`, `MonitoringDueState`, `MonitoringQueueRow`, strict command inputs, `deriveMonitoringSchedule`, `compareNativeTruth`, `compareLegacyTruth`, `compareFactTruth`, `deriveOpportunitySignal`, `createBindingKey`, `createChangeDedupeKey`, and `createOutboxDedupeKey`.
- Consumes: schema-exported Opportunity, binding-role, Fact, change-type, and materiality literal unions.

- [ ] **Step 1: Write failing unit tests for schedule priority and cadence**

```ts
expect(deriveMonitoringSchedule({
  now,
  lastCheckedAt: null,
  institutionDormant: false,
  monitorEnabled: true,
  manualOnly: false,
  currentBusinessState: "OPEN",
  upcomingAt: null,
  customIntervalMinutes: null,
})).toEqual({ priority: "P0_ACTIVE", intervalMinutes: 1440, nextDueAt: null, dueState: "DUE" });

expect(deriveMonitoringSchedule({
  now,
  lastCheckedAt: now,
  institutionDormant: true,
  monitorEnabled: true,
  manualOnly: false,
  currentBusinessState: null,
  upcomingAt: null,
  customIntervalMinutes: null,
})).toMatchObject({ priority: "P3_PASSIVE", intervalMinutes: null, dueState: "MANUAL" });
```

- [ ] **Step 2: Run the policy test and verify RED**

Run: `npm test -- tests/unit/wp10b-monitoring-policy.test.ts`

Expected: FAIL because `policy.ts` and its exports do not exist.

- [ ] **Step 3: Implement strict literal contracts and schedule policy**

```ts
export type SourceMoveMode = "URL_CORRECTION" | "SOURCE_REPLACEMENT";
export type MonitoringPriority = "P0_ACTIVE" | "P1_UPCOMING" | "P2_WATCH" | "P3_PASSIVE";
export type MonitoringDueState = "OVERDUE" | "DUE" | "UPCOMING" | "MANUAL";

export function createBindingKey(input: {
  targetType: "INSTITUTION" | "OPPORTUNITY";
  targetId: string;
  sourceId: string;
  role: string;
}): string {
  return [input.targetType, input.targetId, input.sourceId, input.role].join(":");
}
```

Implement P3 first, then P0 OPEN, P1 upcoming inside a fixed 30-day window, else P2. Use custom interval first; otherwise 1440/2880/10080 minutes. Unobserved automatic rows are `DUE`; P3 is `MANUAL` with null `nextDueAt`.

- [ ] **Step 4: Add failing semantic comparison and signal tests**

```ts
expect(deriveOpportunitySignal(current, { ...current, applicationCloseAt: later }))
  .toMatchObject({ changeType: "DEADLINE_CHANGED", materiality: "NOTIFIABLE" });
expect(deriveOpportunitySignal(current, { ...current, summary: "Punctuation corrected." }))
  .toMatchObject({ changeType: "MATERIAL_INFO_CHANGED", materiality: "NON_NOTIFIABLE" });
expect(compareFactTruth({ valueJson: { fee: 100 }, displayText: "100" }, {
  valueJson: { fee: 100 }, displayText: "100"
})).toBe(false);
```

- [ ] **Step 5: Implement deterministic normalization, precedence, and dedupe policies**

Normalize dates to epoch values, nullable text to trimmed-or-null values, and JSON objects by recursively sorting keys without accepting arrays as Fact root values. Apply signal precedence `CANCELLED`, application transition, `DEADLINE_CHANGED`, `DATE_CHANGED`, `STATUS_CHANGED`, `MATERIAL_INFO_CHANGED`. Require an override reason whenever selected materiality differs from policy materiality.

- [ ] **Step 6: Run unit tests and checkpoint the diff**

Run: `npm test -- tests/unit/wp10b-monitoring-policy.test.ts`

Expected: PASS.

Run: `git diff --check`

Expected: no whitespace errors; do not commit.

### Task 2: Repository Primitives and Query-driven Monitoring Queue

**Files:**
- Create: `src/modules/monitoring/repository.server.ts`
- Create: `src/modules/monitoring/queue-query.server.ts`
- Create: `src/modules/monitoring/database-errors.server.ts`
- Test: `tests/integration/wp10b-monitoring-query.test.ts`

**Interfaces:**
- Consumes: Task 1 `MonitoringQueueRow`, `createBindingKey`, and `deriveMonitoringSchedule`.
- Produces: `listInstitutionMonitoringBindings`, `listOpportunityMonitoringBindings`, `getMonitoringQueue`, latest-Observation reads, Source/binding locks, and safe database-error mapping used by later commands.

- [ ] **Step 1: Write failing queue integration tests**

Create fixtures for one native `ENGLISH_KINDERGARTEN` Institution binding with no School, one Opportunity binding, enabled monitor configs, and observations. Assert both rows appear, inactive bindings do not, Evidence-only sources do not, and the query leaves Observation/Audit/task counts unchanged.

```ts
const rows = await getMonitoringQueue({ dueState: ["DUE", "OVERDUE", "UPCOMING", "MANUAL"] }, {
  executor: runtime.executor,
  now,
});
expect(rows.map((row) => row.targetType)).toEqual(expect.arrayContaining(["INSTITUTION", "OPPORTUNITY"]));
expect(rows.every((row) => row.bindingId === createBindingKey(row))).toBe(true);
```

- [ ] **Step 2: Run the query integration test and verify RED**

Run: `npm test -- tests/integration/wp10b-monitoring-query.test.ts --hookTimeout=60000 --no-file-parallelism`

Expected: FAIL because the query module does not exist.

- [ ] **Step 3: Implement bounded canonical binding queries**

Use two Drizzle queries rooted in active canonical bindings. Join active Source and enabled config, retrieve latest Observation with a grouped max/subquery or deterministic lateral raw query, and retrieve current published Opportunity truth where relevant. Return raw projection inputs, not persisted due state.

- [ ] **Step 4: Implement the read-only DTO projection and ordering**

```ts
export async function getMonitoringQueue(
  rawFilter: unknown,
  dependencies: { executor: DatabaseExecutor; now: Date },
): Promise<MonitoringQueueRow[]>;
```

Validate only bounded filters: due state, priority, target type, role, and Source lifecycle. Merge both target families, calculate schedule in application policy, then sort overdue first, priority rank, next due nulls last, and stable binding ID.

- [ ] **Step 5: Prove deterministic order, cadence override, filters, and zero side effects**

Add assertions for custom interval, P0/P1/P2/P3, identical timestamp tie-breaks, and repeated calls producing byte-equivalent DTOs with unchanged row counts.

- [ ] **Step 6: Run focused query tests and checkpoint**

Run: `npm test -- tests/unit/wp10b-monitoring-policy.test.ts tests/integration/wp10b-monitoring-query.test.ts --hookTimeout=60000 --no-file-parallelism`

Expected: PASS.

### Task 3: Source Observation, No-change, and Unavailable Commands

**Files:**
- Create: `src/modules/monitoring/source-commands.server.ts`
- Modify: `src/application/audit-writer.server.ts`
- Test: `tests/integration/wp10b-source-commands.test.ts`

**Interfaces:**
- Consumes: repository Source locks/Observation insert, `TransactionManager`, `AdminCommandContext`, and `AuditWriter`.
- Produces: `recordSourceObservation`, `confirmNoChange`, and `markSourceUnavailable`, each with an exported `...InTransaction` form for rollback tests.

- [ ] **Step 1: Write failing no-change zero-side-effect test**

Record baseline counts for OpportunityVersion, EventVersion, FactVersion, OpportunityChange, Outbox, Notification, and Delivery. Call `confirmNoChange`, assert one `UNCHANGED` Observation and one Source-targeted Audit at `ctx.occurredAt`, then assert all baseline truth/signal counts and verification timestamps are unchanged.

- [ ] **Step 2: Run the source command test and verify RED**

Run: `npm test -- tests/integration/wp10b-source-commands.test.ts --hookTimeout=60000 --no-file-parallelism`

Expected: FAIL because Source commands do not exist.

- [ ] **Step 3: Extend Audit metadata narrowly and implement Observation insertion**

Add bounded optional metadata fields `bindingId`, `targetId`, `versionId`, `changeId`, and `moveMode` to `AuditSafeMetadata`; UUID-validate UUID fields and canonical-identifier-validate `moveMode`. Do not add arbitrary JSON.

Implement strict observation input using the existing outcome enum and optional HTTP/final URL/hash/error/Snapshot fields. Before insert, verify Snapshot belongs to the same Source.

- [ ] **Step 4: Implement `confirmNoChange` in one root transaction**

```ts
export async function confirmNoChange(
  ctx: AdminCommandContext,
  rawInput: unknown,
  dependencies: SourceCommandDependencies,
): Promise<{ sourceId: string; observationId: string; checkedAt: string }>;
```

Lock Source, require it exists, insert `UNCHANGED`, write `CONFIRM_NO_CHANGE` Audit with bigint Observation ID serialized as safe metadata text, and return after commit.

- [ ] **Step 5: Implement `markSourceUnavailable` without truth mutation**

Accept only `NOT_FOUND`, `ACCESS_ERROR`, `PARSE_ERROR`, or `TIMEOUT`. Insert the exact failure Observation and Audit. Set Source `PAUSED` only when the operator explicitly requests the validated operational-state update; otherwise preserve lifecycle. Never map failure to CLOSED/CANCELLED.

- [ ] **Step 6: Add forced Audit failure rollback tests**

Inject a persistence/Audit dependency that throws after Observation insertion and assert the Observation is rolled back. Assert unavailable leaves all Opportunity/Fact truth and product-signal counts unchanged.

- [ ] **Step 7: Run focused source tests and checkpoint**

Run: `npm test -- tests/integration/wp10b-source-commands.test.ts --hookTimeout=60000 --no-file-parallelism`

Expected: PASS.

### Task 4: Bind, Unbind, and Explicit Source Move Lifecycle

**Files:**
- Modify: `src/modules/monitoring/source-commands.server.ts`
- Modify: `src/modules/monitoring/repository.server.ts`
- Test: `tests/integration/wp10b-source-commands.test.ts`

**Interfaces:**
- Consumes: Task 1 strict role/move schemas and Task 3 Source command dependencies.
- Produces: `bindInstitutionSource`, `unbindInstitutionSource`, `bindOpportunitySource`, `unbindOpportunitySource`, and `markSourceMoved`.

- [ ] **Step 1: Write failing bind/unbind lifecycle tests**

Assert valid bind, idempotent exact active bind, primary collision conflict, inactive unbind idempotency, and reactivation of the same composite binding row. Assert every mutation has same-transaction Audit and zero product signal rows.

- [ ] **Step 2: Implement binding row locks and lifecycle operations**

Use the composite key `(targetId, sourceId, role)`. Bind validates target/Source existence, role, lifecycle, and primary uniqueness. Unbind changes `isActive=false` and `unboundAt=ctx.occurredAt`; rebind changes them back and refreshes `boundAt` while retaining the logical row.

- [ ] **Step 3: Write failing `URL_CORRECTION` tests**

Call `markSourceMoved` with explicit `moveMode: "URL_CORRECTION"`, reason, and new URL. Assert the Source ID, canonical bindings, and historical Evidence `sourceId` are unchanged; only Source URL/timestamp and Audit change. Reject duplicate URL, non-HTTP(S), absent reason, and missing move mode.

- [ ] **Step 4: Implement narrow URL correction**

```ts
type UrlCorrectionInput = {
  sourceId: string;
  moveMode: "URL_CORRECTION";
  newUrl: string;
  provenanceContinuityConfirmed: true;
};
```

Require `ctx.reason`, explicit confirmation, Source lock, normalized URL different from current, and unique canonical URL. Update the same Source only and Audit `SOURCE_URL_CORRECTED`.

- [ ] **Step 5: Write failing `SOURCE_REPLACEMENT` transfer/rollback tests**

Cover new Source creation and explicit existing `replacementSourceId` reuse. Assert old active Institution/Opportunity bindings become inactive, equivalent new bindings become active, old Source becomes `RETIRED`, historical Evidence stays on old Source, and new Source config is copied only on creation. Force a primary collision after new Source creation and assert full rollback.

- [ ] **Step 6: Implement explicit replacement transaction**

```ts
type SourceReplacementInput = {
  sourceId: string;
  moveMode: "SOURCE_REPLACEMENT";
  replacement:
    | { kind: "CREATE"; canonicalUrl: string; sourceName: string }
    | { kind: "REUSE"; replacementSourceId: string };
};
```

Lock old/reused Sources in UUID order, create or validate replacement, recreate/reactivate equivalent canonical bindings, deactivate old bindings, retire old Source, optionally clone config for a created Source, then Audit all affected contexts. Do not rewrite any Evidence row.

- [ ] **Step 7: Run all Source lifecycle tests and checkpoint**

Run: `npm test -- tests/integration/wp10b-source-commands.test.ts --hookTimeout=60000 --no-file-parallelism`

Expected: PASS.

### Task 5: Canonical Opportunity Change and Outbox Boundary

**Files:**
- Create: `src/modules/monitoring/opportunity-change.server.ts`
- Test: `tests/integration/wp10b-opportunity-verification.test.ts`

**Interfaces:**
- Consumes: Task 1 signal classification/dedupe policies, `AuditWriter`, `OutboxWriter`, and a provided `TransactionExecutor`.
- Produces: `publishCanonicalOpportunityChange` which inserts/reuses one Change, writes Audit, and conditionally enqueues one Outbox event without starting a transaction.

- [ ] **Step 1: Write failing canonical signal tests**

Use a minimal valid Native fixture and call the in-transaction publisher twice with the same origin. Assert exactly one Change, one Outbox for `NOTIFIABLE`, zero Outbox for `NON_NOTIFIABLE`, server-controlled timestamps, minimal payload, and stable dedupe keys.

- [ ] **Step 2: Implement the in-transaction publisher**

```ts
export async function publishCanonicalOpportunityChange(
  executor: TransactionExecutor,
  ctx: AdminCommandContext,
  input: NativeChangeOrigin | LegacyChangeOrigin,
  dependencies?: CanonicalChangeDependencies,
): Promise<{ change: OpportunityChangeRow; outboxEnqueued: boolean }>;
```

For Native origin require destination Version and source Version for non-new changes. For Legacy origin require MeaningfulChange and bridged AdmissionEvent. Insert using deterministic dedupe handling; never start a nested transaction.

- [ ] **Step 3: Add Outbox failure rollback harness**

Inject an Outbox writer that throws after Change/Audit insertion while the caller also inserts a fixture truth row. Assert the outer transaction rolls back all four categories.

- [ ] **Step 4: Run focused publisher tests and checkpoint**

Run: `npm test -- tests/integration/wp10b-opportunity-verification.test.ts -t "canonical change" --hookTimeout=60000 --no-file-parallelism`

Expected: PASS.

### Task 6: Native Opportunity Verification with Retry and Concurrency Safety

**Files:**
- Create: `src/modules/monitoring/verify-opportunity.server.ts`
- Modify: `src/modules/admissions/repository.server.ts`
- Modify: `src/modules/monitoring/repository.server.ts`
- Test: `tests/integration/wp10b-opportunity-verification.test.ts`

**Interfaces:**
- Consumes: Task 1 comparisons/signals, Task 2 locks/persistence, Task 3 Observation/Audit, and Task 5 canonical publisher.
- Produces: `verifyOpportunity`, `verifyNativeOpportunityInTransaction`, and the common `VerificationResult`.

- [ ] **Step 1: Write failing Native changed and no-change tests**

For a `PUBLISHED` NATIVE Opportunity with current v1 and active official binding, change an event date and assert v1 SUPERSEDED/not-current, v2 VERIFIED/current, one Evidence, `DATE_CHANGED`, Audit, and one Outbox. Submit identical truth and assert Observation/Audit only with unchanged Version/Change/Outbox counts.

- [ ] **Step 2: Implement server-owned dispatcher and strict evidence validation**

```ts
export async function verifyOpportunity(
  ctx: AdminCommandContext,
  rawInput: unknown,
  dependencies: VerifyOpportunityDependencies,
): Promise<VerificationResult>;
```

Input contains `opportunityId`, `expectedCurrentVersionId`, proposed state, `sourceId`, optional Observation/Snapshot IDs, evidence role, optional materiality override/reason. It contains no truth mode. Lock Opportunity first, dispatch from persisted mode, and validate active official Opportunity binding plus same-Source Observation/Snapshot.

- [ ] **Step 3: Implement Native version swap in correct order**

Compare normalized truth. For change: update old current to `SUPERSEDED/isCurrent=false`, insert v+1 with `supersedesVersionId`, `VERIFIED/isCurrent=true`, server verification fields, insert Evidence, publish canonical Change, and return IDs. Any later failure relies on the root transaction rollback to restore v1.

- [ ] **Step 4: Implement deterministic retry handling**

When expected Version is stale, compare the persisted current fingerprint/state with the submitted normalized candidate. If it matches the committed successor and origin keys match, return `IDEMPOTENT_REPLAY` with existing Version/Change IDs; otherwise throw `ConflictError`.

- [ ] **Step 5: Write and run the concurrent verification test**

Launch two calls with the same v1 expected ID using separate runtime transactions and a barrier before root lock acquisition. Assert `Promise.allSettled` gives one committed change and one replay/conflict, with exactly two Version rows, one current, no branching, one Change, and one Outbox.

Run: `npm test -- tests/integration/wp10b-opportunity-verification.test.ts -t "Native" --hookTimeout=60000 --no-file-parallelism`

Expected: PASS deterministically across repeated runs.

- [ ] **Step 6: Add wrong-mode, authority, binding, evidence mismatch, and rollback tests**

Assert direct Native strategy rejects LEGACY_BACKED, inactive/unbound or discovery-only Source is rejected, mismatched Observation/Snapshot is rejected before mutation, Audit/Outbox failures roll everything back, and no Notification/Delivery rows are written.

- [ ] **Step 7: Run the Native suite and checkpoint**

Run: `npm test -- tests/integration/wp10b-opportunity-verification.test.ts --hookTimeout=60000 --no-file-parallelism`

Expected: Native tests PASS.

### Task 7: Legacy-backed Opportunity Verification and Canonicalization

**Files:**
- Modify: `src/modules/monitoring/verify-opportunity.server.ts`
- Modify: `src/modules/admissions/repository.server.ts`
- Modify: `src/modules/monitoring/repository.server.ts`
- Test: `tests/integration/wp10b-opportunity-verification.test.ts`

**Interfaces:**
- Consumes: common dispatcher/result, canonical publisher, explicit Opportunity↔AdmissionEvent bridge, existing EventVersion/Evidence/MeaningfulChange schema.
- Produces: `verifyLegacyBackedOpportunityInTransaction` and Legacy result mapping through `verifyOpportunity`.

- [ ] **Step 1: Write failing Legacy changed/no-change tests**

Build a LEGACY_BACKED Opportunity with explicit bridge, current legacy Version, active official canonical Opportunity binding, and source context. Change registration close date and assert the legacy next Version/Evidence/MeaningfulChange plus exactly one canonical `DEADLINE_CHANGED` Change/Audit/Outbox. Assert canonical OpportunityVersion count remains zero. Identical truth produces Observation/Audit only.

- [ ] **Step 2: Implement bridge/current Event locks and legacy normalization**

Lock canonical Opportunity, require LEGACY_BACKED, load bridge, lock AdmissionEvent and current EventVersion, validate bridge cycle/school consistency and expected current legacy Version, and map strict proposed legacy state to existing columns.

- [ ] **Step 3: Implement legacy version/evidence/change transaction**

Supersede current EventVersion, insert v+1, insert `event_version_evidence`, create one legacy `meaningful_changes` row with mapped type/significance/public summary/review timestamps, then publish one canonical Legacy-origin Change. Do not write legacy Alert or canonical OpportunityVersion.

- [ ] **Step 4: Add retry, wrong-mode, bridge, and rollback tests**

Assert the MeaningfulChange unique origin canonicalizes once on retry; Legacy strategy rejects NATIVE; missing/inconsistent bridge or Evidence Source rejects with zero writes; Outbox failure restores old EventVersion current state and removes all downstream rows.

- [ ] **Step 5: Run the complete Opportunity verification suite**

Run: `npm test -- tests/integration/wp10b-opportunity-verification.test.ts --hookTimeout=60000 --no-file-parallelism`

Expected: PASS.

### Task 8: InstitutionFact Verification

**Files:**
- Create: `src/modules/monitoring/verify-institution-fact.server.ts`
- Modify: `src/modules/institution/repository.server.ts`
- Modify: `src/modules/monitoring/repository.server.ts`
- Test: `tests/integration/wp10b-institution-fact-verification.test.ts`

**Interfaces:**
- Consumes: strict Fact contract, Fact comparison, Source Observation/Audit, canonical Institution binding, and transaction foundation.
- Produces: `verifyInstitutionFact` and `verifyInstitutionFactInTransaction`.

- [ ] **Step 1: Write failing changed/new/no-change Fact tests**

Assert a missing logical Fact is created with v1 VERIFIED/current and Evidence/Audit. For an existing Fact, changed value creates v2 and supersedes v1. Identical normalized truth creates Observation/Audit only. Every case creates zero OpportunityChange/customer Outbox/Notification/Delivery rows.

- [ ] **Step 2: Implement Institution/Fact/current locks and binding validation**

Lock Institution, find-or-create the `(institutionId, factType)` logical Fact safely, lock it/current Version, validate expected Version and active official Institution Source binding, and validate same-Source evidence.

- [ ] **Step 3: Implement Fact version swap and Audit**

For changed truth, update old current to SUPERSEDED, insert incremented VERIFIED/current Version with canonicalized object `valueJson`, insert FactVersionEvidence, and Audit with version/source IDs. Do not call the Opportunity publisher or Outbox writer.

- [ ] **Step 4: Add evidence mismatch, stale concurrency, and rollback tests**

Assert mismatched Source references reject before write; concurrent next-Version attempts yield one current lineage; forced Audit failure restores the prior current and removes new Fact/Evidence rows.

- [ ] **Step 5: Run the Fact suite and checkpoint**

Run: `npm test -- tests/integration/wp10b-institution-fact-verification.test.ts --hookTimeout=60000 --no-file-parallelism`

Expected: PASS.

### Task 9: Cross-cutting Verification and Scope Audit

**Files:**
- Modify: WP-10B files only when failures reveal an in-scope defect.
- Test: all WP-10B tests, then repository-wide controlled suite.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: verified WP-10B implementation and final evidence; no commit/push.

- [ ] **Step 1: Run all focused WP-10B tests**

Run:

```powershell
npm test -- tests/unit/wp10b-monitoring-policy.test.ts tests/integration/wp10b-monitoring-query.test.ts tests/integration/wp10b-source-commands.test.ts tests/integration/wp10b-opportunity-verification.test.ts tests/integration/wp10b-institution-fact-verification.test.ts --hookTimeout=60000 --no-file-parallelism
```

Expected: PASS.

- [ ] **Step 2: Run typecheck and lint**

Run: `npm run typecheck`

Run: `npm run lint`

Expected: both PASS.

- [ ] **Step 3: Format only changed WP-10B files and verify formatting**

Run Prettier with the explicit paths returned by `git diff --name-only` limited to WP-10B TypeScript/Markdown files, then run `npm run format:check`.

Expected: PASS without formatting unrelated user files.

- [ ] **Step 4: Run build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 5: Run controlled full suite**

Run: `npm test -- --hookTimeout=60000 --no-file-parallelism`

Expected: PASS.

- [ ] **Step 6: Repeat mandatory concurrency test**

Run the Native concurrency test at least three times in separate Vitest invocations. Expected every run: one successor/current Version, one Change, one Outbox, no branch.

- [ ] **Step 7: Perform final scope and signal audit**

Run:

```powershell
git status --short
git diff --stat
git diff --name-only
rg -n "notifications|notificationDeliveries|deliveryAttempts|followEpisodes|monitoring_tasks|monitoring_jobs" src/modules/monitoring tests/*/wp10b*
```

Expected: only planned WP-10B files plus the two plan documents; no migration/package/Admin/auth/follow/provider edits; no Notification/Delivery/Follow write path; no task table.

- [ ] **Step 8: Run `git diff --check` and prepare the mandated report**

Expected: no whitespace errors. Record exact test commands/results, branch/baseline, diff scope, queue/no-change/Native/Legacy/Fact/Source/signal/rollback behavior, carried hardening, and `commit/push performed: NO`. Stop before WP-11.

