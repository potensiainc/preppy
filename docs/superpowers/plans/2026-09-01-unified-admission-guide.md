# Unified Admission Guide Implementation Plan

**Goal:** One school/cycle guide with all event details visible, no duplicate guide blocks, and no unavailable Follow UI.
**Spec:** Owner-approved three-point UX proposal in this conversation, followed by explicit implementation approval.
**Architecture:** Reuse canonical public queries and existing React views. Extend the read-only sibling DTO with public evidence-backed details, group only exact canonical school/cycle identities, and preserve legacy/orphan access. No schema or persistence changes.
**Tech stack:** Next.js 16.3, React 19, CSS Modules, Drizzle, Vitest.

## Global constraints

- Preserve source text, dates, academic years, conditions, official URLs and per-record collected/verified timestamps.
- Only PUBLISHED/current VERIFIED/official-evidence sibling records may appear.
- No new collection, database writes, migration, notification, package dependency or production deployment in this implementation task.
- Existing untracked benchmark/mockup files remain untouched.
- Design: existing IBM Plex Sans KR/DM Sans; ink #1d2d28, forest #285747, muted #596963, surface #ffffff, rule #dce3db, caution #faf2e2. Dates lead a vertically stacked schedule; restrained separators, not numbered navigation or decorative motion.

## Task 1 — Public event details and stable destinations

Files: `src/modules/public/dto.ts`, `src/modules/public/opportunity-query.server.ts`, `app/_lib/admission-navigation.ts`, `app/(public)/opportunities/[slug]/page.tsx`, relevant unit/integration tests.

- [x] Add failing assertions that exact-cycle siblings expose summary, audience, action, official sources and distinct timestamps while excluding private IDs and unpublished truth.
- [x] Select the verified version fields and reuse existing official-source/observation readers. Keep the existing bounded sibling query and exact identity filters.
- [x] Implement `admissionSessionAnchor(slug): string` and a safe guide destination only when the verified parent exists and its returned sibling list contains the requested child. Existing child URLs redirect to that parent's matching anchor; orphan and legacy routes remain readable.
- [x] Run focused query tests on a dedicated disposable PostgreSQL and navigation unit tests.

## Task 2 — Unified reading and comparison UI

Files: `app/_components/admissions-content.tsx`, `app/_components/admissions-detail.tsx`, `app/_components/admissions.module.css`, `app/_components/follow-cta.tsx`, relevant unit tests.

- [x] Write failing real-SSR tests for one common guide, inline date-first sibling details, distinct source times, no unavailable CTA wrapper, and intact ordinary Follow actions.
- [x] Render all events as accessible articles, not links to individual event pages. Show dates, original event name, status, audience, reservation window, unique description, source and freshness in each item. Retain unknown values as unknown. Group past dates separately without turning registration CLOSED into an event-completed claim.
- [x] On Institution details group exact canonical children beneath their actual parent; don't group unrelated years, admissions purposes, malformed or orphan records.
- [x] Display common guide once. Remove English GUIDE labels and empty Follow areas; retain functioning Follow states and real admission-status badges.
- [x] Preserve per-source qualifiers; deduplicate only identical text, never approximate matching.
- [x] Run related unit suites plus changed-file lint/format/typecheck.

## Task 3 — Verification

- [x] Run full unit, integration, TypeScript and production build. Restore build-generated `next-env.d.ts` only.
- [x] Render the updated components with existing real-data DTO evidence locally; verify multiple-event, single-event, no-parent, historical-fee and mobile cases in the browser.
- [x] Review the complete diff for information loss, unsafe links, wrong-year grouping, stale deep links and empty wrappers. No commit/push/deploy is part of this code-writing request.

## Verification evidence — 2026-09-01 KST

- Final frozen combined code: full unit **132 files / 1,305 tests PASS** (01:30:23 start); TypeScript, production build, changed-file ESLint/Prettier and `git diff --check` PASS.
- Full integration **79 files / 582 tests PASS** using the repository PostgreSQL 16 Compose convention in a separate disposable project. The first custom-database attempt exposed existing restore/read-only test environment assumptions; the convention-correct run passed without weakening tests. All acceptance containers/volumes were removed. No subsequent database/query change.
- The focused public opportunity query contract passed all 9 tests, including distinct event details/timestamps and unpublished-record exclusions. Removing the added projection fields first produced the expected regression failure.
- Local static preview renders actual existing public DTO snapshots through the changed React components: **41 institutions, 69 admissions, 28 inline sessions and 28 legacy route destinations**. It is not a live database or Production UI acceptance claim.
- Snapshot assertions preserved **350 official URL references, 514 date/timestamp references and 38 checks of actionable admission clauses**. Browser checks included Donggwang, Kumsung, Skes, Suwoncca and Uchon; a 390px mobile harness showed the date-first schedule without visible clipping. Existing session-2 URL lands on the matching inline anchor in the common guide.
- Independent review found no Critical/Important issue in the unified schedule implementation. Concurrent public-copy cleanup initially removed genuine fee, submission, waitlist and uncertainty clauses. Those findings were corrected in the copy task, covered by full stored-guide regressions and rechecked in the final rendered snapshots. All 69 summaries, 150 fact values and 191 source names were included in the bounded review.
- No schema, migration, package dependency or Production database write. Build-generated `next-env.d.ts` restored. Pre-existing untracked benchmark/UX/mockup directories remain excluded.
- GitHub/Production release belongs to the separately owner-authorized task. This implementation task hands off the frozen, verified combined code; it does not commit, push or deploy independently.
