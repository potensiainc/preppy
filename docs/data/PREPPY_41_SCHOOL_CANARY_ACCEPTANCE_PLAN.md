# PREPPY 41-School Bootstrap — Production Canary Acceptance Plan

Release preparation only. No Production apply is authorized by this document. Wait for separate owner approval before executing any command below.

## Exact Production identities

Confirmed by a Production PostgreSQL READ ONLY query on 2026-08-30, matching school name rather than guessing slug:

| School | Exact slug | Institution ID | Category / publication |
| --- | --- | --- | --- |
| 리라초등학교 | `lila` | `9aa75c7b-e7de-55bc-ba67-03201af8cb6e` | PRIVATE_ELEMENTARY / PUBLISHED |
| 금성초등학교 | `kumsung` | `9550da3f-04eb-5eee-877d-877491461201` | PRIVATE_ELEMENTARY / PUBLISHED |

Pre-release observed Outbox, Notification, Delivery, DeliveryAttempt, MeaningfulChange, and OpportunityChange counts were all zero. Capture fresh counts immediately before each future canary; do not reuse an old baseline as the before-count.

## Canary A — Lila (command prepared, NOT executed)

```sh
railway ssh --service preppy-web "NODE_ENV=production npm run data:bootstrap-private-elementary:2026 -- --slug=lila --apply --production --acknowledge-production-write=PREPPY-41-SCHOOL-2026-BOOTSTRAP"
```

After owner approval, require:

- Exactly one selected school, successful school transaction, unchanged Institution identity/category/publication.
- Existing `/institutions/lila` UI renders seven Fact types and ReviewedAdmission backed by the canonical Fact/Version/Evidence and Opportunity/Version/Evidence/Source chains.
- Source-backed 2027학년도, application 2026-11-06 09:00 through 2026-11-11 16:30 KST, and the source's target-audience qualifications. These are expectations from the earlier dry-run, not hardcoded overrides; investigate if the official source changes.
- Official admission Source displayed: `https://www.lila.es.kr/kr/about/admission_guide.php`.
- Last Collected comes from actual Observation time; Last Verified comes from bootstrap verification time. Both displayed and semantically separate.
- Tuition still explicitly says 2025학년도 1기분/3개월, 2,312,100원, and preserves the source's 2027학년도 변동 가능 wording. Do not display that amount as a current-year price without its year.
- All six side-effect deltas below equal zero.

## Canary B — Kumsung (command prepared, NOT executed)

```sh
railway ssh --service preppy-web "NODE_ENV=production npm run data:bootstrap-private-elementary:2026 -- --slug=kumsung --apply --production --acknowledge-production-write=PREPPY-41-SCHOOL-2026-BOOTSTRAP"
```

After owner approval, require:

- Successful school transaction and unchanged Institution identity, even if website collection still reports `ROBOTS_UNAVAILABLE_REVIEW_REQUIRED` and process exit is 1.
- Existing `/institutions/kumsung` UI renders registry-backed `OPERATING_INFO` and `TARGET_AGE_GRADE` with official registry Source.
- Registry Source: `https://www.schoolinfo.go.kr/ei/ss/Pneiss_b01_s0.do?SHL_IDF_CD=1aeb2cdf-3475-4eca-a64f-d6552bfbb88f`.
- Address: 서울특별시 중랑구 신내로21길 55. Grade text explicitly means school grades 1–6, not an admission-specific target.
- No fabricated admission dates, admission Version, website Snapshot/Observation, or Last Collected timestamp. Registry verification metadata must not be presented as a website fetch time.
- All six side-effect deltas below equal zero.

## Shared acceptance and stop conditions

Compare fresh before/after counts for `outbox_events`, `notifications`, `notification_deliveries`, `notification_delivery_attempts`, `meaningful_changes`, and `opportunity_changes`. Each delta must be zero.

Use DB joins and the existing public read model to verify the displayed Institution, current VERIFIED Fact/Opportunity Versions, Evidence, Source, and (where collected) Observation/Snapshot identities. Require actual detail UI rendering, not only a successful CLI exit.

If a transaction fails, an identity/provenance check fails, a displayed year is inaccurate, or any side-effect delta is non-zero, stop further applies and report the exact state. Do not run migrations, seed resets, manual repairs, or a global rollback of successful schools. A retry after a resolved issue must reuse the same exact slug and be idempotent.

## Full 41-school command — prepared, NOT executed

Only after both canaries pass and the owner authorizes continuation:

```sh
railway ssh --service preppy-web "NODE_ENV=production npm run data:bootstrap-private-elementary:2026 -- --apply --production --acknowledge-production-write=PREPPY-41-SCHOOL-2026-BOOTSTRAP"
```

Nine expected website failures can cause final exit 1 while registry baseline transactions succeed. Separately assess registry baseline persisted count, website-detail persisted count, school transaction failures, and all six side-effect deltas. Never equate exit 1 with an all-school rollback or assume exit 0 proves the UI acceptance.

## Release-review correction

Before release, four regression tests reproduced and closed two admission-evidence defects: borrowing dates/audience/not-announced wording from another academic cycle, and letting a generic curriculum year outrank real admission evidence. This is a narrow correction of the existing 2026-current policy, with no schema/migration/UI feature expansion. Historical dry-run counts in the MVP report remain observations of that earlier run, not fresh canary results.

Deferred minor report issue: candidate-level robots refusal is enforced but is not counted in the partial-fetch warning field. It does not authorize bypassing robots and is not a canary apply authorization.
