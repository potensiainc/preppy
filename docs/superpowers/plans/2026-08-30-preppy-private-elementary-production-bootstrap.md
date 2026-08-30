# PREPPY 41 Private Elementary Production Detail Bootstrap Implementation Plan

**Goal:** Safely collect and persist official Institution facts and current admission knowledge for the exact 41 published private elementary schools, with no migration and no Product side effects.

**Architecture:** Reuse the static HTTP safety stack and live-admission extractor. Collect/extract outside database transactions, then persist one school atomically through a production-schema-compatible raw-SQL repository. Continue after per-school failures and emit one complete machine-readable report.

**Tech stack:** TypeScript, Node 22, Cheerio, bounded PDF text extraction, Drizzle raw SQL/PostgreSQL, Vitest.

---

### Task 1: Lock scope and CLI contracts

1. Add failing unit tests for the exact 41 checksum-bound targets, slug filtering, mode flags, default dry-run, mutually exclusive facts/admissions flags, and the explicit Production apply guard.
2. Implement dataset loading, target validation, contracts, and CLI parsing.
3. Run the focused unit tests.

### Task 2: Capture and rank bounded official pages

1. Add failing collector tests for the optional bounded page callback without changing existing results.
2. Extend the crawler with the callback and reuse one shared polite transport configured for global 3/per-host 1.
3. Add failing discovery tests for keyword scoring, same-domain enforcement, external rejection, PDF candidates, candidate warnings, and school-vs-partial fetch failure.
4. Implement the bootstrap discovery layer and run focused tests.

### Task 3: Extract deterministic facts and admissions

1. Add failing tests for tuition, grades, curriculum, eligibility, transport, admission process, missing values, Korean application/event dates, explicit 2026/2027, and 2027 precedence.
2. Implement bounded Fact extraction and the existing admission-extractor adapter/ranker.
3. Add bounded PDF decoding using the smallest verified runtime dependency; unsupported documents produce warnings only.
4. Run focused extraction tests.

### Task 4: Add schema capability preflight

1. Add failing tests for stable required tables/columns, allowed source/binding values, and rejection without migration-ledger access.
2. Implement read-only `information_schema`/`pg_catalog` inspection and a redacted capability result.
3. Run focused tests.

### Task 5: Implement per-school atomic persistence

1. Add integration tests for Source/binding reuse, official registry fallback type, Fact/Version/Evidence chains, Admission/Version/Evidence chains, equal-content no-op, changed-content supersession, observation/snapshot compatibility, and already-PUBLISHED Institution preservation.
2. Add integration tests for school-specific advisory locking, one-school rollback, continuation to a succeeding school, and zero side-effect deltas.
3. Implement raw-SQL compatibility persistence inside exactly one transaction per school.
4. Run focused integration tests twice to prove idempotency.

### Task 6: Compose runner and report

1. Add failing tests for 41/41 attempt semantics, `NOT_FOUND`/`NOT_ANNOUNCED` success, partial warnings, report completion after failures, and non-zero final exit status.
2. Implement collect/validate-first orchestration, bounded concurrency, sequential per-school persistence, report aggregation, and CLI output.
3. Add the package script and CLI entrypoint.
4. Run focused unit and integration tests.

### Task 7: Regression and Production dry-run gate

1. Run full unit and integration suites, typecheck, production build, formatter check, and `git diff --check`.
2. Audit the diff for migrations/schema/UI/notification/follow/article changes and secrets/raw artifacts.
3. Run the guarded 41-school Production dry-run only; verify no database deltas.
4. Present the full report, one best-school preview, and exact Production apply command. Do not execute apply without owner approval.
