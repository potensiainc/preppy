# 05_MONITORING_ARCHITECTURE.md

> **Project:** PREPPY (프레피)  
> **Document Type:** Monitoring Architecture  
> **Status:** Monitoring Architecture v1.0 — Repository validation required before implementation  
> **Product Baseline:** `00_PRODUCT_REQUIREMENTS_BASELINE.md`  
> **Target Architecture:** `02_TARGET_ARCHITECTURE.md` Target v1.1  
> **Domain Model:** `03_DOMAIN_MODEL.md` Domain v1.0  
> **Data Model:** `04_DATA_MODEL.md` Data Model v1.0  
> **Data Model Validation:** `04A_DATA_MODEL_REPOSITORY_VALIDATION.md` — VALID_WITH_IMPLEMENTATION_ADJUSTMENTS  
> **Core Principle:** Manual-first Monitoring, verified truth before notification, external side effects after commit  
> **Purpose:** PREPPY의 Follow → Monitor → Update → Return 핵심 제품 루프를 실제 운영 가능한 Monitoring Architecture로 정의한다. MVP에서는 사람이 공식 Source를 확인하고 검증하지만, 향후 crawler/collector가 들어와도 동일한 canonical verification/change/notification pipeline을 사용하도록 경계를 고정한다.

---

# 0. Document Role

이 문서는 PREPPY의 핵심 차별화 기능인 Monitoring을 설계한다.

다음 질문에 답한다.

1. 무엇을 Monitoring하는가?
2. 어떤 Source를 얼마나 자주 확인하는가?
3. 사람이 확인한 정보가 어떻게 verified truth가 되는가?
4. Legacy-backed Opportunity와 Native Opportunity를 어떻게 같은 Product Flow로 처리하는가?
5. 어떤 변경을 `OpportunityChange`로 만들고 어떤 변경을 Notification 대상으로 삼는가?
6. Follow User를 어떤 시점 규칙으로 recipient로 결정하는가?
7. DB transaction과 Email send를 어떻게 분리하는가?
8. 중복, retry, worker crash, stale lock을 어떻게 처리하는가?
9. Admin 운영자가 어떤 queue와 상태를 보게 되는가?
10. 향후 automated collector를 어디에 삽입하는가?

이 문서에서 하지 않는 것:

- 실제 crawler 구현
- HTML parser 구현
- LLM extraction 구현
- Kakao OAuth 상세
- Email provider 선택
- Admin UI 상세 wireframe
- 실제 migration SQL
- actual TypeScript code
- 법률/개인정보 정책 확정

---

# 1. Monitoring Product Contract

PREPPY에서 Follow의 의미는:

> 사용자가 관심 Institution의 중요한 입학정보를 직접 반복 확인하는 일을 PREPPY에 맡긴다.

Monitoring은 다음을 의미한다.

```text
Institution Follow
→ Monitorable Source 등록
→ Source 확인
→ 정보 검증
→ verified truth 갱신
→ 의미 있는 변경 판정
→ Notification 대상 계산
→ Email 전달
→ User Return
```

Monitoring이 의미하지 않는 것:

- 모든 Source를 실시간 감시
- 모든 사소한 변경을 Email 발송
- crawler가 반드시 존재
- 입학 성공/합격 보장
- 비공식 커뮤니티 정보를 공식 truth로 승격
- 현재 정보가 없다는 이유로 추측 데이터 생성

---

# 2. Monitoring Architecture Overview

```text
                 ┌─────────────────────┐
                 │ Institution /       │
                 │ Opportunity         │
                 └─────────┬───────────┘
                           │
                           ▼
                 ┌─────────────────────┐
                 │ Source Bindings     │
                 └─────────┬───────────┘
                           │
                schedule / manual queue
                           │
                           ▼
                 ┌─────────────────────┐
                 │ Monitoring Planner  │
                 └─────────┬───────────┘
                           │
                           ▼
      ┌─────────────────────────────────────────┐
      │ Source Check                            │
      │ MVP: Admin Manual                       │
      │ Future: HTTP / Browser / PDF Collector  │
      └───────────────────┬─────────────────────┘
                          │
                          ▼
                 ┌─────────────────────┐
                 │ Observation/Input   │
                 └─────────┬───────────┘
                           │
                           ▼
                 ┌─────────────────────┐
                 │ Verification        │
                 │ Application Service │
                 └─────────┬───────────┘
                           │
                 ┌─────────┴──────────┐
                 │                    │
                 ▼                    ▼
        Legacy-backed          Native Opportunity
        AdmissionEvent          OpportunityVersion
        / Version               / Evidence
                 │                    │
                 └─────────┬──────────┘
                           ▼
                 ┌─────────────────────┐
                 │ OpportunityChange   │
                 │ canonical signal    │
                 └─────────┬───────────┘
                           │
                           ▼
                 ┌─────────────────────┐
                 │ Outbox              │
                 └─────────┬───────────┘
                           │
                           ▼
                 ┌─────────────────────┐
                 │ Notification Worker │
                 └─────────┬───────────┘
                           │
                           ▼
                 Follow / User / Consent /
                 Preference / Email eligibility
                           │
                           ▼
                 NotificationDelivery
                           │
                           ▼
                        Email
                           │
                           ▼
                         Return
```

---

# 3. Monitoring Unit

Monitoring의 기본 단위는 `Institution`이 아니라 **Source Binding**이다.

사용자가 Follow하는 대상:

```text
Institution
```

운영자가 실제로 확인하는 대상:

```text
Source
```

왜냐하면 한 Institution은 여러 공식 Source를 가질 수 있기 때문이다.

예:

```text
Institution
├─ 공식 홈페이지
├─ Admissions 페이지
├─ 모집 공지 게시판
├─ 신청 페이지
└─ 공식 SNS
```

따라서:

```text
Follow target = Institution
Monitoring target = Source Binding
Change target = Opportunity / InstitutionFact
Notification target = User
```

을 분리한다.

---

# 4. Monitorable Source Roles

MVP에서 Source Binding role은 최소 다음을 사용한다.

## Institution-level

```text
OFFICIAL_MAIN
ADMISSIONS
TUITION
CURRICULUM
APPLICATION
OTHER
```

## Opportunity-level

```text
PRIMARY_NOTICE
APPLICATION
DETAILS
SUPPORTING
OTHER
```

하나의 Source가 여러 Institution/Opportunity에 bind될 수 있다.

Monitoring Planner는 활성 Source Binding만 대상으로 한다.

---

# 5. Source Authority Policy

Source Authority 우선순위:

```text
OFFICIAL_PRIMARY
OFFICIAL_SECONDARY
TRUSTED_REFERENCE
UNVERIFIED_REFERENCE
```

MVP public verified truth의 기본 근거는:

```text
OFFICIAL_PRIMARY
or
OFFICIAL_SECONDARY
```

이다.

`TRUSTED_REFERENCE`는 보조 evidence로 사용할 수 있지만 핵심 Admission Opportunity를 단독으로 VERIFIED/PUBLISHED하는 기본 근거로 사용하지 않는다.

커뮤니티/블로그/맘카페 정보는:

- 발견 Signal
- 운영자 확인 필요 후보

로 사용할 수 있으나 공식 Source 확인 없이 public truth로 승격하지 않는다.

---

# 6. Monitoring Priority Model

모든 Source를 같은 빈도로 확인하지 않는다.

Monitoring 비용은 Source 중요도와 Opportunity 상태에 따라 다르게 배분한다.

---

# 6.1 Priority Levels

```text
P0_ACTIVE
P1_UPCOMING
P2_WATCH
P3_DORMANT
```

## P0_ACTIVE

현재 사용자가 행동 가능한 모집/지원/상담/레벨테스트가 진행 중.

예:

- 모집 중
- Application open
- 추가모집
- 상담 신청 가능
- Open House 신청 중
- 원서접수 기간

기본 cadence:

```text
DAILY
```

필요시 Admin이 더 자주 manual check 가능.

MVP Scheduler 최소 frequency는 1일이면 충분하다.

## P1_UPCOMING

다가오는 행사/지원 기간이 이미 알려져 있음.

예:

- 설명회 예정
- Application open 예정
- Assessment 예정

기본 cadence:

```text
EVERY_2_TO_3_DAYS
```

## P2_WATCH

현재 공개 Opportunity는 없으나 모집/입학 정보가 언제든 올라올 수 있음.

기본 cadence:

```text
WEEKLY
```

## P3_DORMANT

장기 비활성, archived, closed, monitoring 제외 대상.

기본:

```text
NO_AUTOMATIC_CHECK
```

---

# 6.2 Priority Derivation

Priority는 다음 신호를 사용한다.

```text
Institution operational state
Opportunity business state
Opportunity relevant dates
Source role
Institution Follow count
Admin override
```

MVP에서는 복잡한 점수 모델을 만들지 않는다.

단순 deterministic rule로 계산한다.

예:

```text
IF Institution CLOSED/ARCHIVED
  → P3

ELSE IF any published Opportunity state = OPEN
  → P0

ELSE IF upcoming Opportunity within defined window
  → P1

ELSE
  → P2
```

Follow count를 cadence에 반영할 수 있지만 MVP에서 필수는 아니다.

---

# 7. Monitoring Schedule Model

Monitoring Planner는 다음 logical output을 만든다.

```text
MonitoringTask
- source_id
- binding context
- priority
- due_at
- reason
```

MVP에서 별도 `monitoring_tasks` persistence table을 반드시 만들 필요는 없다.

기존 `source_monitor_configs` + latest observation + current Opportunity state를 바탕으로 Admin queue query를 생성할 수 있다.

별도 persistent task table은 다음이 실제로 필요해진 후 검토한다.

- 수백/수천 Source
- distributed worker
- retries
- SLA tracking

MVP에서는 query-driven queue를 우선한다.

---

# 8. Manual-first Monitoring

MVP의 canonical monitoring flow:

```text
Admin Monitoring Queue
→ Official Source open
→ 내용 확인
→ PREPPY Admin에 변경 입력
→ Evidence/Source 선택
→ Verify
```

중요:

Admin이 단순 DB field editor를 사용해서는 안 된다.

Admin은 반드시 Domain/Application Command를 사용한다.

예:

```text
VerifyNativeOpportunity
VerifyLegacyOpportunity
VerifyInstitutionFact
MarkSourceChecked
PublishOpportunity
```

---

# 9. Manual Source Check

운영자가 Source를 확인하면 최소 다음 중 하나를 기록한다.

```text
NO_CHANGE
CHANGE_FOUND
SOURCE_UNAVAILABLE
SOURCE_MOVED
UNKNOWN
```

기존 Repository의 `source_observations` outcome vocabulary가 유사하게 존재한다면 그 vocabulary를 재사용하거나 mapping한다.

MVP에서는 모든 manual check에 snapshot을 강제하지 않는다.

다만 최소:

```text
source_id
checked_at
admin actor
outcome
```

은 추적 가능해야 한다.

Repository 기존 Observation model이 actor를 직접 갖지 않는다면:

- audit_logs
- verification command metadata

로 보완한다.

---

# 10. Manual Provenance Rule

Admin manual verification도 first-class provenance다.

금지:

```text
Admin edits date
→ opportunity updated_at only
```

필수 흐름:

```text
Admin verifies
→ official Source identified
→ current/next Version
→ Evidence
→ verified_at / verified_by
→ optional Change
→ audit
```

Observation/Snapshot은 optional.

Source는 필수.

---

# 11. Verification Application Services

Monitoring Architecture의 핵심은 Verification Service다.

MVP에서 다음 command를 분리한다.

```text
VerifyNativeOpportunity
VerifyLegacyBackedOpportunity
VerifyInstitutionFact
ConfirmNoChange
MarkSourceUnavailable
```

두 Opportunity command는 persistence가 다르지만 결과 contract는 같아야 한다.

---

# 12. Canonical Verification Result

모든 verification command는 논리적으로 다음 결과를 만든다.

```text
VerificationResult
- target_id
- previous_state
- current_state
- verified_at
- evidence
- changed: boolean
- change_type?
- materiality?
- canonical_signal?
```

UI/Notification은 legacy/native storage path를 알지 않는다.

---

# 13. Native Opportunity Verification

Canonical transaction:

```text
BEGIN

1. lock Opportunity/current Version
2. validate truth_mode = NATIVE
3. validate Source binding/evidence
4. compare input against current verified state
5. IF no meaningful data change:
      optional record check/observation
      keep current Version
      update no business truth
   ELSE:
      supersede previous current
      insert new OpportunityVersion
      insert Evidence
      create OpportunityChange if material
      write Audit
      create Outbox event

COMMIT
```

### Important

Source를 단순히 다시 확인했지만 값이 같다면 새 Version을 무조건 생성하지 않는다.

즉:

```text
Verification Check ≠ Version Creation
```

변경 없는 check는 Observation/Audit로 남긴다.

---

# 14. Legacy-backed Opportunity Verification

Legacy-backed flow는 기존 AdmissionRadar history engine을 보존한다.

```text
BEGIN

1. lock AdmissionEvent/current EventVersion
2. validate Opportunity↔Event bridge consistency
3. create/supersede AdmissionEventVersion using legacy invariant
4. attach legacy Event Evidence
5. existing MeaningfulChange when appropriate
6. normalize to canonical OpportunityChange
7. write Audit
8. create canonical Outbox event

COMMIT
```

Important:

Notification은 legacy Alert creation을 기다리지 않는다.

새 PREPPY canonical flow는:

```text
OpportunityChange
→ Notification
```

을 사용한다.

Legacy Alert/AlertDelivery는 신규 PREPPY write path가 아니다.

---

# 15. Legacy and Native Convergence

두 persistence path는 반드시 여기서 수렴한다.

```text
Legacy Admission Event Change
         │
         ▼
Canonical OpportunityChange
         ▲
         │
Native Opportunity Version Change
```

이후 consumer:

```text
Notification
Analytics
My Preppy recent changes
Admin recent changes
Cache revalidation
```

는 persistence origin을 알 필요가 없다.

---

# 16. Institution Fact Verification

Institution Fact는 Monitoring 대상이지만 MVP Notification의 기본 trigger는 아니다.

Flow:

```text
Source Check
→ VerifyInstitutionFact
→ new FactVersion if changed
→ Evidence
→ Audit
```

기본 P0 Fact:

```text
TUITION
TARGET_AGE_GRADE
CURRICULUM
ELIGIBILITY
TRANSPORT
ADMISSION_PROCESS
OPERATING_INFO
```

Notification은 MVP에서 Opportunity 중심으로 제한한다.

예:

학비가 바뀌었다고 Follow User에게 즉시 Email을 보내지 않는다.

향후 Product Validation 이후 별도 notification policy를 추가한다.

---

# 17. Change Detection Semantics

모든 field change가 `OpportunityChange`가 아니다.

예:

```text
summary punctuation change
→ no OpportunityChange

application deadline changed
→ OpportunityChange

title spacing corrected
→ no Notification

OPEN → CLOSED
→ OpportunityChange
```

---

# 18. Canonical Change Types

```text
NEW_OPPORTUNITY
DATE_CHANGED
DEADLINE_CHANGED
STATUS_CHANGED
APPLICATION_OPENED
APPLICATION_CLOSED
CANCELLED
MATERIAL_INFO_CHANGED
```

---

# 19. Materiality Policy

MVP:

```text
NOTIFIABLE
NON_NOTIFIABLE
```

## NOTIFIABLE examples

- 신규 모집/지원 기회 공개
- 신청 시작
- 원서접수/모집 마감 변경
- 설명회 날짜 변경
- Open House 일정 변경
- Assessment/Interview 일정 변경
- 취소
- OPEN/CLOSED 변화

## NON_NOTIFIABLE examples

- typo
- wording refinement
- URL tracking parameter 변경
- 설명문 일부 편집
- 내부 Admin metadata 수정

Materiality는 verification command에서 policy function으로 판단한다.

Admin은 필요하면 override할 수 있다.

override는 audit에 남긴다.

---

# 20. New Opportunity Notification Rule

새 Opportunity가 처음 VERIFIED/PUBLISHED되는 경우:

```text
OpportunityPublished
```

signal을 만든다.

조건:

- publication_state = PUBLISHED
- current verified truth 존재
- official evidence 존재
- signal_published_at 존재

기존 과거 Opportunity를 migration/backfill하면서 모든 Follow User에게 신규 알림을 보내면 안 된다.

따라서 migration/backfill에서는:

```text
notification_eligible = false
```

에 준하는 import semantics를 사용한다.

정확한 flag 물리 설계는 implementation spec에서 결정한다.

---

# 21. Backfill Silence Rule

Canonical migration/backfill은 Product signal을 발생시키지 않는다.

예:

```text
legacy AdmissionEvent 100개
→ Opportunity backfill
```

을 했다고:

```text
100개 OpportunityPublished
→ emails
```

이 발생해서는 안 된다.

원칙:

> Migration creates canonical historical state, not user-facing product events.

Backfill command와 live product command를 분리한다.

---

# 22. Notification Triggering

Notification candidate:

```text
OpportunityPublished
or
OpportunityChange.materiality = NOTIFIABLE
```

Canonical Notification creation은 idempotent해야 한다.

```text
signal + policy_version
→ dedupe_key
```

---

# 23. Notification Policy Versioning

Notification 정책이 바뀔 수 있으므로 Notification에:

```text
policy_version
```

을 저장한다.

MVP:

```text
opportunity-notification-v1
```

정도로 시작 가능.

정책 version은 사용자-facing app version이 아니다.

---

# 24. Recipient Resolution

Notification은 생성 시점에 모든 User를 payload에 박지 않는다.

Worker/Application Service가 canonical follower state를 조회해 Delivery를 생성한다.

Eligibility:

```text
User.status = ACTIVE

AND Follow.status = ACTIVE

AND Follow/FollowEpisode indicates
    user was following at signal_published_at

AND current Email usable

AND SERVICE_EMAIL_UPDATES effective GRANTED

AND EMAIL preference = ENABLED
```

---

# 25. Follow Time Semantics

가장 중요한 규칙:

```text
Follow activated AFTER signal
→ no retroactive Email
```

예:

```text
8/20 10:00 OpportunityChange
8/20 14:00 User Follow

=> Delivery 없음
```

My Preppy에서는 그 변경을 보여줄 수 있다.

---

# 26. Follow Reactivation Semantics

예:

```text
8/1 Follow
8/10 Unfollow
8/20 Re-follow
```

signal:

```text
8/15 change
```

→ Email 없음.

```text
8/21 change
```

→ Email 대상.

정확한 과거 eligibility는 `follow_episodes` interval로 재현한다.

---

# 27. Send-time Revalidation

Delivery 생성 이후 User state가 바뀔 수 있다.

따라서 Email provider 호출 직전에 다시 확인한다.

```text
User ACTIVE?
Follow still ACTIVE?
Email usable?
Consent still granted?
Preference enabled?
```

하나라도 false:

```text
Delivery = SUPPRESSED
```

Email provider 호출하지 않는다.

---

# 28. Delivery Pipeline

```text
Notification
   ↓
Recipient Resolver
   ↓
NotificationDelivery(PENDING)
   ↓
Outbox Event
   ↓
Worker Claim
   ↓
Send-time Eligibility Recheck
   ↓
DeliveryAttempt
   ↓
Email Provider
   ↓
Delivery status update
```

---

# 29. Outbox Event Types

MVP에서 최소:

```text
NOTIFICATION_RECIPIENT_RESOLUTION_REQUESTED
NOTIFICATION_DELIVERY_REQUESTED
```

구현 단순화를 위해 하나로 줄일 수도 있다.

권장:

### Stage 1

```text
Opportunity signal
→ Notification created
→ RECIPIENT_RESOLUTION outbox
```

### Stage 2

Resolver:

```text
eligible Users
→ Delivery rows
→ DELIVERY_REQUESTED outbox rows
```

이렇게 하면 recipient resolution과 provider send를 분리할 수 있다.

MVP 규모가 작다면 한 Worker process에서 둘 다 처리해도 된다.

---

# 30. Outbox Hardening Requirements

Data Model Validation 결과를 반영한다.

기존 `outbox_events`를 유지한다.

필요 보강:

```text
dedupe_key
max_attempts
locked_at
locked_by
last_error_code
last_error_at
dead_lettered_at
```

Status:

기존 vocabulary를 최대한 유지하면서:

```text
PENDING
PROCESSING
PROCESSED
FAILED
CANCELLED
DEAD_LETTER
```

를 지원한다.

---

# 31. Worker Claim Algorithm

권장 PostgreSQL pattern:

```text
BEGIN

SELECT candidate
FOR UPDATE SKIP LOCKED

mark PROCESSING
locked_at = now
locked_by = worker_id
attempt_count += 1

COMMIT
```

그 후 external side effect 수행.

중요:

provider call 동안 DB transaction을 오래 열어두지 않는다.

---

# 32. Worker Completion

성공:

```text
mark event PROCESSED
processed_at
clear lock metadata
```

실패:

retryable:

```text
status = PENDING or FAILED-retryable convention
available_at = backoff time
last_error
```

terminal/max attempts:

```text
status = DEAD_LETTER
dead_lettered_at
```

기존 Repository status vocabulary와 충돌하지 않게 exact representation은 implementation에서 조정한다.

---

# 33. Lease Recovery

Worker가 crash하면:

```text
status = PROCESSING
locked_at old
```

row가 남을 수 있다.

Scheduler/worker는:

```text
locked_at < now - lease_timeout
```

인 stale row를 재claim 가능하게 한다.

정확한 timeout:

```text
configuration
```

으로 관리한다.

---

# 34. Delivery Idempotency

logical uniqueness:

```text
UNIQUE(notification_id, user_id, channel)
```

retry는 Delivery를 새로 만드는 것이 아니라:

```text
NotificationDeliveryAttempt
```

를 추가한다.

---

# 35. Provider Idempotency

Email provider가 idempotency key를 지원하면:

```text
delivery_id
```

또는 deterministic send key를 사용한다.

지원하지 않아도 DB logical uniqueness + attempt policy로 중복 확률을 최소화한다.

provider timeout 후 실제로 accepted 되었는지 알 수 없는 경우:

- provider message lookup
- deterministic provider metadata

를 활용한다.

---

# 36. Email Provider Boundary

Domain/Application code는 provider SDK를 직접 사용하지 않는다.

interface:

```text
EmailSender
- send(message, idempotencyContext)
```

Infrastructure adapter:

```text
Resend / SES / Postmark / etc.
```

실제 provider는 이후 결정한다.

Domain은:

```text
EMAIL
```

channel만 안다.

---

# 37. Email Content Contract

MVP Email에는 최소:

- Institution name
- Opportunity title
- 무엇이 변경되었는지
- 중요한 날짜/상태
- Last Verified 의미
- PREPPY deep link
- Email update preference/unsubscribe 진입점

이 포함되어야 한다.

Email은 Source of Truth가 아니다.

항상 PREPPY canonical Opportunity detail로 deep link한다.

---

# 38. Open / Click Tracking

가능한 경우 provider webhook을 사용한다.

```text
NotificationDeliveryOpened
NotificationDeliveryClicked
```

를 기록한다.

하지만:

- privacy protection
- email client image blocking
- Apple Mail Privacy Protection

등으로 open rate는 완벽한 truth가 아니다.

MVP KPI에는 사용하되 product operational truth로 사용하지 않는다.

---

# 39. Monitoring Queue — Admin

Admin 핵심 화면:

```text
Monitoring Queue
```

각 item:

```text
Institution
Source
Source role
Priority
Last checked
Next due
Current Opportunity state
Follow count(optional)
Reason
```

Actions:

```text
Open Source
No Change
Update Opportunity
Create Opportunity
Update Fact
Source Unavailable
Change Source URL
```

---

# 40. Admin Verification UX Contract

Admin이 Opportunity 변경을 입력할 때:

```text
Previous Verified State
vs
Proposed State
```

diff를 보여주는 것이 좋다.

예:

```text
Application Close
2026-09-20
→
2026-09-23
```

그리고:

```text
Source
Evidence
Change Type
Materiality
Notify Followers?
```

를 확인한다.

MVP에서 `Notify Followers?`는 policy default를 보여주고 Admin override를 허용할 수 있다.

override는 audit 기록.

---

# 41. No-change Check

Source 확인 결과 변경 없음:

```text
ConfirmNoChange
```

이 command는:

- Observation/Audit 기록
- Source last checked projection 갱신 가능

하지만:

- new OpportunityVersion 생성하지 않음
- OpportunityChange 생성하지 않음
- Notification 생성하지 않음

---

# 42. Source Unavailable

```text
SOURCE_UNAVAILABLE
```

은 Opportunity를 자동으로 CANCELLED/CLOSED로 바꾸지 않는다.

한 번 Source 접근이 실패했다고:

```text
truth changed
```

로 해석하지 않는다.

Source health와 Product truth를 분리한다.

---

# 43. Source Moved

공식 URL 변경이 확인된 경우:

```text
old Source inactive/broken
new Source create/bind
```

과거 Evidence는 기존 Source identity를 계속 참조한다.

Source를 in-place URL rewrite해서 historical provenance를 혼란스럽게 하지 않는 것을 우선한다.

URL canonicalization 정책에 따라 동일 Source의 URL correction으로 볼 수 있는 경우만 수정한다.

---

# 44. Source Health

Source operational health:

```text
HEALTHY
DEGRADED
UNAVAILABLE
MOVED
UNKNOWN
```

기존 `sources.lifecycle` / observation outcome을 활용해 projection할 수 있다.

MVP에서 신규 health table은 만들지 않는다.

---

# 45. Monitoring Coverage

My Preppy에서 `Monitoring 중`이라고 표시하려면 최소:

```text
Institution PUBLISHED
AND Follow ACTIVE
AND ≥1 active official Source binding
AND Institution not CLOSED/ARCHIVED
```

가 필요하다.

Email preference가 OFF여도:

```text
Monitoring relation
```

은 유지될 수 있다.

단 UI는:

```text
Monitoring 중
Email 업데이트 OFF
```

처럼 구분한다.

---

# 46. Monitoring Status Projection

User-facing:

```text
MONITORING
EMAIL_OFF
SOURCE_ATTENTION_REQUIRED
ARCHIVED
```

등의 projection을 만들 수 있다.

이것을 core enum table로 지금 만들 필요는 없다.

Application query에서 계산한다.

---

# 47. Freshness Policy

모든 정보가 같은 freshness SLA를 갖지 않는다.

## Opportunity

가장 높은 freshness.

P0/P1 cadence.

## Institution Facts

변화 빈도가 낮다.

기본:

```text
monthly / seasonally / when source changes
```

MVP에서는 Admin 운영계획에 따라 수동 확인.

## Article

verification source와 다르다.

Article updated_at은 editorial modification time.

Opportunity Last Verified와 혼동하지 않는다.

---

# 48. Monitoring SLA

MVP에서 사용자에게 법적/계약 SLA를 약속하지 않는다.

내부 운영 목표만 둔다.

예:

### P0_ACTIVE

```text
daily source check
verified material change → same day publish target
```

### P1_UPCOMING

```text
2–3 day check
```

### P2_WATCH

```text
weekly
```

초기 20~45개 기관 수준에서 사람이 운영 가능한 목표다.

---

# 49. Monitoring Operations Capacity

초기 Coverage:

- 영유 20~30
- 국제학교 10~15
- 사립초 주요 학교

모든 Institution에 Source가 여러 개면 Source 수는 기관 수보다 많다.

따라서 Admin Dashboard는 기관 개수보다:

```text
Due Source Checks
Overdue Checks
P0 Active Sources
Verified Changes
Failed Sources
```

를 운영 핵심으로 본다.

---

# 50. Monitoring KPI

Product KPI:

```text
Active Monitoring Parents
Notification open/click
Return after notification
```

Operational KPI:

```text
Due checks completed %
Overdue Source count
P0 source freshness
Verified change → publish latency
Notification creation latency
Email send success/failure
Duplicate send count
Dead-letter count
```

---

# 51. Monitoring Failure Classes

## F1 — Source Check Failure

예:

- timeout
- 403
- 404
- login required
- moved page

처리:

```text
Observation failure
Source health update
No truth mutation
```

## F2 — Verification Conflict

Admin input과 existing verified state가 비정상 충돌.

처리:

```text
rollback
manual review
```

## F3 — Outbox Failure

DB event pending.

처리:

retry.

## F4 — Recipient Resolution Failure

query/application error.

처리:

retryable outbox.

## F5 — Email Provider Failure

DeliveryAttempt failure.

retryable/terminal 분류.

## F6 — Webhook Failure

provider status update 누락.

Email send 자체에는 영향 없음.

---

# 52. Error Safety Principle

Monitoring 시스템은 실패 시:

> 틀린 정보를 자신 있게 알리는 것보다 업데이트가 늦는 편이 낫다.

따라서:

- verification 없는 auto publish 금지
- source failure로 truth 자동 변경 금지
- ambiguous diff로 notification 자동 발송 금지
- retry 시 duplicate send 금지

를 기본값으로 한다.

---

# 53. Future Collector Insertion Point

향후 automation:

```text
HTTP fetch
Browser automation
PDF fetch
RSS/API
```

는 다음까지만 자동화할 수 있다.

```text
Source
→ Observation
→ Snapshot
→ Candidate Change
```

그 다음:

```text
Verification
```

은 초기에는 Admin이 수행한다.

---

# 54. Future Extraction Layer

향후 parser/LLM이 있다면:

```text
Snapshot
→ CandidateExtraction
→ ProposedOpportunityState
```

를 만들 수 있다.

하지만 ProposedState는 canonical truth가 아니다.

```text
Proposed
→ Verify
→ Canonical Version
```

을 유지한다.

---

# 55. Automation Levels

## Level 0 — MVP

```text
Manual Source Check
Manual Verify
Manual Publish
Automatic Notification Delivery
```

## Level 1

```text
Automatic source availability check
Manual content verification
```

## Level 2

```text
Automatic change detection
Manual semantic verification
```

## Level 3

```text
Automatic extraction proposal
Manual approve
```

## Level 4

일부 high-confidence Source에 한해:

```text
Automatic verification policy
```

를 검토할 수 있다.

MVP에서는 Level 0이 목표다.

---

# 56. Automation Gate

자동화는 다음이 실제 병목일 때 도입한다.

```text
Source checks/day
Admin verification time
overdue rate
coverage growth
false positive/negative rate
```

“확장성을 위해” crawler를 미리 구현하지 않는다.

---

# 57. Manual-first Does Not Mean Manual-only Architecture

핵심 boundary:

```text
Source Input Adapter
        ↓
Verification Service
```

Input Adapter 종류:

```text
AdminManualAdapter
FutureHttpCollector
FutureBrowserCollector
FuturePdfCollector
```

Canonical Verification Service는 동일하다.

따라서 자동화가 추가되어도:

- Opportunity
- Version
- Evidence
- OpportunityChange
- Notification

도메인은 바뀌지 않는다.

---

# 58. Read/Write Ownership

## Institution

Institution Application Service.

## Native Opportunity

Admissions Application Service.

## Legacy-backed Opportunity

Admissions compatibility service + legacy event service.

## Source

Trust Service.

## Follow

Follow Service.

## Notification

Notification Service.

## Article

Editorial Service.

Monitoring Orchestrator는 이 서비스를 직접 SQL로 우회하지 않는다.

---

# 59. Critical Transaction A — Native Verify

```text
BEGIN

lock Opportunity/current version

validate:
- Opportunity NATIVE
- Institution active enough
- Source binding valid
- input schema valid

compare

IF changed:
  supersede old
  insert new verified version
  insert evidence
  insert OpportunityChange
  audit
  insert Outbox(signal)

COMMIT
```

외부 Email 없음.

---

# 60. Critical Transaction B — Legacy Verify

```text
BEGIN

lock AdmissionEvent/current EventVersion

validate bridge

write legacy EventVersion + Evidence
write MeaningfulChange if applicable
write canonical OpportunityChange
audit
insert canonical Outbox

COMMIT
```

Legacy Alert write는 하지 않는다.

---

# 61. Critical Transaction C — Notification Creation

```text
BEGIN

consume canonical signal
derive policy
insert Notification ON CONFLICT dedupe
insert RecipientResolution outbox ON CONFLICT dedupe

COMMIT
```

---

# 62. Critical Transaction D — Recipient Resolution

```text
BEGIN

lock/claim resolution outbox

query eligible users

for each:
  INSERT NotificationDelivery
  ON CONFLICT DO NOTHING

  INSERT delivery outbox
  ON CONFLICT DO NOTHING

mark resolution event processed

COMMIT
```

MVP 사용자 수가 작으므로 batch size는 단순하게 시작한다.

---

# 63. Critical Transaction E — Delivery Send

DB transaction을 provider call 동안 유지하지 않는다.

### Claim

```text
claim delivery outbox
```

### Recheck

```text
eligibility
```

### If suppressed

```text
mark Delivery SUPPRESSED
mark outbox processed
```

### If eligible

```text
create Attempt STARTED
commit
```

external send.

이후:

```text
update Attempt
update Delivery
mark Outbox processed/retry
```

provider timeout edge case는 idempotency key/message lookup으로 처리한다.

---

# 64. Backpressure

MVP 규모에서는 복잡한 queue broker가 필요 없다.

PostgreSQL Outbox가 queue 역할을 한다.

batch:

```text
N rows per worker loop
```

로 제한.

Email provider rate limit이 있다면:

- `available_at`
- batch size
- retry/backoff

로 조절한다.

---

# 65. Retry Policy

일반 원칙:

```text
transient network/provider 5xx
→ retry

invalid recipient / hard bounce / invalid payload
→ terminal

business eligibility failure
→ suppress, no retry
```

exact backoff:

```text
configuration
```

MVP에서는 exponential-ish simple schedule이면 충분하다.

---

# 66. Dead Letter Operations

Admin Dashboard:

```text
Dead-letter Outbox
Failed Deliveries
```

기능:

- inspect safe error
- retry if fixed
- cancel
- link to relevant Notification/Opportunity

PII/raw provider payload 노출 금지.

---

# 67. Observability

필수 structured logs:

```text
monitoring_check
verification_command
opportunity_change
outbox_claim
notification_created
recipient_resolution
delivery_attempt
delivery_result
dead_letter
```

Log keys:

```text
institution_id
opportunity_id
source_id
notification_id
delivery_id
outbox_id
```

raw email/provider subject 없음.

---

# 68. Minimal Metrics

## Monitoring

```text
monitoring_checks_total
monitoring_checks_overdue
source_check_failures
verified_changes_total
```

## Outbox

```text
outbox_pending
outbox_processing
outbox_dead_letter
outbox_oldest_pending_age
```

## Notification

```text
notifications_created
deliveries_created
deliveries_suppressed
deliveries_sent
deliveries_failed
```

Monitoring tool stack은 launch environment 결정 후 선택한다.

---

# 69. Data Model Validation Adjustments Applied

`04A_DATA_MODEL_REPOSITORY_VALIDATION.md`에서 확인된 구현 조정을 Monitoring Architecture에 반영한다.

## 69.1 Opportunity–AdmissionEvent Consistency

Legacy verify 전에 bridge의 redundant consistency key/composite FK가 truth를 보장한다고 가정한다.

Monitoring service가 application-only mapping consistency를 유일한 방어선으로 삼지 않는다.

## 69.2 Dedicated Lineage Trigger

Native OpportunityVersion과 InstitutionFactVersion은 기존 Event/Fact pattern을 복제한 dedicated lineage trigger를 사용한다.

Verification service는 이 invariant를 전제로 동작한다.

## 69.3 Evidence Source Ownership

Evidence의 Observation/Snapshot은 Evidence Source와 동일 Source여야 한다.

DB composite FK 또는 narrow trigger로 보호한다.

## 69.4 PII Child-row Delete

User deletion 시 AuthIdentity/UserEmail/Profile/Interest를 physical child delete한다.

Monitoring/Delivery는 opaque User ID만 보존한다.

## 69.5 Outbox Staged Hardening

기존 row가 존재할 수 있으므로 Outbox hardening은:

```text
nullable add
→ deterministic legacy backfill
→ unique/check validate
→ canonical writer cutover
→ worker cutover
```

순서다.

---

# 70. Security Rules

- Source login credential 저장은 MVP Non-Scope.
- public official Source만 우선 Monitoring.
- OAuth token을 Monitoring domain에 저장하지 않는다.
- Admin verification input은 HTML/script를 직접 저장하지 않는다.
- External page content snapshot은 future collector security policy를 별도 설계.
- Error logs에 PII 없음.
- Email provider credential은 secret manager/env.

---

# 71. MVP Monitoring Non-Scope

- distributed crawler cluster
- headless browser fleet
- proxy rotation
- anti-bot bypass
- CAPTCHA automation
- LLM auto publish
- generic workflow engine
- Kafka/RabbitMQ
- Redis queue
- real-time websocket monitoring
- push notification
- Kakao message notification
- user-defined arbitrary URLs
- community monitoring
- social scraping automation
- predictive admission dates
- AI recommendation

---

# 72. Monitoring Acceptance Scenarios

## Scenario 1 — Native 영유 신규 추가모집

```text
Admin checks official website
→ new recruitment found
→ Create/Verify Native Opportunity
→ Evidence
→ Publish
→ OpportunityPublished signal
→ Notification
→ existing eligible followers
→ Email
```

PASS 조건:

- fake School/Event 없음
- one canonical signal
- duplicate email 없음

## Scenario 2 — Existing International School Deadline Change

```text
Legacy-backed Opportunity
→ official Source
→ EventVersion update
→ MeaningfulChange
→ canonical OpportunityChange(DEADLINE_CHANGED)
→ Notification
```

PASS:

Notification consumer가 EventVersion을 직접 읽지 않음.

## Scenario 3 — No Change

```text
Admin checks
→ No Change
```

PASS:

- observation/audit possible
- no Version
- no Change
- no Email

## Scenario 4 — Source Down

```text
website 500
```

PASS:

- Source check failure
- Opportunity stays unchanged
- no false CANCELLED
- no Email

## Scenario 5 — Follow After Change

```text
10:00 Change
14:00 Follow
```

PASS:

- My Preppy shows current/recent info
- no retroactive email

## Scenario 6 — Reactivated Follow

```text
Follow inactive during signal
later reactivated
```

PASS:

past signal email 없음.

## Scenario 7 — Email Disabled Before Worker

```text
Delivery pending
→ Email preference OFF
→ worker
```

PASS:

SUPPRESSED, provider not called.

## Scenario 8 — Worker Crash After Claim

```text
PROCESSING
worker dies
```

PASS:

stale lease recovery.

## Scenario 9 — Duplicate Outbox Consumption

같은 signal 두 번 처리.

PASS:

- one Notification
- one Delivery/User/channel

## Scenario 10 — Provider Timeout

provider accepted 여부 불명확.

PASS:

idempotency/provider message reconciliation prevents obvious duplicate.

## Scenario 11 — User Delete During Pending Notification

PASS:

- user DELETED
- Follow inactive
- PII child removed
- pending Delivery suppressed
- historical opaque record remains

## Scenario 12 — Backfill Legacy Opportunities

PASS:

canonical Opportunity records created
but no user-facing Notification signals.

---

# 73. Monitoring Operations Definition of Done

MVP Monitoring이 완료되었다고 보는 조건:

1. Admin이 Due Source를 확인할 수 있다.
2. official Source를 열고 no-change/change를 기록할 수 있다.
3. Native Opportunity를 verified version/evidence로 갱신할 수 있다.
4. Legacy Event-backed Opportunity도 동일 product signal로 정규화된다.
5. no-change는 version/change/email을 만들지 않는다.
6. meaningful change만 OpportunityChange가 된다.
7. notifiable change만 Notification을 생성한다.
8. signal 이후 active follower만 recipient가 된다.
9. send 전 eligibility를 재확인한다.
10. Email provider side effect는 DB commit 후 발생한다.
11. Outbox retry/lease/dead-letter가 존재한다.
12. duplicate Notification/Delivery가 DB에서 차단된다.
13. User deletion/Preference off가 pending send를 suppress한다.
14. Backfill이 user-facing signal을 발생시키지 않는다.
15. Future collector가 Verification Service 앞에 삽입 가능하다.

---

# 74. Architecture Decisions Locked

## MON-001
Monitoring target은 Institution이 아니라 Source Binding이다.

## MON-002
User Follow target은 Institution이다.

## MON-003
MVP Monitoring은 Manual-first Level 0이다.

## MON-004
Official Source를 verified truth의 기본 근거로 사용한다.

## MON-005
Source check와 Verification은 다른 행위다.

## MON-006
No-change check는 Version을 생성하지 않는다.

## MON-007
Native/Legacy persistence는 OpportunityChange에서 수렴한다.

## MON-008
Notification consumer는 legacy MeaningfulChange를 직접 소비하지 않는다.

## MON-009
Institution Fact change는 MVP 기본 Email trigger가 아니다.

## MON-010
Migration/backfill은 Product Notification signal을 발생시키지 않는다.

## MON-011
Follow 이후 발생한 signal만 기본 Email 대상이다.

## MON-012
Follow reactivation은 inactive interval의 signal을 소급발송하지 않는다.

## MON-013
Send 직전 eligibility를 다시 검증한다.

## MON-014
Notification/Delivery logical uniqueness는 DB constraint로 보장한다.

## MON-015
External Email provider call은 core DB transaction 외부다.

## MON-016
기존 PostgreSQL Outbox를 hardening해 queue로 사용한다.

## MON-017
Worker는 SKIP LOCKED + lease recovery를 사용한다.

## MON-018
Source availability failure는 Opportunity truth를 자동 변경하지 않는다.

## MON-019
Future automation은 Observation/Candidate 영역에 삽입되고 Verification contract를 우회하지 않는다.

## MON-020
자동화는 운영 병목 검증 후 단계적으로 도입한다.

---

# 75. Required Implementation Contracts Passed Forward

후속 설계/PRD에서 구체화해야 할 contract:

### Monitoring Planner

```text
getDueSources(now)
```

### Manual Check

```text
confirmNoChange
markSourceUnavailable
```

### Verification

```text
verifyNativeOpportunity
verifyLegacyOpportunity
verifyInstitutionFact
```

### Change Normalization

```text
deriveOpportunityChange
```

### Notification

```text
createNotificationForSignal
resolveRecipients
```

### Delivery

```text
sendEmailDelivery
suppressDelivery
retryDelivery
```

### Outbox

```text
enqueue
claim
complete
retry
deadLetter
```

---

# 76. Repository Validation Questions

Codex는 이 문서를 검증할 때 최소 다음을 확인한다.

1. 기존 Source/Observation/MonitorConfig으로 query-driven Monitoring Queue가 가능한가?
2. manual Source check outcome을 기존 Observation vocabulary로 표현 가능한가?
3. Observation에 Admin actor가 없을 경우 audit로 충분한가?
4. No-change check를 Version 생성 없이 기록 가능한가?
5. Legacy Event verify transaction에서 기존 MeaningfulChange를 canonical OpportunityChange와 같은 transaction에 만들 수 있는가?
6. Native verify transaction이 Data Model/lineage constraints와 충돌하지 않는가?
7. Outbox existing schema를 staged hardening 후 SKIP LOCKED worker에 사용할 수 있는가?
8. recipient resolution과 delivery send를 두 outbox stage로 나누는 것이 현재 repo에 과도한가?
9. one-stage worker가 더 단순한지 비교하되 idempotency를 훼손하지 않는가?
10. FollowEpisode로 signal-time eligibility를 재현할 수 있는가?
11. User delete / Preference off와 Delivery worker 사이 race를 어떤 lock/transaction으로 막아야 하는가?
12. provider call 전 DB transaction을 종료한 뒤에도 idempotency를 유지 가능한가?
13. existing Alert/Delivery code가 아직 없으므로 canonical Notification worker를 독립 구현 가능한가?
14. source check cadence를 `source_monitor_configs`로 충분히 표현 가능한가?
15. automatic collector 구현 없이 Level 0 E2E가 완성 가능한가?

---

# 77. Next Step

Codex Repository Validation 산출물:

```text
05A_MONITORING_ARCHITECTURE_REPOSITORY_VALIDATION.md
```

Validation이:

```text
VALID
or
VALID_WITH_IMPLEMENTATION_ADJUSTMENTS
```

이고 Architecture Amendment가 필요 없다면 다음 설계로 진행한다.

권장:

```text
06_CONTENT_SEO_ARCHITECTURE.md
```

이후:

```text
07_IDENTITY_FOLLOW_NOTIFICATION.md
08_ANALYTICS_ARCHITECTURE.md
09_ADMIN_OPERATIONS_ARCHITECTURE.md
10_PRD.md
```

Production feature implementation은 위 critical contracts가 확정된 뒤 시작한다.
