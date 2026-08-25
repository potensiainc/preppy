# WP-16A Production Safety Implementation Plan

> **For Codex:** Execute this plan with inline test-driven development. The approved WP-16A execution contract is authoritative. Keep every WP-16A change uncommitted and do not touch production or any live provider.

**Goal:** Prove a guarded non-production backup/restore path, expose read-only operational health, harden independent side-effect kill switches and capability-scoped secrets, and deliver executable cutover/abort/rollback operator documents.

**Architecture:** Add a bounded `production-safety` module that owns restore target guards, fixed-argument PostgreSQL tool execution, PII-safe manifests, restore validation, operational snapshots, structured safe logs, and capability validation. Extend the existing Admin health read model and Worker/Outbox claim filters without changing schema. Reuse the WP-15A invariant and read-smoke policies instead of creating parallel truth rules.

**Tech Stack:** TypeScript, Node.js `child_process.spawn`, PostgreSQL 16 `pg_dump`/`pg_restore`, postgres.js, Drizzle, Zod, Next.js, Vitest.

**Spec:** `docs/12_IMPLEMENTATION_PLAN.md` WP-16 sections, `docs/15A_PRODUCTION_PREFLIGHT.md`, and the approved WP-16A execution prompt in this task.

---

## Guardrails

- Production writes, backups, restores, migrations, claims, sends, analytics, cache calls, deploys, and remote Git operations are forbidden.
- The only authorized commit is the completed WP-15A checkpoint `7a60bd801b5b87ca90201455cc7c1a493ca31633`.
- Packages, migrations, and schema changes remain zero.
- Backup artifacts are generated only below a bounded OS temporary directory, are never overwritten, uploaded, or tracked, and contain synthetic/local rehearsal data only.
- Tests are written first and observed failing before implementation.

## Task 1: Lock the restore safety and manifest contracts

**Files:**
- Create: `src/modules/production-safety/database-guard.ts`
- Create: `src/modules/production-safety/backup-manifest.ts`
- Test: `tests/unit/wp16a-database-guard.test.ts`
- Test: `tests/unit/wp16a-backup-manifest.test.ts`

- [ ] Add failing tests for accepted non-production source/target names, production-like rejection, source/target equality, safe database labels, bounded artifact paths, overwrite rejection, SHA-256 format, deterministic count keys, and forbidden manifest fields.
- [ ] Implement URL identity comparison and `assertDedicatedRestoreDatabaseUrl()` without exposing credentials.
- [ ] Implement the versioned PII-safe manifest and artifact hash helpers.
- [ ] Run the focused tests to green.

## Task 2: Implement shell-safe PostgreSQL backup/restore tooling

**Files:**
- Create: `src/modules/production-safety/postgres-tools.server.ts`
- Create: `tests/unit/wp16a-postgres-tools.test.ts`

- [ ] Add failing dependency-injected spawn tests proving argument arrays, `shell: false`, fixed flags, bounded stderr, credential redaction, non-zero propagation, binary streaming, no overwrite, and exact generated-artifact cleanup only.
- [ ] Implement direct and Docker Compose PostgreSQL tool adapters with no arbitrary user flags.
- [ ] Run the focused tests to green and manually review every spawned argument.

## Task 3: Build restore validation and orchestration

**Files:**
- Create: `src/modules/production-safety/restore-validation.server.ts`
- Create: `src/modules/production-safety/restore-drill.server.ts`
- Create: `scripts/backup-restore-rehearsal.ts`
- Modify: `package.json`
- Test: `tests/unit/wp16a-restore-drill.test.ts`

- [ ] Add failing orchestration tests for source/target gates, disabled side effects, backup/hash/restore ordering, exact critical-count comparison, ledger match, invariants, read smoke, timing evidence, safe failure output, and deterministic exit status.
- [ ] Implement critical table count collection, migration comparison, WP-15A invariant reuse, public/Admin/Monitoring/KPI smoke reuse, and PII-safe drill results.
- [ ] Add a CLI that accepts configuration only from bounded environment keys and emits no DSNs or secrets.
- [ ] Run focused tests to green.

## Task 4: Prove the real non-production restore path

**Files:**
- Create: `tests/integration/wp16a-restore-drill.test.ts`
- Reuse: `tests/support/test-database.ts`

- [ ] Add a dedicated source/target integration test that migrates the source, seeds a synthetic representative fixture, performs a real custom-format backup and restore, compares ledger/counts, runs invariants/read smoke, and keeps Worker/Email/Analytics/Cache disabled.
- [ ] Run the restore integration test using the local PostgreSQL 16 Docker toolchain.
- [ ] Execute the bounded rehearsal CLI against dedicated local database names and retain only safe timing/hash evidence.

## Task 5: Add the read-only operational snapshot

**Files:**
- Create: `src/modules/production-safety/operational-snapshot.server.ts`
- Create: `src/modules/production-safety/operational-log.ts`
- Test: `tests/unit/wp16a-operational-log.test.ts`
- Test: `tests/integration/wp16a-operational-snapshot.test.ts`

- [ ] Add failing tests for DB/migration, Outbox status counts, stale lease and age, oldest due pending worker lag, failed Notifications, `PROVIDER_RESULT_UNKNOWN`, failed/orphan provider events, canonical Monitoring overdue reuse, cache failure/dead-letter/stale counts, and explicit analytics telemetry availability.
- [ ] Implement a server-only aggregate query with no mutations, no raw payload/body fields, and bounded point-in-time semantics.
- [ ] Implement an allowlisted structured operational logger and redaction tests.
- [ ] Run focused tests to green.

## Task 6: Extend the private Admin Operations health view

**Files:**
- Modify: `src/modules/admin/read-model/contracts.ts`
- Modify: `src/modules/admin/read-model/health-query.server.ts`
- Modify: `app/admin/(protected)/operations/health/page.tsx`
- Modify: `app/admin/(protected)/operations/page.tsx`
- Test: `tests/unit/wp16a-admin-operations-ui.test.ts`
- Test: `tests/integration/wp16a-admin-health.test.ts`

- [ ] Add failing tests for read-only operational cards and safe unavailable behavior.
- [ ] Compose the operational snapshot into the existing health bundle and render the approved cards without mutation controls.
- [ ] Re-run `tests/unit/health-route.test.ts` to prove `/api/health` remains liveness-only.

## Task 7: Harden Worker and Cache kill switches

**Files:**
- Modify: `src/config/runtime-env.ts`
- Modify: `src/modules/outbox/transitions.server.ts`
- Modify: `src/modules/worker/run-once.server.ts`
- Modify: `scripts/worker.ts`
- Modify: `.env.example`
- Test: `tests/unit/wp16a-kill-switches.test.ts`
- Test: `tests/integration/wp16a-kill-switches.test.ts`

- [ ] Add failing tests proving Worker OFF performs no recovery/claim/dispatch; Cache OFF excludes cache events from recovery and claim, performs no network request, and leaves rows untouched; Email OFF performs no provider call; Analytics OFF performs no GA request.
- [ ] Add the exact `CACHE_REVALIDATION_ENABLED` flag and filter both stale recovery and claims by enabled event capabilities.
- [ ] Construct cache secrets/client only when cache processing is enabled.
- [ ] Preserve existing Email suppression semantics and analytics Noop behavior.
- [ ] Run all affected WP-12/WP-13/WP-14 tests.

## Task 8: Enforce capability-scoped secret isolation

**Files:**
- Create: `src/config/production-capabilities.ts`
- Modify: `src/modules/cache/config.server.ts`
- Test: `tests/unit/wp16a-production-capabilities.test.ts`

- [ ] Add failing tests for disabled capability plus absent secret, enabled capability plus absent secret, configured cross-domain secret equality, safe configured/missing booleans, and exact current config-name mapping.
- [ ] Implement capability-local validation and cross-domain equality rejection without logging values.
- [ ] Represent current DB configuration honestly and document the future least-privilege roles without adding privilege DDL.
- [ ] Run focused and existing auth/cache/resend/analytics configuration tests.

## Task 9: Write executable production-safety documents

**Files:**
- Create: `docs/16A_PRODUCTION_SAFETY_RUNBOOK.md`
- Create: `docs/16A_PRODUCTION_READINESS_CHECKLIST.md`
- Create: `docs/16A_PRODUCTION_TOPOLOGY.md`
- Test: `tests/unit/wp16a-runbook-contract.test.ts`

- [ ] Add failing contract tests for every required heading, exact enable order, fresh-backup gate, abort list, rollback boundary, PASS/FAIL/NOT EXECUTED/NOT APPLICABLE vocabulary, proposed RPO/RTO/retention status, safe topology keys, and hardening gates.
- [ ] Write provider-neutral operator steps with production actions clearly deferred to WP-15B and user approval.
- [ ] Mark unknown topology/provider values `UNRESOLVED`; classify correctness/security-impacting unresolved topology as a WP-15B blocker.
- [ ] Keep secrets and environment-specific evidence out of tracked documents.

## Task 10: Hostile review and full verification

**Files:**
- Review all WP-16A changes.

- [ ] Search for production backup/restore targets, raw DSNs, shell interpolation, arbitrary flags, secret output, public deep-health leakage, disabled capability mutations/calls, optimistic rollback claims, and silent topology assumptions.
- [ ] Run focused WP-16A unit and integration suites.
- [ ] Run controlled full suite with `--hookTimeout=60000 --no-file-parallelism`.
- [ ] Run typecheck, lint, changed-file Prettier check, build, and `git diff --check`.
- [ ] Confirm package lock, migrations, and schema are unchanged; no production/live provider action occurred.
- [ ] Leave the WP-16A diff uncommitted and report either `READY_FOR_WP15B` or `BLOCKED` with concrete unresolved gates.
