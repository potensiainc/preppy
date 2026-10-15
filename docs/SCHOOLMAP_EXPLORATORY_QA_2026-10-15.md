# Additional schoolmap exploratory QA — 2026-10-15

Baseline: PR #39 `ebaf08903df325cee1dca893d19cdf85076a2c61`. This follow-up changes only schoolmap interaction code, browser regressions and review evidence. No merge or deployment was performed. The previous `760d2ebe…` image and intermediate `218f9a5` build does **not** contain these fixes and is superseded as a final review candidate once this commit lands on the PR.

## Reproduced defects and fixes

| Defect | Browser reproduction and impact | Fix / regression |
| --- | --- | --- |
| Delayed map request overwrites a newer stop | Hold the map script; select route A stop 1; request map focus; select route B stop 3; release script. URL incorrectly changes B to stop 1. Also reproduced while staying on route A. | Check request generation, selection revision and school/route/direction identity before applying map focus. Later stop, history and view changes invalidate the pending action. Both route-change and same-route cases now retain stop 3. A follow-up boundary test also reproduced map completion collapsing a timetable that the user had reopened while loading; sheet changes now invalidate the earlier focus request as well. |
| Cross-tab storage clearing leaves stale saves | In two isolated pages, save a school in page A and call `localStorage.clear()` in page B. A retained the saved marker and could resurrect the ID on its next save. | Reload validated local saves for a null-key storage event. Verify marker removal and that a subsequent save stores only the newly selected ID. No real user browser profile is used or cleared. |
| Enter in cleared search selects an old result | Search 목동; choose the third result; refocus the now-empty input; press Enter. The URL changes to the previous first result. | Clear cached results after selection and require a nonempty query with visible suggestions. Empty Enter now leaves the URL unchanged. |
| Back navigation leaves a stale comparison | Choose 강남구, then 서초구; open a comparison; browser Back restores 강남구 but the open table still describes 서초구. | Close transient dialogs when restoring history. URL, visible page and future comparison now use the restored region. |
| Late source response loses keyboard focus | Hold research-sources.json; keyboard-focus a school card; release the source response. Re-render replaces the focused button, leaving focus on the body. | Restore the same list/tray action and school ID after re-render without scrolling. Late-response browser regression passes. |

## Performed verification

`tests/browser/commute/run-exploratory.py` runs **15 cases per engine** with isolated local-file fulfillment. Chromium **143.0.7499.4** and WebKit **26.0** each passed all 15 cases. These are installed desktop browser engines with touch/mobile settings, not physical iOS Safari or Samsung Internet.

Beyond the defect regressions, cases cover continuous viewport transitions (320×568 → 780×360 → 928×1004 → 360×804 → 484×1112 → 1028×876 → 320×568), selected-stop URL stability, Back/Forward/reload restoration, actual script failure then successful map retry, cancellation during script loading, long Korean empty searches, three-school comparison after region changes, denied storage writes with reload, and delayed source delivery. Fold/Flip shapes are generic stress sizes; no generation-specific hardware pass is claimed.

At 320×568, the long Yale source text was tested with **computed font sizes doubled in the school detail**. This is a synthetic rendered-text stress test, not browser or OS zoom. The first official-source link remains scrollable into the visible viewport. Screenshots were visually inspected for this state and the horizontally scrollable comparison table. Actual device pinch zoom, OS keyboard, physical notch and screen-reader testing remain NOT RUN.

The established release smoke also passed at **360×800, 390×844, 430×932, 844×390 and 1440×900**, including search, saves, selected-stop comparison, URL restore, scope warning, map failure and existing three release regressions. Schoolmap unit suites: **23 tests / 5 files passed**. Typecheck, scoped ESLint, prebuild header/icon guards and Git whitespace check passed. The first sandbox unit attempt could not start due to a temporary-file rename permission error; it passed outside that sandbox. Downloaded external catalog samples were renamed to `.source.txt` so local TypeScript checks do not treat them as application code.

Results and reproduction screenshots: `test-results/exploratory-chromium/`, `test-results/exploratory-webkit/`, `test-results/exploratory/` (initial failures), and `test-results/schoolmap-exploratory-regression/`. The harness exits nonzero on any failed case. The current staging observation belongs to the older `8374530a…` image and is not used as acceptance evidence for this follow-up.

## UX Writing review

**UX Writing: PASS** for the changed schoolmap states. The mandatory policy was read in full. No public wording or factual dataset values were rewritten: this change keeps visible conditions aligned with the selected route/stop, closes outdated comparisons, prevents empty-query navigation, and synchronizes the browser-only save state. Existing browser scope, failed-save warning, unknown grade, missing time, source dates, qualifiers and school-confirmation warnings remain intact. Actual source text, including Yale's blue-stop restriction and its uncertainty, remains in the rendered UI. Original `data.json` SHA256 remains `71d2e0039b67db21d3102d188d4fe9c0aa449fbf816a5c404d2e0b7c4ba05dc4`.

Representative evidence: [doubled text at 320px](schoolmap-review/source-text-200percent-320.png), [comparison at 320px](schoolmap-review/comparison-three-schools-320.png). The comparison screenshot includes the first school column after a three-school selection and region change; the table supports horizontal scrolling.
