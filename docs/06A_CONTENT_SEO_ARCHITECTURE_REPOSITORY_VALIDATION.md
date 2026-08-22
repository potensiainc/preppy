# PREPPY Content/SEO Architecture Repository Validation

## 0. Purpose and Scope

이 문서는 `docs/06_CONTENT_SEO_ARCHITECTURE.md`를 다시 설계하지 않는다. 확정된 Content/SEO Architecture를 현재 AdmissionRadar Repository의 실제 Next.js version, App Router tree, schema, migrations, metadata/cache capability, dependencies, tests와 대조해 구현 가능성을 검증한다.

검증 기준일은 2026-08-22이다. 다음 문서를 지정된 순서와 기존 validation 연속성에 따라 확인했다.

- `docs/One Pager.md`
- `docs/MVP.md`
- `docs/00_PRODUCT_REQUIREMENTS_BASELINE.md`
- `docs/01_EXISTING_ARCHITECTURE_AUDIT.md`
- `docs/02_TARGET_ARCHITECTURE.md`
- `docs/02A_TARGET_ARCHITECTURE_REPOSITORY_VALIDATION.md`
- `docs/03_DOMAIN_MODEL.md`
- `docs/03A_DOMAIN_MODEL_REPOSITORY_VALIDATION.md`
- `docs/04_DATA_MODEL.md`
- `docs/04A_DATA_MODEL_REPOSITORY_VALIDATION.md`
- `docs/05_MONITORING_ARCHITECTURE.md`
- `docs/05A_MONITORING_ARCHITECTURE_REPOSITORY_VALIDATION.md`
- `docs/06_CONTENT_SEO_ARCHITECTURE.md`

다음 Repository 자산을 실제 파일에서 확인했다.

- `package.json`, `package-lock.json`
- `next.config.ts`, `next-env.d.ts`, `tsconfig.json`
- `app/**`
- `.next/types/routes.d.ts`, `.next/server/app-paths-manifest.json`, `.next/server/middleware-manifest.json`
- `src/config/env.ts`, `.env.example`
- `src/db/**`, Drizzle schema와 migrations
- `scripts/**`, `tests/**`
- README, Docker, ESLint, Vitest, Prettier 설정
- 설치된 Next.js 16.3.0의 local API definitions/documentation

이번 작업에서는 code, route, package, schema, migration, sitemap, robots, redirect, CMS, test를 수정하거나 생성하지 않았다. `06_CONTENT_SEO_ARCHITECTURE.md`도 수정하지 않았다. 생성한 파일은 이 validation 문서 하나다.

판정값:

- `SUPPORTED`: 현재 Repository capability와 충돌하지 않고 그대로 구현 가능
- `SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT`: Architecture 의미는 유지되지만 exact Next.js API, query, index, runtime boundary 또는 migration 순서 조정 필요
- `CONFLICT`: Architecture amendment 없이는 구현 불가
- `NOT_IMPLEMENTED`: Architecture capability가 현재 runtime/schema에 아직 없음
- `NOT_VERIFIABLE`: Production traffic, indexation 또는 external service evidence가 없음

## 1. Executive Verdict

`06_CONTENT_SEO_ARCHITECTURE.md`의 최종 판정은 **VALID_WITH_IMPLEMENTATION_ADJUSTMENTS**다.

Architecture blocker와 amendment candidate는 없다. Next.js 16.3.0 App Router는 canonical dynamic routes, Server Components, dynamic metadata, native `sitemap.ts`/`robots.ts`, Draft Mode, JSON-LD, Node-side DB access, cache tags/path revalidation, permanent redirect를 모두 지원한다. 현재 app이 사실상 빈 상태이므로 namespace collision이나 기존 client-only architecture를 해체해야 하는 위험도 없다.

다만 “지원된다”와 “구현되어 있다”는 다르다. 실제 runtime route는 `/api/health` 하나뿐이다. root layout, public page, metadata, public query service, sitemap, robots, redirect resolver, auth, CMS/editor, sanitizer, analytics, cache revalidation adapter는 모두 없다. canonical Institution/Opportunity/Article/User schema도 `04_DATA_MODEL.md`의 target이며 아직 migration되지 않았다.

필수 구현 조정:

1. Next.js 16.3의 Node runtime에서 `cacheComponents: true`를 명시하고 cacheable public DAL에 `'use cache'`, `cacheLife`, `cacheTag`를 적용한다.
2. public route는 Server Component가 DB/DAL을 직접 호출하며 내부 Route Handler를 통한 client/API waterfall을 만들지 않는다.
3. personalized Follow state는 별도 Client Component island로 격리해 public core content cache를 오염시키지 않는다.
4. 외부 Outbox worker는 `next/cache`를 직접 호출하지 않고 보호된 same-app Route Handler로 typed revalidation request를 보낸다.
5. `APP_BASE_URL`을 root `metadataBase`와 centralized canonical builder의 authoritative origin으로 사용한다.
6. Institution/Opportunity indexability는 DB column 없이 deterministic projection으로 유지하고 Article robots fields만 target schema에서 저장한다.
7. MVP sitemap은 DB-driven `app/sitemap.ts` 하나로 시작하고 indexable canonical rows만 포함한다.
8. `url_redirects`는 canonical dynamic route와 last-resort redirect resolver에서 exact path lookup하며 308을 표준으로 선택한다.
9. reverse internal-link query를 위해 relation table에 target-side index를 추가하고 batch query로 N+1을 피한다.
10. Article publish 전에 Node-compatible server sanitizer capability를 추가하되 specific vendor/package를 Architecture에 고정하지 않는다.
11. semantic public modification timestamp를 sitemap/JSON-LD에 사용하고 generic `updated_at`을 무조건 노출하지 않는다.

## 2. Runtime Inventory

### 2.1 Framework and Runtime

| Item | Actual repository evidence | Classification | Implication |
| --- | --- | --- | --- |
| Node | `package.json` requires `>=22.0.0` | IMPLEMENTED | Node runtime DB/sanitizer/Next cache 사용 가능 |
| Next.js | `next` 16.3.0 | IMPLEMENTED | App Router, Cache Components, Metadata API, native sitemap/robots 지원 |
| React | `react`, `react-dom` 19.2.8 | IMPLEMENTED | Server/Client Component 분리 가능 |
| Router | `app/` exists | IMPLEMENTED MINIMAL | App Router이나 page/layout은 없음 |
| DB | PostgreSQL 16, Drizzle 0.45.2, Postgres.js 3.4.9 | IMPLEMENTED | Server DAL과 projection query 가능 |
| Runtime mode | no Edge export/config | IMPLEMENTED DEFAULT | Node runtime과 충돌 없음 |
| Cache Components | empty `next.config.ts` | NOT_IMPLEMENTED | Next 16 recommended cache model을 opt-in 해야 함 |

Version evidence: `package.json:24-30`. `next.config.ts`는 empty config object뿐이다.

### 2.2 Actual Route Tree

| Route | Source | Classification |
| --- | --- | --- |
| `/api/health` | `app/api/health/route.ts` | IMPLEMENTED and unit tested |
| `/` | 없음 | NOT_IMPLEMENTED |
| `/institutions` | 없음 | NOT_IMPLEMENTED |
| `/institutions/[slug]` | 없음 | NOT_IMPLEMENTED |
| `/opportunities/[slug]` | 없음 | NOT_IMPLEMENTED |
| `/articles/[slug]` | 없음 | NOT_IMPLEMENTED |
| `/my-preppy` | 없음 | NOT_IMPLEMENTED |
| `/login` | 없음 | NOT_IMPLEMENTED |
| `/auth/kakao/callback` | 없음 | NOT_IMPLEMENTED |
| `/admin/*` | 없음 | NOT_IMPLEMENTED |
| `/schools*` | 없음 | NOT_FOUND |
| `/guides*` | 없음 | NOT_FOUND |
| `/updates*` | 없음 | NOT_FOUND |

Generated `.next/types/routes.d.ts`도 `AppRoutes = never`, `AppRouteHandlerRoutes = "/api/health"`, `LayoutRoutes = never`, `RedirectRoutes = never`로 확인된다. `.next/server/app-paths-manifest.json`에는 framework error paths와 health route만 있다.

### 2.3 Layout, Metadata and Static Assets

| Capability | Actual state | Classification |
| --- | --- | --- |
| root `app/layout.tsx` | 없음 | NOT_IMPLEMENTED |
| page metadata exports/helpers | 없음 | NOT_FOUND |
| `metadataBase` | 없음 | NOT_IMPLEMENTED |
| canonical builder | 없음 | NOT_IMPLEMENTED |
| Open Graph | 없음 | NOT_IMPLEMENTED |
| JSON-LD | 없음 | NOT_IMPLEMENTED |
| `app/sitemap.ts` / sitemap route | 없음 | NOT_FOUND |
| `app/robots.ts` / robots file | 없음 | NOT_FOUND |
| `middleware.ts` / `proxy.ts` | 없음 | NOT_FOUND |
| `public/` | 없음 | NOT_FOUND |
| CSS files/UI library | 없음 | NOT_FOUND |
| image config/assets | 없음 | NOT_FOUND |

### 2.4 Application Dependencies

Production dependencies는 Drizzle, Next, Postgres.js, React, Zod뿐이다. 다음 capability는 package와 code 모두 없다.

| Capability | Classification |
| --- | --- |
| CMS/editor/Tiptap | NOT_IMPLEMENTED |
| HTML sanitizer/parser | NOT_FOUND |
| authentication/OIDC/Kakao runtime | NOT_IMPLEMENTED; env placeholders only |
| analytics/GA4/GSC SDK | NOT_FOUND |
| SEO plugin | NOT_FOUND and not required |
| search engine/graph DB | NOT_FOUND and not required |

`README.md:12`도 Public pages, Admin UI, collection, extraction, email, Alert dispatch가 intentionally not implemented라고 명시한다.

## 3. Canonical Route Validation

**Status: SUPPORTED; routes NOT_IMPLEMENTED**

Target namespaces:

```text
/
/institutions
/institutions/[slug]
/opportunities/[slug]
/articles/[slug]
/my-preppy
```

현재 구현 route와 collision이 없다. `/api/health`는 `api` namespace 아래 독립되어 있다. App Router dynamic segment는 `app/institutions/[slug]/page.tsx`, `app/opportunities/[slug]/page.tsx`, `app/articles/[slug]/page.tsx`로 자연스럽게 구현할 수 있다.

현재 `/schools`, `/guides`, `/updates` page/route는 없으므로 route migration은 현재 source 기준으로 필요하지 않다. legacy Guide/Update는 DB table이지 runtime URL이 아니다. Production URL/traffic은 Repository만으로 알 수 없으므로 conditional migration preflight가 필요하다.

Unknown canonical slug는 shared resolver가 canonical entity와 redirect source를 확인한 뒤 `notFound()`로 404를 반환한다. HTTP 200 empty template을 만들 이유가 없다.

## 4. Server Rendering Validation

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

Next.js 16.3 App Router page는 기본 Server Component다. public DAL을 server-only module로 두고 PostgreSQL을 직접 조회하면 Article, Institution, Opportunity의 title/body/dates/source/links를 initial server-rendered HTML에 포함할 수 있다.

권장 boundary:

```text
App Router Server Page
→ public query/DAL
→ PostgreSQL
→ semantic DTO
→ server HTML + metadata + JSON-LD

Client Follow Island
→ session/current follow endpoint or server action
→ personalized state only
```

Server Component가 same-app API Route Handler를 fetch하지 않는다. 설치된 Next 16 local documentation도 Server Component는 Route Handler를 경유하지 말고 data source를 직접 호출하도록 안내하며, build-time에는 내부 HTTP server가 없고 request-time에도 불필요한 round trip이 생긴다.

현재 `src/db/connection.ts`는 `max: 1` singleton health-check helper이고 query-capable Drizzle DAL을 노출하지 않는다. public query layer와 request-safe connection lifecycle은 신규 구현이 필요하다.

Follow button은 anonymous default CTA를 server HTML에 두고 hydration 후 authenticated state만 갱신할 수 있다. cookies/user lookup을 public cached query 안에서 읽지 않으므로 public page 전체를 dynamic/client-only로 만들 필요가 없다.

## 5. Recommended Rendering Model

현재 app에 migration할 public behavior가 전혀 없으므로 Next 16.3의 current model을 바로 채택한다.

```ts
// logical recommendation only
const nextConfig = {
  cacheComponents: true,
}
```

Cache Components는 Node runtime이 필요하고 Repository는 이미 Node 22/Postgres.js 기반이며 Edge route가 없다. cacheable DAL 함수/Server Component에는 `'use cache'`, `cacheLife`, `cacheTag`를 사용한다. dynamic or personalized 부분만 Suspense/Client island로 분리한다.

| Page | Recommended model | Cache/freshness | Reason |
| --- | --- | --- | --- |
| Home | cached Server Component | short/medium `cacheLife`, tags for home/opportunities/articles | crawlable stable shell + changing highlights |
| Institution List | unfiltered result cached; filter request server-rendered | list tag; normalized filter query optionally short cache | base hub reused, arbitrary filters remain noindex |
| Institution Detail | cached Server Component | `institution:{id}`, related opportunity/article tags; hours-level fallback | profile is mostly evergreen but verified changes invalidate |
| Opportunity Detail | cached Server Component | `opportunity:{id}` with minutes-level fallback plus immediate event invalidation | highest freshness without all-request dynamic SSR |
| Article Detail | cached Server Component | `article:{id}` with long fallback plus publish/update invalidation | editorial content changes only on explicit publish |
| My Preppy | dynamic authenticated server render | no shared cache | private personalized product surface |

Exact cache duration은 operational data로 조정한다. Architecture에 숫자 SLA를 고정하지 않는다. Tag invalidation이 primary correctness mechanism이고 cache life는 missed-event 안전망이다.

## 6. Cache Revalidation Validation

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

### 6.1 Next Runtime Boundary

Installed Next 16.3의 `revalidateTag`/`revalidatePath`는 Server Function과 Route Handler에서 호출하도록 정의된다. standalone Node worker에서 `next/cache`를 직접 import해 호출하는 topology는 supported execution context가 아니다.

따라서 가장 단순한 safe MVP topology는 다음이다.

```text
verified domain transaction
  → dedicated CACHE_REVALIDATION_REQUESTED outbox row
  → COMMIT

Outbox worker
  → authenticated POST to same-app internal Route Handler

Next Route Handler
  → validate typed/allowlisted request
  → revalidateTag(...)
  → revalidatePath(...) where needed
  → success response

worker
  → mark outbox processed or retry/dead-letter
```

DB commit은 Route Handler 성공에 의존하지 않는다. Cache failure는 stale page를 만들 수 있지만 verified truth를 rollback하지 않는다.

### 6.2 Tag/Path Policy

| Domain event | Minimum invalidation |
| --- | --- |
| Institution publish/profile/fact change | institution tag, institution list/home tags, sitemap when indexability/lastmod changes |
| Opportunity publish/change/hide/archive | opportunity tag, parent institution/home tags, sitemap when inclusion/lastmod changes |
| Article publish/update/unpublish | article tag, article list/home/related target tags, sitemap |
| Slug change | old path, new path/entity tag, sitemap, redirect resolver cache |
| Source no-change | none |

Urgent externally triggered verified change는 `revalidateTag(tag, { expire: 0 })` 또는 literal path revalidation을 사용하고, stale-tolerant editorial aggregates는 `revalidateTag(tag, "max")`를 사용할 수 있다. single-argument `revalidateTag`는 Next 16.3에서 deprecated이므로 사용하지 않는다.

Route Handler는 arbitrary path/tag를 그대로 실행하지 않는다. domain event type과 canonical ID를 받아 server-side route/tag registry가 허용된 tags/paths를 계산한다. 내부 secret/HMAC, replay/dedupe, safe logs가 필요하다.

## 7. Metadata Validation

**Status: SUPPORTED; NOT_IMPLEMENTED**

Next 16.3은 Server Component의 static `metadata`와 async `generateMetadata`를 지원한다. dynamic slug와 DB state에 따라 title, description, canonical, robots, Open Graph를 server-side 생성할 수 있다.

`APP_BASE_URL`은 `.env.example:2`에 있고 `src/config/env.ts:21-22`에서 HTTP(S) URL로 검증한다. 새 host field는 필요 없다. root layout에서 이를 `metadataBase`로 설정하고 canonical builder도 같은 origin을 사용한다. 요청의 untrusted Host header를 canonical source로 사용하지 않는다.

권장 module ownership:

```text
src/seo/routes.ts          canonical path registry
src/seo/indexability.ts   deterministic policy
src/seo/metadata.ts       SeoMetadataBuilder
src/seo/structured-data.ts
```

page별 `generateMetadata`는 builder에 semantic DTO만 전달한다. title/canonical/robots rule을 route file마다 복제하지 않는다. Page와 metadata가 같은 entity query를 공유해 publication/indexability 판정이 달라지지 않게 한다.

OG image가 없으면 stable PREPPY fallback asset을 사용한다. Dynamic OG generation은 launch blocker가 아니다.

## 8. Publication vs Indexability

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

Institution/Opportunity에는 `seo_index_state` column이 없어도 충분하다.

```text
publication state
+ current verified truth
+ official source/evidence
+ minimum unique content
→ INDEX / NOINDEX / NOT_PUBLIC
```

이 projection은 page metadata, sitemap query, internal link query가 동일한 pure policy/DAL predicate를 사용해야 한다. page는 index인데 sitemap에서는 빠지는 drift를 방지한다.

Target Article의 `robots_index`, `robots_follow`, status/content/slug fields는 `04_DATA_MODEL.md`에 문서화되어 있으나 현재 schema에는 없다. 기존 `guides`/`updates`에는 status, slug, Markdown, SEO title/meta description만 있고 robots/canonical/content_html/author/relations가 없다.

Institution/Opportunity override column은 MVP에 추가하지 않는다. 운영상 예외가 실제로 반복될 때만 후속 설계한다.

## 9. Filter and Search URL Validation

**Status: SUPPORTED; routes NOT_IMPLEMENTED**

`/institutions` page의 `searchParams`와 `generateMetadata`로 middleware/rewrite 없이 다음을 구현할 수 있다.

```text
base /institutions
→ index,follow
→ self canonical

/institutions?...filter...
→ server-rendered useful result
→ noindex,follow
→ canonical /institutions
```

UTM parameter는 analytics landing attribution에는 남기되 canonical builder가 제거한다. Filter/query combination은 sitemap query가 생성하지 않는다.

`/search?q=...`가 향후 구현되면 동일하게 `noindex,follow`다. 현재 `/search` route나 search dependency는 없다. SEO landing page로 승격할 조합이 검증되기 전 dedicated landing taxonomy를 추가하지 않는다.

## 10. Sitemap Validation

**Status: SUPPORTED; NOT_IMPLEMENTED**

Next 16.3은 root `app/sitemap.ts`가 `MetadataRoute.Sitemap`을 반환하는 native convention을 제공한다. DB에서 static pages와 indexable Institution/Opportunity/Article을 조회해 single `/sitemap.xml`을 생성할 수 있다.

MVP recommendation: **single sitemap**.

- 초기 20–45개 기관과 제한된 Opportunity/Article volume에는 sitemap index/sharding 이점이 없다.
- query/filter/preview/private/redirect source는 query에서 제외한다.
- lastmod는 semantic timestamp projection만 사용한다.
- publish/indexability/slug/meaningful truth change 시 sitemap path/tag를 revalidate한다.
- source no-change는 sitemap을 revalidate하지 않는다.

Volume이 protocol/operational threshold에 실제로 도달하기 전 `generateSitemaps`나 shard를 도입하지 않는다.

## 11. Robots.txt Validation

**Status: SUPPORTED; NOT_IMPLEMENTED**

Next 16.3 native `app/robots.ts`에서 `MetadataRoute.Robots`를 반환할 수 있다. `APP_BASE_URL`로 sitemap URL을 생성한다.

권장 policy:

- `/admin/`, `/auth/`, internal `/api/` crawl 제한
- sitemap reference 포함
- `/my-preppy`, login, preview, private pages는 반드시 page metadata에서도 noindex

robots.txt는 noindex 대체가 아니다. private page를 robots로 막기만 하면 crawler가 page-level noindex를 읽지 못할 수 있다. 인증/authorization이 실제 privacy boundary다.

## 12. Slug and Redirect Validation

**Status: SUPPORTED_AFTER_TARGET_SCHEMA; current redirect runtime NOT_IMPLEMENTED**

Target `url_redirects(source_path PK,target_path,status_code,...)`는 현재 table/route namespace와 충돌하지 않는다. `04A`에서 additive feasibility가 이미 통과했다.

### 12.1 Recommended Resolution

1. canonical dynamic route는 entity slug를 먼저 조회한다.
2. 없으면 exact request path를 `url_redirects`에서 조회한다.
3. enabled redirect면 normalized current target로 permanent redirect한다.
4. 없으면 `notFound()`.
5. canonical namespaces 밖의 historical path는 last-resort catch-all redirect resolver가 처리할 수 있다.

Specific App Router routes가 catch-all보다 우선하므로 `/api/health`, `/institutions`, `/articles` namespace와 자연스럽게 공존한다. Proxy/middleware에서 모든 request마다 DB lookup할 필요가 없다.

표준 status는 **308**을 권장한다. Next native `permanentRedirect()`와 일치하며 permanent migration semantics를 제공한다. Architecture가 허용한 301/308 중 하나를 일관되게 선택하는 구현 결정이다.

### 12.2 Write-time Safety

Slug change transaction은 다음을 검증한다.

- new canonical path가 entity slug unique와 route registry에 충돌하지 않음
- redirect source path로 이미 사용되지 않음
- source != target
- target이 다른 redirect source가 아닌 current canonical path
- existing redirects pointing to old canonical are flattened to new canonical
- loop/chain 없음

Redirect lookup만으로 safety를 해결하지 않고 write-time service가 graph를 normalize한다.

## 13. Legacy Route Reality

| Namespace | Runtime source | DB schema | Repository conclusion | Production traffic |
| --- | --- | --- | --- | --- |
| `/schools` | 없음 | `schools` table | docs/schema only, not runtime route | NOT_VERIFIABLE |
| `/guides` | 없음 | `guides` table | docs/schema only, not runtime route | NOT_VERIFIABLE |
| `/updates` | 없음 | `updates` table | docs/schema only, not runtime route | NOT_VERIFIABLE |

따라서 mass redirect는 현재 requirement가 아니다. Production GSC/index/backlink/log에서 actual URL이 발견될 때만 mapping을 만들고 `/schools/{slug}→/institutions/{slug}`, `/guides|updates/{slug}→/articles/{slug}`를 조건부 적용한다.

**Legacy Redirect Requirement: CONDITIONAL.** External exposure 자체는 `NOT_VERIFIABLE`이다.

## 14. Article Schema and CMS Validation

**Status: TARGET SUPPORTED; CURRENT IMPLEMENTATION ABSENT**

| Capability | Existing `guides`/`updates` | Target `articles` | Current status |
| --- | --- | --- | --- |
| slug unique | yes, table별 unique | global Article slug unique | legacy implemented / target not implemented |
| type/category | separate table identity only | GUIDE/UPDATE/ROUNDUP + category | NOT_IMPLEMENTED |
| body | `body_markdown` | sanitized `content_html` | NOT_IMPLEMENTED |
| SEO title | `seo_title` | `seo_title` | legacy implemented |
| SEO description | `meta_description` | `seo_description` | compatible rename/mapping needed |
| canonical override | 없음 | `canonical_url` | NOT_IMPLEMENTED |
| robots index/follow | 없음 | booleans | NOT_IMPLEMENTED |
| featured image/alt | 없음 | target fields | NOT_IMPLEMENTED |
| author | 없음 | Admin UUID FK | NOT_IMPLEMENTED; key type compatible |
| preview/publish lifecycle | DRAFT/REVIEW/PUBLISHED/ARCHIVED | DRAFT/PUBLISHED/UNPUBLISHED/ARCHIVED | target migration/workflow needed |
| relations | `update_changes` only | Article↔Institution/Opportunity | NOT_IMPLEMENTED |

Article target fields와 legacy schema 사이에 namespace/PK conflict는 없다. Existing Guide/Update row count와 migration truth는 Production DB 없이는 검증할 수 없다. Target Article를 canonical write path로 만들고 legacy data migration은 preflight 결과에 따라 조건부 수행한다.

현재 editor/CMS/admin page가 없으므로 Tiptap + source editor는 NOT_IMPLEMENTED다. Third-party headless CMS는 Architecture에 필요하지 않다.

## 15. Sanitization Validation

**Status: CAPABILITY REQUIRED; NOT_FOUND**

현재 dependency에는 HTML sanitizer/parser가 없다. Zod는 content envelope/schema validation에는 유용하지만 unsafe HTML을 sanitize하지 않는다.

필요 capability:

- server-side DOM/HTML parsing
- tag/attribute/protocol allowlist
- script/event handler/unsafe URI 제거
- iframe/embed host allowlist
- link `rel` normalization
- deterministic output suitable for preview and published render

특정 package 이름을 Architecture contract로 고정하지 않는다. 선택한 sanitizer가 Node 22/Next 16 Server runtime과 호환되고 browser-only DOM global에 의존하지 않아야 한다. Postgres.js와 sanitizer 때문에 Article publish/preview는 Edge runtime으로 보내지 않는다.

Public render는 sanitized invariant가 성립한 `content_html`만 `dangerouslySetInnerHTML`에 전달한다. Preview도 raw editor HTML이 아니라 같은 server sanitizer 결과를 사용한다.

## 16. Preview Architecture Validation

**Status: SUPPORTED; auth/preview runtime NOT_IMPLEMENTED**

현재 auth route/session/provider는 없고 `ADMIN_AUTH_*` environment validation만 있다. 따라서 authenticated preview는 아직 동작하지 않는다.

가장 단순한 same-repo MVP:

- authenticated `/admin/articles/[id]/preview` server page
- shared Article renderer에 sanitized draft DTO 전달
- dynamic/private response
- `noindex,nofollow`
- sitemap 제외
- raw token/ID를 public metadata에 노출하지 않음

Public canonical path와 동일 rendering을 확인해야 하면 Next Draft Mode를 보호된 Route Handler/session과 함께 사용할 수 있다. Draft Mode는 cache를 우회하지만 authorization을 제공하지 않으므로 반드시 admin session 또는 one-time secret 검증과 결합한다. query-provided redirect path는 open redirect 방지를 위해 DB-resolved path로 normalize한다.

## 17. Structured Data Validation

**Status: SUPPORTED; NOT_IMPLEMENTED**

Server Component에서 verified DTO로 JSON-LD를 만들 수 있다. JSON serialization 시 `<` 등을 escape해 script-breakout을 방지하고 visible page와 동일한 data를 사용한다.

| Page | Eligible markup | Guard |
| --- | --- | --- |
| Institution | `EducationalOrganization` 또는 `Organization` + `BreadcrumbList` | category와 legal reality에 맞는 type; 영유를 `School`로 단정하지 않음 |
| Opportunity | `BreadcrumbList`; selective `Event` | event-like kind, verified date/name/location or online semantics가 모두 있을 때만 |
| Article | `Article` + `BreadcrumbList` | published/sanitized/visible headline, dates, author/image only |

APPLICATION/DEADLINE/RECRUITMENT는 이름 때문에 자동 `Event`가 아니다. insufficient data면 markup을 생략한다. Rich result 획득은 검색엔진 판단이므로 보장할 수 없다.

## 18. Date and Freshness Validation

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

현재 migration의 generic `set_updated_at` trigger는 schools, admission events/facts, guides, updates 등 mutable table의 모든 UPDATE에 반응한다. 따라서 raw `updated_at`을 sitemap `lastmod`나 Article `dateModified`로 무조건 사용하면 internal/maintenance update가 false freshness가 될 수 있다.

권장 semantic projection:

| Object | Public date source |
| --- | --- |
| Article | initial `published_at`; 이후 actual published editorial update timestamp |
| Institution | publication/profile public change 또는 latest verified public Fact/change timestamp |
| Native Opportunity | current verified version `verified_at` / meaningful change `published_at` |
| Legacy Opportunity | current verified EventVersion `verified_at` / canonical OpportunityChange published time |
| Source | Observation `observed_at`, public entity modified date로 사용하지 않음 |

Target Article publish service가 public content/SEO field update를 통제하면 target `updated_at`을 editorial modification으로 사용할 수 있다. backfill이나 internal-only maintenance timestamp는 그대로 복사해 JSON-LD에 노출하지 않는다. MVP에 별도 `seo_modified_at` column은 필요하지 않다.

`ConfirmNoChange`는 `source_observations`와 Audit만 insert한다. `source_observations`에는 public entity updated_at trigger가 없고 `05A`도 Version/Change/cache/sitemap write를 금지한다. 따라서 no-change가 false lastmod/dateModified를 만들지 않게 구현 가능하다.

## 19. Internal Linking Validation

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

Target `article_institutions`, `article_opportunities`와 `opportunities.institution_id`로 양방향 linking query가 가능하다. search engine이나 graph DB는 필요 없다.

`UNIQUE(article_id,institution_id,relation_type)`와 `UNIQUE(article_id,opportunity_id,relation_type)`는 Article→target lookup에는 유용하지만 reverse query의 leading column이 target ID가 아니다. 실제 reverse section을 구현할 때 다음 indexes를 추가한다.

```text
article_institutions(institution_id, article_id)
article_opportunities(opportunity_id, article_id)
```

이는 Data Model amendment가 아니라 query-driven index adjustment다. Renderer는 relation target을 개별 row마다 조회하지 않고 join/batch query로 가져오며, 반드시 target publication/indexability를 필터한다. Unpublished/hidden target은 CTA를 omit하고 Admin validation warning 대상으로 남긴다.

## 20. Opportunity Current Projection SSR

**Status: SUPPORTED_AFTER_TARGET_IMPLEMENTATION**

canonical query layer는 persistence mode를 숨긴 하나의 DTO를 반환한다.

```text
NATIVE
→ opportunities
→ current VERIFIED opportunity_versions
→ evidence/source

LEGACY_BACKED
→ opportunity_admission_event_links
→ admission_events
→ current VERIFIED admission_event_versions
→ evidence/source

both
→ CurrentOpportunityPublicProjection
```

PostgreSQL join/UNION 또는 application mapper로 구현 가능하다. `04A`의 bridge aggregate consistency가 선행 조건이다. Server Page와 `generateMetadata`가 이 query를 직접 호출하므로 client API가 필요 없다. Last Verified와 Official Source도 evidence join으로 initial HTML에 렌더 가능하다.

현재 target Opportunity/Version/bridge table과 query service는 NOT_IMPLEMENTED다.

## 21. Opportunity Expiry and Archive

**Status: SUPPORTED**

Existing legacy EventVersion은 SCHEDULED/ACTIVE/CLOSED/COMPLETED/CANCELLED를 지원하고 target Opportunity는 publication state와 business state를 분리한다. CLOSED/COMPLETED/CANCELLED를 자동 404, redirect, noindex로 만드는 runtime code는 없다.

따라서 completed historical page를 유지하고 value/indexability policy로 판단하는 `06` rule과 충돌하지 않는다. 삭제/redirect/noindex는 별도 explicit publication command가 소유한다.

## 22. Performance Boundary

**Status: SUPPORTED; current public bundle absent**

- Admin/editor component는 `/admin` route group/server boundary 아래 두고 public layout에서 import하지 않는다.
- public core content는 Server Component로 렌더해 client JS를 최소화한다.
- Follow와 analytics만 작은 Client Component로 격리한다.
- Next built-in Image capability를 사용할 수 있으나 현재 image assets/config는 없다.
- featured/public images는 dimensions 또는 aspect ratio를 data/asset contract에 포함해 layout shift를 줄인다.
- filter interaction은 hydrate할 수 있지만 crawl navigation은 actual links/forms를 유지한다.

현재 public app이 없으므로 measured performance blocker도 없다. Core Web Vitals 수치 SLA는 launch instrumentation 후 정한다.

## 23. Search Analytics Boundary

**Status: NOT_IMPLEMENTED**

Repository에 GA4/GSC wiring, analytics dependency, client event adapter, public route metadata가 없다. `06`의 canonical UUID 기반 events는 route/DAL DTO와 충돌하지 않는다.

권장 boundary:

```text
UI event
→ provider-neutral analytics adapter
→ canonical entity IDs + landing/UTM
```

UTM은 analytics context에만 유지하고 canonical URL에는 포함하지 않는다. GSC는 index/query observation이며 Publication/Indexability truth를 변경하지 않는다. GSC API integration은 launch blocker가 아니다.

## 24. SEO-001–SEO-026 Validation Matrix

| SEO | Decision | Repository Evidence | Status | Adjustment | Amendment? |
| --- | --- | --- | --- | --- | --- |
| SEO-001 | canonical objects Article/Institution/Opportunity | target schema documented; current legacy School/Guide/Update only | NOT_IMPLEMENTED | `04` target schema/query 먼저 구현 | NO |
| SEO-002 | SEO is MVP architecture | Next App Router foundation exists | SUPPORTED | public layer 신규 구현 | NO |
| SEO-003 | public ≠ indexable | target state/robots fields support projection | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | shared policy predicate | NO |
| SEO-004 | core content initial server HTML | Next Server Components supported; no pages exist | NOT_IMPLEMENTED | server DAL/page 구현 | NO |
| SEO-005 | Follow does not make page client-only | React/Next component boundary supported | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | Client Follow island | NO |
| SEO-006 | canonical route taxonomy | generated route tree has only `/api/health`; no collision | NOT_IMPLEMENTED | App Router pages 추가 | NO |
| SEO-007 | filter/search noindex | Metadata API supports robots/canonical | NOT_IMPLEMENTED | searchParams-aware builder | NO |
| SEO-008 | self canonical | `APP_BASE_URL` validated | NOT_IMPLEMENTED | centralized route builder/metadataBase | NO |
| SEO-009 | draft/private noindex+sitemap exclusion | metadata/sitemap capability exists; auth absent | NOT_IMPLEMENTED | auth/preview policies | NO |
| SEO-010 | explicit slug migration+redirect | target `url_redirects` validated in `04A` | NOT_IMPLEMENTED | transaction + resolver | NO |
| SEO-011 | title edit does not change slug | legacy and target slug separate from title | SUPPORTED | explicit slug command | NO |
| SEO-012 | no redirect chain/loop | target PK/self-check; application rules required | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | write-time normalization | NO |
| SEO-013 | structured Article relations | target relation tables; current absent | NOT_IMPLEMENTED | target indexes/batch query | NO |
| SEO-014 | Institution↔Opportunity canonical link | target FK/bridge validated | NOT_IMPLEMENTED | public projection query | NO |
| SEO-015 | Article not Opportunity truth | separate target aggregate | SUPPORTED | renderer reads canonical relation target | NO |
| SEO-016 | structured data visible/verified only | server JSON-LD feasible; code absent | NOT_IMPLEMENTED | shared verified DTO | NO |
| SEO-017 | selective Event markup | Opportunity kind/date projection supports guard | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | eligibility function | NO |
| SEO-018 | no false freshness from updated_at/check | generic triggers exist; Observation isolated | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | semantic timestamp builder | NO |
| SEO-019 | Last Verified ≠ Last Checked | EventVersion `verified_at`, Observation `observed_at` distinct | SUPPORTED | preserve DTO names/labels | NO |
| SEO-020 | sitemap canonical indexable only | native sitemap supported; no implementation | NOT_IMPLEMENTED | shared indexability query | NO |
| SEO-021 | backfill no fake freshness/thin pages | `05A` live/backfill separation; target migration pending | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | silent import + indexability gate | NO |
| SEO-022 | legacy redirect only with evidence | no legacy runtime routes; production traffic unavailable | NOT_VERIFIABLE | production GSC/log/backlink preflight | NO |
| SEO-023 | no premature programmatic SEO | no route/page generator exists | SUPPORTED | keep non-scope | NO |
| SEO-024 | Article HTML sanitized server-side | no sanitizer dependency | NOT_IMPLEMENTED | Node-compatible capability before publish | NO |
| SEO-025 | post-commit retryable cache/sitemap revalidation | Outbox base exists; Next APIs only Route Handler/Server Function | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | protected revalidation Route Handler | NO |
| SEO-026 | My Preppy/Auth/Admin not acquisition | no such routes; separation feasible | NOT_IMPLEMENTED | private route metadata/auth | NO |

`CONFLICT`와 Architecture amendment가 필요한 decision은 없다.

## 25. Acceptance Scenario Validation

| Scenario | Status | Repository proof / required implementation |
| --- | --- | --- |
| 1. Article search landing | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | Article schema, server route/DAL, relations, Follow island 구현 후 initial HTML 가능 |
| 2. Institution slug redirect | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | slug transaction + `url_redirects` + 308 resolver 필요 |
| 3. Draft Article preview | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | auth/session + shared sanitizer/renderer + noindex 필요 |
| 4. Filter noindex/canonical | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | `searchParams` metadata policy로 middleware 없이 가능 |
| 5. Native Opportunity publish/sitemap | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | canonical schema/projection/page/sitemap/outbox revalidation 필요 |
| 6. Completed Opportunity retention | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | state and publication 분리; automatic deletion code 없음 |
| 7. Monitoring date change revalidation | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | dedicated cache outbox + protected Route Handler 필요 |
| 8. No-change no false freshness | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | `05A` command path가 Version/public update/outbox를 만들지 않는 test 필요 |
| 9. Legacy Guide migration | NOT_VERIFIABLE | actual production URL/row/traffic evidence가 있을 때만 redirect |
| 10. Unpublished related Opportunity | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | publication-filtered batch query + Admin warning 필요 |
| 11. Insufficient Event markup | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | eligibility function이 JSON-LD를 omit |
| 12. Private My Preppy | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | auth, dynamic no-cache page, noindex, sitemap exclusion 필요 |

Blocked scenario는 없다. Scenario 9만 external production evidence 부재로 `NOT_VERIFIABLE`이다.

## 26. SEO Invariant Matrix

| SEO Rule | DB | Server Rendering | Metadata | Routing | Application Policy | Feasibility |
| --- | --- | --- | --- | --- | --- | --- |
| canonical slug unique | entity slug unique target | canonical entity lookup | canonical from canonical slug | redirect source reserved | explicit slug command | SUPPORTED_AFTER_TARGET_SCHEMA |
| public vs indexable separation | Article robots fields; entity publication/truth | NOT_PUBLIC 404, NOINDEX renders safely | shared robots projection | same canonical route | deterministic eligibility | SUPPORTED |
| initial HTML content | canonical current/evidence query | Server Component | metadata uses same DTO | page route | no client API waterfall | SUPPORTED |
| self canonical | no extra entity field needed | N/A | `metadataBase` + route registry | stable canonical route | strip query/tracking | SUPPORTED |
| draft preview noindex | Article status | authenticated draft render | noindex,nofollow | admin/Draft Mode route | sanitize and authorize | SUPPORTED |
| filter noindex | no DB change | result server-rendered | noindex,follow + base canonical | `/institutions?...` | normalize known filters | SUPPORTED |
| sitemap indexable-only | publication/indexability predicate | N/A | N/A | `app/sitemap.ts` | reuse same predicate | SUPPORTED |
| slug redirect no chain | `source_path` PK/self check | N/A | target self canonical | 308 exact path resolver | flatten/loop validation | SUPPORTED_WITH_ADJUSTMENT |
| structured relation links | relation FK/unique + reverse indexes | anchors/cards in HTML | optional OG context | canonical target path | filter unpublished target | SUPPORTED_WITH_ADJUSTMENT |
| verified structured data | version/evidence constraints | visible verified fields | server JSON-LD | canonical page only | kind/field eligibility | SUPPORTED |
| no false lastmod | semantic version/publication timestamps | display correct Last Verified | Article dateModified only when meaningful | sitemap same semantics | no-change emits nothing | SUPPORTED_WITH_ADJUSTMENT |
| private pages noindex | user data not public query | auth + no shared cache | noindex | exclude sitemap/robots hints | authorization is real boundary | SUPPORTED |
| one canonical Opportunity URL | Opportunity slug unique | summary links to detail | self canonical | no nested duplicate detail route | route registry | SUPPORTED |
| unknown slug not soft 404 | lookup/redirect result | `notFound()` | no misleading canonical | HTTP 404 | no empty 200 template | SUPPORTED |
| sanitized Article HTML | DB stores target HTML but cannot inspect safety | render only sanitized content | no raw HTML in metadata | preview shares renderer | publish sanitizer invariant | SUPPORTED_AFTER_CAPABILITY |

## 27. Required Questions

### Q1. 06 Content/SEO Architecture를 현재 repo에 구현 가능한가?

**YES_WITH_IMPLEMENTATION_ADJUSTMENTS.** Next 16.3 capability와 route/schema namespace가 모두 호환된다. 구현 자체는 대부분 아직 없다.

### Q2. Architecture amendment가 필요한가?

**NO.** 모든 조정은 Next API topology, target schema implementation, index, service boundary 수준이다.

### Q3. 현재 실제 public route는 무엇인가?

**없다.** 구현된 route는 public content가 아닌 `/api/health` 하나뿐이다.

### Q4. legacy `/schools`, `/guides`, `/updates`는 runtime인가 docs-only인가?

**Runtime route가 아니다.** legacy DB table과 문서에는 존재하지만 app route는 없다. Production external URL 존재는 NOT_VERIFIABLE이다.

### Q5. server-render core content + personalized Follow island가 가능한가?

**YES.** Server Component/cached public DAL과 별도 Client Follow component로 분리한다.

### Q6. Institution/Opportunity indexability를 DB field 없이 policy로 계산해도 충분한가?

**YES FOR MVP.** deterministic publication/truth/source/content predicate를 page, metadata, sitemap, relation query가 공유하면 된다.

### Q7. MVP sitemap은 하나면 충분한가?

**YES.** 현재/예상 volume에서 root `app/sitemap.ts` 하나가 가장 단순하다.

### Q8. Next.js current version에서 Monitoring Outbox와 cache revalidation을 어떻게 연결하는가?

Dedicated cache revalidation outbox row를 worker가 처리하고, worker는 authenticated same-app Route Handler에 typed event를 POST한다. Handler가 Next 16 `revalidateTag`/`revalidatePath`를 호출한다. DB transaction은 이 성공에 의존하지 않는다.

### Q9. `url_redirects` 기반 redirect가 current route tree에 자연스럽게 들어가는가?

**YES.** canonical dynamic routes의 miss resolver와 last-resort catch-all resolver로 exact lookup하며 specific App routes가 우선한다. Proxy는 필요 없다.

### Q10. Article HTML sanitization capability가 현재 repo에 있는가?

**NO.** sanitizer/editor dependency와 publish service가 모두 없다.

### Q11. Opportunity structured Event markup을 selective하게 생성 가능한가?

**YES.** kind, verified date/name/location/online semantics predicate로 eligibility를 계산하고 불충분하면 omit한다.

### Q12. No-change monitoring이 false lastmod/dateModified를 만들지 않도록 구현 가능한가?

**YES.** no-change는 Observation/Audit만 기록하고 semantic public timestamps/cache/sitemap event를 건드리지 않는다.

### Q13. `07_IDENTITY_FOLLOW_NOTIFICATION.md`로 넘어가도 되는가?

**YES.** Architecture blocker/amendment가 없다.

## 28. Highest SEO Risks

1. **Public page remains unimplemented**: Architecture가 맞아도 initial HTML, canonical, sitemap이 실제로 없으면 acquisition은 0이다.
2. **Indexability policy drift**: page metadata, sitemap, internal relation query가 서로 다른 조건을 쓰면 noindex URL이 sitemap에 들어가거나 unpublished CTA가 노출된다.
3. **False freshness**: generic `updated_at` 또는 Source no-change를 dateModified/lastmod로 사용하면 search/user trust를 훼손한다.
4. **Revalidation boundary misuse**: standalone worker가 `next/cache`를 직접 호출하거나 failure를 domain transaction과 결합하면 stale/rollback 문제를 만든다.
5. **Unsafe Article HTML**: sanitizer 없이 `content_html`을 렌더하면 stored XSS가 public route와 preview에 노출된다.
6. **Redirect graph corruption**: slug write-time collision/flattening을 빼면 chain, loop, canonical path hijack이 생길 수 있다.
7. **Thin indexable pages**: publication만으로 자동 index하면 source/evidence/content가 부족한 Institution/Opportunity가 대량 색인될 수 있다.
8. **Incorrect structured Event**: Application/Deadline을 자동 Event로 변환하면 visible truth와 markup이 불일치한다.
9. **Legacy migration without evidence**: 존재하지 않는 old URL을 mass redirect하거나 stale timestamps를 복사할 수 있다.
10. **Personalization leaks into shared cache**: user Follow state를 cached public DAL에 넣으면 privacy/cache correctness가 깨진다.

## 29. Implementation Order Recommendation

1. `04`/`04A` canonical Institution, Opportunity, Article, relations, redirect schema를 additive migration으로 구현한다.
2. Node-safe DB client와 public query/DAL, Native/Legacy `CurrentOpportunityPublicProjection`을 구현한다.
3. root layout과 public route shell을 Server Component로 구현한다.
4. `APP_BASE_URL` 기반 route registry, `metadataBase`, centralized metadata/indexability builder를 구현한다.
5. Next 16 Cache Components를 활성화하고 cached DAL tags/lifetimes와 Follow island boundary를 적용한다.
6. Article server sanitizer/publish/preview invariant와 shared renderer를 구현한다.
7. single native sitemap과 robots metadata route를 구현한다.
8. slug transaction, `url_redirects`, 308 resolver, unknown 404를 구현한다.
9. cache revalidation outbox event와 protected Next Route Handler adapter를 구현한다.
10. Breadcrumb/Article/Organization/selective Event JSON-LD를 verified DTO에서 생성한다.
11. reverse relation indexes/batch internal-link query와 unpublished target validation을 추가한다.
12. provider-neutral acquisition analytics adapter를 추가하고 production GSC/log에서 legacy redirect preflight를 수행한다.

## 30. Architecture Amendment Candidate

해당 없음.

현재 Repository evidence는 `06_CONTENT_SEO_ARCHITECTURE.md`의 locked decision을 변경하도록 요구하지 않는다. Cache Components opt-in, revalidation Route Handler, reverse relation index, 308 표준화, sanitizer capability는 모두 implementation-only adjustment다.

## 31. Final Verdict

```text
Content/SEO Architecture Repository Validation Verdict

Content/SEO Architecture:
VALID_WITH_IMPLEMENTATION_ADJUSTMENTS

Ready for 07_IDENTITY_FOLLOW_NOTIFICATION:
YES

Architecture Blockers:
None.

Required Amendments:
None.

Implementation Adjustments:
Implement the target canonical schema and public DAL; add App Router Server pages; enable Next 16 Cache Components; isolate Follow as a client island; centralize indexability/metadata/canonical rules; add single native sitemap and robots route; route Outbox revalidation through a protected Next Route Handler; implement 308 redirect resolution; add reverse relation indexes; add server-side HTML sanitization; use semantic timestamps.

Current Public Route Reality:
Only /api/health exists. There are no public pages, root layout, metadata, sitemap, robots, middleware/proxy, auth route, CMS, sanitizer, analytics, or legacy /schools, /guides, /updates runtime routes.

Recommended Rendering Model:
Next.js 16.3 Node runtime with Cache Components enabled. Render public core content in cached Server Components using use cache/cacheLife/cacheTag, and isolate personalized Follow state in a small Client Component. Render My Preppy dynamically with no shared cache.

Recommended Revalidation Model:
Committed domain change → dedicated cache revalidation Outbox event → worker retry loop → authenticated same-app Route Handler → allowlisted revalidateTag/revalidatePath. Revalidation failure never rolls back domain truth.

Legacy Redirect Requirement:
CONDITIONAL

Highest SEO Risks:
1. No public SEO runtime exists yet.
2. Indexability/metadata/sitemap policy drift.
3. False freshness from generic updated_at or no-change observations.
4. Unsafe unsanitized Article HTML.
5. Redirect chains/collisions or unverified legacy migration.

Recommended Next Step:
07_IDENTITY_FOLLOW_NOTIFICATION.md
```
