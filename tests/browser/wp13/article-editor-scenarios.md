# WP-13 Article editor browser scenarios

## Final controlled result

PASS — 2026-08-25. The fixture ran in six isolated phases (`EDITOR`,
`PUBLIC`, `STALE_SLUG`, `UNPUBLISH`, `REPUBLISH`, `FINAL`) against a freshly
recreated `admissionradar_test` database migrated through existing `0010`.
The application used `http://localhost:3411`; the real fake OIDC issuer used
`http://127.0.0.1:3412`. `localhost` is intentional because Next 16 rejects
development client chunks requested through a different loopback origin.

Each phase started fresh Next/fake-issuer processes through the webapp-testing
launcher, validated the exact listener command lines, and ended with both ports
reporting `NO_LISTENER`. On Windows the launcher commands redirect server logs
to `NUL` so its unconsumed stdout pipes cannot block Turbopack compilation.
The runner uses `load` plus a bounded hydration turn and an exact React-handler
gate; it never treats HMR-incompatible `networkidle` as readiness.

Final evidence is stored outside tracked source at
`D:\potensia\preppy-wp13-browser-evidence-final-20260825`. The final DB result
is PUBLISHED slug C, unsafe content false, one Institution relation, one
Opportunity relation, six cache events, nine Article audits, flattened A→C and
B→C redirects, and zero OpportunityChange/Notification/Delivery/Email Product
signals. Tablet/mobile focus targets measured 742×42 and 312×42 with a visible
1px auto outline.

Run against the real fake OIDC issuer fixture.

1. Sign in through `/admin/auth/start` as the seeded ACTIVE Admin whose subject matches the real fake issuer; no application auth bypass is permitted.
2. Create a DRAFT through “New Article”; verify the browser navigates to its canonical Admin detail ID.
3. Switch Visual → Source → Visual, confirm the candidate is preserved, then Save Draft.
4. Select the complete canonical Institution/Opportunity replacement sets and persist them.
5. Publish the full candidate; verify the persisted Admin preview and public Article show only sanitized HTML, metadata, Article/Breadcrumb JSON-LD, and no Admin author.
6. Open two PUBLISHED editors. Commit one through “Publish Changes”; the stale second input must receive `409`, retain the Korean reload guidance, expose an explicit reload action, and never auto-merge.
7. Change slug A → B and prove A returns `308 B` while PUBLIC.
8. Unpublish and prove A and B return `404` without `Location`; then change B → C while unpublished and prove A/B/C remain `404` without target leakage.
9. Republish and prove A/B both return `308 C`, C is `200`, and the registry is flattened to A → C and B → C.
10. At tablet and mobile widths verify toolbar wrapping, Visual/Source controls, labelled fields, visible focus, relation controls, confirmation behavior, and bounded public prose.
11. Open Operations to prove existing operations paths still render, then sign out and verify Admin Article routes require the separate Admin session.

Adversarial fixture: include `<script>`, `onclick`, `javascript:`, iframe, SVG/MathML raw-text payloads, and same-origin Admin/API/auth links in Source mode. None may appear in persisted preview, Visual initial content, public HTML, metadata, or JSON-LD. A same-origin approved public absolute link must normalize root-relative; an external HTTPS `_blank` link must receive `noopener noreferrer`. Repeat public output inspection with JavaScript disabled and assert no global side effect in the enabled browser.

The fixture records the empty OpportunityChange/Notification/Delivery/Email baseline before Article work. Final evidence requires the same Product-signal counts and exactly six cache revalidation events for initial publish, published edit, two slug changes, unpublish, and republish.
