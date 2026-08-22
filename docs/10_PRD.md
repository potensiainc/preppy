# 10_PRD.md

> **Project:** PREPPY (프레피)  
> **Document Type:** Final MVP Product Requirements Document  
> **Status:** PRD v1.0 — Repository validation required before implementation planning  
> **Supersedes:** Fragmented MVP/product requirement notes where this document is more specific  
> **Source of Truth Priority:** Latest explicit Product Decision → One Pager → MVP → `00_PRODUCT_REQUIREMENTS_BASELINE.md` → validated architecture documents → legacy implementation  
> **Validated Inputs:** `02A`, `03A`, `04A`, `05A`, `06A`, `07A`, `08A`, `09A`  
> **Core Principle:** Architecture for Extension. Implementation for Validation.  
> **Purpose:** PREPPY MVP가 무엇을 만들어야 하고 무엇을 만들지 않아야 하는지, 어떤 사용자 문제를 해결해야 하고 어떤 데이터를 어떻게 신뢰성 있게 운영해야 하는지, 언제 MVP가 성공 또는 실패했다고 판단할지를 하나의 실행 가능한 Product Contract로 정의한다.

---

# 0. Executive Summary

PREPPY는 서울·경기 4~8세 자녀 부모 중 프리미엄 교육기관의 입학정보를 놓치고 싶지 않은 사용자를 위한:

> **Premium Education Discovery, Intelligence & Monitoring Platform**

이다.

MVP에서 다루는 교육기관:

```text
영유
서울 사립초
서울·경기 주요 국제학교
```

핵심 문제:

```text
중요한 교육기관의 모집·설명회·지원 일정이
각 기관 공식 홈페이지/공지/신청페이지에 흩어져 있어
부모가 반복적으로 직접 확인해야 한다.
```

PREPPY의 핵심 가치:

```text
Find once
→ Follow
→ PREPPY monitors
→ Change happens
→ PREPPY notifies
```

MVP의 성공은 “페이지뷰가 많다”가 아니라:

```text
사용자가 Institution을 Follow하고
PREPPY에게 Monitoring을 맡기는 관계가 실제로 만들어지는가?
```

로 판단한다.

North Star:

```text
Active Monitoring Parents
```

30-day validation target:

```text
Qualified Visitors 500
→ Active Monitoring Parents 50+
```

---

# 1. Product Definition

## 1.1 One-line Definition

> **영유·사립초·국제학교의 모집·입학정보를 한곳에서 확인하고, 관심기관의 새로운 모집·입학정보가 생기면 알려주는 서비스.**

---

# 1.2 User-facing Value Proposition

Hero:

```text
입학정보, 아직도 일일이 찾아보고 계신가요?
```

Subcopy:

```text
영유·사립초·국제학교 정보를 한곳에서 확인하고,
관심기관의 새로운 모집·입학정보가 생기면 프레피가 알려드려요.
```

---

# 1.3 What PREPPY Is

PREPPY is:

- 프리미엄 교육기관 정보 탐색 서비스
- 입학·모집 Opportunity discovery
- 공식 Source 기반 검증 서비스
- Institution Follow 기반 Monitoring 서비스
- 변경 알림 서비스
- Editorial Acquisition Engine

---

# 1.4 What PREPPY Is Not

PREPPY is not:

- 학교 평가/별점 사이트
- 학부모 커뮤니티
- 입시 컨설팅
- AI 상담 서비스
- 합격 예측
- 전국 학교 데이터베이스
- 리뷰 플랫폼
- 광고 플랫폼
- 유료 멤버십 서비스
- Camp/After-school marketplace

---

# 2. Target Customer

## 2.1 Primary User

```text
서울·경기 거주
4~8세 자녀 부모
영유/사립초/국제학교를 실제로 알아보는 중
정보 탐색 의도가 높고
중요한 입학 일정을 놓치고 싶지 않은 사용자
```

---

# 2.2 Primary User Situation

사용자는 현재:

- 네이버 검색
- 블로그
- 맘카페
- 기관 홈페이지
- 인스타그램
- 설명회 공지
- 신청 페이지

를 반복적으로 확인한다.

문제는 정보가 없는 것이 아니다.

문제는:

> **언제 무엇이 바뀌었는지 지속적으로 확인해야 하는 운영 부담**

이다.

---

# 2.3 Core User Job

> **“우리 아이에게 관련 있는 기관의 중요한 입학정보를 놓치지 않도록 관리하고 싶다.”**

---

# 2.4 Desired User State

> **“우리 아이의 중요한 교육 선택을 제대로 관리하고 있다는 확신.”**

---

# 3. MVP Product Goal

MVP는 다음을 검증해야 한다.

1. 부모가 PREPPY의 가치를 5초 안에 이해하는가?
2. 원하는 Institution/Opportunity를 빠르게 찾는가?
3. 공식 Source와 Last Verified를 보고 신뢰하는가?
4. Institution Follow CTA를 누르는가?
5. Kakao 가입 후 Follow까지 완료하는가?
6. Notification/Email로 다시 돌아오는가?
7. 여러 Institution을 Follow하는가?
8. Article이 검색 유입을 Follow로 전환하는가?

---

# 4. Product Loop

```text
Discover
→ Compare
→ Follow
→ Monitor
→ Update
→ Return
```

---

# 5. Growth Loop

```text
Google / Naver / Community
→ Article
→ Institution / Opportunity
→ Follow
→ Kakao Signup
→ Monitoring
→ Email
→ Return
```

---

# 6. MVP Category Scope

## 6.1 P0 — 영유

Coverage:

```text
강남·서초·송파 중심
20~30개
```

Priority Opportunities:

- 신규모집
- 추가모집
- 설명회
- 상담
- 레벨테스트
- 신청 오픈/마감

영유는 year-round Monitoring 대상으로 본다.

---

# 6.2 P0 — 국제학교

Coverage:

```text
서울·경기 주요 10~15개
```

Priority Opportunities:

- Application
- Open House
- Assessment
- Interview
- Deadline
- Document Submission
- Result/Registration

year-round Monitoring.

---

# 6.3 P1 — 서울 사립초

Coverage:

```text
서울 주요 사립초
```

MVP에서:

- DB
- Institution page
- SEO
- Follow

를 지원.

PMF 판정은 실제 모집 시즌에서 더 강하게 확인한다.

---

# 7. MVP Non-Scope

MVP에서 만들지 않는다.

```text
Mobile App
Push Notification
KakaoTalk Notification
AI Admission Consulting
AI Recommendation
Reviews
Community
Ranking
Payment
Subscription Billing
Advertiser Dashboard
Lead Marketplace
Camps
After-school Programs
Arts/Sports Programs
Nationwide Coverage
Full-auto Crawling
Complex RBAC
Data Warehouse
Elasticsearch
Microservices
Kafka
Kubernetes
Programmatic SEO
A/B Testing Platform
Multi-child Family Entity
```

---

# 8. Core Domain Objects

MVP canonical objects:

```text
Institution
Opportunity
Source
User
Follow
Notification
Article
```

Supporting:

```text
AuthIdentity
UserEmail
Profile
ConsentDecision
NotificationPreference
FollowEpisode
OpportunityVersion
InstitutionFact
Evidence
OpportunityChange
NotificationDelivery
DeliveryAttempt
OutboxEvent
AuditLog
URLRedirect
```

---

# 9. Canonical Institution

Institution is:

> PREPPY의 canonical educational institution identity.

Public categories:

```text
ENGLISH_KINDERGARTEN
PRIVATE_ELEMENTARY
INTERNATIONAL_SCHOOL
```

International subtype may preserve:

```text
INTERNATIONAL_SCHOOL
FOREIGN_SCHOOL
OTHER_INTERNATIONAL
```

Legacy `schools`는 compatibility source이며 canonical public identity가 아니다.

---

# 10. Opportunity

Opportunity is:

> 사용자가 지금 확인하거나 행동할 수 있는 독립적인 입학·모집 기회.

예:

```text
○○영유 5세 추가모집
○○국제학교 2027 Application Open
○○사립초 입학설명회
```

Kinds:

```text
RECRUITMENT
ADDITIONAL_RECRUITMENT
INFORMATION_SESSION
CONSULTATION
LEVEL_TEST
OPEN_HOUSE
APPLICATION
DOCUMENT_SUBMISSION
ASSESSMENT
INTERVIEW
LOTTERY
RESULT_ANNOUNCEMENT
REGISTRATION
DEADLINE
OTHER
```

Opportunity는 Institution attribute가 아니다.

독립:

- ID
- slug
- public page
- lifecycle
- version/history
- verification
- notification signal

을 가진다.

---

# 11. Native vs Legacy-backed Opportunity

```text
NATIVE
LEGACY_BACKED
```

둘 다 public UX에서는 동일한 Opportunity.

Legacy-backed:

```text
Opportunity
→ AdmissionEvent
→ EventVersion
```

Native:

```text
Opportunity
→ OpportunityVersion
→ Evidence
```

Notification/Analytics consumer는 둘의 persistence 차이를 몰라야 한다.

둘은:

```text
OpportunityChange
```

에서 수렴한다.

---

# 12. Trust Contract

Public PREPPY에서 중요한 정보는 가능한 한:

```text
Official Source
Last Verified
Current State
```

를 제공한다.

명확히 구분:

```text
Source Last Checked
!=
Opportunity Last Verified
!=
Article Updated At
```

`updated_at`을 Last Verified로 사용하지 않는다.

---

# 13. Source Policy

Verified admissions truth의 기본 근거:

```text
OFFICIAL_PRIMARY
OFFICIAL_SECONDARY
```

Trusted secondary source는 보조 Evidence 가능.

커뮤니티/블로그는:

```text
discovery signal
```

로 사용할 수 있으나 단독 공식 truth로 승격하지 않는다.

---

# 14. Home Requirements

Route:

```text
/
```

Must include:

1. Hero
2. PREPPY one-line value
3. Current Opportunities
4. Institution discovery entry
5. Category entry
6. Latest Articles
7. Monitoring explanation
8. Follow value CTA

Home is indexable.

---

# 15. Institution List

Route:

```text
/institutions
```

Requirements:

- server-rendered core result
- category filter
- region filter
- child age/grade relevant filter where useful
- recruitment/current state filter
- text search
- Institution cards
- shareable/useful URL state where practical

Arbitrary filter query:

```text
noindex,follow
canonical=/institutions
```

---

# 16. Institution Card

Minimum:

```text
Institution Name
Category
Region
Current admissions state
Current/next Opportunity summary
Last relevant verification
Follow state/CTA
```

---

# 17. Institution Detail

Route:

```text
/institutions/{slug}
```

Display order:

```text
H1 Institution Name
Current admissions state
Current Opportunities
Core Institution info
Admissions/process info
Official Source / Last Verified
Related Articles
Follow CTA
```

---

# 18. Institution Detail Requirements

Must:

- render core content on server
- expose official source
- display current opportunities
- link Opportunity canonical pages
- show verified facts when available
- show Follow CTA
- allow anonymous viewing
- use canonical slug
- use SEO metadata

---

# 19. Institution Facts

MVP first-class verified fact types:

```text
TUITION
TARGET_AGE_GRADE
CURRICULUM
ELIGIBILITY
TRANSPORT
ADMISSION_PROCESS
OPERATING_INFO
```

Not all profile fields need versioning.

Stable/basic profile stays on Institution root.

---

# 20. Opportunity Detail

Route:

```text
/opportunities/{slug}
```

Display:

```text
Opportunity Title
Institution
Current business state
Key date(s)
Target audience
Action URL
Summary
Official Source
Last Verified
Recent meaningful change
Related Article
Institution Follow CTA
```

Opportunity itself is not Follow target.

CTA:

```text
{Institution} 업데이트 받기
```

---

# 21. Opportunity Publication Requirements

Public PUBLISHED Opportunity requires:

- Institution
- canonical slug
- title
- kind
- current verified truth
- official Evidence
- publication state
- meaningful actionable content

---

# 22. Opportunity Indexability

Public != Indexable.

Index candidate:

- PUBLISHED
- verified truth
- official Evidence
- unique actionable information

Thin/migration placeholder:

```text
NOINDEX
```

Completed Opportunity may remain indexable if historical/user value remains.

---

# 23. Opportunity Business States

```text
UPCOMING
OPEN
CLOSED
COMPLETED
CANCELLED
UNKNOWN
```

Publication state remains separate.

---

# 24. Monitoring Product Contract

User Follow means:

> **“이 Institution의 중요한 입학정보 확인을 PREPPY에 맡긴다.”**

Follow target:

```text
Institution
```

Monitoring target:

```text
Source Binding
```

Change target:

```text
Opportunity / InstitutionFact
```

Notification target:

```text
User
```

---

# 25. Monitoring Priority

```text
P0_ACTIVE
P1_UPCOMING
P2_WATCH
P3_DORMANT
```

Cadence target:

```text
P0 → Daily
P1 → Every 2–3 days
P2 → Weekly
P3 → No automatic check
```

MVP is Manual-first.

---

# 26. Monitoring Queue

Admin queue derived from:

```text
SourceMonitorConfig
+ SourceBinding
+ latest Observation
+ Institution state
+ Opportunity state
```

No persistent `monitoring_tasks` table.

---

# 27. Source Check Outcomes

Minimum semantic outcomes:

```text
NO_CHANGE
CHANGE_FOUND
SOURCE_UNAVAILABLE
SOURCE_MOVED
UNKNOWN
```

May map to existing Observation vocabulary.

---

# 28. No Change Requirement

```text
ConfirmNoChange
```

MUST:

- record Observation/Audit
- update source check projection

MUST NOT:

- create new OpportunityVersion
- create OpportunityChange
- create Notification
- change SEO freshness

---

# 29. Native Opportunity Verification

Atomic requirements:

```text
lock current
compare
supersede old
create verified Version
create Evidence
create OpportunityChange if material
create Audit
create required Outbox
COMMIT
```

No external Email inside transaction.

---

# 30. Legacy-backed Opportunity Verification

Atomic:

```text
AdmissionEventVersion
+ Evidence
+ MeaningfulChange where applicable
+ canonical OpportunityChange
+ Audit
+ canonical Outbox
```

Legacy Alert write is not canonical PREPPY path.

---

# 31. Material Change

Notifiable examples:

- new Opportunity
- application open
- deadline changed
- information session date changed
- Open House date changed
- assessment/interview changed
- cancellation
- meaningful status change

Non-notifiable examples:

- typo
- whitespace
- wording cleanup
- tracking URL parameter
- Admin metadata

---

# 32. Backfill Silence

Migration/backfill:

```text
must not emit user-facing product signals
```

Legacy Event → Opportunity backfill cannot create mass customer Emails.

---

# 33. User Identity

Canonical:

```text
User
```

Separate:

```text
AuthIdentity(KAKAO)
UserEmail
Profile
ConsentDecision
NotificationPreference
```

Never use:

```text
Kakao subject as User PK
Email as User identity
```

---

# 34. Anonymous User

Can:

- view Home
- view Article
- view Institution
- view Opportunity
- filter/search
- open official source

Requires login for:

```text
Follow Institution
```

---

# 35. Anonymous Follow Flow

```text
Follow Click
→ PendingFollowIntent
→ Kakao OAuth
→ User resolve/create
→ Required Consent
→ User ACTIVE
→ Follow ACTIVE
```

---

# 36. Pending Follow Intent

Ephemeral state.

Contains:

```text
institution_id
source route/context
created_at
expires_at
nonce
optional attribution
```

Stored as:

```text
short-lived signed/encrypted cookie
```

not permanent business table.

OAuth state is separate.

---

# 37. Kakao Auth Requirements

MVP:

```text
Authorization Code flow
state validation
secure callback
HttpOnly session cookie
User status DB check
```

Long-lived provider token storage not required unless future use case needs it.

---

# 38. Session

MVP:

```text
encrypted/authenticated HttpOnly cookie
```

Protected request:

```text
session user_id
→ User.status ACTIVE check
```

No auth_sessions table for MVP.

---

# 39. Required Consent

User ACTIVE requires effective:

```text
TERMS_OF_SERVICE = GRANTED
PRIVACY_POLICY = GRANTED
```

Email service consent is not required for account activation.

---

# 40. Optional Profile

```text
child_birth_year
interest_regions
interest_categories
```

Can be skipped.

Must not block Follow completion.

Do not collect:

```text
child name
exact birthday
income
assets
job
education budget
```

---

# 41. Email

Email may come from:

```text
KAKAO
USER_INPUT
```

Possible User state:

```text
User ACTIVE
Follow ACTIVE
Email unavailable
```

In that state:

- My Preppy works
- Monitoring relationship exists
- Email update unavailable

---

# 42. Consent vs Preference

Distinct:

```text
ConsentDecision
NotificationPreference
```

Effective Email:

```text
usable Email
+ SERVICE_EMAIL_UPDATES GRANTED
+ EMAIL Preference ENABLED
```

---

# 43. Follow

Canonical:

```text
User ↔ Institution
```

`follows` current relation.

`follow_episodes` activation history.

---

# 44. Follow Lifecycle

```text
Not Exists → ACTIVE
ACTIVE → INACTIVE
INACTIVE → ACTIVE
```

Duplicate click/callback must be idempotent.

---

# 45. Unfollow

Unfollow one Institution:

- Follow INACTIVE
- close episode
- future notification ineligible
- global Email preference unchanged
- other Follows unaffected

---

# 46. Email OFF

Email preference OFF:

- Follow remains ACTIVE
- Monitoring remains
- My Preppy remains
- Email delivery disabled
- AMP definition becomes false if no effective Email

---

# 47. My Preppy

Route:

```text
/my-preppy
```

Private/noindex/no shared cache.

Sections:

```text
Monitoring Institutions
Current Opportunities
Upcoming Dates
Recent Changes
Last Verified / Source
Email Update State
Profile / Interests
```

---

# 48. My Preppy Monitoring Status

Projection:

```text
MONITORING
EMAIL_OFF
EMAIL_NEEDS_ATTENTION
SOURCE_ATTENTION_REQUIRED
ARCHIVED
```

No dedicated table required.

---

# 49. Signal-time Eligibility

User can receive a signal only if:

```text
FollowEpisode activated_at <= signal_published_at
AND
deactivated_at is null or signal_published_at < deactivated_at
```

---

# 50. Send-time Eligibility

Immediately before provider call:

```text
User ACTIVE
Follow ACTIVE
Email USABLE
Service Email Consent GRANTED
Email Preference ENABLED
```

If false:

```text
SUPPRESSED
```

---

# 51. No Retroactive Notification

Signal before Follow:

```text
no Email
```

Reactivation does not cause inactive-period old signals to send.

---

# 52. Notification

Canonical:

```text
Notifiable Signal
→ Notification
→ NotificationDelivery
→ DeliveryAttempt
```

Notification != Email.

---

# 53. Notification Trigger

Candidates:

```text
OpportunityPublished
OpportunityChange(materiality=NOTIFIABLE)
```

Institution Fact change does not trigger Email in MVP.

---

# 54. Notification Deduplication

Must ensure:

```text
one canonical Notification per signal/policy
one Delivery per Notification/User/Channel
```

DB unique constraints.

---

# 55. Email Delivery

MVP channel:

```text
EMAIL
```

Delivery statuses:

```text
PENDING
QUEUED
SENT
DELIVERED
OPENED
CLICKED
FAILED
SUPPRESSED
```

---

# 56. Delivery Attempt

Retries are appended as:

```text
NotificationDeliveryAttempt
```

Logical Delivery row not duplicated.

---

# 57. Outbox

Use existing PostgreSQL Outbox, hardened.

Needs:

```text
dedupe
attempts
available_at
lock/lease
error
dead-letter
```

Worker:

```text
FOR UPDATE SKIP LOCKED
```

with lease recovery.

---

# 58. Worker Model

Single PostgreSQL Outbox + single worker process.

Two logical stages:

```text
1. Recipient Resolution
2. Per-delivery Sending
```

No Kafka/Redis queue.

---

# 59. Provider Call Boundary

Provider send outside DB transaction.

Retry/idempotency based on:

- Delivery unique key
- Attempt history
- Outbox dedupe
- provider idempotency/message ID if available

---

# 60. Email Content

Minimum:

```text
Institution name
Opportunity title
what changed
important date/state
Last Verified context
PREPPY deep link
Email settings/unsubscribe entry
```

Email is not Source of Truth.

---

# 61. Article

Canonical route:

```text
/articles/{slug}
```

Types:

```text
GUIDE
UPDATE
ROUNDUP
```

Article is:

> Acquisition Asset

not source of Opportunity truth.

---

# 62. Article CMS

Must support:

```text
Create
Draft
Edit
Preview
Publish
Unpublish
Archive
```

Fields:

```text
title
slug
excerpt
content_html
type
category
seo_title
seo_description
canonical_url
robots_index
robots_follow
featured_image_url
featured_image_alt
author
published_at
updated_at
```

---

# 63. Article Editor

MVP:

```text
WYSIWYG
HTML Source
Desktop/Mobile Preview
```

Tiptap direction remains acceptable.

---

# 64. Article Sanitization

Server-side before publish.

MUST remove/block:

```text
script
inline JS handlers
unsafe URI
unsafe iframe
```

Preview uses sanitized representation too.

---

# 65. Article Relations

Explicit:

```text
Article ↔ Institution
Article ↔ Opportunity
```

Relations drive internal links and Product conversion.

---

# 66. Article Publish

Atomic:

```text
sanitized content
SEO fields
relations
publication
audit
COMMIT
```

Then:

```text
cache/sitemap revalidation
```

---

# 67. Slug Stability

Published title change:

```text
does not automatically change slug
```

Slug change is explicit command.

---

# 68. Redirect

Published slug change:

```text
old path
→ 308/301
→ new canonical
```

No chains/loops.

Use `url_redirects`.

---

# 69. SEO Public Objects

Canonical public SEO objects:

```text
Article
Institution
Opportunity
```

---

# 70. SEO Rendering

Core content:

```text
Server-rendered initial HTML
```

Personal Follow state:

```text
small client/private island
```

Public page must not become client-only because of Follow state.

---

# 71. Public vs Indexable

Distinct.

Institution/Opportunity indexability is deterministic policy in MVP.

Article has robots fields.

---

# 72. Canonical

Every indexable page:

```text
self-referencing canonical
```

Filter/tracking query removed.

---

# 73. Sitemap

MVP:

```text
single sitemap
```

Include:

- public
- canonical
- indexable
- non-redirect

Exclude:

- draft
- preview
- noindex
- auth
- admin
- My Preppy
- filter query
- redirect source

---

# 74. robots

Admin/Auth/My Preppy/Preview:

```text
noindex
```

robots.txt does not replace page-level noindex.

---

# 75. Structured Data

Use only when semantics fit.

Article:

```text
Article
```

Institution:

```text
Organization/EducationalOrganization safe mapping
```

Opportunity:

`Event` only when event-like and verified fields exist.

Do not mark every deadline/application as Event.

---

# 76. Freshness

Do not use generic `updated_at` as SEO freshness.

No-change Monitoring:

- no fake `lastmod`
- no fake `dateModified`

---

# 77. Cache Revalidation

Validated architecture:

```text
Domain commit
→ dedicated cache-revalidation Outbox event
→ worker
→ protected same-app Route Handler
→ revalidateTag/revalidatePath
```

Revalidation failure never rolls back canonical truth.

---

# 78. Analytics Sources

```text
PostgreSQL = Operational Truth
GA4 = Behavior
GSC = Search visibility
Email Provider = Delivery telemetry
```

---

# 79. Canonical Analytics Events

Required:

```text
home_view
article_view
search
filter
institution_view
opportunity_view
follow_click
signup_start
signup_complete
follow_created
additional_follow
my_preppy_view
notification_sent
notification_open
notification_click
article_to_institution
article_to_follow
hero_primary_cta_click
hero_secondary_cta_click
```

---

# 80. Event Ownership

Client:

```text
view
click
search
filter
```

Server committed:

```text
signup_complete
follow_created
additional_follow
notification_sent
```

Do not count click as success.

---

# 81. Analytics Privacy

Never send:

```text
email
Kakao subject
OAuth token/code
child name
phone
raw search query
```

`child_birth_year` not sent to GA4 by default.

---

# 82. Analytics Failure

Analytics failure must not block Product action.

MVP server analytics:

```text
best-effort after commit
```

No Analytics Outbox initially.

---

# 83. North Star

```text
Active Monitoring Parents
```

DB formula:

```text
User ACTIVE
+ >=1 active Follow
+ usable Email
+ Service Email consent GRANTED
+ Email Preference ENABLED
```

---

# 84. Qualified Visitor

MVP measurement unit should be labeled consistently.

Recommended:

```text
Qualified Sessions
```

A session qualifies if it:

- views Article detail
- views Institution detail
- views Opportunity detail
- or uses search/filter

When reporting original target “Qualified Visitors 500”, dashboard should clearly state implementation is session-based if GA4 session is used.

---

# 85. Detail → Follow

Primary:

```text
sessions with follow_click
/
sessions with Institution or Opportunity detail view
```

---

# 86. Signup Completion

```text
signup_complete
/
signup_start
```

New-user flow only.

---

# 87. Average Follow

Expansion Gate definition:

```text
active Follows belonging to AMP
/
AMP
```

---

# 88. Email Open

```text
unique opened Deliveries
/
sent Deliveries
```

Directional, not exact human-read truth.

---

# 89. Email CTR

```text
unique clicked Deliveries
/
sent Deliveries
```

---

# 90. 14-Day Returning

Cohort:

```text
first Follow activation
```

Meaningful return within day 1–14.

MVP is behavioral estimate, not exact DB truth.

---

# 91. Expansion Gate

Do not expand to Camps/After-school/AI/ads platform before:

```text
AMP >= 100
Detail→Follow >= 10%
Average Follow >= 2
Email Open >= 45%
14-Day Returning >= 25%
Organic AMP increasing
```

---

# 92. Admin

Admin is:

```text
Application Command Console
```

not DB table editor.

---

# 93. Admin IA

```text
Dashboard
Monitoring
Institutions
Opportunities
Sources
Articles
Notifications
Users
Operations
```

---

# 94. Admin Authentication

Separate from public User.

MVP single internal Admin role.

Admin status must be checked per protected request/mutation.

---

# 95. Admin Mutation Model

Validated:

```text
Private Admin Route Handler
→ typed Application Command
→ transaction / row lock
→ domain history
→ Audit
→ required Outbox
```

No direct SQL/CRUD from route.

---

# 96. Admin Dashboard

Priority:

```text
Operational failures
Monitoring due/overdue
Verification
Notification health
Product KPI
```

---

# 97. Monitoring Admin

Primary operator screen.

Must support:

```text
Open Source
No Change
Change Found
Create Opportunity
Update Opportunity
Update Fact
Source Unavailable
Source Moved
```

---

# 98. Article Admin

Must support:

- Draft
- WYSIWYG/HTML
- Preview
- SEO fields
- Relations
- Publish
- Slug change
- Archive

---

# 99. Notification Admin

Must support:

```text
List
Detail
Cancel pending
Inspect Delivery
Retry eligible failed delivery
Inspect Attempts
Inspect Outbox
```

No arbitrary mass-email composer.

---

# 100. Outbox Admin

Must support:

```text
Inspect
Retry
Cancel
Dead-letter
```

No payload editing.

No blind rerun of processed rows.

---

# 101. User Admin

Minimum:

```text
opaque User ID
status
Follow count
Email state
Consent state
Notification summary
```

Raw email not default list column.

Exact email support lookup privileged/audited.

---

# 102. Admin Audit

Reuse existing `audit_logs`.

Critical mutation audit is same DB transaction.

Audit stores:

```text
actor
action
target
time
reason
correlation
safe metadata
```

No raw PII or full HTML.

---

# 103. Data Quality Checks

Admin should surface:

```text
Published Institution without Official Source
Published Opportunity without Verified Truth
Published Opportunity without Evidence
Broken Source
Duplicate slug candidates
Current Version anomaly
Active Follow to archived Institution
Notification without signal
Stale P0 Source
Broken Article relation
```

---

# 104. Operations Health

Public `/api/health` remains minimal liveness.

Admin-only health:

```text
DB
Outbox backlog
Delivery failures
Data quality
safe kill-switch state
```

Process liveness handled by external monitoring.

---

# 105. Kill Switches

Minimum:

```text
EMAIL_SEND_ENABLED
WORKER_ENABLED
ANALYTICS_ENABLED
```

Non-production defaults should prevent production side effects.

---

# 106. Backup / Restore

Production launch requirement.

Must have:

- automated backup
- retention
- restore procedure
- validation queries
- restore drill evidence

Named local Docker volume is not backup.

---

# 107. Observability

Production launch requires:

- structured logs
- error monitoring
- worker errors
- provider errors
- external uptime

Admin dashboard does not replace observability.

---

# 108. Incident Severity

```text
SEV-0 Security / Privacy
SEV-1 Incorrect Notification / Data Integrity
SEV-2 Monitoring / Delivery Degraded
SEV-3 SEO / Analytics / Non-critical Admin
```

---

# 109. Public Routes

MVP required:

```text
/
/institutions
/institutions/{slug}
/opportunities/{slug}
/articles/{slug}
/my-preppy
/auth/kakao/start
/auth/kakao/callback
/privacy
/terms
```

Admin:

```text
/admin/*
```

---

# 110. Public Rendering Model

Validated target:

```text
Next.js 16 Server Components
+ Cache Components for public
+ separate personalized Follow client island
```

My Preppy/Admin:

```text
private
dynamic/no shared cache
```

---

# 111. Core End-to-End User Scenario

## Scenario A — Organic Article → First Follow

```text
Google
→ Article
→ Institution
→ Follow Click
→ Kakao
→ Required consent
→ User ACTIVE
→ Follow ACTIVE
→ My Preppy
```

Success:

- canonical IDs
- signup_complete
- follow_created
- Follow episode open
- no PII analytics

---

# 112. Scenario B — Existing User Adds Institution

```text
Institution
→ Follow Click
→ Follow ACTIVE
```

No signup events.

If second+ Follow:

```text
additional_follow
```

---

# 113. Scenario C — New Native Opportunity

```text
Admin Source Check
→ Create/Verify Opportunity
→ Evidence
→ Publish
→ OpportunityPublished signal
→ Notification
→ Eligible Followers
→ Email
```

---

# 114. Scenario D — Legacy Deadline Change

```text
Official Source
→ Legacy EventVersion update
→ MeaningfulChange
→ canonical OpportunityChange
→ Notification
→ Email
```

User-facing flow identical to native.

---

# 115. Scenario E — No Change

```text
Source Check
→ No Change
```

No:

- Version
- OpportunityChange
- Notification
- SEO freshness

---

# 116. Scenario F — Follow After Change

```text
10:00 signal
14:00 Follow
```

Current Opportunity visible.

No retroactive Email.

---

# 117. Scenario G — Email OFF Before Send

```text
Delivery pending
→ Preference OFF
→ Worker
```

Result:

```text
SUPPRESSED
```

---

# 118. Scenario H — User Delete

```text
Delete Account
```

Results:

- User DELETED
- session denied
- PII child removed
- Follow closed
- pending Delivery suppressed
- opaque history remains

---

# 119. Scenario I — Source Failure

```text
Official site 500/timeout
```

Results:

- Source health warning
- no Opportunity truth mutation
- no false cancel
- no customer notification

---

# 120. Scenario J — Worker Crash

```text
Outbox PROCESSING
→ worker dies
```

Lease recovery allows safe retry.

---

# 121. Scenario K — Article Publish

```text
Draft
→ Preview
→ Sanitize
→ Relations
→ Publish
→ Cache/Sitemap Revalidation
```

---

# 122. Scenario L — Backfill

```text
Legacy records
→ canonical Institution/Opportunity backfill
```

No live user signals.

---

# 123. Functional Requirements — Public Discovery

## FR-PUB-001 Home

User can understand PREPPY value within first view.

## FR-PUB-002 Institution List

User can browse/filter/search Institutions.

## FR-PUB-003 Institution Detail

User can inspect current admissions state, verified information, official source, opportunities.

## FR-PUB-004 Opportunity Detail

User can inspect actionable admissions opportunity.

## FR-PUB-005 Article

User can read editorial content and navigate to related Institution/Opportunity.

## FR-PUB-006 Public Access

Core information is accessible without login.

---

# 124. Functional Requirements — Auth / Follow

## FR-AUTH-001 Anonymous Follow

Anonymous Follow starts Kakao flow with PendingFollowIntent.

## FR-AUTH-002 Existing User

Existing ACTIVE User resumes session and Follow intent.

## FR-AUTH-003 New User

New User becomes PENDING until required Terms/Privacy consent.

## FR-AUTH-004 Optional Profile

Optional profile does not block activation.

## FR-FOL-001 Follow

ACTIVE User can Follow followable Institution.

## FR-FOL-002 Idempotency

Duplicate click/callback does not duplicate Follow/Episode.

## FR-FOL-003 Unfollow

User can stop Monitoring one Institution.

## FR-FOL-004 Reactivate

User can Follow again and create new Episode.

---

# 125. Functional Requirements — My Preppy

## FR-MYP-001 Follow List

Show active followed Institutions.

## FR-MYP-002 Current Opportunities

Show active/upcoming Opportunities across followed Institutions.

## FR-MYP-003 Recent Changes

Show recent canonical OpportunityChanges.

## FR-MYP-004 Trust

Show relevant Source/Last Verified.

## FR-MYP-005 Email State

Show effective Email update state.

## FR-MYP-006 Profile

Allow optional profile/interests edit.

---

# 126. Functional Requirements — Monitoring

## FR-MON-001 Queue

Admin can see due/overdue official Sources.

## FR-MON-002 No Change

Admin can confirm Source checked without truth mutation.

## FR-MON-003 Native Verification

Admin can verify native Opportunity change with Evidence.

## FR-MON-004 Legacy Verification

Admin can verify legacy-backed Opportunity.

## FR-MON-005 Institution Fact

Admin can verify selected Institution facts.

## FR-MON-006 Source Failure

Admin can mark Source unavailable/moved without changing Opportunity truth.

---

# 127. Functional Requirements — Notification

## FR-NOT-001 Signal

Notifiable Opportunity signal creates one Notification.

## FR-NOT-002 Recipient Resolution

Only users following at signal time can qualify.

## FR-NOT-003 Send Recheck

Current eligibility is rechecked immediately before send.

## FR-NOT-004 Delivery Dedupe

One Notification/User/Channel logical Delivery.

## FR-NOT-005 Retry

Retry uses Attempt history, not duplicate Delivery.

## FR-NOT-006 Suppression

Ineligible user is SUPPRESSED without provider call.

## FR-NOT-007 Backfill

Backfill cannot create customer notification.

---

# 128. Functional Requirements — Content/SEO

## FR-SEO-001 Server HTML

Core SEO content in initial HTML.

## FR-SEO-002 Metadata

Title/meta/canonical/robots generated centrally.

## FR-SEO-003 Sitemap

Single indexable canonical sitemap.

## FR-SEO-004 Structured Data

Breadcrumb/Article/Organization/selective Event.

## FR-SEO-005 Internal Links

Article↔Institution↔Opportunity.

## FR-SEO-006 Redirect

Published slug changes create permanent redirect.

## FR-SEO-007 Preview

Draft preview noindex/authenticated.

## FR-SEO-008 Sanitization

Article HTML server-sanitized.

---

# 129. Functional Requirements — Analytics

## FR-ANA-001 Canonical Events

Implement required MVP event catalog.

## FR-ANA-002 Server Success

Critical conversions emitted after commit.

## FR-ANA-003 Privacy

PII/raw query prohibited.

## FR-ANA-004 DB Metrics

AMP/Average Follow from PostgreSQL.

## FR-ANA-005 Environment Isolation

Non-prod does not pollute prod analytics.

## FR-ANA-006 Failure

Analytics outage does not affect Product.

---

# 130. Functional Requirements — Admin

## FR-ADM-001 Auth

Private Admin authentication separate from User.

## FR-ADM-002 Commands

Admin mutations call typed application commands.

## FR-ADM-003 Audit

Critical commands audit actor/action/reason/correlation.

## FR-ADM-004 Monitoring Queue

Due/overdue Source operations.

## FR-ADM-005 Articles

CMS operations.

## FR-ADM-006 Notification Ops

Inspect/cancel/retry.

## FR-ADM-007 Outbox Ops

Inspect/retry/cancel/dead-letter.

## FR-ADM-008 User Support

Minimal PII-safe support lookup.

## FR-ADM-009 Data Quality

Show critical integrity warnings.

## FR-ADM-010 Health

Admin operational health.

---

# 131. Non-functional Requirements — Integrity

## NFR-INT-001

One current Native OpportunityVersion per Opportunity.

## NFR-INT-002

Version lineage non-branching.

## NFR-INT-003

Evidence Source ownership consistent.

## NFR-INT-004

One logical User–Institution Follow.

## NFR-INT-005

One open FollowEpisode.

## NFR-INT-006

Notification/Delivery dedupe enforced in DB.

## NFR-INT-007

Critical verification write + audit + required Outbox atomic.

---

# 132. Non-functional Requirements — Security

## NFR-SEC-001

HttpOnly secure sessions.

## NFR-SEC-002

OAuth state validation.

## NFR-SEC-003

No open redirect.

## NFR-SEC-004

Admin/User auth namespace separated.

## NFR-SEC-005

PII not in analytics/logs/audit metadata.

## NFR-SEC-006

Article HTML sanitized.

## NFR-SEC-007

No provider credential/client secret in browser.

---

# 133. Non-functional Requirements — Reliability

## NFR-REL-001

Email provider call outside core DB transaction.

## NFR-REL-002

Outbox supports retry/lease/dead-letter.

## NFR-REL-003

Worker crash recoverable.

## NFR-REL-004

Provider outage does not corrupt truth.

## NFR-REL-005

Cache revalidation failure does not rollback truth.

## NFR-REL-006

Analytics failure does not block product.

---

# 134. Non-functional Requirements — SEO

## NFR-SEO-001

No client-only core public pages.

## NFR-SEO-002

Noindex/private pages excluded from sitemap.

## NFR-SEO-003

No false dateModified/lastmod.

## NFR-SEO-004

No redirect loops/chains.

## NFR-SEO-005

No thin programmatic pages at MVP.

---

# 135. Non-functional Requirements — Operations

## NFR-OPS-001

Backup/restore verified before production launch.

## NFR-OPS-002

External error monitoring before launch.

## NFR-OPS-003

Kill switches for Email/Worker/Analytics.

## NFR-OPS-004

Non-production side effects blocked by default.

## NFR-OPS-005

Public health endpoint remains low-information liveness.

---

# 136. MVP Analytics KPI Dashboard

Must support or externally link:

### Acquisition

```text
Qualified Sessions
Organic Visitors
Article organic landings
```

### Activation

```text
Detail→Follow
Signup Completion
Follow Created
```

### Monitoring

```text
Active Monitoring Parents
Average Follow
```

### Notification

```text
Sent
Open
CTR
Failed
Suppressed
```

### Retention

```text
14-Day Returning
Notification-driven return
```

---

# 137. 30-Day MVP Validation

Goal:

```text
Qualified Sessions ≈ original Qualified Visitors target 500
Active Monitoring Parents >= 50
```

Secondary:

- Detail→Follow
- Signup Completion
- Average Follow
- Email Open
- Return

must be monitored to diagnose why target is or is not reached.

---

# 138. Expansion Gate

Before expanding Product surface materially:

```text
AMP >= 100
Detail→Follow >= 10%
Average Follow >= 2
Email Open >= 45%
14-Day Returning >= 25%
Organic AMP trend positive
```

---

# 139. Launch Scope — Required Vertical Slice

Before broad coverage, one complete vertical slice must work:

```text
1 Institution
1 Opportunity
1 Official Source
1 Article
1 User
1 Follow
1 Verified Change
1 Notification
1 Email
1 Return
```

And:

```text
Article → Institution → Follow → Kakao → My Preppy
Admin → Verify Change → Outbox → Email → Return
```

---

# 140. Launch Gate — Product

Must:

- Home live
- Institution list/detail live
- Opportunity detail live
- Article detail live
- Follow flow
- Kakao signup
- My Preppy
- Monitoring Queue
- Verify native/legacy change
- Email delivery
- Admin operations

---

# 141. Launch Gate — Data

Must:

- Institution seed coverage
- active official Sources
- verified Opportunities
- Article content
- no blocking duplicate slug
- no current-version anomaly
- no accidental backfill signals

---

# 142. Launch Gate — Security

Must:

- public User auth works
- Admin auth works
- session separation
- OAuth state validation
- no PII logs
- sanitizer
- secure secrets

---

# 143. Launch Gate — Reliability

Must:

- hardened Outbox
- worker
- retry/dead-letter
- provider send safety
- delivery dedupe
- send-time recheck
- Email kill switch

---

# 144. Launch Gate — Operations

Must:

- Admin queue
- dead-letter ops
- backup
- restore runbook/drill evidence
- external error monitoring
- health
- migration runbook

---

# 145. Launch Gate — SEO

Must:

- server-render public pages
- metadata/canonical
- single sitemap
- robots
- noindex private/draft
- redirect safety
- sanitizer
- structured internal links

---

# 146. Launch Gate — Analytics

Must:

- typed event registry
- production GA4 config
- non-prod isolation
- critical server success events
- AMP SQL metric

GSC API is not required.

---

# 147. Release Sequence

Recommended:

```text
1. Canonical schema
2. Application services
3. Public DAL/routes
4. Auth/User/Follow
5. Monitoring/Admin
6. Notification/Outbox/Worker
7. Article/SEO
8. Analytics
9. Production operations
10. Seed/Backfill
11. Smoke test
12. Launch
```

Exact implementation plan belongs to next document.

---

# 148. Definition of Done — MVP

MVP is DONE only if a real user can complete:

```text
Google/Naver
→ Article or Institution
→ Institution/Opportunity exploration
→ Follow
→ Kakao signup
→ My Preppy
→ PREPPY monitors
→ Admin verifies real change
→ Email sent
→ User returns
```

with:

- official Source
- Last Verified
- no duplicate notification
- privacy-safe data
- operational recoverability

---

# 149. Product Acceptance Criteria

## AC-001 Value Comprehension

Home clearly explains service without requiring scrolling through long marketing text.

## AC-002 Discovery

User can locate relevant Institution/Opportunity within a small number of interactions.

## AC-003 Trust

Official Source and verification context are visible.

## AC-004 Follow

Anonymous and authenticated Follow paths work.

## AC-005 Signup

Kakao signup does not force optional Profile.

## AC-006 My Preppy

Followed Institutions and current Opportunities visible.

## AC-007 Monitoring

Admin can check Source and record No Change/Change.

## AC-008 Verification

Verified change creates history/Evidence.

## AC-009 Notification

Eligible User receives one Email.

## AC-010 Suppression

Ineligible User receives none.

## AC-011 Backfill

Migration emits no customer Email.

## AC-012 SEO

Article/Institution/Opportunity pages render server-side and canonical.

## AC-013 Admin Safety

No direct DB CRUD path required for normal operations.

## AC-014 Recovery

Outbox/worker failure can be recovered without duplicate user Email.

## AC-015 Analytics

Follow click and Follow created are distinguishable.

---

# 150. Product Failure Conditions

MVP is not considered validated if:

- traffic arrives but almost nobody clicks Follow
- Follow click high but signup completion poor
- signup completes but users Follow only one and never return
- Email has low click/return despite accurate data
- data operations become too expensive for initial coverage
- frequent wrong/outdated notifications erode trust
- SEO traffic is unrelated to target user intent
- Admin workload exceeds realistic manual-first operation

---

# 151. Expansion Decisions

Do not add:

```text
Camps
After-school
Recommendations
AI
Ads platform
Lead marketplace
```

merely because architecture supports them.

Only after MVP metrics and operational capacity validate core loop.

---

# 152. Monetization Boundary

MVP validation does not depend on revenue.

Long-term possible:

```text
contextual ads
intent ads
explicit-consent lead gen
sponsored content
affiliate/referral
aggregated market intelligence
```

No sale of personally identifiable user/member data.

Advertising/lead functionality not part of MVP PRD.

---

# 153. Product Decision Hierarchy

When implementation ambiguity occurs:

1. latest explicit Product Decision
2. this PRD
3. `00_PRODUCT_REQUIREMENTS_BASELINE.md`
4. validated `02`–`09` architecture
5. existing repository behavior
6. legacy docs

If repository conflicts with validated product meaning, architecture/product wins unless physical blocker is proven.

---

# 154. Open Implementation Decisions

These are intentionally not Product blockers:

- exact Kakao library
- exact Email provider
- exact sanitizer package
- exact GA4 server transport
- exact hosting provider
- exact error monitoring vendor
- exact CI/CD
- 301 vs 308 standard (06A recommends 308)
- exact Admin component library
- exact page visual styling

They must preserve this PRD contract.

---

# 155. Implementation Sequencing Dependencies

Hard dependencies:

```text
Institution
→ Opportunity
→ Public pages

User/Auth
→ Follow
→ My Preppy

OpportunityChange
→ Notification
→ Delivery
→ Email

Source/Evidence
→ Verification
→ Monitoring Trust

Article
→ SEO
→ Acquisition

Admin
→ Operations
```

---

# 156. Implementation Priority

## P0 — Launch-critical

- canonical schema/migration
- Institution/Opportunity public
- Source/Evidence
- Kakao User/Auth
- Follow
- My Preppy
- Monitoring Queue
- Verification
- Notification/Email
- Article CMS/public
- SEO
- Admin
- Outbox Worker
- Backup/Observability
- Analytics core

## P1 — Launch-soon

- more Institution facts
- better filters
- richer Article relation UX
- GSC integration
- notification test send
- richer data-quality dashboard

## P2 — Post-validation

- collector automation
- PDF/browser automation
- more channels
- advanced personalization
- larger geographic coverage

---

# 157. Final MVP Product Contract

PREPPY MVP succeeds when the system can truthfully say:

> **“관심기관을 한 번 Follow하면, PREPPY가 공식 Source를 대신 확인하고, 중요한 입학·모집 변경이 생겼을 때 놓치지 않도록 알려준다.”**

그리고 실제 사용자 행동이:

```text
Discover
→ Follow
→ Monitor
→ Notify
→ Return
```

로 반복된다.

The MVP must validate this relationship before expanding the product surface.
