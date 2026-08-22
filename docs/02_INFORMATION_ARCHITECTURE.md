# AdmissionRadar — Information Architecture v0.1

**Recommended file:** `docs/02_INFORMATION_ARCHITECTURE.md`
**Version:** 0.1
**Parent documents:**

* `00_PROJECT_CONTEXT.md`
* `01_PRD.md`

---

# 0. IA Objective

AdmissionRadar's Information Architecture must support three simultaneous goals:

1. **A parent must find admission information immediately.**
2. **Search engines must understand stable, valuable admission pages.**
3. **The user must naturally move from search traffic into alert subscription and repeat usage.**

The architecture must not resemble:

* a school encyclopedia;
* an education news portal;
* an admissions community;
* a corporate SaaS homepage.

The core hierarchy is:

```text
Academic Year
  ↓
School
  ↓
Admission Cycle
  ↓
Events / Updates
```

The core user-facing navigation is simpler:

```text
Home
Calendar
Schools
Guides
```

---

# 1. Primary Navigation

Desktop:

```text
AdmissionRadar

입학 캘린더
학교 찾기
입학 가이드
```

Optional:

```text
검색
```

Do not add unnecessary top-level navigation such as:

* About
* News
* Community
* Ranking
* Consulting
* Pricing

Company information can live in the footer.

---

# 2. Core Site Tree

```text
/
│
├── /calendar
│
├── /schools
│   └── /schools/[school-slug]
│
├── /updates
│   └── /updates/[update-slug]
│
├── /guides
│   └── /guides/[guide-slug]
│
├── /private-elementary
│
├── /international-schools
│
├── /search
│
├── /subscribe/verify
├── /unsubscribe
│
└── /admin
```

---

# 3. URL Principle

URLs should be:

* stable;
* readable;
* independent from frontend implementation;
* free of unnecessary dates when the resource is permanent;
* specific when the resource represents a particular update.

Do not use:

```text
/page?id=123
/school?school_id=43
/article/category/2027/elementary/123
```

Prefer:

```text
/schools/kyungbok-elementary
```

---

# 4. Homepage

## URL

```text
/
```

## Purpose

Answer:

> **“지금 입학 준비에서 무엇을 봐야 하는가?”**

The homepage is a live admission radar.

It is not primarily a brand introduction page.

---

# 5. Homepage Information Hierarchy

Recommended layout:

```text
[Header]

2027학년도 입학 레이더
우리 아이 입학 일정을 놓치지 마세요.

[입학 캘린더 보기] [학교 찾기]

────────────────────

🔴 지금 신청 가능

────────────────────

🟠 마감 임박

────────────────────

🟡 곧 시작

────────────────────

🆕 새로 발표됨

────────────────────

📡 아직 발표 전

────────────────────

주요 입학 가이드

────────────────────

[Footer]
```

Sections with no data may be hidden rather than displaying empty boxes.

---

# 6. Homepage Cards

A radar card should contain only decision-relevant information.

Example:

```text
경복초등학교

2027학년도 입학설명회

접수 예정
신청 시작: 8월 20일

D-6

[자세히 보기]
```

For unknown schedule:

```text
대광초등학교

2027학년도 모집
아직 미발표

지난해 공고:
2025년 10월 20일

예상:
10월 중순

[발표되면 알림받기]
```

---

# 7. Calendar

## Canonical URL

```text
/calendar
```

## Purpose

Unified chronological view of admission events.

---

# 8. Calendar Query Parameters

Filters should use query parameters:

```text
/calendar?year=2027
/calendar?year=2027&type=private-elementary
/calendar?year=2027&region=seoul
/calendar?year=2027&event=briefing
```

These are primarily UI states.

Default SEO policy:

> filtered parameter combinations are not automatically indexable.

---

# 9. Calendar Page Structure

```text
H1
2027 입학 캘린더

[Academic Year]
[School Type]
[Region]
[Event Type]

[Calendar / List toggle]

Upcoming Events
────────────────

Aug 20
경복초등학교
입학설명회 신청 시작

Sep 17
경복초등학교
입학설명회

...
```

On mobile, chronological list view may be the default because it is more usable than a dense month grid.

---

# 10. Calendar Internal Links

Every event links to:

Primary:

```text
School Detail
```

When a meaningful update article exists:

```text
Update Detail
```

Calendar should never become a dead-end information surface.

---

# 11. School Directory

## URL

```text
/schools
```

## Purpose

Allow users to find monitored schools.

---

# 12. Directory Layout

```text
학교 찾기

[Search schools]

[사립초] [국제/외국인학교]
[서울] [경기]

────────────────

경복초등학교
서울 · 사립초

2027 일정:
미발표

지난해 공고:
10월

[학교 보기]
```

---

# 13. School Detail

## URL

```text
/schools/[school-slug]
```

Example:

```text
/schools/kyungbok-elementary
/schools/seoul-international-school
```

School slug is permanent.

Do **not** create:

```text
/schools/kyungbok-elementary-2027
/schools/kyungbok-elementary-2028
```

The permanent School Detail accumulates history and SEO authority.

---

# 14. School Detail — SEO Intent

The same URL should rank over multiple years for terms such as:

```text
경복초 입학
경복초 원서접수
경복초 입학설명회
경복초 2027
경복초 2028
```

Page content changes as the active cycle changes.

Historical cycles remain accessible within the page.

---

# 15. School Detail Structure

Recommended hierarchy:

```text
Breadcrumb
홈 > 학교 찾기 > 경복초등학교

H1
경복초등학교 입학정보

[School metadata]

────────────────────

2027학년도 현재 상태

🟡 아직 공식 모집 일정 미발표

[알림받기]

────────────────────

다음으로 확인할 일정

입학설명회
예상: 9월 중순

────────────────────

2027 입학 일정

[Timeline]

────────────────────

과거 입학 일정

2026
2025
2024

────────────────────

예상 발표 시기

────────────────────

최근 변경 기록

────────────────────

공식 출처

────────────────────

관련 입학 가이드

────────────────────

다른 학교

────────────────────

[Alert CTA repeated]
```

---

# 16. School Detail Above the Fold

Mobile first screen should expose:

1. school name;
2. school type/region;
3. current academic year;
4. admission status;
5. nearest important date;
6. Alert CTA.

Do not put a long school introduction before admission state.

---

# 17. School Description

Optional short block:

```text
학교 기본정보
```

This should be concise.

Examples:

* school type
* address
* official site
* grades
* relevant eligibility summary

Admission intelligence remains the primary page content.

---

# 18. Historical Cycle Navigation

Recommended initially:

```text
2027 | 2026 | 2025
```

But do not create separate indexable year URLs during MVP unless clear SEO/user demand exists.

Historical sections can be anchor-linked:

```text
/schools/kyungbok-elementary#2026
```

---

# 19. School Alias Handling

Multiple search terms should resolve to one canonical page.

Example:

```text
SIS
Seoul International School
서울인터내셔널스쿨
서울국제학교
```

Canonical:

```text
/schools/seoul-international-school
```

Do not create duplicate pages for aliases.

---

# 20. Category Landing — Private Elementary

## URL

```text
/private-elementary
```

Potential Korean public-facing title:

> 서울 사립초 입학정보

Purpose:

* major SEO landing page;
* category overview;
* link to all relevant schools;
* show current admission state across the category.

---

# 21. Private Elementary Landing Structure

```text
H1
2027 서울 사립초 입학 일정

Intro

현재 전체 상태
38개 학교 중:
- 일정 발표 X
- 설명회 발표 X
- 원서접수 일정 발표 X

────────────────

주요 일정

────────────────

학교별 현황

────────────────

2027 입학 캘린더

────────────────

사립초 입학 가이드

────────────────

최근 업데이트
```

This is not just a directory duplicate.

It should provide aggregate intelligence.

---

# 22. Category Landing — International Schools

## URL

```text
/international-schools
```

Title example:

> 국제학교·외국인학교 입학 일정

Content can differ because international admissions are structurally different.

Useful data may include:

* rolling admissions;
* academic-year application opening;
* application availability;
* Open House;
* eligibility;
* application documents.

---

# 23. Updates Hub

## URL

```text
/updates
```

Purpose:

* browse recent meaningful admission changes.

This page is secondary navigation, not necessarily top-level header navigation.

---

# 24. Update Detail

## URL

Recommended:

```text
/updates/[update-slug]
```

Example:

```text
/updates/kyungbok-elementary-2027-open-house-announced
```

Prefer descriptive permanent slugs.

Avoid putting detection date into URL unless necessary.

Bad:

```text
/updates/2026/09/21/1234
```

Good:

```text
/updates/kyungbok-elementary-2027-briefing-announced
```

---

# 25. Update Detail Structure

```text
Breadcrumb
홈 > 입학 업데이트 > 경복초등학교

H1
경복초등학교 2027학년도 입학설명회 일정 발표

Published/Updated

Key facts box

학교
학년도
이벤트
일정
신청 시작
신청 마감

────────────────

무엇이 발표됐나

────────────────

부모가 해야 할 일

────────────────

공식 출처

────────────────

경복초 전체 입학 일정

[School Detail link]

────────────────

관련 학교 / 가이드
```

---

# 26. Update Page Lifecycle

Update pages remain accessible after the event passes.

Do not delete them merely because the event is complete.

They become historical evidence and future internal-linking assets.

However:

* inaccurate duplicate pages may be consolidated;
* insignificant pages should not be created in the first place.

---

# 27. Guides Hub

## URL

```text
/guides
```

Purpose:

> evergreen admission knowledge.

---

# 28. Guide Detail

## URL

```text
/guides/[guide-slug]
```

Examples:

```text
/guides/private-elementary-application-guide
/guides/private-elementary-multiple-applications
/guides/international-vs-foreign-school
/guides/international-school-eligibility
```

URL language can be English slugs while visible content is Korean.

Consistency matters more than translating every slug.

---

# 29. Guide Page Structure

```text
H1

Short answer / summary

────────────────

Detailed explanation

────────────────

Current AdmissionRadar data

────────────────

Relevant schools

────────────────

Current calendar

────────────────

Related guides

────────────────

Alert CTA
```

Where useful, guides should include live structured AdmissionRadar data.

Example:

A guide about private elementary applications could embed:

> 현재 2027학년도 사립초 모집 일정 발표 현황

This differentiates the guide from static editorial content.

---

# 30. Search

## URL

```text
/search?q=
```

Default:

```text
noindex
```

Search results:

```text
Schools
Updates
Guides
```

Priority:

```text
Schools > current admission information > guides
```

for exact school queries.

---

# 31. Search Result Example

Query:

```text
경복초
```

Result:

```text
학교
경복초등학교
2027학년도 모집 일정 미발표
최근 확인: 2026.08.14

업데이트
경복초등학교 2026학년도 모집요강

가이드
서울 사립초 입학 일정
```

---

# 32. Alert Modal / Inline Form

No dedicated signup page should be required for normal usage.

Alert CTA may open:

```text
inline form
or
modal
```

Fields:

```text
Email
```

Hidden context:

```text
school_id
academic_year
source_page
```

---

# 33. Verification Page

## URL

```text
/subscribe/verify
```

Possible states:

```text
success
expired
invalid
already_verified
```

Default:

```text
noindex
```

After success:

```text
경복초등학교 2027 입학 알림이 등록되었습니다.
```

Then recommend:

```text
다른 학교 보기
2027 캘린더 보기
```

---

# 34. Unsubscribe

## URL

```text
/unsubscribe
```

Default:

```text
noindex
```

The user must be able to unsubscribe without logging in.

---

# 35. Footer IA

Recommended:

```text
AdmissionRadar

서비스
- 입학 캘린더
- 학교 찾기
- 입학 가이드

학교 유형
- 서울 사립초
- 국제학교·외국인학교

정보
- AdmissionRadar 소개
- 데이터 출처 정책
- 개인정보처리방침
- 이용약관
- 문의
```

Potential:

```text
/editorial-policy
/source-policy
```

can be added later.

---

# 36. Trust Pages

Recommended before monetization:

```text
/about
/source-policy
/privacy
/terms
/contact
```

These are not product destinations but improve trust and operational completeness.

---

# 37. `/source-policy`

This page should explain:

* official-source preference;
* historical data;
* estimates;
* verification;
* corrections;
* last checked concept.

This is useful because AdmissionRadar deals with consequential dates.

---

# 38. Admin IA

## Base

```text
/admin
```

Protected and `noindex`.

---

# 39. Admin Navigation

```text
Dashboard

Schools
Admission Cycles
Events
Sources
Review Queue
Updates
Subscribers
Alerts
Guides
System
```

---

# 40. Admin Dashboard

Display operational priorities, not vanity metrics.

Example:

```text
Needs Review
12

Stale Sources
4

Collector Errors
2

Updates Approved Today
7

Alerts Pending
3
```

---

# 41. Admin School Detail

Recommended:

```text
/admin/schools/[id]
```

Tabs:

```text
Overview
Admission Cycles
Events
Sources
History
Subscribers
```

---

# 42. Admin Review Queue

## URL

```text
/admin/review
```

This is one of the most important internal screens.

Each review item:

```text
School
Source
Detected at

Previous value
New extracted value

Source excerpt / link

Confidence

[Approve]
[Edit & Approve]
[Reject]
[Ignore]
[Duplicate]
```

Critical dates must be obvious.

---

# 43. Admin Source Page

Example:

```text
/admin/sources/[id]
```

Show:

* source URL
* school
* source type
* priority
* last checked
* last successful check
* last meaningful change
* collector health
* snapshot history

---

# 44. Internal Linking Strategy

The site should operate as a graph.

## School → Category

Example:

```text
경복초
→ 서울 사립초
```

## School → Updates

```text
경복초
→ 관련 최신 입학 업데이트
```

## School → Guides

```text
경복초
→ 사립초 입학 준비 가이드
```

## Update → School

Mandatory.

## Guide → Schools

Contextual.

## Category → Schools

Mandatory.

## Calendar → Schools

Mandatory.

---

# 45. School Detail Internal-Link Priority

At the bottom of a School page:

```text
관련 학교
```

Should be selected using simple deterministic logic initially.

Example:

* same school type
* same region

No recommendation algorithm is needed.

---

# 46. Breadcrumbs

Required on indexable detail pages.

Example:

```text
홈 > 학교 찾기 > 경복초등학교
```

Update:

```text
홈 > 입학 업데이트 > 경복초등학교 2027 입학설명회
```

Guide:

```text
홈 > 입학 가이드 > 사립초 원서접수 방법
```

---

# 47. Academic Year Representation

Academic year should be visible as content/state, not generally embedded into permanent School URLs.

Primary selector:

```text
2027학년도
```

Future transition:

```text
2028학년도
```

The School URL remains unchanged.

---

# 48. Year Transition Strategy

When moving from 2027 to 2028:

Do not rebuild the site.

Instead:

```text
Active Cycle
2027 → 2028
```

School Detail:

```text
2028 current state

Historical:
2027
2026
2025
```

This creates compounding SEO value.

---

# 49. SEO Landing Page Strategy

Three page layers:

```text
Category
   ↓
School
   ↓
Update
```

Supporting:

```text
Guide
```

Each targets different intent.

---

# 50. Keyword Intent Mapping

## School navigational

```text
경복초 입학
```

→ `/schools/kyungbok-elementary`

---

## Time-specific category

```text
2027 사립초 입학 일정
```

→ `/private-elementary`

or `/calendar?year=2027&type=private-elementary`

Canonical SEO preference:

> curated `/private-elementary`

---

## Event intent

```text
경복초 입학설명회 2027
```

→ current School Detail or relevant Update Detail depending on freshness/intention.

---

## Informational

```text
사립초 중복지원 가능
```

→ Guide.

---

# 51. Query Parameter SEO Policy

Do not allow uncontrolled parameter combinations to create indexable pages.

Examples:

```text
?year=
?type=
?region=
?event=
?sort=
```

should normally canonicalize to the core Calendar page or receive `noindex,follow`.

Curated SEO landing pages should have stable clean URLs instead.

---

# 52. Sitemap Structure

Conceptually:

```text
/sitemap.xml
```

May link to:

```text
/sitemap-schools.xml
/sitemap-updates.xml
/sitemap-guides.xml
/sitemap-pages.xml
```

Exact implementation is technical-design scope.

Admin and utility pages excluded.

---

# 53. Structured Data Candidates

Potential schema types:

* `BreadcrumbList`
* `Article` for editorial update pages where appropriate
* `Organization`
* possibly event-related structured data where genuinely valid

Do not misuse structured data merely to create richer search results.

Exact schema implementation belongs in SEO architecture.

---

# 54. Mobile Navigation

Recommended:

Top:

```text
Logo
Search icon
Menu
```

Optional bottom navigation if testing later:

```text
레이더
캘린더
학교
```

Do not introduce complex navigation in MVP.

---

# 55. Mobile School Detail

Order matters.

Recommended:

```text
School Name

Current Status

Next Important Date

[Alert CTA]

Timeline

Historical Schedule

Expected Window

Recent Changes

Official Sources

Guides
```

---

# 56. Empty States

Never say simply:

```text
정보 없음
```

Prefer contextual state.

Example:

```text
2027학년도 모집 일정은 아직 공식 발표되지 않았습니다.

AdmissionRadar가 공식 모집 페이지를 확인하고 있습니다.

지난해 모집공고:
2025년 10월

[발표되면 알림받기]
```

The empty state itself creates product value.

---

# 57. Error States

If a source check is temporarily failing:

Do not tell public users:

```text
crawler failed
HTTP 403
parser error
```

Public:

```text
공식 페이지를 다시 확인 중입니다.
```

Admin receives technical error.

---

# 58. Archived Schools

If monitoring stops:

School URL should generally remain accessible if it has historical value.

State:

```text
현재 AdmissionRadar의 적극적인 모니터링 대상이 아닙니다.
```

Do not return a 404 merely because monitoring stopped.

---

# 59. Deleted / Merged Schools

If school naming changes or URLs are consolidated:

Use redirect:

```text
old school URL
→ canonical school URL
```

Avoid duplicate indexed school pages.

---

# 60. IA-to-PRD Mapping

| PRD Capability               | IA Destination           |
| ---------------------------- | ------------------------ |
| Homepage Radar               | `/`                      |
| Admission Calendar           | `/calendar`              |
| School Directory             | `/schools`               |
| School Detail                | `/schools/[slug]`        |
| Category: Private Elementary | `/private-elementary`    |
| Category: International      | `/international-schools` |
| Update Feed                  | `/updates`               |
| Update Detail                | `/updates/[slug]`        |
| Guides                       | `/guides`                |
| Guide Detail                 | `/guides/[slug]`         |
| Search                       | `/search`                |
| Subscribe verification       | `/subscribe/verify`      |
| Unsubscribe                  | `/unsubscribe`           |
| Admin                        | `/admin`                 |
| Change Review                | `/admin/review`          |

Every public MVP feature now has a defined information destination.

---

# 61. Primary Conversion Points

Alert CTA should appear on:

```text
Homepage unknown-school cards
School Detail
Update Detail
Category pages
Relevant Guides
```

Do not overuse popups.

Primary conversion should occur naturally where user uncertainty is highest.

The strongest conversion moment is:

> **“아직 공식 일정이 발표되지 않았습니다.”**

---

# 62. Homepage vs Category vs Calendar

These three pages must not be duplicates.

## Homepage

Answers:

> What matters now?

## Calendar

Answers:

> What happens when?

## Category

Answers:

> What is happening across this group of schools?

This distinction should guide implementation and SEO content.

---

# 63. School vs Update

## School Detail

Permanent truth/history destination.

## Update Detail

Specific change/event narrative.

An Update page should always lead users back to the permanent School page.

School page SEO value is more strategically important over the long term.

---

# 64. Guides vs Updates

## Guide

Evergreen.

## Update

Temporal.

Do not create guides for short-lived announcements.

Do not create update pages to answer evergreen questions.

---

# 65. IA MVP Definition of Done

The IA is successfully implemented when every major user question has an obvious destination.

### “지금 뭐 신청 가능해?”

```text
/
```

### “이번 달 입학 일정 뭐 있어?”

```text
/calendar
```

### “경복초 일정 어떻게 돼?”

```text
/schools/kyungbok-elementary
```

### “2027 서울 사립초 전체 상황?”

```text
/private-elementary
```

### “새로 발표된 게 뭐야?”

```text
/updates
```

### “사립초 중복지원 돼?”

```text
/guides/[slug]
```

### “아직 일정 안 나왔는데 알려줘.”

```text
School Detail → Alert
```

If users need to understand the site's internal architecture before finding the answer, the IA has failed.
