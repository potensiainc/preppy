# Expanded model-profile QA — 2026-10-15

## Scope and exact limits

Local candidate files were loaded by browser request fulfillment. No served staging or production test was run: the release owner's staging apply was canceled/unapproved. No physical device, OS keyboard, screen reader, Samsung Internet or actual iOS Safari test is claimed.

Profiles are copied from the primary [Playwright device catalog, revision `5ad202df4f484d593ab42a4a16e6c75f666fef38`](https://github.com/microsoft/playwright/blob/5ad202df4f484d593ab42a4a16e6c75f666fef38/packages/isomorphic/deviceDescriptorsSource.json). CSS viewports below are the catalog's browser viewport values, not physical pixel sizes or a physical-resolution division. Browser chrome can change the visible viewport on real devices. Profile UA strings do not mean that the emulated OS or browser version actually ran.

Installed engines: **WebKit 26.0** and **Chromium 143.0.7499.4**. WebKit here is the Playwright Windows engine, not a physical iOS Safari installation. Chromium with an iPhone viewport is additional cross-engine stress, not Chrome-on-iOS certification.

## Named model matrix

“PASS P/L” below means the local functional sequence passed in both orientations. Touch/mobile flags and DPR were applied. Physical notch safe areas and OS keyboard remain NOT RUN for every row.

| Requested model | Portrait CSS viewport | Landscape CSS viewport | DPR | WebKit flow | Chromium flow | Model-specific gaps |
| --- | --- | --- | --- | --- | --- | --- |
| iPhone 12 mini | 375×629 | 712×325 | 3 | PASS P/L | PASS P/L | Actual device/Safari/OS keyboard/notch NOT RUN |
| iPhone 15 Pro | 393×659 | 734×343 | 3 | PASS P/L | PASS P/L | Actual device/Safari/OS keyboard/notch NOT RUN |
| iPhone 17 | 402×681 | 756×352 | 3 | PASS P/L | PASS P/L | Actual device/Safari/OS keyboard/notch NOT RUN |
| iPhone 16 Pro | 402×681 | 756×352 | 3 | PASS P/L | PASS P/L | Actual device/Safari/OS keyboard/notch NOT RUN |
| iPhone 14 | 390×664 | 750×340 | 3 | PASS P/L | PASS P/L | Actual device/Safari/OS keyboard/notch NOT RUN |
| Galaxy S25 | Not assigned | Not assigned | Not assigned | NOT RUN | NOT RUN model-specific | No verified S25 descriptor found in checked primary catalogs; no S24 substitution or invented values |
| Galaxy Fold | Generation unspecified | Generation unspecified | Not assigned | NOT RUN model-specific | NOT RUN model-specific | Generic cover/unfolded stress below does not establish this model's pass |
| Galaxy Z Flip | Generation unspecified | Generation unspecified | Not assigned | NOT RUN model-specific | NOT RUN model-specific | Generic main-screen stress below; closed-cover full-browser applicability NOT established |

## Generic foldable viewport stress (not model passes)

The following explicit viewport profiles use the catalog's Fold6/Flip6 profile values only as generic stress inputs while the requested generation is unknown. They must not be reported as a Galaxy Fold or Flip hardware pass.

| Stress shape | Portrait CSS / DPR | Landscape CSS / DPR | Chromium flow |
| --- | --- | --- | --- |
| Generic fold cover | 484×1112 / 2 | 1136×432 / 2 | PASS P/L |
| Generic fold unfolded | 928×1004 / 2 | 1028×876 / 2 | PASS P/L |
| Generic flip main | 360×804 / 3 | 828×308 / 3 | PASS P/L |

Closed Flip cover full-browser flows: **NOT RUN / applicability unknown**. A small cover display and a descriptor do not establish that a normal full browser is available when the device is closed. No hinge/posture API or physical fold transition is emulated.

## Checks and findings

**Final local matrix: 26 functional cases passed, 0 failed.** Three requested model categories remain NOT RUN as specified above. Every executed case covered portrait/landscape layout and overflow, ≥44px visible button/select targets, school search and keyboard keys, browser save reload, route/list sheets, selected-stop comparison, successful local WebGL map, map-script-unavailable fallback and mismatch warning, and reduced visible-viewport keyboard stress.

The reduced viewport test uses `max(220, profile height − 280)` with real browser key events. It is a synthetic visible-area stress test, not an OS keyboard. Default `env(safe-area-inset-*)` behavior was observed. Chromium's synthetic `Emulation.setSafeAreaInsets` call was unavailable in the installed protocol (`method wasn't found`); no successful notch-inset simulation is claimed. Safe-area CSS exists, but physical-notch correctness remains unverified.

The first generic wide-touch pass found `.overview-return` (“전체 노선 보기”) at **36px** height in four cases. The single production fix adds this class to the existing ≥44px target rule. The full 26-case matrix passed after that change. A persistent assertion was added to `tests/browser/commute/run-production-smoke.py` for a route opened after the 390→844px transition. Original release flows were rerun after the fix. This CSS change requires a new commit/image/review; the previous `4f44d4f` / OCI `8374530a…` pair must not be described as including it.

Evidence is retained locally under `test-results/model-matrix/`: pinned catalog, runnable harness, exact per-case settings/observations/checks in `results.json`, `run.log`, per-engine/orientation list/compare/map/keyboard screenshots, and clearly separated `pre-fix/` failure captures. `model-matrix-evidence.zip` packages these. No private accounts or account writes were used. Source attribution remains 38 school audits, 163 records/151 distinct URLs, and **61 exact clock matches only for 경복초 morning records**; no school's current operation is verified.
