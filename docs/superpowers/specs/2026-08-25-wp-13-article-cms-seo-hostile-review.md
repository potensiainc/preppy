# PREPPY WP-13 Article CMS / SEO Design — Hostile Self-Review

**Status:** COMPLETE — amendments integrated; implementation plan ready for user review

**Date:** 2026-08-25

**Reviewed design:** `2026-08-25-wp-13-article-cms-seo-design.md`

**Review boundary:** design only; no implementation, dependency, package-lock, schema, migration, commit, or push change

## 1. Verdict

**PASS WITH RESOLVED FINDINGS.**

No unresolved BLOCKING or HIGH design defect remains within the approved WP-13 MVP boundary. The two review rounds found nine ambiguities that could have produced security, privacy, concurrency, redirect, or SEO drift during implementation. All nine were resolved in the design document before this verdict.

One known limitation remains accepted, documented, and non-blocking for WP-13: the internal cache endpoint's bounded replay registry is process-local. It does not provide cross-host replay enforcement in multi-instance production; distributed enforcement remains a required hardening gate for that topology.

## 2. Review Method

The review tried to break the design from these perspectives:

- stored-XSS attacker controlling Article source HTML and links;
- authenticated but stale or malicious Admin client;
- two concurrent editors and concurrent slug changes;
- replayed, delayed, duplicated, or out-of-order Outbox delivery;
- compromised/untrusted cache-revalidation request body without the HMAC secret;
- crawler observing mismatched body, canonical, metadata, sitemap, JSON-LD, or redirect state;
- historical repository data created before the sanitizer exists;
- accidental scope expansion into generic CMS, schema, or product-signal behavior.

Evidence was checked against the current Article/relations/redirect schema, public Article query, Admin command adapter pattern, WP-12 Outbox/Worker lifecycle, and the approved PRD/API/SEO architecture documents.

## 3. Resolved Findings

### HR-01 — slug changes could leave stored canonical URL pointing at the old slug

**Severity:** HIGH before resolution

**Attack/failure:** A valid published Article with a populated same-origin `canonicalUrl` changes slug. If only `articles.slug` and `url_redirects` change, the new page can emit the old canonical, lose indexability, or create a canonical/redirect disagreement.

**Resolution:** LOCK-009 now requires `ChangeArticleSlug` to rewrite a populated server-owned self canonical to the new exact Article URL in the same transaction. External canonicals remain unsupported.

**Required test:** slug transaction updates Article, canonical, redirect, Audit, and cache event together; injected failure rolls all of them back.

### HR-02 — publication and modification timestamps were semantically ambiguous

**Severity:** MEDIUM before resolution

**Attack/failure:** Re-publish could overwrite first publication time, while generic `updatedAt` could be exposed as fake SEO freshness. Sitemap and Article JSON-LD could disagree.

**Resolution:** LOCK-002/013/014 now define `publishedAt` as immutable first publication, retain it across unpublish/re-publish, use command-owned `updatedAt` as `dateModified`/Article `lastModified` only while public, and use `unpublishedAt`/`archivedAt` only for their exact transitions.

**Required test:** first publish, atomic published edit, unpublish, and re-publish preserve `datePublished` and advance only legitimate `dateModified`.

### HR-03 — timestamp-based Outbox dedupe could collide

**Severity:** MEDIUM before resolution

**Attack/failure:** Two serialized operations can theoretically receive the same timestamp precision and reason, causing one legitimate cache event to collide with another.

**Resolution:** LOCK-016 now derives the deterministic per-command dedupe key from event type, Article ID, reason, and the server-generated correlation/operation ID. Transaction retries of one operation remain idempotent without treating timestamp uniqueness as identity.

**Required test:** same Article/reason with distinct operation IDs produces distinct events; retry with the same operation ID produces one event.

### HR-04 — structured data could invent an Article index route or leak uncertain author semantics

**Severity:** MEDIUM before resolution

**Attack/failure:** A generic breadcrumb builder might invent `/articles`, which does not exist in the current route tree, or serialize Admin identity as a public author without an approved display name.

**Resolution:** LOCK-014 now fixes the Article JSON-LD mapping, emits author only from a bounded public display name, and limits BreadcrumbList to actual Home/current-Article routes. Institution and Opportunity schema remain omission-first.

**Required test:** absent author display name is omitted; no `/articles` breadcrumb is emitted; insufficient mapping emits no JSON-LD.

### HR-05 — decoded/encoded slug ambiguity could bypass canonical redirect lookup

**Severity:** HIGH before resolution

**Attack/failure:** Encoded slash, dot-segment, backslash, query, or fragment confusion can cause the framework route parameter, database source path, and browser interpretation to differ. A redirect lookup by raw request text could accept a noncanonical alias.

**Resolution:** LOCK-005/009 and the public route contract now require exact canonical slug grammar after route decoding and reconstruct the database lookup path from that validated value. Root-relative Article content links are exact canonical detail paths with no query/fragment/dot/encoded separator.

**Required test:** encoded separators, dot segments, double slash, backslash, controls, and malformed percent encodings never reach Article or redirect resolution.

### HR-06 — published candidate and author/slug ownership were under-specified

**Severity:** MEDIUM before resolution

**Attack/failure:** A client could try to smuggle slug, lifecycle timestamps, state, or author identity through the complete published candidate, bypassing the explicit command and Audit boundaries.

**Resolution:** Section 6 now excludes slug, actor/author, state, and lifecycle timestamps from `PublishArticle`; `ChangeArticleSlug` exclusively owns slug, and creation derives `authorAdminId` from authenticated command context.

**Required test:** strict schemas reject every server-owned field and unknown member with zero writes.

### HR-07 — historical redirects could disclose a nonpublic current slug

**Severity:** HIGH before resolution

**Attack/failure:** Article `/articles/a` is published, moved to `b`, unpublished, then moved to `c`. The historical registry correctly flattens `a -> c` and `b -> c`, but a runtime that trusts registry existence alone emits `Location: /articles/c` even though `c` is UNPUBLISHED. This leaks the nonpublic canonical slug and redirects crawlers to private state.

**Resolution:** LOCK-009/011 and Section 9 now separate registry preservation from runtime eligibility. Runtime performs one exact redirect-row lookup, validates the flattened target, then loads the target Article by exact current slug. Only a PUBLISHED target receives `308`; DRAFT, UNPUBLISHED, ARCHIVED, missing, or noncanonical targets return not-found without `Location`. No redirect is recursively followed. Preserved history becomes active again after republish.

**Required test:** `a -> b`, unpublish, `b -> c` produces preserved flattened rows but both historical routes return not-found; republish `c` makes both return `308 /articles/c`.

### HR-08 — internal Admin display name was treated as a public author identity

**Severity:** HIGH before resolution

**Attack/failure:** The existing public Article query joins `admin_users.displayName`. That field supports Admin operation/session UI, but no contract marks it safe for public editorial attribution. Rendering it as a byline or JSON-LD author can expose internal operator PII.

**Resolution:** LOCK-014 now declares internal Admin identity distinct from public author identity. WP-13 removes `authorDisplayName` from public Article DTO/rendering and omits JSON-LD `author` unconditionally. No schema/migration is added; author attribution waits for an explicitly approved public-author model.

**Required test:** an Article whose `author_admin_id` points to an Admin with `displayName` produces neither a public byline field nor JSON-LD `author`.

### HR-09 — same-origin absolute links could bypass the internal route allowlist

**Severity:** HIGH before resolution

**Attack/failure:** Root-relative `/admin/users` is rejected, but `https://preppy.example/admin/users` could be accepted by a broad absolute HTTP(S) branch and published as an internal/private editorial link.

**Resolution:** LOCK-005 now uses one classifier. Root-relative input and absolute URLs matching `APP_BASE_URL` origin both pass the exact PREPPY canonical public-path validator. Accepted same-origin absolute links normalize to root-relative; same-origin Admin/API/auth/private/noncanonical paths are removed. Only non-PREPPY absolute HTTP(S) origins use the external-link policy.

**Required test:** same-origin `/articles/foo` absolute URL normalizes to `/articles/foo`; same-origin `/admin`, `/api`, `/auth`, onboarding, and My PREPPY URLs are removed; an external HTTPS URL remains allowed.

## 4. Security Attack Matrix

| Attempt | Required outcome | Design control |
| --- | --- | --- |
| `<script>`, event handler, SVG/MathML, iframe, style/class injection | removed; no execution in preview/public | LOCK-004, write + read sanitization |
| `javascript:`, encoded/mixed-case/control scheme | anchor removed/unwrapped; no unsafe `href` | LOCK-005, URL parse/classification tests |
| `//evil.example` or `/\\evil.example` | rejected | LOCK-005, protocol-relative/backslash rejection |
| safe `/institutions/slug` internal link | retained, same-tab | LOCK-005 |
| same-origin absolute `/articles/slug` | normalized to `/articles/slug` | LOCK-005 |
| same-origin absolute `/admin`, `/api`, `/auth`, or private path | removed by internal classifier | LOCK-005 |
| external HTTPS `_blank` without safe rel | retained with forced `noopener noreferrer` | LOCK-005 |
| 129 KiB body or sanitizer-expanded oversized output | fail before write; no truncation | LOCK-006 |
| old unsafe database HTML | sanitized again before preview/public DTO | LOCK-004/011 |
| raw HTML in Audit or error | forbidden; fingerprint/bounded error only | LOCK-003, Admin API contract |
| client-supplied actor/state/timestamp/cache path | strict rejection | Sections 6 and 8 |
| PUBLISHED call to draft endpoint | typed conflict, zero writes | LOCK-002 |
| stale published re-edit | `409`, zero overwrite | LOCK-002, row lock + expected timestamp |
| two concurrent slug changes | one serialized winner; safe conflict/flattening | LOCK-009, advisory + row lock + constraints |
| historical redirect whose target is UNPUBLISHED/ARCHIVED/DRAFT | not-found, no `Location` disclosure | LOCK-009/011, Section 9 |
| historical redirect after target is republished | `308` to current canonical target | LOCK-011, Section 9 |
| Admin has internal `displayName` | no public byline/JSON-LD author | LOCK-014 |
| HMAC signature over reserialized rather than raw body | rejection | LOCK-017 canonical input |
| replay same signed request | local rejection within bound/window | LOCK-017 |
| arbitrary valid-looking path in cache body | ignored/rejected; paths derived from DB | LOCK-010/018 |
| delayed old slug event after a newer slug | old historical path invalidated; current state recomputed | Section 11 |
| network failure during publish | Article commits with retryable Outbox; no network in tx | LOCK-016 |
| speculative Event/EducationalOrganization JSON-LD | omitted | LOCK-014 |

## 5. Concurrency and Atomicity Review

### Published edit race

Both editors read timestamp `T0`. The first `PublishArticle` obtains the row lock, validates `T0`, writes the complete candidate/relations/Audit/cache event, advances `updatedAt`, and commits. The second obtains the lock afterward, observes a value different from `T0`, and returns stale conflict. It cannot partially replace relations or body.

### Slug race and redirect history

Row lock protects one Article, while the stable advisory lock protects the shared Article/redirect namespace across different Articles. Current Article slug uniqueness and redirect-source primary key remain database backstops. The command checks the new current path against both registries, captures the old path before mutation, and flattens all active Article history to the final target in one transaction.

### Outbox ordering

Event payloads describe transaction intent, not authoritative current state at delivery time. The endpoint validates the preserved prior path but recomputes current Article/relations. Therefore delayed publish/unpublish/slug events cannot roll the cache back to an earlier canonical target. Duplicate invalidations are harmless and bounded; direct arbitrary paths are unavailable.

### Rollback

Article, relations, redirect, Audit, and cache Outbox participate in one root transaction. Any failed eligibility check, sanitizer bound, stale check, FK validation, uniqueness conflict, or injected write failure must leave all five areas unchanged. Worker network handling starts only after claim commit and cannot become part of this transaction.

## 6. SEO Consistency Review

The same canonical projection/indexability result must drive page visibility, metadata robots, sitemap inclusion, related-card eligibility, canonical URL, and structured-data eligibility. The design rejects these inconsistent states:

- Article body renders but metadata query independently decides it is a draft;
- a noindex Article appears in sitemap;
- a redirect source appears in sitemap;
- old slug redirects while canonical still names old slug;
- old slug emits `Location` for a nonpublic canonical target;
- JSON-LD claims data not present in the visible/canonical projection;
- internal Admin identity appears as public Article author without a public-author contract;
- filter URLs self-canonicalize and become indexable;
- generic operational `updated_at` claims editorial freshness.

The current repository has no `/articles` list route. The design therefore neither invents that route for breadcrumbs nor promises its cache path. If an Article list is separately introduced within the approved implementation scope, its path must first be added to the public route/metadata contract and tests.

## 7. Scope and Supply-Chain Review

- No schema/migration is required by the existing Article, relation, and redirect tables.
- Tiptap Link and Underline come from StarterKit v3; separate extension packages would violate scope.
- `sanitize-html` below `2.17.6` is a security gate failure; the exact accepted version must be visible in the lockfile.
- Editor packages remain Admin-only and must not enter the public Article bundle.
- No image upload, media proxy, general rich-text extension registry, generic workflow, generic SEO framework, analytics, or customer Product signal is justified by WP-13.

## 8. Accepted Limitation and Future Gate

### Process-local replay registry

The HMAC, timestamp window, strict body, and process-local replay check are adequate for the approved WP-13 single-runtime boundary. They do not establish global one-time use across instances, restarts, regions, or a hostile internal network. Before multi-instance production relies on replay rejection as a global guarantee, PREPPY must add a distributed nonce/signature store or equivalent trusted edge enforcement and test it under concurrent delivery.

This is recorded as a hardening requirement, not silently accepted as a production-global guarantee.

## 9. Final Gate Decision

The design is internally consistent with the four original and three additional user-approved amendments:

1. safe PREPPY root-relative links plus absolute HTTP(S), with unsafe schemes/protocol-relative forms rejected;
2. old and new canonical paths retained for slug revalidation, with current/related paths server-derived;
3. omission-first structured data and explicit insufficient-data tests;
4. exact DRAFT/UNPUBLISHED/PUBLISHED edit semantics with atomic PUBLISHED `PublishArticle` and stale `409`.
5. a historical redirect produces `308` only when its final canonical Article target is currently PUBLISHED;
6. internal `admin_users.displayName` is omitted from public Article author/byline output;
7. root-relative and same-origin absolute PREPPY links share the same canonical public-path validator.

**Recommendation:** the amended design gate is approved. The detailed `writing-plans` artifact has now been written and self-reviewed; do not begin inline TDD until the user approves that implementation plan.
