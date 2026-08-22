# AdmissionRadar — SEO Architecture v0.1

**Recommended file:** `docs/07_SEO_ARCHITECTURE.md`
**Status:** Acquisition Architecture / Pre-Implementation
**Version:** 0.1
**Reference date:** 2026-08-14
**Parent documents:**

* `00_PROJECT_CONTEXT.md`
* `01_PRD.md`
* `02_INFORMATION_ARCHITECTURE.md`
* `03_DOMAIN_MODEL.md`
* `04_DATA_MODEL.md`
* `05_COLLECTION_ARCHITECTURE.md`
* `06_SOURCE_AND_VERIFICATION_POLICY.md`

---

# 0. Purpose

This document defines how AdmissionRadar turns verified admission data into durable organic acquisition assets.

SEO is not a separate content-marketing project.

It is part of the core product loop:

```text
Verified Admission Data
        ↓
Useful Public Page
        ↓
Google / Naver Discovery
        ↓
High-intent Parent
        ↓
School / Admission Information
        ↓
Alert Subscription
        ↓
Return Traffic
```

The SEO system must optimize for:

1. user usefulness;
2. stable URLs;
3. original structured value;
4. fresh admission information;
5. internal linking;
6. controlled indexation;
7. compounding value across academic years.

---

# 1. Core SEO Principle

AdmissionRadar must not pursue:

> maximum number of indexed pages.

It should pursue:

> **maximum useful search coverage per trusted admission data asset.**

A page is worth indexing only when it answers a real admission question better than:

* a school homepage;
* a generic directory;
* an AI-generated summary;
* a thin aggregation page.

---

# 2. SEO Asset Hierarchy

AdmissionRadar has four core indexable asset types.

```text
Category
   ↓
School
   ↓
Update

Guide
```

Each serves a different search intent.

---

# 3. Search Intent Model

## Intent A — School-Specific

Examples:

```text
경복초 입학
경복초 입학설명회
경복초 원서접수
경복초 2027 모집
SIS admissions Korea
```

Primary destination:

```text
School Detail
```

---

# 4. Intent B — Category / Calendar

Examples:

```text
2027 사립초 입학 일정
서울 사립초 입학설명회
사립초 원서접수 일정
국제학교 입학 일정
```

Primary destination:

```text
Curated category landing
```

Secondary:

```text
Calendar
```

---

# 5. Intent C — Fresh Announcement

Examples:

```text
경복초 2027 입학설명회 일정
대광초 모집요강 발표
사립초 원서접수 일정 발표
```

Primary destination:

```text
Update Detail
```

---

# 6. Intent D — Evergreen Question

Examples:

```text
사립초 원서접수 방법
사립초 중복지원
사립초 추첨 방식
국제학교 지원 자격
국제학교 외국인학교 차이
```

Primary destination:

```text
Guide Detail
```

---

# 7. Canonical Public URLs

Core:

```text
/
/calendar
/schools
/schools/[school-slug]

/private-elementary
/international-schools

/updates
/updates/[update-slug]

/guides
/guides/[guide-slug]
```

Utility pages should not become acquisition surfaces.

---

# 8. Permanent School URL Strategy

School URL must remain stable across academic years.

Correct:

```text
/schools/kyungbok-elementary
```

Do not create yearly duplicates:

```text
/schools/kyungbok-elementary-2027
/schools/kyungbok-elementary-2028
```

The permanent School page should accumulate:

* authority;
* backlinks;
* historical admission data;
* query coverage;
* internal links;
* returning users.

---

# 9. Academic Year Strategy

Academic year lives primarily in page content/state.

Example:

```text
2027학년도 현재 상태
2026학년도 과거 일정
2025학년도 과거 일정
```

When the active cycle becomes 2028:

```text
same URL
+
new current cycle
+
2027 moved into history
```

This is a core compounding mechanism.

---

# 10. School Page SEO Role

Every School page should target a cluster rather than one keyword.

Example:

```text
경복초 입학
경복초 원서접수
경복초 입학설명회
경복초 모집
경복초 2027
```

One authoritative page is preferable to multiple cannibalizing thin pages.

---

# 11. School Page Minimum Value Threshold

A School page should not be indexable solely because the School exists.

Before indexation, it should ideally contain:

```text
canonical school identity
+
current admission-cycle state
+
official source information
+
at least one meaningful admission datapoint
```

Strongly preferred:

```text
historical cycle
change history
alert capability
```

If the page has almost no unique data:

```text
noindex
```

until sufficiently enriched.

---

# 12. School Page Title Template

Example pattern:

```text
{학교명} 입학정보 2027 | 모집·설명회·원서접수 일정 | AdmissionRadar
```

But title generation must reflect actual data.

If 2027 is not announced:

Good:

```text
경복초 2027 입학정보 | 공식 발표 현황·지난 모집일정
```

Bad:

```text
경복초 2027 원서접수 일정
```

if no official schedule exists.

---

# 13. School Meta Description

Should summarize:

* current state;
* key verified data;
* historical context;
* alert value.

Example concept:

> 경복초등학교 2027학년도 입학 일정 발표 현황과 최근 모집 이력을 확인하세요. 공식 일정이 발표되면 무료 알림을 받을 수 있습니다.

Do not insert unsupported dates into metadata.

---

# 14. H1 Strategy

Stable H1:

```text
경복초등학교 입학정보
```

Academic-year context immediately below:

```text
2027학년도 입학 현황
```

Avoid changing permanent semantic identity every year unnecessarily.

---

# 15. Category Landing Pages

Initial curated pages:

```text
/private-elementary
/international-schools
```

These must contain more than a list of School cards.

They should provide aggregated AdmissionRadar intelligence.

---

# 16. Private Elementary Landing

Target concepts:

```text
서울 사립초 입학
2027 사립초 입학 일정
사립초 원서접수
사립초 입학설명회
```

Required useful modules:

```text
2027 current aggregate state
upcoming important events
schools with newly announced schedules
schools still unannounced
school-by-school status
relevant historical context
calendar links
relevant guides
```

---

# 17. International School Landing

Target concepts:

```text
국제학교 입학 일정
외국인학교 입학
international school admissions Korea
```

Do not simply copy the private-elementary template.

It should account for:

* rolling admissions;
* application opening;
* eligibility;
* assessment/interview;
* differing admission cycles.

---

# 18. Calendar SEO Role

Canonical:

```text
/calendar
```

The Calendar is primarily a product utility.

It may rank for broad schedule queries, but uncontrolled filtered states must not create thousands of crawlable pages.

---

# 19. Filter URL Policy

Example UI:

```text
/calendar?year=2027&type=private-elementary&region=seoul
```

Default:

```text
noindex,follow
```

or canonicalized to the core Calendar page.

Do not allow every combination of:

```text
year
region
event
school type
sort
month
```

to become indexable.

---

# 20. Curated Filter Landing Rule

If a filtered combination demonstrates meaningful repeated search demand, create a dedicated curated URL.

Example future:

```text
/private-elementary/seoul
```

rather than indexing:

```text
/calendar?type=private-elementary&region=seoul
```

Only create these when data volume and search intent justify them.

---

# 21. Update Pages

An Update page should correspond to a genuine meaningful admission change.

Examples:

```text
2027학년도 경복초 입학설명회 일정 발표
대광초 원서접수 마감일 변경
추가모집 발표
```

Do not create SEO articles for every crawler diff.

---

# 22. Update Page Minimum Threshold

Create an indexable Update when:

```text
verified meaningful change
+
search or action value
+
sufficient unique structured information
```

Do not create pages for:

* formatting changes;
* venue punctuation edits;
* duplicate official posts;
* irrelevant notices;
* trivial text corrections.

---

# 23. Update Page Slugs

Example:

```text
/updates/kyungbok-elementary-2027-briefing-announced
```

Stable and descriptive.

Avoid:

```text
/updates/123
/updates/2026/09/17/98281
```

unless technically unavoidable.

---

# 24. Update Page Cannibalization Rule

A School page is the long-term canonical destination for the School.

An Update page targets the specific change.

Therefore:

School page:

> complete/current/historical admission intelligence

Update:

> what changed at a particular point in time

The Update must link prominently back to the School page.

---

# 25. Old Update Pages

Do not delete useful Update pages after the event passes.

They become:

* admission history;
* source-backed context;
* internal links;
* potential long-tail assets.

However expired pages should clearly indicate historical status.

---

# 26. Guide Strategy

Guides exist only for meaningful evergreen user questions.

Initial Guide inventory should remain small.

Recommended:

```text
사립초 입학 준비 가이드
사립초 원서접수 방법
사립초 중복지원
사립초 추첨 방식
국제학교와 외국인학교 차이
국제학교 지원 자격
```

Do not generate hundreds of AI guides.

---

# 27. Live Data in Guides

Where useful, Guide pages should embed structured live AdmissionRadar data.

Example:

A Guide about private elementary applications could include:

```text
2027학년도 현재 모집 일정 발표 현황
```

This produces differentiated value.

---

# 28. Static Text vs Structured Data

Dates should come from trusted structured domain data wherever possible.

Avoid manually duplicating current dates inside Markdown.

Preferred:

```text
Guide copy
+
live AdmissionRadar module
```

This reduces stale content.

---

# 29. Originality Standard

Every indexable programmatic page must provide AdmissionRadar-specific value.

Possible unique components:

```text
current radar state
normalized events
historical admission timeline
source verification
last checked
meaningful change history
expected window
aggregate status
live category statistics
```

Generic descriptions are supplemental, not the core value.

---

# 30. Thin Content Guard

Introduce an indexability decision.

Conceptually:

```text
INDEX_READY
NOINDEX_INCOMPLETE
NOINDEX_DUPLICATE
NOINDEX_UTILITY
```

This can be derived or stored in publishing metadata.

Do not automatically index every DB record.

---

# 31. Index Readiness Rule — School

Possible initial rule:

Index if:

```text
School public
AND
active/historical admission information exists
AND
at least one authoritative source exists
AND
page is not a duplicate
```

Manual override should be available.

---

# 32. Index Readiness Rule — Update

Index only if:

```text
status = PUBLISHED
AND
meaningful change exists
AND
content adds explanatory value
```

---

# 33. Search Pages

```text
/search?q=
```

should be:

```text
noindex
```

Internal search results should never become arbitrary indexed pages.

---

# 34. Utility Pages

Default `noindex`:

```text
/subscribe/verify
/unsubscribe
/admin
preview routes
internal status pages
error routes
```

---

# 35. Canonical Tags

Each indexable permanent page must self-canonicalize.

Example:

```text
/schools/kyungbok-elementary
```

Filtered URLs should canonicalize according to the intended SEO policy.

Never create conflicting canonicals between:

```text
School page
Update page
Category page
```

---

# 36. Redirect Strategy

Permanent redirect registry should eventually support:

```text
old school slug
→ current school slug
```

Use:

```text
301/308 permanent redirects
```

for canonical resource moves.

Avoid breaking historical inbound links.

---

# 37. Sitemap Architecture

Root:

```text
/sitemap.xml
```

Recommended sitemap indexes:

```text
/sitemap-schools.xml
/sitemap-updates.xml
/sitemap-guides.xml
/sitemap-pages.xml
```

Only index-ready resources belong in sitemaps.

---

# 38. Sitemap Freshness

`lastmod` should correspond to meaningful page-content changes.

Do not update every School's `lastmod` merely because:

```text
crawler checked source
but nothing changed
```

Use meaningful public changes.

---

# 39. Robots Strategy

Robots rules should block unnecessary crawler access to:

```text
/admin
internal APIs where appropriate
preview paths
```

Do not use robots.txt as the primary method for deindexing public utility URLs already discovered.

Use correct page-level indexing directives.

---

# 40. Structured Data

Candidates:

```text
BreadcrumbList
Article
Organization
```

Event-related schema should be used only when an actual qualifying public event exists.

Do not mark:

```text
estimated dates
unannounced events
```

as official Event structured data.

---

# 41. Breadcrumb Structured Data

Required on:

```text
School Detail
Update Detail
Guide Detail
```

Example:

```text
Home
→ Schools
→ 경복초등학교
```

---

# 42. Article Structured Data

Use on Update/Guide content where semantically correct.

Fields should use actual:

```text
datePublished
dateModified
headline
```

Do not fabricate author expertise or fake editorial metadata.

---

# 43. Internal Linking Graph

AdmissionRadar must intentionally create a strong graph.

```text
Category
↔ School
↔ Update
↔ Guide
↔ Calendar
```

No important School page should be an orphan.

---

# 44. Category → School

Mandatory.

Sort can prioritize:

```text
actionable status
nearest deadline
recent change
```

rather than arbitrary alphabetic order alone.

---

# 45. School → Category

Mandatory contextual link:

```text
서울 사립초 전체 보기
```

or:

```text
국제학교 입학 일정 전체 보기
```

---

# 46. Update → School

Mandatory and prominent.

Every Update should reinforce permanent School authority.

---

# 47. School → Updates

Show relevant recent meaningful admission updates.

Avoid hundreds of links.

Prefer:

```text
latest 3–5
```

---

# 48. Guide → School

Link only when contextually useful.

Example:

`국제학교 지원 자격` Guide may link to several current School admission pages.

Do not add large SEO link farms.

---

# 49. School → Guide

Context-based.

Example:

Private elementary School page:

```text
사립초 원서접수 방법
사립초 추첨 방식
```

---

# 50. Calendar → School

Every calendar item must link to its School.

Calendar should feed authority into permanent resources.

---

# 51. Related School Logic

MVP deterministic logic:

```text
same school type
+
same region where relevant
```

No recommendation model required.

Limit to a useful number.

---

# 52. Content Freshness Model

AdmissionRadar has three kinds of freshness.

## Data Freshness

How recently authoritative Sources were successfully checked.

## Content Freshness

How recently public admission information meaningfully changed.

## Editorial Freshness

How recently a Guide was reviewed.

These should not be conflated.

---

# 53. School Page Update Trigger

Public School page should be revalidated when:

```text
verified Event changes
verified Fact changes
ExpectedWindow changes
MeaningfulChange published
active cycle changes
```

A source check with no admission change does not require content regeneration, except possibly `last checked` UI.

---

# 54. Guide Review

Evergreen Guides should have an internal review date.

Especially Guides concerning:

* admissions rules;
* eligibility;
* application methods.

Do not claim “updated” simply because a cron job touched the record.

---

# 55. Page Generation Strategy

Public acquisition pages should be server-rendered or statically generated with revalidation.

Requirements:

* meaningful HTML available without client JavaScript;
* fast first response;
* correct metadata on initial response;
* crawlable internal links.

Exact framework implementation belongs to implementation planning.

---

# 56. Revalidation Model

Preferred conceptual strategy:

```text
database truth changes
↓
affected page paths determined
↓
targeted revalidation
```

Avoid regenerating the entire site after one School changes.

---

# 57. Page Dependency Example

Change:

```text
경복초 application deadline
```

Affected pages may include:

```text
/schools/kyungbok-elementary
/private-elementary
/calendar
/
related Update page
```

The publishing layer should know these dependencies.

---

# 58. Metadata Generation

Metadata must be deterministic and data-backed.

LLM may help draft editorial metadata for Guides/Updates.

For School/Category pages, template-driven generation is safer.

---

# 59. Metadata Truth Guard

If current cycle is:

```text
NOT_ANNOUNCED
```

metadata cannot claim:

```text
2027 모집일정 확정
```

Metadata must use the same verified data model as the page.

---

# 60. Search Snippet Optimization

Above-the-fold text should answer the query quickly.

Example School page:

```text
2027학년도 공식 모집 일정은 아직 발표되지 않았습니다.
지난 2개 학년도 공고는 10월 중순~하순에 발표됐습니다.
```

Then Alert CTA.

Do not bury the answer below a 600-word generic School introduction.

---

# 61. FAQ Sections

FAQ blocks may be useful when based on real user questions.

Example:

```text
2027 일정이 발표됐나요?
원서접수는 언제였나요?
공식 홈페이지는 어디인가요?
```

Do not manufacture repetitive FAQs across every School solely for keyword density.

---

# 62. Naver-Oriented Principle

The same core pages should remain useful for Korean search behavior.

Do not build a separate low-quality “Naver version” of every page.

Use:

* clear Korean titles;
* readable summaries;
* timely Updates;
* strong School-name/entity matching;
* consistent internal linking.

Channel-specific distribution can be added later without duplicating the core content database.

---

# 63. Content Publishing Events

SEO publishing events include:

```text
School becomes INDEX_READY
MeaningfulChange produces Update
Guide published
active academic year changes
major category aggregate changes
```

These should feed sitemap/update workflows.

---

# 64. No Mass AI Publication

The system must never implement:

```text
keyword list
→ AI article generation
→ auto publish thousands
```

AdmissionRadar's programmatic advantage comes from:

```text
structured verified data
```

not text volume.

---

# 65. Update Draft Automation

Allowed:

```text
Verified MeaningfulChange
↓
structured content template
↓
optional AI explanation
↓
review
↓
publish
```

Dates and facts are injected from verified structured fields.

---

# 66. School Page Content Architecture

Recommended:

```text
H1
School admission information

Current Radar State
Next Important Action
Alert CTA

Current Academic Year Timeline

Historical Timeline

Expected Window

Meaningful Change History

Official Sources

Related Guides

Related Schools
```

This template should be consistent across Schools.

---

# 67. Category Aggregate Calculations

Category page may display:

```text
total monitored schools
announced
not announced
currently open
deadline soon
recently changed
```

All numbers must be calculated from trusted domain data.

Do not manually write counts into article prose.

---

# 68. Empty State SEO

A School with no current announcement can still provide strong value if it has:

```text
verified monitoring state
historical timeline
expected window
official Source
Alert CTA
```

“Nothing announced” is not thin content when explained with unique admission intelligence.

---

# 69. Search Analytics

Track by landing-page type:

```text
School
Category
Update
Guide
Calendar
```

KPIs:

```text
organic impressions
organic clicks
CTR
average position
alert conversion
return visits
```

The most important SEO page is not necessarily the one with most traffic.

A lower-volume School page with high Alert conversion can be more valuable.

---

# 70. SEO → Alert KPI

For each organic landing:

```text
organic session
→ alert CTA
→ verified subscription
```

Measure:

```text
Organic-to-Verified-Alert Conversion
```

This is a key business metric.

---

# 71. Search Console Integration

Future operational dashboard should ingest or surface:

```text
query
page
impressions
clicks
CTR
position
```

for SEO decision-making.

It is not required for core MVP launch but should be planned early.

---

# 72. Content Opportunity Engine — Future

Later, search-query data can identify:

```text
high impressions
low CTR
missing Guide intent
school queries with no matching content
```

This should produce editorial opportunities, not automatically publish pages.

---

# 73. 2027 → 2028 Transition

Before switching active year:

1. create/verify 2028 cycles;
2. update category context;
3. retain 2027 history;
4. change Homepage/Calendar defaults;
5. update metadata where relevant;
6. preserve permanent URLs.

Do not delete 2027 value.

---

# 74. Academic Year Landing — Future

Only after clear demand is proven consider dedicated archive resources such as:

```text
/admissions/2027
```

MVP does not require this.

Do not create yearly taxonomy simply because it seems SEO-friendly.

---

# 75. Indexing Incident Controls

Admin should eventually support:

```text
manual noindex
manual canonical override
archive
redirect
republish
```

These require audit logs.

---

# 76. SEO Acceptance Criteria

SEO architecture is ready when:

* all public page types have canonical rules;
* permanent School URLs are defined;
* parameter pages cannot create crawl explosion;
* sitemap only contains index-ready pages;
* School pages expose useful structured admission data;
* Update creation requires meaningful change;
* Guides remain intentionally curated;
* internal linking forms a connected graph;
* page metadata cannot overstate unverified information;
* academic-year transitions preserve SEO equity.

---

# 77. Primary SEO Flywheel

```text
Verified Data
↓
Better School Page
↓
Search Visibility
↓
Parent Visit
↓
Alert Subscription
↓
New Admission Change
↓
Return Visit
↓
More Engagement / Links / Search Signals
↓
Stronger Permanent Page
```

Every admission year enriches the same core asset.

---

# 78. Final SEO Principle

AdmissionRadar should not try to win because it publishes more text.

It should win because:

> **its pages know more about the admission timeline than generic search results do.**

The SEO moat is:

```text
Verified Current State
+
Historical Admission Data
+
Change History
+
Stable School URLs
+
Owned Parent Audience
```

SEO is simply the distribution layer that exposes that asset.
