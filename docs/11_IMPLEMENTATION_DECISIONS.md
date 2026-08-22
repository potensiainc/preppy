# AdmissionRadar — Implementation Decisions

**Status:** STEP 0 decision record  
**Date:** 2026-08-14  
**Scope:** Reconciliation required before STEP 1 and STEP 2

## Repository preflight

- The repository contains only `docs/00_PROJECT_CONTEXT.md` through `docs/10_MVP_IMPLEMENTATION_PLAN.md`.
- There is no existing application code, package manifest, migration history, or Git repository to preserve.
- The implementation is therefore greenfield and follows the default stack in `docs/10_MVP_IMPLEMENTATION_PLAN.md`.
- The first implementation stops after STEP 2. Public pages, collection, email delivery, LLM extraction, and Admin UI are out of scope.

## Decision 1 — Application stack

**Decision**

- Node.js 22
- Next.js 16 App Router
- React 19
- strict TypeScript
- npm with a committed lockfile
- ESLint and Prettier
- Vitest for unit and database integration tests

**Reason**

This is the documented greenfield default and uses one primary language for the future public application, Admin, API, and worker.

**Tradeoff**

The application and background worker will share a repository and domain packages. This is intentionally a modular monolith rather than independently deployed services.

**Affected docs**

- `10_MVP_IMPLEMENTATION_PLAN.md` sections 2, 3, 6, and 37

## Decision 2 — Database and migration ownership

**Decision**

- PostgreSQL 15+ is the only supported database.
- Drizzle ORM and `drizzle-kit` define the typed schema and generate committed SQL migrations.
- Runtime schema synchronization is prohibited.
- Schema migrations and business seed/import data remain separate.
- Local and CI database checks run against a real PostgreSQL instance; local development uses Docker Compose when no PostgreSQL service is already available.

**Reason**

The required partial unique indexes, `UNIQUE NULLS NOT DISTINCT`, check constraints, and transactional versioning semantics must be verified using PostgreSQL rather than an in-memory substitute.

**Tradeoff**

Database integration tests require PostgreSQL. Missing production credentials do not block local verification, but production connectivity remains `UNVERIFIED_EXTERNAL`.

**Affected docs**

- `04_DATA_MODEL.md` sections 2, 42, 82, 90–92, and 124–126
- `10_MVP_IMPLEMENTATION_PLAN.md` sections 2, 6, and 7

## Decision 3 — Environment boundary

**Decision**

Server environment variables are validated lazily with Zod. STEP 1 requires:

```text
DATABASE_URL
APP_BASE_URL
ADMIN_AUTH_ISSUER
ADMIN_AUTH_CLIENT_ID
ADMIN_AUTH_CLIENT_SECRET
```

Database-only CLI commands validate only `DATABASE_URL`; application runtime paths validate the full server schema. This keeps capability boundaries explicit without weakening protocol validation.

Admin authentication will use an external OIDC provider in the later Admin step; no parent authentication or locally stored password system is introduced. Future email, object-storage, and LLM variables remain optional and are not consumed in STEP 1–2.

**Reason**

Lazy validation keeps builds deterministic while still failing clearly when a server capability requiring configuration is invoked.

**Tradeoff**

The Admin cannot run until real OIDC configuration exists. That integration is outside STEP 0–2 and remains `UNVERIFIED_EXTERNAL`.

**Affected docs**

- `01_PRD.md` sections 5, 6, and 53
- `10_MVP_IMPLEMENTATION_PLAN.md` sections 2, 6, and 29

## Decision 4 — Admission event taxonomy reconciliation

**Decision**

The implemented event taxonomy uses `APPLICATION` as one stable Event with opening and closing fields on its version. `APPLICATION_OPEN`, `APPLICATION_DEADLINE`, and `APPLICATION_PERIOD` from the earlier PRD taxonomy are treated as display/search concepts, not stored Event types.

Open House event dates remain separate from their registration windows. `ADDITIONAL_RECRUITMENT` is a separate Event; a deadline extension versions the existing Event.

**Reason**

The later and higher-priority Domain Model explicitly prohibits splitting application window boundaries into unrelated Events.

**Tradeoff**

UI and extraction layers must map several source phrases to one `APPLICATION` Event and its version fields.

**Affected docs**

- `01_PRD.md` section 8
- `03_DOMAIN_MODEL.md` sections 20–24 and 56–57
- `04_DATA_MODEL.md` sections 16 and 20

## Decision 5 — Separate state machines

**Decision**

School lifecycle, AdmissionCycle lifecycle, Event lifecycle, verification status, knowledge state, Source lifecycle/health, and derived Radar status remain separate. Radar and Source freshness are derived read concerns and are not stored as mutable truth columns.

**Reason**

`NOT_ANNOUNCED`, `NOT_FOUND`, `SOURCE_ERROR`, and `NOT_APPLICABLE` carry distinct knowledge semantics. A collection failure must never overwrite verified admission truth.

**Tradeoff**

Read queries are more explicit, but false state transitions are prevented.

**Affected docs**

- `03_DOMAIN_MODEL.md` sections 18, 46–50, 79–83, and 143
- `04_DATA_MODEL.md` sections 7, 21–24, 93–95, and 108–109
- `06_SOURCE_AND_VERIFICATION_POLICY.md` sections 22–26

## Decision 6 — Versioned verified truth

**Decision**

Admission Events and Facts use stable identity rows plus append-only version rows. Database partial unique indexes allow at most one current version. Verified critical values are never edited in place; a transaction supersedes the prior version and installs the new current version.

**Reason**

AdmissionRadar's durable asset is explainable admission history, including corrections and source changes.

**Tradeoff**

Mutations require domain services and transactions in STEP 3; direct CRUD against verified versions is not a supported application path.

**Affected docs**

- `03_DOMAIN_MODEL.md` sections 32, 102–104, and 145
- `04_DATA_MODEL.md` sections 20–32 and 96–113
- `09_ADMIN_OPERATIONS.md` sections 16–17, 27–29, and 93

## Decision 7 — Required P0 amendments

**Decision**

The first migration includes all four later amendments:

1. `source_monitor_configs` is P0 with one config per Source.
2. `source_observations` includes nullable `etag` and `last_modified` response metadata.
3. `CORRECTION` is a permitted Alert type.
4. `outbox_events` is P0 for reliable post-commit work without Kafka or Redis.

**Reason**

Collection and Alert architecture explicitly amend the earlier Data Model, and `docs/10` makes reconciliation a STEP 0 gate.

**Tradeoff**

The outbox is additional schema in STEP 2, but it avoids a future unsafe dual-write between verified truth and downstream publication/Alert jobs.

**Affected docs**

- `05_COLLECTION_ARCHITECTURE.md` sections 70–71
- `06_SOURCE_AND_VERIFICATION_POLICY.md` section 58
- `08_ALERT_ARCHITECTURE.md` sections 19, 27, and 94–95
- `10_MVP_IMPLEMENTATION_PLAN.md` sections 5 and 7

## Decision 8 — Database-level idempotency and invariants

**Decision**

PostgreSQL constraints are the final safety boundary for:

- one AdmissionCycle per School and academic year;
- one public-focus Cycle per School;
- one Event key per Cycle;
- one current EventVersion per Event;
- one current FactVersion per Fact;
- one Subscription per Subscriber and Cycle;
- one Alert per dedupe key;
- one Delivery per Alert, Subscription, and channel;
- one canonical Source URL;
- one deterministic Source binding, including nullable cycle scope.

The six STEP 2 invariants explicitly required by `docs/10` are exercised by real database integration tests that first demonstrate constraint failure before the migration is implemented.

**Reason**

Application checks alone are race-prone and cannot guarantee retry-safe operation.

**Tradeoff**

Some human-verification invariants that span evidence tables remain application/service checks and later data-quality queries because PostgreSQL row checks cannot safely enforce cross-table evidence existence.

**Affected docs**

- `04_DATA_MODEL.md` sections 24, 32, 42, 53, 67, 72, 76, and 82
- `08_ALERT_ARCHITECTURE.md` sections 24–26
- `10_MVP_IMPLEMENTATION_PLAN.md` section 7

## Decision 9 — P0 schema boundary

**Decision**

STEP 2 implements exactly the P0 tables listed in `docs/10`, including publishing and audience records needed to enforce future invariants. It does not implement School seed data, collection logic, public pages, Admin operations, delivery workers, or LLM code.

**Reason**

The schema must support the complete trusted-data path without skipping implementation order, while STEP 2 must not leak into later product work.

**Tradeoff**

Several P0 tables have no runtime consumer until later Steps. Their constraints are nevertheless migration-tested now because later work depends on them.

**Affected docs**

- `04_DATA_MODEL.md` sections 114–116
- `10_MVP_IMPLEMENTATION_PLAN.md` sections 5–8

## STEP 0 gate

**Status: PASS**

- `docs/00` through `docs/10` were read in full.
- The repository and available runtimes were inspected.
- Cross-document taxonomy and P0 amendment differences are resolved above.
- The implementation stack and local verification approach are decided.
- No production feature code was added during STEP 0.

## Decision 10 - Cross-aggregate relational integrity

**Decision**

- Composite foreign keys bind School, AdmissionCycle, Event, Fact, MeaningfulChange, Alert, and version-lineage references to the same aggregate identity.
- A version may supersede only a different version of the same Event or Fact, a predecessor may have only one successor, version numbers must increase along the lineage, and identity/lineage columns are immutable. A current version cannot be marked `SUPERSEDED`.
- AlertDelivery uses a composite Subscription/Subscriber foreign key. PostgreSQL triggers enforce that the Alert and Subscription remain in the same AdmissionCycle on delivery writes and later parent updates. Delivery validation takes row locks on both parents so concurrent parent mutations serialize rather than committing a race-created inconsistency.
- Every mutable table with an `updated_at` column uses one shared database trigger so direct SQL and future application paths have identical timestamp semantics.
- Destructive schema integration tests reject database names that are not explicitly suffixed `_test` or `_verify<digits>` and take a PostgreSQL advisory lock to isolate concurrent suite runs.

**Reason**

Independent existence foreign keys allow valid identifiers from different schools, cycles, or subscribers to be combined into an invalid domain relationship. These are durable data invariants and must not depend on a future service layer.

**Tradeoff**

The initial migration contains small PostgreSQL trigger functions that Drizzle cannot express in its TypeScript schema. They are committed SQL, covered by real PostgreSQL tests, and must be preserved when regenerating the greenfield migration.

**Affected docs**

- `03_DOMAIN_MODEL.md` sections 32, 56-57, 102-104, and 145
- `04_DATA_MODEL.md` sections 20-24, 42, 67, 72, 76, 82, and 96-113
- `08_ALERT_ARCHITECTURE.md` sections 24-27
- `10_MVP_IMPLEMENTATION_PLAN.md` section 7
