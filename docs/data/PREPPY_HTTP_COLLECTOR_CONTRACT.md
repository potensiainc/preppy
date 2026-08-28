# PREPPY Static HTTP Collector Contract

**Collector version:** `preppy-static-http/1.0`

**Scope:** explicit canonical `OFFICIAL_MAIN` root collection plus bounded, ephemeral same-domain discovery

**Non-goals:** browser automation, PDF/OCR parsing, LLM extraction, Product truth creation, publication, notification, scheduling, authentication, or evasion

## Input and execution gate

The collector accepts only 1–10 distinct, explicit Source UUIDs supplied with repeated `--source-id`. There is no `all` mode. The CLI defaults to dry-run; `--apply` authorizes only Snapshot and Observation persistence.

Every Source is revalidated from the database before collection and again inside the apply transaction:

- exactly one active `institution_source_bindings` row with role `OFFICIAL_MAIN`;
- Source type `OFFICIAL_SCHOOL_PAGE` and lifecycle `ACTIVE`;
- if `source_monitor_configs` exists, it is enabled, uses `HTTP`, and has `browser_required=false`;
- an absent monitor config is allowed because the explicit Source UUID is the rollout authorization;
- Institution publication state is not an implicit eligibility signal.

## Bounded policy

| Policy | Default | Accepted upper bound |
|---|---:|---:|
| Crawl depth | 2 | 2 |
| Pages per Institution | 30 | 30 |
| Links per page | 250 | 250 |
| Decoded entity bytes per page | 2 MiB | 2 MiB |
| Decoded entity bytes per run | 20 MiB | 20 MiB |
| Request timeout, including DNS | 10 s | 30 s |
| Connect timeout | 5 s | 30 s and no greater than request timeout |
| Redirects | 5 | 5 |
| Per-host concurrency | 1 | 1 |
| Global concurrency | 4 | 4 |
| Minimum delay between same-host request starts | 500 ms | 5 s |
| robots.txt bytes | 512 KiB | 512 KiB |

All settings pass a strict, immutable, upper-bounded validation contract. One run-level ledger is shared by every robots, root, redirect, and candidate request across the explicit batch. It charges every decoded chunk, including failure and partial chunks, before enforcing the run limit; the separate per-page decoded limit remains in force. Page, depth, link, and total-byte exhaustion are bounded outcomes rather than permission to continue crawling.

## HTTP and network safety

- Only `http:` and `https:` URLs are accepted. URL credentials and unsupported schemes are rejected.
- Requests are GET-only, use a bounded User-Agent and Accept headers, and do not create cookies or login sessions.
- DNS resolution is inside the request deadline. Every returned address must be public; a mixed safe/unsafe answer fails closed.
- Localhost, loopback, RFC1918, link-local, metadata, multicast, unspecified, documentation, benchmarking, and other reserved IPv4/IPv6 ranges are rejected.
- The socket is dialed against a vetted resolved address. HTTP `Host`, HTTPS SNI, and certificate hostname verification remain bound to the original hostname, avoiding a post-validation DNS re-resolution.
- Every redirect destination is parsed, resolved, and safety-checked again. An unsafe redirect ends as `SSRF_BLOCKED` before the destination is requested.
- Redirects outside the strict discovery domain are not followed and end as `REDIRECT_EXTERNAL_HOST`. Redirect loops and chains are capped.
- Safe errors contain a controlled code/message only; credentials, cookies, full headers, stack traces, and uncontrolled transport objects are not persisted or printed.

## Domain and URL policy

Discovery equality lowercases the hostname and removes one leading `www.`. Therefore `www.school.kr == school.kr`, while `admission.school.kr != school.kr`. This is not registrable-domain matching.

Fragments are removed and URL syntax/default ports/dot segments use the platform URL parser. Query parameter order is preserved, tracking parameters are not guessed or removed, and trailing slashes are not unconditionally merged. A Source canonical URL is never rewritten by collection; requested URL, redirect chain, and final URL are evidence.

## Robots policy

Robots decisions are cached only by exact effective origin: scheme, host, and effective port. `robots.txt` is fetched through the same SSRF, redirect, timeout, size, and politeness controls as page content and parsed with `robots-parser`.

| Result | Decision |
|---|---|
| 2xx | Parse and enforce for the collector User-Agent |
| 404 / 410 | `ALLOW`, documented as unavailable |
| 401 / 403 | `ROBOTS_UNAVAILABLE_REVIEW_REQUIRED`; do not fetch target |
| DNS / TLS / timeout / 5xx | `ROBOTS_UNAVAILABLE_REVIEW_REQUIRED`; do not fetch target |
| Explicit disallow | `ROBOTS_BLOCKED`; do not fetch target |

Redirected page origins receive their own robots decision before the destination body is requested. Root Observation metadata retains an ordered `robotsDecisions` list for each distinct effective origin, capped at `maxRedirects + 1`; each entry contains only bounded origin/robots URL, decision/reason, status, and safe transport code.

## Entity bytes, HTML, and hashes

`raw_body` means bounded decoded HTTP response entity bytes, not wire-level TCP bytes:

`transport bytes → gzip/br/deflate decode → 2 MiB entity bound → raw_body → SHA-256 content_hash → charset decode/DOM parsing → normalized text → SHA-256 text_hash`

Only successful canonical root HTML is eligible for persistence. HTML and XHTML are parsed with Cheerio, including malformed markup. Script, style, and noscript nodes are removed; remaining text nodes are traversed in DOM order, HTML entities are decoded by the parser, Unicode is normalized to NFC, whitespace is collapsed, and the result is trimmed. Both hashes are lowercase SHA-256 hex.

## Discovery Candidate boundary

Primary discovery is from `<a href>` in DOM order. Relative links resolve against the fetched final URL. Empty/fragment-only, duplicate, external, login/logout or mutation-like, and unsupported-scheme links are retained only as bounded report decisions or rejected before fetch.

The heuristic hint is one of `ADMISSIONS`, `APPLICATION`, `TUITION`, `CURRICULUM`, `NOTICE`, `OPEN_HOUSE`, `CONTACT`, or `OTHER`. It is never Product truth and never creates or changes a Source or SourceBinding.

Candidate pages may be fetched ephemerally within BFS budgets. Their bodies, Snapshots, and Observations are not stored under the canonical root Source. Promotion to a canonical Source is a later reviewed work package.

## Persistence and change classification

Dry-run performs no writes. Apply uses one database transaction per selected Source and may write only `source_snapshots` and `source_observations`. An invalid Source URL becomes a bounded `INVALID_URL` result and cannot roll back successful sibling Sources; systemic initialization or schema errors may still stop the batch.

- First successful root: new Snapshot, Observation outcome `SUCCESS`.
- Identical content hash: reuse `UNIQUE(source_id, content_hash)` Snapshot, create one Observation with `UNCHANGED`.
- Changed content with unchanged text hash: new Snapshot, outcome `CHANGED`, `metadata.changeClassification=MARKUP_ONLY`.
- Changed text hash: new Snapshot, outcome `CHANGED`, `metadata.changeClassification=TEXT_CHANGED`.
- Failed root: no Snapshot and one coarse existing Observation outcome with a detailed safe `error_code`.

Current-state comparison comes from the latest successful Observation (`SUCCESS`, `UNCHANGED`, or `CHANGED`) and its referenced Snapshot, ordered by Observation time. Snapshot `captured_at` is never treated as temporal Source state because a prior immutable Snapshot may be reused after content returns to an older hash.

Observation metadata is an allowlisted JSON object capped at 32 KiB. It may contain collector version, bounded URLs/redirects, content type/length, fetch and change classifications, bounded ordered robots decisions, and bounded budget outcomes. It must not contain raw HTML, robots bodies, complete headers, cookies, authorization data, credentials, secrets, stacks, or arbitrary error objects.

## Failure taxonomy

Detailed safe codes are `DNS_ERROR`, `CONNECT_TIMEOUT`, `READ_TIMEOUT`, `TLS_ERROR`, `HTTP_4XX`, `HTTP_5XX`, `TOO_MANY_REDIRECTS`, `REDIRECT_EXTERNAL_HOST`, `UNSUPPORTED_CONTENT_TYPE`, `RESPONSE_TOO_LARGE`, `BYTE_BUDGET_EXCEEDED`, `ROBOTS_BLOCKED`, `ROBOTS_UNAVAILABLE_REVIEW_REQUIRED`, `SSRF_BLOCKED`, `INVALID_URL`, `BODY_READ_ERROR`, `PARSE_ERROR`, and `UNKNOWN_FETCH_ERROR`.

## Cross-platform seed checksum boundary

Checksum-bound PREPPY seed text files use explicit `text eol=lf` attributes, so Windows, Linux, and CI checkouts expose the same canonical bytes. `SHA256SUMS` records the LF CSV hash. The XLSX file remains binary and has no text/EOL attribute.

They map to the existing coarse Observation outcomes: `SUCCESS`, `UNCHANGED`, `CHANGED`, `NOT_FOUND`, `ACCESS_ERROR`, `PARSE_ERROR`, `TIMEOUT`, or `OTHER_ERROR`. No new outcome enum and no Product `detected_changes` or `meaningful_changes` row is created.

## Product isolation

Collection must not mutate Institution/Source/Binding identity, Fact, Opportunity, version, detected/meaningful change, publication state, public Last Verified, Outbox, Notification, delivery, email, or monitoring cadence state. Raw HTML is evidence and is never rendered by a public UI.
