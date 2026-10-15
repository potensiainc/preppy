# Schoolmap mobile candidate review — 2026-10-15

Scope: `/schoolmap` static assets and their tests/documentation only. Base `bd0169acac694282dad0e7d4f2381f4b754fedab`. Open PRs 31 and 19 were inspected and left untouched. No home implementation, dataset, auth, favorites, notification, DB or deployment service changes. No merge or deployment.

Latest release direction: Kakao/account integration is excluded. The account audit and contract tests below document investigation only; they do not block the browser-only release or ship account API calls. Release remains owned by the parent after staging/served mobile smoke.

## Behavior

- School-first entry works for all 38 schools without location permission. Optional region exploration remains. Default order is alphabetical; stop counts do not imply recommendation or journey duration.
- Persistent mobile search, current region/direction and explicit list/map toolbar. Search includes administrative-neighborhood aliases, keeps direction/round/time, and distributes stop matches across schools.
- Mobile list and timetable remain available when the map fails. Mobile WebGL initializes only on map request or a restored school URL. Unavailable controls disappear; retry is offered. External background-map failure keeps local boundaries and route data usable.
- Collapsible sheets preserve timeline/list scroll and active detail controls during render. Safe-area padding, visible-viewport height handling, focus styles and minimum 44px targets added. Keyboard checks use browser keys and a reduced viewport, not a real phone keyboard.
- Region, direction, grade uncertainty and school-verification status remain visible in compact detail; scope mismatches have a separate warning.
- Comparison includes an explicitly selected stop, source route/round and direction, qualified time, applicability uncertainty and missing fields. Counts remain contextual statistics. Compare selections are temporary.
- Browser saves use only validated public school IDs in `preppy.schoolmap.saved.v1`, with deduplication/versioning and failure handling. No names of children, home location, credentials or tokens. Clearing browser data clears these saves. Storage failure keeps only current-session state and says so. Account saves are separate.
- Evidence is additive via `research-sources.json` and `provenance.json`: 38 school audit records, 163 distinct source records (some shared across schools), and 61 exact original route-name/direction/stop-name/clock-value matches. Field/source/route/stop scope, independent publication/header/revision dates, effective school year, operating/planned status, conditions and conflicts remain separate. No timetable replacement or current-operation verification is inferred. Full authorized public research is retained under `data/research/commute/2026-10-15`, with original manifest hashes and Library identity. Quarantined, secondary, historic and planning facts are not upgraded to current operation.

## Account mapping investigation and next integration step

Read the existing Kakao flow, `FollowCta`, `/api/me/follows/status`, `/api/me/follows`, and `activate-follow.server.ts`. The account API requires an institution UUID. Import planning can reuse an existing identity rather than its deterministic candidate, so UUIDs must not be calculated from commute slugs or registry IDs and assumed live.

Read-only audit: `tests/browser/commute/audit-identities.py`; complete evidence is in `SCHOOLMAP_IDENTITY_AUDIT_2026-10-15.json`. 35 schools matched exact reviewed official name, normalized address and one institution UUID exposed by the live public institution page. Four abbreviations were explicitly reviewed against full names and exact addresses. This is identity evidence, not evidence of current bus operation.

Unresolved mappings (no automatic account integration ships):

| Dataset ID | Commute address | Existing public institution address |
| --- | --- | --- |
| `kwangwoon` | 서울 성북구 한천로 693 | 서울특별시 성북구 한천로 694 |
| `sejong` | 서울 광진구 능동로 209 | 서울특별시 광진구 군자로 114 |
| `hanyang` | 서울 성동구 왕십리로 222 | 서울특별시 성동구 살곶이길 208 (public slug `hye`) |

Next: resolve these differences against school registry/official addresses without rewriting the commute snapshot; validate the mapping through the existing server lookup. Then add an explicit authenticated import action after Kakao onboarding succeeds. Check existing account favorites, deduplicate by canonical UUID, use the existing authorized API, remove only confirmed imports from the browser queue, and keep failed entries with retry. Test with mocked auth/API states and an isolated authorized test account, never a real user's account. Verify notification/outbox semantics before any account writes. No such writes were performed in this task.

Follow-up inspection: the three address conflicts do not technically block partial import of the 35 matched identities. The actual safety blockers are an indistinguishable boolean-only account session response, no per-request expected account/session binding, and no durable import receipts that distinguish lost-response retries from reactivating a user-deleted favorite. Exact names, both addresses, public URLs, current logout/account-switch semantics and the backend plan are in [the account import boundary review](SCHOOLMAP_ACCOUNT_IMPORT_BOUNDARY.md). The current candidate never calls the account API or imports on login; browser deletions remain local deletions and all unmapped IDs remain preserved.

## Verification

- 19 targeted unit tests: search fairness/locality aliases, distinct directions, URL restoration, safe/versioned storage, blocked storage, source scoping and unsafe URLs, time qualifiers and existing route integration.
- Follow-up account boundary: 3 additional tests plus the existing auth/follow suites; 61 tests across 8 files passed. Mocked A/B sessions show identical public session responses; independently signed POST requests bind to their own account cookies and reject an invented `expectedAccountId` property; logout clears the account cookie without clearing browser storage. No real account or DB writes. These tests prove the contract gap, not a completed import implementation.
- Final release-scope unit run: 23 tests across 5 files passed, including exact archive byte/hash preservation, unchanged original timetable SHA-256, 38 identities / 163 distinct sources, all 61 field lineages and explicit restrictions/quarantines. Provenance parser rejects invalid route IDs, out-of-range stop indexes and mismatched/missing direction for stop facts.
- TypeScript, scoped ESLint, prebuild header/brand checks, and optimized production build passed. Build uses only non-secret local `APP_BASE_URL=http://127.0.0.1:3312`.
- Chromium 143 viewport emulation: 360×800, 390×844, 430×932, 844×390 landscape, 1440×900 desktop. No document horizontal overflow. Reload persistence, keyboard navigation, compare, URL restore, map-script failure, retry availability, storage denial, lazy local WebGL map, external background failure and list return checked.
- Screenshots under `test-results/schoolmap/`; synthetic source-display fixture is explicitly named and is never shipped in `provenance.json`. Reviewed list views at all widths, comparison, timetable, compact mismatch and local map screenshots.
- Representative screenshots are committed in `docs/schoolmap-review/`: mobile/desktop lists, selected-stop comparison, compact successful-map mismatch and reduced keyboard viewport. `package-candidate.py` packages all screenshots, read-only identity captures and the build log separately from the deterministic static build-asset archive. Its SHA-256 is a static candidate digest, not a container-image digest.
- Browser requests are fulfilled from local candidate files because localhost connections time out in this environment. This is **emulation, not production end-to-end**. Next rewrite/redirect behavior is covered by unit tests. No physical iOS/Android, OS keyboard, screen-reader or production smoke test claimed.
- Independent-review regressions now have browser repro tests: compare `kyonggi:0` stop 0 then switch 양천구→강서구 clears the old stop; 390→844px resize initializes the lazy map without another action; list→school→route→“지도에서 정류장 보기” loads a successful WebGL map and selects its stop. Computed visible mobile button/select targets are at least 44×44px; narrow map stop markers were fixed. Source restriction and conflicting-date fixture displays are checked. All mandatory browser tests rerun after the final toolbar contrast/unavailable-control fix. Safe-area CSS is present; physical-notch and real keyboard behavior still require device checks.
- Sandbox browser/temporary-file/junction failures were handled by approved execution outside the sandbox. The production build warns about an unrelated parent-directory lockfile; repo lockfile and configuration were unchanged.

Release owner must recheck current main, production deployment/image baseline and candidate checks before staging, then run actual staging/production smoke. This task does not produce an OCI image digest or deployment approval.

## UX Writing: PASS (candidate scope)

Read the complete PREPPY policy before implementation. Screens: anonymous school browsing, storage success/failure/empty state, route detail/compact mismatch, comparison and source details. “이 화면에서만 유지” becomes explicit browser persistence with account separation; comparison still says it resets on reload. Map failure explains the usable list/timetable and retry. Grade/application uncertainty is stated rather than inferred. Counts, relative/reference/missing/review-needed times, no-bus uncertainty, original collection date and third-party attribution remain intact. Evidence dates, current/planned status, conditions and conflicting values are separate. Browser emulation and synthetic fixture limits are explicit. New research facts have not been asserted or used to replace the dataset.
