# 09_ADMIN_OPERATIONS_ARCHITECTURE.md

> **Project:** PREPPY (프레피)  
> **Document Type:** Admin & Operations Architecture  
> **Status:** v1.0 — Repository validation required before implementation  
> **Product Baseline:** `00_PRODUCT_REQUIREMENTS_BASELINE.md`  
> **Target Architecture:** `02_TARGET_ARCHITECTURE.md` Target v1.1  
> **Domain Model:** `03_DOMAIN_MODEL.md` Domain v1.0  
> **Data Model:** `04_DATA_MODEL.md` Data Model v1.0  
> **Monitoring Architecture:** `05_MONITORING_ARCHITECTURE.md` v1.0  
> **Content/SEO Architecture:** `06_CONTENT_SEO_ARCHITECTURE.md` v1.0  
> **Identity/Follow/Notification Architecture:** `07_IDENTITY_FOLLOW_NOTIFICATION.md` v1.0  
> **Analytics Architecture:** `08_ANALYTICS_ARCHITECTURE.md` v1.0  
> **Latest Validation:** `08A_ANALYTICS_ARCHITECTURE_REPOSITORY_VALIDATION.md` — VALID_WITH_IMPLEMENTATION_ADJUSTMENTS  
> **Core Principle:** Admin is an operational interface over application commands, not a database editor.  
> **Purpose:** PREPPY MVP를 1인 운영자가 실제로 안전하게 운영할 수 있도록 Admin IA, command boundaries, monitoring queue, verification workflow, content publishing, notification operations, user support, observability, audit, data quality, failure recovery, backup/restore, access control, and operational runbooks를 정의한다.

---

# 0. Document Role

PREPPY MVP는 자동화보다 운영 품질이 먼저다.

특히 초기에는:

```text
Official Source 확인
→ Admin 판단
→ Verified Truth
→ OpportunityChange
→ Notification
→ Email
```

이 핵심 Loop의 상당 부분이 운영자 행동에 의존한다.

따라서 Admin은 부가 기능이 아니라 MVP Core Infrastructure다.

이 문서에서 결정한다.

1. Admin IA
2. Admin access/security
3. Dashboard
4. Monitoring Queue
5. Institution operations
6. Opportunity operations
7. Source operations
8. Article CMS operations
9. Notification operations
10. User/support operations
11. Data quality controls
12. Audit trail
13. Failure/retry/dead-letter operations
14. Operational KPIs
15. Backup/restore readiness
16. release/deployment operations
17. runbooks
18. incident severity
19. manual correction boundaries
20. MVP에서 구현하지 않을 운영 기능

이 문서에서 하지 않는다.

- 복잡한 RBAC
- 승인 workflow engine
- automated crawler 구현
- advertiser console
- customer support CRM
- full BI platform
- data warehouse
- multi-tenant Admin
- mobile Admin app
- production migration SQL
- exact UI component design

---

# 1. Admin Product Principle

Admin은:

```text
Database Table CRUD UI
```

가 아니다.

Admin은:

```text
Application Command Console
```

이다.

예:

```text
Bad:
UPDATE opportunity_versions SET ...

Good:
VerifyOpportunityChange(...)
```

```text
Bad:
DELETE FROM follows ...

Good:
DeactivateFollow(...)
```

```text
Bad:
UPDATE articles SET status='PUBLISHED'

Good:
PublishArticle(...)
```

---

# 2. Why This Matters

PREPPY는:

- historical lineage
- Evidence
- Source
- Follow eligibility
- Notification dedupe
- SEO canonical
- audit

가 서로 연결되어 있다.

DB row를 직접 바꾸면:

```text
Version history 깨짐
Evidence 누락
OpportunityChange 누락
Notification 누락/오발송
SEO stale
Audit 공백
```

이 발생할 수 있다.

따라서 Admin 화면은 table editor가 아니라 Domain/Application Service를 호출한다.

---

# 3. Admin Information Architecture

MVP sidebar:

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

`Operations` 아래:

```text
Outbox
Failed Deliveries
Dead Letters
Audit
System Health
```

복잡한 메뉴 depth를 만들지 않는다.

---

# 4. Admin Route Taxonomy

권장:

```text
/admin
/admin/monitoring
/admin/institutions
/admin/institutions/{id}
/admin/opportunities
/admin/opportunities/{id}
/admin/sources
/admin/sources/{id}
/admin/articles
/admin/articles/{id}
/admin/notifications
/admin/notifications/{id}
/admin/users
/admin/users/{id}
/admin/operations/outbox
/admin/operations/deliveries
/admin/operations/audit
/admin/operations/health
```

SEO:

```text
NOINDEX
```

Public route와 명확히 분리.

---

# 5. Admin Authentication

MVP Admin은 1인 운영 또는 극소수 내부 운영자를 전제로 한다.

복잡한 RBAC 대신:

```text
Authenticated Admin
```

하나의 role로 시작.

기존 `admin_users`/admin auth config가 있다면 재사용.

---

# 6. Admin Access Security

필수:

- HTTPS
- authenticated Admin session
- secure HttpOnly cookie
- short/appropriate session lifetime
- logout
- route guard
- CSRF/origin protection for mutation
- rate limiting where appropriate
- secrets not exposed
- no public indexing
- no PII in logs

가능하면:

```text
MFA
```

를 도입하는 것이 바람직하지만 MVP blocker는 아니다.

---

# 7. Admin Session vs User Session

Public User session과 Admin session은 분리한다.

```text
User Auth
!=
Admin Auth
```

같은 cookie name/session namespace 사용 금지.

Admin 권한을 Kakao User account에 붙이지 않는다.

---

# 8. Admin Dashboard Objective

Dashboard는 “예쁜 숫자 화면”이 아니다.

운영자가 오늘 해야 할 일을 판단하는 화면이다.

Priority:

```text
1. Overdue Monitoring
2. Failed/Dead-letter
3. Pending Verification
4. Notification Failures
5. Product KPI
```

---

# 9. Dashboard Sections

## 9.1 Today Operations

```text
Due Source Checks
Overdue Checks
P0 Active Sources
Pending Verification
Sources Unavailable
```

## 9.2 Notification Health

```text
Pending Outbox
Dead Letter
Failed Deliveries
Suppressed Deliveries
Sent Today
```

## 9.3 Content / Acquisition

```text
Published Articles
Draft Articles
Indexable Institutions
Indexable Opportunities
```

## 9.4 Product Metrics

```text
Qualified Visitors
Follow Clicks
Signup Complete
Active Monitoring Parents
Average Follow
14-Day Returning
```

Analytics availability에 따라 일부는 external link/placeholder 가능.

---

# 10. Dashboard Data Source Rule

Operational Admin metric:

```text
PostgreSQL
```

Behavioral:

```text
GA4
```

Search:

```text
GSC
```

Admin Dashboard에서 Source를 표시하거나 internal definition을 명확히 한다.

---

# 11. Dashboard Priority Color / Severity

UI exact color는 구현 영역.

논리 severity:

```text
NORMAL
ATTENTION
URGENT
BLOCKING
```

예:

```text
Dead Letter > 0
→ URGENT

P0 overdue > 24h
→ URGENT

Source unavailable once
→ ATTENTION
```

복잡한 scoring model 없음.

---

# 12. Monitoring Queue

MVP Admin의 가장 중요한 화면.

```text
/admin/monitoring
```

---

# 13. Monitoring Queue Item

각 row/card:

```text
Institution
Source
Source Role
Priority
Last Checked
Next Due
Current Opportunity State
Open Opportunities
Follow Count optional
Source Health
Reason
```

Actions:

```text
Open Source
No Change
Change Found
Create Opportunity
Update Opportunity
Update Institution Fact
Source Unavailable
Source Moved
```

---

# 14. Monitoring Queue Data Model

별도 persistent `monitoring_tasks` table은 기본적으로 만들지 않는다.

Queue는:

```text
source_monitor_configs
+ active source bindings
+ latest observations
+ current Opportunity state
+ Institution state
```

에서 계산.

05A의 query-driven queue 원칙 유지.

---

# 15. Monitoring Queue Filters

MVP:

```text
Priority
Due / Overdue
Institution Category
Region
Source Health
```

Full-text advanced ops search는 후순위.

---

# 16. Monitoring Queue Sort

기본:

```text
Overdue first
→ Priority
→ Next Due
```

운영자가 “오늘 무엇부터 할지” 명확해야 한다.

---

# 17. Open Source Action

`Open Source`:

- official URL 새 탭
- current Source metadata
- last observation
- related Institution/Opportunity

표시.

그 자체로 Observation 생성하지 않는다.

운영자가 결과 action을 명시해야 한다.

---

# 18. No Change Command

Admin action:

```text
ConfirmNoChange
```

결과:

- Observation/Audit
- Last Checked projection
- no Version
- no OpportunityChange
- no Notification
- no SEO lastmod change

05/06 Architecture와 일치.

---

# 19. Change Found Workflow

```text
Source open
→ Change Found
→ affected object select
→ proposed state edit
→ diff
→ Evidence
→ verify
```

---

# 20. Verification Diff

Admin은 최소:

```text
Previous Verified State
Proposed State
```

를 비교.

예:

```text
Application close:
2026-09-20
→
2026-09-23
```

변경되지 않은 field를 불필요하게 보여주지 않는다.

---

# 21. Verification Form

Native Opportunity:

```text
Title
Business State
Dates
Target Audience
Action URL
Summary
Evidence Source
Change Type
Materiality
```

Legacy-backed:

기존 Event fields와 mapping 가능한 canonical form.

---

# 22. Materiality Default

System policy default:

```text
NOTIFIABLE
NON_NOTIFIABLE
```

Admin override 가능.

Override 시:

```text
reason
actor
timestamp
```

audit.

---

# 23. Notification Preview Before Verify

Notifiable change인 경우:

```text
Potential recipients
Email preview
Deep link
```

을 verify 전에 보여줄 수 있다.

그러나 recipient count는 최종 commit/send 시 달라질 수 있다.

따라서 label:

```text
Estimated Eligible Followers
```

정도로 표현.

---

# 24. Verify Command

Admin 최종 action:

```text
Verify
```

호출:

```text
VerifyNativeOpportunity
or
VerifyLegacyOpportunity
```

직접 Version CRUD 금지.

---

# 25. Verification Success

성공 후:

```text
Verified at
Version
OpportunityChange
Notification status
Outbox status
```

요약 표시.

---

# 26. Verification Failure

예:

- concurrent update
- invalid Source/Evidence
- lineage constraint
- bridge inconsistency
- stale version

처리:

```text
transaction rollback
clear message
reload current state
```

Admin에게 DB stack trace 노출 금지.

---

# 27. Concurrent Edit

두 Admin이 같은 Opportunity 검증 가능.

MVP 1인 운영이라도:

- double submit
- tab duplicate
- retry

가 있으므로 optimistic/current version check 필요.

권장:

```text
expected_version_id
```

또는 current version lock 기반.

stale form이면:

```text
Conflict — reload
```

---

# 28. Institution Admin

목록:

```text
Name
Category
Region
Operational State
Publication State
Source Coverage
Follow Count
Open Opportunities
Last relevant verification
```

---

# 29. Create Institution

Command:

```text
CreateInstitution
```

필수:

- display name
- category
- region
- slug
- official Source

Draft creation은 Source 없이도 가능할 수 있으나 Publish 전에 official Source 필요.

---

# 30. Edit Institution Stable Profile

가능:

- display name
- category correction
- region/address
- official website
- short description

중요 Fact:

```text
tuition
eligibility
curriculum
```

는 raw root edit 대신 Fact verification flow.

---

# 31. Institution Publish

Command:

```text
PublishInstitution
```

checks:

- canonical slug
- meaningful profile
- official Source
- category/region
- indexability policy
- duplicate risk

SEO cache/sitemap side effect는 post-commit.

---

# 32. Institution Duplicate Check

Create/Publish 전:

- normalized name
- region
- aliases
- legacy School link

기반 warning.

자동 merge 금지.

---

# 33. Institution Archive/Close

Operational Close:

```text
MarkInstitutionClosed
```

Publication Archive:

```text
ArchiveInstitution
```

둘을 구분.

기존 Follow/Opportunity/history 삭제 금지.

---

# 34. Opportunity Admin List

fields:

```text
Title
Institution
Kind
Business State
Publication State
Truth Mode
Last Verified
Source
Recent Change
```

filters:

```text
Institution
Category
Kind
State
Truth Mode
Published
Needs Verification
```

---

# 35. Create Native Opportunity

Command:

```text
CreateNativeOpportunity
```

Draft root 생성.

첫 verified Version + Evidence + Publish를 한 흐름으로 할 수 있음.

---

# 36. Legacy-backed Opportunity

Admin에:

```text
Legacy-backed
```

technical badge를 보여줄 수 있으나 public에는 숨김.

bridge state와 underlying Event 링크 운영자가 확인 가능.

---

# 37. Opportunity Publish

검증:

- current verified truth
- official Evidence
- Institution published/followable
- slug
- title
- kind

첫 live publish는 Notification eligible signal일 수 있음.

Migration/backfill flow는 별 command/import mode.

---

# 38. Backfill / Import Guard

Admin 일반 UI에서:

```text
Backfill with notification
```

같은 옵션을 제공하지 않는다.

Migration/backfill tool은 separate privileged script/command.

기본:

```text
signals disabled
```

---

# 39. Opportunity Archive/Hide

`Hide`:

temporary/public visibility.

`Archive`:

historical lifecycle.

둘 다 history/evidence 유지.

Notification을 자동 발생시키지 않는다 unless verified business change warrants it.

---

# 40. Institution Fact Admin

sections:

```text
Tuition
Target Age/Grade
Curriculum
Eligibility
Transport
Admission Process
Operating Info
```

각:

```text
Current Verified Value
Last Verified
Evidence
History
```

---

# 41. Verify Institution Fact

Command:

```text
VerifyInstitutionFact
```

no-change:

Version 생성 안 함.

changed:

Version + Evidence.

MVP Email trigger 아님.

---

# 42. Source Admin

List:

```text
URL
Authority
Health
Role/Bindings
Last Checked
Active
```

---

# 43. Create Source

Command:

```text
CreateSource
```

canonical URL normalization.

duplicate canonical URL warning/reject.

---

# 44. Source Binding

Actions:

```text
Bind Source to Institution
Bind Source to Opportunity
Unbind Source
Set Primary
```

generic DB polymorphism UI 없음.

---

# 45. Source URL Change

단순 correction인지 Source moved인지 구분.

### URL correction

same underlying source.

### Source moved/new official page

new Source identity + old inactive/moved.

historical Evidence 보존.

---

# 46. Source Health

Admin 표시:

```text
HEALTHY
DEGRADED
UNAVAILABLE
MOVED
UNKNOWN
```

projection.

한 번 오류로 truth 변화 금지.

---

# 47. Article Admin

List:

```text
Title
Type
Category
Status
Published At
Updated At
Indexability
Relations
```

---

# 48. Article Editor

MVP:

```text
Title
Slug
Excerpt
WYSIWYG
HTML Source
SEO Title
SEO Description
Robots
Featured Image URL/Alt
Relations
Preview
```

Tiptap + HTML source는 baseline 방향.

---

# 49. Article Sanitization

Publish 전에 server sanitizer mandatory.

Admin editor에 raw HTML 입력이 있어도:

```text
stored/published = sanitized HTML
```

Preview도 sanitized version.

---

# 50. Article Preview

Admin authenticated.

```text
noindex
not sitemap
```

preview route/session protected.

---

# 51. Article Relations

Admin에서:

```text
Related Institutions
Related Opportunities
```

검색/select.

publish 전:

- target exists
- target public state

warning.

비공개 relation은 저장 가능할 수 있으나 public CTA omit.

---

# 52. Article Publish

Command:

```text
PublishArticle
```

transaction:

- sanitized content
- status
- SEO metadata
- relations
- audit

post-commit:

- revalidation
- sitemap

---

# 53. Article Slug Change

명시적 action.

Admin warning:

```text
Existing public URL will redirect.
```

transaction:

- new slug
- url_redirect
- audit

redirect chain flatten.

---

# 54. Notification Admin

List:

```text
Notification
Opportunity
Signal
Status
Created
Recipients
Sent
Suppressed
Failed
Clicked
```

---

# 55. Notification Detail

표시:

```text
Signal
Institution
Opportunity
Policy Version
Content Snapshot
Deep Link
Recipient Summary
Deliveries
Attempts
Outbox
```

PII 최소화.

raw email 기본 숨김/미저장.

---

# 56. Manual Notification Creation

MVP에서는 arbitrary marketing notification composer를 만들지 않는다.

Canonical Notification은:

```text
OpportunityPublished
OpportunityChange
```

에서 생성.

Admin이 마음대로 “팔로워 전체에게 메일 보내기” 기능 금지.

---

# 57. Notification Cancel

Pending/Ready Notification:

```text
CancelNotification
```

가능.

이미 SENT Delivery 회수 불가.

cancel:

- future delivery creation/send stop
- audit reason

---

# 58. Delivery Retry

Failed retryable delivery:

```text
RetryDelivery
```

또는 outbox replay.

조건:

- current eligibility 재검증
- terminal bounce면 retry 금지
- duplicate send prevention

---

# 59. Suppressed Delivery

SUPPRESSED는 실패가 아니다.

reason 표시:

```text
USER_INACTIVE
FOLLOW_INACTIVE
PREFERENCE_DISABLED
CONSENT_REVOKED
EMAIL_UNAVAILABLE
EMAIL_SUPPRESSED
```

운영자가 강제 send override하지 않는다.

---

# 60. Failed Delivery

운영자가 확인할 내용:

```text
safe error code
attempt count
provider status
last attempt
retryable?
```

raw provider payload 노출 금지.

---

# 61. Outbox Admin

List:

```text
Event Type
Aggregate
Status
Available At
Attempt
Locked At
Last Error
Age
```

filters:

```text
PENDING
PROCESSING
FAILED
DEAD_LETTER
```

---

# 62. Outbox Actions

MVP:

```text
Retry
Cancel
Inspect
```

단:

- PROCESSED row 재실행 금지 기본
- retry는 idempotency 보장 event만
- manual payload edit 금지

---

# 63. Dead Letter

Dead Letter는 반드시 Dashboard urgent state.

Admin:

```text
Inspect
Retry
Cancel
```

reason/audit.

---

# 64. Worker Health

Admin `/operations/health`:

```text
Last Worker Heartbeat
Oldest Pending Outbox
Processing Stale Count
Dead Letter Count
Failed Delivery Count
```

별 heartbeat table이 필요한지 implementation에서 판단.

MVP에서는:

- outbox age
- last processed timestamp

로 충분할 수 있음.

---

# 65. System Health

minimum:

```text
DB Health
App Health
Worker Health
Email Provider status if known
```

현재 `/api/health` 재사용 가능.

---

# 66. User Admin

MVP User Support는 최소화.

List:

```text
User opaque ID
Status
Created
Follow Count
Email State
Last Activity optional
```

raw email은 기본 list에 노출하지 않는 것을 권장.

---

# 67. User Detail

운영 필요 시:

```text
User ID
Status
Email state
Follows
Consent states
Preference
Notification summary
```

PII 최소.

---

# 68. User Search

Support 목적 Email search가 실제 필요할 수 있다.

MVP에서 구현 시:

- exact email normalized lookup
- privileged Admin only
- search query audit/log redaction

부분 email fuzzy 검색은 우선 안 함.

---

# 69. User Mutation Limits

Admin이 가능한 것:

```text
view status
disable/suspend if policy requires
inspect Follows
inspect notification state
```

Admin이 하면 안 되는 것:

- 임의 Consent GRANTED 생성
- User 대신 marketing permission 부여
- arbitrary Email preference ON
- PII 변경 without support process
- deleted account 복구

---

# 70. User Deletion Support

User requested deletion은 public User flow 우선.

운영자가 manual support deletion을 실행할 경우 같은:

```text
DeleteUser
```

application command 사용.

DB 직접 delete 금지.

---

# 71. Consent Admin

Consent history:

read-only.

Admin 수정 금지.

지원/감사 용도로:

- type
- policy version
- decision
- timestamp

만.

---

# 72. Follow Admin

기본 read-only operational view.

지원상 강제 Unfollow가 필요하면:

```text
DeactivateFollow
```

command + reason + audit.

Admin이 Follow를 대신 생성하는 기능은 MVP 불필요.

---

# 73. Audit Log

critical operations는 audit.

minimum fields:

```text
actor_admin_id
action_type
target_type
target_id
occurred_at
request/correlation_id
reason optional
metadata_safe
```

---

# 74. Audit Targets

필수:

- Institution publish/archive
- Opportunity verify/publish/hide/archive
- Institution Fact verify
- Source binding/change
- Article publish/unpublish/slug change
- Notification cancel/retry
- Outbox retry/cancel
- User support delete/suspend
- materiality override

---

# 75. Audit Is Not Full Event Sourcing

모든 field change를 전체 snapshot으로 남기지 않는다.

Versioned domains는 Version history가 primary.

Audit는:

```text
who performed command
what command
when
why
```

보조.

---

# 76. Audit PII Rule

Audit metadata에:

- raw email
- provider subject
- OAuth token
- Article raw HTML
- external provider payload

저장 금지.

---

# 77. Correlation ID

Admin mutation request에:

```text
correlation_id
```

를 부여.

연결:

```text
Admin command
→ Audit
→ OpportunityChange
→ Outbox
→ Notification
→ Delivery
```

운영 debugging에 사용.

---

# 78. Data Quality Dashboard

MVP useful checks:

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
Article broken relation
```

---

# 79. Data Quality Enforcement

가능한 것:

DB constraint.

cross-table/business rule:

scheduled/read-only checks.

Admin Dashboard에서 warning.

모든 data-quality rule을 trigger로 만들지 않는다.

---

# 80. Data Quality Severity

```text
BLOCKING
HIGH
MEDIUM
LOW
```

예:

```text
2 current OpportunityVersions
→ BLOCKING

Article missing featured image
→ LOW
```

---

# 81. Correction Workflow

잘못된 verified 정보:

```text
do not overwrite history
→ create corrected Version
→ Evidence
→ OpportunityChange if user-visible
```

잘못된 Notification을 이미 보낸 경우:

- history 유지
- corrected Opportunity
- 필요시 new correction Notification policy

MVP에서 “발송 취소”로 과거 Email 삭제 불가.

---

# 82. Admin Undo

generic Undo 버튼 만들지 않는다.

왜냐하면 domain별 의미가 다르다.

대신:

```text
corrective command
```

사용.

예:

- Article Unpublish
- Opportunity corrected Version
- Source rebind
- Notification cancel before send

---

# 83. Notification Mis-send Incident

오발송 발생 시 runbook:

1. stop relevant worker/outbox event if ongoing
2. identify signal/Notification
3. suppress unsent Deliveries
4. correct canonical truth
5. decide correction communication
6. audit incident
7. root cause
8. add test/guard

---

# 84. Source False Positive Incident

1. Source failure인지 truth change인지 구분
2. no auto mutation principle 확인
3. incorrect Version 있으면 corrective Version
4. Notification impact 확인
5. source health/update
6. guard 개선

---

# 85. Backfill Notification Incident Guard

Backfill/import command는 live Product signal과 분리.

Admin UI에서 일반 운영자가 backfill signal을 enable하지 못함.

Migration scripts에는 explicit:

```text
emit_product_signal = false
```

equivalent semantic.

---

# 86. Duplicate Notification Guard

Admin Dashboard check:

```text
same OpportunityChange
→ multiple canonical Notifications?
```

unique dedupe가 막아야 함.

발견 시 BLOCKING.

---

# 87. Stuck Outbox Runbook

조건:

```text
oldest pending age exceeds threshold
```

steps:

1. worker health
2. DB connectivity
3. stale PROCESSING lease
4. error class
5. retryable?
6. requeue stale row
7. verify idempotency

---

# 88. Dead Letter Runbook

1. inspect safe error
2. identify event type
3. fix underlying issue
4. current state/eligibility revalidate
5. retry
6. if impossible cancel with reason
7. audit

---

# 89. Email Provider Incident

1. stop new sends if provider outage confirmed
2. leave delivery outbox pending/backoff
3. do not mark SENT
4. recover after provider
5. provider timeout ambiguity reconcile
6. monitor duplicate risk

---

# 90. User Privacy Incident

examples:

- raw email log
- private cache leak
- provider subject analytics

severity:

```text
BLOCKING/CRITICAL
```

actions:

1. stop exposure
2. revoke/clear cache/log sink as possible
3. assess affected scope
4. remediate code
5. rotate secrets if needed
6. document incident

legal notification policy 별도.

---

# 91. Incident Severity

```text
SEV-0 Security/Privacy Critical
SEV-1 Incorrect User Notification / Core Data Integrity
SEV-2 Monitoring/Delivery Degraded
SEV-3 Non-critical Admin/SEO/Analytics issue
```

---

# 92. SEV-0

예:

- credential exposure
- private user data public
- auth bypass

즉시 service containment.

---

# 93. SEV-1

예:

- wrong admissions info sent
- duplicate mass email
- data history corruption

priority repair.

---

# 94. SEV-2

예:

- worker down
- source monitoring delayed
- email provider outage

product degraded.

---

# 95. SEV-3

예:

- analytics event missing
- sitemap stale
- Article preview issue

core Monitoring continues.

---

# 96. Operations Metrics

## Monitoring

```text
Due Checks
Completed Checks
Overdue Checks
P0 Freshness
Source Failures
Verified Changes
```

## Delivery

```text
Pending
Sent
Suppressed
Failed
Dead Letter
Oldest Pending
```

## Content

```text
Draft
Published
Noindex
Broken Relations
```

## Data Quality

```text
Blocking Issues
High Issues
```

---

# 97. Operational Daily Routine

초기 1인 운영 권장:

```text
1. Dashboard urgent 확인
2. Dead letter/failed delivery 확인
3. P0 Monitoring Queue 처리
4. P1 due queue 처리
5. Source failures 확인
6. Pending content publish
7. KPI quick check
```

---

# 98. Weekly Routine

```text
P2 source checks
stale content review
source coverage audit
Article publish calendar
AMP/Follow/Retention review
data quality checks
backup status
```

---

# 99. Monthly Routine

```text
Source inventory
closed/archived Institution review
Fact freshness
SEO/GSC review
consent/privacy review
restore drill status
operational bottleneck review
automation gate review
```

---

# 100. Automation Gate

Admin workload data로 자동화 판단.

자동화 필요 신호:

```text
Overdue source checks rising
Manual check hours excessive
Coverage expansion blocked
False-positive rate measurable
Repeated deterministic source pattern
```

그 전 full crawler 투자 금지.

---

# 101. Backup Architecture

PostgreSQL backup은 launch blocker.

최소:

- managed DB automated backup or scheduled pg dump equivalent
- retention
- restore procedure
- backup success visibility

정확한 provider는 deployment 결정.

---

# 102. Backup Scope

포함:

- canonical schema
- legacy history
- Source/Evidence
- Users/Follows
- Notifications
- Articles
- Audit

external image/object assets 있으면 별도 backup policy.

---

# 103. Restore Readiness

“backup enabled”만으로 충분하지 않다.

최소 runbook:

```text
restore target
restore command/process
secret/config
schema migration compatibility
validation queries
```

실제 periodic restore drill 권장.

---

# 104. Restore Validation Queries

예:

```text
Institution count
Opportunity current version integrity
Follow count
User count
NotificationDelivery count
Article count
outbox pending/dead-letter
```

---

# 105. Migration Operations

Production migration은:

```text
preflight
backup
apply
verify
application cutover
post-check
```

순서.

Additive migration 우선.

---

# 106. Migration Preflight

04 Data Model:

- duplicate Institution/slug
- legacy mapping
- current version anomalies
- Outbox rows
- subscriber data
- guide/update rows

read-only inventory 먼저.

---

# 107. Migration Safety

금지:

- deploy와 destructive drop 동시
- unknown production data에서 column NOT NULL 즉시
- legacy writer 살아있는 상태에서 unique backfill 강제
- migration 중 live product Notification

---

# 108. Release Operations

MVP release:

```text
migration
→ deploy web
→ deploy/start worker
→ smoke test
→ monitoring
```

exact CI/CD later.

---

# 109. Smoke Tests

release 후 최소:

```text
/api/health
Home
Institution page
Opportunity page
Article page
Kakao start route
Admin login
Monitoring Queue
Follow flow
My Preppy
Outbox worker
Email test
```

production user-impacting Email test는 controlled test account.

---

# 110. Feature Flags

MVP generic feature flag platform 없음.

필요한 operational switches:

```text
EMAIL_SEND_ENABLED
MONITORING_WORKER_ENABLED
ANALYTICS_ENABLED
```

정도의 environment/config kill switch는 유용.

---

# 111. Email Kill Switch

대량 오발송 위험 때문에:

```text
EMAIL_SEND_ENABLED=false
```

즉시 external send stop 가능해야 한다.

Notification/Delivery rows는 유지.

---

# 112. Worker Kill Switch

```text
WORKER_ENABLED=false
```

outbox processing stop.

DB truth/write는 계속 가능.

---

# 113. Analytics Kill Switch

```text
ANALYTICS_ENABLED=false
```

Product unaffected.

08A와 일치.

---

# 114. Monitoring Kill Switch

Source checks/manual Admin은 가능하되 automated/future collector off.

MVP manual-first이므로 complex switch 불필요.

---

# 115. Environment Separation

최소:

```text
development
test
production
```

Production:

- real Kakao
- real Email
- real GA4

Non-production:

- test/noop adapters
- no production Email
- no production GA4

---

# 116. Test Email Safety

Non-production Email:

- allowlisted recipient
- sandbox provider if available
- subject prefix

production customer에게 test email 금지.

---

# 117. Admin PII Exposure

Admin은 필요 이상의 PII를 보지 않는다.

list pages:

opaque ID/state 중심.

Support case에서만 exact Email lookup.

child birth year는 기본 user list에 표시할 이유 없음.

---

# 118. Admin Export

CSV bulk export MVP Non-Scope.

특히 User/Email export 금지 기본.

필요한 aggregated metric export는 later.

---

# 119. Bulk Actions

MVP에서 제한.

허용 후보:

```text
select Sources → mark inactive?
```

도 위험.

기본적으로 critical domain bulk mutation 금지.

특히:

- bulk publish
- bulk notification
- bulk user preference
- bulk follow

금지.

---

# 120. Admin Search

MVP:

```text
Institution name
Opportunity title
Source URL
Article title
User exact Email optional
```

단일 global search는 후순위.

---

# 121. Pagination

Admin lists는 volume 증가 대비 pagination 지원.

초기엔 단순 server pagination.

---

# 122. Sorting

table sorting은 DB query order.

client entire dataset 로드 금지.

---

# 123. Admin Error UX

error type:

```text
VALIDATION
CONFLICT
NOT_FOUND
PERMISSION
RETRYABLE
SYSTEM
```

운영자가 행동을 결정할 수 있는 메시지.

DB constraint raw message 그대로 노출 금지.

---

# 124. Retryable Error

예:

- external provider temporary
- cache revalidation
- transient DB contention

Admin에:

```text
Retry
```

가능.

---

# 125. Conflict Error

stale Version/Article.

```text
Reload current state
```

권장.

자동 overwrite 금지.

---

# 126. Audit Correlation

Admin command response에 internal:

```text
correlation_id
```

표시 가능.

운영 로그 검색.

---

# 127. Observability Boundary

Admin dashboard는 observability 전체를 대체하지 않는다.

필요:

- structured application logs
- error monitoring
- worker metrics
- DB monitoring

specific vendor는 later.

---

# 128. Error Monitoring

launch 전에 최소:

- uncaught server error
- auth failure anomaly
- worker error
- email provider error
- cache revalidation error

관찰 가능.

---

# 129. Logging Requirements

공통 IDs:

```text
correlation_id
institution_id
opportunity_id
source_id
notification_id
delivery_id
outbox_id
article_id
user_id opaque
```

금지:

```text
raw email
Kakao subject
OAuth token
Article unsafe HTML
```

---

# 130. Log Retention

정확 기간은 infra/privacy 정책.

PII가 없도록 설계하여 운영 보존 부담 최소화.

---

# 131. Admin Analytics

Admin 자체 행동 event를 GA4 Product Analytics에 섞지 않는다.

Admin usage는 audit/log.

Product GA4 stream은 public user behavior.

---

# 132. Support Operations

MVP 별 CRM 없음.

User 문의가 들어오면:

- opaque User ID
- exact Email lookup
- Follow state
- Notification status

확인.

지원 action은 canonical command 사용.

---

# 133. Support Ticket

DB support_ticket table MVP 불필요.

초기 external email/manual.

Support volume 증가 시 later.

---

# 134. Notification Recipient Estimate

Admin verification preview에서 recipient estimate query는:

```text
current eligible followers
```

기반.

최종 actual Delivery count와 다를 수 있음.

UI에 명확히 표시.

---

# 135. Notification Dry Run

MVP 유용한 안전장치.

`Preview Notification`:

- content render
- recipient estimated count
- no Delivery
- no Outbox

실제 publish/verify와 분리.

---

# 136. Test Send

운영자 test email:

- real Notification recipient graph와 분리
- allowlisted admin email
- marked TEST
- production analytics 제외

canonical NotificationDelivery history에 사용자 send처럼 넣지 않는 것을 권장.

---

# 137. Content Preview vs Test Send

Article Preview:

no public publish.

Notification Test Send:

no canonical customer Delivery.

둘 다 production state를 오염시키지 않는다.

---

# 138. Source Coverage Dashboard

Institution별:

```text
Official Main
Admissions
Application
Other
```

coverage.

Source가 하나도 없는 Published Institution warning.

---

# 139. Follow Coverage

Active followers가 있는 Institution에:

```text
active official source >=1
```

없으면 HIGH/BLOCKING warning.

왜냐하면 User에게 Monitoring 중이라고 보이기 때문.

---

# 140. Monitoring Trust SLA

internal goal:

```text
P0 daily
P1 2–3d
P2 weekly
```

Dashboard에서:

```text
fresh
due
overdue
```

projection.

---

# 141. Opportunity Freshness

Admin list:

```text
Last Verified
Source Last Checked
```

를 둘 다 보여주되 label 분리.

---

# 142. Article Freshness

Article updated_at은 editorial.

Monitoring freshness와 섞지 않음.

Admin Content dashboard도 동일.

---

# 143. SEO Operations

Admin Article/Institution/Opportunity에서:

```text
Indexable?
Canonical URL
Robots
Sitemap eligible
```

projection.

manual arbitrary index override는 Article 외 기본 없음.

---

# 144. Redirect Admin

`url_redirects` view:

```text
source
target
status
created
disabled?
```

직접 arbitrary redirect composer는 위험.

slug change command가 생성하는 것이 기본.

필요한 manual redirect는 privileged action + validation.

---

# 145. Redirect Safety

manual redirect 검증:

- source != target
- target canonical
- no chain
- no loop
- source not active canonical path

---

# 146. Sitemap Operations

Admin에서:

- last generated
- URL count
- error

정도.

manual “submit to Google” automation은 MVP 필수 아님.

---

# 147. GSC Operations

09 Dashboard에서 external GSC link로 충분.

API integration 없어도 됨.

---

# 148. Analytics Dashboard Integration

08A 추천대로:

```text
PostgreSQL exact metrics
+
GA4 external/product funnel
+
GSC external search
```

초기 Admin에 모든 GA4 chart를 embed할 필요 없음.

---

# 149. Admin KPI Data Freshness

DB metrics:

near-real-time.

GA4/GSC:

lag 있을 수 있음.

UI/dashboard label.

---

# 150. Data Correction Permissions

MVP single Admin라도 critical mutation에 confirmation:

- delete/archive
- Notification cancel
- retry dead-letter
- User delete
- slug change
- source unbind

---

# 151. Destructive Confirmation

confirmation에는 target name/ID 포함.

“Are you sure?”만보다:

```text
Archive ABC International School?
```

명확.

---

# 152. Hard Delete

Admin UI에서 core root hard delete 기능 제공하지 않는다.

예:

- Institution
- Opportunity
- User
- Article
- Notification

logical state transition 사용.

---

# 153. Legacy Admin Data

Legacy School/Event/Alert는 transition 동안 read-only context로 볼 수 있음.

새 write는 canonical service.

---

# 154. Legacy Write Retirement

M9 이후:

- Subscriber/Subscription new write stop
- legacy Alert new write stop
- Guides/Updates write stop

Admin에서도 hidden/read-only.

---

# 155. Admin Module Ownership

Admin 자체가 Domain data를 소유하지 않는다.

```text
Admin UI
→ Application Services
```

---

# 156. Application Commands Catalog

## Institution

```text
CreateInstitution
UpdateInstitutionProfile
PublishInstitution
HideInstitution
ArchiveInstitution
MarkInstitutionClosed
VerifyInstitutionFact
BindInstitutionSource
```

## Opportunity

```text
CreateNativeOpportunity
VerifyNativeOpportunity
VerifyLegacyOpportunity
PublishOpportunity
HideOpportunity
ArchiveOpportunity
```

## Source

```text
CreateSource
UpdateSourceMetadata
BindSource
UnbindSource
MarkSourceUnavailable
MarkSourceMoved
ConfirmNoChange
```

## Article

```text
CreateArticle
UpdateArticleDraft
PublishArticle
UnpublishArticle
ArchiveArticle
ChangeArticleSlug
```

## Notification

```text
CancelNotification
RetryDelivery
RetryOutboxEvent
CancelOutboxEvent
```

## User

```text
DeleteUser
SuspendUser optional
DeactivateFollow support-only
```

---

# 157. Query Services

Admin reads:

```text
getDashboardSummary
getMonitoringQueue
getInstitutionAdminDetail
getOpportunityAdminDetail
getSourceAdminDetail
getArticleAdminDetail
getNotificationAdminDetail
getUserSupportDetail
getOutboxQueue
getAuditTrail
```

write/read separation은 logical.

CQRS framework 없음.

---

# 158. Admin Pagination Contract

server query:

```text
cursor or offset
limit
filters
sort
```

MVP offset도 충분.

volume 커지면 cursor.

---

# 159. Data Table State

filter/sort URL query로 유지 가능.

Admin SEO 없음.

---

# 160. Admin Cache

private operational UI는 stale shared cache보다 correctness 우선.

기본:

```text
dynamic/no-store
```

heavy metrics만 short cache 가능.

---

# 161. Monitoring Queue Cache

due/overdue가 시간에 따라 바뀌므로:

```text
no long shared cache
```

---

# 162. Admin Mutations

Server Action/Route Handler 중 repository convention에 맞게 선택.

중요:

- server-only
- auth guard
- origin/CSRF
- command validation
- typed errors

---

# 163. Validation Schemas

Admin input은 server schema validation.

기존 Zod가 있으면 재사용.

---

# 164. HTML Admin Input

Article HTML Source는 sanitizer.

Source URLs validate.

Action URL validate.

No javascript URI.

---

# 165. Admin File Upload

MVP Featured Image URL 방식이면 upload infra 없음.

File upload later.

---

# 166. Admin Timezone

Admin dates display:

```text
Asia/Seoul
```

DB TIMESTAMPTZ.

---

# 167. Notification Dates

Email/Opportunity deadline도 KST display unless Institution timezone relevant.

국제학교 해외 timezone case가 있다면 exact domain later.

---

# 168. Admin Audit Time

always server timestamp.

client clock 사용하지 않음.

---

# 169. Source Check Time

server-recorded checked_at preferred.

Admin manually editing timestamp 금지 기본.

---

# 170. Publication Time

publish command server timestamp.

future scheduled publish MVP Non-Scope.

---

# 171. Scheduled Notification

MVP Non-Scope.

verified signal 후 processing.

---

# 172. Scheduled Article Publish

MVP Non-Scope.

manual publish.

---

# 173. Admin Bulk Import

Initial seed/migration은 scripts.

Admin CSV importer MVP Non-Scope.

---

# 174. Institution Seed

script/migration/data import.

Prod live signals disabled.

---

# 175. Source Seed

same.

---

# 176. Article Migration

Guide/Update production rows verified 있을 때 script.

---

# 177. Admin Audit Export

MVP UI listing enough.

export later.

---

# 178. Operations Runbook — Daily Launch Checklist

```text
DB healthy
worker healthy
oldest outbox acceptable
dead letter zero
email send enabled
P0 overdue acceptable
public health OK
Kakao login smoke
```

---

# 179. Operations Runbook — Before Major Admission Season

```text
Source coverage review
P0/P1 cadence review
active follower institutions coverage
email provider quota
worker throughput
dead-letter zero
backup status
Article SEO pages
```

---

# 180. Operations Runbook — Before Migration

```text
backup
schema preflight
duplicate scan
current-version integrity
outbox state
worker pause if needed
deploy order
rollback path
```

---

# 181. Operations Runbook — After Migration

```text
constraint validation
row counts
bridge integrity
public route smoke
worker resume
outbox observation
no accidental notification
```

---

# 182. Operational Automation

Future scheduled checks:

- due queue notifications to Admin
- dead-letter alert
- backup failure alert

가능.

MVP에는 external alert channel 없이 Dashboard 확인도 가능하나 critical worker/email failure는 alerting이 유용.

---

# 183. External Alerting

specific Slack/email vendor later.

Admin customer Email channel과 운영 alert channel 분리.

---

# 184. Admin Availability

Admin outage:

Public read may continue.

Monitoring verification delayed.

Admin failure가 public cached page를 깨지 않게 분리.

---

# 185. Worker Availability

Worker down:

- verification writes possible
- notifications queued
- Email delayed

Dashboard urgent.

---

# 186. Email Provider Availability

Provider down:

- canonical truth unaffected
- deliveries pending/retry

---

# 187. GA4/GSC Availability

down/missing:

- product unaffected

---

# 188. Source Availability

Source down:

- truth unaffected
- monitoring warning

---

# 189. Audit Failure

Critical command에서 Audit insert를 same transaction에 포함할지 결정.

권장:

critical mutation audit는 same DB transaction.

왜냐하면:

```text
command succeeded but actor trace absent
```

를 피함.

---

# 190. Analytics Failure

Audit와 달리 Product Analytics는 same transaction 아님.

08A 유지.

---

# 191. Cache Revalidation Failure

post-commit retry.

06A 유지.

---

# 192. Outbox Insert Failure

verified change와 Notification integration에 필요한 Outbox는 same core transaction.

따라서 Outbox insert 실패하면 verified transaction rollback 여부는 05에서 정의한 critical path를 따른다.

---

# 193. Admin Audit vs Outbox

Audit:

human accountability.

Outbox:

integration reliability.

둘은 별도.

---

# 194. Admin Audit vs Domain History

Version history:

truth history.

Audit:

operator action history.

둘은 별도.

---

# 195. Notification Audit

Notification/Delivery 자체가 state history.

Admin manual cancel/retry는 audit.

---

# 196. Operational Data Retention

core history long-lived.

logs/errors separate retention.

PII minimization.

---

# 197. Security Secrets

Admin interface에서 secrets 표시 금지:

- DB URL
- Kakao secret
- Email API key
- GA4 secret
- session signing keys

---

# 198. Config Visibility

Operations page에 safe config만:

```text
environment
email sending enabled?
analytics enabled?
worker enabled?
```

secret values 없음.

---

# 199. Maintenance Mode

MVP full maintenance framework 필요 없음.

deployment provider capability 활용 가능.

---

# 200. Admin Non-Scope

- complex RBAC
- reviewer approval workflow
- multi-step content approvals
- CRM
- ticketing
- bulk user export
- arbitrary mass email
- campaign manager
- ads manager
- billing
- payment
- reviewer comments
- internal chat
- AI copilot
- automated source extraction
- multi-tenant organizations
- custom dashboard builder
- data warehouse
- advanced alert rules
- mobile Admin app

---

# 201. Admin Acceptance Scenarios

## Scenario 1 — Daily Monitoring

Admin opens queue, handles overdue P0, confirms no change.

PASS:
Observation/Audit only; no Version/Notification.

## Scenario 2 — Deadline Changed

Admin verifies deadline.

PASS:
Version/Evidence/Change/Outbox atomic; Notification follows.

## Scenario 3 — Concurrent Double Submit

PASS:
one verified current state; conflict/idempotent safe.

## Scenario 4 — Source Down

PASS:
Source health warning; Opportunity unchanged.

## Scenario 5 — Article Publish

PASS:
sanitized HTML + relations + SEO; post-commit revalidation.

## Scenario 6 — Article Slug Change

PASS:
redirect no chain; audit.

## Scenario 7 — User Unsubscribes Email

PASS:
Admin sees Follow active, Email OFF; does not force Follow inactive.

## Scenario 8 — Dead Letter

Admin retries after fix.

PASS:
idempotent, no duplicate customer email.

## Scenario 9 — Backfill

PASS:
migration script creates data, no user Notification.

## Scenario 10 — User Delete Support

PASS:
same canonical DeleteUser command; PII removed; opaque history remains.

## Scenario 11 — Wrong Email Provider Timeout

PASS:
Attempt reconciliation; Admin does not blindly resend.

## Scenario 12 — Published Institution Missing Source

PASS:
Data quality warning/block publish.

## Scenario 13 — Monitoring Coverage Missing

Follower exists but official Source inactive.

PASS:
HIGH warning.

## Scenario 14 — Analytics Unavailable

PASS:
Admin operational metrics still work.

## Scenario 15 — Worker Down

PASS:
Dashboard shows pending age/dead letter/health issue; truth remains safe.

---

# 202. Architecture Decisions Locked

## ADM-001
Admin is an Application Command interface, not direct DB CRUD.

## ADM-002
MVP Admin uses a single authenticated internal role; complex RBAC is deferred.

## ADM-003
Public User authentication and Admin authentication remain separate.

## ADM-004
Dashboard prioritizes operational work and failures before vanity metrics.

## ADM-005
Monitoring Queue is query-driven from Source configuration/state; no mandatory monitoring_tasks table.

## ADM-006
No Change records Observation/Audit only and never creates a new Version/Notification.

## ADM-007
Opportunity/Fact verification always uses canonical verification commands and Evidence.

## ADM-008
Admin can override change materiality only with audit reason.

## ADM-009
Migration/backfill is not exposed as a normal live-notification Admin workflow.

## ADM-010
Institution stable profile edits and verified Fact edits use different commands.

## ADM-011
Published core roots are logically archived/hidden/closed, not hard-deleted from Admin.

## ADM-012
Article publish requires server-side sanitization and structured relation validation.

## ADM-013
Published slug changes are explicit actions that create redirect history.

## ADM-014
Canonical Notifications are signal-driven; Admin has no arbitrary mass-email composer.

## ADM-015
Suppressed Delivery cannot be force-sent by Admin in normal MVP operations.

## ADM-016
Outbox/Dead-letter Admin supports inspect/retry/cancel, not payload editing.

## ADM-017
Critical Admin mutations produce PII-safe Audit records.

## ADM-018
Audit is distinct from Domain history, Analytics, and Outbox.

## ADM-019
User Consent history is read-only to Admin.

## ADM-020
Legacy Subscriber/Alert/Guide tables become read-only context after canonical cutover.

## ADM-021
Operational kill switches exist for Email, Worker, and Analytics.

## ADM-022
Backup and restore readiness is a launch requirement.

## ADM-023
Non-production environments must not send real customer Email or production Analytics.

## ADM-024
Operational Admin pages are private, dynamic/no-store, and noindex.

## ADM-025
PII exposure in Admin is minimized; User list does not default to raw Email/child data.

## ADM-026
Data quality violations are surfaced with severity; cross-table rules are not all forced into DB triggers.

## ADM-027
Production migrations are additive/preflighted and must not emit live Product notifications.

## ADM-028
Generic undo/bulk mutation is not implemented; corrective domain commands are used.

## ADM-029
Worker/provider/cache/analytics failures must not corrupt canonical truth.

## ADM-030
Admin runtime does not replace external observability/error monitoring.

---

# 203. Repository Validation Questions

Codex must verify at minimum:

1. existing admin auth config/admin_users reality
2. whether an Admin runtime route exists
3. current app route tree and private route feasibility
4. current audit_logs schema and fields
5. whether critical audit insert can share domain transaction
6. existing source monitor config and query-driven queue feasibility
7. existing source observations/outcomes mapping
8. whether no-change can be represented without new Version
9. target canonical command/service layer current implementation gap
10. existing Event/Fact version/evidence UI-independent constraints
11. Article/editor/sanitizer absence/presence
12. current outbox fields and manual retry feasibility after hardening
13. worker heartbeat/health current capability
14. `/api/health` actual behavior
15. legacy subscriber/alert/guide admin/runtime reality
16. backup/deployment infra current evidence
17. admin dynamic/no-store implementation compatibility with Next.js 16
18. whether Server Actions or Route Handlers better match repository conventions
19. whether kill switches can be added to current env/config safely
20. exact production observability/backup/provider setup is NOT_VERIFIABLE where appropriate

---

# 204. Definition of Done

Admin/Operations Architecture is complete when:

1. Admin IA is fixed.
2. Monitoring Queue workflow is explicit.
3. Admin writes only through canonical commands.
4. No-change/change verification semantics are safe.
5. Institution/Opportunity/Source/Fact operations are defined.
6. Article CMS publishing/preview/slug flow is defined.
7. Notification/Delivery/Outbox failure operations are defined.
8. User support mutation limits are defined.
9. Audit boundaries are explicit.
10. Data quality controls are defined.
11. incident severity/runbooks exist.
12. backup/restore is launch-critical.
13. kill switches and environment separation are defined.
14. legacy writes cannot leak into canonical operations.
15. Admin PII/security boundary is explicit.

---

# 205. Next Step

Repository validation output:

```text
09A_ADMIN_OPERATIONS_ARCHITECTURE_REPOSITORY_VALIDATION.md
```

If:

```text
VALID
or
VALID_WITH_IMPLEMENTATION_ADJUSTMENTS
```

and no Architecture amendment is required, next:

```text
10_PRD.md
```

`10_PRD.md` will combine the validated Architecture contracts into the final MVP Product Requirements Document.

After PRD:

```text
11_API_CONTRACT.md
12_IMPLEMENTATION_PLAN.md
```

or equivalent implementation artifacts can follow.
