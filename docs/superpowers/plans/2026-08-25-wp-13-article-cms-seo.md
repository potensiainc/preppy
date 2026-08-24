# WP-13 Article CMS / Sanitization / SEO Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` for inline execution, `superpowers:test-driven-development` for every production-code task, `frontend-design` for the Admin editor/public prose implementation, `webapp-testing` for browser verification, and `superpowers:verification-before-completion` before reporting completion. Steps use checkbox (`- [ ]`) syntax for tracking. Do not dispatch subagents; the approved execution mode is inline TDD.

**Status:** IMPLEMENTATION COMPLETE — all 15 inline-TDD tasks and final verification gates executed; no commit/push/deploy

**Goal:** Build PREPPY's bounded Article command-to-public-rendering vertical slice with deterministic server sanitization, atomic published editing, safe historical redirects, central technical SEO, and Outbox-driven authenticated cache revalidation.

**Architecture:** Server-only Article commands own validation, sanitization, row/advisory locks, Article/relations/redirect writes, PII-safe Audit, and cache Outbox intent in one root transaction. Admin routes are thin authenticated adapters, public routes consume only sanitized canonical projections, redirect runtime authorizes a historical `308` only after loading a currently PUBLISHED final target, and the Worker calls an HMAC-protected endpoint that derives current/related/historical invalidation paths from database state.

**Tech Stack:** TypeScript 5.9, Node.js 22+, Next.js 16.3 App Router/Server Components, React 19, Zod 4.4, Drizzle ORM 0.45, PostgreSQL, Vitest 4, Tiptap 3.30.3 StarterKit, `sanitize-html` 2.17.7, Node `crypto`, platform `fetch`.

**Spec:** `docs/superpowers/specs/2026-08-25-wp-13-article-cms-seo-design.md`

**Hostile review:** `docs/superpowers/specs/2026-08-25-wp-13-article-cms-seo-hostile-review.md`

## Global Constraints

- Execute inline TDD for every task: establish RED, implement the smallest bounded behavior, refactor only while GREEN, then run the task checkpoint.
- Do not commit, push, merge, deploy, or start WP-14. Normal plan commit steps are replaced with test/diff checkpoints.
- Add no migration or schema change. If the existing `articles`, relation, `url_redirects`, Audit, or Outbox schema proves insufficient, stop and report the exact blocker before editing schema files.
- Add only exact packages `@tiptap/react@3.30.3`, `@tiptap/pm@3.30.3`, `@tiptap/starter-kit@3.30.3`, `sanitize-html@2.17.7`, and dev dependency `@types/sanitize-html@2.16.1`. `sanitize-html` must never resolve below `2.17.6`.
- StarterKit supplies Link and Underline. Do not add separate extensions, collaboration/cloud, image/table/media, upload, DOMPurify/jsdom, TinyMCE, CKEditor, Quill, or another sanitizer/editor.
- The sanitizer is server-only, policy version `v1`, deterministic/idempotent, and used on every content persist plus every Admin preview/public historical read.
- HTML bounds are 128 KiB input and output; Article Admin JSON is 192 KiB raw UTF-8; the internal cache endpoint is 16 KiB raw UTF-8. Relation sets are at most 12 Institutions and 12 Opportunities. Active historical redirect sources are at most 100, detected with a 101-row query and fail-closed overflow.
- One link classifier governs root-relative and same-origin absolute URLs. PREPPY origin accepts only canonical `/institutions/{slug}`, `/opportunities/{slug}`, and `/articles/{slug}` and normalizes to root-relative. Only different-origin absolute HTTP(S) links use the external policy.
- `UpdateArticleDraft` is allowed only for DRAFT/UNPUBLISHED. The only PUBLISHED content/SEO/relation edit is atomic `PublishArticle(candidate, expectedUpdatedAt)` while remaining PUBLISHED. No hidden draft, autosave, merge, or last-write-wins.
- `publishedAt` is immutable first-publication time; successful editorial/lifecycle/slug/relation commands advance `updatedAt`; unpublish retains `publishedAt`; republish clears `unpublishedAt` without rewriting `publishedAt`.
- `admin_users.displayName` is internal. Remove it from the public Article DTO/byline and omit Article JSON-LD `author` unconditionally. Add no public-author schema.
- Historical redirect rows are durable registry. Runtime returns `308` only when the flattened target is the current canonical PUBLISHED Article. DRAFT/UNPUBLISHED/ARCHIVED/missing/noncanonical targets return not-found without a `Location` header; there is one redirect lookup plus one target Article load and no recursion.
- Structured data is omission-first. Implement exact Article and BreadcrumbList only; omit Institution schema and Opportunity Event in WP-13.
- Cache event payloads are server-generated. The browser never supplies paths/tags. Delivery validates the preserved previous path but recomputes current, related, and active historical source paths from DB state.
- Article changes create zero OpportunityChange, Notification, Delivery, Email, or other customer Product signal. Only `CACHE_REVALIDATION_REQUESTED` is allowed where public/cache behavior changes.
- Keep current public routes dynamically truthful; do not claim static/ISR performance. Do not add GA4, media library, social-image generation, scheduled publishing, revisions, generic CMS/SEO frameworks, or production configuration values.

## Design and PRD Traceability

| Contract | Implementation tasks | Fresh verification |
|---|---|---|
| `LOCK-001`, dependency floor/package boundary | 1 | Task 1 package checkpoint; Task 15 package/audit/build gate |
| `LOCK-002`, lifecycle/published atomic edit | 2–4, 6, 8 | lifecycle, stale-write, concurrency, browser tests in Tasks 4, 6, 14, 15 |
| `LOCK-003`, command ownership/root transaction | 2–6 | rollback tests plus direct-mutation scans in Tasks 3–6 and 15 |
| `LOCK-004`, versioned server sanitizer | 1, 3, 4, 7, 9 | adversarial unit, persisted preview, public historical-read tests |
| `LOCK-005`, unified internal link classifier | 1, 8, 9, 14 | same-origin public/private link regressions in Tasks 1, 9, 14, 15 |
| `LOCK-006`, bounded input/output | 1, 2, 6, 7, 12 | 128/192/16 KiB, relation, page, redirect-history bounds |
| `LOCK-007`, draft versus publish eligibility | 2–4, 8 | draft incompleteness and publication eligibility/state tests |
| `LOCK-008`, relation public-state boundary | 2–4, 7, 8 | relation state, atomic publish, rollback, browser tests |
| `LOCK-009`, transactional slug registry/flattening | 2, 5 | A→B→C, collision, concurrency, rollback tests |
| `LOCK-010`, previous/current canonical event paths | 2, 5, 12 | exact payload/parser and slug/cache endpoint tests |
| `LOCK-011`, sanitized public output and public redirect target | 5, 7, 9, 14 | nonpublic-target no-`Location`, republish, author/body leakage tests |
| `LOCK-012`, central indexability | 9–11 | Article matrix and Institution/Opportunity regression tests |
| `LOCK-013`, canonical metadata/robots/sitemap | 9–11 | metadata, sitemap, robots integration tests |
| `LOCK-014`, omission-first structured data/no Admin author | 7, 9, 10, 14 | no-author and insufficient-mapping omission tests |
| `LOCK-015`, dynamically truthful public routes | 5, 9–11 | render/redirect/not-found route tests and build inspection |
| `LOCK-016`, transactional cache intent/asynchronous network | 2, 4, 5, 12, 13 | rollback, no-network-in-transaction, settlement tests |
| `LOCK-017`, HMAC/replay boundary | 12, 13 | signature, clock, replay, retry, secret-leak tests |
| `LOCK-018`, trusted-state invalidation derivation | 2, 5, 12, 13 | forged-payload, history overflow, unpublish/republish tests |
| `FR-ADM-005`, Article Admin | 3–8 | Admin HTTP/read/UI/browser checks |
| `FR-PUB-005`, public Article | 9 | safe server-rendered Article and route integration tests |
| `FR-SEO-001`–`FR-SEO-003`, HTML/metadata/sitemap | 9–11 | focused public/SEO tests and build |
| `FR-SEO-004`, structured data | 10 | exact Article/Breadcrumb mapping; Institution/Event intentionally omitted because exact verified mappings are not locked |
| `FR-SEO-005`–`FR-SEO-008`, links/redirect/preview/sanitization | 1, 5, 7, 9, 12, 14 | adversarial link, redirect, preview, sanitizer, cache/browser tests |

## Planned File Structure

- `src/modules/editorial/article-links.server.ts`: one PREPPY/internal/external URL classifier.
- `src/modules/editorial/sanitizer.server.ts`: `sanitizeArticleHtmlV1`, meaningful-text extraction, bounds, and fingerprint.
- `src/modules/editorial/contracts.ts`: strict Article candidates, lifecycle results, limits, and state policy types.
- `src/modules/editorial/repository.server.ts`: Article/relations/slug/redirect persistence primitives requiring an injected executor.
- `src/modules/editorial/article-commands.server.ts`: all seven root-transaction commands.
- `src/modules/editorial/redirects.server.ts`: transactional flattening and nonrecursive runtime resolution.
- `src/modules/cache/**`: cache-event contract/config, HMAC client/handler, replay registry, and invalidation derivation.
- `src/modules/admin/http/article-commands.server.ts`: strict Article HTTP schemas/adapters.
- `src/modules/admin/read-model/article-query.server.ts`: Article list/detail/relation-option Admin projections without raw arbitrary rows.
- `app/admin/(protected)/articles/**` and `app/admin/_components/article-*.tsx`: Article list/editor/preview and explicit actions.
- `app/api/admin/articles/**`: seven thin mutation routes.
- `src/modules/public/**`, `app/(public)/**`, `app/sitemap.ts`, and `app/robots.ts`: sanitized public DTO, redirect resolution, metadata/indexability/JSON-LD, sitemap, and robots.
- `src/modules/outbox/**`, `src/modules/worker/**`, and `scripts/worker.ts`: typed cache event claim/dispatch/settlement without disturbing email events.
- `tests/unit/wp13-*.test.ts`, `tests/integration/wp13-*.test.ts`, and `tests/browser/wp13/**`: focused TDD, PostgreSQL/concurrency, security, and browser evidence.

---

### Task 1: Pin the approved dependencies and build the sanitizer/link security boundary

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/modules/editorial/article-links.server.ts`
- Create: `src/modules/editorial/sanitizer.server.ts`
- Create: `tests/unit/wp13-article-links.test.ts`
- Create: `tests/unit/wp13-sanitizer.test.ts`

**Interfaces:**
- Produces: `classifyArticleHref`, `sanitizeArticleHtmlV1`, `ARTICLE_SANITIZER_POLICY_VERSION`, meaningful text, and `sha256:` content fingerprint.
- Consumes: validated `APP_BASE_URL`, bounded UTF-8 HTML, `sanitize-html` server package, and Node `crypto`.
- Security boundary: this is the only Article HTML/anchor trust conversion; Tiptap output remains untrusted.

- [x] **Step 1: Write RED link-classifier tests for the unified same-origin rule**

Lock the discriminated return type and canonical slug grammar:

```ts
type ArticleHrefClassification =
  | { kind: "INTERNAL"; href: `/institutions/${string}` | `/opportunities/${string}` | `/articles/${string}` }
  | { kind: "EXTERNAL"; href: string }
  | { kind: "REJECT" };

expect(classifyArticleHref("/articles/foo", APP)).toEqual({
  kind: "INTERNAL",
  href: "/articles/foo",
});
expect(classifyArticleHref("https://preppy.example/articles/foo", APP)).toEqual({
  kind: "INTERNAL",
  href: "/articles/foo",
});
expect(classifyArticleHref("https://preppy.example/admin/users", APP)).toEqual({ kind: "REJECT" });
expect(classifyArticleHref("https://external.example/foo", APP)).toEqual({
  kind: "EXTERNAL",
  href: "https://external.example/foo",
});
```

Also reject `//evil`, `/\\evil`, credentials, controls, malformed percent encodings, encoded separators, queries/fragments on internal links, extra path segments, `/api`, `/auth`, `/admin`, `/onboarding`, `/my-preppy`, `javascript:`, `data:`, `vbscript:`, and `file:`.

- [x] **Step 2: Write RED sanitizer allowlist, URL, and size tests**

Assert the exact tags and attributes, idempotence, text extraction, fingerprint, 128 KiB input/output, and the July 2026 SVG/MathML raw-text bypass family:

```ts
const result = sanitizeArticleHtmlV1(
  `<p onclick="x()">Safe <a href="https://preppy.example/articles/foo" target="_blank">link</a></p>
   <svg><style><img src=x onerror=alert(1)></style></svg>`,
  { appBaseUrl: APP },
);
expect(result.html).toBe('<p>Safe <a href="/articles/foo">link</a></p>');
expect(sanitizeArticleHtmlV1(result.html, { appBaseUrl: APP }).html).toBe(result.html);
expect(result.fingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
```

Cover script/style/iframe/object/embed/form/input/button/video/audio/svg/math/img/table, comments, `on*`, class/id/style/data attributes, malformed nesting, unclosed tags, duplicate attributes, unsafe anchors, and external `_blank` normalization to exactly `rel="noopener noreferrer"`.

- [x] **Step 3: Run the two tests and verify RED**

Run:

```powershell
npm test -- tests/unit/wp13-article-links.test.ts tests/unit/wp13-sanitizer.test.ts
```

Expected: FAIL because packages/modules do not exist.

- [x] **Step 4: Install only the exact approved packages**

Run during implementation:

```powershell
npm install --save-exact @tiptap/react@3.30.3 @tiptap/pm@3.30.3 @tiptap/starter-kit@3.30.3 sanitize-html@2.17.7
npm install --save-dev --save-exact @types/sanitize-html@2.16.1
```

Then run:

```powershell
npm ls @tiptap/react @tiptap/pm @tiptap/starter-kit sanitize-html @types/sanitize-html
```

Expected: one Tiptap `3.30.3` family and `sanitize-html@2.17.7`; no unrelated manifest update.

- [x] **Step 5: Implement the URL classifier before sanitizer integration**

Use URL parsing, exact-origin comparison, and one internal path validator rather than prefix-only regexes:

```ts
export const ARTICLE_CANONICAL_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function classifyArticleHref(
  rawHref: string,
  appBaseUrl: string,
): ArticleHrefClassification;
```

Absolute same-origin URLs must have empty search/hash and pass `classifyInternalCanonicalPath`; return their root-relative canonical path. Different-origin URLs require `http:`/`https:`, no credentials, and canonical `URL.toString()` output. Do not decode and re-accept malformed/ambiguous path text.

- [x] **Step 6: Implement deterministic `sanitizeArticleHtmlV1`**

Export the exact result contract:

```ts
export const ARTICLE_SANITIZER_POLICY_VERSION = "v1" as const;
export const ARTICLE_HTML_MAX_BYTES = 128 * 1024;

export type SanitizedArticleHtml = Readonly<{
  html: string;
  text: string;
  nonWhitespaceCodePoints: number;
  fingerprint: `sha256:${string}`;
  policyVersion: "v1";
}>;

export function sanitizeArticleHtmlV1(
  input: string,
  options: Readonly<{ appBaseUrl: string }>,
): SanitizedArticleHtml;
```

Configure only `p,h2,h3,h4,strong,em,u,s,ul,ol,li,blockquote,pre,code,br,hr,a`; only anchors initially receive `href,target,rel`, then a transform uses `classifyArticleHref`. Unwrap/reduce unsafe anchors to safe text. Strip internal target/rel; permit only external `_blank` and force safe rel. Check UTF-8 byte length before and after, never truncate, normalize meaningful text deterministically, and hash the exact persisted HTML.

- [x] **Step 7: Run focused tests and checkpoint**

Run:

```powershell
npm test -- tests/unit/wp13-article-links.test.ts tests/unit/wp13-sanitizer.test.ts
npm run typecheck
git diff --check
git diff -- package.json package-lock.json
```

Expected: PASS; manifest diff contains only five approved packages; no client module imports `sanitize-html`.

### Task 2: Define strict Article/cache contracts and extend the safe Audit allowlist

**Files:**
- Create: `src/modules/editorial/contracts.ts`
- Modify: `src/modules/editorial/repository.server.ts`
- Create: `src/modules/cache/revalidation-contract.ts`
- Modify: `src/application/audit-writer.server.ts`
- Modify: `src/modules/admin/read-model/contracts.ts`
- Modify: `src/modules/admin/read-model/operations-query.server.ts`
- Modify: `src/modules/outbox/events.ts`
- Modify: `src/modules/outbox/transitions.server.ts`
- Create: `tests/unit/wp13-editorial-contracts.test.ts`
- Create: `tests/unit/wp13-cache-contracts.test.ts`
- Modify: `tests/unit/wp12a-outbox-contracts.test.ts`
- Create: `tests/integration/wp13-editorial-repository.test.ts`

**Interfaces:**
- Produces: bounded Article candidates/results, exact cache-event payload parser, `contentFingerprint` Audit metadata, and executor-scoped repository primitives.
- Consumes: existing schema enums/tables, `AuditWriter`, `OutboxWriter`, current Outbox claim lifecycle, and Task 1 limits.
- Downstream contract: Tasks 3–5 use these types/repository calls; Tasks 12–13 use the cache payload parser.

- [x] **Step 1: Write RED strict candidate and timestamp tests**

Define and test these exported shapes; parsers accept `unknown`, reject unknown/prototype-sensitive keys, normalize nullable strings, and never accept server-owned fields:

```ts
export type ArticleDraftCandidate = Readonly<{
  title: string;
  type: ArticleType;
  category: ArticleCategory;
  excerpt: string | null;
  contentHtml: string;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  robotsIndex: boolean;
  robotsFollow: boolean;
  featuredImageUrl: string | null;
  featuredImageAlt: string | null;
}>;

export type ArticlePublishCandidate = ArticleDraftCandidate & Readonly<{
  institutionIds: readonly string[];
  opportunityIds: readonly string[];
}>;

export type CreateArticleDraftInput = Readonly<{
  slug: string;
  title: string;
  type: ArticleType;
  category: ArticleCategory;
}>;

export type UpdateArticleDraftInput = Readonly<{
  articleId: string;
  expectedUpdatedAt: string;
  candidate: ArticleDraftCandidate;
}>;

export type SetArticleRelationsInput = Readonly<{
  articleId: string;
  expectedUpdatedAt: string;
  institutionIds: readonly string[];
  opportunityIds: readonly string[];
}>;

export type PublishArticleInput = Readonly<{
  articleId: string;
  expectedUpdatedAt: string;
  candidate: ArticlePublishCandidate;
}>;

export type ArticleLifecycleInput = Readonly<{
  articleId: string;
  expectedUpdatedAt: string;
}>;

export type ChangeArticleSlugInput = Readonly<{
  articleId: string;
  expectedUpdatedAt: string;
  newSlug: string;
}>;

export type ArticleCommandResult = Readonly<{
  articleId: string;
  status: ArticleStatus;
  updatedAt: string;
}>;

export type ArticleSlugChangeResult = ArticleCommandResult & Readonly<{
  previousCanonicalPath: `/articles/${string}`;
  currentCanonicalPath: `/articles/${string}`;
}>;
```

These command input types are the complete browser-owned contracts. Client `status`, `authorAdminId`, `publishedAt`, `unpublishedAt`, `archivedAt`, Audit fields, event fields, paths, and tags must fail parsing.

- [x] **Step 2: Write RED cache payload/parser tests including the required slug fields**

Lock the event and reasons:

```ts
export const CACHE_REVALIDATION_EVENT = "CACHE_REVALIDATION_REQUESTED" as const;
export type ArticleCacheReason =
  | "ARTICLE_PUBLISHED"
  | "ARTICLE_REPUBLISHED"
  | "ARTICLE_UNPUBLISHED"
  | "ARTICLE_ARCHIVED"
  | "ARTICLE_SLUG_CHANGED"
  | "ARTICLE_RELATIONS_CHANGED";

export type ArticleCacheRevalidationPayloadV1 = Readonly<{
  version: 1;
  articleId: string;
  reason: ArticleCacheReason;
  currentCanonicalPath: `/articles/${string}`;
  previousCanonicalPath?: `/articles/${string}`;
  relatedInstitutionIds: readonly string[];
  relatedOpportunityIds: readonly string[];
}>;
```

Require `previousCanonicalPath` exactly for `ARTICLE_SLUG_CHANGED` and forbid it for other reasons. Require sorted unique UUID arrays of at most 12 and exact canonical path shapes. Reject arbitrary paths, tags, PII, missing/extra keys, and wrong versions. At the Outbox contract/command boundary, require `eventType="CACHE_REVALIDATION_REQUESTED"`, `aggregateType="ARTICLE"`, and `aggregateId===payload.articleId`.

- [x] **Step 3: Run contract tests and verify RED**

Run:

```powershell
npm test -- tests/unit/wp13-editorial-contracts.test.ts tests/unit/wp13-cache-contracts.test.ts tests/unit/wp12a-outbox-contracts.test.ts
```

Expected: FAIL because the new contracts/event are absent.

- [x] **Step 4: Implement contracts and widen the closed Outbox registry to exactly three types**

Add `CACHE_REVALIDATION_REQUESTED` to `supportedOutboxEventTypes` and `OutboxEventPayloadMap`, delegating payload validation to `parseArticleCacheRevalidationPayload`. Replace the Outbox claim parser's hardcoded maximum of two event types with `supportedOutboxEventTypes.length`; update stale-lease recovery to include the cache event without changing the special unresolved-email-attempt branch.

```ts
expect(supportedOutboxEventTypes).toEqual([
  "OPPORTUNITY_CHANGE_PUBLISHED",
  "DELIVERY_EMAIL_SEND",
  "CACHE_REVALIDATION_REQUESTED",
]);
```

- [x] **Step 5: Extend Audit metadata with only a bounded fingerprint**

Add exactly:

```ts
contentFingerprint?: `sha256:${string}`;
```

to `AuditSafeMetadata`, the writer allowlist/clone validation, `AdminAuditMetadataDTO`, and the safe Operations projection. Require `/^sha256:[a-f0-9]{64}$/`. Do not add content HTML, title/excerpt body snapshots, arbitrary metadata, or raw before/after JSON.

- [x] **Step 6: Add executor-scoped repository primitives and RED integration tests**

Test that every write primitive requires `TransactionExecutor`, accepts the current schema without migration, and does no Audit/Outbox/network work itself. Implement focused functions:

```ts
findArticleById(executor, id)
findArticleForUpdate(executor, id)
insertArticleDraft(executor, values)
updateArticleRecord(executor, articleId, values)
loadArticleRelationIds(executor, articleId)
replaceArticleRelations(executor, articleId, institutionIds, opportunityIds)
requireRelationTargetsExist(executor, institutionIds, opportunityIds)
acquireArticleSlugRegistryLock(executor)
findArticleSlugOwner(executor, slug)
findRedirectBySourcePath(executor, sourcePath)
listRedirectSourcesByTarget(executor, targetPath, limit)
upsertFlattenedArticleRedirects(executor, sourcePath, targetPath, occurredAt)
```

Use stable ordering for relation inserts and UUID-order/one advisory lock for shared slug/redirect state. Do not expose a repository method that opens a transaction.

- [x] **Step 7: Run contract/repository checkpoints**

Run:

```powershell
npm test -- tests/unit/wp13-editorial-contracts.test.ts tests/unit/wp13-cache-contracts.test.ts tests/unit/wp12a-outbox-contracts.test.ts tests/integration/wp13-editorial-repository.test.ts --hookTimeout=60000 --no-file-parallelism
```

Expected: PASS; current migrations remain sufficient and Product-signal tables are untouched.

### Task 3: Implement draft creation, draft/unpublished save, and relation commands

**Files:**
- Create: `src/modules/editorial/article-commands.server.ts`
- Modify: `src/modules/editorial/repository.server.ts`
- Create: `tests/integration/wp13-article-draft-commands.test.ts`
- Create: `tests/integration/wp13-article-command-rollback.test.ts`

**Interfaces:**
- Produces: `createArticleDraft`, `updateArticleDraft`, and `setArticleRelations` root commands.
- Consumes: `AdminCommandContext`, `TransactionManager`, Task 1 sanitizer, Task 2 contracts/repository, and `AuditWriter`.
- State boundary: no command in this task makes an Article public or emits a cache/customer event.

- [x] **Step 1: Write RED minimal-create tests**

Use an ACTIVE Admin fixture and assert:

```ts
await createArticleDraft(context, {
  slug: "first-guide",
  title: "First guide",
  type: "GUIDE",
  category: "ADMISSIONS_GENERAL",
}, dependencies);
```

creates DRAFT with sanitized empty body, `robotsIndex=false`, `robotsFollow=true`, `authorAdminId=context.adminUserId`, null lifecycle timestamps, one Audit row, no raw HTML in Audit, and zero Outbox/OpportunityChange/Notification/Delivery. Duplicate current/redirect-source slug conflicts with zero writes.

- [x] **Step 2: Run create test and verify RED**

Run: `npm test -- tests/integration/wp13-article-draft-commands.test.ts --hookTimeout=60000 --no-file-parallelism`

Expected: FAIL because the command module does not exist.

- [x] **Step 3: Implement command dependency composition and create**

Keep a testable default dependency seam:

```ts
export type ArticleCommandDependencies = Readonly<{
  transactionManager: Pick<TransactionManager, "run">;
  appBaseUrl: string;
  sanitizeHtml?: typeof sanitizeArticleHtmlV1;
  writeAudit?: typeof AuditWriter.write;
  enqueueOutbox?: typeof OutboxWriter.enqueue;
}>;

export function createArticleDraft(
  context: AdminCommandContext,
  rawInput: unknown,
  dependencies: ArticleCommandDependencies,
): Promise<ArticleCommandResult>;
```

Parse before opening the root transaction when validation needs no DB; acquire slug advisory lock in the transaction; recheck current slug and redirect source; sanitize supplied/empty body; insert; Audit with fingerprint and canonical changed-field names; commit once.

- [x] **Step 4: Write RED update-state/stale/sanitization tests**

Cover DRAFT and UNPUBLISHED success; PUBLISHED/ARCHIVED rejection; exact ISO `expectedUpdatedAt`; unsafe HTML removed before persistence; canonical URL absent or exact self URL; URL/SEO/plain-text bounds; featured-image HTTP(S) only; client slug/author/status/timestamps rejected; `updatedAt` advances; author and slug remain unchanged.

- [x] **Step 5: Implement `updateArticleDraft` with row lock and exact stale check**

```ts
export function updateArticleDraft(
  context: AdminCommandContext,
  rawInput: unknown,
  dependencies: ArticleCommandDependencies,
): Promise<ArticleCommandResult>;
```

Inside one transaction: lock row, require DRAFT/UNPUBLISHED, compare `article.updatedAt.toISOString()` to expected token, sanitize, normalize self canonical, update only editorial fields, advance `updatedAt=context.occurredAt`, Audit fingerprint, commit. Mismatch throws `ConflictError`; invalid state throws `NotEligibleError`; both create zero writes.

- [x] **Step 6: Write RED relation replacement tests**

Cover sorted/deduped complete sets, max 12 each, canonical Institution/Opportunity IDs only, missing FK targets, DRAFT/UNPUBLISHED allowed, PUBLISHED/ARCHIVED forbidden, stale token, deterministic sort order, author/slug unchanged, and no cache/customer Outbox.

- [x] **Step 7: Implement `setArticleRelations` atomically**

```ts
export function setArticleRelations(
  context: AdminCommandContext,
  rawInput: unknown,
  dependencies: ArticleCommandDependencies,
): Promise<ArticleCommandResult>;
```

Lock Article, check state/timestamp, validate every target exists, replace both relation sets in one transaction, advance `updatedAt`, and write one Audit with safe `changedFields`. Never copy Institution/Opportunity truth into Article.

- [x] **Step 8: Prove root rollback and Product-signal zero**

Inject failing repository/Audit seams after Article/relation writes. Assert Article, relations, and Audit all revert. Count OpportunityChange, Notification, Delivery, and Outbox rows before/after every draft command; deltas must all be zero.

- [x] **Step 9: Run focused command tests and checkpoint**

Run:

```powershell
npm test -- tests/integration/wp13-article-draft-commands.test.ts tests/integration/wp13-article-command-rollback.test.ts --hookTimeout=60000 --no-file-parallelism
git diff --check
```

Expected: PASS with no direct HTTP/UI DB mutation introduced.

### Task 4: Implement atomic publish, published re-edit, unpublish, and archive

**Files:**
- Modify: `src/modules/editorial/article-commands.server.ts`
- Modify: `src/modules/editorial/repository.server.ts`
- Create: `tests/integration/wp13-article-publish.test.ts`
- Create: `tests/integration/wp13-article-concurrency.test.ts`

**Interfaces:**
- Produces: `publishArticle`, `unpublishArticle`, and `archiveArticle` with exact lifecycle timestamps and one cache event where public behavior changes.
- Consumes: Task 2 cache payload builder, Task 3 command dependencies, relation replacement, `AuditWriter`, and `OutboxWriter`.
- Public edit boundary: PUBLISHED candidate replacement exists only in `publishArticle`.

- [x] **Step 1: Write RED publication eligibility tests**

Require title, canonical slug, at least 40 non-whitespace Unicode text code points after sanitization, non-empty `seoDescription ?? excerpt`, self canonical or null, valid featured image, and existing bounded relations. Assert sanitization occurs again even if a draft already contains safe-looking HTML.

```ts
await expect(publishArticle(context, {
  articleId,
  expectedUpdatedAt,
  candidate: completeCandidate,
}, dependencies)).resolves.toMatchObject({ status: "PUBLISHED" });
```

- [x] **Step 2: Write RED state/timestamp tests for all publish forms**

Cover DRAFT→PUBLISHED, UNPUBLISHED→PUBLISHED, and PUBLISHED→PUBLISHED atomic content/SEO/relation edit. Assert `UpdateArticleDraft` and `SetArticleRelations` still reject PUBLISHED. First publish sets `publishedAt`; published edit preserves it; unpublish sets `unpublishedAt`; republish clears `unpublishedAt` and preserves first `publishedAt`; every success advances `updatedAt`.

- [x] **Step 3: Run publish tests and verify RED**

Run: `npm test -- tests/integration/wp13-article-publish.test.ts --hookTimeout=60000 --no-file-parallelism`

Expected: FAIL because lifecycle commands are absent.

- [x] **Step 4: Implement `publishArticle` as one complete candidate replacement**

```ts
export function publishArticle(
  context: AdminCommandContext,
  rawInput: unknown,
  dependencies: ArticleCommandDependencies,
): Promise<ArticleCommandResult>;
```

Lock row and compare timestamp; accept DRAFT/UNPUBLISHED/PUBLISHED only; reject candidate slug/author/state/timestamps; sanitize; enforce publication policy; validate/replace both relation sets; update all editorial fields/status/timestamps; write one fingerprint Audit; enqueue exactly one cache event with `aggregateType="ARTICLE"`, `aggregateId=articleId`, sorted current relation IDs, and `currentCanonicalPath`. Use reason `ARTICLE_PUBLISHED` for first publish and `ARTICLE_REPUBLISHED` for UNPUBLISHED→PUBLISHED. For PUBLISHED→PUBLISHED, compare locked current relation sets with the complete candidate: use `ARTICLE_RELATIONS_CHANGED` when either relation set differs, otherwise `ARTICLE_REPUBLISHED`. Content and relation changes still commit atomically in the same command and emit only that one event. Dedupe key is `CACHE_REVALIDATION_REQUESTED:{articleId}:{reason}:{context.correlationId}`.

- [x] **Step 5: Implement unpublish/archive transitions**

```ts
export function unpublishArticle(
  context: AdminCommandContext,
  rawInput: unknown,
  dependencies: ArticleCommandDependencies,
): Promise<ArticleCommandResult>;

export function archiveArticle(
  context: AdminCommandContext,
  rawInput: unknown,
  dependencies: ArticleCommandDependencies,
): Promise<ArticleCommandResult>;
```

Unpublish accepts only PUBLISHED, retains first `publishedAt`, sets `unpublishedAt`, advances `updatedAt`, Audits, and enqueues `ARTICLE_UNPUBLISHED`. Archive accepts DRAFT/UNPUBLISHED/PUBLISHED, sets ARCHIVED/`archivedAt`, advances `updatedAt`, and Audits. It enqueues `ARTICLE_ARCHIVED` only when the pre-transition status is PUBLISHED; DRAFT or UNPUBLISHED→ARCHIVED creates no new public cache event. Never delete Article/relations/redirect history. ARCHIVED is terminal.

- [x] **Step 6: Add concurrency and stale-write RED tests**

Run two independent clients with the same `expectedUpdatedAt` for published edits, publish/unpublish, and relation-changing publish. Exactly one commits; the other receives `ConflictError`; final body and both relation sets come entirely from one candidate. Repeat the race three times.

- [x] **Step 7: Add rollback, Audit, cache-event, and Product-signal assertions**

Inject relation/Audit/Outbox failure after earlier writes and assert full rollback. Successful publish/republish/published-edit Audits contain one safe content fingerprint; unpublish/archive Audits contain bounded changed fields and no HTML snapshot. Every public behavior change has one typed cache event/dedupe, no raw HTML enters Audit/Outbox, and OpportunityChange/Notification/Delivery/Email deltas stay zero. Assert PUBLISHED atomic edits with unchanged relation sets use `ARTICLE_REPUBLISHED`, while either changed relation set uses `ARTICLE_RELATIONS_CHANGED`; both cases emit exactly one cache event.

- [x] **Step 8: Run lifecycle/concurrency tests and checkpoint**

Run:

```powershell
npm test -- tests/integration/wp13-article-publish.test.ts tests/integration/wp13-article-concurrency.test.ts tests/integration/wp13-article-command-rollback.test.ts --hookTimeout=60000 --no-file-parallelism
```

Expected: PASS; PUBLISHED edit has exactly one application entry point.

### Task 5: Implement transactional slug flattening and public-state-gated redirect resolution

**Files:**
- Create: `src/modules/editorial/redirects.server.ts`
- Modify: `src/modules/editorial/article-commands.server.ts`
- Modify: `src/modules/editorial/repository.server.ts`
- Create: `tests/unit/wp13-redirect-policy.test.ts`
- Create: `tests/integration/wp13-article-slug.test.ts`
- Create: `tests/integration/wp13-redirect-runtime.test.ts`

**Interfaces:**
- Produces: `changeArticleSlug` and `resolveHistoricalArticleRedirect`.
- Consumes: stable advisory lock, current Article/redirect registries, Task 2 cache contract, and target Article publication state.
- Runtime contract: one exact redirect lookup plus one target Article load, no recursive/second redirect lookup.

- [x] **Step 1: Write RED pure path/redirect-policy tests**

Require exact `/articles/{canonical-slug}` source/target, source != target, no query/fragment/backslash/encoded separator/control, and the result union:

```ts
type HistoricalArticleRedirectResolution =
  | { kind: "REDIRECT"; targetPath: `/articles/${string}` }
  | { kind: "NOT_FOUND" };
```

Unknown/disabled redirect, unsafe target, current source path, and non-Article namespaces resolve NOT_FOUND.

- [x] **Step 2: Write RED slug transaction/flatten tests**

Cover never-published DRAFT A→B with no redirect; PUBLISHED A→B; then B→C producing exactly A→C and B→C; same-slug rejection; collision with current Article slug or redirect source; populated self `canonicalUrl` rewritten; `previousCanonicalPath` captured before mutation; one Audit and one `ARTICLE_SLUG_CHANGED` event; stale token; ARCHIVED rejection.

- [x] **Step 3: Write the REQUIRED nonpublic-target leak regression before implementation**

Use the exact scenario:

```text
publish A -> change A to B -> unpublish B -> change B to C
registry: A -> C, B -> C
runtime A/B while C UNPUBLISHED: NOT_FOUND, no target disclosure
republish C
runtime A/B: REDIRECT /articles/C
```

Also test DRAFT, ARCHIVED, missing, and noncanonical targets as NOT_FOUND; `robotsIndex=false` PUBLISHED remains a valid public redirect target.

- [x] **Step 4: Run slug/redirect tests and verify RED**

Run:

```powershell
npm test -- tests/unit/wp13-redirect-policy.test.ts tests/integration/wp13-article-slug.test.ts tests/integration/wp13-redirect-runtime.test.ts --hookTimeout=60000 --no-file-parallelism
```

Expected: FAIL because command/resolver do not exist.

- [x] **Step 5: Implement `changeArticleSlug` in one root transaction**

```ts
export function changeArticleSlug(
  context: AdminCommandContext,
  rawInput: unknown,
  dependencies: ArticleCommandDependencies,
): Promise<ArticleSlugChangeResult>;
```

Lock row then advisory namespace; check expected timestamp/state/collisions; capture old/current paths; update slug/self canonical/`updatedAt`; if `publishedAt !== null`, retarget every active `/articles/*` row whose target is old path directly to new path and upsert old→new as `308`; Audit; enqueue the required payload including both paths and current sorted relation IDs. Query 101 historical rows and reject over 100 rather than truncating. Roll back all changes on any conflict/failure.

- [x] **Step 6: Implement nonrecursive runtime target authorization**

```ts
export async function resolveHistoricalArticleRedirect(
  executor: DatabaseExecutor,
  sourcePath: string,
): Promise<HistoricalArticleRedirectResolution>;
```

Perform one `url_redirects` active-source lookup. Validate target shape, derive target slug, then load `articles` once by exact slug. Return REDIRECT only when the loaded row's reconstructed canonical path equals target and status is PUBLISHED. Do not query `url_redirects` for the target, recurse, or emit target details on failure.

- [x] **Step 7: Add concurrent namespace races and rollback tests**

Race different Articles for the same new slug/redirect source and race two slug changes on one Article. Exactly one outcome commits; no chain/loop/duplicate source remains. Inject redirect/Audit/Outbox failures and assert Article slug, canonical, all historical targets, Audit, and event fully roll back.

- [x] **Step 8: Run focused redirect tests and checkpoint**

Run:

```powershell
npm test -- tests/unit/wp13-redirect-policy.test.ts tests/integration/wp13-article-slug.test.ts tests/integration/wp13-redirect-runtime.test.ts tests/integration/wp13-article-concurrency.test.ts --hookTimeout=60000 --no-file-parallelism
```

Expected: PASS, including no `Location` disclosure for every nonpublic target state.

### Task 6: Add strict Admin Article command adapters and the 192 KiB request boundary

**Files:**
- Modify: `src/modules/admin/auth/security-json.server.ts`
- Modify: `src/modules/admin/http/command-handler.server.ts`
- Create: `src/modules/admin/http/article-commands.server.ts`
- Create: `app/api/admin/articles/route.ts`
- Create: `app/api/admin/articles/[articleId]/draft/route.ts`
- Create: `app/api/admin/articles/[articleId]/relations/route.ts`
- Create: `app/api/admin/articles/[articleId]/publish/route.ts`
- Create: `app/api/admin/articles/[articleId]/unpublish/route.ts`
- Create: `app/api/admin/articles/[articleId]/archive/route.ts`
- Create: `app/api/admin/articles/[articleId]/change-slug/route.ts`
- Create: `tests/unit/wp13-admin-article-http.test.ts`
- Create: `tests/integration/wp13-admin-article-http.test.ts`
- Modify: `tests/unit/wp11-security-json.test.ts`
- Modify: `tests/unit/wp11-admin-command-http.test.ts`

**Interfaces:**
- Produces: seven authenticated/Origin-checked/strict Article HTTP adapters plus a call-site-specific 192 KiB body/128 KiB decoded-string parser profile.
- Consumes: existing `runAdminCommandRequest`, Task 3–5 commands, server-generated `AdminCommandContext`, and safe error mapping.
- HTTP boundary: browser input never owns actor, state, timestamps other than expected token, sanitizer policy, fingerprint, redirect, Audit, Outbox, or cache paths.

- [x] **Step 1: Write RED configurable-body-limit tests on the shared handler**

Extend options with bounded call-site overrides while preserving the current 64 KiB body and 16 KiB decoded-string defaults:

```ts
export type RunAdminCommandRequestOptions<TPath, TBody, TResult> = Readonly<{
  request: Request;
  rawPath: unknown;
  pathSchema: ZodType<TPath>;
  bodySchema: ZodType<TBody>;
  reason: string | ((input: Readonly<{ path: TPath; body: TBody }>) => string);
  execute: (
    input: AdminCommandExecutionInput<TPath, TBody>,
  ) => Promise<TResult>;
  dependencies?: Partial<AdminCommandRequestDependencies>;
  maxBodyBytes?: number;
  maxStringBytes?: number;
}>;
```

Keep `parseSecurityJson` defaults unchanged. Add hard trusted-call-site ceilings of 192 KiB for `maxBytes` and 128 KiB for `maxStringBytes`; retain the existing depth 20, object-members 1,000, and array-items 1,000 ceilings. The generic default path must still reject a 16 KiB+1 decoded string. `runAdminCommandRequest` validates the pair before reading: ordinary routes remain 64 KiB/16 KiB, while Article adapters use exactly 192 KiB/128 KiB. No request field selects these limits.

Test `contentHtml` values at 127 KiB and exactly 128 KiB pass the JSON parser, while 128 KiB+1 is rejected even when the full body remains below 192 KiB. Also test 192 KiB+1 body, lying/invalid Content-Length, streamed overflow, invalid UTF-8, duplicate JSON members, and empty/non-JSON bodies fail before context/command. Assert a non-Article `/api/admin/**` route still rejects a 16 KiB+1 string and cannot inherit the Article profile.

- [x] **Step 2: Write RED strict route/body/ownership tests**

For every endpoint, assert execution order remains ACTIVE Admin→Origin→path→body→server context→one command. Test expected timestamp, complete publish candidate, relation arrays, and slug body. Reject unknown keys and client `adminUserId`, `authorAdminId`, `status`, lifecycle timestamps, `contentFingerprint`, `reason`, `eventType`, `currentCanonicalPath`, `previousCanonicalPath`, paths/tags, or duplicate body/path IDs.

- [x] **Step 3: Run HTTP tests and verify RED**

Run: `npm test -- tests/unit/wp13-admin-article-http.test.ts`

Expected: FAIL because the Article adapter/limit override is absent.

- [x] **Step 4: Implement strict schemas and thin command delegation**

Export handlers:

```ts
type ArticleHttpCommand = (
  context: AdminCommandContext,
  input: unknown,
) => Promise<ArticleCommandResult>;

type ArticleSlugHttpCommand = (
  context: AdminCommandContext,
  input: unknown,
) => Promise<ArticleSlugChangeResult>;

export type AdminArticleCommandRequestDependencies =
  Partial<AdminCommandRequestDependencies> & Readonly<{
    createArticleDraft?: ArticleHttpCommand;
    updateArticleDraft?: ArticleHttpCommand;
    setArticleRelations?: ArticleHttpCommand;
    publishArticle?: ArticleHttpCommand;
    unpublishArticle?: ArticleHttpCommand;
    archiveArticle?: ArticleHttpCommand;
    changeArticleSlug?: ArticleSlugHttpCommand;
  }>;

export function handleAdminCreateArticleRequest(
  request: Request,
  dependencies?: AdminArticleCommandRequestDependencies,
): Promise<Response>;

export function handleAdminUpdateArticleDraftRequest(
  request: Request,
  rawPath: unknown,
  dependencies?: AdminArticleCommandRequestDependencies,
): Promise<Response>;

export function handleAdminSetArticleRelationsRequest(
  request: Request,
  rawPath: unknown,
  dependencies?: AdminArticleCommandRequestDependencies,
): Promise<Response>;

export function handleAdminPublishArticleRequest(
  request: Request,
  rawPath: unknown,
  dependencies?: AdminArticleCommandRequestDependencies,
): Promise<Response>;

export function handleAdminUnpublishArticleRequest(
  request: Request,
  rawPath: unknown,
  dependencies?: AdminArticleCommandRequestDependencies,
): Promise<Response>;

export function handleAdminArchiveArticleRequest(
  request: Request,
  rawPath: unknown,
  dependencies?: AdminArticleCommandRequestDependencies,
): Promise<Response>;

export function handleAdminChangeArticleSlugRequest(
  request: Request,
  rawPath: unknown,
  dependencies?: AdminArticleCommandRequestDependencies,
): Promise<Response>;
```

Use `maxBodyBytes: 192 * 1024` and `maxStringBytes: 128 * 1024` only in these Article adapters, strict Zod schemas matching Task 2, and fixed server reasons `ARTICLE_CREATED`, `ARTICLE_DRAFT_UPDATED`, `ARTICLE_RELATIONS_UPDATED`, `ARTICLE_PUBLISHED`, `ARTICLE_UNPUBLISHED`, `ARTICLE_ARCHIVED`, and `ARTICLE_SLUG_CHANGED`. Route handlers only await params and delegate; no DB import.

- [x] **Step 5: Add integration auth/Origin/stale/rollback tests**

Assert Admin session is revalidated ACTIVE, consumer session cannot authorize, cross-origin fails, stale expected timestamp maps to `409` Korean reload guidance, ineligible lifecycle returns safe conflict/eligibility response, raw HTML never appears in response/error, and failed adapters create zero DB writes.

- [x] **Step 6: Run focused Admin tests and route-scope checkpoint**

Run:

```powershell
npm test -- tests/unit/wp13-admin-article-http.test.ts tests/integration/wp13-admin-article-http.test.ts tests/unit/wp11-security-json.test.ts tests/unit/wp11-admin-command-http.test.ts --hookTimeout=60000 --no-file-parallelism
rg -n "\.insert\(|\.update\(|\.delete\(|TransactionManager" app/api/admin/articles src/modules/admin/http/article-commands.server.ts
```

Expected: PASS; source scan shows only command delegation, not direct mutation.

### Task 7: Add bounded Admin Article detail and relation-option projections

**Files:**
- Modify: `src/modules/admin/read-model/contracts.ts`
- Modify: `src/modules/admin/read-model/input.ts`
- Modify: `src/modules/admin/read-model/article-query.server.ts`
- Create: `app/_components/article-prose.tsx`
- Modify: `app/admin/(protected)/articles/page.tsx`
- Create: `app/admin/(protected)/articles/new/page.tsx`
- Create: `app/admin/(protected)/articles/[articleId]/page.tsx`
- Create: `app/admin/(protected)/articles/[articleId]/preview/page.tsx`
- Create: `tests/integration/wp13-admin-article-read.test.ts`
- Create: `tests/unit/wp13-admin-article-pages.test.ts`

**Interfaces:**
- Produces: `AdminArticleDetailDTO.sanitizedContentHtml`, bounded relation option DTOs, editable page data, and persisted sanitized preview data.
- Consumes: Task 1 sanitizer for preview, existing Admin server page guard/layout, Article/relations, and canonical Institution/Opportunity identities.
- Privacy boundary: database `content_html` is an explicitly unsafe server-only storage value. It must pass `sanitizeArticleHtmlV1` before entering the Admin detail DTO, Visual Editor, Source Editor, preview, or any browser prop. Public Admin identity and raw arbitrary DB JSON are not projected.

- [x] **Step 1: Write RED read-projection and bound tests**

Lock DTO fields to current schema plus relation IDs and `updatedAt`; include only `sanitizedContentHtml` in Admin detail, never raw `contentHtml`, and include neither field in the list DTO. Add strict query inputs `{ query?, page, pageSize }` with page size ≤50 for relation options and return at most 100 selectable canonical targets across two pages. Verify stable title/name+ID ordering, no legacy IDs, no Source/Evidence/customer PII, and read-only execution.

Use these exact projection contracts:

```ts
export type ArticleRelationOptionDTO = Readonly<{
  id: string;
  slug: string;
  label: string;
}>;

export type AdminArticleDetailDTO = AdminArticleDTO & Readonly<{
  excerpt: string | null;
  sanitizedContentHtml: string;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  robotsIndex: boolean;
  robotsFollow: boolean;
  featuredImageUrl: string | null;
  featuredImageAlt: string | null;
  institutionIds: readonly string[];
  opportunityIds: readonly string[];
  updatedAt: string;
}>;
```

- [x] **Step 2: Write RED preview safety and author-privacy tests**

Seed historical unsafe HTML containing `<script>`, event attributes, and a `javascript:` link plus an Admin `displayName`. `getAdminArticleDetail`, the rendered edit-page Client props, Source Editor initial value, Visual Editor initial value, and preview must contain only the `sanitizeArticleHtmlV1` result. Assert serialized edit-page props/source contain no script, `onclick`, or `javascript:` text. Preview uses the private/no-store/noindex Admin shell. Internal editing ownership may appear only in an Admin-specific non-author field if operationally needed; it must never become a public author.

- [x] **Step 3: Run read/page tests and verify RED**

Run:

```powershell
npm test -- tests/integration/wp13-admin-article-read.test.ts tests/unit/wp13-admin-article-pages.test.ts --hookTimeout=60000 --no-file-parallelism
```

Expected: FAIL because detail/preview routes and DTOs are absent.

- [x] **Step 4: Implement detail and bounded relation-option queries**

Export:

```ts
export function getAdminArticleDetail(
  executor: DatabaseExecutor,
  articleId: string,
  appBaseUrl: string,
): Promise<AdminArticleDetailDTO | null>;

export function listAdminArticleInstitutionOptions(
  executor: DatabaseExecutor,
  rawInput: unknown,
): Promise<AdminPageDTO<ArticleRelationOptionDTO>>;

export function listAdminArticleOpportunityOptions(
  executor: DatabaseExecutor,
  rawInput: unknown,
): Promise<AdminPageDTO<ArticleRelationOptionDTO>>;
```

Load `content_html` only into a locally named `unsafeStoredContentHtml` server projection, immediately run `sanitizeArticleHtmlV1(unsafeStoredContentHtml, { appBaseUrl })`, and place only `.html` in `AdminArticleDetailDTO.sanitizedContentHtml`. Return exact current relation order/IDs and one ISO `updatedAt` token. Queries use explicit selects, stable order, and fixed page sizes; they do not mutate or open transactions. Raw historical HTML never crosses the query-to-DTO conversion.

- [x] **Step 5: Create protected server pages and navigation**

Make list titles link to `/admin/articles/{id}` and add “New Article.” New/detail pages load only server projections and pass `sanitizedContentHtml` plus other serializable initial values/options to the editor Client Component added in Task 8. Preview consumes that sanitized DTO value and renders `ArticleProse` from an explicit `{ sanitizedContentHtml: string }` prop inside Admin layout. `ArticleProse` contains the single reviewed Article-body `dangerouslySetInnerHTML` sink and accepts no raw/storage DTO. Preview emits noindex/no-store. Do not create a public draft route or preview token.

```tsx
export function ArticleProse({
  sanitizedContentHtml,
}: Readonly<{ sanitizedContentHtml: string }>) {
  return (
    <div
      className="article-prose"
      dangerouslySetInnerHTML={{ __html: sanitizedContentHtml }}
    />
  );
}
```

- [x] **Step 6: Run focused read/page tests and checkpoint**

Run:

```powershell
npm test -- tests/integration/wp13-admin-article-read.test.ts tests/unit/wp13-admin-article-pages.test.ts tests/integration/wp11-admin-read-model.test.ts --hookTimeout=60000 --no-file-parallelism
```

Expected: PASS; list/detail/preview remain protected and bounded.

### Task 8: Build the Admin Tiptap visual/source editor and explicit lifecycle controls

**Files:**
- Create: `app/admin/_components/article-editor.tsx`
- Create: `app/admin/_components/article-editor-toolbar.tsx`
- Create: `app/admin/_components/article-relations.tsx`
- Create: `app/admin/_components/article-lifecycle-actions.tsx`
- Modify: `app/admin/(protected)/articles/new/page.tsx`
- Modify: `app/admin/(protected)/articles/[articleId]/page.tsx`
- Modify: `app/admin/admin.css`
- Create: `tests/unit/wp13-admin-article-ui.test.ts`
- Create: `tests/browser/wp13/article-editor-scenarios.md`

**Interfaces:**
- Produces: Admin-only Client Components for explicit create/save/publish/unpublish/archive/slug/relation workflows.
- Consumes: Task 6 HTTP envelopes, Task 7 serializable DTOs/options, Tiptap StarterKit 3.30.3, and current Admin visual tokens.
- UI boundary: the editor produces an untrusted HTML candidate; no browser sanitization or raw iframe is authoritative.

- [x] **Step 1: Load the required UI skills before production UI edits**

During implementation, read and follow `frontend-design` before creating the editor components. Preserve the current dense operational Admin language rather than introducing a generic dashboard template.

- [x] **Step 2: Write RED static/UI contract tests**

Assert the editor module is a Client Component, imports only `@tiptap/react` and `@tiptap/starter-kit` from the approved editor surface, and public modules do not import Tiptap. Lock toolbar actions to paragraph, h2/h3/h4, bold, italic, underline, strike, bullet/ordered list, blockquote, code/code-block, horizontal rule, link, undo, and redo. Assert no h1/image/table/media/collaboration/autosave command.

```ts
expect(editorSource).toContain('"use client"');
expect(editorSource).toContain('StarterKit.configure');
expect(editorSource).not.toMatch(/extension-image|extension-table|Collaboration/);
```

- [x] **Step 3: Write RED form ownership and mode tests**

The form must submit only approved candidates/expected timestamp; not actor, author, state, lifecycle time, Audit/Event/path/tag fields. Its initial browser value is named `initialSanitizedContentHtml` and comes only from Task 7's sanitized DTO. Visual→Source uses `editor.getHTML()`. Source→Visual uses `editor.commands.setContent(sourceHtml, { emitUpdate: true })` for editing convenience and displays that the server may remove unsafe markup. Source mode is a sanitized-compatible editing surface, never a raw DB forensic viewer. Preview link is disabled until persisted.

- [x] **Step 4: Run UI tests and verify RED**

Run: `npm test -- tests/unit/wp13-admin-article-ui.test.ts`

Expected: FAIL because editor components do not exist.

- [x] **Step 5: Implement the Admin-only Tiptap editor**

Configure StarterKit's included Link/Underline; do not import separate extension packages. Disable link click-through while editing, expose insert/edit/remove controls, and keep a single controlled candidate string across modes. Source mode is a labeled textarea; do not render source via `dangerouslySetInnerHTML` or iframe.

```tsx
const editor = useEditor({
  extensions: [
    StarterKit.configure({
      heading: { levels: [2, 3, 4] },
      link: { openOnClick: false, autolink: false },
    }),
  ],
  content: initialSanitizedContentHtml,
  immediatelyRender: false,
});
```

- [x] **Step 6: Implement explicit action flows without policy inference**

New submits POST create then navigates to the returned ID. DRAFT/UNPUBLISHED show Save Draft and Relations controls. PUBLISHED hides/disables draft save and uses Publish Changes to send the full candidate plus complete relations to `publish`; Unpublish must be explicit before draft saving. Slug change is a separate form with warning. Archive uses confirmation. On `409`, show the approved Korean stale message and reload latest server state; never auto-merge/retry.

- [x] **Step 7: Add accessible responsive styling**

Use labelled controls, visible focus, status text beyond color, error summaries, keyboard-usable toolbar buttons, accessible confirmation dialogs, and tablet/mobile stacking. Keep editor chrome in `admin.css`; keep future public prose styles in `globals.css` so Admin changes do not alter public content.

- [x] **Step 8: Run focused UI/build import checks**

Run:

```powershell
npm test -- tests/unit/wp13-admin-article-ui.test.ts tests/unit/wp13-admin-article-pages.test.ts
npm run typecheck
rg -n "@tiptap" app src
```

Expected: PASS; Tiptap imports exist only in Admin Client Components.

### Task 9: Replace the public placeholder with a sanitized DTO/body and public-state-gated route resolution

**Files:**
- Modify: `src/modules/public/dto.ts`
- Modify: `src/modules/public/article-detail.server.ts`
- Modify: `src/modules/public/article-query.server.ts`
- Create: `src/modules/public/article-page.server.ts`
- Modify: `app/_lib/public-article.ts`
- Modify: `app/_components/opportunity-article-pages.tsx`
- Reuse: `app/_components/article-prose.tsx`
- Modify: `app/(public)/articles/[slug]/page.tsx`
- Modify: `app/globals.css`
- Modify: `tests/integration/wp06a-home-article-query.test.ts`
- Create: `tests/unit/wp13-public-article.test.ts`
- Create: `tests/integration/wp13-public-article.test.ts`

**Interfaces:**
- Produces: `PublicArticleDTO.sanitizedContentHtml`, reusable safe prose rendering, and page resolution `{ ARTICLE | REDIRECT | NOT_FOUND }`.
- Consumes: Task 1 sanitizer, Task 5 redirect resolver, public Article/related queries, `notFound`, and `permanentRedirect`.
- Privacy/security boundary: no raw/stored HTML or internal Admin display name reaches a public component.

- [x] **Step 1: Write RED DTO/query tests for author and unsafe-field removal**

Seed an Article with unsafe historical HTML and `author_admin_id` pointing to an Admin with `displayName="Internal Operator"`. Assert the storage projection remains explicitly unsafe and server-only, while the public DTO has exactly `sanitizedContentHtml`, contains no `unsafeStoredContentHtml`, `contentHtml`, `authorDisplayName`, or `authorAdminId`, and JSON serialization cannot find the internal name.

- [x] **Step 2: Write RED public body and redirect-state tests**

Assert server HTML contains allowed prose/links and no script/event/unsafe href/iframe/SVG/MathML. Assert current PUBLISHED slug renders; DRAFT/UNPUBLISHED/ARCHIVED current slug notFound; historical source redirects only when Task 5 resolver returns a PUBLISHED target; nonpublic historical target produces notFound and no `Location`.

- [x] **Step 3: Run public tests and verify RED**

Run:

```powershell
npm test -- tests/unit/wp13-public-article.test.ts tests/integration/wp13-public-article.test.ts
```

Expected: FAIL because public body/route resolution are absent.

- [x] **Step 4: Remove the public Admin join and expose only safe DTO fields**

Delete `adminUsers` from the public Article query and `authorDisplayName` from `PublicArticleDTO`, `toPublicArticleDTO`, and Article view. Convert only through:

```ts
export function toPublicArticleDTO(
  stored: UnsafeStoredArticleDetailDTO,
  appBaseUrl: string,
): PublicArticleDTO {
  const sanitized = sanitizeArticleHtmlV1(stored.unsafeStoredContentHtml, { appBaseUrl });
  return {
    id: stored.id,
    slug: stored.slug,
    title: stored.title,
    excerpt: stored.excerpt,
    articleType: stored.articleType,
    category: stored.category,
    publishedAt: stored.publishedAt,
    featuredImageUrl: stored.featuredImageUrl,
    featuredImageAlt: stored.featuredImageAlt,
    indexability: stored.indexability,
    updatedAt: stored.updatedAt,
    seoTitle: stored.seoTitle,
    seoDescription: stored.seoDescription,
    canonicalUrl: stored.canonicalUrl,
    robotsIndex: stored.robotsIndex,
    robotsFollow: stored.robotsFollow,
    relatedInstitutions: stored.relatedInstitutions,
    relatedOpportunities: stored.relatedOpportunities,
    sanitizedContentHtml: sanitized.html,
  };
}
```

Keep the unsafe value server-only and short-lived; do not expose both raw and safe variants.

- [x] **Step 5: Reuse and style the safe Article prose rendering boundary**

`ArticleProse` accepts only `{ sanitizedContentHtml: string }` from the server-owned public DTO and remains the only reviewed `dangerouslySetInnerHTML` call for Article body. Reuse the component created in Task 7, add public typography for the exact allowlisted elements, and do not import Tiptap or sanitizer into a Client Component.

- [x] **Step 6: Implement one page-resolution helper and route switch**

```ts
export type ArticlePageResolution =
  | { kind: "ARTICLE"; article: PublicArticleDTO }
  | { kind: "REDIRECT"; targetPath: `/articles/${string}` }
  | { kind: "NOT_FOUND" };

export function resolvePublicArticlePage(
  executor: DatabaseExecutor,
  slug: string,
  appBaseUrl: string,
): Promise<ArticlePageResolution>;
```

Validate decoded slug first. Query current PUBLISHED Article; if absent, call Task 5 resolver. Route switches to render, `permanentRedirect(targetPath)`, or `notFound()`. Never catch/translate a nonpublic target into a `Location` response.

- [x] **Step 7: Run public regressions and checkpoint**

Run:

```powershell
npm test -- tests/unit/wp13-public-article.test.ts tests/integration/wp13-public-article.test.ts tests/integration/wp06a-home-article-query.test.ts tests/unit/wp07-detail-pages.test.ts --hookTimeout=60000 --no-file-parallelism
rg -n "authorDisplayName|unsafeStoredContentHtml|dangerouslySetInnerHTML|@tiptap" app src/modules/public
```

Expected: PASS; unsafe stored HTML exists only in server storage projection/conversion, one reviewed public body sink receives sanitized DTO, and no public author leak remains.

### Task 10: Complete central indexability, metadata, and omission-first JSON-LD

**Files:**
- Modify: `src/modules/public/indexability.ts`
- Create: `src/modules/public/seo.ts`
- Create: `app/_components/json-ld.tsx`
- Modify: `app/layout.tsx`
- Modify: `app/(public)/layout.tsx`
- Modify: `app/(public)/page.tsx`
- Modify: `app/(public)/institutions/page.tsx`
- Modify: `app/(public)/institutions/[slug]/page.tsx`
- Modify: `app/(public)/opportunities/[slug]/page.tsx`
- Modify: `app/(public)/articles/[slug]/page.tsx`
- Create: `tests/unit/wp13-indexability.test.ts`
- Create: `tests/unit/wp13-metadata.test.ts`
- Create: `tests/unit/wp13-structured-data.test.ts`

**Interfaces:**
- Produces: one Article-aware `getIndexability`, pure metadata builders, exact Article/Breadcrumb JSON-LD, and safe serializer.
- Consumes: canonical public DTOs, validated `APP_BASE_URL`, meaningful sanitized-body result, and Next Metadata types.
- SEO boundary: public and indexable remain separate; metadata/sitemap/JSON-LD do not independently invent eligibility.

- [x] **Step 1: Write RED Article indexability matrix tests**

Extend Article input with `hasMeaningfulSanitizedBody` and `hasDescription`. Lock:

```text
non-PUBLISHED -> NOT_PUBLIC
PUBLISHED + robotsIndex=false -> NOINDEX
PUBLISHED + missing canonical/body/description -> NOINDEX
PUBLISHED + all requirements -> INDEX
```

Preserve every current Institution/Opportunity matrix case byte-for-behavior; do not weaken verified-truth/evidence rules.

- [x] **Step 2: Write RED metadata/canonical tests for all public surfaces**

Cover home, Institution base/filtered list, Institution detail, Opportunity detail, and Article detail. Filter/search variants are `noindex,follow` with canonical `/institutions`; detail canonicals strip query/tracking. Article uses `seoTitle ?? title`, `seoDescription ?? excerpt`, exact self canonical, safe optional OG image, and central robots decision. Private/Admin/API metadata is never reused.

- [x] **Step 3: Write RED structured-data omission tests**

Lock exact Article fields and no author:

```ts
expect(articleJsonLd).toMatchObject({
  "@context": "https://schema.org",
  "@type": "Article",
  headline: article.title,
  mainEntityOfPage: canonical,
  datePublished: article.publishedAt,
  dateModified: article.updatedAt,
});
expect(articleJsonLd).not.toHaveProperty("author");
```

Admin display name presence must not change output. Missing description/date/canonical/body returns null. Breadcrumb contains only Home and current Article—never invented `/articles`. Institution JSON-LD and Opportunity Event builders do not exist/return null. Serializer replaces `<` with `\u003c` and never interpolates raw HTML.

- [x] **Step 4: Run SEO tests and verify RED**

Run:

```powershell
npm test -- tests/unit/wp13-indexability.test.ts tests/unit/wp13-metadata.test.ts tests/unit/wp13-structured-data.test.ts
```

Expected: FAIL because central Article policy/metadata builders are incomplete.

- [x] **Step 5: Implement pure SEO builders and root metadataBase**

Add validated `metadataBase = new URL(APP_BASE_URL)` at the neutral root. Export these exact pure contracts:

```ts
export type ArticleJsonLd = Readonly<{
  "@context": "https://schema.org";
  "@type": "Article";
  headline: string;
  description: string;
  mainEntityOfPage: string;
  datePublished: string;
  dateModified: string;
  image?: string;
}>;

export type ArticleBreadcrumbJsonLd = Readonly<{
  "@context": "https://schema.org";
  "@type": "BreadcrumbList";
  itemListElement: readonly [
    Readonly<{
      "@type": "ListItem";
      position: 1;
      name: "Home";
      item: string;
    }>,
    Readonly<{
      "@type": "ListItem";
      position: 2;
      name: string;
      item: string;
    }>,
  ];
}>;

export function buildHomeMetadata(appBaseUrl: string): Metadata;
export function buildInstitutionListMetadata(
  appBaseUrl: string,
  hasFilters: boolean,
): Metadata;
export function buildInstitutionMetadata(
  dto: InstitutionDetailDTO,
  appBaseUrl: string,
): Metadata;
export function buildOpportunityMetadata(
  dto: PublicOpportunityDTO,
  appBaseUrl: string,
): Metadata;
export function buildArticleMetadata(
  dto: PublicArticleDTO,
  appBaseUrl: string,
): Metadata;
export function buildArticleJsonLd(
  dto: PublicArticleDTO,
  appBaseUrl: string,
): ArticleJsonLd | null;
export function buildArticleBreadcrumbJsonLd(
  dto: PublicArticleDTO,
  appBaseUrl: string,
): ArticleBreadcrumbJsonLd | null;
export function serializeJsonLd(
  value: ArticleJsonLd | ArticleBreadcrumbJsonLd,
): string;
```

Builders consume central indexability and canonical DTOs; they do not query DB. Add `generateMetadata` to pages using the same projection/resolution contract as rendering. Historical redirect/nonpublic resolution yields no leaked metadata.

- [x] **Step 6: Render only exact JSON-LD and verify no author path**

Render Article/Breadcrumb scripts only for INDEX Article with complete exact mappings. Use the safe serializer in a server component. Do not add Organization/EducationalOrganization or Event JSON-LD in any page.

- [x] **Step 7: Run SEO/public regression checkpoint**

Run:

```powershell
npm test -- tests/unit/wp13-indexability.test.ts tests/unit/wp13-metadata.test.ts tests/unit/wp13-structured-data.test.ts tests/unit/wp06a-public-contract.test.ts tests/unit/wp07-institution-pages.test.ts tests/unit/wp07-detail-pages.test.ts
npm run typecheck
```

Expected: PASS; current Institution/Opportunity eligibility remains unchanged.

### Task 11: Add one INDEX-only sitemap and robots metadata route

**Files:**
- Create: `src/modules/public/sitemap-query.server.ts`
- Create: `app/sitemap.ts`
- Create: `app/robots.ts`
- Create: `tests/integration/wp13-sitemap.test.ts`
- Create: `tests/unit/wp13-robots.test.ts`

**Interfaces:**
- Produces: one bounded sitemap projection and one robots policy.
- Consumes: central `getIndexability`, canonical public data, redirect-source registry, semantic timestamps, and validated app origin.
- Inclusion boundary: public + INDEX + canonical + non-redirect only.

- [x] **Step 1: Write RED sitemap inclusion/exclusion tests**

Seed INDEX/NOINDEX/NOT_PUBLIC Institution, Opportunity, and Article rows plus redirect sources. Include historical Article bodies whose raw markup is non-empty but sanitizes to no meaningful text, and unsafe historical markup that sanitizes to meaningful safe text. Assert `/`, `/institutions`, and INDEX canonical details only. Exclude filters, noindex, drafts/unpublished/archived, redirect sources, Admin/auth/API/private routes, and Articles whose sanitized body is not meaningful. Article `lastModified` uses command-owned `updatedAt`; other entities use only their existing verified meaningful timestamps and omit lastModified when unavailable.

- [x] **Step 2: Write RED robots tests**

Assert one sitemap URL and disallow prefixes `/admin/`, `/auth/`, `/api/`, `/onboarding`, and `/my-preppy`; robots never claims access control and does not replace page-level noindex.

- [x] **Step 3: Run sitemap/robots tests and verify RED**

Run:

```powershell
npm test -- tests/integration/wp13-sitemap.test.ts tests/unit/wp13-robots.test.ts --hookTimeout=60000 --no-file-parallelism
```

Expected: FAIL because routes/queries do not exist.

- [x] **Step 4: Implement cursor/batch-safe sitemap projection**

Create explicit selects and stable ID cursors. Institution and Opportunity candidates do not load content bodies. Article candidates use a fixed maximum batch size of 50 and select `content_html` into a server-only `unsafeStoredContentHtml` field solely to run `sanitizeArticleHtmlV1` and calculate `hasMeaningfulSanitizedBody`; pass that result plus description/canonical/publication fields into the same central `getIndexability`. Discard the unsafe value and sanitizer result after eligibility projection—neither raw nor sanitized body enters the sitemap DTO or `MetadataRoute.Sitemap` result. Never load Article bodies unboundedly. Exclude any canonical path present as active `url_redirects.source_path` and return entries only after full eligibility.

- [x] **Step 5: Implement `app/sitemap.ts` and `app/robots.ts`**

Use validated `APP_BASE_URL` and exactly one exported metadata route each. Do not create sitemap indexes or hundreds of per-entity sitemaps. Keep routes server-only and avoid Admin/session dependencies.

- [x] **Step 6: Run sitemap/robots checkpoint**

Run:

```powershell
npm test -- tests/integration/wp13-sitemap.test.ts tests/unit/wp13-robots.test.ts tests/unit/wp13-indexability.test.ts --hookTimeout=60000 --no-file-parallelism
```

Expected: PASS with no redirect-source/private leakage.

### Task 12: Implement the HMAC internal revalidation endpoint with server-derived paths

**Files:**
- Modify: `.env.example`
- Create: `src/modules/cache/config.server.ts`
- Create: `src/modules/cache/replay.server.ts`
- Create: `src/modules/cache/revalidation-handler.server.ts`
- Create: `app/api/internal/cache/revalidate/route.ts`
- Create: `tests/unit/wp13-cache-config.test.ts`
- Create: `tests/unit/wp13-cache-security.test.ts`
- Create: `tests/integration/wp13-cache-revalidation.test.ts`

**Interfaces:**
- Produces: strict internal request authentication, bounded process-local replay rejection, DB-derived invalidation set, and injectable Next revalidation calls.
- Consumes: Task 2 payload parser, existing duplicate-member-rejecting `parseSecurityJson`, current Article/relations/redirect rows, Node HMAC/timing-safe crypto, `revalidatePath`, and explicit-profile `revalidateTag`.
- Trust boundary: no Admin/consumer cookie, query secret, client path, client tag, or payload current/related path is authoritative.

- [x] **Step 1: Write RED config and canonical-signature tests**

Add only a non-secret placeholder:

```dotenv
CACHE_REVALIDATION_SECRET=replace-with-cache-revalidation-secret-minimum-32-bytes
```

Config requires at least 32 UTF-8 bytes and distinctness from session/OIDC/consumer/webhook secrets when present. Lock headers and canonical input:

```text
x-preppy-revalidation-timestamp
x-preppy-revalidation-event-id
x-preppy-revalidation-signature: v1=<64 lowercase hex>

v1\n{timestamp}\n{eventId}\n{sha256(rawBody)}
```

Test exact raw bytes, not reserialized JSON; timing-safe comparison; ±300-second boundary; malformed/multiple headers; wrong event ID; wrong version/hex; invalid UTF-8; non-JSON/duplicate members; empty/16 KiB+1 body.

- [x] **Step 2: Write RED replay tests**

Lock a singleton bounded process-local registry keyed by signature+timestamp digest with maximum 10,000 entries and expiration at the 300-second window. Same signed request is rejected once consumed; a Worker retry with same event ID/body but fresh timestamp/signature is accepted. Eviction/clock behavior is deterministic under injected `now`.

- [x] **Step 3: Write RED server-derived path tests including all history**

Supply a valid signed payload with forged current/related IDs and assert handler ignores those for invalidation derivation after shape validation. Instrument the transaction manager and Next-call fakes to require `BEGIN -> DB reads/path+tag derivation -> COMMIT -> revalidatePath/revalidateTag`; fail the test if either Next API runs while the read transaction is active. DB current Article/relations determine:

```text
/articles/{current}
/institutions/{current-related-slugs}
/opportunities/{current-related-slugs}
/
/sitemap.xml
validated previousCanonicalPath for slug event
every active /articles/{old} source directly targeting current, max 100
```

The 101st history row fails closed rather than truncating. Reject inactive/unsafe/non-Article history rows. Test unpublish/republish events invalidate historical source paths so cached 404/308 state can change safely.

Derive exactly these tag shapes from trusted UUIDs and invalidate each with the explicit `"max"` profile:

```text
article:{articleId}
institution:{current-related-institution-id}
opportunity:{current-related-opportunity-id}
seo:sitemap
```

- [x] **Step 4: Run cache endpoint tests and verify RED**

Run:

```powershell
npm test -- tests/unit/wp13-cache-config.test.ts tests/unit/wp13-cache-security.test.ts tests/integration/wp13-cache-revalidation.test.ts --hookTimeout=60000 --no-file-parallelism
```

Expected: FAIL because cache security modules/route do not exist.

- [x] **Step 5: Implement bounded raw-body/HMAC/replay handling**

Read stream into a 16 KiB buffer, fatal-decode, parse with `parseSecurityJson`, strictly parse the body as exactly `ArticleCacheRevalidationPayloadV1`, authenticate raw-body hash before DB work, then consume replay key. Return generic JSON errors with no secret/body/path leakage. Do not accept GET or cookies.

```ts
export type CacheRevalidationConfig = Readonly<{
  secret: string;
  maxClockSkewSeconds: 300;
}>;

export type CacheReplayConsumeResult =
  | "ACCEPTED"
  | "REPLAY"
  | "CAPACITY_EXCEEDED";

export interface CacheReplayRegistry {
  consume(input: Readonly<{
    key: string;
    now: Date;
    expiresAt: Date;
  }>): CacheReplayConsumeResult;
}

export async function handleCacheRevalidationRequest(
  request: Request,
  dependencies?: Partial<CacheRevalidationHandlerDependencies>,
): Promise<Response>;

export type CacheRevalidationHandlerDependencies = Readonly<{
  getConfig: () => CacheRevalidationConfig;
  now: () => Date;
  transactionManager: Pick<TransactionManager, "run">;
  replayRegistry: CacheReplayRegistry;
  revalidatePath: (path: string) => void;
  revalidateTag: (tag: string, profile: "max") => void;
}>;
```

- [x] **Step 6: Implement DB-derived invalidation and injected Next calls**

Inside one read-only root transaction, reload Article and relations by IDs, load their canonical slugs/public state, recompute the current Article path regardless of payload current path, query `url_redirects` by exact current target with limit 101, validate each source, and return a normalized/deduped/max-bounded immutable invalidation set. Commit that transaction before invoking any non-rollbackable Next cache API. Only after COMMIT, iterate the derived set using current Next 16.3 signatures:

```ts
revalidatePath(path);
revalidateTag(tag, "max");
```

Do not call deprecated one-argument `revalidateTag`. Do not invoke `revalidatePath` or `revalidateTag` inside `TransactionManager.run`. The validated previous path is the only historical caller-supplied value used, and only for exact `ARTICLE_SLUG_CHANGED` payloads.

- [x] **Step 7: Add route wrapper and run endpoint checkpoint**

Route is a force-dynamic thin POST wrapper. Run:

```powershell
npm test -- tests/unit/wp13-cache-config.test.ts tests/unit/wp13-cache-security.test.ts tests/integration/wp13-cache-revalidation.test.ts --hookTimeout=60000 --no-file-parallelism
rg -n "revalidatePath|revalidateTag|CACHE_REVALIDATION_SECRET" app src
```

Expected: PASS; one protected endpoint, no query-string secret, and no arbitrary path API.

### Task 13: Extend the Worker for cache delivery without disturbing email lifecycles

**Files:**
- Create: `src/modules/cache/revalidation-client.server.ts`
- Create: `src/modules/cache/process-revalidation.server.ts`
- Modify: `src/modules/worker/dispatcher.server.ts`
- Modify: `src/modules/worker/run-once.server.ts`
- Modify: `src/modules/outbox/transitions.server.ts`
- Modify: `scripts/worker.ts`
- Modify: `tests/unit/wp12a-worker-runner.test.ts`
- Create: `tests/unit/wp13-cache-client.test.ts`
- Create: `tests/unit/wp13-worker-dispatch.test.ts`
- Create: `tests/integration/wp13-worker-cache.test.ts`
- Modify: `tests/integration/wp12a-worker-concurrency.test.ts`

**Interfaces:**
- Produces: HMAC HTTP client and claimed-event processor with existing complete/reschedule/dead-letter transitions.
- Consumes: Task 2 typed event, Task 12 config/signature contract, platform fetch, and current Worker ownership/lease APIs.
- Transaction boundary: claim commits, network runs with no active DB transaction, settlement uses one short transaction.

- [x] **Step 1: Write RED HMAC client tests**

Inject fetch/time. Assert POST to fixed `${APP_BASE_URL}/api/internal/cache/revalidate`, `redirect:"error"`, five-second abort, exact JSON bytes/headers, fresh timestamp/signature per attempt, no secret in URL/log/output, and an 8 KiB maximum response read. Classify 2xx success; network/408/425/429/5xx retryable; other 4xx terminal.

- [x] **Step 2: Write RED dispatcher/settlement tests**

Assert `CACHE_REVALIDATION_REQUESTED` aggregate ID equals payload Article ID, malformed payload fails safely, and valid event calls only cache processor. On success complete event; retryable response reschedules with bounded backoff unless attempts exhausted, then dead-letter; terminal response dead-letters. Existing Opportunity resolver and Delivery email branches remain exact.

- [x] **Step 3: Write RED no-network-in-transaction integration test**

Instrument `TransactionManager.run`/client callback. Assert:

```text
claim transaction COMMIT
fetch/HMAC call while no transaction active
settlement transaction COMMIT
```

Network failure must not change Article truth and must leave a retry/dead-letter state only.

- [x] **Step 4: Run Worker tests and verify RED**

Run:

```powershell
npm test -- tests/unit/wp13-cache-client.test.ts tests/unit/wp13-worker-dispatch.test.ts tests/integration/wp13-worker-cache.test.ts --hookTimeout=60000 --no-file-parallelism
```

Expected: FAIL because client/dispatch branch do not exist.

- [x] **Step 5: Implement client and event-specific processor**

Export:

```ts
export interface CacheRevalidationClient {
  revalidate(input: { eventId: string; payload: ArticleCacheRevalidationPayloadV1 }): Promise<CacheRevalidationResult>;
}

export type CacheRevalidationResult =
  | Readonly<{ kind: "SUCCEEDED" }>
  | Readonly<{ kind: "RETRYABLE_FAILURE"; errorCode: "CACHE_REVALIDATION_RETRYABLE" }>
  | Readonly<{ kind: "TERMINAL_FAILURE"; errorCode: "CACHE_REVALIDATION_REJECTED" }>;

export type CacheRevalidationProcessResult =
  | Readonly<{ kind: "PROCESSED" }>
  | Readonly<{ kind: "RESCHEDULED" }>
  | Readonly<{ kind: "DEAD_LETTERED" }>;

export function processCacheRevalidationEvent(
  transactionManager: Pick<TransactionManager, "run">,
  claimedEvent: ClaimedOutboxEvent,
  workerContext: Readonly<{ workerId: string; now: Date }>,
  dependencies: Readonly<{ client: CacheRevalidationClient }>,
): Promise<CacheRevalidationProcessResult>;
```

Use the claimed event's attempt/maxAttempts for retry policy, existing ownership checks for completion, and canonical safe error codes only. Never create Notification/DeliveryAttempt or analytics events.

- [x] **Step 6: Wire Worker runtime/config and dynamic stale recovery**

Add `cacheRevalidator` to `WorkerDispatchDependencies`/`WorkerRunOnceDependencies`; production script constructs HTTP client from validated APP base/secret. Existing fake/email test dependencies receive a deterministic fake client. Replace hardcoded stale-event SQL list with the same closed supported event registry while preserving unresolved Delivery quarantine. Do not change CLI modes or Resend send behavior.

- [x] **Step 7: Run Worker/email regression and concurrency tests**

Run:

```powershell
npm test -- tests/unit/wp13-cache-client.test.ts tests/unit/wp13-worker-dispatch.test.ts tests/integration/wp13-worker-cache.test.ts tests/unit/wp12a-worker-runner.test.ts tests/unit/wp12a-outbox-contracts.test.ts tests/integration/wp12a-worker-concurrency.test.ts tests/integration/wp12a-send-delivery.test.ts tests/integration/wp12b-resend-send.test.ts --hookTimeout=60000 --no-file-parallelism
```

Expected: PASS; cache work is idempotent/retryable and email/Resend behavior is unchanged.

### Task 14: Complete the real fake-OIDC Article browser/XSS workflow

**Files:**
- Create: `tests/browser/wp13/seed-article-cms.ts`
- Create: `tests/browser/wp13/run-article-browser.py`
- Modify: `tests/browser/wp13/article-editor-scenarios.md`
- Create: `tests/unit/wp13-browser-fixture-contract.test.ts`
- Reuse: `tests/browser/wp11/fake-admin-oidc-issuer.ts`
- Reuse: `tests/browser/wp11/seed-admin-console.ts` patterns only; do not add an application auth bypass.

**Interfaces:**
- Produces: dedicated DB fixture and repeatable desktop/tablet/mobile browser evidence.
- Consumes: normal Admin OIDC runtime, approved packages, protected Admin pages/APIs, public Article route, Worker/cache fixture, and a dedicated `_test`/`_verifyN` database.
- Browser boundary: no production IdP, no test login route/header, no shared/development DB.

- [x] **Step 1: Load the browser-testing skill and write the RED fixture contract**

During implementation, use `webapp-testing` before browser control. First write `wp13-browser-fixture-contract.test.ts` to require exported `seedWp13ArticleCmsFixture`, `readWp13ProductSignalCounts`, and `assertWp13ProductSignalsUnchanged` functions, dedicated-DB validation before mutation, an ACTIVE Admin/fake-issuer subject match, canonical relation targets, one historical unsafe Article, and captured empty Product-signal baselines.

Run:

```powershell
npm test -- tests/unit/wp13-browser-fixture-contract.test.ts
```

Expected: FAIL because the WP-13 fixture does not exist.

- [x] **Step 2: Implement the deterministic fixture and turn the contract GREEN**

Create only the fixture data named in Step 1, using current migrations and existing WP-11 fake issuer patterns. Re-run `npm test -- tests/unit/wp13-browser-fixture-contract.test.ts`; expected PASS.

- [x] **Step 3: Start isolated processes and record teardown identities**

Start fake issuer and Next on controlled loopback ports with distinct Admin/consumer/cache secrets and the dedicated DB. Record exact process IDs. Never terminate broad process-name matches; stop only recorded fixtures.

- [x] **Step 4: Execute the desktop happy path**

Verify:

```text
Admin OIDC login
-> Articles -> New
-> Visual content + safe internal/external links
-> Source mode malicious SVG/MathML/script/event/javascript/private same-origin links
-> Save DRAFT -> persisted sanitized preview
-> set Institution/Opportunity relations
-> Publish -> public server body/metadata/JSON-LD without author
-> atomic PUBLISHED edit through Publish Changes
-> slug change -> old URL 308 to current PUBLIC target
-> Unpublish -> current and old URL 404/no Location
-> slug change while unpublished -> history flattened but still 404
-> Republish -> all historical URLs 308 to latest canonical
-> Logout
```

- [x] **Step 5: Execute browser XSS and privacy assertions**

With JavaScript enabled and disabled, assert no injected alert/global side effect, no script/event/javascript href/iframe/SVG/MathML, same-origin Admin/API/auth/private links absent, safe same-origin absolute link normalized root-relative, external `_blank` rel safe, and internal Admin display name absent from body/source/JSON-LD.

- [x] **Step 6: Execute stale/read-only/Product-signal assertions**

Use two editor tabs with one stale timestamp; stale submit returns guidance and does not overwrite. Verify no OpportunityChange/Notification/Delivery/Email rows and exactly the expected cache events. Operations/worker email paths remain usable.

- [x] **Step 7: Verify tablet/mobile editor accessibility**

At representative tablet/mobile widths, verify toolbar wrapping, Visual/Source toggle, labelled fields, focus visibility/order, relation controls, confirmations, error/status announcement, and safe public prose layout.

- [x] **Step 8: Run the browser harness checkpoint**

Run the documented `run-article-browser.py` command against the isolated processes. Expected: every desktop/tablet/mobile scenario in Steps 4–7 passes and the script exits zero with captured assertion evidence.

- [x] **Step 9: Tear down safely and retain evidence**

Stop only recorded Next/fake-issuer processes. Store screenshots/logs outside tracked source unless the execution prompt later explicitly requests artifacts. Preserve the dedicated DB until Task 15 completes.

### Task 15: Run the full WP-13 self-review, security audit, and completion gate

**Files:**
- Modify: `docs/superpowers/plans/2026-08-25-wp-13-article-cms-seo.md` only to check steps/record concise evidence during execution.
- Modify: in-scope WP-13 files only if verification exposes an in-scope defect.
- Test: all WP-13 tests plus the controlled repository suite.

**Interfaces:**
- Consumes: Tasks 1–14 and the approved design/hostile review.
- Produces: fresh verification evidence and the mandated WP-13 completion report; no commit/push/deploy.

- [x] **Step 1: Run every focused WP-13 unit/integration test**

Run:

```powershell
npm test -- tests/unit/wp13-article-links.test.ts tests/unit/wp13-sanitizer.test.ts tests/unit/wp13-editorial-contracts.test.ts tests/unit/wp13-cache-contracts.test.ts tests/unit/wp13-redirect-policy.test.ts tests/unit/wp13-admin-article-http.test.ts tests/unit/wp13-admin-article-pages.test.ts tests/unit/wp13-admin-article-ui.test.ts tests/unit/wp13-public-article.test.ts tests/unit/wp13-indexability.test.ts tests/unit/wp13-metadata.test.ts tests/unit/wp13-structured-data.test.ts tests/unit/wp13-robots.test.ts tests/unit/wp13-cache-config.test.ts tests/unit/wp13-cache-security.test.ts tests/unit/wp13-cache-client.test.ts tests/unit/wp13-worker-dispatch.test.ts tests/unit/wp13-browser-fixture-contract.test.ts tests/integration/wp13-editorial-repository.test.ts tests/integration/wp13-article-draft-commands.test.ts tests/integration/wp13-article-command-rollback.test.ts tests/integration/wp13-article-publish.test.ts tests/integration/wp13-article-concurrency.test.ts tests/integration/wp13-article-slug.test.ts tests/integration/wp13-redirect-runtime.test.ts tests/integration/wp13-admin-article-http.test.ts tests/integration/wp13-admin-article-read.test.ts tests/integration/wp13-public-article.test.ts tests/integration/wp13-sitemap.test.ts tests/integration/wp13-cache-revalidation.test.ts tests/integration/wp13-worker-cache.test.ts --hookTimeout=60000 --no-file-parallelism
```

Expected: PASS.

- [x] **Step 2: Re-run the three required amendment regressions separately three times**

Run three independent invocations for:

```text
published A -> B -> unpublish -> C: historical routes 404/no Location; republish: A/B -> 308 C
Admin displayName present: no public DTO/byline/JSON-LD author
same-origin absolute public detail normalized; same-origin private paths removed
```

Expected every run: deterministic results and no target/PII/policy leakage.

- [x] **Step 3: Run controlled database, concurrency, and rollback verification**

Require `TEST_DATABASE_URL` to pass `assertDedicatedTestDatabaseUrl`, migrate current schema, then run all WP-13 integration tests with no file parallelism. Repeat published-edit and slug races three times. WP-13 adds no migration: the existing ledger is `0000_absent_shen.sql` through `0010_colorful_randall_flagg.sql` and must remain byte-for-byte unchanged.

Run:

```powershell
npm test -- tests/integration/wp12b-provider-event-migration.test.ts --hookTimeout=60000 --no-file-parallelism
git status --short -- src/db/migrations src/db/schema
```

Expected: fresh migration through `0010` PASS; upgrade from `0009` through `0010` PASS; WP-13 migration delta is `0`; no migration/schema path appears in Git status.

- [x] **Step 4: Run package, type, lint, formatting, and build gates**

Run:

```powershell
npm ls @tiptap/react @tiptap/pm @tiptap/starter-kit sanitize-html @types/sanitize-html
npm audit --omit=dev
npm run typecheck
npm run lint
npm run format:check
npm run build
```

Expected: exact approved versions, `sanitize-html >=2.17.6`, no unresolved production vulnerability in the added package path, and all code/build gates PASS. Inspect build output for Admin Article routes, internal cache endpoint, `/sitemap.xml`, `/robots.txt`, and unchanged public URLs.

- [x] **Step 5: Run the full controlled regression suite**

Run:

```powershell
npm test -- --hookTimeout=60000 --no-file-parallelism
```

Expected: PASS with WP-08–WP-12 auth/follow/monitoring/worker/Resend behavior unchanged.

- [x] **Step 6: Audit HTML, links, author PII, and structured data**

Run:

```powershell
rg -n "dangerouslySetInnerHTML|unsafeStoredContentHtml|sanitizeArticleHtmlV1|contentHtml|authorDisplayName|adminUsers\.displayName" app src
rg -n "javascript:|data:|vbscript:|file:|protocolRelative|classifyArticleHref" src/modules/editorial tests/unit/wp13-article-links.test.ts
rg -n '"author"|EducationalOrganization|"Event"|BreadcrumbList|"Article"' app src/modules/public
```

Manually inspect every match. Expected: one reviewed public body sink fed only sanitized DTO; no internal Admin identity in public output; unsafe schemes only in tests/policy; Article/Breadcrumb exact and Institution/Event omitted.

- [x] **Step 7: Audit redirect/public-state/cache path boundaries**

Run:

```powershell
rg -n "permanentRedirect|urlRedirects|url_redirects|resolveHistoricalArticleRedirect|previousCanonicalPath|currentCanonicalPath" app src tests
rg -n "revalidatePath|revalidateTag|CACHE_REVALIDATION|HMAC|timingSafeEqual|replay" app src
```

Manually prove one redirect lookup + one PUBLISHED target load, no recursive target following, nonpublic target no `Location`, flattened registry, server-derived current/related/history paths, 100-row bound, explicit `revalidateTag(tag, "max")`, and no client path/tag authority.

- [x] **Step 8: Audit transaction, Product-signal, package, schema, and Git scope**

Run:

```powershell
rg -n "\.insert\(|\.update\(|\.delete\(|TransactionManager" app/admin app/api/admin/articles src/modules/admin
rg -n "OpportunityChange|Notification|Delivery|Email" src/modules/editorial src/modules/cache
git diff --name-only
git diff --stat
git diff --check
git status --short --branch
```

Expected: Admin/UI/Route Handlers do not mutate DB directly; editorial/cache code creates no customer signal; no migration/schema/GA4/media/deploy/unapproved package file; only WP-13 scope plus the three docs; commit/push remain NO.

- [x] **Step 9: Prepare the mandated completion report and stop**

Report exact branch/baseline/diff, package versions, migration/schema none, sanitizer/link policy/bounds, CMS routes/state transitions/stale behavior, author omission, safe public body, indexability/metadata/sitemap/robots/JSON-LD, redirect nonpublic gating/flattening, cache event/HMAC/replay/worker boundaries, Product signals 0, focused/full/concurrency/browser/build/package evidence, hardening carry-forward, and `commit/push: NO`. Do not begin WP-14.

## Execution evidence — 2026-08-25

- Focused WP-13: 31 files / 173 tests PASS.
- Required amendment regressions: redirect runtime, public author/privacy, and
  link classification each PASS in three independent runs.
- Race verification: Article published-edit concurrency and slug races each
  PASS in three independent runs; rollback and cache no-network-in-transaction
  coverage PASS.
- Full controlled regression: 133 files / 1,308 tests PASS with
  `TEST_DATABASE_URL` and no file parallelism.
- Migration: fresh and `0009`→`0010` upgrade PASS; ledger remains exactly
  `0000_absent_shen.sql` through `0010_colorful_randall_flagg.sql`; WP-13 delta
  0 and schema delta 0.
- Packages: Tiptap 3.30.3, `sanitize-html` 2.17.7,
  `@types/sanitize-html` 2.16.1; production audit 0 vulnerabilities.
- Gates: typecheck PASS, lint PASS with 0 warnings, WP-13 scoped Prettier PASS,
  production build PASS. Repository-wide Prettier remains a pre-existing
  294-file baseline outside WP-13 scope and was not bulk-rewritten.
- Browser: all six real fake-OIDC phases PASS on fresh `admissionradar_test`;
  unsafe content false, relations 1+1, cache events 6, audits 9, redirects
  A→C/B→C, Product signals 0, tablet/mobile accessibility assertions PASS,
  exact fixture listeners stopped. Evidence is outside tracked source at
  `D:\potensia\preppy-wp13-browser-evidence-final-20260825`.
- Git: branch `wp-13-cms-seo`; no migration/schema/GA4/media/deploy change;
  commit/push/deploy NO.

## Plan Self-Review Checklist

- [x] Every design LOCK-001 through LOCK-018 maps to at least one task and verification step.
- [x] Required amendment 1 maps to Tasks 5, 9, 12, 14, and 15.
- [x] Required amendment 2 maps to Tasks 7, 9, 10, 14, and 15.
- [x] Required amendment 3 maps to Tasks 1, 8, 14, and 15.
- [x] Review patch 1 locks the unchanged existing migration ledger through `0010` and WP-13 migration delta `0`.
- [x] Review patch 2 keeps default Admin JSON limits unchanged and grants only Article adapters the 192 KiB/128 KiB profile with boundary tests.
- [x] Review patch 3 ensures historical raw HTML is sanitized before every Admin editor/preview browser prop.
- [x] Review patch 4 lets bounded Article sitemap batches read/sanitize server-only HTML while forbidding raw body DTO/result exposure.
- [x] Cache invalidation DB reads commit before `revalidatePath`/`revalidateTag` network/runtime effects.
- [x] Every code-producing task has explicit RED command, minimum interface/implementation, GREEN command, and checkpoint.
- [x] Function/type names are consistent across producer/consumer tasks.
- [x] No task contains a migration/schema edit, generic CMS/SEO framework, arbitrary cache path, public author inference, recursive redirect, Product signal, GA4, deploy, commit, or push step.
- [x] No forbidden placeholder marker or non-concrete implementation instruction remains.

## Plan Completion Gate

The later implementation is complete only when every checked step has fresh evidence; the three required amendment regressions pass repeatedly; default Admin JSON limits remain unchanged while Article alone passes the exact 192 KiB/128 KiB boundaries; all public and Admin-browser Article HTML is sanitized before crossing its trust boundary; bounded Article sitemap batches use the same meaningful sanitized-body indexability decision without exposing raw content; PUBLISHED atomic editing and stale `409` semantics hold; redirect rows remain durable but nonpublic targets never emit `Location`; internal Admin names never enter public author output; same-origin links cannot bypass canonical-route policy; Article/relations/redirect/Audit/cache Outbox are atomic; cache DB reads commit before Next revalidation calls and cache network remains outside truth transactions; Article changes create zero customer Product signals; the existing `0000`–`0010` ledger is unchanged with WP-13 migration delta `0`; package/schema/Git scope is exact; full tests/build/browser checks pass; and no commit, push, merge, or deployment occurs.
