# PREPPY Static HTTP Collector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan inline task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Owner policy prohibits subagent delegation and commits for this work package.

**Goal:** Build a secure, fixture-tested static HTTP collector that accepts only explicit eligible OFFICIAL_MAIN Sources, performs bounded same-domain discovery, and persists only root Snapshot/Observation evidence.

**Architecture:** A pure contract/policy core owns URL, budget, classification, and normalization behavior. A Node HTTP transport pins vetted DNS results while retaining the original TLS identity; robots and crawler orchestration depend on that transport. A database service validates explicit Source eligibility and atomically persists one root evidence result while candidate pages stay ephemeral.

**Tech Stack:** TypeScript 5.9, Node.js 22 HTTP/HTTPS/DNS/zlib/crypto, Cheerio 1.2.0, robots-parser 3.0.1, Drizzle ORM 0.45.2, PostgreSQL, Vitest 4.1.10.

**Spec:** `docs/superpowers/specs/2026-08-28-preppy-http-collector-design.md`

## Global Constraints

- Branch remains `feat/preppy-static-http-collector`; starting commit remains `536e109912b4f896552f77b12e07f5b43bdd62c9`.
- Do not commit, push, merge, deploy, access production DB, or use production credentials.
- CLI accepts explicit `--source-id` only, maximum 10; default dry-run; no `all`.
- Only root Snapshot/Observation writes are allowed. Candidate pages remain ephemeral.
- Add only `source_snapshots.raw_body bytea` and `source_observations.metadata jsonb` in migration `0012`; add no table or outcome enum.
- Tests use local fixtures and `TEST_DATABASE_URL` only; no live website smoke.
- Every production behavior follows RED -> observed expected failure -> GREEN -> focused pass before the next behavior.

---

### Task 1: Migration 0012 and Schema Contract

**Files:**
- Modify: `src/db/schema/index.ts`
- Create: `src/db/migrations/0012_*.sql`
- Create: `src/db/migrations/meta/0012_snapshot.json`
- Modify: `src/db/migrations/meta/_journal.json`
- Create: `tests/integration/preppy-http-collector-schema.test.ts`

**Interfaces:**
- Produces `sourceSnapshots.rawBody: Buffer | null` and `sourceObservations.metadata: Record<string, unknown> | null`.

- [ ] Write integration assertions for both nullable columns, `bytea`/`jsonb` types, and retained Snapshot unique/FK/Observation checks.
- [ ] Run the focused test against a current disposable database and observe failure because migration `0012` is absent.
- [ ] Add the two Drizzle fields and generate exactly one additive migration.
- [ ] Inspect SQL/meta output; reject any unrelated schema delta.
- [ ] Run migration `0000 -> 0012` and focused schema test to green.

### Task 2: Bounded Contracts, URL Identity, and Candidate Classification

**Files:**
- Create: `src/modules/http-collector/contracts.ts`
- Create: `src/modules/http-collector/url-policy.ts`
- Create: `src/modules/http-collector/classification.ts`
- Create: `tests/unit/preppy-http-collector-contract.test.ts`

**Interfaces:**
- Produces `DEFAULT_HTTP_COLLECTOR_POLICY`, `parseHttpCollectorPolicy`, `normalizeDiscoveryUrl`, `discoveryDomainKey`, `isSameDiscoveryDomain`, and `classifyCandidate`.

- [ ] Write failing table tests for all default/upper budget bounds and rejected zero/unbounded values.
- [ ] Implement immutable Zod-validated policy with exact approved defaults and maxima.
- [ ] Write failing URL tests for schemes, credentials, fragments, default ports, query ordering, trailing slash, one-`www.` equivalence, and subdomain isolation.
- [ ] Implement URL validation/normalization without tracking or query rewriting.
- [ ] Write failing Korean/English classification and login/logout/mutation exclusion tests.
- [ ] Implement deterministic candidate hints and rejection reasons; run focused tests green.

### Task 3: SSRF Address Policy and Pinned Node Transport

**Files:**
- Create: `src/modules/http-collector/network-safety.server.ts`
- Create: `src/modules/http-collector/http-transport.server.ts`
- Create: `tests/support/http-collector-fixture.ts`
- Create: `tests/unit/preppy-http-collector-network.test.ts`

**Interfaces:**
- Produces `resolveVettedAddresses(hostname)`, `assertSafeAddress(address)`, `createNodeHttpTransport(dependencies?)`, and a transport returning decoded bounded entity bytes plus allowlisted response evidence.

- [ ] Write failing address tests covering localhost, IPv4/IPv6 private, link-local, metadata, shared, documentation, multicast, reserved, IPv4-mapped IPv6, and mixed safe/unsafe DNS answers.
- [ ] Implement explicit CIDR/address checks and conservative mixed-answer rejection.
- [ ] Write failing fixture tests proving only GET, pinned vetted dial address, original Host/SNI/certificate hostname inputs, manual redirect revalidation, loop bounds, connect/read timeout, and safe error mapping.
- [ ] Implement Node HTTP/HTTPS requests with injected resolver/address policy, original hostname TLS identity, no cookies, bounded headers/User-Agent, and manual redirects.
- [ ] Write failing gzip/br/deflate, declared-size, decoded-size, partial-body, 404, 500, and unsupported-content tests.
- [ ] Implement streaming Content-Encoding decode and 2 MiB decoded entity cap; run focused tests green.

### Task 4: Robots Policy

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/modules/http-collector/robots.server.ts`
- Create: `tests/unit/preppy-http-collector-robots.test.ts`

**Interfaces:**
- Produces `RobotsPolicy.evaluate(targetUrl)` returning bounded `ALLOW`, `ROBOTS_BLOCKED`, or `ROBOTS_UNAVAILABLE_REVIEW_REQUIRED` evidence keyed by exact origin.

- [ ] Install exact `cheerio@1.2.0` and `robots-parser@3.0.1` dependencies.
- [ ] Write failing local fixture tests for allow, disallow, separate www/non-www origins, 404/410 allow, 401/403 block, timeout/DNS/TLS/5xx review, and unsafe robots redirect.
- [ ] Implement per-origin cache and `robots-parser` evaluation through the same safe transport.
- [ ] Prove disallowed/review targets are never fetched and run focused tests green.

### Task 5: DOM Parsing, Normalized Text, Hashes, and Discovery

**Files:**
- Create: `src/modules/http-collector/html.ts`
- Create: `src/modules/http-collector/hash.ts`
- Create: `src/modules/http-collector/crawler.server.ts`
- Create: `tests/unit/preppy-http-collector-html.test.ts`
- Create: `tests/unit/preppy-http-collector-crawler.test.ts`

**Interfaces:**
- Produces `analyzeHtml(entityBytes, charset)`, `sha256Hex(bytesOrText)`, and `crawlOfficialMainRoot(input, dependencies)` returning one root evidence result and bounded candidate report.

- [ ] Write failing hash/text tests for exact entity-byte hash, script/style/noscript removal, entity decoding, whitespace collapse, NFC, DOM order, markup-only equality, visible-text change, and malformed HTML.
- [ ] Implement Cheerio-based extraction/normalization and SHA-256.
- [ ] Write failing discovery tests for relative resolution, duplicates, fragments, external domain, login/logout, page/link/depth/byte budgets, deterministic BFS, and classifications.
- [ ] Implement FIFO crawler with visited-set, robots-before-fetch, host politeness hooks, and candidate-only depth 1-2 results.
- [ ] Run focused HTML/crawler tests green and verify no candidate persistence interface exists.

### Task 6: Eligible Source Query and Root Persistence

**Files:**
- Create: `src/modules/http-collector/repository.server.ts`
- Create: `src/modules/http-collector/service.server.ts`
- Create: `tests/integration/preppy-http-collector-persistence.test.ts`

**Interfaces:**
- Produces `loadEligibleOfficialMainSources(executor, sourceIds)`, `persistRootCollection(executor, result)`, and `collectExplicitSources(input, dependencies)`.

- [ ] Write failing DB tests for explicit eligible binding/type/lifecycle and optional monitor-config restrictions.
- [ ] Implement one bounded eligibility query that rejects missing, duplicate, wrong-role, inactive, non-HTTP-config, disabled, or browser-required input.
- [ ] Write failing integration cases for root SUCCESS, exact raw entity body/hash/text hash, allowlisted bounded metadata, failure Observation without Snapshot, and canonical URL non-mutation.
- [ ] Implement transactional root persistence with existing outcomes and detailed safe error codes.
- [ ] Write failing identical/markup-only/text-change tests proving Snapshot reuse/new counts and metadata classifications.
- [ ] Implement latest-successful-Observation comparison and `ON CONFLICT` Snapshot reuse under `UNIQUE(source_id, content_hash)`.
- [ ] Write failing candidate non-persistence and Product-table delta tests; keep writes limited to Snapshot/Observation and run green.

### Task 7: Explicit CLI and Operator Report

**Files:**
- Create: `src/modules/http-collector/cli.server.ts`
- Create: `scripts/data/collect-official-main-http.ts`
- Modify: `package.json`
- Create: `tests/unit/preppy-http-collector-cli.test.ts`

**Interfaces:**
- Produces `parseHttpCollectorCliArgs(arguments_)` and `runHttpCollectorCli(arguments_, dependencies?)`; package script `collector:http`.

- [ ] Write failing argument tests for default dry-run, apply, repeated IDs, UUID validation, duplicates, empty input, batch 11, unknown options, and forbidden `all`.
- [ ] Implement parser and service wiring with DB cleanup in `finally`.
- [ ] Write failing output tests proving bounded JSON serialization excludes bodies, headers, credentials, stack traces, and BigInt hazards.
- [ ] Implement the bounded operator report and run focused CLI tests green.

### Task 8: Fixture Matrix and Regression Acceptance

**Files:**
- Modify focused tests from Tasks 2-7 as coverage requires.
- Create: `docs/data/PREPPY_HTTP_COLLECTOR_CONTRACT.md`
- Create: `docs/data/PREPPY_HTTP_COLLECTOR_REPORT.md`
- Create: `docs/data/PREPPY_LINK_DISCOVERY_HANDOFF.md`

**Interfaces:**
- Produces the 30-case fixture acceptance evidence and final handoff documentation.

- [ ] Map each required fixture case to a behavioral test and add any missing RED case before its minimal implementation fix.
- [ ] Start a disposable PostgreSQL container whose database name ends `_test`; export only `TEST_DATABASE_URL`.
- [ ] Run canonical migrations `0000 -> 0012`, collector schema/persistence tests, seed importer regressions, and existing monitoring regressions without file parallelism.
- [ ] Verify root/candidate/Product deltas with direct PostgreSQL assertions and record PostgreSQL/container evidence.
- [ ] Run full unit tests, full integration tests, TypeScript, build, and `git diff --check`.
- [ ] Write the three required documents with actual command/result evidence, dependency rationale, known limitations, and next safe WP.
- [ ] Stop/remove the disposable database and verify no collector container remains.
- [ ] Run final `git status`, `git diff --stat`, and `git diff --check`; leave every change uncommitted.
