# WP-11 Admin Runtime Browser Scenarios

## Result

PASS — the approved Admin Runtime was exercised in headless Chromium through the
real OIDC Authorization Code + PKCE entry point and the real Admin HTTP command
boundary. There is no test-login route, session-minting shortcut, request-header
bypass, package addition, schema change, or migration in this fixture.

## Controlled Environment

- Application: `http://127.0.0.1:3311`
- Fake issuer: `http://127.0.0.1:3312`
- Dedicated database: `admissionradar_wp11_browser_verify13`
- Browser: Python Playwright, headless Chromium `143.0.7499.4`
- Application/issuer launcher: the `webapp-testing` skill's `with_server.py`
- Application runtime: bounded `next dev`; final review reruns used the default
  Turbopack development runtime so webpack HMR resources could not pollute the
  strict network-failure gate
- Issuer runtime: the repository's already-installed `tsx`

The Admin and consumer session secrets were distinct. The database name was
validated as dedicated before mutation, recreated, migrated through `0009`, and
seeded with one existing `ACTIVE` Admin and one existing `DISABLED` Admin. It was
preserved after the run for final controlled verification.

`run-browser-scenarios.py` is an intentionally narrow test-only runner. It is
required because the approved procedure uses Python Playwright while the fixture
issuer and Next application run as separate processes. It does not import app
internals or mint sessions.

## Fixture Contract

`fake-admin-oidc-issuer.ts` exposes real discovery, authorization, token, and
JWKS endpoints. Each process generates an ephemeral RSA key. Authorization codes
are random, single-use, bound to the exact registered redirect URI and PKCE S256
challenge, and consumed on the first authenticated token attempt. The token
endpoint parses RFC 6749 section 2.3.1 form-encoded Basic credentials; raw
concatenation does not authenticate.

The fixture provides deterministic modes for:

- unknown and disabled Admin subjects;
- invalid signature, issuer, audience, nonce, and expiry;
- duplicate discovery, token, JWKS, JWT header, and JWT claims members;
- unsupported `code`, RS256, authorization-code grant, Basic auth, S256, and
  query response-mode capabilities.

Protocol unit tests also decode the malformed claims and verify that the invalid
signature cannot be validated with the advertised JWKS.

## Seed Contract

The seed provides:

- one existing `ACTIVE` Admin for the normal issuer subject;
- one existing `DISABLED` Admin for the disabled-subject mode;
- a due, critical Opportunity monitoring coordinate;
- current verified Native truth and historical Evidence;
- the original active canonical Source binding;
- deterministic URL-correction and Source-replacement candidates.

The inspector reports only bounded verification fields and Product-signal
counts. It accepts only the dedicated browser database URL.

## Browser Runs

The flow was split into bounded phases because repeated route compilation in the
Windows Next development server could stop responding during a single long-lived
run. Every phase starts from a normal OIDC login and uses the same dedicated
database. No assertion was weakened by this split.

### AUTH

Recorded listener PIDs: Next `8608`, issuer `34616`.

- Unknown and `DISABLED` issuer subjects completed the real OIDC round trip and
  received indistinguishable generic `403` denial responses.
- A consumer-only session cookie did not authorize `/admin`.
- The normal subject completed discovery, Authorization Code + PKCE, token/JWKS
  verification, ACTIVE Admin matching, and reached the live dashboard.
- Logout cleared the Admin session, preserved the consumer cookie, and the next
  `/admin` request returned to the generic login page.

### COMMANDS

Final review listener PIDs: Next `2716`, issuer `33964`.

- Monitoring filters selected `OPPORTUNITY` and `ACTIVE`, and the due fixture
  opened through its full target/source/role coordinate.
- The same invalid offset-date candidate was submitted twice. Focus was moved
  to the title input between submissions; both occurrences focused the same
  alert. The second occurrence cannot disappear through React batching.
- Confirm No Change returned `200`, wrote one `UNCHANGED` Observation, and left
  OpportunityChange, Outbox, Notification, and Delivery counts unchanged.
- Native verification returned `200`, installed a new current version/title,
  wrote exactly one OpportunityChange and one applicable Outbox row, and wrote
  no Notification or Delivery.
- A deliberately stale expected-current token returned `409`, rendered the
  locked Korean reload guidance, focused the alert, and did not auto-submit or
  overwrite. Reload exposed the latest expected-current token. Diagnostics
  observed exactly one `POST`/exact-URL `409` inside the armed action window.
- URL correction retained the Source identity, changed only its canonical URL,
  and produced no Product signal.
- Source replacement created a new active Source/binding, retired the old Source,
  retained the old Source on two historical Evidence rows, and produced no new
  truth or Product signal. Its scheduled old-detail reload produced exactly one
  armed `GET`/exact-URL `404`.
- A same-session mutation with an untrusted Origin returned `403` and left the
  exact database snapshot unchanged.
- Logout again cleared only the Admin session.

### READ_ONLY

Final review listener PIDs: Next `30356`, issuer `38460`.

- Operations, Outbox/Delivery, Audit, health, and data-quality views exposed no
  retry, cancel, dead-letter transition, or other mutation control.
- Articles was inspection-only and exposed no editor or publish action.
- Tablet `820x1180` and mobile `390x844` each traversed the ordered sequence:
  skip link → compact summary → all nine compact navigation links → logout →
  official Source → current-truth scroll region → No Change note/action. A
  second ordered sequence covered URL candidate → required provenance checkbox
  → Apply URL correction.
- Every recorded focus stop had non-zero dimensions and a computed visible focus
  indicator: the Admin treatment was a 3 px solid outline and native form
  controls exposed a 1 px `auto` outline. Existing table containment, labels,
  confirmation visibility, actions, and polite status checks remained active.
- Logout remained functional at the end of the read-only run.

## Final Database Evidence

```text
current_title: WP-11 Browser Opportunity - Verified Change
old_source_url: https://fixture.preppy.test/admissions/official
old_source_status: RETIRED
active_binding_source_url: https://replacement.preppy.test/admissions
active_binding_source_status: ACTIVE
old_source_evidence_count: 2
observation_count: 1
unchanged_observation_count: 1
opportunity_change_count: 1
outbox_count: 1
notification_count: 0
delivery_count: 0
audit_count: 5
```

The generated UUIDs are recorded in each external evidence JSON rather than
hard-coded into this tracked scenario document.

## Accessibility Defects Found and Corrected

The first stale-write browser run proved that the `409` guidance became visible
but its alert did not receive focus. The existing microtask tried to focus the
element before React removed `hidden`.

The correction focuses the alert from an effect after the error state commits.
The rerun proved that the exact stale response remained `409`, the alert was the
active element, the guidance remained visible, and reload—not automatic merge or
resubmission—was required.

Independent review then found that two identical synchronous validation errors
could batch through `clear → same message` without changing the effect
dependency. One centralized `reportError` now increments a monotonic occurrence
nonce for every report, and the focus effect depends on both message and
occurrence. A real component/browser regression moves focus away between two
identical invalid-date submissions and proves alert focus both times.

## Diagnostics and Teardown

The runner fails on page errors, every unexpected console error, every
unexpected response at or above `400`, and every `requestfailed` event. It does
not blanket-ignore Chromium's “Failed to load resource” message. Immediately
before the triggering action, it arms one bounded expectation containing the
exact method, URL, status, deadline, and occurrence count. The only allowances
are the stale verification `POST 409` and the Source-replacement old-detail
`GET 404`; each was consumed exactly once and its correlated resource console
message was counted once. Missing, duplicate, wrong-method, wrong-URL,
wrong-status, late, or unrelated failures fail closed.

Screenshots and `browser-evidence.json` were written outside tracked source:

- `%LOCALAPPDATA%/Temp/preppy-wp11-browser-auth-final-2`
- `%LOCALAPPDATA%/Temp/preppy-wp11-browser-commands-review-final-2`
- `%LOCALAPPDATA%/Temp/preppy-wp11-browser-read-only-review-final-2`

The recorded Next and issuer listener PIDs and their validated repository parent
processes were stopped after each phase. A final port inspection found no
listeners on `3311` or `3312`. Generated Python `__pycache__` artifacts were
removed.
