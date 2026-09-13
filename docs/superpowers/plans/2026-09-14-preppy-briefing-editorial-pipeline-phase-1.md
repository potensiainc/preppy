# PREPPY Briefing Editorial Pipeline Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-safe Phase 1 pipeline that imports the weekly ChatGPT education-market briefing, turns it into traceable editorial candidates, requires evidence-backed human review, creates grounded Article drafts, and blocks public publication until every required review passes.

**Architecture:** Add a bounded `editorial-briefing` domain beside the existing Article CMS. The new domain stores immutable briefing runs, candidate workflow state, links to the existing Source/Observation/Evidence system, candidate-to-product relations, reviews, and recheck work. Existing Article commands remain the only Article mutation boundary; briefing-linked publication gains an additional eligibility guard while ordinary manually authored Articles keep their current behavior.

**Tech Stack:** TypeScript 5.9, Node.js 22+, Next.js 16.3 App Router, React 19.2, PostgreSQL, Drizzle ORM 0.45, Zod 4.4, Vitest 4.1, existing Python browser harness.

**Spec:** `docs/superpowers/specs/2026-09-13-preppy-briefing-editorial-pipeline-design.md`

## Global Constraints

- Phase 1 uses operator/Codex import and deterministic grounded draft scaffolding; it does not scrape ChatGPT UI and does not depend on private conversation IDs.
- No automatic public Article publication. Only an authenticated Admin command may publish.
- A briefing statement is discovery input, never Institution/Opportunity truth.
- Reuse `sources`, `source_observations`, `source_snapshots`, existing Evidence tables, Article commands, Audit, and cache Outbox; do not create a second canonical source registry.
- Briefing raw text is immutable, Admin-only, bounded to 256 KiB UTF-8, hashed with SHA-256, and excluded from browser props except the authenticated candidate detail projection.
- Community/blog/SNS sources may be contextual discovery sources. They cannot independently satisfy a required claim about a date, amount, eligibility rule, legal obligation, commute route, or meal service.
- Preserve academic year, actual calendar date, time zone, payment unit, included/separate fees, obligations, prohibitions, exceptions, uncertainty, source, collected time, and verified time.
- Distinguish unpublished, not found, access failed, tentative, conflicting, application closed, and past event states.
- Public user-facing copy uses natural Korean 해요체; labels and headings use concise noun forms.
- Do not use fear, urgency inflation, admission guarantees, school certification claims, or unsupported `최신`, `확정`, or `평균 원비` claims.
- Next.js pages remain Server Components by default. Client Components are limited to forms and interactive actions and receive only serializable bounded DTOs.
- Route Handlers use Web `Request`/`Response`, existing authenticated Admin request pipelines, strict Zod schemas, and uncached mutation methods.
- Revalidation reuses the existing Article cache Outbox; do not call non-rollbackable Next cache APIs inside truth transactions.
- All integration and browser tests use a dedicated database whose name ends in `_test` or `_verify`.
- Existing dirty worktree changes are user-owned. Each task stages and commits only the files listed for that task.
- Phase 2 model-generated prose and Phase 3 source-monitor automation require separate plans after the four-run pilot gate; this plan provides stable interfaces for them but does not implement them.

---

## File Structure

### New domain files

- `src/modules/editorial-briefing/contracts.ts` — strict input/output contracts, enum values, state-transition inputs, and bounds.
- `src/modules/editorial-briefing/parser.ts` — extracts the optional structured JSON block and returns `COMPLETE` or `PARTIAL` without discarding raw text.
- `src/modules/editorial-briefing/scoring.ts` — deterministic 0–12 candidate score and P0/P1/P2 mapping.
- `src/modules/editorial-briefing/repository.server.ts` — transaction-scoped persistence and eligibility reads.
- `src/modules/editorial-briefing/commands.server.ts` — import, triage, source verification, review, rejection, and approval commands.
- `src/modules/editorial-briefing/draft-bridge.server.ts` — creates one grounded Article draft and links it to candidate/source records.
- `src/modules/editorial-briefing/recheck.server.ts` — finds due published content and opens deduplicated recheck work.
- `src/modules/editorial-briefing/cli.server.ts` — validate-only, dry-run, and guarded apply workflow.

### New Admin files

- `src/modules/admin/http/editorial-briefing.server.ts` — strict HTTP adapters for import and candidate actions.
- `src/modules/admin/read-model/editorial-briefing-query.server.ts` — bounded list/detail projections.
- `app/admin/(protected)/editorial-briefings/page.tsx` — candidate work queue Server Component.
- `app/admin/(protected)/editorial-briefings/[candidateId]/page.tsx` — candidate comparison Server Component.
- `app/admin/_components/editorial-briefing-import.tsx` — bounded raw briefing import Client Component.
- `app/admin/_components/editorial-candidate-actions.tsx` — source, review, decision, and draft actions.
- `app/api/admin/editorial-briefings/import/route.ts` — authenticated import POST.
- `app/api/admin/editorial-briefings/candidates/[candidateId]/triage/route.ts` — triage POST.
- `app/api/admin/editorial-briefings/candidates/[candidateId]/sources/route.ts` — source-link verification POST.
- `app/api/admin/editorial-briefings/candidates/[candidateId]/reviews/route.ts` — review POST.
- `app/api/admin/editorial-briefings/candidates/[candidateId]/draft/route.ts` — draft creation POST.

### New operational files

- `scripts/data/import-editorial-briefing.ts` — CLI entry point.
- `scripts/data/plan-editorial-rechecks.ts` — read/plan/apply entry point for due rechecks.
- `tests/fixtures/editorial-briefing/2026-09-12.json` — redacted first-run-shaped fixture, not a private chat export.
- `tests/browser/editorial-briefing/seed.ts` — dedicated Admin/public browser seed.
- `tests/browser/editorial-briefing/run.py` — desktop/tablet/mobile assertions.
- `tests/browser/editorial-briefing/scenarios.md` — expected user-visible states.
- `docs/runbooks/PREPPY_BRIEFING_EDITORIAL_PIPELINE.md` — weekly operator and recovery runbook.
- `docs/data/PREPPY_BRIEFING_EDITORIAL_PIPELINE_PHASE1_REPORT.md` — execution evidence and pilot gate.

### Existing files modified

- `src/db/schema/index.ts` — new tables, values, constraints, and relations.
- `src/db/migrations/0014_briefing_editorial_pipeline.sql` — additive migration generated from schema.
- `src/db/migrations/meta/0014_snapshot.json` and `src/db/migrations/meta/_journal.json` — generated Drizzle ledger.
- `src/modules/production-safety/migration-manifest.ts` — exact new migration identifier and SHA-256.
- `tests/unit/wp15a-migrations.test.ts` and `tests/unit/wp16a-migration-manifest.test.ts` — exact ledger expectations.
- `src/modules/editorial/article-commands.server.ts` — optional briefing-linked publish guard inside the existing root transaction.
- `src/modules/editorial/repository.server.ts` — Article source projection and briefing link queries used by Article commands.
- `src/modules/admin/read-model/contracts.ts` — bounded briefing list/detail DTOs.
- `src/modules/public/dto.ts` — public Article source DTO.
- `src/modules/public/article-query.server.ts` — verified Article source projection.
- `app/_components/opportunity-article-pages.tsx` — official/reference source block and separate timestamps.
- `app/admin/_components/admin-nav.tsx` and `app/admin/admin.css` — work queue navigation and responsive styles.
- `package.json` — Phase 1 import and recheck scripts.

---

### Task 1: Add the additive editorial briefing schema and migration ledger

**Files:**
- Modify: `src/db/schema/index.ts`
- Create: `src/db/migrations/0014_briefing_editorial_pipeline.sql`
- Create: `src/db/migrations/meta/0014_snapshot.json`
- Modify: `src/db/migrations/meta/_journal.json`
- Modify: `src/modules/production-safety/migration-manifest.ts`
- Modify: `tests/unit/wp15a-migrations.test.ts`
- Modify: `tests/unit/wp16a-migration-manifest.test.ts`
- Create: `tests/integration/editorial-briefing-schema.test.ts`

**Interfaces:**
- Produces: Drizzle tables `briefingRuns`, `editorialCandidates`, `editorialCandidateSources`, `editorialCandidateInstitutions`, `editorialCandidateOpportunities`, `editorialReviews`, `articleSourceLinks`, and `editorialRechecks`.
- Consumes: existing `sources`, `sourceObservations`, `sourceSnapshots`, `institutions`, `opportunities`, `articles`, and `adminUsers` foreign keys.

- [ ] **Step 1: Write the failing schema invariant test**

```ts
it("keeps briefing imports immutable and candidate/source/article links valid", async () => {
  // Define these four local fixtures in this test file with direct Drizzle inserts;
  // do not route them through application commands, so database constraints are tested.
  const run = await insertBriefingRun({
    sourceRunAt: new Date("2026-09-12T23:00:00.000Z"),
    rawBody: "fixture",
    rawSha256: "a".repeat(64),
  });
  await expect(insertSameRun(run)).rejects.toMatchObject({ code: "23505" });
  await expect(insertInvalidCandidateStatus(run.id)).rejects.toMatchObject({
    code: "23514",
  });
  await expect(insertDanglingCandidateSource()).rejects.toMatchObject({
    code: "23503",
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/integration/editorial-briefing-schema.test.ts --hookTimeout=60000 --no-file-parallelism`

Expected: FAIL because the new tables and exports do not exist.

- [ ] **Step 3: Add exact enum/check values and tables**

```ts
export const editorialCandidateStatusValues = [
  "NEW", "NEEDS_VERIFICATION", "READY_FOR_DRAFT", "DRAFTED",
  "REVIEW_REQUIRED", "APPROVED", "PUBLISHED", "REJECTED", "EXPIRED",
] as const;

export const editorialReviewTypeValues = [
  "FACT", "UX_WRITING", "SEO", "LINK", "FINAL",
] as const;

export const editorialTruthSyncStateValues = [
  "NOT_REQUIRED", "REQUIRED", "COMPLETE",
] as const;
```

Implement these database invariants:

- `briefing_runs`: unique `(source_kind, source_run_at, raw_sha256)`, 64-lowercase-hex hash, `source_timezone='Asia/Seoul'`, immutable by application convention.
- `editorial_candidates`: score 0–12, priority P0/P1/P2, existing Article type/category checks, optional `draft_article_id`, optional duplicate FK, `truth_sync_state` check, optimistic `updated_at`.
- candidate source link: required existing `source_id`, optional matching observation/snapshot, `claim_scope`, `required_for_publish`, and status check.
- candidate Institution/Opportunity joins: unique pair and restrict target deletion.
- reviews: append-only row with `reviewed_candidate_updated_at` and optional `reviewed_article_updated_at`.
- Article source links: unique `(article_id, candidate_source_id, relation_type)`.
- rechecks: one open item per `(article_id, reason)` using a partial unique index.

- [ ] **Step 4: Generate and inspect the additive migration**

Run: `npm run db:generate -- --name=briefing_editorial_pipeline`

Expected: creates migration number `0014`, a matching meta snapshot, and a journal entry. Rename only if Drizzle does not produce `0014_briefing_editorial_pipeline.sql`; never edit an already-applied migration.

Inspect every `DROP`, `ALTER ... DROP`, and table rewrite. Expected: additive tables, indexes, checks, and foreign keys only.

- [ ] **Step 5: Update the static migration manifest from the generated SQL hash**

Add `0014_briefing_editorial_pipeline` and its exact SHA-256 to `EXPECTED_REPOSITORY_MIGRATIONS`; update the ordered expectation in `wp15a-migrations.test.ts`.

- [ ] **Step 6: Run migration and schema tests**

Run: `npm test -- tests/unit/wp15a-migrations.test.ts tests/unit/wp16a-migration-manifest.test.ts tests/integration/editorial-briefing-schema.test.ts --hookTimeout=60000 --no-file-parallelism`

Expected: PASS with exact ordered ledger and database constraints.

- [ ] **Step 7: Commit the schema slice**

```bash
git add src/db/schema/index.ts src/db/migrations/0014_briefing_editorial_pipeline.sql src/db/migrations/meta/0014_snapshot.json src/db/migrations/meta/_journal.json src/modules/production-safety/migration-manifest.ts tests/unit/wp15a-migrations.test.ts tests/unit/wp16a-migration-manifest.test.ts tests/integration/editorial-briefing-schema.test.ts
git commit -m "feat: add editorial briefing schema"
```

### Task 2: Implement strict contracts, structured parsing, and deterministic scoring

**Files:**
- Create: `src/modules/editorial-briefing/contracts.ts`
- Create: `src/modules/editorial-briefing/parser.ts`
- Create: `src/modules/editorial-briefing/scoring.ts`
- Create: `tests/unit/editorial-briefing-contracts.test.ts`
- Create: `tests/unit/editorial-briefing-parser.test.ts`
- Create: `tests/unit/editorial-briefing-scoring.test.ts`
- Create: `tests/fixtures/editorial-briefing/2026-09-12.json`

**Interfaces:**
- Produces: `parseBriefingImport(value): BriefingImport`, `parseStructuredBriefing(rawBody): ParsedBriefing`, `scoreEditorialCandidate(input): EditorialScore`.
- Consumes: Article type/category values and editorial status values from `src/db/schema/index.ts`.

- [ ] **Step 1: Write failing contract and parser tests**

```ts
expect(parseStructuredBriefing(rawWithValidJson)).toMatchObject({
  parseStatus: "COMPLETE",
  candidates: [{ priority: "P0", recommendedAction: "VERIFY" }],
});
expect(parseStructuredBriefing("사람용 브리핑만 있음")).toEqual({
  parseStatus: "PARTIAL",
  candidates: [],
});
expect(() => parseBriefingImport({ rawBody: "x".repeat(262_145) })).toThrow();
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- tests/unit/editorial-briefing-contracts.test.ts tests/unit/editorial-briefing-parser.test.ts tests/unit/editorial-briefing-scoring.test.ts`

Expected: FAIL because the domain modules are absent.

- [ ] **Step 3: Implement bounded Zod contracts**

```ts
export type BriefingImport = Readonly<{
  sourceRunAt: string;
  sourceTimezone: "Asia/Seoul";
  rawBody: string;
}>;

export type ParsedBriefing = Readonly<{
  parseStatus: "COMPLETE" | "PARTIAL";
  candidates: readonly ParsedEditorialCandidate[];
}>;
```

Reject prototype-sensitive keys, non-plain trees, unknown enum values, URLs outside absolute HTTP(S), more than 50 candidates, more than 12 sources per candidate, and strings over their declared limits. Parsing a missing or malformed optional JSON block returns `PARTIAL`; it never claims `no changes`.

- [ ] **Step 4: Implement the exact 0–12 scoring function**

```ts
export function scoreEditorialCandidate(input: EditorialScoreInput): EditorialScore {
  const score = input.parentImpact + input.urgency + input.evidenceStrength +
    input.searchIntent + input.productConnection + input.enduringValue;
  return {
    score,
    priority: score >= 10 ? "P0" : score >= 7 ? "P1" : "P2",
    publishBlocked: input.hasMaterialConflict,
  };
}
```

Each component must be an integer from 0 through 2. `hasMaterialConflict=true` always blocks publication regardless of score.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- tests/unit/editorial-briefing-contracts.test.ts tests/unit/editorial-briefing-parser.test.ts tests/unit/editorial-briefing-scoring.test.ts`

Expected: PASS, including the ACA-style year conflict and raw-only partial case.

- [ ] **Step 6: Commit the pure domain slice**

```bash
git add src/modules/editorial-briefing/contracts.ts src/modules/editorial-briefing/parser.ts src/modules/editorial-briefing/scoring.ts tests/unit/editorial-briefing-contracts.test.ts tests/unit/editorial-briefing-parser.test.ts tests/unit/editorial-briefing-scoring.test.ts tests/fixtures/editorial-briefing/2026-09-12.json
git commit -m "feat: parse and score briefing candidates"
```

### Task 3: Persist immutable briefing runs and idempotent candidate imports

**Files:**
- Create: `src/modules/editorial-briefing/repository.server.ts`
- Create: `src/modules/editorial-briefing/commands.server.ts`
- Create: `tests/integration/editorial-briefing-import.test.ts`
- Create: `tests/integration/editorial-briefing-rollback.test.ts`

**Interfaces:**
- Consumes: `BriefingImport`, `ParsedBriefing`, `AdminCommandContext`, `TransactionManager`, existing `AuditWriter`.
- Produces: `importEditorialBriefing(context, input, deps): Promise<BriefingImportResult>` and transaction-only repository functions.

- [ ] **Step 1: Write failing import and rollback tests**

```ts
const first = await importEditorialBriefing(context, fixture, dependencies);
const replay = await importEditorialBriefing(context, fixture, dependencies);
expect(replay.runId).toBe(first.runId);
expect(await counts()).toEqual({ runs: 1, candidates: first.candidateCount });
await expect(importWithInjectedCandidateFailure()).rejects.toThrow("injected");
expect(await countsAfterFailure()).toEqual({ runs: 1, candidates: first.candidateCount });
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- tests/integration/editorial-briefing-import.test.ts tests/integration/editorial-briefing-rollback.test.ts --hookTimeout=60000 --no-file-parallelism`

Expected: FAIL because the command and repository do not exist.

- [ ] **Step 3: Implement transaction-scoped repositories**

```ts
export async function findBriefingRunByIdentity(
  executor: DatabaseExecutor,
  identity: { sourceKind: "CHATGPT_SCHEDULED_TASK"; sourceRunAt: Date; rawSha256: string },
): Promise<typeof briefingRuns.$inferSelect | null>;

export async function insertEditorialCandidate(
  executor: TransactionExecutor,
  values: typeof editorialCandidates.$inferInsert,
): Promise<typeof editorialCandidates.$inferSelect>;
```

`findBriefingRunByIdentity` selects by all three identity fields, stable-orders by ID, limits to one row, and returns `null` when absent. `insertEditorialCandidate` performs one insert with `.returning()`, requires exactly one returned row, and throws the domain persistence error otherwise. Every write function must require `TransactionExecutor`. Raw text and private source identifiers must not enter Audit metadata; Audit stores run ID, hash, counts, and changed field names only.

- [ ] **Step 4: Implement idempotent import**

Compute SHA-256 over normalized UTF-8 bytes without altering the stored `rawBody`. Lock by the identity tuple, return the existing result on replay, parse candidates, insert the run/candidates/relations, write one Audit record, and commit once. `PARTIAL` imports remain visible for manual candidate creation.

- [ ] **Step 5: Run import, rollback, and existing Audit tests**

Run: `npm test -- tests/integration/editorial-briefing-import.test.ts tests/integration/editorial-briefing-rollback.test.ts tests/integration/wp11-admin-operations.test.ts --hookTimeout=60000 --no-file-parallelism`

Expected: PASS; zero Article, Opportunity, notification, delivery, or cache Outbox side effects.

- [ ] **Step 6: Commit the persistence slice**

```bash
git add src/modules/editorial-briefing/repository.server.ts src/modules/editorial-briefing/commands.server.ts tests/integration/editorial-briefing-import.test.ts tests/integration/editorial-briefing-rollback.test.ts
git commit -m "feat: import editorial briefings idempotently"
```

### Task 4: Add candidate triage, source verification, review, and approval commands

**Files:**
- Modify: `src/modules/editorial-briefing/contracts.ts`
- Modify: `src/modules/editorial-briefing/repository.server.ts`
- Modify: `src/modules/editorial-briefing/commands.server.ts`
- Create: `tests/unit/editorial-candidate-transitions.test.ts`
- Create: `tests/integration/editorial-candidate-commands.test.ts`
- Create: `tests/integration/editorial-candidate-concurrency.test.ts`

**Interfaces:**
- Produces: `triageEditorialCandidate`, `setEditorialCandidateSource`, `recordEditorialReview`, `approveEditorialCandidate`, `rejectEditorialCandidate`.
- Consumes: `expectedUpdatedAt` optimistic tokens and existing canonical Source/Observation IDs.

- [ ] **Step 1: Write the failing transition matrix test**

```ts
expect(canTransition("NEW", "NEEDS_VERIFICATION")).toBe(true);
expect(canTransition("NEEDS_VERIFICATION", "READY_FOR_DRAFT")).toBe(true);
expect(canTransition("APPROVED", "NEW")).toBe(false);
expect(canTransition("PUBLISHED", "APPROVED")).toBe(false);
```

- [ ] **Step 2: Write failing command eligibility tests**

Cover these exact cases:

- required source is `FOUND` rather than `VERIFIED` → approval rejected;
- `truthSyncState=REQUIRED` → approval rejected;
- material source is `CONFLICTING` → approval rejected;
- FACT review timestamp does not match current candidate `updatedAt` → approval rejected;
- community-only required fee/date claim → approval rejected;
- two concurrent approvals with one expected timestamp → one commit, one conflict.

- [ ] **Step 3: Run tests and verify RED**

Run: `npm test -- tests/unit/editorial-candidate-transitions.test.ts tests/integration/editorial-candidate-commands.test.ts tests/integration/editorial-candidate-concurrency.test.ts --hookTimeout=60000 --no-file-parallelism`

Expected: FAIL because transitions and commands are absent.

- [ ] **Step 4: Implement explicit transition and approval policies**

```ts
export function canTransition(from: EditorialCandidateStatus, to: EditorialCandidateStatus) {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export type CandidateApprovalSnapshot = Readonly<{
  candidateUpdatedAt: string;
  truthSyncState: "NOT_REQUIRED" | "REQUIRED" | "COMPLETE";
  requiredSourcesVerified: boolean;
  materialConflictCount: number;
  currentFactReviewPassed: boolean;
}>;
```

Lock the candidate row, compare `expectedUpdatedAt`, validate the transition and approval snapshot, append Audit, and commit atomically. Source verification records `verifiedAt` separately from the existing collection/observation time.

- [ ] **Step 5: Run the focused transition and command tests**

Run: `npm test -- tests/unit/editorial-candidate-transitions.test.ts tests/integration/editorial-candidate-commands.test.ts tests/integration/editorial-candidate-concurrency.test.ts --hookTimeout=60000 --no-file-parallelism`

Expected: PASS.

- [ ] **Step 6: Commit candidate workflow commands**

```bash
git add src/modules/editorial-briefing/contracts.ts src/modules/editorial-briefing/repository.server.ts src/modules/editorial-briefing/commands.server.ts tests/unit/editorial-candidate-transitions.test.ts tests/integration/editorial-candidate-commands.test.ts tests/integration/editorial-candidate-concurrency.test.ts
git commit -m "feat: add editorial candidate review workflow"
```

### Task 5: Expose authenticated Admin HTTP commands

**Files:**
- Create: `src/modules/admin/http/editorial-briefing.server.ts`
- Create: `app/api/admin/editorial-briefings/import/route.ts`
- Create: `app/api/admin/editorial-briefings/candidates/[candidateId]/triage/route.ts`
- Create: `app/api/admin/editorial-briefings/candidates/[candidateId]/sources/route.ts`
- Create: `app/api/admin/editorial-briefings/candidates/[candidateId]/reviews/route.ts`
- Create: `app/api/admin/editorial-briefings/candidates/[candidateId]/draft/route.ts`
- Create: `tests/unit/editorial-briefing-admin-http.test.ts`
- Create: `tests/integration/editorial-briefing-admin-http.test.ts`

**Interfaces:**
- Consumes: Task 3/4 commands and existing `runAdminCommandRequest`.
- Produces: bounded authenticated POST adapters; no public or unauthenticated endpoints.

- [ ] **Step 1: Write failing HTTP boundary tests**

```ts
const response = await handleImportBriefingRequest(request(validBody), {
  authenticate: async () => admin,
  importEditorialBriefing: command,
});
expect(response.status).toBe(200);
expect(command).toHaveBeenCalledWith(expect.objectContaining({ adminUserId }), validBody);
```

Also assert 401 authentication failure, 403 CSRF/origin failure, 413 raw text over 256 KiB, 400 prototype-sensitive JSON, 409 stale candidate, and safe generic 500 responses.

- [ ] **Step 2: Run HTTP tests and verify RED**

Run: `npm test -- tests/unit/editorial-briefing-admin-http.test.ts tests/integration/editorial-briefing-admin-http.test.ts --hookTimeout=60000 --no-file-parallelism`

Expected: FAIL because adapters and routes are absent.

- [ ] **Step 3: Implement strict HTTP adapters**

```ts
export function handleEditorialCandidateReviewRequest(
  request: Request,
  rawPath: unknown,
  dependencies: EditorialBriefingHttpDependencies = {},
): Promise<Response> {
  return runAdminCommandRequest({
    request,
    rawPath,
    pathSchema: candidatePathSchema,
    bodySchema: reviewBodySchema,
    reason: "ADMIN_EDITORIAL_CANDIDATE_REVIEW",
    dependencies,
    execute: ({ context, path, body }) =>
      dependencies.recordEditorialReview(
        context,
        { candidateId: path.candidateId, ...body },
        dependencies.commandDependencies,
      ),
  });
}
```

Declare `EditorialBriefingHttpDependencies` with required `recordEditorialReview` and `commandDependencies` members, plus the existing authentication/request dependencies accepted by `runAdminCommandRequest`; the default production dependency object wires the real command and command dependencies. Each Route Handler should only await `params`, delegate to one adapter, and return its `Response`. Mutation handlers are not cached.

- [ ] **Step 4: Run HTTP and existing Admin command tests**

Run: `npm test -- tests/unit/editorial-briefing-admin-http.test.ts tests/integration/editorial-briefing-admin-http.test.ts tests/unit/wp13-admin-article-http.test.ts --hookTimeout=60000 --no-file-parallelism`

Expected: PASS with no regression to Article HTTP limits or auth behavior.

- [ ] **Step 5: Commit the HTTP slice**

```bash
git add src/modules/admin/http/editorial-briefing.server.ts app/api/admin/editorial-briefings/import/route.ts app/api/admin/editorial-briefings/candidates/[candidateId]/triage/route.ts app/api/admin/editorial-briefings/candidates/[candidateId]/sources/route.ts app/api/admin/editorial-briefings/candidates/[candidateId]/reviews/route.ts app/api/admin/editorial-briefings/candidates/[candidateId]/draft/route.ts tests/unit/editorial-briefing-admin-http.test.ts tests/integration/editorial-briefing-admin-http.test.ts
git commit -m "feat: add editorial briefing admin commands"
```

### Task 6: Build the Admin briefing queue and evidence comparison view

**Files:**
- Modify: `src/modules/admin/read-model/contracts.ts`
- Create: `src/modules/admin/read-model/editorial-briefing-query.server.ts`
- Create: `app/admin/(protected)/editorial-briefings/page.tsx`
- Create: `app/admin/(protected)/editorial-briefings/[candidateId]/page.tsx`
- Create: `app/admin/_components/editorial-briefing-import.tsx`
- Create: `app/admin/_components/editorial-candidate-actions.tsx`
- Modify: `app/admin/_components/admin-nav.tsx`
- Modify: `app/admin/admin.css`
- Create: `tests/unit/editorial-briefing-admin-pages.test.ts`
- Create: `tests/integration/editorial-briefing-admin-read.test.ts`

**Interfaces:**
- Produces: `listAdminEditorialCandidates(executor, input)` and `getAdminEditorialCandidateDetail(executor, candidateId)`.
- Consumes: bounded DTOs and Task 5 endpoints.

- [ ] **Step 1: Write failing read-model privacy and bounds tests**

```ts
expect(list.items[0]).toMatchObject({
  priority: "P0",
  sourceSummary: { required: 1, verified: 0, conflicting: 1 },
});
expect(JSON.stringify(list)).not.toContain("rawBody");
expect(detail.rawBody.length).toBeLessThanOrEqual(262_144);
```

The list never projects raw briefing text, source snapshot bodies, Admin identity details, or arbitrary JSON. The detail projects raw briefing text only to the authenticated Server Component.

- [ ] **Step 2: Write failing page-copy tests**

Assert these exact labels and statuses exist:

- `브리핑 후보`
- `출처 확인`
- `데이터 반영`
- `초안 만들기`
- `보류`
- `제외`
- `학교 페이지를 불러오지 못해 이번 변경을 확인하지 못했어요.`
- `안내에 적힌 날짜가 서로 달라요. 정확한 일정은 학교에 확인해 주세요.`

- [ ] **Step 3: Run tests and verify RED**

Run: `npm test -- tests/unit/editorial-briefing-admin-pages.test.ts tests/integration/editorial-briefing-admin-read.test.ts --hookTimeout=60000 --no-file-parallelism`

Expected: FAIL because the read model and pages are absent.

- [ ] **Step 4: Implement Server Component pages and narrow Client Components**

The queue supports status, priority, category, and conflict filters. The detail order is:

1. parent question and recommended action;
2. dates/amounts/conflict warning;
3. PREPPY current Institution/Opportunity values;
4. source links and collected/verified times;
5. briefing excerpt and full raw text disclosure;
6. explicit actions.

Client Components submit actions and display `role="status"` messages. They never receive Source snapshot bodies or database executors.

- [ ] **Step 5: Add responsive styles**

At narrow widths, show priority, conflict, important dates/amounts, and next action before the raw briefing disclosure. Use existing Admin tokens; do not introduce a second visual system.

- [ ] **Step 6: Run Admin UI/read tests**

Run: `npm test -- tests/unit/editorial-briefing-admin-pages.test.ts tests/integration/editorial-briefing-admin-read.test.ts tests/unit/wp13-admin-article-pages.test.ts tests/unit/wp13-admin-article-ui.test.ts --hookTimeout=60000 --no-file-parallelism`

Expected: PASS.

- [ ] **Step 7: Commit the Admin experience**

```bash
git add src/modules/admin/read-model/contracts.ts src/modules/admin/read-model/editorial-briefing-query.server.ts 'app/admin/(protected)/editorial-briefings/page.tsx' 'app/admin/(protected)/editorial-briefings/[candidateId]/page.tsx' app/admin/_components/editorial-briefing-import.tsx app/admin/_components/editorial-candidate-actions.tsx app/admin/_components/admin-nav.tsx app/admin/admin.css tests/unit/editorial-briefing-admin-pages.test.ts tests/integration/editorial-briefing-admin-read.test.ts
git commit -m "feat: add editorial briefing review queue"
```

### Task 7: Create grounded Article drafts and enforce briefing-linked publish eligibility

**Files:**
- Create: `src/modules/editorial-briefing/draft-bridge.server.ts`
- Modify: `src/modules/editorial-briefing/repository.server.ts`
- Modify: `src/modules/editorial/article-commands.server.ts`
- Modify: `src/modules/editorial/repository.server.ts`
- Modify: `src/modules/admin/http/editorial-briefing.server.ts`
- Create: `tests/unit/editorial-briefing-draft-copy.test.ts`
- Create: `tests/integration/editorial-briefing-draft.test.ts`
- Create: `tests/integration/editorial-briefing-publish-guard.test.ts`

**Interfaces:**
- Produces: `createEditorialArticleDraft(context, input, deps)` and `loadBriefingPublishEligibility(executor, articleId)`.
- Consumes: existing `createArticleDraft`, relation repositories, Article sanitizer, and Article publish root transaction.

- [ ] **Step 1: Write failing grounded draft-copy tests**

```ts
const html = buildGroundedEditorialDraftHtml(verifiedCandidate);
expect(html).toContain("<h2>핵심 변화</h2>");
expect(html).toContain("<h2>적용 대상</h2>");
expect(html).toContain("<h2>중요한 일정</h2>");
expect(html).toContain("<h2>확인되지 않은 내용</h2>");
expect(html).not.toContain("놓치면 늦어요");
expect(html).not.toContain("학교 인증");
```

Only candidate claims backed by a `VERIFIED` source or current verified product data enter the scaffold. Unknown sections are omitted rather than filled with invented copy.

- [ ] **Step 2: Write failing publish-guard tests**

Cover:

- approved candidate + all current Article reviews PASS → publish;
- unresolved required source → reject with `NOT_ELIGIBLE` and zero writes;
- stale FACT review → reject;
- Article edited after UX/SEO/LINK/FINAL review → reject;
- `truthSyncState=REQUIRED` → reject;
- ordinary Article with no briefing link → preserves existing WP-13 behavior.

- [ ] **Step 3: Run tests and verify RED**

Run: `npm test -- tests/unit/editorial-briefing-draft-copy.test.ts tests/integration/editorial-briefing-draft.test.ts tests/integration/editorial-briefing-publish-guard.test.ts --hookTimeout=60000 --no-file-parallelism`

Expected: FAIL because the bridge and guard are absent.

- [ ] **Step 4: Implement one-transaction draft creation**

```ts
export type CreateEditorialDraftInput = Readonly<{
  candidateIds: readonly string[];
  slug: string;
}>;

export async function createEditorialArticleDraft(
  context: AdminCommandContext,
  rawInput: unknown,
  dependencies: EditorialDraftDependencies,
): Promise<{ articleId: string; candidateIds: readonly string[] }>;
```

Lock candidates in sorted ID order, require `READY_FOR_DRAFT` or `APPROVED`, build sanitized grounded HTML, call the existing Article repository inside the same root transaction, copy proposed Institution/Opportunity relations, link verified sources, set candidates to `DRAFTED`, write one Audit record, and create zero public cache events.

- [ ] **Step 5: Add the conditional publish guard**

Inside `publishArticle`, after locking the Article and before changing relations/status, load briefing links. If none exist, continue unchanged. If links exist, require:

- every linked live candidate is `APPROVED`;
- every `required_for_publish` source is `VERIFIED` and not discovery-only;
- no `CONFLICTING` material source;
- truth sync is `NOT_REQUIRED` or `COMPLETE`;
- current FACT review matches each candidate `updatedAt`;
- current UX_WRITING, SEO, LINK, and FINAL reviews match the Article `updatedAt` supplied to publish.

Failure throws the existing mapped eligibility error before Article, Audit, relation, redirect, or Outbox writes.

- [ ] **Step 6: Run draft, guard, rollback, and legacy Article tests**

Run: `npm test -- tests/unit/editorial-briefing-draft-copy.test.ts tests/integration/editorial-briefing-draft.test.ts tests/integration/editorial-briefing-publish-guard.test.ts tests/integration/wp13-article-publish.test.ts tests/integration/wp13-article-command-rollback.test.ts --hookTimeout=60000 --no-file-parallelism`

Expected: PASS; ordinary Article behavior remains byte-for-behavior compatible at its public boundary.

- [ ] **Step 7: Commit the Article bridge**

```bash
git add src/modules/editorial-briefing/draft-bridge.server.ts src/modules/editorial-briefing/repository.server.ts src/modules/editorial/article-commands.server.ts src/modules/editorial/repository.server.ts src/modules/admin/http/editorial-briefing.server.ts tests/unit/editorial-briefing-draft-copy.test.ts tests/integration/editorial-briefing-draft.test.ts tests/integration/editorial-briefing-publish-guard.test.ts
git commit -m "feat: gate briefing-backed article publication"
```

### Task 8: Show verified sources and separate collection/verification times on public Articles

**Files:**
- Modify: `src/modules/public/dto.ts`
- Modify: `src/modules/public/article-detail.server.ts`
- Modify: `src/modules/public/article-query.server.ts`
- Modify: `app/_lib/public-article.ts`
- Modify: `app/_components/opportunity-article-pages.tsx`
- Modify: `app/globals.css`
- Create: `tests/unit/editorial-article-source-copy.test.ts`
- Create: `tests/integration/editorial-article-public-sources.test.ts`
- Modify: `tests/unit/wp13-public-article.test.ts`
- Modify: `tests/integration/wp13-public-article.test.ts`

**Interfaces:**
- Produces: `PublicArticleSourceDTO` and `PublicArticleDTO.sources`.
- Consumes: `articleSourceLinks`, canonical `sources`, candidate source verification timestamps, and source observation collection timestamps.

- [ ] **Step 1: Write failing public-source privacy and semantics tests**

```ts
expect(article.sources[0]).toEqual({
  label: "학교 공식 안내",
  url: "https://school.example/admissions",
  collectedAt: "2026-09-12T23:00:00.000Z",
  verifiedAt: "2026-09-13T01:00:00.000Z",
  relationType: "PRIMARY",
});
expect(JSON.stringify(article)).not.toContain("rawBody");
expect(JSON.stringify(article)).not.toContain("adminUserId");
```

- [ ] **Step 2: Run public tests and verify RED**

Run: `npm test -- tests/unit/editorial-article-source-copy.test.ts tests/integration/editorial-article-public-sources.test.ts tests/unit/wp13-public-article.test.ts tests/integration/wp13-public-article.test.ts --hookTimeout=60000 --no-file-parallelism`

Expected: FAIL because source projection is absent.

- [ ] **Step 3: Add bounded verified source projection**

```ts
export type PublicArticleSourceDTO = Readonly<{
  label: "학교 공식 안내" | "공식 모집요강" | "공식 신청 페이지" | "참고 자료";
  url: string;
  collectedAt: string | null;
  verifiedAt: string;
  relationType: "PRIMARY" | "SUPPORTING" | "CONTEXT";
}>;
```

Return at most 12 active HTTP(S) sources. Publicly expose only candidate sources with `status=VERIFIED`. Derive the label from existing Source type/authority; never label discovery-only media/community as official. Deduplicate by canonical URL and prefer PRIMARY relation, then official authority, then stable URL order.

- [ ] **Step 4: Render the source block**

Use heading `공식 안내` when at least one official source exists; otherwise use `참고 자료`. Show `자료 수집` and `내용 확인` as separate values. Link labels describe the destination, such as `학교 입학 안내 열기`; do not use `자세히 보기`.

- [ ] **Step 5: Run public, metadata, sitemap, and sanitizer regressions**

Run: `npm test -- tests/unit/editorial-article-source-copy.test.ts tests/integration/editorial-article-public-sources.test.ts tests/unit/wp13-public-article.test.ts tests/integration/wp13-public-article.test.ts tests/unit/wp13-metadata.test.ts tests/integration/wp13-sitemap.test.ts tests/unit/wp13-sanitizer.test.ts --hookTimeout=60000 --no-file-parallelism`

Expected: PASS with no raw briefing, Admin identity, unsafe link, or private relation leakage.

- [ ] **Step 6: Commit the public trust block**

```bash
git add src/modules/public/dto.ts src/modules/public/article-detail.server.ts src/modules/public/article-query.server.ts app/_lib/public-article.ts app/_components/opportunity-article-pages.tsx app/globals.css tests/unit/editorial-article-source-copy.test.ts tests/integration/editorial-article-public-sources.test.ts tests/unit/wp13-public-article.test.ts tests/integration/wp13-public-article.test.ts
git commit -m "feat: show verified sources on briefing articles"
```

### Task 9: Add safe CLI import and deterministic recheck planning

**Files:**
- Create: `src/modules/editorial-briefing/cli.server.ts`
- Create: `src/modules/editorial-briefing/recheck.server.ts`
- Create: `scripts/data/import-editorial-briefing.ts`
- Create: `scripts/data/plan-editorial-rechecks.ts`
- Modify: `package.json`
- Create: `tests/unit/editorial-briefing-cli.test.ts`
- Create: `tests/unit/editorial-recheck-policy.test.ts`
- Create: `tests/integration/editorial-rechecks.test.ts`

**Interfaces:**
- Produces: `runEditorialBriefingCli(args, deps, env)`, `planEditorialRechecks(now, executor)`, and `applyEditorialRechecks(context, plan, deps)`.
- Consumes: Task 3 import command and existing runtime database lifecycle.

- [ ] **Step 1: Write failing CLI safety tests**

```ts
expect(parseEditorialBriefingCliArgs(["--file", "briefing.json"])).toMatchObject({
  mode: "dry-run",
});
expect(() => parseEditorialBriefingCliArgs([
  "--file", "briefing.json", "--apply",
])).toThrow(/expected-checksum/i);
```

Assert `--validate-only` never opens a database and production apply requires both exact checksum and `ALLOW_PRODUCTION_EDITORIAL_BRIEFING_IMPORT=1`.

- [ ] **Step 2: Write failing recheck-policy tests**

Cover application close passed, event date passed, source superseded, linked Opportunity changed, existing OPEN recheck dedupe, and no automatic Article `updatedAt` mutation.

- [ ] **Step 3: Run tests and verify RED**

Run: `npm test -- tests/unit/editorial-briefing-cli.test.ts tests/unit/editorial-recheck-policy.test.ts tests/integration/editorial-rechecks.test.ts --hookTimeout=60000 --no-file-parallelism`

Expected: FAIL because CLI and recheck modules are absent.

- [ ] **Step 4: Implement validate-only, dry-run, and guarded apply**

```ts
export type EditorialBriefingCliMode = "validate-only" | "dry-run" | "apply";

export type EditorialBriefingCliResult = Readonly<{
  mode: EditorialBriefingCliMode;
  targetEnvironment: "PRODUCTION" | "TEST" | "LOCAL";
  checksum: string;
  validation: { status: "PASS" | "FAIL"; candidateCount: number; errors: readonly string[] };
  applied: boolean;
  runId: string | null;
}>;
```

Default to dry-run. Print only structured counts, IDs, status, checksum, and safe error codes; never print raw briefing text, credentials, database URL, or source snapshot bodies.

- [ ] **Step 5: Implement deterministic recheck planning**

`planEditorialRechecks` is read-only and stable-sorted. `applyEditorialRechecks` inserts deduplicated OPEN work and one Audit record. It does not alter Article content, Article timestamps, Opportunity truth, notifications, or public CTA state.

- [ ] **Step 6: Add package scripts**

```json
{
  "data:import-editorial-briefing": "tsx --tsconfig scripts/db/tsconfig.json scripts/data/import-editorial-briefing.ts",
  "data:plan-editorial-rechecks": "tsx --tsconfig scripts/db/tsconfig.json scripts/data/plan-editorial-rechecks.ts"
}
```

- [ ] **Step 7: Run CLI and recheck tests**

Run: `npm test -- tests/unit/editorial-briefing-cli.test.ts tests/unit/editorial-recheck-policy.test.ts tests/integration/editorial-rechecks.test.ts --hookTimeout=60000 --no-file-parallelism`

Expected: PASS.

- [ ] **Step 8: Commit operational entry points**

```bash
git add src/modules/editorial-briefing/cli.server.ts src/modules/editorial-briefing/recheck.server.ts scripts/data/import-editorial-briefing.ts scripts/data/plan-editorial-rechecks.ts package.json tests/unit/editorial-briefing-cli.test.ts tests/unit/editorial-recheck-policy.test.ts tests/integration/editorial-rechecks.test.ts
git commit -m "feat: add safe briefing import and recheck tools"
```

### Task 10: Verify the complete Phase 1 workflow and write the pilot runbook

**Files:**
- Create: `tests/browser/editorial-briefing/seed.ts`
- Create: `tests/browser/editorial-briefing/run.py`
- Create: `tests/browser/editorial-briefing/scenarios.md`
- Create: `docs/runbooks/PREPPY_BRIEFING_EDITORIAL_PIPELINE.md`
- Create: `docs/data/PREPPY_BRIEFING_EDITORIAL_PIPELINE_PHASE1_REPORT.md`

**Interfaces:**
- Consumes: Tasks 1–9 and the existing Admin login/browser fixture pattern.
- Produces: repeatable desktop/tablet/mobile evidence, weekly operating instructions, recovery instructions, and a production go/no-go report.

- [ ] **Step 1: Write browser scenarios before the harness**

Document and assert:

1. import a redacted first-run-shaped briefing;
2. see KIS-style P0, ACA-style conflict, data-only ended event, and raw-only partial states;
3. verify a source and keep collection/verification times distinct;
4. complete truth sync and FACT review;
5. create a grounded draft;
6. fail publication before current UX_WRITING/SEO/LINK/FINAL reviews;
7. pass all reviews and publish explicitly;
8. see Article under the correct category with related Institution/Opportunity and source block;
9. open official external destination with accurate accessible name;
10. create a recheck after the linked deadline passes without silently changing Article text.

- [ ] **Step 2: Implement dedicated seed and browser harness**

Follow `tests/browser/wp13/run-article-browser.py`: require a dedicated database suffix, record exact spawned process IDs, use deterministic fixture IDs, capture desktop/tablet/mobile screenshots, and stop only recorded processes.

- [ ] **Step 3: Run focused unit and integration suites**

Run:

```bash
npm test -- tests/unit/editorial-briefing-contracts.test.ts tests/unit/editorial-briefing-parser.test.ts tests/unit/editorial-briefing-scoring.test.ts tests/unit/editorial-candidate-transitions.test.ts tests/unit/editorial-briefing-admin-http.test.ts tests/unit/editorial-briefing-admin-pages.test.ts tests/unit/editorial-briefing-draft-copy.test.ts tests/unit/editorial-article-source-copy.test.ts tests/unit/editorial-briefing-cli.test.ts tests/unit/editorial-recheck-policy.test.ts tests/integration/editorial-briefing-schema.test.ts tests/integration/editorial-briefing-import.test.ts tests/integration/editorial-briefing-rollback.test.ts tests/integration/editorial-candidate-commands.test.ts tests/integration/editorial-candidate-concurrency.test.ts tests/integration/editorial-briefing-admin-http.test.ts tests/integration/editorial-briefing-admin-read.test.ts tests/integration/editorial-briefing-draft.test.ts tests/integration/editorial-briefing-publish-guard.test.ts tests/integration/editorial-article-public-sources.test.ts tests/integration/editorial-rechecks.test.ts --hookTimeout=60000 --no-file-parallelism
```

Expected: PASS with zero failed tests.

- [ ] **Step 4: Run full static and application verification**

Run:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test -- --hookTimeout=60000 --no-file-parallelism
npm run build
```

Expected: every command exits 0. Do not infer build success from tests.

- [ ] **Step 5: Run desktop/tablet/mobile browser verification**

Run: `python tests/browser/editorial-briefing/run.py`

Expected: all documented Admin and public scenarios pass at the three viewports, external links and accessible names match, and no raw briefing/Admin identity appears in public output.

- [ ] **Step 6: Write the weekly operator runbook**

The runbook must contain exact commands and decisions for:

- obtain the latest Monday 08:00 KST result;
- create a local JSON import file without private identifiers;
- validate-only and dry-run;
- compare SHA-256 and apply behind the explicit environment gate;
- triage P0/P1/P2 and material conflicts;
- verify Source/Observation/Evidence and product truth first;
- create, edit, preview, review, and explicitly publish a draft;
- process access failure, conflict, duplicate run, stale edit, expired event, and correction;
- execute the recheck planner;
- record `UX Writing: PASS` or `FIX_REQUIRED`.

- [ ] **Step 7: Rehearse migration and import outside production**

Run the existing production preflight and rehearsal workflow against a dedicated verification database, then:

```bash
npm run data:import-editorial-briefing -- --file tests/fixtures/editorial-briefing/2026-09-12.json --validate-only
npm run data:import-editorial-briefing -- --file tests/fixtures/editorial-briefing/2026-09-12.json --dry-run
```

Expected: validation PASS; dry-run reports planned counts and zero persistent rows or side effects.

- [ ] **Step 8: Stop at the production go/no-go gate**

Record migration hash, backup/preflight status, focused/full/browser/build results, planned import counts, side-effect deltas, copy review, and rollback procedure in `PREPPY_BRIEFING_EDITORIAL_PIPELINE_PHASE1_REPORT.md`.

Do not migrate production, import a live briefing, create a production draft, publish, push, merge, or deploy until the Owner explicitly approves this report.

- [ ] **Step 9: Commit verification assets and runbook**

```bash
git add tests/browser/editorial-briefing/seed.ts tests/browser/editorial-briefing/run.py tests/browser/editorial-briefing/scenarios.md docs/runbooks/PREPPY_BRIEFING_EDITORIAL_PIPELINE.md docs/data/PREPPY_BRIEFING_EDITORIAL_PIPELINE_PHASE1_REPORT.md
git commit -m "test: verify briefing editorial workflow"
```

---

## Plan Self-Review

- Spec coverage: Phase 1 import, candidate triage, evidence linkage, truth-first workflow, grounded draft, human publication, public source block, failure states, rechecks, measurement hooks, responsive verification, and runbook are assigned to Tasks 1–10.
- Intentional boundary: Phase 2 model-generated prose and Phase 3 automated monitoring are excluded by the four-run pilot gate and require separate plans based on actual acceptance, conflict, correction, and latency data.
- Type consistency: candidate, source, review, draft, Article relation, and recheck interfaces originate in Tasks 1–4 and are consumed by name in later tasks.
- Safety: public publication remains an authenticated explicit action; production mutation is separated by a final Owner go/no-go gate.
- UX Writing: every user-visible state in the spec has a planned contract, page assertion, or browser scenario. Actual rendering is not marked PASS before Task 10 executes.
