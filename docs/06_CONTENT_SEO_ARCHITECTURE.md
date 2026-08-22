# 06_CONTENT_SEO_ARCHITECTURE.md

> **Project:** PREPPY (프레피)  
> **Document Type:** Content & SEO Architecture  
> **Status:** Content/SEO Architecture v1.0 — Repository validation required before implementation  
> **Product Baseline:** `00_PRODUCT_REQUIREMENTS_BASELINE.md`  
> **Target Architecture:** `02_TARGET_ARCHITECTURE.md` Target v1.1  
> **Domain Model:** `03_DOMAIN_MODEL.md` Domain v1.0  
> **Data Model:** `04_DATA_MODEL.md` Data Model v1.0  
> **Monitoring Architecture:** `05_MONITORING_ARCHITECTURE.md` v1.0  
> **Monitoring Validation:** `05A_MONITORING_ARCHITECTURE_REPOSITORY_VALIDATION.md` — VALID_WITH_IMPLEMENTATION_ADJUSTMENTS  
> **Core Principle:** SEO is a product acquisition capability, not a post-launch marketing plugin.  
> **Purpose:** PREPPY의 Editorial Article, Institution, Opportunity를 검색엔진이 안정적으로 발견·이해·색인하고, 검색 유입이 Institution/Opportunity 탐색과 Follow로 연결되도록 Public Content Architecture, rendering, metadata, canonical, robots, sitemap, structured data, internal linking, redirect, freshness, publication workflow를 정의한다.

---

# 0. Document Role

PREPPY의 Growth Loop:

```text
Google / Naver / Community
→ Editorial Article
→ Institution / Opportunity
→ Follow
→ Kakao Signup
→ Monitoring
→ Email
→ Return
```

이 문서는 위 Growth Loop의 첫 절반을 담당한다.

```text
Search / Community
→ Public Content
→ Discovery
→ Institution / Opportunity
→ Follow Intent
```

이 문서에서 결정하는 것:

1. canonical public route taxonomy
2. 어떤 object가 public page를 갖는지
3. Publication과 Search Indexability의 차이
4. SSR/SSG/ISR/Cache invalidation 원칙
5. title/meta/canonical/robots/OG
6. sitemap
7. breadcrumb
8. structured data
9. Article ↔ Institution ↔ Opportunity internal linking
10. slug/redirect 정책
11. freshness/modified date 규칙
12. draft/preview/noindex
13. SEO-safe editorial publishing flow
14. search acquisition analytics
15. thin/duplicate content 방지
16. legacy route migration 원칙

이 문서에서 결정하지 않는 것:

- 실제 React component 디자인
- exact copywriting
- keyword research calendar
- Naver Search Advisor 세부 운영
- Google Search Console API 자동화
- exact CDN/hosting provider
- exact image pipeline/provider
- Article editor library implementation details
- advertising/affiliate placement
- automated content generation
- actual Next.js source code

---

# 1. Content Architecture Objective

PREPPY는 “기관 목록 사이트”도 “블로그”도 아니다.

Public Web의 세 canonical content object는:

```text
Article
Institution
Opportunity
```

다.

각 역할:

| Object | SEO/Product Role |
|---|---|
| Article | 검색 수요를 받아 PREPPY로 유입시키는 Editorial Acquisition Asset |
| Institution | 특정 교육기관을 탐색·비교·Follow하는 evergreen Product Asset |
| Opportunity | 지금 행동 가능한 모집·설명회·지원 일정 등을 보여주는 freshness-sensitive Product Asset |

세 object는 서로 연결되어야 한다.

```text
Article
   ↔
Institution
   ↔
Opportunity
```

단순 HTML 링크만 존재하는 것이 아니라 Data Model의 explicit relations와 current domain relationships를 기반으로 한다.

---

# 2. Canonical Public Route Taxonomy

MVP canonical routes:

```text
/
/institutions
/institutions/{slug}
/opportunities/{slug}
/articles/{slug}
/my-preppy
```

Support routes:

```text
/login
/auth/kakao/callback
/privacy
/terms
```

Admin:

```text
/admin/*
```

SEO public route와 분리한다.

---

# 3. Route Ownership

## 3.1 `/`

Home.

역할:

- PREPPY value proposition
- Current Opportunities
- Institution Discovery
- Region/Age exploration
- Latest Articles
- Monitoring value
- Follow CTA

indexable.

---

## 3.2 `/institutions`

canonical Institution discovery/listing hub.

indexability:

```text
INDEX
```

단, arbitrary filter combination URL은 별도 정책을 따른다.

---

## 3.3 `/institutions/{slug}`

Institution canonical detail.

owner:

```text
Institution
```

stable identity는 Institution ID지만 URL은 canonical slug 사용.

---

## 3.4 `/opportunities/{slug}`

Opportunity canonical detail.

owner:

```text
Opportunity
```

Legacy-backed/native persistence 차이는 URL에 노출하지 않는다.

---

## 3.5 `/articles/{slug}`

Article canonical detail.

owner:

```text
Article
```

기존 `/guides`, `/updates`를 신규 canonical write namespace로 사용하지 않는다.

---

## 3.6 `/my-preppy`

authenticated product page.

```text
NOINDEX, NOFOLLOW optional
```

원칙적으로 검색 유입 대상이 아니다.

robots는 최소 `noindex`.

`nofollow` 여부는 implementation preference이며 내부 app navigation과 crawl budget을 고려해 결정할 수 있다.

---

# 4. Publication State vs Indexability

중요한 원칙:

> Publicly accessible과 Search Indexable은 같은 개념이 아니다.

각 object는 Domain publication state와 별도로 SEO projection을 가진다.

개념:

```text
PublicationState
+
ContentQuality / SEO Eligibility
=
Indexability
```

---

# 5. Indexability States

논리적 상태:

```text
INDEX
NOINDEX
NOT_PUBLIC
```

물리 DB enum 추가가 반드시 필요한 것은 아니다.

MVP에서는 route rendering policy로 계산할 수 있다.

---

# 6. Institution Indexability

Institution page가 `INDEX` 되기 위한 최소 조건:

```text
publication_state = PUBLISHED
AND canonical slug exists
AND canonical name exists
AND category exists
AND region/location is useful enough
AND at least one official Source binding
AND page has meaningful unique content
```

Meaningful unique content 최소 구성:

- Institution name/category/region
- verified admissions/current opportunity section OR meaningful institution profile
- official source/trust block
- unique core information

빈 template page를 대량 생성하지 않는다.

---

# 7. Opportunity Indexability

Opportunity는 public이라고 모두 index할 필요가 없다.

`INDEX` 기본 후보:

```text
publication_state = PUBLISHED
AND current verified truth exists
AND official Evidence exists
AND canonical title exists
AND page provides unique actionable information
```

다음은 `NOINDEX` 후보:

- 내부 migration placeholder
- 정보가 지나치게 부족한 thin opportunity
- canonical Institution page의 짧은 한 줄과 사실상 동일한 page
- 중복/파생 페이지
- 아직 검증되지 않은 draft-like public state

Opportunity가 종료되었다고 즉시 noindex하지 않는다.

과거 검색 수요/정보 가치가 남을 수 있다.

종료 후 처리 정책은 Section 45에서 정의한다.

---

# 8. Article Indexability

Article:

```text
status = PUBLISHED
AND robots_index = true
AND sanitized content exists
AND canonical slug exists
```

Draft/Preview:

```text
NOINDEX
```

`UNPUBLISHED`:

public 404/410/redirect 여부를 publication reason에 따라 결정.

---

# 9. Filter/Search URL Indexing

Institution list에서 filter query를 사용할 수 있다.

예:

```text
/institutions?category=ENGLISH_KINDERGARTEN&region=gangnam
```

MVP 기본 정책:

```text
canonical = /institutions
robots = noindex,follow
```

arbitrary combinations을 index하지 않는다.

이유:

- thin/duplicate pages
- query parameter explosion
- crawl waste

향후 검색수요가 검증된 조합은 dedicated landing page로 승격한다.

예:

```text
/regions/gangnam/english-kindergartens
```

하지만 MVP에서는 별도 SEO landing taxonomy를 미리 만들지 않는다.

---

# 10. Search Result Page

내부 검색 route가 존재할 경우:

```text
/search?q=...
```

기본:

```text
noindex,follow
```

Search result URL을 SEO landing page로 사용하지 않는다.

---

# 11. Rendering Architecture

SEO-critical public page는 crawler가 initial HTML에서 핵심 content를 읽을 수 있어야 한다.

대상:

```text
/
institutions list
institution detail
opportunity detail
article detail
```

원칙:

```text
Server-rendered HTML first
Client JS enhances interaction
```

검색엔진이 API call 이후에만 core content를 얻는 구조를 피한다.

---

# 12. Next.js Rendering Policy

현재 Target stack은 Next.js App Router다.

MVP 권장:

## Article

```text
server render
+ cacheable
+ publish/update revalidation
```

## Institution

```text
server render
+ cacheable
+ domain change revalidation
```

## Opportunity

freshness 중요도가 높다.

```text
server render
+ shorter cache / tag revalidation
```

정확히 SSG/ISR/dynamic rendering 중 어느 API를 사용할지는 implementation에서 결정한다.

Architecture는 API가 아니라 다음 보장을 요구한다.

1. initial HTML contains canonical content
2. publication/update 후 stale page를 적절히 invalidate
3. personalized data 때문에 public page 전체를 client-only로 만들지 않음
4. Follow button만 client interaction 가능

---

# 13. Cache Boundary

Public content와 personalized state를 분리한다.

Bad:

```text
Institution page
+ User Follow status
= entire page dynamic/no-cache
```

Preferred:

```text
Public Institution content
= server-cacheable

Follow button/user state
= client/personalized island
```

이렇게 하면 SEO와 cache 효율을 동시에 유지한다.

---

# 14. Revalidation Signals

Public cache invalidation은 canonical domain event 이후 발생한다.

대상:

```text
InstitutionPublished
InstitutionUpdated/FactVerified
OpportunityPublished
OpportunityChanged
OpportunityHidden/Archived
ArticlePublished
ArticleUpdated
ArticleUnpublished
SlugChanged
```

Monitoring Architecture와 동일 원칙:

> cache invalidation external side effect는 verified DB transaction을 깨뜨리지 않는다.

권장:

```text
DB commit
→ integration/outbox event
→ cache revalidation adapter
```

MVP에서 revalidation 실패 때문에 verified truth transaction을 rollback하지 않는다.

---

# 15. SEO Metadata Ownership

Metadata는 중앙 helper/contract로 생성한다.

page component마다 title/canonical rule을 임의 구현하지 않는다.

logical service:

```text
SeoMetadataBuilder
```

input:

```text
route type
canonical entity
SEO override when allowed
current verified state
```

output:

```text
title
description
canonical
robots
Open Graph
Twitter/social metadata if needed
```

---

# 16. Title Rules

## Home

Hero value 중심.

예 structure:

```text
프레피 | 영유·사립초·국제학교 입학정보와 모집 알림
```

exact copy는 Product/SEO copywriting에서 조정.

## Institution

default:

```text
{Institution Name} 입학·모집 정보 | 프레피
```

필요하면 category/context 추가.

## Opportunity

default:

```text
{Opportunity Title} | {Institution Name} | 프레피
```

## Article

`article.seo_title`이 있으면 우선.

없으면:

```text
{Article Title} | 프레피
```

---

# 17. Meta Description

meta description은 ranking guarantee가 아니라 search snippet hint다.

원칙:

- 페이지 고유 내용
- 과도한 keyword stuffing 금지
- verified current information을 근거로 생성
- 모든 Institution에 똑같은 description template만 반복하지 않음

Article:

```text
seo_description
```

없으면 excerpt 기반 fallback.

---

# 18. Canonical URL

모든 indexable page는 self-referencing canonical을 가진다.

canonical URL 생성은 route registry/helper를 사용한다.

예:

```text
https://{host}/institutions/{canonical-slug}
```

query/filter/tracking parameter는 canonical에서 제거한다.

---

# 19. Canonical Override

Article Data Model에는 `canonical_url` field가 있다.

기본값:

```text
self canonical
```

External canonical override는 특별한 migration/syndication case 외에는 사용하지 않는다.

Admin UI에서 무분별하게 editable하게 만들지 않는다.

Institution/Opportunity는 MVP에서 explicit canonical override field를 추가하지 않는다.

---

# 20. Robots Policy

## INDEX

```text
index,follow
```

## Public but low SEO value

```text
noindex,follow
```

## Draft/Preview/Auth/Admin

```text
noindex
```

robots metadata와 robots.txt를 혼동하지 않는다.

Draft URL을 robots.txt로만 막으면 검색엔진이 noindex를 읽지 못할 수 있으므로 page-level noindex를 사용한다.

---

# 21. Preview Architecture

Article Preview는 편집자가 publish 전 실제 rendering을 확인하는 기능이다.

Preview:

```text
authenticated
unguessable or session protected
noindex
not in sitemap
canonical absent or canonical to future public URL with noindex
```

Institution/Opportunity Admin preview도 동일 원칙을 적용 가능.

Preview URL을 permanent public content로 취급하지 않는다.

---

# 22. Open Graph

Public canonical page는 기본 OG metadata를 제공한다.

minimum:

```text
og:title
og:description
og:url
og:type
og:image when available
```

Article:

featured image 우선.

Institution/Opportunity:

PREPPY branded fallback OG 사용 가능.

OG image generation은 core SEO blocker가 아니다.

---

# 23. Structured Data Principles

Structured data는 page content와 일치해야 한다.

금지:

- 존재하지 않는 리뷰/별점
- 추정 tuition
- 잘못된 Event type
- page에 없는 date
- 검색 rich result를 노린 허위 markup

Structured data는 canonical verified truth에서 생성한다.

---

# 24. Breadcrumb Structured Data

다음 public detail page:

```text
Institution
Opportunity
Article
```

에서 `BreadcrumbList`를 제공한다.

예:

```text
Home
→ Institutions
→ ABC International School
```

Opportunity:

```text
Home
→ Institution
→ Opportunity
```

Article:

```text
Home
→ Articles
→ Article
```

화면 breadcrumb와 structured data를 일치시킨다.

---

# 25. Institution Structured Data

Institution에는 schema.org의 적절한 organization/education entity를 사용한다.

원칙:

- canonical name
- URL
- address when verified
- official website `sameAs` when appropriate

실제 category에 맞지 않는 subtype을 억지로 사용하지 않는다.

특히 `영유`를 법적 `School`로 단정하는 structured data를 피한다.

MVP 기본 safe strategy:

```text
EducationalOrganization or Organization
```

정확한 mapping은 implementation validation에서 markup compatibility를 검토한다.

---

# 26. Opportunity Structured Data

모든 Opportunity를 `Event`로 markup하지 않는다.

Event-compatible:

```text
INFORMATION_SESSION
OPEN_HOUSE
ASSESSMENT
INTERVIEW
LEVEL_TEST
LOTTERY
```

등 실제 행사/시간/장소 개념이 있는 경우.

Application/Deadline 등:

```text
APPLICATION
DEADLINE
RECRUITMENT
```

은 page semantic이 Event 요구와 맞지 않으면 일반 `WebPage`/breadcrumb만 제공한다.

Structured data type을 richness 때문에 왜곡하지 않는다.

---

# 27. Event Structured Data Eligibility

`Event`를 사용하는 최소 조건:

```text
event-like Opportunity kind
verified start date/time or meaningful date
name
location or online event semantics when applicable
canonical URL
verified status
```

취소:

actual Opportunity state와 structured event status를 일치시킨다.

정보 부족 시 Event markup 생략.

---

# 28. Article Structured Data

Published Article:

```text
Article
```

또는 적절한 subtype.

include when available:

```text
headline
description
datePublished
dateModified
author
image
mainEntityOfPage
publisher
```

`dateModified`는 실제 editorial update 때만 갱신한다.

Opportunity verified change 때문에 관련 Article의 dateModified를 자동 변경하지 않는다.

---

# 29. Date Semantics

다음 timestamp를 구분한다.

```text
Article published_at
Article updated_at
Opportunity verified_at
Opportunity published_at
OpportunityChange published_at
Source observed_at
```

SEO에 표시하는 modified date는 object semantic에 맞게 사용한다.

Bad:

```text
database maintenance
→ updated_at changes
→ page dateModified changes
```

Good:

```text
meaningful Article edit
→ Article dateModified
```

---

# 30. Article CMS Content Contract

Canonical storage:

```text
sanitized content_html
```

Editor:

```text
Tiptap
+
HTML Source Editor
```

Architecture rule:

1. editor output
2. sanitize on server
3. validated sanitized HTML is stored/published
4. public renderer never executes arbitrary article script

금지:

- `<script>`
- inline event handler
- unsafe iframe
- javascript: URL
- unknown executable embed

정확한 allowlist는 security implementation에서 정의.

---

# 31. Article Publish Workflow

```text
Draft
→ Edit
→ Preview
→ Validate
→ Sanitize
→ SEO validation
→ Relation validation
→ Publish transaction
→ cache/sitemap revalidation
```

Publish DB transaction:

```text
Article state
+ sanitized content
+ SEO fields
+ relations
+ published_at
+ audit
COMMIT
```

후:

```text
revalidate cache/sitemap
```

실패하면 forward retry.

---

# 32. Article Update Workflow

Published Article update:

```text
Edit draft/current content
→ preview
→ sanitize
→ publish update
→ updated_at/dateModified
→ revalidation
```

기존 URL 유지가 기본.

slug는 제목 수정과 자동 동기화하지 않는다.

---

# 33. Slug Stability

한 번 PUBLISHED 된 slug는 stable URL asset이다.

원칙:

```text
Title change
≠ automatic slug change
```

slug 변경은 명시적 action.

---

# 34. Slug Change Transaction

Published object slug 변경:

```text
validate new slug
reserve new canonical path
update slug
insert url_redirects(old → new)
audit
COMMIT
```

후:

```text
revalidate old/new routes
sitemap update
```

---

# 35. Redirect Rules

기본 permanent redirect:

```text
301 or 308
```

one standard를 implementation에서 선택.

Architecture invariant:

- old → current canonical
- redirect chain 없음
- loop 없음
- old source path 재사용 금지
- query tracking parameter 때문에 redirect row 생성하지 않음

예:

Bad:

```text
/a → /b
/b → /c
```

Good:

```text
/a → /c
/b → /c
```

---

# 36. Deleted / Archived URL Policy

hard 404 남발보다 object state에 따른 정책을 사용한다.

## Institution Archived/Closed

역사적/링크 가치가 있으면 canonical page 유지 가능.

content:

- closed/archived notice
- historical information
- related alternatives if appropriate

SEO indexability는 unique value에 따라 판단.

## Opportunity Completed

기본적으로 즉시 삭제하지 않는다.

과거 일정이 검색/판단 가치가 있으면 유지.

## Invalid/Duplicate Object

canonical duplicate가 있으면 redirect.

## Accidental/No-value Page

404/410 가능.

---

# 37. Opportunity Expiry SEO Policy

Opportunity state:

```text
CLOSED
COMPLETED
CANCELLED
```

라고 해서 즉시 noindex하지 않는다.

page가 다음 가치가 있으면 유지:

- 실제 일정/결과 history
- 다음 지원 준비 context
- Institution 관련 navigation
- verified historical record

시간이 지나 value가 매우 낮아지면:

```text
noindex
or
archive
```

정책을 후속 운영 데이터로 조정한다.

---

# 38. Internal Linking Architecture

SEO internal link는 단순 “관련 글” 위젯이 아니다.

Growth Loop를 따라 설계한다.

```text
Article
→ Institution
→ Opportunity
→ Follow

Opportunity
→ Institution
→ Related Article

Institution
→ Current Opportunity
→ Related Article
→ Follow
```

---

# 39. Article → Institution Links

Data source:

```text
article_institutions
```

render:

- institution cards
- contextual CTA
- related sections

Article HTML 안의 manual link가 없어도 structured relation으로 link 가능.

---

# 40. Article → Opportunity Links

Data source:

```text
article_opportunities
```

only public/indexable or public-valid target를 사용자 CTA로 표시.

Opportunity가 hidden/archived이면 display policy 적용.

---

# 41. Institution → Article Links

관련 Article을 reverse relation으로 조회한다.

최신순만 기계적으로 보여주지 않는다.

MVP:

- relation 존재
- PUBLISHED
- category/context

기준.

---

# 42. Institution → Opportunity Links

Institution Detail에서:

1. current/open
2. upcoming
3. recent historical

순으로 분리할 수 있다.

SEO와 사용자 value 모두 중요.

---

# 43. Opportunity → Article Links

Opportunity context를 이해하는 Guide/Update가 있으면 연결.

예:

```text
Opportunity: ○○국제학교 2027 Application
Related Article: 국제학교 원서 준비 체크리스트
```

---

# 44. Follow CTA SEO Boundary

Follow button은 product conversion element다.

crawler에게 form/action을 강요하지 않는다.

page core information은 로그인 없이 보여야 한다.

Bad:

```text
로그인해야 Institution 정보 전체 확인
```

MVP default:

```text
Public information visible
Follow requires Kakao signup
```

이렇게 Search Acquisition → Product Activation이 이어진다.

---

# 45. Content Freshness

PREPPY의 SEO 신뢰는 최신성 표시와 Monitoring 신뢰가 연결된다.

Opportunity page:

```text
Last Verified
Official Source
Current state
Recent change if meaningful
```

을 사용자에게 보여준다.

단 정확한 Domain semantics를 유지한다.

```text
Source Last Checked ≠ Opportunity Last Verified
```

---

# 46. Freshness and Search Snippets

SEO metadata에 날짜를 임의 삽입하지 않는다.

실제 freshness가 중요한 Article/Opportunity는 content와 structured data의 legitimate dates를 사용.

“2026 최신” 같은 표현은 실제 정보 검증과 content 갱신이 있을 때만 사용한다.

자동으로 연도 숫자만 바꾸는 콘텐츠 전략 금지.

---

# 47. Sitemap Architecture

MVP 규모에서는 단일 sitemap index/몇 개 logical sitemap이면 충분하다.

logical groups:

```text
static
institutions
opportunities
articles
```

구현은:

```text
/sitemap.xml
```

하나에서 처리해도 된다.

검색엔진 scale threshold 전 미리 수백 sitemap을 만들지 않는다.

---

# 48. Sitemap Inclusion Rules

include:

```text
public canonical
indexable
non-redirect
```

exclude:

```text
draft
preview
noindex
auth
admin
filter query
redirect source
```

---

# 49. Sitemap `lastmod`

`lastmod`는 실제 의미 있는 modification을 사용한다.

## Article

meaningful published editorial update.

## Institution

meaningful public profile/fact/publication update.

## Opportunity

current verified truth change or meaningful publication update.

단순 background observation/no-change check만으로 lastmod를 갱신하지 않는다.

---

# 50. Sitemap Revalidation

Article publish/update, Institution/Opportunity publication/slug/indexability change 후 sitemap cache를 invalidate한다.

Monitoring no-change는 sitemap revalidation 불필요.

---

# 51. Robots.txt

robots.txt 역할:

- obvious admin/private crawl path 제한
- sitemap location 안내

하지만 `noindex` 대체수단이 아니다.

예 logical:

```text
Disallow: /admin/
Disallow: /auth/
```

`/my-preppy`는 인증이므로 crawler가 실제 content를 못 보며 metadata noindex도 적용.

---

# 52. 404 / 410

Unknown slug:

```text
404
```

Intentional permanent removal with no replacement:

```text
410
```

은 선택 가능하지만 MVP default는 404로 충분.

Canonical replacement가 있으면 redirect.

---

# 53. Soft 404 Prevention

다음 page를 HTTP 200 + 빈 템플릿으로 반환하지 않는다.

- unknown Institution
- invalid Opportunity
- unpublished Article

적절한 404/noindex/redirect를 사용한다.

---

# 54. Pagination

Institution/Article listing이 pagination 필요할 경우:

- stable URL
- crawlable links
- canonical self
- infinite scroll만으로 navigation 제공하지 않음

초기 volume에서는 pagination이 필요 없을 수 있다.

---

# 55. Mobile-first Rendering

검색 유입 사용자 상당수가 모바일이다.

Architecture requirement:

- same canonical content
- responsive
- no mobile-only separate `/m`
- metadata/canonical 동일
- layout shift 최소화
- CTA가 core text를 가리지 않음

---

# 56. Performance Architecture

SEO-critical:

- server-render core content
- images lazy load where appropriate
- above-the-fold image dimensions known
- unnecessary client JS 최소화
- editor/admin bundle을 public page에 포함하지 않음

특정 Core Web Vitals 숫자를 Architecture hard SLA로 지금 고정하지 않는다.

launch 후 측정.

---

# 57. Images

Article featured image:

- accessible alt
- stable dimensions/aspect ratio
- optimized delivery

Institution logo/image:

공식 사용권/출처가 명확한 경우만 사용.

SEO 때문에 무단 이미지 scraping을 core workflow로 만들지 않는다.

---

# 58. Canonical Content Duplication

같은 Opportunity 정보를 여러 URL로 만들지 않는다.

Bad:

```text
/institutions/abc/opportunity/123
/opportunities/abc-2027
/events/123
```

canonical public URL은 하나.

Institution page는 summary/card를 보여주고 canonical Opportunity로 링크한다.

---

# 59. Article Duplication

같은 내용의 Guide/Update/Article을 여러 slug로 publish하지 않는다.

Legacy migration:

- canonical Article URL 선택
- old route redirect
- duplicate page noindex가 아니라 가능하면 redirect

---

# 60. User-generated Content

MVP에는 reviews/community 없음.

따라서:

- moderation SEO
- UGC structured data
- review rich result

은 Non-Scope.

---

# 61. Programmatic SEO Guard

기관/지역/나이 조합을 자동으로 대량 생성하지 않는다.

예:

```text
강남 5세 영유
강남 6세 영유
서초 5세 영유
...
```

각 page에 고유하고 유용한 editorial/product value가 검증되기 전 생성 금지.

SEO scale보다 quality/trust 우선.

---

# 62. Editorial Acquisition Strategy Boundary

Architecture가 지원해야 하는 Article 유형:

```text
GUIDE
UPDATE
ROUNDUP
```

예:

- 서울 사립초 입학 일정 정리
- 국제학교 Open House 준비
- 강남 영유 추가모집 정보
- 특정 Institution 입학정보 업데이트

실제 keyword/content calendar는 운영/PRD 영역.

---

# 63. Article ↔ Product Conversion

Article page에는 relevant structured relation이 있을 경우:

```text
Related Institution
Current Opportunity
Follow CTA
```

를 자연스럽게 제공한다.

Article CTA는:

```text
“관련 기관 업데이트 받기”
```

처럼 Product Loop로 연결.

Article newsletter standalone signup을 별도 Product Loop로 만들지 않는다.

---

# 64. Acquisition Analytics Events

minimum:

```text
article_view
article_to_institution
article_to_follow
institution_view
opportunity_view
follow_click
hero_primary_cta_click
hero_secondary_cta_click
```

properties:

```text
article_id
institution_id
opportunity_id
landing_page
utm_source
utm_medium
utm_campaign
```

canonical IDs 사용.

---

# 65. Search Landing Attribution

server/public route에서 UTM query를 canonical에서 제거하지만 analytics에는 보존할 수 있다.

```text
canonical URL != analytics landing URL
```

tracking parameter 때문에 duplicate canonical page를 만들지 않는다.

---

# 66. Organic Conversion Metrics

Daily:

```text
Organic Visitors
Indexed Articles
Article → Institution CTR
Article → Follow CTR
Institution Detail → Follow
Opportunity → Follow
Organic Active Monitoring Parents
```

GSC index/query data와 GA4 behavioral data를 혼동하지 않는다.

---

# 67. Search Console Boundary

Google Search Console는:

- index visibility
- search query
- clicks/impressions
- sitemap status

관찰 도구.

Product DB의 Publication/Indexability Source of Truth가 아니다.

GSC API 자동수집은 MVP launch blocker가 아니다.

---

# 68. Naver Boundary

한국 사용자 타겟이므로 Naver crawl/index compatibility도 고려한다.

핵심 원칙은 동일:

- server-rendered canonical HTML
- clean URL
- sitemap
- metadata
- no duplicate mobile URL

특정 Naver 전용 hack를 Architecture에 넣지 않는다.

---

# 69. Editorial Trust Layer

Article에서 Institution/Opportunity 사실을 설명할 때 가능하면 current canonical DB를 활용한다.

향후 `InstitutionBlock` / `OpportunityBlock`:

```text
Article relation
→ DB current data render
```

를 지원할 수 있다.

MVP editor에서 dynamic block 전체를 구현할 필요는 없다.

하지만 HTML에 사실값을 복사붙여넣어 영구적으로 stale 되는 구조만 사용하지 않도록 relation을 보존한다.

---

# 70. Dynamic Product Blocks — Future Seam

future:

```text
<InstitutionBlock institutionId=...>
<OpportunityBlock opportunityId=...>
```

렌더링 시 current canonical truth를 읽는다.

Article body의 editorial prose와 dynamic fact block을 구분.

MVP implementation 여부는 PRD scope에서 결정.

---

# 71. Content Sanitization Security

Server sanitization은 mandatory.

Public renderer는 stored HTML을 신뢰하되 저장 전 sanitize invariant가 있어야 한다.

Critical:

- script removal
- event handler removal
- unsafe URI removal
- iframe allowlist
- rel attributes for external links where appropriate

Preview도 sanitize된 representation을 보여준다.

---

# 72. External Links

Official Source links:

- clearly labeled
- new tab 여부는 UX 결정
- `rel` 적절히 적용

SEO 목적의 paid/sponsored link가 향후 생기면 disclosure/link attribute를 별도 정책으로 적용.

MVP 광고는 core scope 아님.

---

# 73. Author Model

Article author는 existing `admin_users` / editorial actor에 연결 가능.

Public display:

- PREPPY Editorial
- named author

중 product policy로 결정.

structured data author와 화면 author가 불일치하지 않게 한다.

---

# 74. Publish Permission

MVP complex RBAC 없음.

최소:

```text
Admin authenticated
can publish Article
```

한 운영자가 사용할 수 있는 thin model.

추후 editor/reviewer separation은 필요가 생길 때 추가.

---

# 75. SEO Validation Before Publish

Article:

```text
title
slug
sanitized content
excerpt or description
index policy
canonical
relation sanity
featured image alt if image
```

Institution:

```text
canonical name
category
slug
official Source
meaningful public content
```

Opportunity:

```text
verified current state
official Evidence
title
kind
Institution
```

없으면 publish/indexable 전이를 막거나 noindex.

---

# 76. Search Indexability Is Policy, Not Stored Truth

MVP에서는 모든 entity에 `seo_index_state` column을 추가하지 않는다.

대부분 deterministic policy로 계산한다.

Exception:

Article에는 이미:

```text
robots_index
robots_follow
```

editorial override가 존재.

Institution/Opportunity는 rule-based.

실제 운영에서 override 필요성이 검증되면 later field 추가.

---

# 77. Content Quality Guard

자동 index 가능 object가 늘어날 때 다음 guard 필요:

- unique meaningful body/summary
- official Source
- stale/unverified warning
- duplicate detection
- minimum content policy

MVP에서는 Admin publication review로 해결.

AI content quality scoring 만들지 않는다.

---

# 78. Stale Content Policy

Opportunity Last Verified가 너무 오래되면:

- UI freshness warning
- Monitoring queue priority

에 반영 가능.

하지만 자동 noindex는 하지 않는다.

오래됐다는 이유만으로 historical value를 삭제하지 않는다.

---

# 79. Indexable Opportunity and Monitoring

Opportunity SEO와 Monitoring은 연결되지만 동일하지 않다.

예:

```text
completed historical Opportunity
→ indexable historical page
→ no longer P0 Monitoring
```

반대로:

```text
newly monitored draft Opportunity
→ not yet public/indexable
```

가능.

---

# 80. Cache and Monitoring Integration

Notifiable OpportunityChange:

```text
verified DB transaction
→ OpportunityChange/outbox
```

후 consumers:

```text
Notification
Cache Revalidation
Analytics
```

Cache revalidation 실패가 Notification truth를 바꾸지 않는다.

각 integration event는 idempotent.

---

# 81. SEO Failure Classes

## SEO-F1 Metadata Generation Failure

fallback title/description 사용 가능.

canonical 생성 실패는 page indexability issue이므로 error logging.

## SEO-F2 Sitemap Generation Failure

public page 자체는 유지.

retry/rebuild.

## SEO-F3 Revalidation Failure

stale cache 가능.

retry.

DB truth rollback 금지.

## SEO-F4 Redirect Loop

publish/slug transaction에서 차단.

## SEO-F5 Broken Internal Relation

target hidden/deleted.

renderer가 safe fallback/omit.

Admin validation warning.

## SEO-F6 Structured Data Invalid

remove invalid markup rather than invent fields.

---

# 82. Observability

structured logs/events:

```text
article_publish
article_slug_change
institution_publish
opportunity_publish
seo_metadata_error
sitemap_build
redirect_created
cache_revalidation
public_404
```

canonical IDs/path 사용.

PII 없음.

---

# 83. SEO Operational Checks

launch 후:

```text
indexable URL count
sitemap URL count
404 rate
redirect count
redirect chain count
canonical mismatch
noindex count
structured data errors
organic landing pages
```

자동 crawler audit system은 MVP 필수 아님.

---

# 84. Legacy Route Migration

기존 docs에:

```text
/schools
/guides
/updates
```

가 있더라도 실제 runtime/traffic 존재 여부를 먼저 확인한다.

실제 external exposure가 없다면 불필요한 redirect table을 채우지 않는다.

Production/indexation이 확인되면:

```text
/schools/{slug} → /institutions/{slug}
/guides/{slug} → /articles/{slug}
/updates/{slug} → /articles/{slug}
```

conditional redirect.

---

# 85. Redirect Migration Preflight

필수 확인:

- actual existing URLs
- GSC indexed URLs if available
- external backlinks if available
- slug collision
- mapping target

확인되지 않은 URL을 상상해서 mass redirect 만들지 않는다.

---

# 86. SEO Security / Privacy

절대 index되면 안 되는 것:

- user profile
- My Preppy private content
- email preference
- auth callback
- admin
- preview token
- internal IDs containing private data
- raw audit logs

Public Institution/Opportunity data만.

---

# 87. Public IDs in URLs

MVP URL은 human-readable slug를 사용한다.

UUID를 URL에 노출할 필요 없음.

internal analytics/API는 canonical UUID 사용.

slug lookup → canonical ID.

---

# 88. Slug Generation

lowercase/ASCII transliteration을 강제할지 한국어 slug를 허용할지는 implementation choice.

중요 invariant:

- URL-safe
- stable
- unique
- deterministic enough
- title edit로 자동 변하지 않음

현재 legacy slug format을 repository validation에서 확인해 가능한 호환 유지.

---

# 89. Home Architecture

Home SEO core content:

- Hero
- concise service definition
- current verified opportunities
- institution category entry points
- latest Articles
- monitoring explanation

Home이 JS carousel만 있고 crawlable text가 없는 구조 금지.

---

# 90. Institution List Architecture

server-render:

- heading
- category description
- result cards
- basic filters
- links

filter actions may hydrate client-side but URLs should remain shareable where useful.

arbitrary filter page noindex.

---

# 91. Institution Detail Architecture

Public document order:

```text
H1 Institution Name
Current admissions state
Current Opportunities
Core verified Institution information
Admissions/process information
Official Source / Last Verified
Related Articles
Follow CTA
```

SEO보다 사용자 판단 흐름을 우선하며 구조적으로도 semantic headings 사용.

---

# 92. Opportunity Detail Architecture

```text
H1 Opportunity Title
Institution link
Current state
Key dates/actions
Target audience
Official Source/Evidence
Last Verified
Recent meaningful change
Related Institution/Article
Follow Institution CTA
```

Opportunity 자체를 follow target으로 만들지 않는다.

CTA는 Institution Follow.

---

# 93. Article Detail Architecture

```text
H1
Author/date
Article body
Structured related Institution/Opportunity
Relevant Follow CTA
Related Article
```

Article 본문 속 정보와 DB relation이 모순되면 editorial update 필요.

DB block이 있다면 current truth 우선.

---

# 94. HTML Semantic Structure

Public pages:

- one clear H1
- meaningful H2/H3 hierarchy
- nav/main/article/section semantics where appropriate
- links as actual anchors
- buttons for actions

SPA click handler만으로 crawl navigation을 구현하지 않는다.

---

# 95. Accessibility and SEO

- alt text
- link labels
- focusable controls
- semantic heading
- sufficient visible text

SEO를 위해 숨겨진 keyword text를 넣지 않는다.

---

# 96. Content/SEO MVP Non-Scope

- programmatic city/age landing page factory
- automated keyword content generation
- AI writer publishing
- multilingual SEO
- hreflang
- AMP pages
- separate mobile site
- review schema
- rating schema
- FAQ rich result manipulation
- dynamic comparison SEO pages at scale
- faceted navigation indexation
- Elasticsearch
- headless CMS SaaS
- third-party SEO plugin dependency
- link exchange system
- backlink automation

---

# 97. Content & SEO Acceptance Scenarios

## Scenario 1 — Google lands on Article

```text
Google
→ /articles/private-elementary-guide
→ server HTML visible
→ related Institution
→ Follow CTA
```

PASS:
core content/links initial HTML에 존재.

## Scenario 2 — Institution slug change

```text
old slug
→ permanent redirect
→ new canonical
```

PASS:
no chain, sitemap only new URL.

## Scenario 3 — Draft Article Preview

PASS:
preview works, noindex, no sitemap.

## Scenario 4 — Filter URL

```text
/institutions?region=gangnam
```

PASS:
useful UI, canonical `/institutions`, noindex.

## Scenario 5 — Native Opportunity publish

PASS:
canonical page initial HTML, verified source, Last Verified, sitemap inclusion after publish.

## Scenario 6 — Completed Opportunity

PASS:
not automatically deleted/noindexed; historical page may remain useful.

## Scenario 7 — Monitoring date change

PASS:
verified Opportunity page revalidated; Article dateModified not falsely changed.

## Scenario 8 — Source check no change

PASS:
no sitemap lastmod/cache invalidation solely because of check.

## Scenario 9 — Legacy Guide migration

PASS:
only if actual old URL exists; old URL redirects to canonical Article.

## Scenario 10 — Article links unpublished Opportunity

PASS:
public renderer does not expose broken CTA; admin warned.

## Scenario 11 — Structured Event insufficient data

PASS:
Event markup omitted rather than fabricated.

## Scenario 12 — My Preppy

PASS:
authenticated/private, noindex, absent sitemap.

---

# 98. Architecture Decisions Locked

## SEO-001
Public canonical content objects are Article, Institution, Opportunity.

## SEO-002
SEO is part of MVP product architecture.

## SEO-003
Public state and indexability are separate concepts.

## SEO-004
Core public content must be available in server-rendered initial HTML.

## SEO-005
Personalized Follow state must not force the entire public page into client-only rendering.

## SEO-006
Canonical public routes are `/institutions/{slug}`, `/opportunities/{slug}`, `/articles/{slug}`.

## SEO-007
Arbitrary filter/search URLs are noindex by default.

## SEO-008
All indexable pages use self-referencing canonical URLs.

## SEO-009
Draft/Preview/Auth/Admin/private routes are noindex and excluded from sitemap.

## SEO-010
Published slug changes are explicit URL migrations with redirect history.

## SEO-011
Title change does not automatically change slug.

## SEO-012
Redirect chains and loops are forbidden.

## SEO-013
Article↔Institution and Article↔Opportunity internal links use structured relations.

## SEO-014
Institution↔Opportunity linking follows canonical Domain relationships.

## SEO-015
Article is an Acquisition Asset, not a source of Opportunity truth.

## SEO-016
Structured data must reflect visible verified content.

## SEO-017
Not every Opportunity is an Event; Event markup only when semantics qualify.

## SEO-018
`updated_at` or Source check alone must not fabricate SEO freshness/dateModified.

## SEO-019
Opportunity Last Verified and Source Last Checked remain distinct.

## SEO-020
Sitemap includes only canonical indexable public URLs.

## SEO-021
Migration/backfill does not create fake freshness or mass indexable thin pages.

## SEO-022
Legacy redirects are conditional on actual external/production URL evidence.

## SEO-023
Programmatic SEO pages are not created before unique user/search value is validated.

## SEO-024
Public Article HTML is sanitized server-side before publish.

## SEO-025
Cache/sitemap revalidation occurs after committed domain changes and is retryable.

## SEO-026
My Preppy/User/Admin/Auth content is never an SEO acquisition surface.

---

# 99. Repository Validation Questions

Codex should verify at minimum:

1. current Next.js App Router/runtime compatibility with server-render public pages
2. actual existing public routes
3. whether `/schools`, `/guides`, `/updates` exist in runtime or only docs
4. current next.config / metadata infrastructure
5. sitemap/robots implementation presence
6. current schema support for Article SEO fields
7. `url_redirects` target not yet implemented and namespace conflicts
8. legacy slug formats and uniqueness
9. whether existing updated_at triggers could cause misleading dateModified if used naively
10. whether source observation/no-change changes any public entity updated_at
11. feasibility of cache revalidation after Outbox/integration event
12. public/private route separation
13. whether Article relations can support reverse internal links efficiently
14. whether Opportunity current projection can be server-rendered without client API dependency
15. Next.js route caching/revalidation approach that best matches repository version without breaking architecture
16. structured data can be generated server-side
17. draft preview implementation options
18. article sanitization library/runtime availability or need
19. actual production/indexed legacy URLs are verifiable
20. SEO architecture can be implemented without third-party CMS/plugin

---

# 100. Definition of Done

Content/SEO Architecture is complete when:

1. Public canonical objects/routes are fixed.
2. Publication vs Indexability is explicit.
3. server-first rendering requirement is fixed.
4. canonical/robots/metadata policy is defined.
5. sitemap inclusion/exclusion is defined.
6. breadcrumb/structured data boundaries are defined.
7. Opportunity Event markup misuse is prevented.
8. internal linking graph supports Growth Loop.
9. slug/redirect lifecycle is defined.
10. Article publish/sanitize/preview workflow is defined.
11. freshness semantics align with Monitoring truth.
12. cache/sitemap revalidation is post-commit/retryable.
13. legacy redirects are evidence-based.
14. programmatic thin-content expansion is guarded.
15. acquisition analytics events use canonical IDs.

---

# 101. Next Step

Repository validation output:

```text
06A_CONTENT_SEO_ARCHITECTURE_REPOSITORY_VALIDATION.md
```

If validation result is:

```text
VALID
or
VALID_WITH_IMPLEMENTATION_ADJUSTMENTS
```

and no architecture amendment is required, next document:

```text
07_IDENTITY_FOLLOW_NOTIFICATION.md
```

Then:

```text
08_ANALYTICS_ARCHITECTURE.md
09_ADMIN_OPERATIONS_ARCHITECTURE.md
10_PRD.md
```

Production implementation remains gated by the full set of critical contracts.
