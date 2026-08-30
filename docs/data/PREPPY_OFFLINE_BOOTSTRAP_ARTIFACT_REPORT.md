# PREPPY Offline Bootstrap Artifact — First Report

Date: 2026-08-30. Verdict: **FIRST_REPORT_PASS — OWNER_APPROVAL_REQUIRED**.

Release-stage note: the Owner subsequently approved release followed by Lila-only apply. The evidence below describes the completed first-report run. Its isolated `/tmp/.../code` bundle is historical dry-run evidence only and must never be used for Production writes. Production apply must use committed, merged, deployed `/app` code, with artifact JSON transferred separately.

This is implementation plus Lila Production artifact dry-run acceptance, not Production persistence or UI acceptance. No Production data was written. No all-41 collection/apply was executed.

## Scope and repository

- Branch: `codex/preppy-offline-bootstrap-artifact`.
- Parent main: `486b91012090a8d68fe56d35c8a9eb635950bba1`.
- Owner-authorized separate diagnostics fix commit: `3d278e6` — `fix(collector): reject HTML robots and preserve bootstrap diagnostics`.
- That commit contains only the existing robots/discovery fixes and their two unit-test files. HTML challenge pages are not accepted as robots policies.
- Offline artifact implementation remains uncommitted for review. No push or web deployment occurred.
- No schema, migration, UI, dependency, notification, robots bypass, TLS bypass, or response-limit expansion.

## Implementation and security boundaries

LOCAL: existing bounded official collector → extraction → validation → exclusive, read-only artifact file.

RAILWAY: read artifact → strict validation against canonical seed and actual 41-school DB inventory → existing school-level atomic persistence, only after explicit approval.

The collect-only branch opens no database. Pending seed identities use a read-only inventory export; no IDs are invented. Local collection ran with DATABASE_URL and TEST_DATABASE_URL unset. No Production credential was exported, and no public TCP proxy was enabled.

Production artifact commands require the preppy-web Production runtime and an internal Railway PostgreSQL host. Apply additionally requires the existing acknowledgement and the exact approved artifact checksum. A changed artifact or reordered batch fails approval validation before any DB query. Dry-run uses a PostgreSQL REPEATABLE READ, READ ONLY transaction and never invokes the persistence writer.

Validation rejects unsupported versions/enums, malformed or reversed dates, stale admission years below 2026, target ID/slug/name/category mismatches, non-allowlisted schools, non-official source domains, missing evidence, duplicate facts/sources and fingerprint/checksum mismatches. Registry baseline facts are reconstructed from the canonical seed for comparison. The registry URL is the exact canonical seed URL exception to the school-domain restriction.

Artifacts contain bounded extracted evidence, not full HTML. Original response hashes are preserved separately from a deterministic excerpt-snapshot fingerprint; truncated evidence is not mislabeled as a full-body snapshot. Artifact data cannot provide an operator verification timestamp. Existing persistence retains the collector timestamp and assigns verification time at approved execution.

Per-school atomic persistence is reused unchanged. Local PostgreSQL tests prove baseline reuse, replay idempotency, provenance, approval-checksum binding, invalid-artifact write=0, one-school rollback with another school's successful transaction retained, and no HTTP fetches from artifact persistence.

## Lila local collection

```powershell
npm run data:bootstrap-private-elementary:2026 -- --collect-only --slug=lila --inventory=.preppy-bootstrap/inventory.json --output=.preppy-bootstrap/lila-20260830.json
```

| Field | Actual result |
| --- | --- |
| Institution | 리라초등학교 |
| Institution ID | 9aa75c7b-e7de-55bc-ba67-03201af8cb6e |
| Slug / category | lila / PRIVATE_ELEMENTARY |
| Artifact version | 1 |
| Generated at | 2026-08-30T05:30:44.610Z |
| Local artifact | `.preppy-bootstrap/lila-20260830.json` |
| Artifact bytes / read-only file | 30,839 / YES |
| Classification | DETAIL_WITH_ADMISSION |
| Website collection | PARTIAL |
| Retained source pages / source definitions | 2 / 3 |
| Academic year / knowledge | 2027학년도 / SCHEDULE_FOUND |
| Application open | 2026-11-06 09:00 KST |
| Application close | 2026-11-11 16:30 KST |
| Admission collectedAt | 2026-08-30T05:30:30.158Z |
| verifiedAt | Not present in artifact; dry-run preview NULL |
| Local collection DB writes | 0 |

Official admission source: <https://www.lila.es.kr/kr/about/admission_guide.php>.

The source heading explicitly says “2027학년도 리라초등학교 신입생 모집 요강(예정)”; that qualification remains in the evidence. The target audience is source-backed 2020-born Seoul children, including the page's deferred/early-admission qualifications. No academic year was converted.

Seven fact types: OPERATING_INFO, TARGET_AGE_GRADE, CURRICULUM, TRANSPORT, TUITION, ELIGIBILITY, ADMISSION_PROCESS. The baseline two use canonical registry evidence. TRANSPORT preserves only the actual school-bus-route label; it does not invent routes or service coverage.

Bounded tuition evidence preserves both “2,312,100원(2025학년도 1기분(3개월) 수업료 기준)” and the 2027 change-possible qualification. It is not represented as a confirmed 2027 fee.

Two candidate URL failures remain warnings: `/kr/about/admission.php` and `/kr/about/transfer.php`. The valid admission-guide evidence is retained; security policy was unchanged.

Artifact checksum (canonical structured content):

```text
dec2f9c7fee90e82d7000830fa65684feade0d6512a5e28ae1aee636444cf92a
```

Exact file SHA256 (transfer integrity, distinct from artifact checksum):

```text
d6cebef8ff31760ee8bc663f2ff15dd44206a6ba422c487c23d4f439b834f322
```

## Railway preparation and actual Production dry-run

No release/deployment was needed for this first report. A scoped operator snapshot was extracted into an isolated temporary directory; it uses existing runtime dependencies and does not replace `/app` files.

- Operator directory: `/tmp/preppy-offline-bootstrap-20260830-fad222f5/code`.
- Artifact: `/tmp/preppy-offline-bootstrap-20260830-fad222f5/lila-dec2f9c7.json`.
- Full structured dry-run output: `/tmp/preppy-offline-bootstrap-20260830-fad222f5/dry-run-final.json`.
- Operator bundle bytes: 608,898.
- Operator archive SHA256: `346e0b2f10094fa7b31c1cefb21673c336562a81d59b379bf0a42f76f56b170c`.
- Local bounded verification output: `.preppy-bootstrap/lila-production-dry-run-20260830.json`.
- Local artifact, inventory, operator bundle and proof are git-ignored.

Executed (dry-run only):

```powershell
railway ssh --service preppy-web "cd /tmp/preppy-offline-bootstrap-20260830-fad222f5/code && NODE_ENV=production npm run data:bootstrap-private-elementary:2026 -- --apply-artifact=/tmp/preppy-offline-bootstrap-20260830-fad222f5/lila-dec2f9c7.json --dry-run --production"
```

| Gate | Actual result |
| --- | --- |
| selected / artifactsValid / artifactsRejected | 1 / 1 / 0 |
| Lila status | DRY_RUN_VALID |
| Existing facts / expected new facts | 2 / 5 |
| Artifact fact types | 7 |
| Admission | SCHEDULE_FOUND: 1; 2027학년도: 1 |
| schoolsPersisted / factsPersisted | 0 / 0 |
| schoolsFailed | 0 |
| databaseWrites / networkFetches | 0 / 0 |
| Outbox / Notification / Delivery | 0 / 0 / 0 delta |
| DeliveryAttempt / MeaningfulChange / OpportunityChange | 0 / 0 / 0 delta |
| Process exit | 0 |

The final dry-run was bracketed by independent read-only checks at **2026-08-30T05:46:34.466Z** and **2026-08-30T05:47:07.506Z**:

| Table/count | Before | After |
| --- | ---: | ---: |
| Institutions | 41 | 41 |
| Sources / InstitutionSourceBindings | 2 / 2 | 2 / 2 |
| Snapshots / Observations | 0 / 0 | 0 / 0 |
| Facts / FactVersions / FactEvidence | 4 / 4 / 4 | 4 / 4 / 4 |
| Opportunities / Versions / Evidence / Bindings | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| Each of the six side-effect tables | 0 | 0 |

All 18 table-count deltas are zero. The 41-row Institution identity/publication inventory hash is identical before/after:

`1290a5e2676112426e6da0a2bd4c6c9e641015aaf19b0a864653e3a5a45c1426`.

## Validation

| Check | Result |
| --- | --- |
| Full unit | PASS — 126 files / 1,215 tests |
| Full integration, disposable local PostgreSQL | PASS — 78 files / 565 tests |
| Artifact-focused tests | PASS — 49 unit tests + 4 integration tests |
| TypeScript | PASS |
| Production build with local APP_BASE_URL | PASS |
| Changed-file ESLint | PASS |
| Changed-file Prettier | PASS |
| npm audit --omit=dev | PASS — 0 vulnerabilities |
| git diff --check | PASS |
| Independent validation/runtime review | PASS — no remaining in-scope blocker |

The dedicated local test container and network were removed after validation; the existing PostgreSQL volume was preserved. No Production migration or test data write occurred.

## Release-stage Lila apply command — requires deployed main

The Owner approved Lila-only apply after release and a successful deployed-runtime dry-run. Use only the deployed `/app` repository code, never the historical operator bundle:

```powershell
railway ssh --service preppy-web "cd /app && NODE_ENV=production npm run data:bootstrap-private-elementary:2026 -- --apply-artifact=/tmp/preppy-lila-offline-20260830-dec2f9c7/lila.json --production --acknowledge-production-write=PREPPY-41-SCHOOL-2026-BOOTSTRAP --expected-artifact-checksum=dec2f9c7fee90e82d7000830fa65684feade0d6512a5e28ae1aee636444cf92a"
```

Temporary artifact files can disappear after a deployment/restart. If absent, re-transfer only the immutable artifact JSON, verify its checksum and re-run dry-run using deployed `/app` code. Do not transfer or execute an operator code directory. Release, deployment and final apply results are recorded separately from this historical first-report evidence.

After separately approved apply, verify the actual Production Lila detail UI, canonical provenance, timestamp separation, baseline nonduplication and all six side-effect deltas. Only after Lila UI acceptance should all-41 local collection and per-school artifact persistence proceed.

PRODUCTION DATA WRITES: NO. ALL-41 APPLY: NO. PUSH: NO. WEB DEPLOY: NO. STOPPED FOR OWNER APPROVAL: YES.
