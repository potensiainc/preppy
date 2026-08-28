# PREPPY Static HTTP Collector Implementation Report

**Branch:** `feat/preppy-static-http-collector`

**Starting commit:** `536e109912b4f896552f77b12e07f5b43bdd62c9`

**Live school smoke:** not executed by Owner decision

**Production database / credentials:** not used

## Repository Reality

| Capability | Repository evidence after implementation | Status | Required change delivered |
|---|---|---|---|
| OFFICIAL_MAIN input selection | `repository.server.ts`, explicit Source CLI | IMPLEMENTED_AND_TESTED | Revalidates binding, Source, and optional monitor config; max 10; no all mode |
| Static HTTP fetch adapter | `http-transport.server.ts` | IMPLEMENTED_AND_TESTED | GET-only pinned-address HTTP(S), original Host/SNI/certificate hostname, compression decode, safe evidence |
| Redirect evidence | transport + Snapshot/Observation metadata | IMPLEMENTED_AND_TESTED | Bounded chain, same-domain follow, external stop, no canonical URL mutation |
| Status/content-type capture | transport response contract | IMPLEMENTED_AND_TESTED | Root evidence and bounded operator report |
| Response byte limit | transport decoded-entity reader | IMPLEMENTED_AND_TESTED | Content-Length precheck immediately aborts declared oversize responses; streaming decoded limit remains charged |
| Timeout | transport | IMPLEMENTED_AND_TESTED | One monotonic deadline per hop includes DNS, connect, and read; request/connect timers use only the remaining time |
| Same-domain normalization | `url-policy.ts` | IMPLEMENTED_AND_TESTED | Lowercase + one leading www only; fragments removed |
| Link extraction/dedupe | `html.ts`, `crawler.server.ts` | IMPLEMENTED_AND_TESTED | DOM-order anchor extraction; final-URL relative resolution; bounded dedupe |
| Crawl budget | `contracts.ts`, `run-budget.ts`, crawler/service | IMPLEMENTED_AND_TESTED | One decoded-byte ledger across all Sources, robots, redirect bodies, roots, candidates, and partial/failure bodies; separate page cap |
| Robots policy | `robots.server.ts` | IMPLEMENTED_AND_TESTED | Exact-origin cache, fail-closed unavailable policy, bounded ordered persisted effective-origin evidence |
| Snapshot persistence | existing `source_snapshots` | IMPLEMENTED_AND_TESTED | Root-only decoded entity evidence and hash dedupe |
| Content / normalized text hash | `hash.ts`, `html.ts` | IMPLEMENTED_AND_TESTED | Exact entity SHA-256 and NFC visible-text SHA-256 |
| Observation persistence | existing `source_observations` | IMPLEMENTED_AND_TESTED | Existing coarse outcomes + safe detailed code/metadata; latest successful Observation defines current state |
| Candidate Source lifecycle | in-memory/operator report | IMPLEMENTED_AND_TESTED | Ephemeral only; no Source promotion or Candidate table |
| Failure classification | transport/crawler/repository | IMPLEMENTED_AND_TESTED | Bounded safe taxonomy mapped to existing outcomes |
| Retry/backoff boundary | no automatic retry | DOCUMENTED_ONLY | Politeness/delay is implemented; scheduling and retries remain a later WP |
| Test fixtures | local Node HTTP server and injected DNS | IMPLEMENTED_AND_TESTED | No school website dependency |
| Product-side-effect isolation | persistence integration delta assertions | IMPLEMENTED_AND_TESTED | Snapshot/Observation only |

## Schema and migration

Migration `0012_loving_trauma` adds only:

- nullable `source_snapshots.raw_body bytea`;
- nullable `source_observations.metadata jsonb`.

No table or enum was added. Existing `source_snapshots.metadata`, `raw_storage_key`, `UNIQUE(source_id, content_hash)`, Snapshot/Observation foreign keys, and Observation checks remain unchanged.

Disposable PostgreSQL evidence revalidated on 2026-08-29:

- image/service: repository `postgres:16-alpine` Docker Compose test service;
- server version: PostgreSQL 16.14;
- test service: isolated `preppy-http-pr2-review` Compose project, also selected explicitly for the backup/restore drill;
- test databases: names ending `_test`, recreated per integration file and used only through `TEST_DATABASE_URL`;
- canonical migration runner applied 13 ledger entries, 0000 through 0012;
- information schema reported nullable `bytea raw_body` and nullable `jsonb metadata`;
- schema integration re-proved Snapshot uniqueness/provenance and Observation FK/check contracts;
- PREPPY seed importer and monitoring/source command integration regressions passed in isolated disposable databases;
- production database used: NO; production credentials used: NO.

## Implementation files

Added collector modules: `classification.ts`, `cli.server.ts`, `contracts.ts`, `crawler.server.ts`, `hash.ts`, `html.ts`, `http-transport.server.ts`, `network-safety.server.ts`, `politeness.server.ts`, `repository.server.ts`, `robots.server.ts`, `run-budget.ts`, `service.server.ts`, and `url-policy.ts` under `src/modules/http-collector/`.

Also added the operator script, migration 0012 SQL/metadata, local HTTP/HTTPS fixtures with a runtime-generated ephemeral test CA and server certificate, nine unit test files, two PostgreSQL integration files, the design/plan documents, and the three data contract/report/handoff documents. `.gitattributes` pins checksum-bound seed text artifacts and migrations 0011/0012 to canonical LF bytes on every OS; XLSX remains binary. Modified files are limited to package manifests, schema/journal/runtime migration manifest, checksum manifest/CSV normalization, and existing tests whose repository migration count/latest identifier became 13/0012.

## Dependency decision

- `cheerio@1.2.0`: established server-side HTML5 parser used for malformed HTML, DOM-order links, entity decoding, and deterministic visible text. This avoids unsafe regex parsing. It does not execute page JavaScript.
- `robots-parser@3.0.1`: focused robots rules parser used instead of an ad-hoc substring implementation.

Both versions are exact-pinned. `npm audit --omit=dev --json` reported 0 production vulnerabilities (0 info/low/moderate/high/critical) across 118 production dependencies. Residual risk is normal third-party parser maintenance/supply-chain exposure; lockfile pinning, bounded inputs, no script execution, and fixture coverage reduce it.

## Fixture and contract coverage

All 30 required cases are covered without live websites:

| # | Required case | Evidence |
|---:|---|---|
| 1 | Simple 200 HTML | transport/crawler root success |
| 2 | Relative links | crawler final-URL resolution |
| 3 | Same-domain redirect | transport chain + persistence final URL |
| 4 | External redirect | destination not requested, review failure |
| 5 | Redirect loop | bounded too-many-redirects |
| 6 | 404 | failure Observation / no Snapshot |
| 7 | 500 | failure Observation / no Snapshot |
| 8 | Timeout | DNS and read watchdog fixtures |
| 9 | Huge response | declared and streaming decoded size rejection |
| 10 | Unsupported PDF | root unsupported content classification |
| 11 | Gzip response | decoded entity bytes stored and hashed |
| 12 | Same text, changed markup | `MARKUP_ONLY` and stable text hash |
| 13 | Changed visible text | `TEXT_CHANGED` and new text hash |
| 14 | www equivalence | URL/domain contract |
| 15 | Non-www subdomain isolation | URL/domain contract |
| 16 | Fragment normalization | URL/link contract |
| 17 | Duplicate links | crawler dedupe |
| 18 | Depth limit | `DEPTH_LIMIT_REACHED` |
| 19 | Page count limit | `PAGE_BUDGET_EXCEEDED` |
| 20 | Byte limit | page and total decoded-byte fixtures |
| 21 | Login/logout exclusion | crawler rejection |
| 22 | Robots allow | exact-origin parser/cache fixture |
| 23 | Robots disallow | target not fetched |
| 24 | SSRF localhost | unsafe address classification |
| 25 | SSRF private IP | mixed/unsafe DNS rejection |
| 26 | Redirect to private IP | destination blocked before request |
| 27 | Malformed HTML | Cheerio DOM extraction |
| 28 | Korean classification | heuristic unit coverage |
| 29 | English classification | heuristic unit coverage |
| 30 | No Product side effects | PostgreSQL table deltas all zero |

Additional cases cover URL credentials, unsupported schemes, vetted-address Host preservation, redirect-origin robots, robots timeout/redirect SSRF, link limit, request pacing/concurrency, CLI bounds/redaction, monitor-config eligibility, Snapshot reuse, candidate non-persistence, and Source canonical URL immutability.

The red-team additions also prove:

1. `A → B → A → A` produces two Snapshots and four Observations with `SUCCESS, CHANGED, CHANGED, UNCHANGED`; the final Observation reuses the first A Snapshot.
2. Different gzip compression levels produce the same decoded `raw_body` and `content_hash` and reuse one Snapshot.
3. Chunked compressed decompression bombs stop at the page limit while charging decoded work.
4. Redirect intermediate bodies, robots bodies, failure bodies, oversized partial bodies, pre-timeout chunks, and pre-body-error chunks charge one shared run ledger.
5. Ten explicit Sources share that ledger and the run stops deterministically at exhaustion.
6. Local HTTPS proves the socket is pinned to the vetted IP while Host, SNI, and certificate verification use the original hostname; a hostname mismatch is `TLS_ERROR` and no insecure TLS option exists.
7. Root 404 and invalid canonical URL each create no Snapshot and one safe failure Observation; valid/invalid/valid apply uses three per-Source transactions and preserves both valid results.
8. Effective-origin robots decisions are ordered consistently with redirects and persisted without bodies, headers, or credentials.
9. IPv4/IPv6 documentation, reserved, link-local, ULA, multicast, IPv4-mapped, `fec0::/10`, `3fff::/20`, protocol-assignment, and mixed safe/unsafe DNS cases fail closed; a known global-unicast address remains allowed.
10. Canonical LF seed bytes and all five `SHA256SUMS` entries match both the Windows worktree and a fresh Git tree; the CSV hash is `fb839339800e55d9543b196f8209079719ac116fffe419f36914c9b6755acafe`.
11. The service entrypoint reparses every supplied policy and rejects all approved upper-bound bypass cases before database, transaction, or network work begins.
12. Each HTTP hop uses one monotonic deadline across DNS, connect, and response read; remaining time clips both the request and connect timers, and each redirect starts a new bounded hop.
13. External, private-address, too-many, and robots-rejected redirects preserve the decoded current response byte length without fetching the rejected destination; PostgreSQL Observation evidence matches the transport length.
14. Declared oversized uncompressed responses are destroyed immediately with zero decoded-byte charge, while streaming and decompression accounting remains unchanged.

## Acceptance results

- Collector-focused unit tests: 9 files, 136 tests, PASS.
- Full unit regression: 116 files, 1,079 tests, PASS.
- Integration regression: 74 files, 543 tests, PASS. Files were run against a freshly recreated disposable database per file because legacy fixed/shared fixtures can contaminate a shared database. Three environment-oriented files received the canonical migration first; the restore drill used the explicitly selected disposable Compose project.
- Collector PostgreSQL integration: 2 files, 15 tests covering schema, root success, exact raw entity bytes/hashes, compression-level equivalence, state reversion, invalid/404 isolation, shared budget, robots evidence, redirect failure response-byte persistence, candidate delta zero, and Product deltas zero: PASS.
- Migration 0000→0012, seed importer (9 tests), source/monitoring regression (13 tests), rehearsal, operational snapshot, and actual backup/restore tests: PASS.
- Production dependency audit: PASS, 0 vulnerabilities.
- TypeScript and production build: PASS. Formatting and `git diff --check` are recorded after the last documentation update below.

## Live smoke

Not executed. The Owner explicitly required fixture/local servers and disposable PostgreSQL only. No external school site was contacted.

## Known limitations

1. Candidate URLs are ephemeral report data; there is no review queue, persistent Candidate table, or automatic Source promotion.
2. Static HTTP cannot execute JavaScript, authenticate, solve CAPTCHAs, or parse PDFs. Such cases remain reviewable failures; there is no automatic browser/PDF fallback.
3. The work package has no scheduler, automatic retry/backoff engine, proxy rotation, or monitoring cadence mutation.
4. Inline `raw_body` is intentionally capped at 2 MiB root evidence. Future object storage must preserve existing `raw_storage_key` semantics during migration.

## Final verification record

This section is finalized after the last typecheck/build/diff run:

- TypeScript: PASS — `tsc --noEmit`
- Production build: PASS — Next.js 16.3.0 optimized build with non-production `APP_BASE_URL=https://preppy.example`
- Formatting: PASS for every collector source/support/unit/integration file changed by this fix pass. Repository-wide `prettier --check .` still reports the pre-existing 500-file formatting baseline, which was not rewritten because this pass prohibits unrelated changes.
- `git diff --check`: PASS
- Checksum verification: PASS — Windows bytes and fresh-tree bytes both match all five manifest entries; explicit LF attributes cover checksum-bound text and do not cover XLSX
- Disposable database/container cleanup: PASS — the isolated `preppy-http-pr2-review` container, network, and volume were removed; no PostgreSQL container remains running
