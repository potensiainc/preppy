# 07_IDENTITY_FOLLOW_NOTIFICATION.md

> **Project:** PREPPY (프레피)  
> **Document Type:** Identity, Follow & Notification Architecture  
> **Status:** v1.0 — Repository validation required before implementation  
> **Product Baseline:** `00_PRODUCT_REQUIREMENTS_BASELINE.md`  
> **Target Architecture:** `02_TARGET_ARCHITECTURE.md` Target v1.1  
> **Domain Model:** `03_DOMAIN_MODEL.md` Domain v1.0  
> **Data Model:** `04_DATA_MODEL.md` Data Model v1.0  
> **Monitoring Architecture:** `05_MONITORING_ARCHITECTURE.md` v1.0  
> **Content/SEO Architecture:** `06_CONTENT_SEO_ARCHITECTURE.md` v1.0  
> **Latest Validation:** `06A_CONTENT_SEO_ARCHITECTURE_REPOSITORY_VALIDATION.md` — VALID_WITH_IMPLEMENTATION_ADJUSTMENTS  
> **Core Principle:** User identity, authentication provider, Follow delegation, consent, notification preference, and delivery channel are distinct concepts.  
> **Purpose:** PREPPY의 비로그인 Follow Intent부터 Kakao 인증, 회원 활성화, 프로필·동의, Institution Follow, My Preppy, Email Notification eligibility, 수신설정 변경, Unfollow, 탈퇴까지의 사용자 lifecycle과 transaction/security boundary를 확정한다.

---

# 0. Document Role

PREPPY의 핵심 Activation Loop:

```text
Institution / Opportunity
→ Follow Click
→ Kakao Login
→ Signup / Consent
→ Follow Created
→ My Preppy
→ Monitoring
→ Notification
→ Email
→ Return
```

이 문서는 이 Loop에서 사용자 identity와 상태 전이를 정의한다.

이 문서에서 결정한다.

1. User와 Kakao identity의 경계
2. 로그인/가입 lifecycle
3. Pending Follow Intent
4. 신규/기존 User callback 처리
5. Profile 최소 수집
6. Consent와 NotificationPreference의 분리
7. Email 확보/검증/사용 가능성
8. Follow activate/deactivate/reactivate
9. My Preppy의 Monitoring 상태
10. Notification eligibility
11. Email unsubscribe / preference 변경
12. account deletion
13. OAuth/session/CSRF/security boundary
14. idempotency와 race condition
15. legacy Subscriber/Subscription 처리
16. Analytics event boundary

이 문서에서 결정하지 않는다.

- Kakao SDK exact package
- Kakao API의 세부 field name
- Email provider
- 실제 UI 디자인
- 개인정보처리방침 법률 문구
- 정확한 retention 기간
- marketing automation
- push/KakaoTalk 메시지
- multi-child family account
- complex RBAC

---

# 1. Identity Architecture Overview

```text
Anonymous Visitor
      │
      │ Follow Click
      ▼
Pending Follow Intent
      │
      │ Kakao OAuth
      ▼
AuthIdentity(KAKAO)
      │
      ▼
Canonical User
      │
      ├─ Profile
      ├─ UserEmail
      ├─ ConsentDecision
      ├─ NotificationPreference
      │
      ▼
Follow(User ↔ Institution)
      │
      ▼
My Preppy / Monitoring
      │
      ▼
Notification Eligibility
      │
      ▼
NotificationDelivery(EMAIL)
```

---

# 2. Canonical Identity Rule

PREPPY의 canonical 회원 identity는:

```text
User
```

다.

다음은 User identity 자체가 아니다.

```text
Kakao provider subject
Email
Session cookie
Follow
Subscriber
```

즉:

```text
User != Kakao Account
User != Email
User != Legacy Subscriber
```

---

# 3. AuthIdentity

MVP authentication provider:

```text
KAKAO
```

관계:

```text
User 1 ── 1..N AuthIdentity
```

MVP에서는 대부분:

```text
1 User
→ 1 Kakao AuthIdentity
```

다.

하지만 User PK는 provider subject를 사용하지 않는다.

---

# 4. Why Provider Identity Must Be Separate

이유:

1. 향후 다른 OAuth provider 추가 가능
2. Kakao provider subject 변경/연결 정책과 User history 분리
3. account deletion과 provider revocation 분리
4. User Follow/Notification history가 provider 구현에 종속되지 않음
5. Email이 없어도 User 존재 가능

---

# 5. Authentication Flow

기본 OAuth Authorization Code flow를 사용한다.

논리 흐름:

```text
GET /auth/kakao/start
→ state 생성
→ Kakao authorization
→ callback
→ state 검증
→ authorization code 교환
→ provider identity 확인
→ AuthIdentity lookup
→ User resolve/create
→ session 생성
→ onboarding / pending follow completion
```

세부 provider SDK/API는 infrastructure adapter가 담당한다.

---

# 6. OAuth Security Requirements

필수:

```text
state validation
HTTPS in production
redirect URI allowlist
HttpOnly session cookie
Secure cookie in production
SameSite policy
short-lived auth transaction state
provider token secrecy
```

`nonce`/PKCE 등은 provider와 사용하는 OAuth client/library가 지원·요구하는 범위에서 적용한다.

Architecture 원칙:

> Provider가 허용하는 보안 기능을 생략하기 위해 직접 낮은 수준 OAuth 구현을 만들지 않는다.

---

# 7. Provider Token Policy

Kakao access/refresh token은 PREPPY User identity가 아니다.

MVP에서 로그인 이후 provider API를 지속 호출할 필요가 없다면:

```text
authorization callback 처리 후
장기 provider token 저장 금지
```

를 기본으로 한다.

향후 지속 API 접근이 실제 필요할 때만 encrypted credential storage를 별도 설계한다.

Application log/audit에 token을 기록하지 않는다.

---

# 8. Session Architecture

Session은 Infrastructure concern이다.

MVP 권장:

```text
secure signed/encrypted HttpOnly cookie
→ canonical user_id
→ protected request마다 User status 확인
```

Session에 저장 가능한 최소 정보:

```text
user_id
issued_at
expires_at
session version / integrity metadata when needed
```

저장하지 않는 것:

```text
raw email
provider access token
child profile
consent details
```

### Why no separate session service for MVP

현재 규모에서:

- Redis
- distributed session service
- session microservice

가 필요하지 않다.

### Immediate User Revocation

protected request는 User status를 확인하므로:

```text
User.status = DELETED/SUSPENDED
```

이면 cookie가 남아 있어도 접근 거부한다.

---

# 9. Session Lifecycle

```text
NO_SESSION
→ AUTHENTICATED
→ EXPIRED / LOGGED_OUT
```

로그아웃:

```text
session cookie clear
```

MVP에서 global multi-device session revocation table은 만들지 않는다.

필요성이 검증되면 후속 확장.

---

# 10. CSRF Boundary

GET-like public navigation은 별도 CSRF state가 필요 없다.

state-changing authenticated request:

```text
Follow
Unfollow
Preference update
Profile update
Account delete
```

는:

- SameSite cookie
- origin/referer validation where appropriate
- framework/server action CSRF protection
- explicit POST/DELETE semantics

를 사용한다.

OAuth callback의 `state`와 application CSRF를 동일 개념으로 혼동하지 않는다.

---

# 11. Anonymous User

비로그인 방문자도 다음 Public 기능을 사용할 수 있다.

```text
Article view
Institution view
Opportunity view
Search/filter
Official source links
```

로그인이 필요한 첫 핵심 action:

```text
Follow Institution
```

PREPPY는 정보를 로그인 wall 뒤에 숨기지 않는다.

---

# 12. Follow Intent

비로그인 사용자가:

```text
“이 기관 업데이트 받기”
```

를 누른 순간 아직 Follow가 생성된 것은 아니다.

그 순간 생성되는 application concept:

```text
PendingFollowIntent
```

---

# 13. PendingFollowIntent Properties

논리 값:

```text
institution_id
source_route
created_at
expires_at
intent_nonce
```

Optional attribution:

```text
article_id
opportunity_id
utm_source
utm_medium
utm_campaign
```

PII 없음.

---

# 14. PendingFollowIntent Persistence

MVP 기본:

```text
short-lived signed/encrypted cookie
or
server-side short-lived auth transaction state
```

별도 permanent DB table을 만들지 않는다.

이유:

- 짧은 수명
- business history 아님
- 로그인 완료 후 폐기
- DB cleanup 불필요

Cookie payload를 사용할 경우 tamper-proof 해야 한다.

---

# 15. Pending Intent Expiry

Intent는 영구적이지 않다.

기본 원칙:

```text
minutes to hours scale
```

정확한 TTL은 implementation config.

만료 시:

- OAuth 로그인 자체는 완료 가능
- 자동 Follow는 하지 않음
- User를 안전한 post-login destination으로 이동

---

# 16. Follow Intent Validation

Callback 이후 Follow 생성 전:

1. intent signature/state valid
2. not expired
3. Institution exists
4. Institution is followable
5. User ACTIVE
6. duplicate Follow handled idempotently

를 검증한다.

Client가 임의 Institution ID를 변조해도 서버 검증을 통과해야 한다.

---

# 17. Existing User OAuth Callback

이미:

```text
(provider=KAKAO, provider_subject=X)
```

AuthIdentity가 존재하면:

```text
AuthIdentity
→ User
```

를 resolve.

User status:

### ACTIVE

session 발급.

Pending Follow Intent가 있으면 idempotent activate.

### SUSPENDED

session access 제한 / 안내.

### DELETED

기본적으로 기존 User를 자동 재활성화하지 않는다.

재가입 정책은 별도 account recovery/product decision이 필요하다.

MVP에서는 새 가입을 무조건 silent하게 연결하지 않는다.

---

# 18. New User OAuth Callback

AuthIdentity가 없으면:

```text
new User(PENDING)
+ AuthIdentity
```

를 생성한다.

provider profile에서 Email을 사용할 수 있는 경우 후보로 확보할 수 있다.

단:

```text
provider email != canonical user identity
```

이다.

---

# 19. Signup / Onboarding

신규 User가 ACTIVE가 되기 위한 최소 onboarding:

```text
required Terms consent
required Privacy consent
usable Email 확보 or Email-less monitoring state 허용 여부
optional child birth year
interest regions
interest education categories
service email update consent/preference
```

---

# 20. User Activation Rule

필수:

```text
Terms effective GRANTED
Privacy effective GRANTED
```

가 있어야:

```text
User.status = ACTIVE
```

로 전환 가능.

Email update consent는 User account activation 자체의 필수조건으로 만들지 않는다.

즉:

```text
User ACTIVE
+ Follow ACTIVE
+ Email updates OFF
```

상태가 가능하다.

---

# 21. Why Email Update Must Be Optional to Account

Follow의 제품 의미는 Monitoring delegation이다.

Email은 MVP 전달 channel이다.

둘을 강제로 하나로 합치면:

- 수신 해제 = Follow 삭제
- 수신 해제 = 계정 기능 상실

같은 잘못된 coupling이 생긴다.

따라서:

```text
Follow
≠ Email Preference
```

를 유지한다.

---

# 22. Email Acquisition

Email source:

```text
KAKAO
USER_INPUT
```

Provider가 usable email을 제공하지 않으면 onboarding에서 입력받는다.

User에게 정확한 Email이 없으면:

```text
Follow 가능
My Preppy 가능
Email delivery 불가
```

상태를 허용할 수 있다.

UI는:

```text
“이메일을 등록하면 변경 알림을 받을 수 있어요.”
```

와 같은 상태를 표현할 수 있다.

---

# 23. Email Verification

Architecture는 다음을 분리한다.

```text
Email exists
Email verified
Email deliverable
```

MVP에서:

- trusted provider verified claim을 신뢰할지
- user-input email에 verification link를 요구할지

는 provider/security implementation에서 최종 결정한다.

그러나 Notification eligibility는:

```text
usable Email
```

을 요구한다.

---

# 24. UserEmail State

논리:

```text
verification_state:
UNVERIFIED
VERIFIED

delivery_state:
USABLE
BOUNCED
SUPPRESSED
REMOVED
```

`VERIFIED`지만 hard bounce라면 Email Notification 불가.

---

# 25. Onboarding Profile

MVP Profile:

```text
child_birth_year
interest_regions
interest_education_categories
```

수집 목적:

- 탐색 개인화
- 향후 relevant content
- Analytics segmentation

수집하지 않는 것:

```text
child name
exact birth date
income
assets
job
monthly education budget
```

---

# 26. Profile Optionality

Profile fields는 onboarding completion을 막는 필수값으로 최소화한다.

특히 child birth year/interest는:

```text
skip 가능
```

하게 할 수 있다.

핵심 Activation은:

```text
Auth
→ required consent
→ Follow
```

이다.

프로필 입력 때문에 Follow completion rate를 불필요하게 낮추지 않는다.

---

# 27. Consent Model

Consent는 append-only decision history.

MVP 논리:

```text
TERMS_OF_SERVICE
PRIVACY_POLICY
SERVICE_EMAIL_UPDATES
```

향후:

```text
MARKETING_EMAIL
```

등 별도.

---

# 28. Consent vs Preference

Consent:

```text
“이 처리/수신에 동의했는가?”
```

Preference:

```text
“현재 이 channel을 켜둘 것인가?”
```

따라서:

```text
ConsentDecision
≠ NotificationPreference
```

---

# 29. Email Notification Effective State

Email delivery eligible:

```text
User ACTIVE
AND UserEmail USABLE
AND SERVICE_EMAIL_UPDATES effective GRANTED
AND EMAIL NotificationPreference ENABLED
```

이 중 하나라도 false면:

```text
Email updates unavailable/off
```

---

# 30. Initial Email Preference

사용자가 명시적으로 service email updates에 동의한 경우:

```text
EMAIL preference = ENABLED
```

로 초기화 가능.

동의하지 않은 경우:

```text
DISABLED
```

서비스 Email 동의와 Preference 초기화 UI는 명확히 연결하되 stored concepts는 분리한다.

---

# 31. Signup Completion Transaction

권장:

```text
BEGIN

lock User(PENDING)

validate required Terms/Privacy decision
append ConsentDecisions
upsert Profile/Email/Interest
upsert NotificationPreference
activate User

IF PendingFollowIntent valid:
   activate Follow
   create/open FollowEpisode

Audit/domain events

COMMIT
```

이렇게 하면:

```text
signup_complete
+
follow_created
```

가 중간 실패로 갈라지는 것을 줄일 수 있다.

단 외부 OAuth provider call/Email send는 포함하지 않는다.

---

# 32. Existing User Pending Follow Transaction

로그인된 ACTIVE User:

```text
BEGIN

validate Institution
get/create logical Follow
activate if inactive
open Episode if needed

COMMIT
```

이미 ACTIVE면:

```text
idempotent success
```

---

# 33. Follow Lifecycle

```text
Not Exists
→ ACTIVE

ACTIVE
→ INACTIVE

INACTIVE
→ ACTIVE
```

`follows`는 current logical relation.

`follow_episodes`는 history.

---

# 34. Follow Creation Invariants

1. User ACTIVE
2. Institution followable
3. logical User–Institution Follow 최대 하나
4. open Episode 최대 하나
5. duplicate click/callback retry idempotent
6. Follow activation은 Email preference를 자동으로 강제 ENABLE하지 않음
7. Follow activation은 과거 signal을 소급 발송하지 않음

---

# 35. Followable Institution

기본:

```text
publication_state = PUBLISHED
AND operational_state not CLOSED
AND monitorable source coverage exists
```

Admin/product policy에 따라:

```text
HIDDEN
ARCHIVED
```

Institution 신규 Follow는 막을 수 있다.

---

# 36. What Happens When Institution Becomes Closed/Archived

신규 Follow:

```text
disabled
```

기존 Follow:

- 즉시 hard delete하지 않음
- Monitoring status projection에서 archived/ended 표시
- Email eligibility는 더 이상 일반 Opportunity signal이 없으면 자연스럽게 없음

필요시 operational command로 active Follow를 INACTIVE 전환할 수 있다.

그 경우 Episode 종료/audit 필요.

---

# 37. Unfollow

User action:

```text
Unfollow Institution
```

결과:

```text
Follow ACTIVE → INACTIVE
close FollowEpisode
```

영향:

- My Preppy active list에서 제거
- future signal Notification eligibility 없음
- account 유지
- Email preference 유지
- historical Delivery 유지

---

# 38. Unfollow Is Not Unsubscribe

중요:

```text
Unfollow Institution
!=
Turn Off Email
```

Email OFF는 모든 Institution Follow는 유지하되 Email 전달만 중지.

Unfollow는 한 Institution Monitoring delegation을 종료.

---

# 39. Email Preference OFF

```text
NotificationPreference(EMAIL) = DISABLED
```

영향:

```text
Follows remain ACTIVE
Monitoring remains ACTIVE
My Preppy remains
future Email Delivery suppressed/not created according to policy
```

North Star의 Active Monitoring Parent에는 Email ON이 필요하므로 해당 사용자 count에서 제외될 수 있다.

---

# 40. Email Preference ON

Enable 전:

1. User ACTIVE
2. usable Email exists
3. effective Service Email consent exists

확인.

필요한 consent가 없으면 UI에서 consent grant flow를 함께 처리.

Preference만 ON으로 바꿔 consent를 우회하지 않는다.

---

# 41. Consent Revocation

`SERVICE_EMAIL_UPDATES` REVOKED:

```text
Email Preference를 effective OFF로 취급
```

physical preference row를 DISABLED로 동기화할 수 있지만 Source of Truth가 섞이지 않도록:

- consent history 유지
- current preference도 disable

하는 transaction을 권장.

Pending Delivery는 send-time recheck에서 SUPPRESSED.

---

# 42. Email Bounce / Suppression

Provider webhook에서 hard bounce/complaint 등 terminal deliverability 문제가 확인되면:

```text
UserEmail.delivery_state = BOUNCED or SUPPRESSED
```

future Email eligibility false.

Follow는 유지.

My Preppy에서 Email attention state를 보여줄 수 있다.

정확한 provider event taxonomy는 adapter가 canonical delivery state로 mapping.

---

# 43. My Preppy Product Contract

`/my-preppy`는 로그인된 User의 Monitoring dashboard.

기본 sections:

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

# 44. My Preppy Query

```text
User
→ ACTIVE Follows
→ Institutions
→ Published Opportunities
→ canonical current Opportunity projection
→ Recent OpportunityChanges
```

그리고:

```text
Email effective state
```

를 계산.

---

# 45. Monitoring Status in My Preppy

논리 projection:

```text
MONITORING
EMAIL_OFF
EMAIL_NEEDS_ATTENTION
SOURCE_ATTENTION_REQUIRED
ARCHIVED
```

별 core DB enum/table 필요 없음.

---

# 46. My Preppy “Monitoring 중” Rule

최소:

```text
Follow ACTIVE
AND Institution PUBLISHED
AND Institution not CLOSED/ARCHIVED
AND ≥1 active official Source Binding
```

Email OFF여도 Monitoring 자체는 표시 가능.

UI는 분리:

```text
3개 기관 Monitoring 중
Email 업데이트 OFF
```

---

# 47. Notification Architecture Relationship

`07`은 Notification 생성 자체를 다시 설계하지 않는다.

`05`의 canonical pipeline:

```text
Opportunity signal
→ Notification
→ Recipient Resolution
→ NotificationDelivery
→ Email
```

을 사용한다.

`07`은 recipient identity/eligibility를 확정한다.

---

# 48. Signal-time Eligibility

기본:

```text
FollowEpisode.activated_at <= signal_published_at
AND
(deactivated_at IS NULL OR signal_published_at < deactivated_at)
```

이 조건을 만족한 User만 해당 signal의 potential recipient.

---

# 49. Current Eligibility

Recipient resolution 시 추가:

```text
User ACTIVE
Email usable
Service Email consent effective
Email preference enabled
```

---

# 50. Send-time Eligibility

Provider 호출 직전 다시 확인:

```text
User ACTIVE
Follow still ACTIVE
Email usable
Consent granted
Preference enabled
```

실패:

```text
NotificationDelivery SUPPRESSED
```

---

# 51. Eligibility Snapshot vs Current State

다음을 구분한다.

### Was user following at signal time?

historical FollowEpisode.

### Can we send now?

current User/Follow/Email/Consent/Preference.

둘 다 true여야 Email send.

---

# 52. No Retroactive Notification

```text
signal at T1
Follow activated at T2 > T1
```

이면:

```text
No Delivery
```

현재 Opportunity 상태는 My Preppy에서 보여준다.

---

# 53. Reactivation

```text
Follow episode 1: T1–T2
Follow episode 2: T3–
```

T2와 T3 사이 signal은 Email 대상 아님.

---

# 54. Notification Deep Link

Email은 canonical route로 연결.

기본:

```text
/opportunities/{slug}
```

Opportunity가 더 이상 public하지 않으면:

- Institution route
- safe fallback

정책 가능.

Email에 private token을 query로 붙여 public Opportunity를 보여줄 필요 없음.

---

# 55. Notification Open / Click Attribution

Email click analytics는:

```text
notification_id
delivery_id
```

같은 opaque identifier를 이용할 수 있다.

PII를 URL query에 넣지 않는다.

tracking redirect를 사용할 경우:

- short opaque token
- safe destination allowlist
- no open redirect

필수.

MVP에서 provider click webhook으로 충분하면 별도 redirect를 만들지 않는다.

---

# 56. Email Preference Entry Point

Email footer:

```text
My Preppy 알림 설정
```

으로 연결.

로그인되지 않은 상태에서 간편 수신해제를 제공할 경우:

```text
signed scoped action token
```

을 사용할 수 있다.

Token payload:

```text
user reference
channel EMAIL
action DISABLE
expiry
nonce/version
```

raw email 없음.

Persistent token table은 MVP 필수 아님.

---

# 57. Preference Action Token Security

사용 시:

- signature verify
- action/channel scope verify
- expiry verify
- idempotent disable

후 token replay가 있어도:

```text
already DISABLED
```

로 안전.

Account delete나 Follow delete 권한까지 같은 token에 주지 않는다.

---

# 58. Account Deletion

User-facing:

```text
회원 탈퇴
```

은 단순 logout이 아니다.

Transaction:

```text
BEGIN

lock User
status = DELETED
deleted_at

delete/revoke AuthIdentity PII
delete UserEmail
delete Profile/Interest PII
disable NotificationPreference
close active Follows/Episodes
suppress pending/queued Deliveries
append audit

COMMIT
```

---

# 59. Account Deletion Consequences

즉시:

- protected request deny
- future Follow 불가
- future Email 불가
- pending sends suppress
- PII child remove

유지 가능:

- opaque User UUID
- Follow historical relation
- Delivery status/attempt
- Audit business event
- aggregated analytics

정확한 legal retention 기간은 별도.

---

# 60. Re-registration After Deletion

MVP default:

```text
deleted account auto-reactivation 금지
```

같은 Kakao identity로 다시 로그인했을 때:

- provider identity가 이미 제거되었을 수 있음
- 새 User 생성 여부
- historical linking 여부

는 Product/Privacy policy가 필요.

초기 구현에서는 silent merge 금지.

Codex validation에서 schema impact 확인 후 implementation policy를 명시한다.

---

# 61. Legacy Subscriber / Subscription

기존:

```text
Subscriber(email)
Subscription(AdmissionCycle)
```

은 canonical User/Follow가 아니다.

신규 signup flow에서 사용하지 않는다.

---

# 62. Legacy Data Linking

Production legacy row가 실제 존재하는 경우에도:

```text
same email
→ automatic User merge
```

하지 않는다.

이유:

- email identity ≠ User identity
- consent purpose 차이
- account ownership 확실치 않음

향후 migration이 필요하면:

- verified matching
- explicit user action
- policy review

후 별도.

---

# 63. Legacy Alert Delivery

기존 AlertDelivery:

- history
- read-only after cutover

신규 User NotificationDelivery와 account page에서 자동 합치지 않는다.

필요한 경우 migration/legacy history view를 별도 설계.

---

# 64. Auth Failure Cases

## AUTH-F1 User cancels Kakao

PendingFollowIntent 유지 TTL 내 재시도 가능.

## AUTH-F2 state mismatch

callback reject.

Follow 생성 금지.

## AUTH-F3 provider token exchange fails

no session.

retry/login restart.

## AUTH-F4 provider identity missing

signup 중단.

## AUTH-F5 DB transaction fails

no partial active User/Follow state.

## AUTH-F6 duplicate callback

AuthIdentity unique + Follow idempotency로 안전.

---

# 65. Onboarding Failure Cases

## ONB-F1 Required consent missing

User PENDING 유지.

## ONB-F2 Email missing

account activation은 가능할 수 있음.

Email updates unavailable.

## ONB-F3 Email invalid

Email update unavailable; correction flow.

## ONB-F4 Follow Institution no longer followable

signup 완료는 유지.

Follow skip + user-facing message.

---

# 66. Follow Race Cases

## FOL-R1 Double Click

one logical Follow.

## FOL-R2 Two OAuth callbacks

one User/AuthIdentity, one active Follow/open Episode.

## FOL-R3 Follow while Institution archived

transaction revalidate → reject.

## FOL-R4 Unfollow while recipient resolution running

candidate Delivery may exist, send-time recheck suppress.

---

# 67. Consent Race Cases

## CON-R1 Preference OFF after resolver

send-time suppress.

## CON-R2 Consent revoked after resolver

send-time suppress.

## CON-R3 Email removed after resolver

send-time suppress.

---

# 68. User Delete Race

Delete and worker can race.

Product semantic boundary:

> Provider request 직전 eligibility recheck 시점에 User가 DELETED이면 발송하지 않는다.

Network call이 이미 provider에 제출된 후 deletion이면 이미 accepted된 send를 항상 회수할 수는 없다.

DB/network 장기 lock으로 완전 제거하려 하지 않는다.

---

# 69. Transaction Boundaries

## 69.1 AuthIdentity Resolve/Create

```text
BEGIN
find identity
if absent create User PENDING + AuthIdentity
COMMIT
```

Provider network exchange는 transaction 밖.

---

## 69.2 Complete Signup

```text
BEGIN
lock User
append required consent
profile/email/preference
activate User
optional Follow activation
audit/domain events
COMMIT
```

---

## 69.3 Follow Activate

```text
BEGIN
lock User
validate ACTIVE
validate Institution
get/create Follow
lock Follow if existing
activate/open Episode idempotently
COMMIT
```

---

## 69.4 Follow Deactivate

```text
BEGIN
lock Follow
close Episode
set INACTIVE
COMMIT
```

---

## 69.5 Preference Update

```text
BEGIN
validate User
validate prerequisite consent/email for ENABLE
upsert Preference
audit/event
COMMIT
```

---

## 69.6 Consent Revoke

```text
BEGIN
append REVOKED ConsentDecision
disable affected Preference
audit
COMMIT
```

---

## 69.7 User Delete

Section 58 transaction.

---

# 70. Auth / Follow Idempotency Keys

OAuth callback 자체는 provider code 재사용 제한이 있을 수 있다.

DB-level idempotency:

```text
UNIQUE(provider, provider_subject)
UNIQUE(user_id, institution_id)
partial UNIQUE(open FollowEpisode)
```

로 canonical duplication 방어.

Pending intent nonce는 request replay tracing에 사용 가능.

---

# 71. Signup Analytics Events

minimum:

```text
follow_click
signup_start
signup_complete
follow_created
additional_follow
my_preppy_view
```

properties:

```text
institution_id
institution_type
region
opportunity_id if context
article_id if context
child_birth_year when available
landing_page
utm_*
follow_count
```

---

# 72. Analytics Identity Boundary

GA4 user identity와 PREPPY User DB identity를 혼동하지 않는다.

User ID 설정이 필요하면 privacy policy에 맞춰 canonical opaque User ID 사용 가능.

Kakao provider subject/email을 analytics property로 보내지 않는다.

---

# 73. Signup Funnel

canonical funnel:

```text
institution_view / opportunity_view / article_view
→ follow_click
→ signup_start
→ signup_complete
→ follow_created
```

이미 로그인된 User:

```text
follow_click
→ follow_created
```

signup events 없음.

---

# 74. Follow Completion Semantics

`follow_created` analytics는:

```text
Follow transitioned to ACTIVE
```

일 때 발생.

이미 ACTIVE Follow에 중복 click하면 다시 `follow_created`를 발생시키지 않는다.

필요하면:

```text
follow_click_existing
```

같은 UX analytics는 별도 가능.

---

# 75. Active Monitoring Parent

DB Source of Truth:

```text
User ACTIVE
AND ≥1 ACTIVE Follow
AND effective Email updates enabled
```

effective Email:

```text
usable Email
+ Service Email consent
+ Email Preference ENABLED
```

Analytics event로 계산하지 않는다.

---

# 76. Account Security Logging

로그 기록 가능:

```text
auth_start
auth_success
auth_failure category
signup_complete
preference_change
follow_change
account_delete
```

로그 금지:

```text
provider subject raw
raw email
OAuth code/token
consent raw form payload
```

canonical opaque IDs 사용.

---

# 77. Rate Limiting

보호 대상:

```text
/auth/kakao/start
/auth/kakao/callback
follow mutation
preference mutation
account deletion
```

MVP에서는 복잡한 distributed limiter보다 hosting/platform 또는 application simple rate limit 사용 가능.

정확한 구현은 deployment architecture에서 결정.

OAuth abuse 방지를 위해 state TTL/one-use semantics를 우선한다.

---

# 78. Open Redirect Prevention

OAuth `return_to` / Follow source route를 그대로 redirect하지 않는다.

allowlist:

```text
relative internal paths only
```

또는 route registry.

External URL을 callback redirect destination으로 허용하지 않는다.

---

# 79. Post-login Destination

우선순위:

1. valid Pending Follow Intent가 있었고 Follow 성공
   → Institution/My Preppy context
2. valid internal return path
3. `/my-preppy`
4. home

정확한 UX는 PRD.

---

# 80. My Preppy Access

Require:

```text
valid session
User ACTIVE
```

Cache:

```text
private/dynamic
no shared cache
noindex
```

`06A` SEO architecture와 일치.

---

# 81. Public Follow Island

Institution/Opportunity public page:

```text
server-rendered public content
+
small personalized Follow client island
```

Follow island 상태:

```text
anonymous
authenticated + not followed
authenticated + followed
loading/error
```

public cached payload에 private Follow state를 섞지 않는다.

---

# 82. Follow Button States

### Anonymous

```text
이 기관 업데이트 받기
```

→ Pending intent + Kakao auth.

### Logged in / Not Following

→ direct Follow transaction.

### Following

```text
업데이트 받는 중
```

→ My Preppy/unfollow affordance.

### Institution unavailable

disabled/hidden.

---

# 83. Opportunity Follow CTA

Opportunity는 Follow target이 아니다.

Opportunity page CTA:

```text
“{Institution} 업데이트 받기”
```

따라서 Follow relation은 항상 Institution.

---

# 84. Article Follow CTA

Article relation이 1 Institution 중심이면 direct Institution Follow CTA 가능.

여러 Institution roundup이면:

- Institution cards 각각 Follow
- generic signup CTA보다 concrete Institution relation 우선

---

# 85. Notification Preferences UI

My Preppy:

```text
Email 업데이트
[ON/OFF]
```

상태 설명:

- ON
- OFF
- Email 필요
- Email 확인 필요
- Email 전달 불가

단순 boolean처럼 보여도 내부 Effective State는 여러 조건의 projection.

---

# 86. Email Change Flow

User가 Email 변경:

```text
new Email candidate
→ validation/verification
→ replace current UserEmail
```

기존 Follow 유지.

Preference 유지 가능하나 새 Email이 usable 되기 전 send는 suppress.

변경 중 raw Email history를 장기 저장하지 않는다.

---

# 87. Email Removal

User가 Email을 제거하는 기능을 제공하면:

```text
Email updates effective OFF
Follow 유지
```

Account required email이 아니라면 허용 가능.

MVP UI 제공 여부는 PRD.

---

# 88. Marketing Separation

향후 advertiser/marketing이 생겨도:

```text
SERVICE_EMAIL_UPDATES
```

를 marketing permission으로 재사용하지 않는다.

새 consent type/channel policy 필요.

PREPPY Monitoring Email 안에 광고를 넣는 정책은 별도 Product/Legal decision.

---

# 89. Notification Content Privacy

Email에 포함 가능한 정보:

```text
Institution
Opportunity
public dates/status
```

포함하지 않는 것:

```text
child birth year
interest profile
other followed institutions
sensitive profile
```

개인화는 최소화.

---

# 90. Notification Address Resolution

Delivery 생성 시 raw email을 snapshot으로 장기 저장하지 않는다.

Send 직전:

```text
user_id
→ current UserEmail
```

resolve.

장점:

- Email 변경 반영
- deletion PII cleanup
- Delivery history non-PII

---

# 91. Bounce Webhook Mapping

Provider message ID:

```text
NotificationDeliveryAttempt
```

에 매핑.

Webhook:

```text
provider + provider_message_id
→ Attempt
→ Delivery
→ UserEmail state
```

raw email로 User를 찾지 않는다.

---

# 92. Complaint / Suppression

Terminal complaint/suppression:

```text
UserEmail.delivery_state = SUPPRESSED
```

Preference를 자동 OFF로 할지 여부는 product policy.

Effective eligibility는 false.

Audit/operational event 남김.

---

# 93. Auth Adapter Boundary

interface concept:

```text
AuthProvider
- createAuthorizationRequest
- exchangeAuthorizationCode
- fetchIdentity
```

Infrastructure:

```text
KakaoAuthProvider
```

Application은 provider SDK response shape를 직접 다루지 않는다.

---

# 94. Email Adapter Boundary

`05`에서 정의:

```text
EmailSender
```

Identity module은 EmailSender를 호출하지 않는다.

Notification Delivery worker만 호출.

---

# 95. User Repository Boundary

Identity application service만:

- User
- AuthIdentity
- Profile
- Email
- Consent
- Preference

write ownership.

Follow service는 User status를 읽지만 Profile을 수정하지 않는다.

Notification service는 Identity state를 읽지만 Consent/Preference를 수정하지 않는다.

---

# 96. Follow Repository Boundary

Follow Service만 Follow/Follows Episode state transition 소유.

Admin/Notification/Identity가 직접 Follow row update하지 않는다.

User deletion은 Identity application orchestration이 Follow service command를 transactionally 호출/구성할 수 있다.

Modular monolith이므로 동일 DB transaction coordination 가능.

---

# 97. Cross-module Orchestration

Signup Follow completion:

```text
Identity Application Service
→ Follow Application Service
```

또는 application-level orchestrator가 동일 transaction context를 전달.

Domain module끼리 repository 직접 호출하지 않는다.

---

# 98. Deleted User Historical References

삭제 후:

```text
NotificationDelivery.user_id
Follow.user_id
Audit opaque user ref
```

가 남아도 public/API에서 User PII를 재구성할 수 없어야 한다.

Deleted User 조회는 최소 상태/timestamp만 반환.

---

# 99. Data Export / Access

사용자 데이터 다운로드 기능은 MVP Non-Scope.

하지만 data ownership이 분리되어 있으므로 향후:

- profile
- follows
- consent
- notification history

를 canonical User ID로 조회 가능.

---

# 100. Account Merge

MVP Non-Scope.

다른 provider 추가 후 동일 person merge는 별도 architecture.

현재 email 일치로 merge 금지.

---

# 101. Multiple Children

MVP Non-Scope.

현재:

```text
child_birth_year
```

하나의 Profile 속성.

향후 Family/Child entity가 필요해져도 User/Follow identity를 깨뜨리지 않도록 별도 확장.

---

# 102. Multi-channel Notification

MVP:

```text
EMAIL
```

Future:

```text
PUSH
KAKAO_MESSAGE
```

가능하지만 Follow/Consent/Preference/Delivery model을 재설계하지 않도록 channel abstraction 유지.

지금 실제 adapter 구현하지 않는다.

---

# 103. Identity/Follow/Notification Failure Matrix

| Failure | Safe Result |
|---|---|
| OAuth cancelled | no Follow, public access unaffected |
| state invalid | auth rejected |
| duplicate callback | one User/Follow |
| onboarding abandoned | User PENDING, no active Follow unless policy completed |
| required consent missing | User not ACTIVE |
| Email missing | Follow possible, Email unavailable |
| Email bounced | Follow stays, delivery off |
| duplicate Follow click | one active Follow |
| Unfollow during delivery queue | send-time suppress |
| Preference OFF during queue | send-time suppress |
| User delete during queue | send-time suppress |
| provider timeout | Attempt reconciliation/retry policy |
| legacy subscriber same email | no auto merge |

---

# 104. Acceptance Scenarios

## Scenario 1 — Anonymous Follow

```text
Institution page
→ Follow
→ Kakao
→ new User
→ required consent
→ Follow ACTIVE
→ My Preppy
```

PASS:
one User, one Follow, one open Episode.

## Scenario 2 — Existing User Follow

PASS:
no signup flow, direct idempotent Follow.

## Scenario 3 — OAuth Callback Retry

PASS:
no duplicate User/AuthIdentity/Follow.

## Scenario 4 — Kakao Email Missing

PASS:
User/Follow possible; Email updates disabled until Email added.

## Scenario 5 — User Skips Optional Profile

PASS:
Follow completion unaffected.

## Scenario 6 — Email OFF

PASS:
Follow remains Monitoring; no future Email send.

## Scenario 7 — Unfollow One Institution

PASS:
other Follows unaffected; global Email setting unchanged.

## Scenario 8 — Re-follow

PASS:
same logical Follow, new Episode.

## Scenario 9 — Old Signal Before Follow

PASS:
no retroactive Email.

## Scenario 10 — Consent Revoked

PASS:
Email disabled/suppressed, Follow remains.

## Scenario 11 — Hard Bounce

PASS:
Email unusable, Follow remains, My Preppy shows attention.

## Scenario 12 — User Deletes Account

PASS:
session denied, PII removed, Follow closed, pending send suppressed, opaque history retained.

## Scenario 13 — Article Follow CTA

PASS:
structured Institution relation determines Follow target.

## Scenario 14 — Opportunity Follow CTA

PASS:
Follow Institution, not Opportunity.

## Scenario 15 — Legacy Subscriber Same Email

PASS:
no silent account merge.

---

# 105. Architecture Decisions Locked

## IFN-001
Canonical User identity is independent of Kakao subject and Email.

## IFN-002
Kakao is MVP Auth provider, not User PK.

## IFN-003
Long-lived provider tokens are not stored unless a future use case requires them.

## IFN-004
MVP session uses secure HttpOnly application session; no Redis/session microservice required.

## IFN-005
Anonymous public content remains accessible; Follow is the primary login-gated action.

## IFN-006
Anonymous Follow click creates short-lived PendingFollowIntent, not Follow.

## IFN-007
PendingFollowIntent is ephemeral infrastructure/application state, not a permanent domain table.

## IFN-008
Required Terms/Privacy consent is needed for User ACTIVE state.

## IFN-009
Service Email consent/preference is not required for account activation.

## IFN-010
Email can be absent while User/Follow remain valid.

## IFN-011
Profile enrichment is optional and must not block core Follow activation.

## IFN-012
ConsentDecision and NotificationPreference remain separate.

## IFN-013
Follow and Email Preference remain separate.

## IFN-014
Follow target is always Institution in MVP.

## IFN-015
Follow current state uses logical Follow; reactivation history uses FollowEpisode.

## IFN-016
Unfollow does not disable global Email Preference.

## IFN-017
Email OFF does not deactivate Follow.

## IFN-018
Signal-time eligibility uses FollowEpisode; send-time eligibility uses current state.

## IFN-019
No retroactive Email is generated for signals before Follow activation.

## IFN-020
Provider send is suppressed if User/Follow/Email/Consent/Preference is ineligible immediately before send.

## IFN-021
My Preppy is private/noindex and uses current canonical User/Follow state.

## IFN-022
Raw email/provider subject is not sent to analytics.

## IFN-023
Account deletion logically retains User anchor but physically removes/revokes PII child data.

## IFN-024
Legacy Subscriber/Subscription is never silently converted or merged into User/Follow by email match.

## IFN-025
Legacy AlertDelivery is not canonical User notification history.

## IFN-026
Email provider webhook reconciliation uses provider message ID/Attempt identity, not raw email lookup.

## IFN-027
Marketing consent must remain separate from service Monitoring Email consent.

---

# 106. Repository Validation Questions

Codex must verify:

1. current auth/session implementation reality
2. actual Kakao dependencies/config presence
3. whether secure cookie session can be implemented without new DB/session store
4. current env structure and callback route namespace
5. `users/auth_identities/user_emails/...` target schema not yet implemented
6. uniqueness/transaction patterns support callback idempotency
7. whether Follow+Episode transaction is compatible with 04A recommendations
8. whether signup + Follow can share one transaction/application orchestration
9. current app route has no auth middleware and how protected My Preppy can be implemented
10. Next 16 Cache Components/private route interaction
11. server-render public page + Follow island auth state fetch pattern
12. pending follow signed cookie feasibility/security
13. consent latest-decision query adequacy
14. Email missing state and AMP metric impact
15. User deletion child-row delete with target FKs
16. pending delivery suppression race
17. legacy Subscriber same-email auto-link is avoidable
18. analytics canonical ID without PII feasible
19. whether separate auth session table becomes necessary due to repo/deployment constraints
20. architecture can remain provider-neutral after Kakao adapter

---

# 107. Definition of Done

Identity/Follow/Notification Architecture is complete when:

1. User/AuthIdentity/Email are distinct.
2. OAuth callback idempotency is defined.
3. Pending Follow Intent lifecycle is defined.
4. signup activation requirements are explicit.
5. optional profile does not block Follow.
6. Consent and Preference are distinct.
7. Follow and Email are distinct.
8. Follow activate/deactivate/reactivate is defined.
9. signal-time and send-time eligibility are defined.
10. My Preppy status semantics are defined.
11. Email missing/bounce/suppression states are safe.
12. User deletion/PII cleanup path is defined.
13. legacy Subscriber/Alert models cannot contaminate canonical model.
14. private/public caching boundary is preserved.
15. analytics contains no provider/email PII.

---

# 108. Next Step

Repository validation output:

```text
07A_IDENTITY_FOLLOW_NOTIFICATION_REPOSITORY_VALIDATION.md
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
08_ANALYTICS_ARCHITECTURE.md
```

then:

```text
09_ADMIN_OPERATIONS_ARCHITECTURE.md
10_PRD.md
```
