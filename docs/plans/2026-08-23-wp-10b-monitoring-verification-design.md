# WP-10B Monitoring / Verification Design

**Date:** 2026-08-23  
**Status:** Approved for implementation  
**Baseline:** `d95f29f` (`feat: add canonical source binding foundation`)  
**Branch:** `wp-10b-monitoring-verification`

## Scope

WP-10B adds the server-only application/query layer that turns canonical Source bindings into a query-driven monitoring queue and applies verified truth changes atomically. It does not add Admin routes/UI, notification recipient resolution, delivery, workers, providers, schema migrations, or packages.

The critical separation is:

```text
Source checked != Truth changed != Notification created
```

Only a verified meaningful Opportunity change produces a canonical `OpportunityChange` and, when `NOTIFIABLE`, an `OPPORTUNITY_CHANGE_PUBLISHED` Outbox event. No command in this work package creates Notification or Delivery rows.

## Approaches Considered

### 1. One monitoring service with direct table writes

This minimizes files but mixes queue projection, input validation, semantic comparison, locking, persistence, Audit, and Outbox rules. It is difficult to test policy deterministically and makes Native/Legacy ownership easy to blur.

### 2. Bounded monitoring module with explicit policies and repository operations — selected

The monitoring module owns command orchestration and query DTOs. Pure policies own priority/cadence and semantic change classification. Narrow repositories own lock/read/write mechanics. Native and Legacy verification strategies share one product-centric dispatcher and canonical result contract while retaining separate truth owners.

This fits the existing command/persistence dependency-injection style and keeps every mutation inside one caller-owned `TransactionManager` root transaction.

### 3. Generic versioning/change engine

A generic engine could abstract OpportunityVersion, AdmissionEventVersion, and InstitutionFactVersion, but the schemas and change semantics are intentionally different. It would create an over-general diff/version framework explicitly excluded by the validated architecture.

## Module Shape

Expected implementation lives primarily under `src/modules/monitoring/`:

- `contracts.ts`: strict Zod command inputs, result/DTO types, enums.
- `policy.ts`: pure queue priority/cadence, semantic comparisons, change type/materiality, deterministic dedupe keys.
- `repository.server.ts`: Source/config/observation/binding/fact/legacy persistence and `FOR UPDATE` operations.
- `monitoring-query.server.ts`: side-effect-free canonical binding queue projection.
- `source-commands.server.ts`: observation, no-change, unavailable, moved, bind/unbind orchestration.
- `verification.server.ts`: product-centric dispatcher plus Native, Legacy-backed, and InstitutionFact verification.

Small extensions to the existing admissions/institution repositories are allowed only when they preserve current ownership and avoid duplicated root reads/locks. `AuditWriter` metadata is extended only with bounded UUID/identifier fields required by these commands.

## Monitoring Queue

The queue is a read-only projection over:

```text
enabled source_monitor_configs
+ ACTIVE sources
+ active institution_source_bindings/opportunity_source_bindings
+ latest source_observation per Source
+ current Institution/Opportunity truth
```

No legacy `source_bindings` fallback and no Evidence-derived pseudo-binding are used. Institution and Opportunity binding queries return a common DTO and are merged by deterministic application policy.

Because the canonical binding tables use composite keys, `bindingId` is a stable, non-persisted opaque key derived from target type, target UUID, Source UUID, and role. It is not a new database identity.

Priority is projected as:

- `P3_PASSIVE`: Source/config disabled, manual strategy/profile, or Institution closed/archived.
- `P0_ACTIVE`: relevant current published Opportunity is `OPEN`.
- `P1_UPCOMING`: relevant current published Opportunity is upcoming within the policy window.
- `P2_WATCH`: otherwise monitorable.

Cadence is deterministic:

- custom interval when present;
- otherwise P0 = 1 day, P1 = 2 days, P2 = 7 days;
- P3 has no automatic `nextDueAt`.

An unobserved automatic item is due immediately. Otherwise `nextDueAt = latest observedAt + interval`. Ordering is overdue first, priority rank, `nextDueAt` with nulls last, then stable binding key. Reads create no task, claim, or Observation.

## Source Observations and No Change

`RecordSourceObservation` validates the existing outcome vocabulary and same-Source Snapshot reference. It persists only fields present in `source_observations`; raw HTML is never accepted.

`ConfirmNoChange` runs one root transaction:

```text
lock/validate Source
insert SourceObservation(UNCHANGED, server occurredAt)
insert Source-targeted Audit(CONFIRM_NO_CHANGE)
commit
```

It creates no Version, MeaningfulChange, OpportunityChange, customer Outbox, Notification, or Delivery, and it does not change Opportunity/Fact verification timestamps or root `updated_at` values.

Source failure outcomes record operational evidence and Audit only. A failed Source never changes Opportunity business state or InstitutionFact truth.

## Canonical Source Binding Commands

Bind commands validate target, Source, allowlisted role, active lifecycle, exact duplicate/rebind state, and primary uniqueness. Existing inactive exact rows are reactivated so history remains in the same logical binding row. An already-active exact binding is an idempotent result when requested primary state matches; conflicting primary state is rejected rather than silently reinterpreted.

Unbind commands set `is_active=false` and `unbound_at=ctx.occurredAt`. Already inactive is idempotent. Every operator mutation writes Audit in the same transaction. Binding mutations never create product signals.

## Explicit Source Move Contract

```ts
type SourceMoveMode = "URL_CORRECTION" | "SOURCE_REPLACEMENT";
```

The system never infers the mode.

### URL_CORRECTION

This is narrowly allowed only when the operator has explicitly established provenance continuity. The command requires the explicit mode and a reason code, locks the Source, validates the new canonical HTTP(S) URL and uniqueness, updates only `sources.canonical_url`/`updated_at`, preserves Source identity and all bindings/Evidence, and writes Audit.

It creates no Observation unless observation data is explicitly supplied through the Source check contract, and no truth Version, OpportunityChange, or customer Outbox.

### SOURCE_REPLACEMENT

This is used when a new provenance identity is required. In one root transaction it:

1. locks the old Source;
2. creates a new Source or reuses an explicitly identified compatible Source;
3. creates/reactivates equivalent canonical Institution and Opportunity bindings on the new Source;
4. deactivates the old active canonical bindings at `ctx.occurredAt`;
5. retires the old Source and updates its timestamp;
6. writes Source and binding-context Audit entries.

Past Evidence rows are immutable and keep the old `source_id`. Monitor configuration is copied only for a newly created Source; an explicitly reused Source retains its existing configuration. A conflict in role/primary uniqueness aborts the entire transaction. No automatic Source equivalence or replacement inference is performed.

Both move modes create zero Opportunity/Fact truth mutations, OpportunityChanges, customer Outbox events, Notifications, or Deliveries.

## Verify Opportunity Dispatcher

The public application command is product-centric. It accepts an Opportunity ID but never accepts `truthMode`. Inside the root transaction it locks the Opportunity, reads server-owned `truth_mode`, then dispatches:

- `NATIVE` -> Native strategy;
- `LEGACY_BACKED` -> Legacy strategy.

Direct strategy entry points still validate the required truth mode so tests and future internal callers cannot cross ownership boundaries.

All inputs are strict allowlisted state/evidence objects. Source, Observation, and Snapshot consistency is validated before inserts even though the database also enforces it. Only active canonical Opportunity Source bindings with official authority may support verified Opportunity truth.

## Native Verification

The Native strategy locks Opportunity then current Version, validates `expectedCurrentVersionId`, normalizes the proposed state, and performs semantic comparison.

If unchanged, it records `SourceObservation(UNCHANGED)` and Audit only and returns `NO_CHANGE`.

If changed, one transaction performs:

```text
old current -> SUPERSEDED/is_current=false
insert next VERIFIED/current OpportunityVersion
insert OpportunityVersionEvidence
derive canonical change type/materiality
insert exactly one OpportunityChange
insert Audit
enqueue Outbox when NOTIFIABLE
```

The new Version points to the prior current Version and increments by one. An initial verified Version produces `NEW_OPPORTUNITY` only when the Opportunity is already `PUBLISHED`; otherwise it records verified draft truth without a customer-facing canonical signal.

Change precedence is deterministic: cancellation, application boundary transition, deadline, event date, business status, then material information. Typos/wording-only fields default to `NON_NOTIFIABLE`; actionable date/status/cancellation transitions default to `NOTIFIABLE`. A materiality override requires a non-empty canonical reason and is captured in Audit.

Retry uses `expectedCurrentVersionId`, row locking, Version lineage uniqueness, and deterministic Change/Outbox dedupe keys. A retry after success either returns the already-created logical result when its candidate fingerprint matches or raises typed conflict; it never creates another Version branch or signal.

## Legacy-backed Verification

The Legacy strategy locks the canonical Opportunity, validates the explicit Opportunity↔AdmissionEvent bridge, then locks the legacy Event/current EventVersion. `AdmissionEventVersion` remains the truth owner; no `OpportunityVersion` is written.

For a real change it supersedes the legacy current Version, inserts the next EventVersion and `event_version_evidence`, creates the legacy `MeaningfulChange` required by existing semantics, maps it exactly once to canonical `OpportunityChange`, writes Audit, and enqueues the same canonical Outbox contract when `NOTIFIABLE`.

The canonical Change links the bridge Event and MeaningfulChange and uses existing unique constraints for exactly-once canonicalization. Legacy Alert/AlertDelivery are never written.

An unchanged candidate follows Observation/Audit-only semantics.

## Verify InstitutionFact

The command locks Institution and logical Fact/current FactVersion, validates an active canonical Institution binding and same-Source provenance, then compares normalized `valueJson`, display text, and validity fields.

Changed truth supersedes the old current FactVersion, inserts the next VERIFIED/current FactVersion, Evidence, and Audit. A missing logical Fact is created in the same transaction. Unchanged truth records Observation/Audit only.

Fact verification creates no OpportunityChange and no customer Outbox by default.

## Canonical Change and Outbox

Canonical signals use server-controlled `verifiedAt/publishedAt = ctx.occurredAt`. Deterministic keys are based on immutable origin identity:

- Native: Opportunity ID + destination Version ID/change classification.
- Legacy: Opportunity ID + MeaningfulChange ID.

For a `NOTIFIABLE` canonical Change, the same transaction calls `OutboxWriter.enqueue` with:

```text
eventType: OPPORTUNITY_CHANGE_PUBLISHED
aggregateType: OPPORTUNITY_CHANGE
aggregateId: OpportunityChange.id
payload: minimal canonical IDs + policyVersion
dedupeKey: stable key derived from OpportunityChange identity/policy version
```

`NON_NOTIFIABLE` changes remain canonical history but do not enqueue a customer-resolution Outbox event. An Outbox failure rolls back truth, Evidence, Change, and Audit.

## Error and Concurrency Semantics

- malformed/unknown input -> `ValidationError`;
- missing aggregate/Source/binding -> `NotFoundError` or `NotEligibleError` as appropriate;
- stale expected version, primary collision, incompatible rebind/replacement, or lineage race -> `ConflictError`;
- database constraint failures are mapped to safe application errors.

The lock order is stable: product root, truth root/current Version, Source/binding rows. Concurrent Native verification of the same expected Version yields one valid successor/current Version and one idempotent result or conflict, with one Change and one Outbox event.

## Testing Strategy

Strict TDD covers pure policies first, then integration behavior:

- queue canonical coverage, priority/cadence/due/order, Native institution without legacy School, zero read side effects;
- no-change Observation/Audit-only and zero truth/signal writes;
- Native changed/no-change/wrong-mode/retry/concurrency/rollback/evidence mismatch;
- Legacy changed/no-change/wrong-mode/exactly-once canonicalization and zero OpportunityVersion writes;
- InstitutionFact changed/no-change and zero signal writes;
- bind/duplicate/primary/unbind/rebind lifecycle and transactional Audit;
- unavailable operational-only behavior;
- both explicit move modes, rollback, binding transfer, and immutable historical Evidence;
- Outbox failure full rollback.

Final verification runs focused tests, controlled full suite, typecheck, lint, changed-file format check, and build. No commit or push is performed.

