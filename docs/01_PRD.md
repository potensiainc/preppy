# AdmissionRadar — Product Requirements Document v0.1

**Recommended file:** `docs/01_PRD.md`
**Status:** Draft for Implementation Design
**Version:** 0.1
**Reference date:** 2026-08-14
**Primary launch season:** 2027 Academic Year
**Parent document:** `00_PROJECT_CONTEXT.md`

---

# 0. Purpose

This PRD defines the MVP requirements for AdmissionRadar.

AdmissionRadar is:

> **a continuously updated admission intelligence database that helps parents discover important school admission schedules and receive alerts when meaningful changes occur.**

The MVP must validate the following business loop:

```text
Search
  ↓
Admission information
  ↓
School interest
  ↓
Alert subscription
  ↓
Official update
  ↓
Email
  ↓
Return visit
  ↓
More pageviews / more subscriptions
```

The MVP should not attempt to maximize feature breadth.

The MVP should prove:

1. users search for this information;
2. AdmissionRadar can provide better structured information than individual school websites;
3. users are willing to subscribe to alerts;
4. updates can create repeat visits;
5. maintaining approximately 50 schools is operationally viable.

---

# 1. Product Objective

## Primary Product Objective

Create the best destination for answering:

> **“이 학교의 2027학년도 입학 일정은 지금 어떤 상태인가?”**

The user should immediately understand:

* whether an admission schedule has been announced;
* what dates are confirmed;
* which important dates are still unknown;
* what happened in previous years;
* when new information may reasonably appear;
* whether AdmissionRadar is currently monitoring the school;
* how to receive an alert when something changes.

---

# 2. MVP Success Definition

The MVP succeeds if a parent can:

1. discover AdmissionRadar through search or direct navigation;
2. find a relevant school;
3. understand the current admission status in less than approximately 10 seconds;
4. inspect historical and upcoming admission events;
5. distinguish official information from historical estimates;
6. open the original official source;
7. subscribe to a school alert using only an email address;
8. receive an alert after a verified meaningful update;
9. return to the relevant AdmissionRadar page from the email.

Operationally, AdmissionRadar must be able to:

1. maintain approximately 50 schools;
2. monitor relevant official sources;
3. record snapshots and changes;
4. identify potentially meaningful changes;
5. require human approval for sensitive information;
6. publish verified changes;
7. trigger alert delivery;
8. create/update SEO pages without requiring manual code changes.

---

# 3. Target Users

## Primary User

Parent or guardian:

* child approximately 4–8 years old;
* preparing for school admission;
* considering Seoul private elementary schools or major international/foreign schools;
* highly sensitive to missed deadlines;
* likely to search repeatedly during admission season.

---

# 4. Primary Jobs To Be Done

## JTBD-1 — Current Status

> “내가 관심 있는 학교의 입학 일정이 발표됐는지 바로 알고 싶다.”

---

## JTBD-2 — Deadline Avoidance

> “설명회 신청이나 원서접수 날짜를 놓치고 싶지 않다.”

---

## JTBD-3 — Unknown Schedule

> “아직 일정이 안 나왔다면 언제쯤 나올 가능성이 있는지 알고 싶다.”

---

## JTBD-4 — Historical Context

> “작년과 재작년에는 언제 진행됐는지 보고 올해를 준비하고 싶다.”

---

## JTBD-5 — Monitoring Delegation

> “학교 홈페이지를 계속 들어가서 확인하지 않고 발표될 때 알려줬으면 좋겠다.”

---

## JTBD-6 — Multi-School Comparison

> “관심 있는 여러 학교의 입학 이벤트를 한곳에서 보고 싶다.”

---

# 5. MVP Scope

## Included

### Public

* Homepage Radar
* Admission Calendar
* School Directory
* School Detail
* Update/Event Detail
* Guide Content
* Search
* Filters
* Alert subscription
* Email verification
* Unsubscribe
* Source attribution
* Historical admission timelines
* Admission status
* Estimated announcement windows
* Basic update history

### Internal

* School management
* Source management
* Admission cycle management
* Event management
* Change review
* Manual verification
* Subscription inspection
* Alert dispatch control
* Source freshness monitoring
* Audit log

---

# 6. Explicitly Excluded

Do not implement in MVP:

* native mobile app
* parent accounts
* passwords
* social login
* reviews
* rankings
* community
* comments
* school recommendations
* AI school matching
* admission probability
* payment
* premium subscription
* consulting
* parent profiles
* child profiles
* school dashboards
* school self-service
* chat
* direct messaging
* user-generated content
* nationwide coverage
* complex personalization
* push notifications
* SMS
* KakaoTalk notifications
* mobile app notifications

---

# 7. Primary Domain Concepts

The UI must be based on the following domain hierarchy:

```text
School
  ↓
Admission Cycle
  ↓
Admission Event
  ↓
Source Evidence
  ↓
Status / Change
```

Example:

```text
경복초등학교
  ↓
2027학년도
  ↓
입학설명회
  ↓
공식 공지 URL
  ↓
ANNOUNCED
```

---

# 8. Admission Event Types

The MVP should normalize admission information into controlled event types.

Required initial taxonomy:

```text
briefing
open_house
application_open
application_deadline
application_period
document_submission
assessment
interview
lottery
result_announcement
registration
additional_recruitment
other
```

Display labels may differ by school.

Example:

Internal:

```text
briefing
```

Display:

```text
입학설명회
학교설명회
Admissions Information Session
```

Normalization is required so events can be displayed across schools in one calendar.

---

# 9. Admission Status Model

AdmissionRadar must use standardized states.

## `NOT_ANNOUNCED`

The target academic-year admission schedule is not officially available.

Public message:

> 아직 공식 일정이 발표되지 않았습니다.

---

## `EXPECTED`

Official information is not available, but sufficient historical data exists to display an estimated announcement window.

Public message:

> 최근 일정 기준으로 이 시기에 발표될 가능성이 있습니다.

This must never appear as an official date.

---

## `ANNOUNCED`

Official admission information is available.

---

## `REGISTRATION_UPCOMING`

A registration/application opening date is confirmed but has not yet arrived.

---

## `REGISTRATION_OPEN`

Registration/application is currently open.

---

## `DEADLINE_SOON`

A relevant deadline falls within a configurable threshold.

Default product assumption:

> 7 days

This threshold must be configurable.

---

## `CLOSED`

Registration/application has closed.

---

## `COMPLETED`

The event has occurred.

---

## `UPDATED`

An important previously published field changed.

This may coexist conceptually with another event state.

Example:

> 원서접수 마감일이 11월 10일에서 11월 12일로 변경됨.

---

# 10. Information Confidence Model

Every critical admission value must be classifiable as:

## OFFICIAL

Supported directly by an official source.

## HISTORICAL

Previously official information from an earlier admission cycle.

## ESTIMATED

Derived from historical patterns.

## UNVERIFIED

Detected but awaiting verification.

Rules:

* `UNVERIFIED` must never be presented publicly as confirmed.
* `ESTIMATED` must be visually labeled as estimated.
* `OFFICIAL` must maintain source provenance.

---

# 11. Core User Journey A — Search → School → Alert

```text
Google/Naver
  ↓
School Detail
  ↓
Current status
  ↓
2027 not announced
  ↓
Historical timing shown
  ↓
Alert CTA
  ↓
Email input
  ↓
Verification
  ↓
Subscription active
```

Success event:

```text
alert_subscription_verified
```

---

# 12. Core User Journey B — Calendar

```text
Homepage
  ↓
2027 Admission Calendar
  ↓
Filter:
Private Elementary
Seoul
  ↓
Upcoming events
  ↓
Event
  ↓
School Detail / Update Detail
```

---

# 13. Core User Journey C — Alert Return

```text
Official source changes
  ↓
AdmissionRadar detects
  ↓
Verification
  ↓
Publish
  ↓
Alert sent
  ↓
User clicks
  ↓
Relevant update page
  ↓
School page
  ↓
Related schools / alerts
```

Primary success event:

```text
alert_email_click
```

---

# 14. Core User Journey D — Category Search

```text
Google/Naver
  ↓
"2027 서울 사립초 입학 일정"
  ↓
Category / Calendar landing page
  ↓
School list
  ↓
School detail
  ↓
Alert subscription
```

---

# 15. Functional Requirements — Homepage

## P0

Homepage must display:

### A. Current academic year context

Example:

> 2027학년도 입학 레이더

---

### B. Currently Open

Admission events currently accepting:

* applications
* Open House registration
* briefing registration

---

### C. Upcoming

Confirmed future events.

---

### D. Newly Announced

Recently verified official announcements.

Suggested default:

> latest 7–14 days

Configurable.

---

### E. Not Yet Announced

Selected high-interest schools whose target admission cycle is still unpublished.

Each item should show:

* school
* current state
* last year's timing where available
* estimated window where available
* alert CTA

---

### F. Deadline Soon

Important upcoming deadlines.

---

### G. Main CTA

At least one of:

> 2027 입학 캘린더 보기

> 학교 찾기

---

## P1

* recently updated indicator
* popular monitored schools
* subscriber social proof
* contextual guide modules

---

# 16. Functional Requirements — Admission Calendar

## P0

The calendar must provide:

* chronological event view;
* month navigation;
* list view;
* event type;
* school;
* region;
* date/time;
* registration period where relevant;
* state;
* school link;
* official-source link where useful.

Initial filters:

```text
Academic Year
School Type
Region
Event Type
```

Required academic year:

```text
2027
```

School type:

```text
Private Elementary
International / Foreign
```

Regions:

```text
Seoul
Gyeonggi
```

---

## P0 Calendar Behavior

An event with:

```text
event_at = null
```

must not appear as a dated calendar event.

Unknown schedules belong in:

> Not Yet Announced / Expected

rather than being assigned fake dates.

---

## P1

* weekly list
* deadline-only view
* “new this week”
* shareable filtered URLs

---

# 17. Functional Requirements — School Directory

## P0

Users must be able to:

* browse monitored schools;
* search school names;
* filter school type;
* filter region;
* see current admission status;
* open School Detail.

Each card/list row should show:

* school name
* school type
* region
* current target academic year
* radar status
* nearest relevant date where known

---

## P1

* alphabetical grouping
* district filtering
* sort by next deadline
* sort by recently updated

---

# 18. Functional Requirements — School Detail

School Detail is the most important page type.

## P0 Above the Fold

Must contain:

### School name

### School type / region

### Target academic year

Example:

> 2027학년도

### Current Radar Status

Example:

> 🟡 아직 2027학년도 모집 일정이 발표되지 않았습니다.

### Next Action

Examples:

> 설명회 신청 D-7

> 원서접수 진행 중

> 아직 공식 일정 미발표

### Alert CTA

> 이 학교 입학 일정 무료로 받기

---

# 19. School Detail — Current Cycle

Must display current-cycle events grouped chronologically.

Example:

| Event  | Status | Date       |
| ------ | ------ | ---------- |
| 설명회    | 발표됨    | 2026.09.17 |
| 설명회 신청 | 예정     | 2026.08.20 |
| 원서접수   | 미발표    | —          |
| 추첨     | 미발표    | —          |

Requirements:

* confirmed dates marked official;
* unknown events marked clearly;
* event links where available;
* official source links.

---

# 20. School Detail — Historical Timeline

## P0

Display previous admission cycles where available.

Minimum desired:

```text
2026
2025
```

Preferred:

```text
2024
2025
2026
```

Users should be able to compare:

* announcement date
* Open House
* application
* lottery
* result
* registration

Missing historical information must be shown as unknown rather than invented.

---

# 21. School Detail — Expected Window

When historical evidence is sufficient, show:

> 예상 발표 시기

Example:

```text
2026년 10월 중순 예상
```

Required supporting explanation:

```text
최근 2개 학년도 모집공고 발표 시기를 기준으로 추정했습니다.
```

Required disclaimer:

```text
공식 일정이 아닙니다.
```

The product should initially generate broad windows rather than false precision.

Preferred:

```text
9월 하순
10월 중순
10월 말~11월 초
```

Avoid:

```text
2026-10-19
```

unless official.

---

# 22. School Detail — Source Transparency

## P0

Show:

* official school website
* official admission page where available
* latest source check time
* current source status

Example:

```text
마지막 확인: 2026.08.14
공식 모집 페이지: 확인 중
```

Do not expose unnecessary technical crawler details.

---

# 23. School Detail — Change History

## P0

Display meaningful verified changes.

Example:

```text
2026.09.21
2027학년도 입학설명회 일정 신규 발표

2026.10.31
2027학년도 모집요강 등록
```

Do not display:

* HTML formatting changes
* unrelated news
* crawler errors
* invisible source changes

---

# 24. Functional Requirements — Update Detail

An Update Detail exists only when meaningful admission information changes.

Examples:

* briefing announced
* application schedule announced
* deadline changed
* additional recruitment announced

## P0

Must contain:

* clear headline
* publication/detection date
* school
* academic year
* event type
* concise summary
* exact official details
* source attribution
* official source link
* link to School Detail
* related admission events
* alert CTA where appropriate

---

# 25. Update Creation Rules

Do not create an update page for:

* unchanged pages;
* irrelevant school announcements;
* CSS/layout changes;
* image replacement without admission meaning;
* grammar corrections;
* minor text edits without decision impact.

Create an update page if the change affects:

* application ability;
* required action;
* deadline;
* eligibility;
* event attendance;
* admission result;
* registration;
* meaningful admission decision.

---

# 26. Functional Requirements — Guide

## P0

Guide pages must support actual user questions.

Initial guide candidates:

1. 사립초 입학 처음 준비할 때 알아야 할 것
2. 서울 사립초 입학 일정 정리
3. 사립초 원서접수 방법
4. 사립초 중복지원
5. 사립초 추첨 방식
6. 국제학교와 외국인학교 차이
7. 국제학교 지원 자격

Guides should internally link to relevant:

* schools
* calendars
* current admission cycles
* update pages

---

# 27. Functional Requirements — Search

## P0

Site search must support:

* Korean school name
* English school name
* aliases
* common abbreviations

Example:

```text
서울국제학교
SIS
Seoul International School
```

All should resolve to the same School entity where applicable.

---

# 28. Functional Requirements — Alert Subscription

## P0

The user must be able to subscribe without creating an account.

Input:

```text
email
```

Context automatically retained:

```text
school_id
academic_year
```

Optional future context:

```text
event_type
```

---

# 29. Subscription Verification

## P0

Flow:

```text
Email entered
  ↓
Verification email
  ↓
Verification link clicked
  ↓
Subscription activated
```

Requirements:

* duplicate-safe
* token expiry
* resend capability
* unsubscribe capability
* consent record
* timestamped verification

---

# 30. Subscription States

Required:

```text
pending
verified
unsubscribed
bounced
suppressed
```

---

# 31. Alert Trigger Rules

Initial alert categories:

```text
NEW_ANNOUNCEMENT
REGISTRATION_OPEN
DATE_CHANGED
DEADLINE_CHANGED
ADDITIONAL_RECRUITMENT
IMPORTANT_ELIGIBILITY_CHANGE
```

Do not alert on every detected source update.

---

# 32. Alert Email Requirements

## P0

Email must include:

* school
* academic year
* reason for notification
* key changed fact
* CTA back to AdmissionRadar
* unsubscribe path

Example conceptual structure:

```text
경복초등학교 2027학년도
입학설명회 일정이 발표되었습니다.

설명회:
2026.09.17

신청 시작:
2026.08.20

[AdmissionRadar에서 자세히 보기]
```

Do not reproduce the entire page.

---

# 33. Functional Requirements — Admin

Admin is required even though it is not a consumer-facing product feature.

## P0 Modules

### Schools

* create
* edit
* archive
* aliases
* type
* region
* source links

### Admission Cycles

* create/edit
* target academic year
* status
* notes

### Events

* create/edit
* verify
* reject
* mark estimated
* source assignment

### Sources

* URL
* source type
* source priority
* active/inactive
* last checked
* last changed
* collection status

### Review Queue

Review detected changes.

Actions:

```text
Approve
Reject
Ignore
Edit & Approve
Mark Duplicate
```

### Subscriptions

* inspect counts
* inspect school subscription totals
* suppress problematic addresses

### Alerts

* preview
* send
* inspect delivery status

---

# 34. Human Verification Requirement

Human verification is mandatory in MVP for newly detected changes affecting:

* application periods
* deadlines
* eligibility
* Open House registration
* lottery
* assessment
* admission result
* enrollment/registration

Codex must not implement blanket auto-publication of AI-extracted critical dates.

---

# 35. Source Requirements

Each official admission fact should support provenance.

At minimum:

```text
source_url
source_type
observed_at
verified_at
```

Where available:

```text
published_at
source_title
source_document_url
```

---

# 36. Historical Data Requirements

Historical data may be manually seeded.

That is acceptable.

Historical records should be:

* linked to academic year;
* sourced where possible;
* clearly separated from current admission information;
* immutable except for corrections.

Historical data should not trigger alerts.

---

# 37. Data Freshness

Each monitored source must expose an operational freshness state.

Example thresholds may later differ by season.

Conceptual:

```text
FRESH
DUE
STALE
ERROR
```

Users do not necessarily see these technical states.

Admins do.

---

# 38. SEO Requirements

## P0

Every indexable page must support:

* unique title
* unique meta description
* canonical URL
* crawlable HTML
* meaningful text content
* internal linking
* sitemap inclusion where appropriate
* stable URL
* mobile usability

---

# 39. Indexable Page Types

Index:

```text
/
 /calendar
 /schools
 /schools/[school-slug]
 /updates/[update-slug]
 /guides/[guide-slug]
 /private-elementary
 /international-schools
```

Potential filtered landing pages may become indexable only when intentionally curated.

---

# 40. Non-Indexable Pages

Default `noindex`:

```text
/search
/email verification
/unsubscribe
/admin
arbitrary query parameter combinations
empty filtered pages
internal preview pages
```

---

# 41. SEO Value Requirement

School pages must contain original structured value beyond generic descriptions.

At least several of:

* current radar state
* official dates
* historical cycles
* estimated timing
* source transparency
* change history
* latest update
* normalized admission events

A school page must not exist merely because a school entity exists.

---

# 42. Analytics Requirements

## P0 Events

```text
page_view
school_view
calendar_view
calendar_filter_applied
official_source_click
alert_cta_click
alert_subscription_started
alert_subscription_verified
alert_unsubscribed
update_view
guide_view
alert_email_click
search_performed
```

---

# 43. Core Product KPIs

## North Star

```text
Verified Alert Subscribers
```

---

## Acquisition

* organic clicks
* organic impressions
* indexed pages
* search CTR

---

## Activation

* School Detail → Alert CTA CTR
* Alert form completion
* verification completion

---

## Retention

* returning users
* alert email CTR
* repeat school views
* multiple-school subscribers

---

## Content

* school page organic traffic
* guide organic traffic
* update organic traffic

---

# 44. Operational KPIs

* monitored schools
* active sources
* source freshness
* detection latency
* review queue size
* verification latency
* false positives
* incorrect extractions
* stale school pages
* human minutes per school

---

# 45. Initial Coverage Target

Launch dataset target:

```text
서울 사립초: 약 38
국제/외국인학교: 약 10–15
```

Total:

```text
approximately 50 schools
```

Do not expand initial coverage until:

* critical source monitoring is functioning;
* historical data quality is acceptable;
* operations remain manageable.

---

# 46. Initial Data Completeness Target

Per school, prioritize:

## Required

* canonical name
* school type
* region
* official URL
* admission URL if known
* 2027 current status

## Strongly Desired

* 2026 admission cycle
* 2025 admission cycle

## Optional Initial Enrichment

* 2024 admission cycle
* address
* age/grade eligibility summary
* historical admission volume

---

# 47. Homepage Acceptance Criteria

Homepage is considered complete when:

* 2027 context is immediately visible;
* at least one radar section renders dynamically;
* sections use real database states;
* each item links to a real School or Update page;
* unknown schedules are not represented with fake dates;
* alert CTA is available for relevant schools;
* mobile layout works.

---

# 48. School Page Acceptance Criteria

A School Detail page is complete when it can display:

* current academic year;
* current state;
* confirmed events;
* unknown events;
* historical events;
* source information;
* last checked;
* meaningful changes;
* alert CTA.

The same template must work for:

* private elementary school
* international/foreign school

without creating separate codebases.

---

# 49. Alert Acceptance Criteria

Alert MVP is complete when:

```text
unsubscribed user
→ submits email
→ receives verification
→ verifies
→ is stored as verified subscriber
→ verified meaningful change occurs
→ alert is generated
→ email is sent
→ link returns user to relevant AdmissionRadar page
→ unsubscribe works
```

---

# 50. Admin Acceptance Criteria

The admin workflow is complete when a non-developer operator can:

```text
detected change
→ inspect source
→ inspect extracted values
→ edit if needed
→ approve
→ publish
→ trigger alert
```

without touching application code or the database directly.

---

# 51. Reliability Requirements

AdmissionRadar should prioritize correctness over apparent real-time speed.

MVP does not require:

```text
seconds-level realtime
```

An update delay of several hours may be acceptable if required for validation.

What is unacceptable:

* wrong deadlines
* invented dates
* hidden verification uncertainty

---

# 52. Performance Requirements

Initial target:

* fast server-rendered public pages;
* strong mobile performance;
* pages usable on standard mobile networks;
* minimal client-side JavaScript where unnecessary.

SEO pages should not depend on client-side rendering to expose primary content.

---

# 53. Security / Privacy Requirements

MVP stores minimal personal data.

Primarily:

```text
email address
subscription preferences
consent/verification timestamps
```

Requirements:

* do not collect unnecessary child information;
* do not collect parent profiles;
* do not expose subscriber email addresses;
* use secure verification tokens;
* allow unsubscribe;
* maintain email suppression state where necessary.

---

# 54. Product Copy Principles

Prefer:

> 아직 발표되지 않았습니다.

Instead of:

> 데이터가 없습니다.

Prefer:

> 최근 2개 학년도 일정 기준 예상 시기입니다.

Instead of:

> AI 예상 일정

Prefer:

> 공식 출처 확인

Instead of:

> AI 검증 완료

AI is implementation infrastructure, not marketing positioning.

---

# 55. UI Priority

Visual hierarchy:

```text
1. Current status
2. Important date / action
3. Alert CTA
4. Timeline
5. Source credibility
6. Historical context
7. Supporting school information
```

Generic school description should never visually dominate admission information.

---

# 56. MVP Priority Matrix

## P0 — Must Launch

* School registry
* Admission cycles
* Events
* Historical data
* Homepage Radar
* Calendar
* Directory
* School Detail
* Update Detail
* Guide template
* Search
* Alert subscription
* Verification
* Unsubscribe
* Admin
* Source provenance
* Human verification
* SEO fundamentals
* Analytics

---

## P1 — Soon After Launch

* expected announcement engine
* related schools
* improved filters
* multiple-school subscription management
* newsletter
* automated update drafts
* richer admin dashboards

---

## P2 — Later

* Phase 1.5 institutions
* direct sponsorship system
* advertiser landing pages
* deeper personalization
* additional regions

---

# 57. Final MVP Product Test

Before any feature is accepted, ask:

> Does this help the user answer one of these questions?

```text
What is happening?
When is it happening?
Has anything changed?
What happened last year?
What has not been announced yet?
Can you tell me when it changes?
```

If not, it probably does not belong in the MVP.
