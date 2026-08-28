# PREPPY Static HTTP Collector Design

**Date:** 2026-08-28
**Status:** Owner approved with constraints
**Branch:** `feat/preppy-static-http-collector`
**Starting commit:** `536e109912b4f896552f77b12e07f5b43bdd62c9`

## Scope

Implement the first evidence-only collection segment:

`Institution -> active OFFICIAL_MAIN binding -> active OFFICIAL_SCHOOL_PAGE Source -> safe static HTTP fetch -> bounded same-domain discovery -> root Snapshot + Observation`

Candidate pages remain ephemeral. The collector creates no Source, binding, Fact, Opportunity, Version, detected change, meaningful change, Outbox, Notification, publication mutation, or public Last Verified value. It never invokes a browser, PDF parser, OCR, LLM extraction, login flow, proxy, or anti-bot bypass.

## Repository Reality

The repository already has Institution Source bindings, Source monitor configuration, Source Snapshot, and Source Observation tables. It has an Observation writer used by Admin commands, but no collector, no SSRF-safe HTTP transport, no robots collector policy, no link discovery, no content hashing implementation, no Snapshot writer, and no raw-body store. Seeded official website Sources have active `OFFICIAL_MAIN` bindings but no generated `SourceMonitorConfig`.

Therefore collector eligibility is an explicit `--source-id` rollout gate. A present monitor config adds restrictions; its absence does not create a config or authorize any non-explicit Source.

## Input Contract

- Only repeated `--source-id <uuid>` arguments are accepted.
- At least one and at most 10 distinct Source IDs are required.
- There is no `all`, Institution-wide default, scheduler, or implicit 57-Source selection.
- Every Source must have an active Institution binding with role `OFFICIAL_MAIN`.
- Every Source must have type `OFFICIAL_SCHOOL_PAGE` and lifecycle `ACTIVE`.
- If a Source monitor config exists, it must be enabled, use `HTTP`, and have `browserRequired=false`.
- Dry-run is the default. `--apply` permits only root Snapshot and Observation writes.

## Database Design

Migration `0012` adds exactly two nullable columns:

- `source_snapshots.raw_body bytea`
- `source_observations.metadata jsonb`

No collector table is added. Existing `source_snapshots.metadata` and `raw_storage_key` retain their meanings. `raw_body` is bounded inline MVP evidence and can later migrate to an external object store referenced by `raw_storage_key`.

`raw_body` contains decoded HTTP response entity bytes after Content-Encoding decoding and before charset decoding. `content_hash` is SHA-256 over these exact entity bytes. Only a successful canonical root response of at most 2 MiB is stored. Candidate response bodies are never stored.

Observation metadata is an allowlisted, recursively bounded object containing collector version, requested URL, redirect chain, content type, Content-Length, fetch classification, change classification, ordered effective-origin robots decisions, and budget outcome. It contains no cookies, authorization, credentials, full headers, raw robots body, raw HTML, stack trace, or uncontrolled error object.

The existing coarse Observation outcomes remain unchanged. Detailed failures use `error_code`. The existing `UNIQUE(source_id, content_hash)` remains: identical content reuses the prior Snapshot and creates a new `UNCHANGED` Observation that references it.

The latest successful Observation and its referenced Snapshot define current Source state. Snapshot capture time does not define current state because immutable hash artifacts may be reused. Apply uses a separate transaction per Source so an invalid canonical URL records `INVALID_URL` without rolling back valid sibling results.

## Root and Candidate Evidence Boundary

The canonical root request may follow redirects only while every redirect remains within the exact discovery-domain policy. Requested URL, redirect chain, and final URL are evidence; the collector never mutates `sources.canonical_url`.

Only the root has Snapshot and Observation persistence. Depth 1-2 pages are candidate URLs, not canonical Sources. Their fetch results, bodies, and classification exist only in the bounded run report. They must never be written under the root Source ID.

## Network Safety

Only credential-free HTTP and HTTPS URLs are accepted. Each request performs:

1. URL parse and scheme/credential validation.
2. DNS resolution of the original hostname.
3. Conservative rejection if any resolved address is non-global or unsafe.
4. Socket connection pinned to a vetted address.
5. Original hostname retained for HTTP Host, HTTPS SNI, and certificate hostname verification.

Redirect destinations repeat the complete sequence. Unsafe ranges include unspecified, loopback, RFC1918, link-local, carrier-grade shared space, documentation, benchmark, protocol-assignment, multicast, reserved, metadata endpoints, IPv6 ULA/link-local/multicast/documentation, and IPv4-mapped unsafe IPv6.

The production factory has no private-network override. Fixture tests inject a low-level address policy dependency that is not exposed through CLI or environment configuration. This permits real localhost fixture servers while production-path tests still prove localhost/private/redirect-to-private rejection.

## HTTP Contract

- GET only; no cookies or session state.
- Bounded User-Agent identifying PREPPY static collection.
- Manual redirects, maximum 5.
- Separate connect/read deadlines under a 10-second request timeout.
- gzip, br, and deflate Content-Encoding are decoded before entity-size accounting.
- Content-Length is evidence only and can trigger an early size rejection; actual decoded bytes enforce correctness.
- Root HTML success is snapshot eligible. Unsupported MIME produces no Snapshot.
- Errors are mapped to safe codes without raw response/error dumps.

## Robots Contract

Robots policy is keyed by actual effective origin: scheme, hostname, and effective port. `www.school.kr` and `school.kr` can be discovery-domain equivalent while using separate robots results.

The robots URL is `<origin>/robots.txt` and uses the same SSRF, redirect, timeout, and size-safe transport. A maintained parser package evaluates the configured User-Agent.

- 2xx: parse and enforce.
- 404/410: unavailable, documented allow.
- 401/403: review/block.
- timeout, DNS, TLS, or 5xx: `ROBOTS_UNAVAILABLE_REVIEW_REQUIRED`; target fetch stops.
- explicit disallow: `ROBOTS_BLOCKED`; target fetch does not occur.

## Domain and URL Identity

Discovery domain equality lowercases the hostname and removes exactly one leading `www.`. No other subdomain equivalence is allowed. Fragments are removed. Default ports normalize through URL serialization. Query order and values remain untouched. Tracking parameters are not guessed or removed. Trailing slashes remain distinct.

Relative links resolve against the fetched page final URL. Empty, fragment-only, credentialed, external-domain, unsupported-scheme, login/logout, and mutation-like links are reported as rejected candidates rather than fetched.

## Crawl and Politeness

The crawler uses deterministic FIFO breadth-first traversal with a visited normalized-URL set. All values live in a validated bounded configuration object:

- maximum depth: default 2, upper bound 2
- pages per Institution: default 30, upper bound 30
- links per page: default 250, upper bound 250
- decoded bytes per page: default 2 MiB, upper bound 2 MiB
- shared decoded bytes per explicit CLI run: default 20 MiB, upper bound 20 MiB
- request timeout: default 10 seconds, upper bound 30 seconds
- redirects: default 5, upper bound 5
- per-host concurrency: default/maximum 1
- global concurrency: default 4, maximum 4
- minimum host delay: default 500 ms, maximum configurable 5 seconds

The single run ledger spans all Sources and charges decoded robots, root, redirect-intermediate, candidate, failure, and partial response chunks. Page bytes retain their independent 2 MiB streaming bound. Budget exhaustion is a bounded result, not an unbounded retry. The run records page, byte, depth, and link budget outcomes. No automatic retry is implemented; existing `maxAttempts` remains a future scheduling boundary.

## HTML, Candidates, and Hashes

Cheerio parses HTML, including malformed input. Link extraction is centered on `<a href>`. Regex is not used to parse HTML. Candidate classification is an unverified hint: `ADMISSIONS`, `APPLICATION`, `TUITION`, `CURRICULUM`, `NOTICE`, `OPEN_HOUSE`, `CONTACT`, or `OTHER`.

Visible text normalization removes script, style, and noscript nodes, decodes entities through the DOM parser, preserves DOM order, applies Unicode NFC, collapses Unicode whitespace, and trims. SHA-256 is lowercase hexadecimal.

- first successful root: `SUCCESS`
- same content and text hashes: `UNCHANGED`, prior Snapshot reused
- changed content with equal text hash: `CHANGED` + `MARKUP_ONLY`
- changed text hash: `CHANGED` + `TEXT_CHANGED`

No detected or meaningful change row is created.

## Dependencies

- `cheerio@1.2.0`: maintained DOM/HTML parser, Node 22 compatible, malformed HTML support, MIT. Risk is transitive parser surface and future behavioral changes; exact pinning plus fixture regressions control it.
- `robots-parser@3.0.1`: established robots policy parser, MIT. Risk is older Node compatibility surface and robots-standard interpretation drift; exact pinning, an adapter boundary, and allow/disallow fixtures control it.

Neither dependency performs network access; all network behavior remains in the collector transport.

## Acceptance

Tests use only local fixture HTTP servers and a disposable PostgreSQL database guarded by `TEST_DATABASE_URL`. Migration `0000` through `0012`, schema constraints, seed regression, monitoring regression, root persistence/dedupe/change/failure behavior, candidate non-persistence, and zero Product-side-effect deltas are verified. No live smoke or production database access occurs.
