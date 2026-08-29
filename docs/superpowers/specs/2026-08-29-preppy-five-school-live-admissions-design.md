# PREPPY 5-School Live Admissions Vertical Slice Design

**Date:** 2026-08-29
**Owner decision:** APPROVED
**Branch:** `feat/preppy-5-school-live-data-vertical-slice`
**Starting commit:** `4d5156099cb34c8720f69439a5bbd640f0d4a2c3`

## Goal

Collect real admission-related HTML from five resolved Seoul private elementary-school official sites, preserve source evidence in the existing canonical database, explicitly review each school locally, and show all five reviewed records in the existing localhost Institution detail UI.

This work is successful only when `5/5 REAL_DATA_VISIBLE = YES` on localhost. Collector, extraction, or persistence infrastructure without visible live data is not sufficient.

## Fixed constraints

- Use only a disposable/local PostgreSQL database and `TEST_DATABASE_URL`.
- Never use production databases, credentials, publication, deployment, notifications, or delivery.
- Use migrations `0000` through `0012` and the existing Institution seed importer.
- Use the existing HTTP collector policies for robots, SSRF protection, timeouts, rate limiting, page limits, response-byte limits, redirect validation, TLS hostname validation, and run-byte limits.
- Do not add Browser/Playwright, PDF parsing, OCR, CAPTCHA bypass, proxy rotation, scheduler, retries, a generic candidate platform, a generic extraction engine, a staging table, or an unverified public UI.
- Do not add a schema migration.
- Do not commit, push, or deploy.

## Repository reality

The active public call graph is the newer canonical model:

`institutions` → `opportunities` → `opportunity_versions` → `opportunity_version_evidence` → `sources` / `source_observations` / `source_snapshots`.

The legacy `schools` and admission-event tables remain for backward compatibility but are not the write target for this slice. The existing public Institution detail query accepts only published Institutions and Opportunities with a current verified Version and official evidence. A database constraint also requires every current native Opportunity Version to be `VERIFIED`.

The automatic stage therefore cannot make an unverified Version current. It will create a DRAFT Opportunity and a non-current `UNVERIFIED` version 1 with evidence. Explicit review creates a current `VERIFIED` version 2 that supersedes version 1. This preserves both the machine extraction and operator-approved truth without weakening the existing invariant.

## End-to-end flow

1. Apply migrations `0000`–`0012` to disposable PostgreSQL.
2. Import the resolved canonical seed package with the existing importer. Do not infer the six pending registry IDs.
3. Select five seeded Seoul private elementary Institutions with resolved `OFFICIAL_MAIN` Sources.
4. Run live collector dry-run with `maxDepth=1`, `maxPagesPerInstitution=10`, `maxLinksPerPage=100`, `perHostConcurrency=1`, and existing byte/timeout/redirect limits. Dry-run performs no database writes.
5. Record admission-related candidates and choose one reviewed official admission/notice/application HTML URL per school. At most two inaccessible initial schools may be replaced.
6. Explicitly promote only those five reviewed URLs to existing canonical official Source types and Institution binding roles. No automatic bulk Source promotion occurs.
7. Fetch each selected URL with the same hardened collector transport and robots policy, using a single-page bounded policy for evidence capture. Persist the existing Source Snapshot and Observation records.
8. Parse visible DOM text, title/headings, exact academic-year tokens, Korean/English admission keywords, and contextual date ranges. Missing values remain null. The parser never infers a year, date, or eligibility rule.
9. Create one DRAFT native Opportunity per school, one non-current `UNVERIFIED` version 1, an active Opportunity Source binding, and Version Evidence pointing to the official Source plus Snapshot/Observation. `verified_at` and `verified_by_admin_id` remain null.
10. Present an explicit five-record review report containing Institution, Source URL, bounded source excerpt, extracted fields, Source Observation ID, Snapshot ID, and Version ID.
11. Review each record against its official source. Approval is record-by-record and requires the expected IDs/fingerprint plus the operator-approved values.
12. In a transaction, create `VERIFIED` current version 2 using the actual review timestamp, supersede version 1, attach the same evidence, then locally publish that Opportunity and Institution.
13. Extend the existing public Institution detail read model to expose the reviewed canonical values, official Source, Last Collected from Source Observation, and Last Verified from version 2 as distinct fields.
14. Render all five through the existing `/institutions/[slug]` route and verify them in a real localhost browser session.

## Extraction contract

The bounded parser produces one school-level admission proposal with:

- exact academic-year label when present;
- canonical Opportunity kind and business state;
- title;
- application open/close timestamps when explicit;
- briefing/open-house timestamp when explicit;
- target audience/eligibility excerpt when explicit;
- official notes excerpt;
- action URL and official Source URL;
- a bounded evidence excerpt and extraction warnings;
- a source-backed knowledge state: `SCHEDULE_FOUND`, `NOT_ANNOUNCED`, or `NOT_FOUND`.

`NOT_ANNOUNCED` requires explicit source language supporting a future announcement or absence of a schedule. A bounded search that simply finds no relevant schedule becomes `NOT_FOUND`; it must not be promoted into the stronger claim that the school has not announced one.

The canonical schema has no dedicated academic-year or knowledge-state columns. Exact year/state wording is preserved in the Version title/summary and remains traceable to version 1 and its evidence. Structured dates, audience, action URL, kind, and business state use their existing canonical columns.

## Persistence and review invariants

### Automatic stage

- Institution remains `DRAFT`.
- Opportunity is `DRAFT`.
- Version 1 is `UNVERIFIED` and `is_current=false`.
- Version 1 has Snapshot/Observation evidence.
- `verified_at=NULL` and `verified_by_admin_id=NULL`.
- Public exposure is zero.
- Outbox, notification, and delivery deltas are zero.

### Explicit operator review

- The command approves one exact Institution/Opportunity/Version tuple at a time.
- The command locks and revalidates the DRAFT Opportunity, UNVERIFIED version, official Source binding, and evidence.
- Version 2 copies the approved values, is `VERIFIED` and current, supersedes version 1, and uses the actual operator review time.
- Version 1 becomes `SUPERSEDED`; its extracted values and evidence remain available for audit.
- Only after version 2 exists does the transaction locally publish the Opportunity and Institution.
- Collector time is never copied into `verified_at`.
- No generic bulk auto-verification path is introduced.

There is currently no canonical Institution/Opportunity publication command or database trigger that emits notification side effects; existing tests and fixtures update publication state directly. Before implementation, repository SQL, triggers, and command call graphs must be rechecked. If a real publication path emits outbox, notification, or delivery records, execution stops rather than suppressing or bypassing it.

## UI contract

The existing Institution detail route remains the entry point. It gains a reviewed admission-information section sourced only from current `VERIFIED` native Versions with official evidence. Each school displays:

- actual Institution name;
- source-backed academic year or knowledge-state wording;
- application period and/or briefing/open-house date when present;
- target audience/eligibility when present;
- official notes when present;
- clickable official Source URL;
- `Last Collected`, derived from the evidence Observation timestamp;
- `Last Verified`, derived from the operator verification timestamp.

Unknown records are visible in a distinct confirmed-status group instead of being dropped by the existing detail projection. The UI never labels collection time as verification time.

## Safety and side-effect proof

Before and after automatic persistence, review, and publication, acceptance SQL records counts for outbox events, notifications, and delivery attempts. All three deltas must be zero. DRAFT rows must be absent from public read models. Publication is local-only and occurs only after the verified current Version exists.

## Test strategy

- Unit tests use small hand-authored/redacted HTML snippets for year, application period, briefing date, eligibility, explicit not-announced language, and bounded not-found state.
- Persistence integration tests use disposable PostgreSQL to prove DRAFT/UNVERIFIED/evidence creation, no public exposure, explicit review, version supersession, verified timestamps, local publication, traceability, idempotency/conflict behavior, and zero side-effect deltas.
- Public read-model and component tests prove the two timestamps are distinct and that verified `UNKNOWN` records render as source-backed status.
- Live sites are calibration/acceptance inputs, never unit-test dependencies.
- Final verification includes focused tests, full unit/integration suites, TypeScript, production build, `git diff --check`, database evidence, and localhost browser checks for all five schools.

## Non-goals

No generic extraction platform, review queue, scheduler, notification work, full 63-school crawling, Browser/PDF/OCR support, or production publication is included.
