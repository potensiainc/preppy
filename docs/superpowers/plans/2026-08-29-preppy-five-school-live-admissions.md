# PREPPY 5-School Live Admissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put official, evidence-backed, explicitly reviewed admission data for five real Seoul private elementary schools on the existing localhost Institution detail UI.

**Architecture:** A bounded live-admissions module reuses the hardened HTTP collector and existing canonical Source/Snapshot/Observation/Opportunity/Version/Evidence tables. Automatic collection creates DRAFT Opportunities with non-current UNVERIFIED version 1; explicit per-record review creates current VERIFIED version 2, supersedes version 1, and only then locally publishes the Institution and Opportunity for the existing public route.

**Tech Stack:** TypeScript 5.9, Node.js 22, Next.js 16, React 19, Drizzle ORM, PostgreSQL, Cheerio, Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-29-preppy-five-school-live-admissions-design.md`

## Global Constraints

- Branch must remain `feat/preppy-5-school-live-data-vertical-slice` at starting commit `4d5156099cb34c8720f69439a5bbd640f0d4a2c3`.
- Use only disposable/local PostgreSQL via `TEST_DATABASE_URL`; production DB and credentials are forbidden.
- Apply migrations `0000`–`0012` and reuse the existing Institution seed importer.
- Preserve all existing collector robots, SSRF, TLS, timeout, redirect, politeness, page, and byte-budget policies.
- Do not add schema, staging tables, generic workflow infrastructure, Browser/PDF/OCR/CAPTCHA/proxy support, scheduler, retry engine, notifications, or delivery.
- Automatic records are DRAFT + UNVERIFIED with null verification fields and zero public exposure.
- Only explicit record-by-record local review creates VERIFIED truth and local publication.
- Outbox, notification, and delivery deltas must remain zero.
- Do not commit, push, or deploy. Commit steps normally required by the skill are intentionally omitted by Owner instruction.

---

### Task 1: Lock the bounded extraction contract

**Files:**
- Create: `src/modules/live-admissions/contracts.ts`
- Create: `src/modules/live-admissions/extractor.ts`
- Create: `tests/unit/preppy-live-admission-extractor.test.ts`

**Interfaces:**
- Produces: `extractLiveAdmissionProposal(input): LiveAdmissionProposal`.
- Produces: strict Zod inputs for five-school selection, automatic preparation, and explicit one-record review.
- Produces: `LiveAdmissionKnowledgeState = "SCHEDULE_FOUND" | "NOT_ANNOUNCED" | "NOT_FOUND"`.

- [ ] **Step 1: Write failing parser tests** using hand-authored bounded HTML snippets. Each expected year/date/audience/state is a literal, and each test names the mutation it catches.
- [ ] **Step 2: Run `npx vitest run tests/unit/preppy-live-admission-extractor.test.ts`** and confirm failure because the module/API does not exist.
- [ ] **Step 3: Implement the minimum deterministic parser** with Cheerio visible text/headings, exact Korean/English academic-year tokens, contextual date parsing, explicit not-announced phrases, bounded excerpts, and no inferred fields.
- [ ] **Step 4: Re-run the focused test** and confirm all cases pass.
- [ ] **Step 5: Add boundary tests** for malformed HTML, absent year, date-order rejection, and `NOT_FOUND` not being upgraded to `NOT_ANNOUNCED`; run red then green.

### Task 2: Promote and collect exactly reviewed official URLs

**Files:**
- Create: `src/modules/live-admissions/repository.server.ts`
- Create: `src/modules/live-admissions/collection.server.ts`
- Create: `tests/integration/preppy-live-admission-persistence.test.ts`
- Modify: `src/modules/http-collector/repository.server.ts` only if a narrow reusable official-Source eligibility query is necessary.

**Interfaces:**
- Consumes: five explicit `{ institutionId, rootSourceId, admissionUrl, sourceType, institutionBindingRole }` selections.
- Produces: `collectReviewedAdmissionSource(...)` returning the canonical Source, Snapshot, Observation, fetched timestamp, and response bytes.
- Reuses: `crawlOfficialMainRoot`, collector policy parsing, hardened transport, robots policy, run-byte ledger, and `persistRootCollection`.

- [ ] **Step 1: Write a failing integration test** proving an explicitly selected official admission URL is created/reused, bound to the intended Institution, fetched through an injected real collector boundary, and persisted as Source/Snapshot/Observation.
- [ ] **Step 2: Run the single integration test** against disposable PostgreSQL and confirm the expected missing implementation failure.
- [ ] **Step 3: Implement reviewed Source promotion** with only existing official Source types and Institution binding roles, canonical URL uniqueness, active official authority, and conflict checks against cross-Institution reuse.
- [ ] **Step 4: Implement exact-page collection** by reusing the collector crawler with a single-page policy and the existing persistence function; do not introduce a second transport.
- [ ] **Step 5: Run the integration test green**, then add and pass tests for robots denial/no persistence, source mismatch, and idempotent same-URL reuse.

### Task 3: Persist automatic DRAFT/UNVERIFIED canonical proposals

**Files:**
- Modify: `src/modules/live-admissions/repository.server.ts`
- Create: `src/modules/live-admissions/preparation.server.ts`
- Modify: `tests/integration/preppy-live-admission-persistence.test.ts`

**Interfaces:**
- Consumes: collected Snapshot/Observation plus `LiveAdmissionProposal`.
- Produces: one DRAFT native Opportunity, non-current UNVERIFIED version 1, active primary Opportunity Source binding, and Version Evidence per school.
- Produces: review bundle fields `{ institutionId, opportunityId, versionId, sourceId, observationId, snapshotId, contentFingerprint, extractedState, evidenceExcerpt }`.

- [ ] **Step 1: Write a failing integration test** asserting exact database state, null verification fields, evidence traceability, no public query result, and zero outbox/notification/delivery deltas.
- [ ] **Step 2: Run the test red** and verify it fails on the missing preparation operation.
- [ ] **Step 3: Implement the transactional preparation operation** with deterministic slugs/fingerprints, exact source binding, version 1 `isCurrent=false`, and no publication writes.
- [ ] **Step 4: Run the test green.**
- [ ] **Step 5: Add red/green conflict tests** for changed source evidence, duplicate school preparation, missing Snapshot/Observation provenance, and cross-school Source binding.

### Task 4: Add explicit one-record operator review and local publication

**Files:**
- Create: `src/modules/live-admissions/review.server.ts`
- Modify: `src/modules/live-admissions/repository.server.ts`
- Modify: `tests/integration/preppy-live-admission-persistence.test.ts`

**Interfaces:**
- Consumes: exact expected review-bundle IDs/fingerprint, operator Admin ID, actual review time, and approved values.
- Produces: superseded version 1, current VERIFIED version 2, evidence for version 2, and locally PUBLISHED Institution/Opportunity.
- Returns distinct `lastCollectedAt` and `lastVerifiedAt` values plus before/after side-effect counts.

- [ ] **Step 1: Inspect migrations, triggers, and publication call graphs** for Institution/Opportunity publication. If any path creates outbox, notifications, or deliveries, stop before implementation and report.
- [ ] **Step 2: Write a failing integration test** proving version 2 uses review time rather than collection time, version 1 remains auditable as SUPERSEDED, publication occurs after verified truth exists, and all three side-effect deltas are zero.
- [ ] **Step 3: Run the test red.**
- [ ] **Step 4: Implement a single-record transaction** with row locks, exact optimistic checks, evidence validation, version 2 insertion, version 1 supersession, then local publication updates.
- [ ] **Step 5: Run the test green.**
- [ ] **Step 6: Add red/green tests** for stale fingerprint, repeat approval, wrong operator, missing evidence, attempted bulk input, and partial rollback.

### Task 5: Expose bounded CLI workflows

**Files:**
- Create: `src/modules/live-admissions/cli.server.ts`
- Create: `scripts/data/run-five-school-live-admissions.ts`
- Create: `tests/unit/preppy-live-admission-cli.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces commands for `--calibrate`, `--prepare`, and one-record `--review` using explicit local JSON files/IDs.
- Calibration always uses depth 1, at most 10 pages, at most 100 links/page, per-host concurrency 1, and existing byte caps.
- Review accepts exactly one record per invocation; five approvals require five explicit invocations.

- [ ] **Step 1: Write failing CLI contract tests** for explicit modes, batch bounds, local `TEST_DATABASE_URL` requirement, and rejection of ambiguous/bulk review arguments.
- [ ] **Step 2: Run the CLI tests red.**
- [ ] **Step 3: Implement the minimal parser/runner and operator-safe JSON report** with bounded excerpts and credential-free URLs.
- [ ] **Step 4: Run the CLI tests green.**
- [ ] **Step 5: Add the package script** and run the focused unit files together.

### Task 6: Extend the canonical public read model

**Files:**
- Modify: `src/modules/public/dto.ts`
- Modify: `src/modules/public/institution-query.server.ts`
- Modify: `tests/integration/wp06a-institution-query.test.ts`

**Interfaces:**
- Produces: reviewed admission detail entries containing approved canonical values, official Source, `lastCollectedAt`, and `lastVerifiedAt`.
- Includes verified `UNKNOWN` records in a source-backed status section while preserving existing HOME/CARD filters.

- [ ] **Step 1: Write failing integration tests** for reviewed values, official evidence URL, Observation-derived collection time, review-derived verification time, and visible UNKNOWN status.
- [ ] **Step 2: Run the focused integration test red.**
- [ ] **Step 3: Extend only the Institution DETAIL projection** to select the evidence Observation/Snapshot and map detailed native truth; keep DRAFT/UNVERIFIED rows excluded.
- [ ] **Step 4: Run the focused integration test green.**
- [ ] **Step 5: Add and pass a regression case** proving collection time cannot populate Last Verified and UNKNOWN remains absent from HOME/list recruitment projections.

### Task 7: Render reviewed admission details on the existing page

**Files:**
- Modify: `app/_components/institution-pages.tsx`
- Modify: the existing global/component stylesheet that owns `institution-detail` classes, only if needed.
- Create: `tests/unit/preppy-live-admission-ui.test.tsx` or extend the existing Institution UI test file if that is the repository convention.

**Interfaces:**
- Consumes: the reviewed admission detail DTO from Task 6.
- Renders: academic year or knowledge state, application and event dates, audience, notes, official link, Last Collected, and Last Verified.

- [ ] **Step 1: Read the relevant Next.js 16 guides under `node_modules/next/dist/docs/`** before editing the route/component.
- [ ] **Step 2: Write a failing real-component test** asserting distinct labels/values for collection and verification and clickable official evidence.
- [ ] **Step 3: Run the UI test red.**
- [ ] **Step 4: Implement the smallest accessible section** in the existing Institution detail component; use existing typography/card primitives and preserve all current sections.
- [ ] **Step 5: Run the UI test green** and execute the existing Institution UI/query regression tests.

### Task 8: Build the disposable local dataset and run live calibration

**Files:**
- Runtime-only files outside commit candidates: disposable DB/container state and local selection/review JSON.
- Modify later: `PREPPY_5_SCHOOL_LIVE_DATA_REPORT.md` with bounded evidence only.

**Interfaces:**
- Produces: five selected Institution/Source tuples and five reviewed candidate URLs.

- [ ] **Step 1: Start disposable PostgreSQL**, set only `TEST_DATABASE_URL`, and record PostgreSQL/container identity.
- [ ] **Step 2: Apply canonical migrations `0000`–`0012`** and prove migration `0012` in the ledger.
- [ ] **Step 3: Run the existing seed importer** and verify 57 resolved / 6 pending skipped without guessing.
- [ ] **Step 4: Query resolved Seoul private elementary Institutions and `OFFICIAL_MAIN` Sources.**
- [ ] **Step 5: Calibrate candidate schools in bounded batches** using the Task 5 dry-run and select five accessible official sites, replacing at most two initial choices.
- [ ] **Step 6: Record root/robots/redirect/charset/parse/candidate evidence** and choose exactly one reviewed HTML URL per school.

### Task 9: Collect, extract, review, and publish five real records

**Files:**
- Runtime-only local selection/review JSON outside commit candidates.

**Interfaces:**
- Consumes: the five selections from Task 8.
- Produces: five canonical DRAFT/UNVERIFIED records, then five explicitly reviewed VERIFIED/PUBLISHED records.

- [ ] **Step 1: Run `--prepare` for the five selections** and inspect each source excerpt and parsed value against the live official page.
- [ ] **Step 2: Query automatic-stage invariants**: DRAFT Opportunity, UNVERIFIED non-current version, null verification fields, evidence present, zero public exposure, zero side-effect deltas.
- [ ] **Step 3: Create/use a local-only Admin identity** and construct five separate explicit review inputs from the manually checked evidence.
- [ ] **Step 4: Run five one-record `--review` invocations**, never a bulk auto-verify operation.
- [ ] **Step 5: Query final invariants**: version 1 superseded, version 2 current/verified, timestamps distinct, Institution/Opportunity published, evidence traceable, and zero outbox/notification/delivery deltas.

### Task 10: Verify 5/5 localhost UI and regressions

**Files:**
- Create: `PREPPY_5_SCHOOL_LIVE_DATA_REPORT.md`

**Interfaces:**
- Produces: final acceptance evidence and `5/5 REAL_DATA_VISIBLE` result.

- [ ] **Step 1: Start Next.js localhost** against only the disposable local DB.
- [ ] **Step 2: Open Institution list and all five detail routes** in the browser; verify actual names, source-backed admission data/status, official URLs, Last Collected, and Last Verified.
- [ ] **Step 3: Capture a concise per-school acceptance record** without copying full copyrighted pages or secrets.
- [ ] **Step 4: Run focused unit and integration tests.**
- [ ] **Step 5: Run full `npm run test:unit`, `npm run test:db`, `npm run typecheck`, `npm run build`, and `git diff --check`.**
- [ ] **Step 6: Run `git status --short`, `git diff --name-status`, and `git diff --stat`; confirm no runtime secrets or disposable artifacts are commit candidates.**
- [ ] **Step 7: Write the final report** with selected schools, live outcomes, structured-field counts, canonical persistence evidence, timestamp separation, side-effect deltas, localhost 5/5 result, regressions, and remaining public-launch blockers.
- [ ] **Step 8: Stop the localhost process and remove the disposable DB/container and runtime-only files. Do not commit, push, or deploy.**
