# 08_ANALYTICS_ARCHITECTURE.md

> **Project:** PREPPY (프레피)  
> **Document Type:** Analytics Architecture  
> **Status:** v1.0 — Repository validation required before implementation  
> **Product Baseline:** `00_PRODUCT_REQUIREMENTS_BASELINE.md`  
> **Target Architecture:** `02_TARGET_ARCHITECTURE.md` Target v1.1  
> **Domain Model:** `03_DOMAIN_MODEL.md` Domain v1.0  
> **Data Model:** `04_DATA_MODEL.md` Data Model v1.0  
> **Monitoring Architecture:** `05_MONITORING_ARCHITECTURE.md` v1.0  
> **Content/SEO Architecture:** `06_CONTENT_SEO_ARCHITECTURE.md` v1.0  
> **Identity/Follow/Notification Architecture:** `07_IDENTITY_FOLLOW_NOTIFICATION.md` v1.0  
> **Latest Validation:** `07A_IDENTITY_FOLLOW_NOTIFICATION_REPOSITORY_VALIDATION.md` — VALID_WITH_IMPLEMENTATION_ADJUSTMENTS  
> **Core Principle:** PostgreSQL is operational truth; GA4 is behavioral observation; GSC is search visibility observation.  
> **Purpose:** PREPPY의 Acquisition → Activation → Monitoring → Notification → Return 루프를 제품 의사결정에 사용할 수 있도록 canonical event contract, metric definitions, identity/attribution boundary, data source ownership, privacy rules, instrumentation topology, dashboard, QA, and validation requirements를 정의한다.

---

# 0. Document Role

PREPPY MVP의 Analytics 목적은 “많이 측정”하는 것이 아니다.

핵심 질문은 다음이다.

1. 검색/커뮤니티 유입이 실제로 Institution/Opportunity 탐색으로 이어지는가?
2. 사용자가 Follow CTA를 가치 있게 느끼는가?
3. Kakao 가입 과정에서 얼마나 이탈하는가?
4. 가입 후 실제 Follow가 생성되는가?
5. 여러 Institution을 Follow하는가?
6. Monitoring Email이 다시 방문을 만들어내는가?
7. 어떤 카테고리/지역/Opportunity가 가장 높은 Activation을 만드는가?
8. PREPPY가 단순 정보 사이트가 아니라 Monitoring 관계를 만들고 있는가?
9. Article이 Organic Acquisition Engine으로 작동하는가?
10. PMF 확장 Gate를 통과하고 있는가?

Analytics는 위 질문에 답할 수 있어야 한다.

---

# 1. Source-of-Truth Separation

PREPPY는 세 종류의 분석 Source를 분리한다.

```text
PostgreSQL
= Operational Truth

GA4
= Behavioral Analytics

Google Search Console
= Search Visibility / Organic Acquisition Observation
```

추가로 Email provider가 있다면:

```text
Email Provider
= Delivery/Open/Click telemetry
```

를 제공할 수 있다.

이 네 Source는 역할이 다르다.

---

# 2. PostgreSQL Operational Truth

다음 지표는 GA4가 아니라 PostgreSQL에서 계산한다.

```text
Registered Users
Active Users
Active Follows
Follow count per User
Active Monitoring Parents
Email Preference state
Consent effective state
Notification count
NotificationDelivery count/status
Email delivery success/failure
Opportunity count/state
Institution count
Verified Change count
```

원칙:

> GA4 event가 누락되어도 User가 실제 Follow 상태라면 Active Monitoring Parent는 정확히 계산되어야 한다.

---

# 3. GA4 Behavioral Analytics

GA4의 역할:

```text
page/view behavior
search/filter behavior
CTA interaction
funnel progression
navigation
campaign attribution
return behavior
```

GA4는 다음을 결정하지 않는다.

```text
Follow가 실제 ACTIVE인지
Consent가 유효한지
Email Preference가 ON인지
Notification이 실제 발송되었는지
```

이것은 DB truth다.

---

# 4. Google Search Console

GSC 역할:

```text
query
impression
click
CTR
average position
indexed/search-visible pages
```

GSC는:

- Product DB
- GA4
- Publication status

의 Source of Truth가 아니다.

---

# 5. Analytics Objective Tree

PREPPY Analytics는 다음 트리로 설계한다.

```text
Acquisition
├─ Organic Search
├─ Direct / Community
└─ Campaign

Discovery
├─ Article
├─ Institution
├─ Opportunity
└─ Search / Filter

Activation
├─ Follow Click
├─ Signup Start
├─ Signup Complete
└─ Follow Created

Engagement
├─ Additional Follow
├─ My Preppy
├─ Opportunity exploration
└─ Article → Product navigation

Monitoring
├─ Active Monitoring Parents
├─ Average Follow
└─ Verified Changes

Notification
├─ Delivery
├─ Open
├─ Click
└─ Return

Retention
├─ 7-day return
├─ 14-day return
└─ notification-driven return
```

---

# 6. North Star Metric

PREPPY North Star:

```text
Active Monitoring Parents
```

Domain definition:

```text
User.status = ACTIVE
AND
active Follow count >= 1
AND
effective Email Notification state = enabled
```

Effective Email state:

```text
usable UserEmail
AND latest SERVICE_EMAIL_UPDATES consent = GRANTED
AND EMAIL NotificationPreference = ENABLED
```

이 지표는 PostgreSQL query로 계산한다.

---

# 7. Why North Star Is Not Registered Users

Registered User는:

- 가입만 하고 Follow하지 않을 수 있음
- Email updates가 OFF일 수 있음
- Product Monitoring 관계가 없을 수 있음

따라서:

```text
Registered User
≠ Active Monitoring Parent
```

PREPPY의 실제 value relationship은:

```text
Follow
+ Monitoring
+ Notification eligibility
```

다.

---

# 8. MVP Validation Funnel

30-day validation target:

```text
Qualified Visitors
→ Institution / Opportunity / Article Exploration
→ Follow Click
→ Signup Start
→ Signup Complete
→ Follow Created
→ Active Monitoring Parent
```

기본 목표:

```text
Qualified Visitors 500
→ Active Monitoring Parents 50+
```

---

# 9. Expansion Gate Metrics

PREPPY가 Phase 2/3 확장을 검토하기 위한 최소 Gate:

```text
Active Monitoring Parents >= 100
Detail → Follow >= 10%
Average Follow >= 2
Email Open >= 45%
14-Day Returning >= 25%
Organic AMP 지속 증가
```

이 수치는 Product Decision baseline을 따른다.

Analytics architecture는 이 모든 값을 재현 가능해야 한다.

---

# 10. Canonical Event Naming

Analytics event naming은:

```text
snake_case
lowercase
verb/object semantics
```

사용.

예:

```text
institution_view
follow_click
signup_complete
```

event name을 UI wording에 종속시키지 않는다.

---

# 11. Canonical MVP Events

필수:

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

추가 권장:

```text
follow_removed
email_preference_changed
notification_suppressed
article_to_opportunity
institution_to_opportunity
opportunity_to_institution
auth_cancelled
signup_abandoned
```

그러나 KPI-critical MVP event부터 구현한다.

---

# 12. Event Ownership

각 event에는 Source Owner가 있다.

## Client Behavioral Event

예:

```text
follow_click
search
filter
hero_primary_cta_click
```

owner:

```text
browser/client analytics adapter
```

## Server-confirmed Product Event

예:

```text
signup_complete
follow_created
additional_follow
notification_sent
```

owner:

```text
server/application
```

중요:

> 실제 성공을 의미하는 event는 client click이 아니라 committed server state를 기준으로 기록한다.

---

# 13. Follow Event Semantics

## `follow_click`

사용자가 CTA를 누름.

아직 Follow가 생성되지 않았을 수 있다.

## `follow_created`

Follow가:

```text
Not Exists / INACTIVE
→ ACTIVE
```

전환된 committed product event.

## `additional_follow`

User가 이미 active Follow를 1개 이상 가지고 있고 새로운 Institution Follow를 ACTIVE로 만든 경우.

### Rule

duplicate click:

```text
follow_click
```

은 여러 번 생길 수 있지만:

```text
follow_created
```

은 실제 state transition 때만 1회.

---

# 14. Signup Event Semantics

## `signup_start`

신규 User onboarding flow가 시작됨.

OAuth auth start와 동일하지 않다.

권장 boundary:

```text
provider identity resolved
new User PENDING
→ onboarding UI entered
```

## `signup_complete`

User:

```text
PENDING → ACTIVE
```

transaction commit 후.

---

# 15. Auth Event Boundary

MVP KPI에는 다음 auth event가 필수는 아니다.

하지만 운영/debug용:

```text
auth_start
auth_success
auth_cancelled
auth_failed
```

를 별 analytics/security log로 둘 수 있다.

OAuth code/token/provider subject는 property로 보내지 않는다.

---

# 16. View Event Semantics

## `article_view`

canonical Article detail initial meaningful render.

## `institution_view`

canonical Institution detail initial meaningful render.

## `opportunity_view`

canonical Opportunity detail initial meaningful render.

SPA hydration이나 rerender 때문에 중복 발생하지 않도록 route-level instrumentation 규칙을 둔다.

---

# 17. `home_view`

Home canonical page view.

GA4 default `page_view`와 별도 custom event를 모두 쓸지 implementation에서 결정 가능.

Architecture는 product-specific event naming을 유지한다.

---

# 18. Search Event

`search`

properties:

```text
query_length_bucket
result_count
category filter if applicable
```

원문 검색어가 개인정보 가능성이 있다면 GA4에 raw query를 보내지 않는다.

MVP 기본:

```text
raw_query not sent
```

서버 operational logs도 필요 이상의 raw 검색어 저장을 피한다.

---

# 19. Filter Event

`filter`

properties:

```text
filter_type
filter_value
result_count
```

허용된 taxonomy value만.

arbitrary user text property 금지.

---

# 20. Article Conversion Events

## `article_to_institution`

Article page에서 structured Institution link/card 클릭.

## `article_to_follow`

Article context에서 Institution Follow CTA 클릭.

## `article_to_opportunity`

Article에서 related Opportunity 이동.

이렇게 Article이 실제 Acquisition Engine인지 측정한다.

---

# 21. Institution / Opportunity Navigation

권장:

```text
institution_to_opportunity
opportunity_to_institution
```

Product discovery path를 측정.

MVP에서는 page view sequence로 일부 재구성 가능하지만 explicit CTA event가 더 정확한 경우 사용한다.

---

# 22. My Preppy

`my_preppy_view`

로그인된 ACTIVE User가 dashboard를 본 경우.

property:

```text
follow_count
email_update_state
```

단:

- raw email 없음
- followed institution list 전체를 analytics property로 보내지 않음

---

# 23. Notification Events

Canonical operational state는 DB다.

Analytics events:

```text
notification_sent
notification_open
notification_click
```

`notification_sent`는 provider send accepted/committed semantic을 명확히 해야 한다.

MVP 권장:

```text
NotificationDelivery status transitions to SENT
```

후 server-side event.

---

# 24. Email Open

Open event는 provider telemetry.

주의:

- Apple Mail Privacy Protection
- images blocked
- proxy loading

때문에 true human open의 완전한 지표가 아니다.

따라서:

```text
Email Open Rate
```

는 directional KPI.

---

# 25. Email Click

Click은 Open보다 강한 engagement signal.

권장 metric:

```text
Email CTR
=
unique clicked deliveries
/
sent or delivered deliveries
```

exact denominator는 dashboard contract에서 고정한다.

MVP에서는 `SENT`를 denominator로 사용 가능.

---

# 26. Notification-driven Return

Notification click 이후 PREPPY session/page view가 발생하면:

```text
notification-driven return
```

으로 attribution 가능.

Notification/Delivery opaque ID를 safe attribution token으로 활용.

PII URL 포함 금지.

---

# 27. Canonical Event Properties

공통 property 후보:

```text
institution_id
institution_type
region
opportunity_id
opportunity_type
article_id
landing_page
utm_source
utm_medium
utm_campaign
follow_count
```

`child_birth_year`는 기본 analytics property에서 제외하는 것을 권장한다.

필요한 product segmentation이 실제 검증되면 privacy review 후 server-side coarse bucket을 검토한다.

---

# 28. Canonical IDs

Analytics object identity:

```text
institution_id
opportunity_id
article_id
```

legacy:

```text
school_id
admission_event_id
```

는 primary analytics identity가 아니다.

migration/debugging 목적 외 사용 금지.

---

# 29. User Identity in Analytics

Anonymous:

```text
GA4 anonymous/client identity
```

Authenticated:

필요할 경우:

```text
opaque PREPPY user_id
```

를 GA4 User-ID에 사용할 수 있다.

금지:

```text
Kakao subject
email
phone
child name
```

---

# 30. Anonymous → Authenticated Stitching

Analytics에서 완벽한 identity stitching을 Product truth로 요구하지 않는다.

Follow/Signup operational conversion은 DB에서 확인.

GA4는 anonymous acquisition path 이해에 사용.

로그인 후 canonical User-ID 설정으로 이후 session을 연결할 수 있지만:

> GA4 stitching failure가 Follow metric을 왜곡해서는 안 된다.

---

# 31. Attribution Context

PendingFollowIntent에 일부 acquisition context를 carry할 수 있다.

허용:

```text
landing_page
article_id
opportunity_id
institution_id
utm_source
utm_medium
utm_campaign
```

제한:

- 길이 제한
- allowlist
- PII 없음
- arbitrary query payload 없음

---

# 32. Attribution Model

MVP 기본:

```text
last non-direct campaign/landing context
```

정교한 multi-touch attribution은 Non-Scope.

가입/Follow 완료 시 server-side conversion context를 기록하거나 analytics event property로 전달할 수 있다.

---

# 33. Landing Page

`landing_page`는:

```text
canonical route category/path
```

를 사용.

tracking query string 전체 저장 금지.

예:

```text
/articles/{slug}
/institutions/{slug}
/opportunities/{slug}
```

---

# 34. UTM

allowlist:

```text
utm_source
utm_medium
utm_campaign
```

optional:

```text
utm_content
utm_term
```

MVP에서 `utm_term`이 arbitrary text/PPI risk를 만들면 생략 가능.

---

# 35. Qualified Visitor

MVP 목표의 `Qualified Visitors`를 명확히 정의해야 한다.

권장 definition:

```text
unique visitor/session
that reaches at least one PREPPY intent-bearing public page:
Article detail
Institution detail
Opportunity detail
or performs search/filter
```

단순 bot/home bounce를 최대한 배제한다.

GA4 session/user measurement 한계 때문에 dashboard에서는:

```text
qualified_sessions
```

로 구현할 수도 있다.

용어를 섞지 않는다.

---

# 36. Detail → Follow

metric:

```text
unique sessions/users with follow_click
/
unique Institution or Opportunity detail visitors
```

권장 primary:

```text
detail_to_follow_rate
=
sessions with follow_click after institution/opportunity detail
/
sessions with institution_view or opportunity_view
```

DB FollowCreated rate와 함께 본다.

---

# 37. Follow Click → Follow Created

```text
follow_activation_rate
=
follow_created
/
follow_click
```

client/server source가 다르므로 perfect one-to-one가 아닐 수 있다.

중요한 것은 drop-off diagnosis.

---

# 38. Signup Completion Rate

```text
signup_completion_rate
=
signup_complete
/
signup_start
```

new-user flow만.

existing User direct Follow는 denominator에서 제외.

---

# 39. Average Follow

PostgreSQL:

```text
AVG(active Follow count)
for ACTIVE Users with >=1 active Follow
```

또는 AMP만 대상으로 할지 dashboard contract에서 명확히 한다.

MVP Expansion Gate의 Average Follow는 권장:

```text
Active Monitoring Parents 기준 active Follow average
```

---

# 40. Email Open Rate

Operational/Provider telemetry:

```text
unique opened deliveries
/
sent deliveries
```

봇/privacy proxy 영향을 annotation.

---

# 41. Email CTR

```text
unique clicked deliveries
/
sent deliveries
```

---

# 42. 14-Day Returning

Definition:

```text
Users who return to PREPPY within 14 days after activation
/
Users activated in cohort
```

`return`은 meaningful authenticated or public page visit.

GA4 User-ID가 완전하지 않을 수 있으므로 MVP에서는:

- authenticated return server event
- GA4 return behavior

두 Source를 비교할 수 있다.

---

# 43. Authenticated Return Event

권장 server/client hybrid:

```text
user_return
```

User가 ACTIVE 상태로 새로운 session/day에 PREPPY를 방문.

그러나 session storage 없이 exact session definition이 복잡할 수 있다.

MVP 14-day returning은 GA4 User-ID + server My Preppy/notification click observation을 활용할 수 있다.

정확한 implementation은 validation에서 current stack에 맞게 결정.

---

# 44. Notification Return Rate

```text
notification_return_rate
=
unique users who click notification and land
/
sent deliveries
```

또는 clicked deliveries denominator 버전을 별도.

---

# 45. Organic Active Monitoring Parents

Organic acquisition으로 시작한 User 중 현재 AMP.

이 지표는 attribution context를 DB에 장기 저장할지 여부에 따라 달라진다.

MVP에서는 signup/follow conversion event에 acquisition property를 전달하고 GA4 cohort로 분석 가능.

Operational DB에 full attribution warehouse를 미리 만들지 않는다.

---

# 46. Event Delivery Architecture

권장:

## Browser

```text
Client Analytics Adapter
→ GA4
```

## Server

```text
Application committed state
→ Server Analytics Adapter
→ GA4 Measurement Protocol or provider SDK
```

실제 server GA4 transport는 implementation에서 결정.

---

# 47. Analytics Adapter Boundary

interface concept:

```text
AnalyticsTracker
- track(eventName, properties, context)
```

implementations:

```text
ClientGa4Tracker
ServerGa4Tracker
NoopTracker
TestTracker
```

Product/Application code가 직접 `gtag()`에 종속되지 않게 한다.

---

# 48. Event Contract Registry

중앙 registry:

```text
event name
owner
trigger
required properties
optional properties
privacy classification
dedupe semantic
```

를 코드/문서로 유지.

page component마다 임의 property spelling을 만들지 않는다.

---

# 49. Event Versioning

event semantic이 바뀌면 silent reuse를 피한다.

방법:

- property addition은 backward compatible
- meaning change는 new event name or `event_schema_version`

MVP에서 모든 event에 version property를 강제할 필요 없음.

중요 event:

```text
follow_created
signup_complete
```

의 semantic을 문서로 잠근다.

---

# 50. Client Event Duplicate Prevention

Next.js hydration/navigation에서 view event 중복 방지.

규칙:

- canonical route transition당 1회
- rerender로 재발송 금지
- React Strict Mode dev duplicate를 production KPI로 혼동하지 않음

---

# 51. Server Event Idempotency

서버 confirmed event는 DB state transition과 연결된다.

예:

```text
Follow ACTIVE transition
→ one domain/integration event
→ analytics
```

retry 시 중복 GA4 event가 발생할 수 있으므로:

```text
event_id
```

를 context에 포함 가능.

GA4가 perfect dedupe를 제공하지 않더라도 internal event uniqueness를 유지.

---

# 52. Analytics Outbox

MVP에서 모든 analytics event를 DB Outbox에 넣을 필요는 없다.

구분:

## Critical Product Conversions

```text
signup_complete
follow_created
notification_sent
```

committed domain/integration event에서 server tracker 호출.

실패가 product transaction을 rollback하지 않는다.

필요하면 existing Outbox consumer로 비동기화 가능.

## Low-value UI events

```text
filter
hero click
```

client direct.

---

# 53. Analytics Failure Policy

Analytics failure:

```text
must never block
Follow
Signup
Verification
Notification
Article publish
```

즉:

```text
Business transaction commit
→ analytics side effect
```

원칙.

---

# 54. Privacy Classification

Analytics property는 세 등급으로 관리.

## SAFE

```text
institution_id
opportunity_id
article_id
category
region_code
CTA location
```

## REVIEW

```text
child age/birth year
free-text search
exact location
```

## PROHIBITED

```text
email
provider subject
OAuth token/code
child name
phone
address
raw consent payload
```

---

# 55. Child-related Data

PREPPY는 아동 교육 정보를 다루므로 analytics에서 child data를 특히 최소화한다.

기본:

```text
child_birth_year not sent to GA4
```

향후 필요하면:

```text
age_band
```

같은 coarse derived segment를 privacy review 후 검토.

---

# 56. Region Property

Institution region:

```text
SAFE
```

User home/interest region:

더 개인화 정보.

MVP event property에는:

```text
Institution region
```

을 사용.

User interest region을 GA4 user property로 설정하지 않는다.

---

# 57. Consent and Analytics

필요한 cookie/analytics consent law/policy는 별도 legal review 대상.

Architecture는 analytics adapter가:

```text
enabled/disabled
```

될 수 있도록 설계.

동의가 필요한 jurisdiction/policy이면:

- client analytics suppressed until allowed
- operational DB metrics unaffected

---

# 58. Server Logs vs Analytics

Operational structured log는:

- debugging
- reliability

Analytics는:

- product behavior

둘을 혼동하지 않는다.

PII redaction rule은 둘 다 적용.

---

# 59. GA4 Property Boundary

MVP one production GA4 property.

development/test data는 production property에 오염시키지 않는다.

권장:

```text
environment property
or
debug mode / separate stream
```

exact setup은 implementation.

---

# 60. Environment Property

event property:

```text
environment
```

를 production analysis에 무조건 보내기보다 separate config/stream으로 분리하는 게 좋다.

운영 dashboard에서 test event 제거가 필요 없도록 한다.

---

# 61. Event Timestamp

Client:

GA4 reception timestamp와 device timestamp 차이가 있을 수 있음.

Server critical event:

```text
committed_at / occurred_at
```

을 명확히 관리.

DB operational dashboard는 DB timestamp 사용.

---

# 62. Timezone

PREPPY Business reporting timezone:

```text
Asia/Seoul
```

DB는:

```text
TIMESTAMPTZ
```

저장.

daily dashboard aggregation은 KST 기준.

GA4 property timezone도 가능하면 Asia/Seoul로 맞춘다.

---

# 63. Dashboard Source Ownership

Daily Dashboard:

| Metric | Source |
|---|---|
| Qualified Visitors | GA4 |
| Organic Visitors | GA4/GSC |
| Indexed Articles | DB + GSC observation |
| Institutions per Session | GA4 |
| Detail→Follow | GA4 |
| Signup Completion | GA4/server events |
| Active Monitoring Parents | PostgreSQL |
| Average Follow | PostgreSQL |
| Email Open | provider/GA4 bridge |
| Email CTR | provider/GA4 bridge |
| 14-Day Returning | GA4 + authenticated cohort |
| Notification sent/failed | PostgreSQL |

---

# 64. Indexed Articles

두 개를 구분한다.

```text
Published/Indexable Articles
= DB truth

Actually indexed/search-visible Articles
= GSC observation
```

Dashboard label을 정확히 한다.

예:

```text
Indexable Articles
Google Indexed/Visible Articles
```

혼동 금지.

---

# 65. Organic Visitors

GA4 source/medium attribution.

GSC click과 숫자가 다를 수 있다.

원인:

- consent/ad blockers
- redirects
- session attribution
- different scopes

두 숫자를 같게 맞추려 하지 않는다.

---

# 66. Institutions per Session

```text
total unique Institution views per qualified session
```

same institution repeated view는 1로 셀지 product question.

MVP 권장:

```text
unique institution_id per session
```

사용자가 비교하는 정도를 본다.

---

# 67. Article Acquisition Metrics

Article별:

```text
organic entrances
article_view
article → institution CTR
article → opportunity CTR
article → follow CTR
follow_created attributed
```

단순 pageviews보다 conversion을 본다.

---

# 68. Institution Metrics

Institution별:

```text
views
follow_click
follow_created
detail_to_follow
active follower count
current opportunity count
```

`active follower count`는 DB.

---

# 69. Opportunity Metrics

Opportunity별:

```text
views
follow click via Institution CTA
notification sends
notification clicks
verified changes
```

Opportunity 자체 Follow count는 없음.

---

# 70. Category Metrics

```text
ENGLISH_KINDERGARTEN
PRIVATE_ELEMENTARY
INTERNATIONAL_SCHOOL
```

별:

- traffic
- follow rate
- AMP contribution
- average follow
- notification engagement

Public category 사용.

---

# 71. Region Metrics

Institution region 기준.

User home/interest location 사용하지 않고도:

```text
강남 기관 traffic/follow
```

분석 가능.

---

# 72. Opportunity Type Metrics

kind:

```text
RECRUITMENT
ADDITIONAL_RECRUITMENT
INFORMATION_SESSION
...
```

별 conversion/engagement.

---

# 73. Acquisition Funnel by Landing Type

landing type:

```text
HOME
ARTICLE
INSTITUTION
OPPORTUNITY
```

비교:

```text
Landing
→ Follow Click
→ Signup
→ Follow
```

Article SEO가 실제 conversion source인지 확인.

---

# 74. Return Funnel

```text
Notification Sent
→ Open
→ Click
→ Opportunity View
→ My Preppy
→ Additional Follow
```

이 loop가 PREPPY retention의 핵심.

---

# 75. Additional Follow

MVP에서 중요한 행동.

왜냐하면:

```text
1 Follow
→ 서비스 trial

2+ Follow
→ monitoring hub value
```

가능성이 높다.

Average Follow와 additional_follow event를 함께 본다.

---

# 76. Product Cohorts

MVP cohort:

```text
signup week
first Follow category
landing type
acquisition source
```

child profile 기반 cohort는 기본 제외.

---

# 77. Retention Cohort

activation date:

```text
User ACTIVE + first active Follow
```

를 cohort origin으로 사용할 수 있다.

가입만 하고 Follow 없는 User를 retention cohort에 포함하지 않는 것이 PREPPY 가치와 더 맞다.

---

# 78. Activation Date

추천:

```text
first FollowActivated timestamp
```

또는 User activation과 같은 signup transaction이면 거의 동일.

North Star 관계 기준으로:

```text
first Monitoring activation
```

을 제품 activation timestamp로 본다.

---

# 79. 14-Day Return Cohort

```text
first_follow_at
→ any meaningful return within day 1–14
```

meaningful return:

- Institution/Opportunity/Article page
- My Preppy
- Follow action

background analytics ping 제외.

---

# 80. Notification Attribution Window

Email click은 explicit attribution이므로 별 lookback window가 거의 필요 없다.

click token/provider context가 있으면 해당 Notification에 직접 귀속.

Open 후 direct visit은 별도 causal attribution을 과도하게 주장하지 않는다.

---

# 81. Session Attribution

MVP는 GA4 built-in session semantics를 활용.

자체 session warehouse 만들지 않는다.

---

# 82. Experimentation

A/B testing framework는 MVP Non-Scope.

하지만 event contract가:

```text
experiment_id
variant
```

optional property를 향후 추가할 수 있도록 한다.

지금 feature flag platform 도입 금지.

---

# 83. Dashboard Implementation

MVP dashboard는 두 경로 가능:

```text
GA4 UI + SQL/Admin dashboard
```

또는 internal Admin에서 주요 KPI를 aggregate.

완전한 BI warehouse를 만들지 않는다.

---

# 84. Operational SQL Metrics

추천 SQL/query service:

```text
countActiveMonitoringParents
averageActiveFollowCount
notificationDeliverySummary
followGrowth
opportunityChangeCount
```

Application/Admin dashboard에서 사용.

---

# 85. Analytics Data Warehouse

MVP Non-Scope.

조건:

- event volume 증가
- cross-source joins 반복
- GA4 export 필요
- cohort query 복잡

가 실제 병목일 때 BigQuery/warehouse 검토.

---

# 86. GA4 ↔ PostgreSQL Join

MVP에서 직접 row-level join을 요구하지 않는다.

공통 canonical IDs가 있으면 분석 가능.

User-level external export/warehouse는 후속.

---

# 87. GSC ↔ Article

Article canonical URL/slug로 mapping.

DB canonical URL registry를 사용.

slug redirect가 있으면 current canonical 기준.

---

# 88. SEO Analytics Integration

06 Architecture와 연결:

```text
Article Published
→ indexable
→ sitemap
→ GSC discovery
→ organic visitor
→ article_view
→ article_to_institution
→ follow
```

이를 dashboard에서 논리적으로 추적.

---

# 89. Indexability Policy Analytics

운영 체크:

```text
count INDEX
count NOINDEX
count PUBLISHED but NOINDEX
```

DB policy query.

GSC에서 실제 visible count와 비교.

---

# 90. False Freshness Analytics

Monitoring No Change는:

```text
no public semantic update
```

이므로:

- no Article update event
- no Opportunity change event
- no cache freshness analytics

를 발생시키지 않는다.

---

# 91. Data Quality Rules

Analytics QA에서 확인:

1. duplicate view event
2. invalid UUID property
3. legacy ID leakage
4. PII property
5. event missing required property
6. impossible funnel order
7. duplicate follow_created
8. signup_complete without User ACTIVE
9. notification_sent inconsistent with DB
10. environment contamination

---

# 92. Event Schema Validation

Code-level:

```text
typed event map
```

권장.

예:

```text
follow_created requires:
institution_id
follow_count
```

runtime validation은 critical server events에 적용.

모든 client event에 무거운 schema validator를 넣을 필요 없음.

---

# 93. Analytics Test Strategy

## Unit

- event mapping
- privacy allowlist
- attribution normalization
- indexability metrics

## Integration

- Follow transaction emits one follow_created integration event
- duplicate callback no duplicate conversion event
- signup commit emits signup_complete
- Notification SENT emits one server event
- User delete does not emit PII

## E2E

- Article → Institution → Follow funnel events
- anonymous → Kakao mock → signup/follow events
- Notification click → return

실제 GA4 network를 test environment에서 호출하지 않는다.

---

# 94. GA4 Debugging

Development:

```text
DebugView / local test adapter
```

Production event는 production env only.

---

# 95. Event Drop Behavior

Analytics adapter failure:

```text
log safe warning
return
```

business request는 성공.

server critical event가 필요하면 Outbox retry를 사용할 수 있지만 Product functionality를 block하지 않는다.

---

# 96. Event Ordering

Client events는 정확한 global order를 보장하지 않는다.

server DB truth는 transaction timestamp 기준.

Funnel 분석에서 client/server ordering anomaly를 감안.

---

# 97. Search/Filter Privacy

raw query는 기본 GA4에 보내지 않는다.

필요하다면:

```text
normalized category selection
query length
result count
```

로 충분.

---

# 98. Landing Attribution Security

UTM payload:

- allowlisted
- max length
- sanitized
- no HTML/script
- no PII

PendingFollowIntent cookie에 전체 URL을 넣지 않는다.

---

# 99. Server Analytics Authentication

GA4 Measurement Protocol secret 등 server credential:

- env/secret manager
- client bundle 노출 금지
- log 금지

---

# 100. Web Analytics Cookie Boundary

Analytics cookie와 auth session cookie는 별도.

Analytics disabled되어도 auth/Follow/Monitoring은 동작.

---

# 101. Analytics Consent Boundary

법적 consent requirement는 deployment/legal policy에서 확정.

Architecture:

```text
client analytics adapter can be disabled
server operational metrics still work
```

를 보장.

---

# 102. Daily KPI Snapshot

MVP에서는 dashboard query를 매번 실시간 계산해도 규모상 충분할 수 있다.

별 daily snapshot table은 필수 아님.

필요하면 향후:

```text
daily_product_metrics
```

materialization 검토.

---

# 103. Alerting on Metrics

MVP Non-Scope:

- anomaly detection
- automated KPI alerts
- predictive analytics

운영 dead-letter/worker alert는 Analytics와 별도 Observability 영역.

---

# 104. Analytics Architecture Failure Classes

## ANA-F1 Missing Client Event

behavioral funnel undercount.

DB Product truth 영향 없음.

## ANA-F2 Duplicate Event

GA4 conversion inflated.

critical conversion은 server/domain source와 비교.

## ANA-F3 PII Leakage

Critical privacy incident.

event allowlist + tests.

## ANA-F4 Attribution Lost

Organic/campaign attribution incomplete.

Product truth unaffected.

## ANA-F5 GSC Lag

Search visibility delayed.

normal observation lag.

## ANA-F6 Provider Open False Positive

open rate distorted.

interpretation issue.

---

# 105. Metric Governance

각 KPI에는 문서화:

```text
name
definition
numerator
denominator
source
timezone
inclusion/exclusion
owner
```

를 유지.

“가입전환율”처럼 사람마다 다른 denominator를 쓰지 않는다.

---

# 106. Canonical Metric Definitions

## Qualified Visitors

GA4 qualified sessions.

## Organic Visitors

GA4 organic sessions/users; GSC clicks complementary.

## Indexed Articles

DB indexable count와 GSC visible count 분리.

## Detail→Follow

sessions with follow_click / sessions with Institution or Opportunity detail view.

## Signup Completion

signup_complete / signup_start.

## Active Monitoring Parents

DB operational definition.

## Average Follow

active Follows / Active Monitoring Parents.

## Email Open

unique opened deliveries / sent deliveries.

## Email CTR

unique clicked deliveries / sent deliveries.

## 14-Day Returning

activated Users returning within 14 days / activation cohort.

---

# 107. Analytics Admin Dashboard

09 Admin Architecture에서 구현할 Dashboard sections:

```text
Acquisition
Activation
Monitoring
Notification
Retention
SEO
```

예:

### Acquisition

```text
Qualified Visitors
Organic Visitors
Article organic landings
```

### Activation

```text
Follow Click
Signup Start
Signup Complete
Follow Created
Detail→Follow
```

### Monitoring

```text
AMP
Average Follow
```

### Notification

```text
Sent
Open
CTR
Failure
Suppression
```

### Retention

```text
14-Day Returning
Notification Return
```

---

# 108. Privacy-safe Dashboard

Admin dashboard에:

- raw email
- Kakao subject
- child profile
- individual browsing history

기본 노출하지 않는다.

aggregate 중심.

운영 문제 조사 시 User opaque ID 수준.

---

# 109. Analytics Event Catalog

| Event | Owner | Critical | Primary Properties |
|---|---|---:|---|
| home_view | Client | No | landing_page |
| article_view | Client | Yes | article_id |
| search | Client | No | query_length_bucket,result_count |
| filter | Client | No | filter_type,filter_value |
| institution_view | Client | Yes | institution_id,category,region |
| opportunity_view | Client | Yes | opportunity_id,institution_id,kind |
| follow_click | Client | Yes | institution_id,context |
| signup_start | Server/Client boundary | Yes | acquisition context |
| signup_complete | Server | Yes | user opaque context |
| follow_created | Server | Yes | institution_id,follow_count |
| additional_follow | Server | Yes | institution_id,follow_count |
| my_preppy_view | Client | Yes | follow_count,email_state |
| notification_sent | Server | Yes | notification_id,opportunity_id |
| notification_open | Provider/Server | No | delivery_id |
| notification_click | Provider/Server | Yes | delivery_id |
| article_to_institution | Client | Yes | article_id,institution_id |
| article_to_follow | Client | Yes | article_id,institution_id |
| hero_primary_cta_click | Client | No | cta |
| hero_secondary_cta_click | Client | No | cta |

---

# 110. Context Property

`context` allowlist:

```text
HOME
ARTICLE
INSTITUTION
OPPORTUNITY
MY_PREPPY
EMAIL
```

free text 금지.

---

# 111. Follow Count Property

Server emits post-commit active Follow count.

Client-estimated count 사용 금지.

---

# 112. Region Property

Institution public region code only.

User interest region 아님.

---

# 113. Event IDs

Critical server event에:

```text
analytics_event_id
```

UUID를 부여할 수 있다.

목적:

- internal logs
- retry trace
- test dedupe

GA4 property로 보내도 되고 내부만 사용해도 됨.

---

# 114. Notification IDs and Privacy

notification_id/delivery_id는 opaque UUID.

GA4에 보내는 것이 허용 가능하나 user behavior re-identification risk를 최소화.

User ID와 함께 모든 Delivery ID를 불필요하게 장기 분석하지 않는다.

---

# 115. Server Conversion Context Persistence

FollowCreated 시 acquisition context가 필요한 경우:

방법 A:

```text
analytics event property only
```

방법 B:

```text
short-lived context in PendingFollowIntent
```

DB에 permanent marketing attribution table은 MVP에서 만들지 않는다.

---

# 116. First-touch vs Last-touch

MVP default:

```text
current conversion context
```

만.

first-touch attribution DB table 없음.

---

# 117. Organic AMP Trend

GA4/GSC와 DB를 결합해야 완전히 정확해질 수 있다.

MVP에서는:

- organic follow_created event cohort
- current AMP DB trend

를 함께 본다.

후속 warehouse 전까지 approximate cross-source metric임을 명시.

---

# 118. Analytics Non-Scope

- BigQuery warehouse
- customer data platform
- Segment/Mixpanel mandatory dependency
- multi-touch attribution
- ML churn prediction
- recommendation analytics
- A/B platform
- data lake
- event streaming bus
- Kafka
- Snowflake
- Looker infrastructure
- child-level behavioral profiling
- advertiser audience export
- cross-device identity graph

---

# 119. Acceptance Scenarios

## Scenario 1 — Article Organic Follow

```text
Google
→ Article
→ Institution
→ Follow Click
→ Signup
→ Follow Created
```

PASS:
article_view, article_to_institution, follow_click, signup_start/complete, follow_created correlate by context without PII.

## Scenario 2 — Existing User Follow

PASS:
follow_click + follow_created, no signup events.

## Scenario 3 — Duplicate Follow Click

PASS:
multiple click possible, one follow_created.

## Scenario 4 — Email OFF User

PASS:
Follow remains in DB but AMP false.

## Scenario 5 — Analytics Blocked Browser

PASS:
GA4 view missing possible; Follow/AMP DB truth remains correct.

## Scenario 6 — Notification Sent/Open/Click

PASS:
sent from Delivery state, open/click provider telemetry, click returns to canonical URL.

## Scenario 7 — No-change Monitoring

PASS:
no opportunity change/notification analytics event.

## Scenario 8 — User Deletes

PASS:
no PII retained in analytics payload; future server events blocked.

## Scenario 9 — Search Raw Query

PASS:
raw text not sent by default.

## Scenario 10 — Article Noindex

PASS:
DB indexability/GSC distinction retained.

## Scenario 11 — Follow Reactivation

PASS:
actual ACTIVE transition can emit follow_created/reactivated semantic once; no duplicate historical conversion.

## Scenario 12 — Test Environment

PASS:
production GA4 data not polluted.

---

# 120. Architecture Decisions Locked

## ANA-001
PostgreSQL is operational truth; GA4 is behavioral observation; GSC is search visibility observation.

## ANA-002
North Star Active Monitoring Parents is calculated from PostgreSQL, not GA4.

## ANA-003
Critical success events are emitted from committed server state where possible.

## ANA-004
Client click events and server success events remain semantically distinct.

## ANA-005
Canonical product IDs are Institution/Opportunity/Article UUIDs; legacy IDs are not primary analytics identities.

## ANA-006
Kakao subject, raw email, OAuth token/code, child name, and phone are prohibited analytics properties.

## ANA-007
`child_birth_year` is not sent to GA4 by default.

## ANA-008
Raw search query is not sent to GA4 by default.

## ANA-009
Analytics failure never rolls back or blocks product transactions.

## ANA-010
FollowCreated is emitted only on real inactive/nonexistent → ACTIVE state transition.

## ANA-011
SignupComplete is emitted only after User PENDING → ACTIVE commit.

## ANA-012
NotificationSent is derived from canonical Delivery state, not client UI.

## ANA-013
GA4 identity stitching is not relied on for operational Follow/AMP truth.

## ANA-014
PendingFollowIntent may carry only allowlisted short attribution context.

## ANA-015
MVP attribution is simple conversion-context/last-touch oriented; no multi-touch system.

## ANA-016
Daily business reporting uses Asia/Seoul timezone.

## ANA-017
Article acquisition effectiveness is measured by product conversion, not pageview alone.

## ANA-018
GSC indexed/search visibility and DB indexable publication are distinct metrics.

## ANA-019
Email Open is directional and not treated as exact human read truth.

## ANA-020
Analytics does not require a warehouse for MVP.

## ANA-021
Public User/child interest profile is not exported as analytics user properties by default.

## ANA-022
Event contracts are centrally defined and privacy-classified.

## ANA-023
Critical server analytics can use existing Outbox/integration events if retry is needed, but analytics side effects stay non-blocking.

## ANA-024
Development/test analytics must not pollute production KPI data.

---

# 121. Repository Validation Questions

Codex must verify:

1. current analytics/GA4 dependencies/config reality
2. current GSC wiring reality
3. current route runtime and ability to instrument Server/Client Components
4. Next.js 16 client navigation/view event pattern
5. public Follow island event dispatch feasibility
6. server post-commit integration event path
7. existing Outbox reuse for critical analytics side effects if desired
8. no current analytics DB schema conflict
9. canonical IDs target schema compatibility
10. pending Follow attribution cookie feasibility with 07A
11. User-ID/session use without PII
12. GA4 Measurement Protocol/server secret configuration feasibility
13. notification provider event integration not yet implemented
14. DB query feasibility for AMP/Average Follow/Notification metrics
15. 14-day retention query without warehouse
16. environment isolation strategy
17. raw search query suppression
18. event schema/type registry implementation location
19. production GA4/GSC settings are NOT_VERIFIABLE unless configured
20. analytics can remain optional/non-blocking

---

# 122. Definition of Done

Analytics Architecture is complete when:

1. operational vs behavioral vs search data sources are separated.
2. North Star formula is explicit.
3. MVP funnel event semantics are fixed.
4. client click vs server success events are distinct.
5. canonical IDs/properties are defined.
6. PII/child data rules are explicit.
7. attribution boundary is defined.
8. dashboard metric source ownership is defined.
9. retention/notification metrics are defined.
10. GA4/GSC disagreement is expected and documented.
11. event failure cannot break Product flows.
12. no warehouse is required for MVP.
13. test/data-quality rules are defined.
14. Admin dashboard can consume the metrics.

---

# 123. Next Step

Repository validation output:

```text
08A_ANALYTICS_ARCHITECTURE_REPOSITORY_VALIDATION.md
```

If:

```text
VALID
or
VALID_WITH_IMPLEMENTATION_ADJUSTMENTS
```

and no Architecture amendment is required:

next:

```text
09_ADMIN_OPERATIONS_ARCHITECTURE.md
```

then:

```text
10_PRD.md
```
