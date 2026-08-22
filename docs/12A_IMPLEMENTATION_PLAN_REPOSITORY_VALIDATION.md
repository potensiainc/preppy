# 12A Implementation Plan Repository Validation

> **Project:** PREPPY (프레피)  
> **Validation Target:** `docs/12_IMPLEMENTATION_PLAN.md`  
> **Validated Contracts:** `docs/10_PRD.md`, `10A`, `11_API_CONTRACT.md`, `11A`  
> **Date:** 2026-08-22  
> **Verdict:** `VALID_WITH_IMPLEMENTATION_ADJUSTMENTS`

---

# 1. Validation Scope and Evidence

이 문서는 implementation plan을 다시 작성하거나 구현을 시작하지 않는다. `12_IMPLEMENTATION_PLAN.md`를 00–11A의 validated Product/API/Architecture contract와 현재 repository의 package, DB runtime, migration history, schema, route, scripts, writer paths, test harness에 대조했다.

Validation states:

```text
SUPPORTED
SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT
CONFLICT
NOT_VERIFIABLE
```

Repository evidence states:

```text
DOCUMENTED
IMPLEMENTED
TESTED
NOT_IMPLEMENTED
NOT_FOUND
NOT_VERIFIABLE
```

검증한 `12_IMPLEMENTATION_PLAN.md`는 3,259 lines, 44,719 bytes이며 SHA-256은 `835AD127113D03E33AC3321C822C74AFE7709EEF3FB5E26F5DD37C8162AFB400`다.

---

# 2. Executive Verdict

**Implementation Plan: VALID_WITH_IMPLEMENTATION_ADJUSTMENTS**

WP-00→18의 전체 방향은 current repository에서 실행 가능하다. Additive migration, command-owned transaction, DB idempotency, silent backfill, public/private cache separation, Outbox/worker reliability, late production cutover, vertical-slice gates가 10/10A/11/11A와 일치한다. MVP non-scope infrastructure도 요구하지 않는다.

현재 plan을 더 안전하고 실행 가능하게 만드는 조정은 다음과 같다.

1. 첫 coding phase를 Institution migration과 합치지 않고 **Phase 0A: DB runtime + transaction/error foundation**으로 격리한다.
2. WP-02를 root/bridge와 Native history/change/fact subphase로, WP-04를 Outbox hardening·Notification·Article subphase로 나눈다.
3. Outbox hardening과 tests를 canonical Notification writer보다 먼저 완료한다.
4. public Institution/Opportunity reads와 page shell은 일찍 시작하되 Article read는 Article schema/sanitized seed 이후 연결한다.
5. typed analytics registry/fake adapter를 일찍 두고 실제 GA4 adapter는 WP-14에 둔다.
6. production backfill/cutover 전에 backup/restore readiness와 baseline observability를 선행한다.

마지막 항목은 현재 top-level execution order를 그대로 따르면 `WP-15 production cutover → WP-16 backup/restore`가 될 수 있으므로 **required Plan amendment candidate**다. 이는 Phase 0 착수를 막지 않지만 production data mutation 전 반드시 반영해야 한다.

| Decision | Result |
|---|---|
| Ready for First Coding Phase | **YES** |
| Current implementation plan executable | **YES_WITH_IMPLEMENTATION_ADJUSTMENTS** |
| Immediate coding blocker | **NONE** |
| Required Plan amendment | **1 — Production sequencing** |
| Recommended first phase | **Option A: Phase 0A only** |
| Production-ready now | **NO** |

---

# 3. Repository Starting Point Verification

| Plan Claim | Repository Evidence | Classification | Result |
|---|---|---|---|
| Next.js 16.3 / React 19 / TS / Zod | `package.json` | IMPLEMENTED | MATCH |
| PostgreSQL/Drizzle/postgres.js | pinned dependencies and migration module | IMPLEMENTED | MATCH |
| Runtime DB client `max:1` | `src/db/connection.ts` singleton `postgres(...,{max:1})` | IMPLEMENTED | MATCH; production concurrency gap |
| Runtime Drizzle instance | none; only `src/db/migrate.ts` constructs migration-local Drizzle | NOT_FOUND | Plan correctly adds runtime instance |
| Transaction helper/context | none | NOT_FOUND | WP-00 prerequisite confirmed |
| Migrations | `0000_absent_shen.sql`, `0001_productive_morph.sql` | IMPLEMENTED | next migration must append after journal idx 1 |
| Legacy schema | 28 application tables in schema/migration | IMPLEMENTED+TESTED | MATCH |
| Lineage triggers | Event/Fact successor indexes + dedicated validation functions/triggers in 0001 | IMPLEMENTED+TESTED | reusable pattern, do not edit history |
| Admin/Audit | `admin_users`, `audit_logs` | IMPLEMENTED | runtime absent |
| Outbox | status/available/processed/attempt basic skeleton | IMPLEMENTED+PARTIALLY_TESTED | hardening required |
| Public runtime | `/api/health` only | IMPLEMENTED+TESTED | all Product routes absent |
| Canonical target model | docs only | NOT_IMPLEMENTED | WP-01–04 required |
| Test DB | Postgres 16 Docker + `admissionradar_test` guard | IMPLEMENTED+TESTED | adequate foundation |
| Browser E2E | no Playwright/Cypress config/package | NOT_FOUND | not an early blocker |

Current public health returns `service: "admissionradar"`; package/database/migration naming also retains AdmissionRadar. Naming cleanup is not a first-phase requirement and must not be mixed with transaction infrastructure unless a validated product decision explicitly requires it.

---

# 4. DB Runtime and Transaction Foundation

## 4.1 Phase 0A Separation

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

Phase 0A must be separate from WP-01 Institution migration. It changes connection lifecycle, pool behavior, runtime Drizzle/raw access, transaction typing, error mapping, and env parsing—high-leverage cross-cutting code. Combining it with the first canonical schema migration increases rollback and diagnosis scope without accelerating the vertical slice.

Recommended responsibility split:

```text
Phase 0A
  runtime DB client/pool
  runtime Drizzle instance
  transaction manager/context
  server-only boundary
  ApplicationError + safe mapper
  correlation utility
  capability-scoped env parsing/default-safe switches
  tests

Phase 0B
  Institution additive migration/schema/backfill dry-run/tests
```

## 4.2 Transaction Context Pattern

**Status: SUPPORTED**

Use dependency injection of a transaction-scoped DB interface, not a new framework:

```text
DatabaseExecutor = runtime Drizzle DB | Drizzle transaction
TransactionManager.run(callback(tx))
Repository methods accept executor/tx explicitly
```

An equivalent transaction-scoped repository factory is also valid if it keeps one concrete DB interface. Prefer explicit executor injection because the current repository is small and has no DI container. CompleteSignup, VerifyOpportunity, DeleteUser, and PublishArticle orchestration receive one `tx`; their internal operations must not call a helper that starts a nested transaction.

Raw PostgreSQL remains available through a narrow transaction-aware adapter for `FOR UPDATE`, `SKIP LOCKED`, deferred constraint checks, and migration/invariant queries that are awkward in Drizzle. Do not maintain unrelated raw and Drizzle connections inside one logical command.

## 4.3 Pool and Environment

The current singleton `max:1` serializes runtime work and is unsuitable for web+worker concurrency. Implement environment-aware pool configuration but do not hardcode a production number before hosting connection limits are known. Web and worker may use separate process-local pools while sharing the same connection module/contract.

Keep env schemas capability-scoped:

- database scripts require only database config;
- web/auth requires session/OAuth config when that capability is enabled;
- worker requires Outbox/worker/provider config;
- disabled Email/Analytics must not require live provider secrets;
- non-production side-effect switches default false/Noop.

Do not make `db:migrate` fail because Kakao, GA4, or Email credentials are not configured.

---

# 5. Migration Inventory and Ownership

## 5.1 Existing History

| Migration | Content | Ownership / Rule |
|---|---|---|
| `0000_absent_shen.sql` | initial 28 legacy tables, FKs, checks, indexes, updated-at and legacy consistency triggers | immutable applied history |
| `0001_productive_morph.sql` | Event/Fact one-successor unique indexes and dedicated lineage validation triggers | immutable applied history |

Drizzle journal has indexes 0 and 1. New migrations must be generated/appended after `0001`; WP labels are planning labels and must not be used as migration numbers. Do not edit or squash 0000/0001.

Actual production row counts, slug collisions, legacy Guide/Update/Subscriber/Alert usage, and existing Outbox rows are `NOT_VERIFIABLE` from repository files. Every schema phase therefore needs fixture validation plus a production read-only preflight before backfill/constraint tightening.

## 5.2 WP-01 Institution

**Status: SUPPORTED**

Keep WP-01 independent. `schools.id` and target Institution IDs are UUID-compatible, `schools.slug` already has a unique index, and current references remain on legacy School. Add `institutions` and a 1:1 bridge without rewriting existing FKs. Native 영유 without a School is supported.

Preflight must detect slug/name/region/type inconsistencies before deterministic backfill. A conflict policy must be explicit; do not silently suffix a canonical slug in production. Institution and Opportunity migrations should remain separate because Opportunity depends on the completed Institution bridge, while Institution has value and tests on its own.

## 5.3 WP-02 Opportunity/Trust

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

WP-02 is logically coherent but too large for one migration/review unit. Split:

```text
WP-02A
  opportunities root
  opportunity_admission_event_links
  Institution/Event aggregate consistency
  deterministic silent bridge backfill

WP-02B
  opportunity_versions + dedicated lineage trigger
  evidence/source ownership reinforcement
  opportunity_changes
  institution_facts/version/evidence
  Native and Legacy change mapping tests
```

The split reduces trigger/composite-FK/backfill blast radius and allows canonical read projection after 02A while 02B trust history is completed. Runtime verification still waits for 02B.

## 5.4 WP-03 Identity/Follow

**Status: SUPPORTED**

No table-name collision exists with legacy `subscribers`/`subscriptions`. Canonical User/AuthIdentity/Email/Consent/Preference/Follow/Episode must be new tables; never auto-migrate or merge legacy Subscriber by email. WP-03 can be its own batch after Institution because Follow FK targets Institution. Notification depends on WP-03, not vice versa.

PII child physical-delete semantics and historical User-anchor RESTRICT FKs must be tested before any auth runtime.

## 5.5 WP-04 Split and Ordering

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

Notification, Article/Redirect, and Outbox have different dependencies and operational blast radii. Do not force one migration or one review:

```text
WP-04A — Outbox hardening
  nullable-add
  inspect/backfill legacy rows
  partial/new-writer dedupe uniqueness
  lease/dead-letter indexes and state checks
  claim/recovery tests

WP-04B — Notification
  notifications
  notification_deliveries
  delivery_attempts
  provider/message partial unique
  webhook receipt/dedupe extension if provider contract requires

WP-04C — Editorial/URL
  articles
  article relations
  url_redirects
  relation/slug/redirect constraints
```

04A must complete before any canonical Notification writer enqueues work. 04B depends on OpportunityChange and User/Follow. 04C depends on Institution/Opportunity roots but is otherwise parallelizable with Identity/Notification work.

Existing Outbox rows with no reconstructible stable dedupe key must remain legacy-null under a partial unique constraint; fake dedupe backfill is less safe than explicit legacy compatibility.

---

# 6. Existing Writer Freeze Audit

**Status: SUPPORTED**

`app/**`, `src/**`, and `scripts/**` contain no Product insert/update/delete writer path. Runtime code only serves static health and DB connection/migration checks. Legacy writes appear in integration tests only. Therefore there is no live Subscriber/Subscription/Alert/AdmissionEvent/Guide/Update application writer to freeze before canonical migration.

Required precautions:

- preserve legacy tables/triggers/tests;
- do not reinterpret legacy writers as canonical services;
- production external/manual writers remain `NOT_VERIFIABLE` and must be included in preflight/operator audit;
- once canonical Admin writes exist, explicitly prevent new Product code from writing legacy Alert/Subscriber paths.

---

# 7. Public Read and Early Acquisition Slice

## 7.1 Public Read Timing

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

After WP-01 + WP-02A/02B, Home/Institution/Opportunity query services and server pages can start without Identity, Notification, or full CMS. Split WP-06:

```text
WP-06A Institution/Opportunity/Home public projections
WP-06B Article query after WP-04C
```

The current dependency graph shows WP-06 branching from WP-02, but `getArticleBySlug` also depends on WP-04C. Add that dependency in execution tracking. Public pages may show a Follow placeholder before WP-09, but public cache must never contain User state.

## 7.2 Small Acquisition Vertical Slice Before CMS

**Status: SUPPORTED**

A controlled, manually seeded Article can support:

```text
Article → Institution → Follow intent → mock Kakao → onboarding → Follow → My Preppy
```

before the WYSIWYG/CMS Admin UI. Requirements:

- Article schema/relations from WP-04C exist;
- content is code-controlled or passed through the server sanitizer before public rendering;
- Article page is SSR and links canonical Institution;
- mock/test auth adapter returns normalized provider identity but exercises the real application commands/DB constraints;
- this slice does not waive launch requirement for full Article CMS/SEO or real Kakao verification.

Move a minimal sanitizer capability before any untrusted DB HTML render. Full editor/preview/SEO Admin remains WP-13.

---

# 8. Auth, Admin, Notification, CMS, and Analytics Timing

## 8.1 Kakao/Auth

**Status: SUPPORTED**

Provider interface, deterministic mock, OAuth-state store/cookie, onboarding and Follow integration can be implemented/tested before real Kakao credentials. Real provider adapter/config is required only for WP-08 production exit. Provider selection must not block WP-00–07 or command tests.

## 8.2 Admin

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

Command-first is correct. The Admin layout, auth guard, noindex/no-store shell, navigation, safe DTO components, and fake query states may proceed in parallel after WP-00/current `admin_users`. Monitoring mutation UI must wait for WP-10 commands and must never introduce temporary direct SQL/CRUD shortcuts. Monitoring Admin is the first usable operator screen; broad visual polish can wait.

## 8.3 Notification Worker

**Status: SUPPORTED**

Runtime dependency is:

```text
OpportunityChange
+ User/FollowEpisode/Consent/Preference
+ WP-04A hardened Outbox
+ WP-04B Notification/Delivery/Attempt
+ application transaction/repository layer
→ notification policy/resolver/worker
→ provider adapter
```

Build Noop/Test EmailSender and deterministic worker tests before RealEmailSender. Do not connect a real provider to an unhardened Outbox or before send-time eligibility/ambiguity tests pass.

## 8.4 CMS/SEO

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

WP-13 is not too late for full CMS/SEO, because WP-07 already delivers basic SSR public pages. However metadata/canonical/noindex foundations and a minimal sanitizer should be pulled forward alongside the first public pages/seeded Article. Full editor, preview, relations UI, sitemap/robots, structured data, redirect operations, and SEO regression suite remain WP-13.

## 8.5 Analytics

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

Create typed event names/property allowlists and Noop/Test AnalyticsTracker in WP-05 or early WP-07. Add event emission hooks with each owning WP so Follow/signup/verification/notification behavior is tested when built. Keep production GA4 transport, consent/config, dashboard and final DB KPI queries in WP-14. All server tracking remains best-effort after commit.

---

# 9. Backfill, Cutover, and Production Operations

## 9.1 Backfill Timing

**Status: SUPPORTED**

Schema-specific fixture backfill/dry-run code belongs with WP-01/02 migrations. Production inventory, full data backfill and writer/read cutover belong late, after canonical repository/query/command paths are proven. WP-15's no-signal, idempotent, rerunnable checks are correct. User/Follow must never be synthesized from Subscriber/Subscription.

## 9.2 Production Sequence

**Status: CONFLICT — PLAN AMENDMENT REQUIRED BEFORE PRODUCTION CUTOVER**

The top-level plan and Batch 5 order place WP-15 before WP-16, while backup, restore drill, observability, and migration runbook are currently inside WP-16. Executing WP-15 production backfill/cutover literally before these controls violates 09A/10/10A launch requirements and the plan's own safe migration rule.

Required safe sequence:

```text
WP-15A
  repository tooling
  read-only production preflight
  non-prod rehearsal
  dry-run/idempotency/signal-silence evidence

WP-16A
  automated backup + retention visibility
  restore target/procedure and successful non-prod restore drill
  structured migration/worker error monitoring baseline
  migration runbook + secrets + side-effect isolation

WP-15B
  fresh backup confirmation
  production additive migration/backfill
  constraint/data validation
  canonical read/write cutover
  smoke and forward-fix/rollback decision

WP-16B
  final Admin/provider/kill-switch/uptime/process validation
  post-cutover monitoring and evidence package
```

This amendment does not delay Phase 0–14 or non-production WP-15 rehearsal. It is mandatory before any material production write/cutover.

---

# 10. Test Harness Adequacy

## 10.1 Existing Capability

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

Vitest Node environment, Postgres 16 Docker, dedicated test DB guard, Drizzle migrations, raw postgres.js, constraint/trigger tests, and an existing multi-client blocking test are sufficient for the required DB/command/concurrency suite. No testcontainers dependency is required.

The main integration client uses `max:1`, but the existing concurrency test already creates separate postgres.js clients. Extend this pattern or provide a test transaction/pool factory for:

- duplicate OAuth identity creation;
- double Follow/reactivation;
- two Verify submissions;
- two `SKIP LOCKED` claimers;
- lease expiry/crash recovery;
- preference/delete races with pending send;
- duplicate/out-of-order webhook.

Use deterministic barriers/advisory locks/state queries instead of timing-only sleeps where possible. Keep tests serialized around migration/truncate via the existing advisory lock; concurrency happens inside a test with explicit clients.

## 10.2 Route and E2E

No browser E2E framework exists. This is not a Phase 0 or schema blocker. Start with:

1. unit tests for schemas/error/auth/cookie utilities;
2. command/repository integration tests against PostgreSQL;
3. Route Handler tests for auth/status/CSRF/safe errors;
4. minimal browser E2E only when the Article→Kakao mock→My Preppy and Admin→Email fake flows exist.

Playwright or another browser tool may be selected later; do not install it before a concrete WP-17 browser journey requires it.

## 10.3 Backup/Restore External Evidence

Managed backup retention, restore drill, external error/uptime/process monitoring, production provider/TLS, and hosting pool limits are `NOT_VERIFIABLE` from repository. Track each as a named launch checklist item with owner, environment, evidence link/date, last successful result, and blocking status. A code checkbox or Docker volume is not proof.

---

# 11. Work Package Traceability

## 11.1 Functional Requirements

| Product Group | Primary WPs | Vertical/Launch Proof | Result |
|---|---|---|---|
| FR-PUB | 01,02,04C,06,07,13 | 17/18 public journeys | MAPPED |
| FR-AUTH | 00,03,05,08 | 17 acquisition flow/security tests | MAPPED |
| FR-FOL | 01,03,05,08,09 | 17 activation/negative tests | MAPPED |
| FR-MYP | 03,05,09 | 17 Follow/current data flow | MAPPED |
| FR-MON | 01,02,05,10,11 | 17 monitoring flow | MAPPED |
| FR-NOT | 02,03,04A,04B,05,12 | 17 notification flow | MAPPED |
| FR-SEO | 04C,06,07,12,13 | 17/18 SEO/cache gates | MAPPED |
| FR-ANA | early registry/hooks, 14 | 17/18 analytics gate | MAPPED_WITH_SEQUENCING_NOTE |
| FR-ADM | 05,10,11,12,13,16 | 17/18 operator/ops gates | MAPPED |
| Scenario H Delete | 03,05,09,12 | deletion/send-race tests | MAPPED |

## 11.2 Non-functional Requirements

| NFR Group | WPs | Result |
|---|---|---|
| NFR-INT | 01–05,08–12,15 | DB/command/migration tests | MAPPED |
| NFR-SEC | 00,03,05,08,09,11–13,16 | security tests + production evidence | MAPPED |
| NFR-REL | 04A/04B,05,10,12,16,17 | worker/cache/provider recovery | MAPPED |
| NFR-SEO | 04C,06,07,13,17,18 | render/index/redirect/freshness | MAPPED |
| NFR-OPS | 00,11,12,15A,16A/16B,18 | backup/observability/switches/health | MAPPED_AFTER_AMENDMENT |

## 11.3 Launch Gates

| Launch Gate | WPs | Result |
|---|---|---|
| Product | 06–13,17,18 | MAPPED |
| Data | 01,02,04C,15,17,18 | MAPPED |
| Security | 00,03,08,09,11–13,16,18 | MAPPED |
| Reliability | 04A/04B,05,10,12,16,17,18 | MAPPED |
| Operations | 11,12,15A,16A/16B,18 | MAPPED_AFTER_AMENDMENT |
| SEO | 04C,06,07,12,13,17,18 | MAPPED |
| Analytics | early registry/hooks,14,17,18 | MAPPED_WITH_SEQUENCING_NOTE |

WP-18 Launch Readiness receives the final Product, Data, Security, Reliability, Operations, SEO, and Analytics evidence from the mapped packages.

No launch-critical repository task is absent. Production sequence, early analytics hooks, minimal sanitizer, transaction pool/context, and webhook receipt are present conceptually but require the sequencing refinements above.

---

# 12. Recommended Critical Path

```text
Phase 0A DB runtime / pool / transaction / error foundation
→ Phase 0B Institution schema + bridge
→ WP-02A Opportunity root + legacy bridge
→ WP-02B version/evidence/change/fact
→ WP-03 Identity/Follow schema
→ WP-04A Outbox hardening
→ WP-04B Notification schema
→ WP-05 application command/repository foundation
→ WP-08/09 Auth + Follow + My Preppy
→ WP-10 verification commands
→ WP-11 monitoring Admin minimum
→ WP-12 notification resolver/worker/Email fake then real adapter
→ WP-17 vertical slice rehearsal
→ WP-16A production safety evidence
→ WP-15B production backfill/cutover
→ WP-16B/18 final operations and launch gates
```

Public and editorial branch:

```text
WP-01 + WP-02A/02B
→ WP-06A public Institution/Opportunity queries
→ WP-07 public pages

WP-04C Article/redirect
→ sanitizer + seeded Article/WP-06B
→ WP-13 full CMS/SEO
```

The two branches converge before the full production vertical slice.

---

# 13. Parallelizable Work

| Work | Earliest Safe Start | Constraint |
|---|---|---|
| Public page shell/components | after DTO contracts/Phase 0A | no direct DB/private cache |
| Institution/Opportunity queries | after WP-02 schema contract | canonical projections only |
| Article schema/editor research | after relation contract stable | sanitizer before untrusted render |
| Admin shell/auth UI | after Phase 0A/current admin model | no mutation shortcut |
| Admin Monitoring UI | after WP-10 command/result schemas | calls typed commands only |
| Mock Kakao adapter/onboarding UI | after WP-03 + auth interface | real provider later |
| Email templates/Noop adapter | after message DTO stable | no real send before WP-12 gates |
| Analytics registry/Noop adapter | WP-05/07 | provider transport deferred |
| Production provider evaluation | parallel throughout | cannot change canonical contracts silently |
| Backup/observability procurement | before WP-16A, can start early | evidence required before production mutation |

Unsafe parallelization remains: schema vs dependent repository writes, Follow vs unfinished User constraints, worker vs Outbox hardening, Admin verification mutation UI vs command, and production backfill vs migration/backup readiness.

---

# 14. Recommended First Coding Phase

**Selected: Option A — Phase 0A: DB Runtime + Transaction Context + Error Foundation**

## 14.1 Exact Scope

1. Replace/extend the runtime singleton connection boundary with a lifecycle-safe environment-aware postgres.js pool.
2. Export one runtime Drizzle DB bound to that client while preserving a narrow raw SQL capability.
3. Define the transaction-scoped executor/type and `TransactionManager.run` contract.
4. Prove repository operations share the same transaction and rollback together.
5. Add server-only import boundary/convention without breaking Node tests/migration scripts.
6. Add typed `ApplicationError`, safe HTTP mapping, Zod issue allowlisting, and server correlation ID.
7. Extend env parsing only for pool/safety/foundation needs; retain separate database/web/worker capability schemas and safe defaults.
8. Preserve current migration behavior, test DB safety, and `/api/health` semantics.

## 14.2 Likely Files Touched

Exact names may adapt, but expected scope is limited to:

```text
src/db/connection.ts
src/db/migrate.ts only if compatibility typing is necessary
src/infrastructure/db/* or equivalent
src/application/errors/* or equivalent
src/application/context/* or equivalent
src/config/env.ts
.env.example
tests/unit/env.test.ts
tests/unit/*error/context*.test.ts
tests/integration/*transaction*.test.ts
README/docs only if runtime usage must be documented
```

No production migration should be created in Phase 0A.

## 14.3 Required Tests

- existing env, health, migration and DB safety tests remain green;
- pool/config parses valid values and rejects unsafe values;
- disabled side effects do not require provider credentials;
- two repository writes in one shared transaction commit together;
- a thrown error rolls both writes back;
- transaction handle identity proves nested independent transaction is not used;
- at least two independent DB clients can execute a deterministic concurrency probe;
- unknown DB error maps to safe INTERNAL_ERROR without SQL/PII;
- known conflict maps to typed `CONFLICT` where identifiable;
- client-provided correlation is not trusted as canonical.

## 14.4 No-go Items

```text
no Institution table/migration
no canonical Product schema
no auth/session route
no UI/page work
no worker/provider connection
no new framework/DI container
no production pool-size guess presented as final
no edits to 0000/0001 migrations
no broad rename AdmissionRadar→PREPPY
```

## 14.5 Completion Report

The phase report must list changed files, tests run/results, DB lifecycle and transaction API, any package change with justification, architecture deviations, implementation adjustments, blockers, and explicitly stop before Phase 0B.

---

# 15. First Phase Acceptance Criteria

Phase 0A passes only when:

```text
[ ] runtime pooled postgres client exists with explicit lifecycle
[ ] runtime Drizzle instance exists
[ ] migration client remains isolated and closes safely
[ ] transaction-scoped executor/repository contract is typed
[ ] shared transaction commit and rollback integration tests pass
[ ] nested independent transaction path is absent or explicitly rejected
[ ] deterministic multi-client concurrency test passes
[ ] database-only scripts do not require unrelated provider secrets
[ ] side-effect defaults are safe
[ ] typed errors/correlation serialize without SQL, stack, raw values, or PII
[ ] current /api/health response and existing tests remain unchanged/passing
[ ] no schema or migration was created
[ ] completion report is produced and implementation stops
```

---

# 16. Implementation Plan Amendment Candidate

## Implementation Plan Amendment Candidate #1

**Section/WP:**  
Sections 139–155 and 172 Batch 5 — WP-15 Seed/Backfill/Cutover before WP-16 Production Operations

**Repository Evidence:**  
Repository contains only a local Docker named volume, migration scripts, and local DB tests. There is no automated production backup/retention, restore procedure/drill evidence, structured error monitoring, worker/process uptime monitoring, or production migration runbook.

**Problem:**  
Executing WP-15 production backfill/cutover before WP-16 can mutate/cut over production data without recoverability and detection controls. This contradicts 09A/10A production launch blockers and the safe migration requirement that backup precede risky production work.

**Recommended Amendment:**  
Split WP-15 and WP-16 and enforce:

```text
WP-15A preflight/non-prod rehearsal
→ WP-16A backup/restore drill + baseline observability + migration runbook
→ WP-15B production migration/backfill/cutover
→ WP-16B post-cutover/final operations verification
```

Update the critical dependency graph and Batch 5 gate so WP-15B cannot start without WP-16A evidence.

**Why subphase adjustment alone is insufficient:**  
The current top-level dependency graph and Batch 5 list are executable ordering contracts. A verbal implementation note can be missed by a phased executor; the production gate must be machine/operator-visible in the plan itself. This amendment is required before production execution, though it does not block Phase 0A coding.

---

# 17. Required Questions

| Question | Answer |
|---|---|
| Q1. Current repo에서 실행 가능한가? | **YES_WITH_IMPLEMENTATION_ADJUSTMENTS** |
| Q2. Plan amendment가 필요한가? | **YES — production WP-16A must precede WP-15B** |
| Q3. 가장 먼저 구현할 것은? | **DB runtime/pool + transaction context + error/correlation foundation** |
| Q4. 독립 Phase 0A로 분리해야 하는가? | **YES** |
| Q5. WP-01–04 grouping이 안전한가? | **YES_WITH_SUBPHASES**: WP-01 separate, WP-02A/B, WP-03 separate, WP-04A/B/C |
| Q6. Outbox hardening이 Notification writer보다 먼저인가? | **YES, mandatory** |
| Q7. 무엇을 병렬화할 수 있는가? | Public/Admin shells, Article research/schema branch, mock providers, analytics registry after contracts; no direct writes |
| Q8. CMS 전 small acquisition slice 가능한가? | **YES**, sanitized/code-controlled seeded Article + mock Kakao + real commands |
| Q9. WP-15/16 순서 조정이 필요한가? | **YES**, 15A→16A→15B→16B |
| Q10. Current test harness가 충분한가? | **YES_WITH_ADJUSTMENT**, explicit multi-client helpers; no testcontainers required |
| Q11. 누락된 launch-critical task가 있는가? | **NO**; sequencing/dependency refinements only |
| Q12. 첫 실제 Codex prompt를 생성해도 되는가? | **YES**, Phase 0A only |

---

# 18. Implementation Plan Repository Validation Verdict

**Implementation Plan:**  
VALID_WITH_IMPLEMENTATION_ADJUSTMENTS

**Ready for First Coding Phase:**  
YES

**Plan Blockers:**  
NONE for Phase 0A. Production cutover is blocked until Amendment #1 is incorporated and WP-16A evidence exists.

**Required Plan Amendments:**  
Amend Batch 5/dependency order to `WP-15A → WP-16A → WP-15B → WP-16B` so backup/restore, baseline observability, migration runbook, secrets and side-effect isolation precede production backfill/cutover.

**Implementation Adjustments:**  
Isolate Phase 0A; split WP-02A/B and WP-04A/B/C; harden Outbox before Notification writers; split public Article dependency; move minimal sanitizer and typed analytics registry/hooks earlier; use multi-client existing PostgreSQL test harness; mock providers before production adapters.

**Recommended Critical Path:**  
Phase 0A DB/transaction/error foundation → Institution → Opportunity root/bridge → trust history/change/fact → Identity/Follow → Outbox hardening → Notification schema → application commands → Auth/Follow/My Preppy → Verification/Admin → Worker/Email → vertical rehearsal → WP-16A → production cutover → final launch gates.

**Parallelizable Work:**  
Public/Admin shells, Article/editor research and Article schema branch, mock Kakao/Email adapters, typed analytics registry/Noop adapter, and production provider/backup/observability preparation may run in parallel after their DTO/schema boundaries stabilize. No parallel direct DB shortcut is allowed.

**Recommended First Coding Phase:**  
Option A — Phase 0A: DB runtime/pool, runtime Drizzle, transaction-scoped executor, typed errors, correlation, safe env foundation, and tests only. No migration or Product feature.

**First Phase Acceptance Criteria:**  
Pooled lifecycle and runtime Drizzle exist; shared transaction commit/rollback and deterministic concurrency tests pass; nested independent transaction is prevented; safe error/correlation/env behavior is tested; existing health/migration/tests stay green; no schema/migration/Product route is added; executor stops after the completion report.

**Production Sequencing Note:**  
WP-15A rehearsal may precede operations, but no production migration/backfill/cutover may run until WP-16A automated backup/retention, successful restore drill, baseline observability, migration runbook, secrets and side-effect isolation evidence are complete.

**Highest Delivery Risks:**

1. DB runtime refactor and first canonical migration are combined, obscuring connection/transaction defects behind schema failures.
2. Outbox writer/provider work begins before hardening and ambiguity/concurrency tests, allowing duplicate or ineligible Email.
3. Production backfill/cutover runs before backup/restore and observability evidence, turning migration error into unrecoverable data loss or silent corruption.

**Recommended Next Step:**

```text
CODEX_IMPLEMENTATION_PROMPT_PHASE_0.md
```
