# PREPPY Seed DB Acceptance Report

**Date:** 2026-08-28
**Branch:** `feat/preppy-seed-import-bootstrap`
**Starting and final HEAD:** `bea26170bfa2e8a8ea635e32cc2069b6e36b9cd0`
**Final verification state:** `PASS`

## Test Environment

- PostgreSQL: `PostgreSQL 16.14 on x86_64-pc-linux-musl`
- Disposable Compose project: `preppy-seed-acceptance`
- Disposable container: `preppy-seed-acceptance-postgres-1`
- Databases: `admissionradar_test`, plus disposable guard-compliant `_verifyN` databases for isolated rollback and regression runs
- Application/import connections: `TEST_DATABASE_URL` only; `DATABASE_URL` was removed from the command environment
- Production DB used: **NO**
- Production credentials used: **NO**
- Railway Production used: **NO**

## Migration

The repository's canonical `migrateDatabase(TEST_DATABASE_URL)` runner applied migrations `0000` through `0011` to a blank disposable database.

- `drizzle.__drizzle_migrations`: 12 rows
- Latest applied migration: `0011_preppy_seed_registry`
- Latest ledger hash: `f1dbfa4648f903c9ae651a9e3ca6e7416f7c3f827f6cd2597295c67bd4361fe0`
- `institution_registry_identities`: present
- Registry identity FK/check/indexes: present
- Registry identity unique key: `(registry_name, registry_external_id)`
- Source unique key: unique index on `sources.canonical_url`
- Binding unique key: `(institution_id, source_id, role)`

## Dataset

The canonical package loader revalidated the adjacent SHA256 manifest before JSON parsing.

- Canonical JSON SHA-256: `38211856afc0066f2400f3c2a28969ec770cab2f24e90c77ffb0a37642d2206a`
- Total Institutions: 63
- Private elementary: 41
- International school: 22
- Seoul: 54
- Gyeonggi: 9
- Canonical source records: 126
- Excluded rows: 3
- Resolved/importable: 57
- Pending and skipped: 6

Pending rows were exactly: 유석초등학교, 상명초등학교, 청원초등학교, 중앙대학교사범대학부속초등학교, 신광초등학교, 리라초등학교. None was persisted.

## Dry Run

The clean database contained zero domain/product rows before dry-run.

- Planned Institutions: 57
- Planned registry identities: 57
- Planned Sources: 114
- Planned bindings: 114
- Planned pending skips: 6
- Conflicts: 0
- Actual DB writes: **0**
- Direct table counts before and after: unchanged at zero, including seed audit rows

## First Apply

- Institutions created: 57
- Registry identities created: 57
- Sources created: 114
- Bindings created: 114
- Pending skipped: 6
- Conflicts: 0
- Seed audit rows created: 1
- Actual post-apply counts: `57 / 57 / 114 / 114`
- Repository Source counts: 57 `OFFICIAL_REGISTRY` + 57 `OFFICIAL_SCHOOL_PAGE`
- Binding counts: 57 `REGISTRY_IDENTITY` + 57 `OFFICIAL_MAIN`

## Publication Safety

- DRAFT Institutions: 57
- PUBLISHED Institutions: 0
- Public list exposure: 0 rows through `listInstitutions`
- Public detail exposure: `NotFoundError` through `getInstitutionBySlug`
- Sitemap detail exposure: 0 Institution detail URLs through `listPublicSitemapEntries`

## Product Side Effects

All first-apply and second-apply deltas were zero. Direct PostgreSQL counts remained zero.

- Facts delta: 0
- Opportunities delta: 0
- Observations delta: 0
- Snapshots delta: 0
- Source monitor configs delta: 0
- Detected changes delta: 0
- Meaningful changes delta: 0
- Outbox delta: 0
- Notifications delta: 0
- Notification deliveries/attempts delta: 0
- Email provider events delta: 0

## Second Apply

- New Institutions: 0 (`UNCHANGED`: 57)
- New registry identities: 0
- New Sources: 0 (`SOURCE_REUSED`: 114)
- New bindings: 0 (`BINDING_REUSED`: 114)
- Pending skipped: 6
- Conflicts: 0
- Actual counts after second apply: `57 / 57 / 114 / 114`, identical to first apply
- Duplicate registry identity groups: 0
- Duplicate canonical Source URL groups: 0
- Duplicate binding key groups: 0
- Seed audit rows: 2, one per successful apply invocation

## Constraint Proof

Actual PostgreSQL duplicate insert attempts were executed and caught as `unique_violation` for all three keys:

- `institution_registry_identities_registry_unique`: proved
- `sources_canonical_url_unique`: proved
- `institution_source_bindings_target_source_role_unique`: proved

Counts remained `57 / 57 / 114 / 114` after the attempts.

## Conflict Atomicity

A material address conflict was injected for the canonical `simseok-e` identity. Apply returned `applied=false`, `applyAllowed=false`, with one `CONFLICT_EXISTING_IDENTITY`. No Institution, identity, Source, binding, or seed-audit count changed. The importer did not overwrite the conflicting row; the test fixture was then restored.

## Rollback

On a separately migrated blank `admissionradar_verify1` database, the importer's existing `afterDomainWrites` test seam threw `TEST_INDUCED_ROLLBACK`. PostgreSQL counts after the rejected transaction were:

- Institutions: 0
- Registry identities: 0
- Sources: 0
- Bindings: 0
- Seed audits: 0
- Migration ledger: 12

This proves the 57/57/114/114 domain write set and Audit are in one atomic transaction.

## Advisory Lock

One transaction held `pg_advisory_xact_lock(hashtext('preppy-institution-seed-import-v1'))` while a second importer session started. PostgreSQL reported the importer session as:

- `wait_event_type`: `Lock`
- `wait_event`: `advisory`
- Import resolved while lock held: `false`
- Import completed after release: `true`

## KIS Campus

The same registry group key retained distinct Institution identities:

- KIS Seoul: `a01e9b16-2790-5156-a190-237ea23a03fe`
- KIS Pangyo: `04569369-699c-5371-9d05-3cb5a333548f`
- IDs are different: **YES**

## Regression

- Seed contract unit test: PASS — 9/9
- Seed integration tests: PASS — 2 files, 9 tests
- Full unit tests: PASS — 107 files, 943 tests
- Full integration tests: PASS — 72 files, 528 tests, executed with `--no-file-parallelism` on a fresh disposable `_verify3` DB
- TypeScript: PASS — `tsc --noEmit`
- Production build: PASS — Next.js 16.3.0 optimized build, using non-production `APP_BASE_URL=https://preppy.test`
- `git diff --check`: PASS

Legacy integration expectations that hard-coded 11 migrations/`0010_colorful_randall_flagg` were updated to the current 12-migration/`0011_preppy_seed_registry` ledger. No production logic or seed architecture was refactored for this correction.

## Disposable Cleanup

`docker compose -p preppy-seed-acceptance down -v` completed with exit code 0. Follow-up container, volume, and network filters returned no entries. All acceptance databases and test artifacts stored in the disposable volume were removed.

## Safety Statement

- Working tree review required: Yes
- Commit created: No
- Push performed: No
- Production database modified: No
- Production credentials used: No
- Production deployed: No
- Untracked canonical `data/` deleted or cleaned: No

## Final Verdict

`PASS`
