# PREPPY 41-School Bootstrap — MVP Patch Acceptance

Date: 2026-08-30 (KST). Branch: `main`. Starting HEAD: `34e652dd6077526bf699b0beca28294947079e57`.

Verdict: **MVP_PATCH_PASS — PRODUCTION_APPLY_NOT_EXECUTED**.

## Scope and execution

- Registry baseline preparation now survives website collection failure. Persistence remains one atomic transaction per school; all HTTP/discovery/extraction is outside it.
- Explicit admission academic years below the fixed 2026 reference year cannot create current Opportunities/Versions. The selected historical source year and warning remain in the report.
- No migration, schema, UI, SEO, Follow, notification, or collector-security-policy change was made by this patch.
- Production PostgreSQL: `18.6 (Debian 18.6-1.pgdg13+2)`.
- Production inventory/schema and side-effect counts were obtained through Railway SSH using PostgreSQL **READ ONLY** transactions. The current working-tree runner and collector ran locally against that exact Production inventory/schema, with a write-disabled executor/transaction manager. No Production credentials were printed or copied to the report.
- This is a dry-run of the current code, not execution of newly deployed code. Production apply, deployment, commit, and push were not performed.

## Production dry-run result

```json
{
  "totalSchools": 41,
  "attempted": 41,
  "registryBootstrap": { "succeeded": 41, "failed": 0 },
  "websiteCollection": { "succeeded": 32, "partial": 0, "failed": 9 },
  "schoolsWithBaselineFacts": 41,
  "readyToPersist": 41,
  "persisted": 0,
  "failed": 0,
  "factCounts": {
    "OPERATING_INFO": 41,
    "TARGET_AGE_GRADE": 41,
    "CURRICULUM": 29,
    "TRANSPORT": 17,
    "TUITION": 9,
    "ELIGIBILITY": 4,
    "ADMISSION_PROCESS": 7
  },
  "admissions": {
    "SCHEDULE_FOUND": 11,
    "NOT_ANNOUNCED": 0,
    "NOT_FOUND": 21,
    "FETCH_FAILED": 9
  },
  "academicYears": {
    "2027학년도": 7,
    "2026학년도": 20,
    "staleSkipped": 2,
    "unknown": 12
  },
  "admissionPublicationEligible": 30,
  "exitCode": 1
}
```

Coverage and Fact counts above are **planned/validated**, not Production-persisted counts. All created-row counts are zero. The existing non-zero exit policy still signals incomplete website collection; it does not mark registry baseline preparation as failed or cancel those future per-school transactions.

Admission knowledge counts describe source findings before the publication guard. The two stale `NOT_FOUND` proposals below are excluded from the 30 publishable candidates. No year was rewritten.

| School | Source academic year | Publication |
| --- | --- | --- |
| 심석초등학교 (`simseok-e`) | 2024학년도 | Skipped: `STALE_ADMISSION_CYCLE_NOT_PUBLISHED` |
| 유석초등학교 (`yooseok`) | 2025학년도 | Skipped: `STALE_ADMISSION_CYCLE_NOT_PUBLISHED` |

## Existing nine website failures retained

| Failure | Slugs |
| --- | --- |
| `RESPONSE_TOO_LARGE` | `sungdong`, `sejong`, `dongbuk`, `ihansin`, `seoul36`, `eunseok`, `soongeui` |
| `ROBOTS_BLOCKED` | `hye` |
| `ROBOTS_UNAVAILABLE_REVIEW_REQUIRED` | `kumsung` |

All nine have `registryBootstrap=SUCCESS`, `websiteCollection=FETCH_FAILED`, and `admissionKnowledge=FETCH_FAILED`. The 2 MiB response cap and robots enforcement are unchanged. No failed-site bypass or forced collection was used.

## Lila preview — source-backed, not yet persisted

- Institution: 리라초등학교 / `9aa75c7b-e7de-55bc-ba67-03201af8cb6e`.
- Official admission source: <https://www.lila.es.kr/kr/about/admission_guide.php>.
- Collected: `2026-08-30T01:43:44.474Z`. Verified: `null` (dry-run).
- Academic year: **2027학년도**. Knowledge: `SCHEDULE_FOUND`. State: `UPCOMING`.
- Application: **2026-11-06 09:00 through 2026-11-11 16:30 KST**.
- Target: 2020-born children resident in Seoul, with the source's delayed/early-entry exceptions preserved in admission evidence.
- Registry baseline: 서울특별시 중구 소파로2길 7; elementary grades 1–6, explicitly not an admission-specific target. Seed registry URL remains <https://www.schoolinfo.go.kr/>; no unresolved registry ID was invented.
- Historical tuition display retains **2,312,100원 (2025학년도 1기분/3개월 기준)** and the official **2027학년도 변동 가능** wording. The source also states entrance fee 1,000,000원 and separately charged bus/field-trip/after-school costs. It is not relabeled as a 2026/2027 tuition amount.

## Failed-website registry fallback preview

- Institution: 금성초등학교 / `9550da3f-04eb-5eee-877d-877491461201`.
- Registry source: <https://www.schoolinfo.go.kr/ei/ss/Pneiss_b01_s0.do?SHL_IDF_CD=1aeb2cdf-3475-4eca-a64f-d6552bfbb88f>.
- Seed registry verification date: `2026-08-27`.
- `OPERATING_INFO`: 금성초등학교 · 사립초등학교 · 초등학교(1–6) · 서울특별시 중랑구 신내로21길 55 · 공식 홈페이지 <http://www.kumsung.net>.
- `TARGET_AGE_GRADE`: 초등학교 1~6학년 (학교 교육과정 기준; 신입생 모집 대상 아님).
- Registry: `SUCCESS`; website: `FETCH_FAILED`; admission: `FETCH_FAILED`; pages fetched: **0**.
- Website error: `ROBOTS_UNAVAILABLE_REVIEW_REQUIRED`. No invented admission, Snapshot, Observation, or website collection timestamp.
- Both baseline Facts and their official registry Source remain ready for persistence.

## Database and side-effect evidence

Dedicated PostgreSQL integration tests prove registry-only Fact/Version/Evidence persistence, official-source visibility through the unchanged public read model, no duplicate rows on rerun, and zero website Snapshots/Observations for registry-only fallback. Concurrent school transactions sharing a registry URL reuse one Source. Late per-school failures still roll back that school's writes. Both 2024 and 2025 admission proposals create zero Opportunity/Version/Evidence/binding rows while Institution Facts persist.

Production READ ONLY pre/post count comparison:

| Product table group | Delta |
| --- | ---: |
| Outbox | 0 |
| Notification | 0 |
| Delivery | 0 |
| DeliveryAttempt | 0 |
| MeaningfulChange | 0 |
| OpportunityChange | 0 |

## Validation

- Full unit: **124 files / 1,148 tests PASS**.
- Full integration: **77 files / 561 tests PASS**, dedicated PostgreSQL 16 test DB, serial execution.
- TypeScript: PASS.
- Production build: PASS.
- Changed-file ESLint: PASS.
- Changed-file Prettier: PASS.
- `npm audit --omit=dev`: PASS, **0 vulnerabilities**.
- `git diff --check`: PASS.
- Test container/network removed; the pre-existing local test volume preserved. Temporary dry-run harness removed. No raw live HTML, credentials, or database dump retained in this report.

## Exact Production apply command — NOT EXECUTED

Only after separate owner approval and after this implementation is available in the `preppy-web` runtime:

```sh
railway ssh --service preppy-web "NODE_ENV=production npm run data:bootstrap-private-elementary:2026 -- --apply --production --acknowledge-production-write=PREPPY-41-SCHOOL-2026-BOOTSTRAP"
```

Single-school retry adds `--slug=<slug>` to the same guarded command. Successful school transactions are retained even when website failures cause final exit 1.

Production apply: NO. Commit: NO. Push: NO. Deploy: NO.
