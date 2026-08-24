# PREPPY WP-13 Article CMS / Sanitization / SEO Runtime Design

**Status:** AMENDED DESIGN APPROVED — implementation plan prepared; implementation has not started

**Date:** 2026-08-25

**Branch:** `wp-13-cms-seo`

**Baseline:** `50c17b2 feat: add resend delivery and webhook reconciliation`

**Implementation constraints:** no commit, no push, no deployment, no schema migration; package and lockfile changes begin only after implementation-plan approval

## 1. Purpose

WP-13 completes one bounded Article vertical slice:

```text
Admin Article command
  -> strict candidate validation
  -> deterministic server sanitizer
  -> Article / relation transaction
  -> PII-safe Audit + cache-revalidation Outbox
  -> public server rendering
  -> metadata / canonical / sitemap / robots
  -> historical 308 redirect
  -> Worker-authenticated cache revalidation
```

This is not a generic CMS, generic rich-text platform, or reusable SEO framework. Article is the only editable content aggregate in WP-13. Existing Institution and Opportunity public pages receive only the minimum central SEO/redirect integration required by the approved architecture.

## 2. Scope

WP-13 implements:

- Article draft creation, draft/unpublished editing, relations, publication, atomic published editing, unpublication, archiving, and slug changes;
- a Tiptap v3 Admin editor with visual/source modes and persisted server preview;
- one versioned, allowlist-based HTML sanitizer shared by command writes and public reads;
- public Article body rendering from sanitized HTML only;
- central indexability, metadata, canonical, robots, and sitemap behavior;
- exact historical redirect resolution through `url_redirects`;
- Article/Breadcrumb structured data only where mapping is exact;
- transactional cache-revalidation Outbox production and Worker dispatch to an HMAC-protected internal endpoint;
- inline TDD across unit, PostgreSQL integration, concurrency, route, metadata, security, and browser behavior.

WP-13 explicitly does not implement:

- a generic page builder, block registry, asset manager, upload pipeline, media library, revision history, background draft, scheduled publication, localization, taxonomy system, or reusable CMS plug-in architecture;
- arbitrary HTML/CSS/JavaScript, images in rich text, iframes, embeds, tables, forms, or style/class attributes;
- user-supplied cache paths/tags, network calls inside the Article root transaction, or distributed replay storage;
- speculative Institution or Opportunity structured data;
- analytics transport, production cutover, or unrelated public-page redesign.

## 3. Repository Baseline

The repository already provides:

- `articles`, `article_institution_relations`, `article_opportunity_relations`, and `url_redirects` schema with the required status and uniqueness constraints;
- server-only Article repository/query beginnings and public Article DTO boundaries;
- an Admin runtime with ACTIVE revalidation, Origin enforcement, bounded duplicate-member-rejecting JSON parsing, strict Zod adapters, safe errors, and separate Admin sessions;
- root transactions, row locks, advisory-lock patterns, `AuditWriter`, `OutboxWriter`, Worker claim/recovery, and typed delivery dispatch patterns;
- existing public Institution, Opportunity, and Article routes, plus one central indexability module that WP-13 can complete.

The repository does not yet provide:

- an Article application command layer;
- Tiptap or `sanitize-html` dependencies;
- public sanitized Article body rendering;
- metadata routes, a sitemap, robots output, runtime redirects, or cache-revalidation dispatch.

No schema or migration change is expected. Commands must update `articles.updated_at` explicitly because Article does not have a database trigger that performs this operation.

## 4. Chosen Architecture and Rejected Alternatives

### Chosen — bounded Article vertical slice

All Article mutation, sanitization, rendering, SEO, redirect, and revalidation behavior belongs to one Article capability with narrow adapters at Admin, public, and Worker boundaries. Policy remains in server/application modules; React routes only translate input/output.

### Rejected — route-centric implementation

Putting sanitization, state decisions, relation writes, and revalidation derivation directly into Route Handlers would duplicate policy and make browser paths an accidental authority boundary.

### Rejected — generic CMS/SEO framework

General content types, configurable schemas, extension registries, generic workflow engines, and generic revalidation rule builders are outside MVP scope. They would introduce abstractions before a second proven content aggregate exists.

## 5. LOCKED Decisions

### LOCK-001 — dependency floor and package boundary

Implementation may add only:

- `@tiptap/react`;
- `@tiptap/pm`;
- `@tiptap/starter-kit`;
- `sanitize-html`;
- `@types/sanitize-html` when required by TypeScript.

Tiptap v3 StarterKit already includes Link and Underline, so separate Link/Underline extension packages are forbidden. `sanitize-html` must be at least `2.17.6`, which includes the July 2026 allowlist-bypass security fix, and the installed exact version must be lockfile-pinned. At planning time the registry candidate is `2.17.7`; implementation must re-check that the resolved version remains `>=2.17.6` without broadening package scope.

References: [Tiptap StarterKit](https://tiptap.dev/docs/editor/extensions/functionality/starterkit), [Tiptap React installation](https://tiptap.dev/docs/editor/getting-started/install/react), [`sanitize-html` changelog](https://github.com/apostrophecms/apostrophe/blob/main/packages/sanitize-html/CHANGELOG.md).

### LOCK-002 — Article lifecycle and published edit semantics

The exact states remain `DRAFT`, `PUBLISHED`, `UNPUBLISHED`, and `ARCHIVED`.

```text
CreateArticleDraft                       -> DRAFT
UpdateArticleDraft: DRAFT                -> DRAFT
UpdateArticleDraft: UNPUBLISHED          -> UNPUBLISHED
UpdateArticleDraft: PUBLISHED            -> FORBIDDEN
PublishArticle: DRAFT                    -> PUBLISHED
PublishArticle: UNPUBLISHED              -> PUBLISHED
PublishArticle: PUBLISHED                -> PUBLISHED (atomic content re-publish)
UnpublishArticle: PUBLISHED              -> UNPUBLISHED
ArchiveArticle: DRAFT/UNPUBLISHED        -> ARCHIVED
ArchiveArticle: PUBLISHED                -> ARCHIVED with public cache event
ARCHIVED                                 -> terminal in WP-13
```

`PublishArticle(candidate, expectedUpdatedAt)` is the only command that may change content, SEO fields, or relations while a row is currently PUBLISHED. It applies the complete candidate and relation set atomically while keeping the Article public. An operator may instead explicitly unpublish, after which `UpdateArticleDraft` is allowed. There is no hidden background draft, silent public mutation, automatic merge, or last-write-wins behavior.

Every mutation that can overwrite operator work requires `expectedUpdatedAt`. The command acquires a row lock and compares the exact persisted value. Mismatch produces a typed stale conflict mapped to HTTP `409` with zero writes.

`publishedAt` is the first successful publication time and is set only while null. Unpublish retains it and sets `unpublishedAt`; a later publish clears `unpublishedAt` without rewriting the original publication time. `updatedAt` is advanced by every successful editorial/lifecycle/slug/relation command and is the public `dateModified` source only while the Article is PUBLISHED. `archivedAt` is set only on archive. These meanings must not be inferred from generic row writes outside the command layer.

### LOCK-003 — command ownership and one root transaction

The application layer owns exactly:

- `CreateArticleDraft`;
- `UpdateArticleDraft`;
- `SetArticleRelations`;
- `PublishArticle`;
- `UnpublishArticle`;
- `ArchiveArticle`;
- `ChangeArticleSlug`.

Each command runs in one root transaction and owns eligibility, row/advisory locks, sanitization, Article/relation writes, redirect writes, Audit, and cache Outbox production as applicable. Route Handlers and React components may not insert/update/delete Article, relation, redirect, Audit, or Outbox rows directly.

Audit metadata never stores raw or sanitized Article HTML. Content-changing actions store only bounded safe fields and `contentFingerprint = "sha256:<lowercase hex>"` over the persisted sanitized UTF-8 HTML.

### LOCK-004 — sanitizer is one versioned server security boundary

`sanitizeArticleHtmlV1` is a deterministic server-only function used:

1. before content is persisted by create/update/publish commands; and
2. again when historical stored Article HTML is projected for Admin preview or public rendering.

Public runtime sanitization is defense in depth for data that predates WP-13 or bypassed the command path. The client editor preview is never the security boundary.

The allowlisted elements are exactly:

```text
p h2 h3 h4 strong em u s ul ol li blockquote pre code br hr a
```

`h1`, images, media, iframe, embed, object, SVG, MathML, forms, tables, script, style, comments, event handlers, `class`, `id`, `style`, `src`, and `srcset` are not allowed. Non-anchor elements receive no attributes. Anchor attributes are limited to `href`, `target`, and `rel`, then normalized by the Article link policy.

The sanitizer output must be stable under repeated sanitization. Empty wrappers and unsafe anchors may be removed or reduced to safe text, but the function must never invent executable markup.

### LOCK-005 — one classifier governs root-relative and same-origin absolute links

Every Article `href` passes one URL classifier:

```text
root-relative input
  -> PREPPY internal canonical-path validator

absolute HTTP(S) input
  -> parse URL
  -> origin == configured APP_BASE_URL origin?
       YES -> PREPPY internal canonical-path validator
              -> normalize accepted value to root-relative form
       NO  -> external absolute HTTP(S) link policy
```

The PREPPY internal canonical-path validator accepts only `/institutions/{canonical-slug}`, `/opportunities/{canonical-slug}`, and `/articles/{canonical-slug}`. Root-relative and same-origin absolute inputs reuse the same internal canonical-path validator. An accepted same-origin absolute URL such as `https://preppy.example/articles/foo` is normalized to `/articles/foo`; a same-origin absolute internal/private route such as `/admin`, `/api`, `/auth`, onboarding, My PREPPY, or any other path is removed rather than treated as an external link.

Internal canonical paths contain no query, fragment, dot segment, encoded separator, empty slug, credentials, or trailing path segment. External links must be absolute `http://` or `https://`, must have a non-PREPPY origin, and must contain no URL credentials. The parser rejects protocol-relative URLs, backslash-equivalent authority tricks, control characters, malformed encodings, and all other schemes. These examples are always rejected:

```text
//evil.example
/\\evil.example
javascript:
data:
vbscript:
file:
/api/...
/admin/...
/auth/...
https://preppy.example/admin/...
https://preppy.example/api/...
https://preppy.example/auth/...
```

For accepted PREPPY internal links, `target` and `rel` are removed and navigation stays same-tab. An absolute external HTTP(S) link may use `_blank`; when it does, the sanitizer forces `rel="noopener noreferrer"`. Unsupported target values are removed. The sanitizer does not infer whether a URL correction or Source identity change has occurred; this link policy is unrelated to Source provenance.

### LOCK-006 — bounded Article input and output

The following exact limits apply to decoded UTF-8 values:

| Field/boundary | Limit |
| --- | ---: |
| Article mutation JSON envelope | 192 KiB raw bytes |
| `contentHtml` input | 128 KiB |
| sanitized `contentHtml` output | 128 KiB |
| title | 160 Unicode code points |
| slug | 120 ASCII characters |
| excerpt | 500 Unicode code points |
| SEO title | 70 Unicode code points |
| SEO description | 320 Unicode code points |
| URL-valued field | 2,048 characters |
| featured-image alt | 300 Unicode code points |
| Institution relations | 12 unique IDs |
| Opportunity relations | 12 unique IDs |
| Active historical Article redirect sources per target | 100 paths |
| internal cache endpoint body | 16 KiB raw bytes |

Article Admin adapters reuse the Admin security pipeline but override its general body ceiling with the Article-specific envelope ceiling. Oversize input is rejected before JSON parsing or sanitization. A sanitizer expansion beyond the output bound fails the command rather than truncating markup.

### LOCK-007 — draft incompleteness and publish eligibility are separate

`CreateArticleDraft` requires only the database-required identity fields: bounded title, canonical slug, Article type, and category. Content and optional SEO/relationship fields may be incomplete; draft robots default to `index=false`, `follow=true`.

`authorAdminId` is taken only from the authenticated command context at creation and is not client-settable or silently replaced by later editors. Audit records identify later actors. `canonicalUrl` is either null or server-normalized to the exact same-origin Article self URL; arbitrary external canonical ownership is not accepted.

Publication and Article indexability require:

- a canonical valid slug;
- a bounded non-empty title;
- at least 40 non-whitespace Unicode text characters after sanitization and HTML-to-text normalization;
- a non-empty description source (`seoDescription`, otherwise `excerpt`);
- every related target ID to exist;
- any `canonicalUrl` to be absent or the exact same-origin self canonical URL;
- any featured-image URL to be absolute HTTP(S).

External syndication canonicals and file/data image URLs are not supported in WP-13. Failed eligibility creates no partial Article, relation, redirect, Audit, or Outbox writes.

### LOCK-008 — relation changes follow the public-state boundary

Draft and unpublished relations may be replaced by `SetArticleRelations` after existence validation and deterministic deduplication/sorting. `SetArticleRelations` is forbidden for PUBLISHED and ARCHIVED rows. PUBLISHED relation changes must arrive as part of the complete `PublishArticle` candidate and commit atomically with content/SEO changes. This prevents a public Article from silently changing through a secondary endpoint.

Draft relations may point to currently nonpublic targets, as allowed by the existing API contract. Public projections expose only targets that satisfy their own public eligibility rules. Broken target IDs are rejected at write time; targets later made nonpublic are omitted at read time.

### LOCK-009 — slug registry, redirect history, and flattening are transactional

`ChangeArticleSlug` is allowed for non-ARCHIVED rows and requires `expectedUpdatedAt`. The transaction:

1. acquires the Article row lock and the stable Article/redirect slug-registry advisory lock;
2. validates the new canonical slug against both current public slugs and redirect sources;
3. preserves the old canonical path before changing the Article;
4. updates the Article slug and `updated_at`;
5. rewrites a populated server-owned `canonicalUrl` to the new exact self URL;
6. when the Article has ever been published, creates/updates the old-path redirect and retargets its historical Article redirect sources directly to the new canonical path;
7. writes Audit and, when public/historical URL behavior is affected, one cache-revalidation Outbox event;
8. commits or fully rolls back.

A never-published draft changes slug without creating redirect history. A previously published but currently UNPUBLISHED Article preserves and flattens its historical redirect registry, even though runtime redirect responses remain not-found until the final target becomes public again. The `url_redirects` historical registry is durable across unpublish/archive and is not deleted merely because its final target is nonpublic. Redirect chains and loops are forbidden by construction; runtime validates the target as the current canonical public Article without recursively following another redirect.

### LOCK-010 — slug cache event preserves both canonical paths

`ChangeArticleSlug` produces a server-generated payload containing at least:

```ts
{
  version: 1;
  articleId: string;
  reason: "ARTICLE_SLUG_CHANGED";
  previousCanonicalPath: `/articles/${string}`;
  currentCanonicalPath: `/articles/${string}`;
  relatedInstitutionIds: string[];
  relatedOpportunityIds: string[];
}
```

`previousCanonicalPath` is captured inside the slug-change transaction before mutation. It is not reconstructed later from the current Article row and is never accepted from a browser.

At delivery, the internal endpoint validates the previous path as an Article canonical-path shape, reloads the Article, recomputes the current canonical path from DB state, and server-derives all current related paths. It also loads a bounded set of active historical Article redirect source paths whose flattened `target_path` equals that current canonical path. It never revalidates an arbitrary client- or payload-supplied current/related path. The explicitly validated old path and server-derived historical source paths are revalidated as both public URLs and redirect lookup/cache entries.

### LOCK-011 — public output contains sanitized HTML only

The server-only public Article query may load stored HTML, but the value remains named/typed as unsafe until it passes `sanitizeArticleHtmlV1`. The public DTO exposes only `sanitizedContentHtml`; no public component receives `contentHtml`, `unsafeStoredContentHtml`, editor JSON, or an unsanitized preview field.

Only a PUBLISHED Article is publicly renderable. DRAFT, UNPUBLISHED, ARCHIVED, and unknown canonical slugs produce public not-found behavior. Historical redirect existence alone never authorizes a `308`: the flattened target must resolve to the current canonical PUBLISHED Article. A historical source targeting a DRAFT, UNPUBLISHED, ARCHIVED, missing, or noncanonical target returns not-found without a `Location` header and without exposing the target slug. Republish makes the preserved historical redirects eligible again. Source mode in Admin renders escaped text in an editor control and never injects it into the DOM as HTML.

### LOCK-012 — one central indexability decision

`getIndexability` remains the sole decision point for public indexing.

An Article is `INDEX` only when it is PUBLISHED, `robotsIndex=true`, has a canonical slug, passes the meaningful sanitized-body and description requirements, and can produce a same-origin canonical URL. A public Article with `robotsIndex=false` remains reachable but is `NOINDEX`; `robotsFollow` controls follow behavior. Nonpublic states are `NOT_PUBLIC` and return not-found rather than an indexable shell.

Institution and Opportunity keep their previously approved publication and verification rules. Query/filter variants of the Institution list are `NOINDEX, FOLLOW` and canonicalize to `/institutions`. Admin/auth/API/private surfaces never enter the public indexing path.

### LOCK-013 — metadata, canonical, robots, and sitemap use canonical projections

The application root defines `metadataBase` from validated `APP_BASE_URL`. Public home, Institution list/detail, Opportunity detail, and Article detail metadata are generated server-side from bounded canonical DTOs.

The repository owns exactly one `app/robots.ts` and one `app/sitemap.ts`. Robots disallows Admin, auth, API, onboarding, and My PREPPY private surfaces and advertises the sitemap. Sitemap includes only canonical URLs that resolve to `INDEX`:

- `/` and `/institutions`;
- eligible Institutions;
- eligible Opportunities;
- eligible Articles.

Filter URLs, private routes, redirect-source paths, drafts, noindex rows, and speculative URLs are excluded. `lastModified` is emitted only from a semantically trustworthy source: a PUBLISHED Article's command-owned `updatedAt`, and verified public-domain timestamps for Institution/Opportunity. `publishedAt` remains the Article's first-publication date. Generic row churn does not become an SEO timestamp.

### LOCK-014 — structured data is omission-first

WP-13 may emit only:

- `Article` for an eligible public Article when headline, canonical URL, description, publication date, and any included optional field have exact mappings;
- `BreadcrumbList` where every breadcrumb label and canonical URL is exact.

The Article JSON-LD mapping is locked to `@type=Article`, visible `title` as `headline`, the resolved canonical metadata description, self canonical as `mainEntityOfPage`, first `publishedAt` as `datePublished`, command-owned `updatedAt` as `dateModified`, and an optional valid featured-image URL. `admin_users.displayName` is an internal operational identity, not a public author identity. Article JSON-LD `author` is omitted unconditionally, and the internal Admin display name is removed from the public Article DTO/byline. No author schema or migration is added. Author may be introduced only through a separately approved explicit public-author contract. Breadcrumbs contain only existing routes: Home and the current Article (there is no invented `/articles` index breadcrumb in the current repository).

Repository/document verification found that `06_CONTENT_SEO_ARCHITECTURE.md` approves the Organization/EducationalOrganization direction but does not lock one exact type plus required/optional field mapping for the current DTO. Institution structured data is therefore deferred in WP-13. Opportunity-to-`Event` is also omitted because verified physical-location/online-event semantics are insufficient.

```text
uncertain structured data   -> omit
speculative structured data -> forbidden
```

Tests must prove that missing or ambiguous information produces no JSON-LD object, not a partially guessed one. JSON-LD is serialized through a safe serializer that escapes `<` and never interpolates raw HTML.

### LOCK-015 — public routes remain dynamically truthful

WP-13 does not claim static rendering or ISR performance. Existing dynamic public routes may remain `force-dynamic` so repository reads stay authoritative. Revalidation is implemented because route/data caching can be introduced or used by specific shared fetches later, and because sitemap/redirect/metadata caches need an explicit correctness channel. Any later static/ISR conversion requires separate evidence and performance verification.

### LOCK-016 — cache invalidation is transactional intent, asynchronous network

An Article command writes one versioned `CACHE_REVALIDATION_REQUESTED` Outbox event in the same root transaction as the truth/Audit change when public, canonical, related, sitemap, or redirect behavior can change. It never calls the network inside that transaction.

The event has a deterministic per-command dedupe key derived from event type, Article ID, reason, and the server-generated command correlation/operation ID. This avoids timestamp-collision ambiguity while keeping transaction retries of the same operation idempotent. Payloads carry typed identifiers and the one preserved prior canonical path only when required; they do not carry arbitrary revalidation paths/tags.

The Worker claims the event with the existing lease/retry lifecycle, commits the claim, calls the internal endpoint outside a database transaction, then records success or retry/dead-letter state in a short transaction. Article mutation success does not depend on an immediate network response.

### LOCK-017 — internal revalidation authentication and replay boundary

The internal endpoint is `POST /api/internal/cache/revalidate`. It accepts only a bounded raw JSON body and these versioned authentication headers:

```text
x-preppy-revalidation-timestamp
x-preppy-revalidation-event-id
x-preppy-revalidation-signature: v1=<lowercase hex>
```

The canonical signing input is:

```text
v1\n{timestamp}\n{eventId}\n{sha256(rawBody)}
```

The endpoint requires a dedicated server secret of at least 32 bytes, a timestamp within 300 seconds, exact canonical encodings, and timing-safe HMAC-SHA256 comparison. It rejects duplicates in the bounded JSON envelope and validates a strict versioned payload. It does not use Admin or consumer cookies.

A bounded process-local replay registry rejects a reused signature/timestamp combination. Worker retries create a fresh timestamp and signature for the same stable event ID. Multi-instance production requires distributed replay enforcement or an equivalent trusted edge guarantee; this remains an explicit hardening item and is not misrepresented as solved by process-local memory.

### LOCK-018 — endpoint derives the invalidation set from trusted state

After authentication, the endpoint:

1. validates event ID, Article ID, reason, and optional previous Article canonical path shape;
2. reloads the current Article and current relations from the database;
3. derives the current Article canonical path, related Institution/Opportunity paths, Article list/home surfaces, sitemap/metadata tags, and bounded active historical redirect source paths from server policy and DB state;
4. adds the validated previous canonical path for slug events, including redirect lookup invalidation;
5. invokes only the central revalidation helper.

Unknown IDs, mismatched event reason/payload shape, noncanonical prior paths, excessive relation/redirect-source counts, and arbitrary caller paths fail closed. Historical sources are accepted only when they are canonical `/articles/{slug}` paths, active, and directly target the recomputed current canonical path. The query reads at most 101 rows so a 101st active source becomes an explicit over-limit failure rather than silent truncation. Duplicate invalidations are normalized and bounded before calling Next.js APIs.

## 6. Domain Command Contracts

### 6.1 Candidate shapes

Article candidates are strict server schemas. Client input cannot provide state transitions, actor IDs, timestamps, sanitizer version, fingerprints, redirect targets, Outbox type/dedupe, Audit action, revalidation paths, or indexability results.

The complete publish candidate contains Article editorial fields plus the complete Institution and Opportunity relation-ID sets. It does not contain slug, actor/author identity, lifecycle timestamps, or state; slug changes remain exclusive to `ChangeArticleSlug`. Server policy normalizes optional strings, URLs, relations, sanitized HTML, and timestamps.

### 6.2 Create and update

`CreateArticleDraft` validates the minimal draft candidate, sanitizes any supplied body, creates a DRAFT row, writes Audit, and returns a safe Admin DTO.

`UpdateArticleDraft` locks a DRAFT or UNPUBLISHED row, checks `expectedUpdatedAt`, sanitizes candidate HTML, updates only approved draft fields, advances `updated_at`, fingerprints the stored output, and writes Audit. It cannot change relations or slug; those have explicit commands.

### 6.3 Relations

`SetArticleRelations` locks DRAFT/UNPUBLISHED, checks `expectedUpdatedAt`, validates both complete relation sets, replaces them deterministically, advances `updated_at`, and writes Audit. No Product signal or customer Outbox is created.

### 6.4 Publish and atomic published edit

`PublishArticle` locks the Article, verifies the expected timestamp and eligible source state, sanitizes the complete body, validates publication/indexability prerequisites and complete relations, then atomically:

```text
Article candidate + publication fields
  -> complete relation replacement
  -> Audit without HTML
  -> CACHE_REVALIDATION_REQUESTED Outbox
  -> COMMIT
```

First publication sets `publishedAt`. Re-publication of UNPUBLISHED clears `unpublishedAt` and preserves the original `publishedAt`. Atomic edit of a currently PUBLISHED row also preserves `publishedAt`. Every successful publish advances `updated_at`, which is the meaningful public editorial modification time.

### 6.5 Unpublish and archive

`UnpublishArticle` changes PUBLISHED to UNPUBLISHED, advances `updated_at`, writes Audit and a cache event, and makes the canonical route not-found after commit. Redirect history is retained.

`ArchiveArticle` is terminal. Archiving a public row writes the necessary cache event; archiving a never-public row writes no public cache event. Neither command deletes Article or relation history.

### 6.6 Change slug

`ChangeArticleSlug` follows LOCK-009/010. Slug is a lowercase canonical segment with the repository's approved character rule; decoded slashes, dot segments, encoded path separators, empty segments, query, and fragment are forbidden. The command returns both canonical paths in its safe result so the Admin UI can display the committed transition without controlling it.

## 7. Sanitizer and Link Normalization

The sanitizer pipeline is:

```text
bounded UTF-8 HTML
  -> sanitize-html allowlist
  -> anchor URL parse/classification
  -> target/rel normalization
  -> deterministic serialization
  -> output-size check
  -> SHA-256 fingerprint
```

Configuration explicitly disables protocol-relative URLs and allows only `http` and `https` for absolute anchors. A post-classification transform admits the three approved root-relative namespaces and drops every other relative form. Entity/percent/control-character obfuscations are evaluated after browser-equivalent URL decoding/parsing rules, not with a prefix-only regex.

The public projection sanitizes stored content again, derives meaningful text from the sanitized output, and returns the same normalized representation used by preview. A change to sanitizer policy requires a new explicit sanitizer version and compatibility/backfill decision; editing `V1` in place after production data exists is forbidden.

## 8. Admin Runtime and API

### 8.1 Pages

```text
/admin/articles
/admin/articles/new
/admin/articles/[articleId]
/admin/articles/[articleId]/preview
```

The existing read-only Article list becomes the entry point. The detail page exposes fields, relation selectors, lifecycle actions, stale timestamp, and separate slug-change control. The preview route renders the persisted, server-sanitized version in an Admin-only shell; source edits must be saved before preview. There is no live raw-HTML iframe.

The editor is a client island loaded only in Admin. Tiptap StarterKit uses the locked tag subset; unsupported editor commands are absent. Visual and Source modes edit one candidate string. Switching from Source back to Visual parses the candidate for editing convenience, but server save remains authoritative and may remove unsafe markup.

### 8.2 Mutation routes

```text
POST /api/admin/articles
PUT  /api/admin/articles/{articleId}/draft
PUT  /api/admin/articles/{articleId}/relations
POST /api/admin/articles/{articleId}/publish
POST /api/admin/articles/{articleId}/unpublish
POST /api/admin/articles/{articleId}/archive
POST /api/admin/articles/{articleId}/change-slug
```

Every route follows:

```text
ACTIVE Admin session recheck
  -> Origin validation
  -> Article-specific bounded duplicate-member-rejecting JSON
  -> strict Zod path/body validation
  -> server-generated AdminCommandContext
  -> Article application command
  -> safe typed response/error
```

Stale conflicts return `409`. Ineligible state changes return a safe `409`/typed conflict rather than attempting a coercive transition. Validation responses contain bounded field codes/messages and never echo submitted HTML. Unexpected errors never expose SQL, constraint names, stack traces, sanitizer internals, or raw values.

## 9. Public Rendering and SEO

### 9.1 Article route

`/articles/[slug]` first requires the already-decoded route segment to exactly match the canonical slug grammar and reconstructs the lookup path from that value; ambiguous encoded separators/dot segments never reach Article or redirect lookup. It then performs one canonical query. When a PUBLISHED Article exists, the server sanitizes stored HTML, computes indexability/metadata/JSON-LD, and renders it.

When no current Article exists, the route follows this nonrecursive flow:

```text
one exact url_redirects source lookup
  -> validate flattened target shape /articles/{canonical-slug}
  -> load target Article by that exact current slug
  -> target is current canonical and status == PUBLISHED?
       YES -> permanent 308
       NO  -> notFound()
```

`robotsIndex=false` does not make an otherwise PUBLISHED Article private, so it may still be a redirect target; public renderability and search indexability remain distinct. A DRAFT, UNPUBLISHED, ARCHIVED, missing, or noncanonical target always returns not-found. The response never reveals a nonpublic target path through `Location`.

Public body HTML is injected only from the `sanitizedContentHtml` DTO field. Related Institutions and Opportunities are projected through their existing public eligibility policies and use canonical internal links.

### 9.2 Redirect resolver

The central resolver performs exactly one `url_redirects` lookup by normalized source path plus one canonical target-entity load. It does not perform a second redirect lookup and never recursively follows a target. For Article redirects, successful target-entity loading proves the target is the current canonical Article slug and PUBLISHED. A missing/nonpublic target fails closed as not-found. Transactional flattening and namespace collision checks remain responsible for preventing target paths from also being redirect sources.

### 9.3 Metadata surfaces

Metadata functions do not query raw rows independently from page policy. They reuse canonical projections or a shared query helper so public state, title, description, canonical, robots, and JSON-LD cannot disagree. Missing optional SEO fields use bounded approved fallbacks; missing required indexability fields cause omission/noindex rather than invented copy.

## 10. Cache Revalidation Event and Worker

The event type is `CACHE_REVALIDATION_REQUESTED`, payload version `1`. Reasons are an allowlist such as:

```text
ARTICLE_PUBLISHED
ARTICLE_REPUBLISHED
ARTICLE_UNPUBLISHED
ARTICLE_ARCHIVED
ARTICLE_SLUG_CHANGED
ARTICLE_RELATIONS_CHANGED
```

`ARTICLE_RELATIONS_CHANGED` is emitted only when the relation change is part of a public `PublishArticle`; standalone draft/unpublished relation saves do not affect public output. The payload contains Article ID, current canonical path at commit time, current relation IDs, and the previous canonical path only for slug change.

The Worker dispatcher gains one typed branch. Existing delivery-event behavior and lease semantics remain unchanged. The cache transport receives the original event identity and payload, signs a fresh request, and classifies HTTP/network results into existing success/retry/dead-letter policy without logging the HMAC secret or full body.

The endpoint derives a bounded invalidation set including, as applicable:

- current Article path;
- validated previous Article path and redirect lookup entry;
- `/articles` if an Article list surface exists in the implemented route contract;
- `/` for latest-Article content;
- related Institution and Opportunity canonical paths;
- sitemap and central Article/SEO tags.

The implementation plan must map this policy to the exact Next.js 16.3 APIs in the installed local docs (`revalidatePath` and explicit-profile `revalidateTag`) and prohibit deprecated ambiguous tag calls.

## 11. Concurrency and Failure Semantics

- `expectedUpdatedAt` plus `SELECT ... FOR UPDATE` protects operator edits.
- A stable advisory lock serializes the shared Article slug/redirect namespace.
- Unique constraints remain the final arbiter for slug races and are mapped to safe conflicts.
- Relation replacement is deterministic and happens inside the same Article transaction.
- Audit and cache Outbox cannot survive a rolled-back Article mutation.
- Network failure cannot roll back committed Article truth; it moves only the cache event through retry/dead-letter lifecycle.
- A stale cache event cannot trust its recorded current path: delivery recomputes current state from the database. Its preserved old path remains usable only after canonical-shape validation.
- Out-of-order slug events are safe: each validated historical previous path is invalidated, while every event derives the same latest canonical/related state from the database rather than restoring an older target.
- Replaying the same command with a stale timestamp conflicts. Retrying the same Outbox event uses its stable event identity/dedupe and fresh HMAC timestamp.

## 12. Test Strategy for the Later Implementation

Implementation uses inline TDD. This section defines required evidence; no tests are added during design approval.

### 12.1 Unit/security

- sanitizer allowlist, attribute removal, idempotence, size bounds, and deterministic fingerprint;
- stored-XSS corpus including script/style/SVG/MathML, malformed tags, encoded schemes, mixed-case/control-character protocols, DOM clobbering attributes, protocol-relative/backslash URLs, and nested anchors;
- accepted PREPPY root-relative and absolute HTTP(S) links;
- same-origin absolute public canonical links normalized to root-relative form;
- same-origin absolute Admin/API/auth/private/noncanonical links removed by the same internal-path classifier;
- external `_blank` forced `noopener noreferrer`, internal target removal;
- meaningful-body and publication eligibility boundaries;
- strict Article request schemas and duplicate-member rejection;
- central indexability, metadata, canonical, sitemap, robots, and redirect rules;
- Article/Breadcrumb JSON-LD exact mapping, unconditional author omission without a public-author contract, and explicit omission when data is insufficient;
- Institution schema omission when mapping is not locked and Opportunity Event omission;
- HMAC canonicalization, time window, timing-safe comparison, body bound, duplicate JSON, payload shape, path derivation, and replay rejection.

### 12.2 PostgreSQL integration/concurrency

- every lifecycle transition and forbidden transition;
- DRAFT/UNPUBLISHED update allowed, PUBLISHED draft update rejected;
- PUBLISHED `PublishArticle` applies content and relations atomically while staying PUBLISHED;
- stale `expectedUpdatedAt` yields `409` semantics and zero writes;
- command rollback removes Article/relation/redirect/Audit/Outbox partial writes;
- publish, unpublish, archive, and slug events have exact product/cache signal counts;
- concurrent title/content edits, relation saves, publication, and slug collisions;
- never-published draft slug change creates no redirect;
- published/history slug change captures old path, flattens history, prevents loops/chains, and emits one deterministic event;
- historical redirect to a PUBLISHED current target returns `308`, while DRAFT/UNPUBLISHED/ARCHIVED/missing targets return not-found without a `Location` header;
- unpublish preserves redirect rows, republish safely reactivates their runtime `308`, and cache revalidation covers the bounded active historical source set;
- cache endpoint recomputes current/related paths after a later slug/relation change;
- historical unsafe HTML is sanitized at public and preview read boundaries;
- no Notification, Delivery, OpportunityChange, InstitutionFactVersion, or other Product signal is created.

### 12.3 Route/build/browser

- Admin auth, Origin, body bounds, strict validation, safe errors, and stale UX;
- public state visibility, not-found, exact 308, canonical, robots, and sitemap inclusion/exclusion;
- server-rendered sanitized HTML with JavaScript disabled;
- fake-OIDC Admin flow for create -> draft edit -> relations -> preview -> publish -> public render -> published atomic edit -> slug redirect -> unpublish;
- hostile source-mode payload cannot execute in Admin preview or public page;
- desktop, tablet, and mobile editor/action usability;
- typecheck, lint, changed-file formatting, production build, controlled full database suite, and Git prohibited-scope audit.

## 13. Expected Implementation Scope

Expected later changes are limited to:

- `src/modules/editorial/**` or a narrowly named Article application/security area;
- `src/modules/public/**` SEO/Article/redirect projections;
- `src/modules/admin/**` Article projections/adapters;
- `src/modules/outbox/**` and Worker cache-event dispatch;
- `app/admin/articles/**`, `app/api/admin/articles/**`, the Article public route, metadata/robots/sitemap routes, and the internal revalidation endpoint;
- Article/SEO/cache tests and browser fixtures;
- the approved package manifest/lockfile entries;
- this design and the later implementation plan.

The diff must not contain schema/migration files, generic CMS/page-builder abstractions, image upload/media infrastructure, analytics, unrelated public redesign, production credentials, deployment changes, commit, or push.

## 14. PRD Traceability

| Requirement | WP-13 disposition |
| --- | --- |
| `FR-ADM-005` Article Admin | Implemented as bounded Article create/edit/relation/lifecycle/preview console |
| `FR-PUB-005` Article | Implemented as server-rendered, canonical public Article detail |
| `FR-SEO-001` Server HTML | Implemented from runtime-sanitized public DTO |
| `FR-SEO-002` Metadata | Implemented from canonical projections and central indexability |
| `FR-SEO-003` Sitemap | Implemented once, INDEX-only |
| `FR-SEO-004` Structured Data | Article/Breadcrumb only when exact; Institution and Opportunity Event intentionally omitted because their exact verified field mappings are insufficiently locked |
| `FR-SEO-005` Internal Links | Implemented through Article relations and safe PREPPY root-relative content links |
| `FR-SEO-006` Redirect | Implemented with flattened historical `308` registry |
| `FR-SEO-007` Preview | Implemented as persisted server-sanitized Admin preview |
| `FR-SEO-008` Sanitization | Implemented as versioned server allowlist on write and read |
| Notification/Outbox operations | Existing WP-12 lifecycle remains authoritative; WP-13 adds only its typed cache event and no arbitrary Admin retry/cancel control |

## 15. Acceptance Criteria

WP-13 implementation is complete only when:

1. The Article vertical slice is implemented without a generic CMS/SEO framework or migration.
2. `sanitize-html` is lockfile-pinned at `>=2.17.6`, only approved packages are added, and Tiptap StarterKit supplies Link/Underline.
3. Unsafe Article markup cannot survive the write boundary or historical read boundary, and sanitizer adversarial tests pass.
4. Root-relative and same-origin absolute PREPPY links share one internal canonical-path validator; allowed public details normalize safely, same-origin private/noncanonical paths are removed, and only external absolute HTTP(S) links use the external policy.
5. Draft/unpublished edits and published atomic edit semantics exactly match LOCK-002, with stale writes returning `409` and zero overwrite.
6. Article, relations, redirects, Audit, and cache Outbox are atomic; Audit contains no HTML.
7. Slug changes preserve the previous path, flatten history, prevent collisions/loops, and invalidate both old redirect and current canonical surfaces, including server-derived active historical source paths.
8. Public DTOs expose only `sanitizedContentHtml` and public editorial fields; internal Admin display names are absent. Nonpublic Articles do not render and never become historical `308` targets.
9. Central indexability, metadata, canonical, robots, sitemap, and redirect behavior agree under focused and build tests.
10. Uncertain/speculative structured data is omitted and explicitly tested.
11. Cache events contain no caller-controlled paths, network runs outside the mutation transaction, and the endpoint authenticates, bounds, replay-checks, and server-derives invalidations.
12. Product signals remain zero: WP-13 creates no customer Notification/Delivery/OpportunityChange.
13. Focused, controlled full, concurrency, build, and responsive browser evidence passes.
14. No commit, push, deployment, or unrelated change is made.

## 16. Carried-Forward Hardening

- Replace process-local cache-endpoint replay memory with distributed enforcement before multi-instance production requires a strong cross-host replay guarantee.
- Evaluate static rendering/ISR only after measuring current dynamic routes and proving invalidation correctness under the target deployment topology.
- Add a new sanitizer version plus explicit data migration/backfill policy before materially changing the production allowlist.
- Design a first-class revision/draft-history model only if editorial workflow evidence requires one.
- Add Institution or Opportunity structured data only after their exact verified semantic mappings are independently locked and tested.

## 17. Next Gate

This document and its companion hostile review must receive user approval before `writing-plans`. No implementation, dependency installation, lockfile mutation, test creation, or code refactor begins at this gate.
