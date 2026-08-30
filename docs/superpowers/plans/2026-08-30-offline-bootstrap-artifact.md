# Offline Bootstrap Artifact Implementation Plan

> **For agentic workers:** Use the approved owner topology and TDD task-by-task; review the completed security boundary independently.

**Goal:** Collect Lila locally without a database connection, validate its immutable artifact inside Railway, and stop after Production dry-run with an exact future apply command.

**Architecture:** The existing bounded collector/extractors produce a versioned, checksummed artifact. A strict offline validator reconstructs the existing canonical persistence input from bounded evidence, without a fetch path. Existing per-school persistence transactions remain authoritative.

**Tech Stack:** Existing TypeScript, Zod, Node crypto/fs, PostgreSQL/Drizzle, Vitest. No added dependency.

**Spec:** Owner message “PREPPY LOCAL COLLECTION → PRODUCTION PERSISTENCE MODE”, sections 1–13, 2026-08-30.

## Global Constraints

- No Production database access from local collection, no public TCP proxy.
- Production persistence only inside Railway preppy-web; this turn runs dry-run only.
- No schema, migration, UI, notification, robots, TLS, or response-size bypass.
- Artifact checksum detects mutation, not authorship; the operator approves the exact checksum before apply.
- Preserve the current diagnostics/robots fix in its own commit; do not push.
- Do not collect all 41 or apply any Production artifact during this first-report stage.

## Task 1: Strict artifact contract

Files: create `src/modules/institution-detail-bootstrap/artifact.server.ts`, `artifact-schema.ts`, and `tests/unit/preppy-private-elementary-artifact.test.ts`.

- [x] Write failing tests for version/checksum, exact allowlist, target identity, official URL, unsupported enums, invalid dates, stale cycle, missing evidence, duplicate facts, and content fingerprints.
- [x] Run `npx vitest run tests/unit/preppy-private-elementary-artifact.test.ts`; observe the missing contract fail.
- [x] Implement `createBootstrapArtifact(collection, seedSha256, generatedAt)` and `validateBootstrapArtifact(value, targets, seedSha256, now)`.
- [x] Retain only used source pages/root with bounded evidence text, original response hash, and a separately recomputable excerpt snapshot fingerprint. Never mislabel a truncated excerpt as the original full-body snapshot.
- [x] Validate registry facts against `buildRegistryBaselineFacts`; convert verified artifacts into `CollectedPrivateElementarySchool` without extraction or HTTP.
- [x] Re-run focused tests to green.

## Task 2: Collect-only and persistence-only CLI

Files: create `artifact-cli.server.ts`, `artifact-runner.server.ts`; modify `cli.server.ts`, `.gitignore`; add CLI unit tests.

- [x] Write failing CLI tests for incompatible flags, no DB opening during collect, immutable output, and Railway-only persistence guards.
- [x] Implement `--collect-only --output=<path>` and `--apply-artifact=<file-or-directory> [--dry-run] --production`; require acknowledgement for apply.
- [x] Support an optional read-only inventory export for seed rows with unresolved registry identity; never invent IDs.
- [x] Write artifact files exclusively (no overwrite), ignore `.preppy-bootstrap/`, and bound reads/file count.
- [x] Validate all artifact inputs before invoking a writer; report per-school rejection/failure without rolling back other school transactions.
- [x] Use a read-only transaction for dry-run inventory/schema/preview/count checks. Do not call the collector or persistence writer in dry-run.

## Task 3: Persistence regression

Files: add `tests/integration/preppy-private-elementary-artifact.test.ts` and bounded fixtures in test support.

- [x] Use dedicated local PostgreSQL only. Exercise real canonical persistence from validated artifact input.
- [x] Prove baseline reuse, source/evidence/Version provenance, correct timestamps, idempotent replay, malformed artifact write=0, per-school rollback, and six side-effect deltas=0.
- [x] Run full unit/integration, typecheck, build (local APP_BASE_URL), changed-file ESLint/Prettier, audit, and diff check.
- [x] Request read-only review of validation and runtime boundaries; resolve important findings before Production dry-run.

## Task 4: Lila first report

- [x] Collect only Lila locally with no DATABASE_URL; inspect 2027 schedule, official fact evidence and checksum.
- [x] Transfer the immutable artifact and scoped operator code bundle to an isolated Railway `/tmp` directory, without replacing the running web app or deploying.
- [x] Execute Railway artifact dry-run only; independently compare before/after Production counts and six side effects.
- [x] Report artifact version/checksum/path, actual collection summary, tests, dry-run proof, and exact future Railway apply command.
- [x] Keep the operator artifact for approval. Remove only disposable local test containers created for validation; no Production apply, push, or deploy.
