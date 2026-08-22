# 03_DOMAIN_MODEL.md

> **Project:** PREPPY (프레피)  
> **Document Type:** Domain Model  
> **Status:** Domain v1.0  
> **Decision Baseline:** `00_PRODUCT_REQUIREMENTS_BASELINE.md`  
> **Architecture:** `02_TARGET_ARCHITECTURE.md` Target v1.1  
> **Repository Validation:** `02A_TARGET_ARCHITECTURE_REPOSITORY_VALIDATION.md`  
> **Purpose:** PREPPY MVP와 장기 확장의 핵심 도메인 언어, Aggregate 경계, Entity/Value Object, Lifecycle, Cardinality, Invariant, Domain Event를 확정한다. `04_DATA_MODEL.md`는 이 문서를 PostgreSQL 물리 모델로 구현해야 하며, 제품 의미를 바꾸기 위해 Data Model이 Domain Model을 역으로 왜곡해서는 안 된다.

---

# 0. Document Role

이 문서는 PREPPY의 **제품 의미를 코드와 데이터가 공유할 수 있도록 고정하는 문서**다.

이 문서에서 결정하는 것:

1. `Institution / Opportunity / Source / User / Follow / Notification / Article`의 정확한 의미
2. 각 Domain의 Aggregate Root와 책임
3. Domain 간 cardinality와 dependency
4. lifecycle과 state transition
5. 반드시 지켜야 할 business invariant
6. verified truth, history, evidence의 소유권
7. Follow와 Monitoring 위임의 의미
8. Notification eligibility와 delivery 의미
9. Article과 Institution/Opportunity의 구조적 관계
10. Domain Event와 integration boundary
11. Legacy AdmissionRadar와 PREPPY canonical model 사이의 domain-level compatibility 규칙

이 문서에서 결정하지 않는 것:

- 실제 PostgreSQL table/column 이름
- UUID/serial 등 exact PK type
- exact FK/index/check SQL
- migration SQL
- exact API endpoint
- TypeScript class/interface 이름
- Next.js folder 구조
- email provider
- Kakao SDK 선택
- exact GA4 implementation
- 법률 문구와 개인정보 보존기간

위 항목은 `04_DATA_MODEL.md`, 상세 Architecture, PRD, Implementation Plan에서 확정한다.

---

# 1. Domain Objective

PREPPY가 사용자에게 제공하는 핵심 Product Loop는 다음이다.

```text
Discover
→ Compare
→ Follow
→ Monitor
→ Update
→ Return
```

도메인 관점에서는 다음 관계로 번역된다.

```text
Article / Search
        ↓
Institution
        ↓
Opportunity
        ↓
User follows Institution
        ↓
PREPPY verifies Institution/Opportunity information
        ↓
Opportunity Change / New Opportunity
        ↓
Notification
        ↓
NotificationDelivery
        ↓
User returns
```

핵심은 `Follow`다.

Follow 이전의 PREPPY는 정보 서비스다.

Follow 이후의 PREPPY는 사용자가 기관 정보 확인 업무를 **위임한 Monitoring 서비스**가 된다.

---

# 2. Ubiquitous Language

PREPPY의 코드, 문서, Admin UI, Analytics에서 가능한 한 다음 용어를 일관되게 사용한다.

| Term | Definition |
|---|---|
| Institution | 사용자가 탐색하고 Follow할 수 있는 canonical 교육기관 |
| Institution Category | PREPPY가 사용자 탐색을 위해 사용하는 제품 분류 |
| Institution Fact | 기관에 관한 검증 가능한 정보 주장 |
| Opportunity | 현재 또는 예정된 입학 관련 행동 기회 |
| Opportunity Version | Opportunity의 특정 시점 검증 상태 |
| Opportunity Change | 검증된 Opportunity 상태가 사용자에게 의미 있게 달라졌음을 표현하는 product-level signal |
| Source | 기관 또는 Opportunity 정보를 검증하는 외부 출처 |
| Observation | 특정 시점에 Source를 확인한 사실 |
| Snapshot | Source의 특정 시점 콘텐츠 상태 |
| Evidence | 검증된 Version/Fact와 Source 또는 Observation/Snapshot을 연결하는 근거 |
| Verification | 정보가 Source/Evidence에 근거하여 확인되었다는 도메인 행위 |
| Last Verified | 특정 scope의 현재 정보가 마지막으로 검증된 시점 |
| User | PREPPY 내부 canonical 회원 계정 |
| AuthIdentity | 외부 로그인 provider identity와 User의 연결 |
| Profile | 제품 개인화를 위한 최소 회원 속성 |
| Consent | 특정 약관/처리/수신에 대한 사용자의 명시적 결정 이력 |
| Follow | User가 Institution Monitoring을 PREPPY에 맡기는 지속적 관계 |
| NotificationPreference | 특정 Notification channel을 받을 것인지에 대한 현재 제품 설정 |
| Notification | 어떤 사건을 왜 알려야 하는지를 나타내는 canonical 알림 |
| NotificationDelivery | Notification을 특정 User에게 특정 channel로 전달하는 시도와 결과 |
| Article | SEO Acquisition과 사용자 판단을 돕는 canonical Editorial Content |
| Publication State | Public Web에 노출 가능한지에 관한 제품 상태 |
| Legacy School | 기존 AdmissionRadar `schools` identity |
| AdmissionEvent | 기존 AdmissionRadar 입학 event identity |
| AdmissionCycle | 기존 AdmissionRadar의 학년도/지원주기 grouping |
| Native Opportunity | legacy AdmissionEvent 없이 PREPPY가 직접 truth/history를 소유하는 Opportunity |
| Legacy-backed Opportunity | 기존 AdmissionEvent history를 verified truth persistence로 사용하는 Opportunity |

금지하거나 피할 표현:

- `Subscriber`를 PREPPY User와 동일시하지 않는다.
- `Subscription`을 PREPPY Follow와 동일시하지 않는다.
- `Email Alert`를 Notification과 동일시하지 않는다.
- `School`을 모든 Institution의 canonical 명칭으로 사용하지 않는다.
- `Education Opportunity`를 Admission Opportunity와 동일한 universal entity로 만들지 않는다.

---

# 3. Bounded Context Map

PREPPY MVP의 bounded context는 다음과 같다.

```text
┌────────────────────┐
│ Institution Context │
└─────────┬──────────┘
          │ canonical institution identity
          ▼
┌────────────────────┐
│ Admissions Context  │
│ Opportunity         │
└─────────┬──────────┘
          │ verified facts/evidence
          ▼
┌────────────────────┐
│ Trust Context       │
│ Source / Evidence   │
└────────────────────┘

┌────────────────────┐
│ Identity Context    │
│ User / Auth / Consent│
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│ Follow Context      │
│ User↔Institution    │
└─────────┬──────────┘
          │ recipient eligibility
          ▼
┌────────────────────┐
│ Notification Context│
└────────────────────┘

┌────────────────────┐
│ Editorial Context   │
│ Article             │
└────────────────────┘
       │ references only
       ├──────── Institution
       └──────── Opportunity
```

Supporting contexts:

```text
Analytics Context
Admin Application Layer
Infrastructure Adapters
```

### Dependency Rules

1. Admissions는 Institution identity를 참조할 수 있다.
2. Institution은 Admissions write model에 의존하지 않는다.
3. Trust는 Institution/Admissions의 truth를 검증하지만 해당 aggregate의 임의 mutation을 소유하지 않는다.
4. Follow는 User와 Institution을 참조하지만 User/Institution profile을 소유하지 않는다.
5. Notification은 Follow/Identity의 현재 상태를 읽지만 Follow/User를 수정하지 않는다.
6. Editorial은 Institution/Opportunity를 참조하지만 그들의 truth를 수정하지 않는다.
7. Article은 Opportunity의 공식 Source가 될 수 없다.
8. Analytics는 Domain Event를 관찰하지만 Business Rule의 Source of Truth가 아니다.
9. Admin은 독립 Domain이 아니라 각 bounded context의 Application Service를 호출하는 운영 인터페이스다.

---

# 4. Domain Classification

## 4.1 Core Domain

PREPPY의 차별화와 제품가치를 직접 만드는 Core Domain:

- Institution Discovery Model
- Admissions Opportunity
- Trust / Verification / History
- Follow / Monitoring Delegation
- Notification Triggering

## 4.2 Supporting Domain

- Editorial / Article
- Identity / Consent
- Analytics
- Admin Operations

## 4.3 Generic / Infrastructure

- Kakao OAuth adapter
- Email provider adapter
- PostgreSQL persistence
- GA4 adapter
- Scheduler/Worker
- HTML sanitizer
- Image/object storage

Infrastructure가 Core Domain의 용어와 business invariant를 결정해서는 안 된다.

---

# 5. Canonical Entity Relationship Overview

```text
User
 ├── 1..N AuthIdentity
 ├── 1 Profile
 ├── 0..N ConsentDecision
 ├── 0..N NotificationPreference
 └── 0..N Follow ───────────────┐
                                │
                                ▼
Institution ──────────────── Opportunity
    │ 1                       0..N
    │                           │
    ├── 0..N InstitutionFact    ├── 0..N OpportunityVersion*
    ├── 0..N SourceBinding      ├── 0..N SourceBinding
    └── 0..N ArticleRelation    ├── 0..N Evidence
                                └── 0..N OpportunityChange
                                              │
                                              ▼
                                         Notification
                                              │ 1
                                              ▼
                                      0..N NotificationDelivery

Article
 ├── 0..N InstitutionRelation
 └── 0..N OpportunityRelation
```

`OpportunityVersion*`의 물리 persistence는 두 가지다.

```text
Legacy-backed Opportunity
→ AdmissionEvent / AdmissionEventVersion

Native Opportunity
→ OpportunityVersion
```

Application/Public layer는 두 persistence path를 동일한 Opportunity Domain Contract로 사용한다.

---

# 6. Institution Domain

# 6.1 Aggregate Root — Institution

`Institution`은 PREPPY에서 사용자가 탐색하고 Follow하는 **canonical 교육기관 identity**다.

Institution의 identity는 다음과 독립적이다.

- 외부 홈페이지 URL
- Kakao/네이버 listing ID
- legacy `school_id`
- 기관명 변경
- slug 변경

즉 기관명이나 URL이 바뀌어도 Institution identity는 유지된다.

## 6.2 Institution Category

MVP의 사용자 탐색용 canonical category는 다음 세 가지다.

```text
ENGLISH_KINDERGARTEN
PRIVATE_ELEMENTARY
INTERNATIONAL_SCHOOL
```

사용자-facing label:

```text
영유
사립초
국제학교
```

### ENGLISH_KINDERGARTEN

`영유`는 PREPPY의 **제품 탐색 taxonomy**다.

법률상 정식 학교 유형을 주장하는 분류로 사용하지 않는다.

### INTERNATIONAL_SCHOOL

Public UX에서는 국제학교를 하나의 상위 category로 제공한다.

내부적으로 legacy/법적 구분이 필요한 경우 subtype 또는 classification을 별도로 보존한다.

예:

```text
INTERNATIONAL_SCHOOL
FOREIGN_SCHOOL
OTHER_INTERNATIONAL
```

이 subtype은 public primary navigation을 분리하기 위한 category가 아니라 정보 보존 및 filtering 확장을 위한 classification이다.

## 6.3 Institution Lifecycle

Institution의 실제 운영상태와 PREPPY publication state를 분리한다.

### Operational State

```text
ACTIVE
INACTIVE
CLOSED
UNKNOWN
```

의미:

- `ACTIVE`: 정상 운영 중으로 확인
- `INACTIVE`: 현재 운영/모집 활동이 중단된 상태로 판단
- `CLOSED`: 폐원/폐교 등 종료가 확인됨
- `UNKNOWN`: 공식 상태를 충분히 확인하지 못함

### Publication State

```text
DRAFT
PUBLISHED
HIDDEN
ARCHIVED
```

- `DRAFT`: Admin에서 준비 중, public 노출 불가
- `PUBLISHED`: canonical public asset
- `HIDDEN`: 일시적으로 public 노출 중단
- `ARCHIVED`: 역사/redirect 목적 보존, 신규 discovery 대상 아님

운영상태와 publication state는 동일한 개념이 아니다.

예:

```text
OperationalState = CLOSED
PublicationState = ARCHIVED
```

가 가능하다.

## 6.4 Institution Publish Invariants

Institution을 `PUBLISHED`로 전환하려면 최소한 다음이 존재해야 한다.

- canonical display name
- Institution Category
- canonical slug
- 탐색 가능한 region/location
- 최소 1개의 authoritative/official Source binding
- public detail을 구성할 최소 profile

검증되지 않은 tuition/curriculum/eligibility 값을 억지로 채우는 것은 publish requirement가 아니다.

모르는 값은 `unknown/not verified` 상태로 둔다.

## 6.5 Institution Fact

Institution에 표시되는 모든 값이 동일한 신뢰 특성을 갖지는 않는다.

다음과 같은 정보는 시간이 지나며 변경되거나 사용자가 의사결정에 사용하는 **검증 대상 Fact**로 취급한다.

예:

- tuition / fee
- target age / grade
- curriculum
- eligibility
- commute / transport information
- admission process summary
- key operating information

`InstitutionFact`는 Institution identity와 분리된 검증 가능한 주장이다.

Domain invariant:

> 중요한 Institution Fact는 단순 `updated_at`만으로 최신성을 주장해서는 안 된다.

검증 가능한 Fact는 가능하면:

```text
Fact
→ Version / Verification
→ Evidence
→ Source
```

의 추적 가능성을 가져야 한다.

정확히 어떤 field를 versioned Fact로 저장할지는 `04_DATA_MODEL.md`에서 MVP 비용을 고려해 결정한다.

## 6.6 Legacy School Relationship

Legacy School은 Institution의 subtype이 아니다.

관계는 compatibility mapping이다.

```text
Institution 0..1 ↔ 0..1 LegacySchool
```

MVP migration에서 기존 School-backed Institution은 1:1 mapping을 원칙으로 한다.

하지만 Native 영유 Institution은 LegacySchool 없이 존재할 수 있다.

### Invariant

PREPPY public identity는 `InstitutionId`다.

Legacy `school_id`는 canonical public identity나 Analytics primary object identity가 아니다.

## 6.7 Institution Domain Events

주요 Domain Event:

```text
InstitutionCreated
InstitutionPublished
InstitutionHidden
InstitutionArchived
InstitutionOperationalStateChanged
InstitutionFactVerified
InstitutionSourceBound
InstitutionSourceUnbound
InstitutionSlugChanged
```

---

# 7. Admissions / Opportunity Domain

# 7.1 Aggregate Root — Opportunity

`Opportunity`는 사용자가 현재 확인하거나 준비하거나 행동할 수 있는 **입학 관련 기회**다.

Opportunity는 Institution의 단순 날짜 필드가 아니다.

예:

- ○○영유 5세 신규모집
- ○○영유 레벨테스트
- ○○국제학교 Open House
- ○○국제학교 Spring Application
- ○○사립초 입학설명회
- ○○사립초 원서접수

Opportunity는:

- 독립 identity
- 독립 public URL
- lifecycle
- current verified state
- verification history
- source/evidence
- analytics identity

를 가진다.

## 7.2 Opportunity Cardinality

```text
Institution 1 ── 0..N Opportunity
```

모든 Opportunity는 정확히 하나의 canonical Institution에 속한다.

MVP에서는 Institution에 속하지 않는 global Opportunity를 허용하지 않는다.

## 7.3 Opportunity Kind Taxonomy

MVP canonical kind는 다음과 같이 정의한다.

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

### 의미

- `RECRUITMENT`: 신규모집/정규모집 자체가 핵심 기회
- `ADDITIONAL_RECRUITMENT`: 추가모집
- `INFORMATION_SESSION`: 입학설명회/브리핑
- `CONSULTATION`: 입학 상담 신청/상담 일정
- `LEVEL_TEST`: 영유 등에서 별도 의미를 갖는 레벨테스트
- `OPEN_HOUSE`: 국제학교 등의 Open House
- `APPLICATION`: 원서접수/Application
- `DOCUMENT_SUBMISSION`: 서류제출
- `ASSESSMENT`: 입학평가
- `INTERVIEW`: 인터뷰
- `LOTTERY`: 추첨
- `RESULT_ANNOUNCEMENT`: 결과 발표
- `REGISTRATION`: 등록
- `DEADLINE`: 다른 Opportunity에 흡수하기 어려운 독립 마감
- `OTHER`: taxonomy에 없는 입학 관련 행동기회

`LEVEL_TEST`를 단순 Assessment로 강제하지 않는다.

영유에서 사용자가 검색/판단하는 별도 의미가 있기 때문이다.

## 7.4 Future Taxonomy Rule

새 kind를 추가할 때:

> UI 문구가 다르다는 이유만으로 type을 늘리지 않는다.

다음 중 하나 이상이 다를 때 kind 확장을 고려한다.

- 사용자 행동
- lifecycle
- 검색/필터 의미
- Notification 의미
- 필요한 핵심 field
- 분석 의미

## 7.5 Opportunity Publication State

```text
DRAFT
PUBLISHED
HIDDEN
ARCHIVED
```

Publication은 사용자 노출 상태다.

Verification state와 구분한다.

## 7.6 Opportunity Business State

Opportunity의 실제 진행상태는 다음 canonical state를 사용한다.

```text
UPCOMING
OPEN
CLOSED
COMPLETED
CANCELLED
UNKNOWN
```

- `UPCOMING`: 일정/오픈 예정
- `OPEN`: 현재 신청/참여 가능
- `CLOSED`: 신청/접수가 종료됨
- `COMPLETED`: 행사/절차 자체가 종료됨
- `CANCELLED`: 취소됨
- `UNKNOWN`: 공식 status를 신뢰성 있게 판단하지 못함

상태는 날짜만으로 무조건 계산하지 않는다.

공식 Source의 명시적 상태가 존재할 수 있기 때문이다.

날짜 기반 계산은 read projection helper로 사용할 수 있지만 verified truth를 임의로 덮어쓰지 않는다.

## 7.7 Verification State

Opportunity root의 publication/business state와 verified truth state를 분리한다.

Version 수준에서 최소 다음 의미를 갖는다.

```text
UNVERIFIED
VERIFIED
SUPERSEDED
```

Public current state는 원칙적으로 `VERIFIED` truth를 사용한다.

새로운 observation이 들어왔지만 아직 검증되지 않았다면 public current truth가 즉시 바뀌지 않는다.

## 7.8 Opportunity Truth Ownership

Opportunity에는 두 truth persistence path가 존재한다.

### Legacy-backed Opportunity

```text
Opportunity
→ optional AdmissionEvent bridge
→ AdmissionEvent
→ AdmissionEventVersion
→ EventVersionEvidence
```

기존 verified history와 lineage를 authoritative persistence로 사용한다.

### Native Opportunity

```text
Opportunity
→ OpportunityVersion
→ OpportunityVersionEvidence
```

PREPPY canonical version/evidence path가 authoritative persistence다.

### Cardinality

```text
Opportunity 0..1 ↔ 0..1 AdmissionEvent
```

규칙:

1. Opportunity는 AdmissionEvent 없이 존재할 수 있다.
2. AdmissionEvent는 public Opportunity로 노출되지 않을 수 있다.
3. 하나의 AdmissionEvent를 여러 Opportunity가 공유하지 않는다.
4. 하나의 Opportunity를 여러 AdmissionEvent에 bridge하지 않는다.
5. Native Opportunity를 위해 가짜 School/Cycle/Event를 생성하지 않는다.

## 7.9 AdmissionCycle

AdmissionCycle은 legacy/historical grouping context로 유지한다.

하지만 Opportunity 존재의 필수 조건이 아니다.

```text
Opportunity 0..1 AdmissionCycle context
```

Native 영유 Opportunity는 AdmissionCycle 없이 유효하다.

Public Product에서는:

```text
Institution → Opportunity
```

를 기본 navigation으로 한다.

## 7.10 Opportunity Current State Contract

저장방식과 무관하게 Application layer는 동일한 canonical contract를 제공한다.

개념적 contract:

```text
OpportunityCurrentState
- opportunity identity
- institution identity
- kind
- business state
- title
- target audience
- relevant dates/windows
- application/action URL when available
- verification timestamp
- source/evidence summary
- updated/change indicator
```

Legacy-backed인지 Native인지 Public UI가 알아야 할 이유가 없어야 한다.

## 7.11 Opportunity Version Invariants

Native/Legacy 공통 domain invariant:

1. 이미 검증된 과거 state를 overwrite해서 잃지 않는다.
2. 한 시점의 canonical current verified state는 최대 하나다.
3. verified version은 verification timestamp를 가진다.
4. verified version은 최소 하나의 근거 Source/Evidence와 연결될 수 있어야 한다.
5. superseded state는 다시 current로 되돌아가지 않는다.
6. version history는 시간/lineage 순서를 보존한다.
7. manual verification과 future automation은 동일한 verified truth 규칙을 사용한다.

## 7.12 Publishing Invariants

Opportunity를 `PUBLISHED`로 만들려면:

- Institution이 public reference 가능한 상태
- kind 존재
- public title 존재
- current verified truth 존재
- 최소 하나의 authoritative Source/Evidence 존재
- 사용자가 이해할 수 있는 현재 상태 또는 시점 정보 존재

정확한 날짜가 반드시 존재해야 하는 것은 아니다.

예:

> “5세 추가모집 진행 중 — 상담 후 레벨테스트”

처럼 날짜 없는 기회도 공식적으로 검증되었다면 유효하다.

## 7.13 Opportunity Change

`OpportunityChange`는 **product-level immutable signal**이다.

그 자체가 Opportunity state의 Source of Truth는 아니다.

Source of Truth는 version history다.

OpportunityChange의 역할:

- 무엇이 달라졌는지 표현
- 중요도/Notification 여부 판단
- legacy/native persistence 차이 정규화
- Admin recent changes
- My Preppy recent changes
- Analytics
- Notification trigger

예:

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

## 7.14 Opportunity Change Normalization

Legacy:

```text
AdmissionEventVersion change
→ existing MeaningfulChange
→ OpportunityChange
```

Native:

```text
OpportunityVersion change
→ OpportunityChange
```

Notification은 `MeaningfulChange`와 `OpportunityVersion`을 각각 해석하지 않는다.

항상 canonical `OpportunityChange` 또는 `OpportunityPublished` signal을 소비한다.

## 7.15 Opportunity Domain Events

```text
OpportunityCreated
OpportunityVerified
OpportunityPublished
OpportunityHidden
OpportunityArchived
OpportunityBusinessStateChanged
OpportunityChanged
OpportunityCancelled
OpportunitySourceBound
OpportunitySlugChanged
```

---

# 8. Trust / Verification Domain

# 8.1 Aggregate Root — Source

`Source`는 PREPPY가 Institution/Opportunity truth를 검증하기 위해 사용하는 외부 출처 identity다.

예:

- 기관 공식 홈페이지
- Admissions 공식 페이지
- 공식 공지
- 공식 신청 페이지
- 공식 SNS 계정

## 8.2 Source Authority

Source는 최소한 authority 의미를 가져야 한다.

개념적 수준:

```text
OFFICIAL_PRIMARY
OFFICIAL_SECONDARY
TRUSTED_REFERENCE
UNVERIFIED_REFERENCE
```

핵심 Institution Fact와 Opportunity publish에는 원칙적으로 official 계열 Source를 우선한다.

커뮤니티/블로그를 공식 truth의 단독 근거로 사용하지 않는다.

## 8.3 Source Lifecycle

```text
ACTIVE
INACTIVE
BROKEN
ARCHIVED
```

Source URL이 접근 불가라고 해서 과거 Evidence를 삭제하지 않는다.

## 8.4 Source Binding

Source는 명시적인 관계로 Domain object에 연결한다.

```text
Institution 0..N ↔ 0..N Source
Opportunity 0..N ↔ 0..N Source
```

Generic `entity_type + entity_id` relation을 Core Domain 기본값으로 사용하지 않는다.

## 8.5 Observation

Observation은:

> “특정 시점에 이 Source를 확인했고 이런 결과를 얻었다.”

라는 사실이다.

Observation은 verification과 동일하지 않다.

예:

```text
Source 확인 성공
Source 접근 실패
변경 없음
콘텐츠 변경 감지
```

자동 collector 또는 사람이 Observation을 만들 수 있다.

## 8.6 Snapshot

Snapshot은 Source의 특정 시점 콘텐츠 상태다.

MVP manual path에서 모든 verification에 Snapshot이 필수는 아니다.

공식 링크 + Admin 확인만으로 Evidence를 남길 수 있다.

향후 자동 수집에서는 Snapshot 활용이 증가한다.

## 8.7 Evidence

Evidence는 검증된 Fact/Version이 어떤 Source에 근거하는지를 표현한다.

Evidence invariant:

1. Evidence 없이 `Verified`를 남발하지 않는다.
2. Source가 삭제/비활성화되어도 historical Evidence는 보존한다.
3. Evidence는 현재 source content가 바뀌어도 과거 verification lineage를 추적할 수 있어야 한다.
4. Observation/Snapshot은 있을 수도, 없을 수도 있다.
5. Admin manual verification은 정당한 first-class provenance다.

## 8.8 Verification

Verification은 단순 저장이 아니라 Domain action이다.

```text
Unverified observation/input
        ↓
Admin/Policy verifies
        ↓
Verified Version / Fact
        ↓
Evidence
        ↓
Current Projection
        ↓
Optional OpportunityChange
```

Verification을 우회한 direct DB edit로 public current truth를 변경하지 않는다.

---

# 9. Last Verified Domain Rule

Repository Validation에서 확인됐듯 `Last Verified`는 하나의 timestamp로 모든 정보를 대표할 수 없다.

따라서 scope별로 의미를 분리한다.

## 9.1 Source Last Checked

```text
SourceLastCheckedAt
```

해당 Source를 마지막으로 확인한 시점.

이 값은 정보 내용 자체가 검증되었다는 의미가 아니다.

## 9.2 Opportunity Last Verified

```text
OpportunityLastVerifiedAt
```

현재 public Opportunity state를 구성하는 canonical verified version의 verification 시점.

Opportunity Detail의 기본 `Last Verified`는 이 값을 사용한다.

## 9.3 Institution Fact Last Verified

각 중요 Institution Fact의 현재 verified version 시점.

예:

```text
Tuition last verified
Eligibility last verified
Curriculum last verified
```

## 9.4 Institution Page Last Verified

하나의 page-wide `Last Verified`를 노출하려면 별도의 **profile verification scope**가 존재해야 한다.

단순히 다음을 사용해서는 안 된다.

- Institution `updated_at`
- 가장 최근 아무 field 수정시각
- 가장 최근 아무 Source observation

MVP에서 page-wide verification scope를 구현하지 않는다면 UI는 섹션/Fact별 검증 시점을 보여주거나:

> “공식 홈페이지 마지막 확인”

처럼 정확한 의미의 label을 사용한다.

## 9.5 Domain Principle

> `Last Verified`는 마케팅 문구가 아니라 verification provenance의 projection이다.

---

# 10. Identity / User Domain

# 10.1 Aggregate Root — User

`User`는 PREPPY 내부 canonical 회원 identity다.

User identity는 Kakao ID나 email과 동일하지 않다.

## 10.2 User Lifecycle

```text
PENDING
ACTIVE
SUSPENDED
DELETED
```

- `PENDING`: Auth flow 또는 필수 가입조건 미완료
- `ACTIVE`: 정상 계정
- `SUSPENDED`: 정책/운영상 사용 제한
- `DELETED`: 사용자 탈퇴가 완료된 logical terminal state

MVP에서 특별한 suspension 운영이 없다면 `SUSPENDED` UI는 구현하지 않아도 되지만 domain 의미는 유지할 수 있다.

`DELETED → ACTIVE` 복구는 기본적으로 허용하지 않는다.

다시 가입할 경우 개인정보/identity 정책에 따라 신규 계정 또는 별도 account recovery 결정을 한다.

## 10.3 AuthIdentity

```text
User 1 ── 1..N AuthIdentity
```

MVP에서는 사실상 1개의 Kakao Identity를 가진다.

AuthIdentity fields의 의미:

- provider
- provider subject
- linked timestamp
- provider state

MVP provider:

```text
KAKAO
```

Invariant:

```text
(provider, provider_subject)
```

는 하나의 active User에만 연결된다.

Kakao provider subject를 User PK로 사용하지 않는다.

## 10.4 User Profile

MVP Profile:

- email
- child birth year
- interested regions
- interested education categories

Profile은 마케팅 segment 자체가 아니다.

제품 사용을 돕는 최소 정보를 저장한다.

명시적으로 기본수집하지 않는 항목:

- 자녀 이름
- 정확한 생년월일
- 소득
- 자산
- 직업
- 월 교육비

## 10.5 Email Identity

Email은 다음 역할을 할 수 있다.

- service notification destination
- user-visible contact information

Email과 User identity를 동일시하지 않는다.

Email 변경이 User identity 변경을 의미하지 않는다.

Kakao 이메일이 없는 경우 별도 Email 입력이 가능해야 한다.

---

# 11. Consent Domain

# 11.1 Consent Is an Append-only Decision History

Consent는 User profile boolean 하나로 취급하지 않는다.

개념:

```text
ConsentDecision
- consent type
- document/policy version
- decision: GRANTED / REVOKED
- decided_at
- provenance
```

## 11.2 MVP Consent Types

제품 Domain에서 최소한 다음 의미를 구분한다.

```text
TERMS_OF_SERVICE
PRIVACY_POLICY
SERVICE_EMAIL_UPDATES
```

향후 상업적 메시지가 필요해질 경우:

```text
MARKETING_EMAIL
```

등을 별도로 추가한다.

`SERVICE_EMAIL_UPDATES`와 광고성 Marketing Consent를 같은 것으로 취급하지 않는다.

정확한 법적 분류와 문구는 Privacy/Legal 검토에서 확정한다.

## 11.3 Effective Consent

Effective Consent는 최신 policy/version과 decision history를 바탕으로 계산한다.

필수 약관/개인정보 조건을 충족하지 못한 User를 `ACTIVE`로 전환하지 않는다.

서비스 Email 업데이트를 철회해도 User account와 Follow 자체는 유지될 수 있다.

단, Email Notification eligibility는 사라진다.

---

# 12. Notification Preference Domain

`NotificationPreference`는 Consent와 다르다.

Consent:

> 이 처리/수신에 동의했는가?

Preference:

> 현재 이 channel로 제품 업데이트를 받고 싶은가?

MVP:

```text
channel = EMAIL
state = ENABLED / DISABLED
```

Effective Email Notification 가능 여부는 최소 다음의 conjunction이다.

```text
User ACTIVE
AND usable Email
AND required consent valid
AND SERVICE_EMAIL_UPDATES effective
AND Email preference ENABLED
```

UI가 단순 ON/OFF 하나이더라도 Domain에서는 Follow와 합치지 않는다.

---

# 13. Follow Domain

# 13.1 Aggregate Root — Follow

Follow는 User와 Institution 사이의 **Monitoring delegation relationship**이다.

```text
User 1 ── 0..N Follow
Institution 1 ── 0..N Follow
```

하나의 Follow는 정확히 한 User와 한 Institution을 연결한다.

## 13.2 Follow Lifecycle

```text
ACTIVE
INACTIVE
```

Transition:

```text
Not Exists → ACTIVE
ACTIVE → INACTIVE
INACTIVE → ACTIVE
```

Reactivation은 허용한다.

Domain identity는 동일 User–Institution의 논리적 관계다.

물리적으로 한 row를 재활성화할지 Follow episode를 새로 만들지는 `04_DATA_MODEL.md`에서 결정한다.

단, 다음 history는 보존 가능해야 한다.

- 최초 Follow 시점
- 현재 activation 시점
- 종료 시점
- reactivation 이력

## 13.3 Follow Invariants

1. 동일 User–Institution에 active Follow는 최대 하나다.
2. Follow 생성은 idempotent해야 한다.
3. User가 ACTIVE여야 신규 Follow 가능하다.
4. public Follow CTA 대상 Institution이어야 한다.
5. Follow는 Email 수신 여부를 소유하지 않는다.
6. Follow를 해제해도 User account는 삭제되지 않는다.
7. Follow 해제 후 과거 NotificationDelivery history를 삭제하지 않는다.
8. Follow 생성이 과거 OpportunityChange에 대한 소급 Notification을 자동 발생시키지 않는다.

## 13.4 Follow Intent

비로그인 사용자의 Follow click은 Domain Follow가 아니다.

`PendingFollowIntent`는 Application/Auth flow의 temporary intent다.

```text
Follow Click
→ PendingFollowIntent
→ Kakao Auth
→ User ACTIVE
→ Create/Activate Follow
```

Pending intent는 짧은 수명의 ephemeral state이며 장기 business history가 아니다.

## 13.5 Follow Domain Events

```text
FollowActivated
FollowDeactivated
FollowReactivated
```

---

# 14. Monitoring Delegation Rule

Follow의 제품적 의미는 다음과 같다.

> “이 Institution의 중요한 입학정보를 PREPPY가 계속 확인하고, 내가 받을 수 있는 channel이 활성화되어 있다면 의미 있는 변경을 알려달라.”

그러나 Follow 자체가 다음을 보장하지는 않는다.

- 특정 빈도로 반드시 email을 받음
- 모든 변경사항을 알림
- Institution의 모든 Source가 실시간 자동 수집됨
- 입학 성공/지원자격 보장

Monitoring 상태는:

- active Follow
- Institution의 monitorable Source
- verification operations

의 결합으로 구성된다.

My Preppy의 “Monitoring 중” 표시는 제품 정책상 실제 Monitoring coverage가 있는 Institution에 한해 노출해야 한다.

---

# 15. Opportunity Change → Notification Eligibility

# 15.1 Notifiable Signal

MVP에서 Notification 후보가 될 수 있는 canonical signal:

```text
OpportunityPublished
OpportunityChanged
```

Institution Fact 변화는 MVP에서 기본 Notification trigger가 아니다.

향후 정책에 따라 추가할 수 있다.

## 15.2 Eligibility Time Rule

사용자는 기본적으로 **Follow 이후 발생한 notifiable signal만** 받는다.

기준 시점:

```text
signal_published_at
```

또는 canonical change의 user-visible publication 시점.

Eligibility:

```text
Follow ACTIVE at signal_published_at
AND Follow activated_at <= signal_published_at
```

Follow 직후 기존/과거 변경을 retrospective notification으로 보내지 않는다.

현재 상태를 보여주는 onboarding UI는 별도 product behavior다.

## 15.3 Preference Rule

Recipient resolution 시 다음을 확인한다.

```text
User ACTIVE
Follow ACTIVE
Email eligible
Email preference ENABLED
Required service email consent effective
```

NotificationDelivery가 실제 provider send 직전에도 수신 철회/계정삭제 여부를 재확인한다.

Preference가 Notification 생성 후 OFF가 되었다면 아직 발송되지 않은 Delivery는 전송하지 않고 `SUPPRESSED` 처리할 수 있어야 한다.

## 15.4 Follow Deactivation Rule

Signal 이후 Delivery가 생성되었지만 provider send 전에 Follow가 종료되었다면 MVP 기본정책은 **발송하지 않는다**.

이유:

Follow는 지속적 Monitoring 위임의 현재 의사를 의미하기 때문이다.

## 15.5 No Retroactive Spam

다음 행동은 금지한다.

```text
User follows Institution
→ 과거 3개월 변경사항 이메일 여러 건 전송
```

필요한 과거 정보는 My Preppy의 “최근 변경” UI에서 보여준다.

---

# 16. Notification Domain

# 16.1 Aggregate Root — Notification

Notification은:

> “어떤 canonical product signal을 사용자에게 알려야 하는가?”

를 표현한다.

Notification은 recipient-specific email row가 아니다.

## 16.2 MVP Trigger Cardinality

MVP 원칙:

```text
1 Notifiable Signal
→ 0..1 Canonical Notification
→ 0..N NotificationDelivery
```

정책상 알림 가치가 없는 OpportunityChange는 Notification을 생성하지 않을 수 있다.

동일 signal에 대해 동일 policy/version의 canonical Notification을 중복 생성하지 않는다.

향후 digest가 필요해지면 별도 Notification composition 정책을 추가한다.

MVP에서는 여러 unrelated signal을 하나의 Notification으로 묶지 않는다.

## 16.3 Notification Trigger

MVP canonical trigger:

```text
OpportunityPublished
OpportunityChanged
```

Notification은 legacy `MeaningfulChange`에 직접 종속되지 않는다.

legacy/native signal은 Opportunity Domain에서 정규화된다.

## 16.4 Notification Lifecycle

```text
PENDING
READY
COMPLETED
CANCELLED
```

- `PENDING`: canonical signal로 생성되었지만 대상 해석 전/정책처리 전
- `READY`: recipient resolution 가능한 상태
- `COMPLETED`: 대상 delivery 생성/처리가 완료
- `CANCELLED`: 발송 정책상 취소

정확한 Worker implementation state는 Data Model에서 단순화할 수 있다.

## 16.5 Notification Invariants

1. Notification은 canonical Institution/Opportunity identity를 참조한다.
2. 동일 canonical signal에 동일 notification policy로 중복 생성하지 않는다.
3. Notification payload는 렌더링에 필요한 최소 snapshot을 가질 수 있지만 Opportunity truth의 원본이 아니다.
4. Notification 생성이 외부 Email send와 같은 transaction에서 발생하지 않는다.
5. Notification 자체는 channel을 Email로 하드코딩하지 않는다.

## 16.6 Notification Domain Events

```text
NotificationCreated
NotificationReady
NotificationCompleted
NotificationCancelled
```

---

# 17. NotificationDelivery Domain

# 17.1 Aggregate Root — NotificationDelivery

NotificationDelivery는:

> “이 Notification을 이 User에게 이 channel로 전달하는 과정과 결과”

를 표현한다.

```text
Notification 1 ── 0..N NotificationDelivery
User 1 ── 0..N NotificationDelivery
```

## 17.2 Channel

MVP:

```text
EMAIL
```

Domain은 향후 다른 channel을 허용할 수 있지만 구현하지 않는다.

## 17.3 Delivery Lifecycle

개념적 state:

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

모든 provider가 DELIVERED/OPENED/CLICKED를 지원해야 하는 것은 아니다.

state progression은 provider capability에 따라 일부 생략될 수 있다.

`FAILED`는 retry 가능한 실패와 terminal failure를 implementation level에서 구분할 수 있다.

`SUPPRESSED`는 사용자 preference/consent/account/follow 변화 등으로 실제 send를 하지 않은 상태다.

## 17.4 Delivery Invariants

1. 동일 Notification + User + Channel의 logical delivery는 최대 하나다.
2. Worker retry로 동일 logical email을 중복발송하지 않는다.
3. provider request ID는 Delivery identity가 아니다.
4. external provider error가 canonical Notification state를 훼손하지 않는다.
5. send 전 eligibility를 재확인한다.
6. Delivery history는 Follow 해제 후에도 operational/audit 목적상 보존할 수 있다.
7. User 삭제 시 PII는 최소화/익명화하되 delivery event 자체의 운영 이력은 유지할 수 있다.

## 17.5 Delivery Domain Events

```text
NotificationDeliveryCreated
NotificationDeliveryQueued
NotificationDeliverySent
NotificationDeliveryDelivered
NotificationDeliveryOpened
NotificationDeliveryClicked
NotificationDeliveryFailed
NotificationDeliverySuppressed
```

---

# 18. User Deletion / Historical Record Rule

User deletion은 operational history를 무조건 물리 삭제하는 것과 동일하지 않다.

`UserDeleted` 시 도메인 요구:

1. AuthIdentity를 사용 불가능하게 한다.
2. Profile의 불필요한 개인정보를 제거/익명화한다.
3. active Follow를 종료한다.
4. NotificationPreference를 disable한다.
5. Pending unsent Delivery는 suppress한다.
6. provider access/refresh token을 보관하지 않는다.
7. 과거 Notification/Delivery/Audit의 비식별 운영 이력은 필요한 범위에서 유지할 수 있다.

과거 Delivery에서 email 원문을 얼마나/얼마동안 유지할지는 Privacy/Legal 정책에서 결정한다.

Domain Model은 다음만 고정한다.

> User 삭제 이후에도 시스템 무결성을 위해 필요한 historical event는 opaque internal identity 또는 anonymized reference로 보존할 수 있어야 한다.

---

# 19. Editorial / Article Domain

# 19.1 Aggregate Root — Article

Article은 PREPPY의 canonical Editorial Content다.

Article의 목적:

- Organic Search Acquisition
- Institution/Opportunity discovery 지원
- 비교/판단 기준 제공
- Follow funnel 연결

Article은 Institution/Opportunity truth의 원본이 아니다.

## 19.2 Article Type

MVP canonical type:

```text
GUIDE
UPDATE
ROUNDUP
```

- `GUIDE`: 설명/가이드형 evergreen content
- `UPDATE`: 특정 변경/시점 정보를 설명하는 editorial content
- `ROUNDUP`: 여러 Institution/Opportunity를 한 번에 정리하는 콘텐츠

Type은 CMS template 강제가 아니라 editorial semantic이다.

필요한 경우 이후 확장한다.

## 19.3 Article Category

Article Type과 탐색 Category는 분리한다.

예:

```text
ENGLISH_KINDERGARTEN
PRIVATE_ELEMENTARY
INTERNATIONAL_SCHOOL
ADMISSIONS_GENERAL
```

정확한 taxonomy는 PRD/CMS 설계에서 확장할 수 있다.

## 19.4 Article Lifecycle

```text
DRAFT
PUBLISHED
UNPUBLISHED
ARCHIVED
```

Transition:

```text
DRAFT → PUBLISHED
PUBLISHED → UNPUBLISHED
UNPUBLISHED → PUBLISHED
PUBLISHED/UNPUBLISHED → ARCHIVED
```

Archived Article은 기본적으로 재발행보다 새 Article 또는 명시적 restore 정책을 사용한다.

## 19.5 Article Publish Invariants

Publish 전에 최소한:

- title
- slug
- sanitized content
- canonical SEO title/description 또는 fallback 생성 가능 상태
- author identity 또는 editorial owner
- robots/index policy
- publication timestamp

가 필요하다.

Preview는 public publication이 아니며 `noindex`다.

## 19.6 Structured Relations

```text
Article 0..N ↔ 0..N Institution
Article 0..N ↔ 0..N Opportunity
```

Structured relation의 의미:

- 관련 정보 block
- internal linking
- conversion analytics
- context

Article content HTML 내부 링크와 별도다.

## 19.7 Article Relation Rule

Published Article이 unpublished Institution/Opportunity를 relation으로 가지고 있을 수는 있지만 public render에서는 비공개 target을 CTA로 노출하지 않는다.

Admin publish 과정에서 warning 또는 validation을 제공할 수 있다.

## 19.8 UPDATE Article Rule

`UPDATE` Article이 OpportunityChange를 대체하지 않는다.

흐름:

```text
Verified Opportunity Change
→ canonical truth updated
→ optional Notification
→ optional UPDATE Article
```

반대 흐름은 금지한다.

```text
Article 작성
→ 근거 없이 Opportunity truth 변경
```

## 19.9 Slug Change

Published Article의 slug 변경은 URL identity migration이다.

Domain Event:

```text
ArticleSlugChanged
```

SEO layer는 canonical/redirect를 처리해야 한다.

기존 slug를 즉시 재사용해 다른 Article에 할당하지 않는다.

## 19.10 Article Domain Events

```text
ArticleCreated
ArticlePublished
ArticleUpdated
ArticleUnpublished
ArticleArchived
ArticleSlugChanged
ArticleInstitutionLinked
ArticleOpportunityLinked
```

---

# 20. Analytics Domain Boundary

Analytics는 별도 Core Domain이 아니라 Product observation layer다.

## 20.1 Canonical Object IDs

Behavior event는 canonical ID를 사용한다.

```text
institution_id
opportunity_id
article_id
user_id when allowed
```

legacy:

```text
school_id
admission_event_id
```

는 migration/debug property가 될 수 있으나 primary product identity가 아니다.

## 20.2 Operational Metric

다음 지표는 PostgreSQL business state에서 재현 가능해야 한다.

### Active Monitoring Parent

Domain definition:

```text
User.status = ACTIVE
AND active Follow count >= 1
AND effective Email Notification state = enabled
```

여기서 effective Email state는:

```text
usable Email
+ valid service email consent
+ Email preference ENABLED
```

을 포함한다.

GA4 event 누락 때문에 Active Monitoring Parent count가 달라져서는 안 된다.

## 20.3 Analytics Events

Domain Event와 GA4 event는 동일하지 않다.

예:

```text
FollowActivated       = domain event
follow_created        = analytics event
```

Application/Analytics adapter가 mapping한다.

---

# 21. Admin Domain Boundary

Admin은 별도 business aggregate를 만들지 않는다.

Admin은 actor다.

Admin Application Service는 각 Domain command를 실행한다.

예:

```text
CreateInstitution
VerifyInstitutionFact
CreateOpportunity
VerifyOpportunityVersion
PublishOpportunity
BindSource
PublishArticle
Create/PreviewNotification
```

Admin UI가 DB table을 그대로 CRUD하는 화면이 되어서는 안 된다.

예:

```text
Bad:
UPDATE opportunity_versions SET ...

Good:
VerifyOpportunityChange(command)
→ domain validation
→ version
→ evidence
→ change
→ audit
→ outbox
```

---

# 22. Aggregate Boundaries

## 22.1 Institution Aggregate

Root:

```text
Institution
```

책임:

- canonical identity
- category/classification
- operational state
- publication state
- stable public profile identity

독립 lifecycle을 갖는 verified Fact history 전체를 aggregate 메모리에 함께 로드하지 않는다.

`InstitutionFact`는 Institution을 참조하는 별도 versioned consistency boundary로 구현할 수 있다.

## 22.2 Opportunity Aggregate

Root:

```text
Opportunity
```

책임:

- canonical identity
- owning Institution
- kind
- publication state
- stable public identity
- truth provider mode: LEGACY_BACKED / NATIVE

전체 version history를 root 안에 컬렉션으로 로드하는 모델을 요구하지 않는다.

verified state update는 Application Service + truth persistence boundary가 처리한다.

## 22.3 Source Aggregate

Root:

```text
Source
```

Observation/Snapshot은 append-only operational records로 독립 확장 가능하다.

## 22.4 User Aggregate

Root:

```text
User
```

AuthIdentity/Profile은 User identity context에 속한다.

ConsentDecision은 append-only history이므로 별도 persistence boundary를 가질 수 있다.

## 22.5 Follow Aggregate

Root:

```text
Follow
```

User/Institution aggregate를 내부에 소유하지 않는다.

ID reference만 가진다.

## 22.6 Notification Aggregate

Root:

```text
Notification
```

수천 개의 Delivery를 child collection으로 로드하지 않는다.

NotificationDelivery는 별도 aggregate root다.

## 22.7 Article Aggregate

Root:

```text
Article
```

Institution/Opportunity relationship은 explicit association이며 대상 aggregate를 소유하지 않는다.

---

# 23. Cross-Aggregate Transaction Rules

DDD aggregate가 다르다고 해서 DB transaction을 반드시 분리하는 것은 아니다.

PREPPY는 Modular Monolith + PostgreSQL이므로 다음 critical transaction은 cross-aggregate atomicity를 허용한다.

## 23.1 Verified Opportunity Change Transaction

```text
Verify current state
+ write new verified version
+ attach evidence
+ supersede previous current
+ create OpportunityChange
+ audit
+ create Outbox event
COMMIT
```

단, external Email send는 포함하지 않는다.

## 23.2 Follow Activation Transaction

```text
validate active User
+ validate monitorable/public Institution
+ idempotent Follow activation
+ audit/domain event persistence
COMMIT
```

## 23.3 Article Publish Transaction

```text
validate sanitized content
+ publication state
+ structured relations
+ SEO publication metadata
+ audit/domain event
COMMIT
```

---

# 24. Domain Invariant Summary

다음 invariants는 `04_DATA_MODEL.md`에서 가능한 한 DB constraint와 transaction으로 강화한다.

## Institution

1. Institution은 canonical identity다.
2. legacy School은 optional compatibility mapping이다.
3. Native 영유 Institution은 School 없이 존재 가능하다.
4. Published Institution은 최소 official Source를 가진다.
5. `updated_at`을 `Last Verified`로 사용하지 않는다.

## Opportunity

1. Opportunity는 반드시 하나의 Institution에 속한다.
2. Opportunity는 AdmissionEvent 없이 존재 가능하다.
3. Opportunity↔AdmissionEvent는 최대 1:1 optional bridge다.
4. 과거 verified truth를 overwrite하지 않는다.
5. current verified state는 최대 하나다.
6. Published Opportunity는 verified truth + evidence를 가진다.
7. Shadow School/Cycle을 생성하지 않는다.
8. OpportunityChange는 truth가 아니라 immutable change signal이다.

## User

1. User PK는 Kakao ID가 아니다.
2. provider subject는 한 active User에만 연결된다.
3. email은 User identity가 아니다.
4. 필수 Consent 미충족 User는 ACTIVE가 될 수 없다.

## Follow

1. 동일 User–Institution active Follow 최대 하나.
2. Follow는 idempotent.
3. Follow와 Email preference는 별도.
4. 과거 signal을 retroactive email로 자동전송하지 않는다.

## Notification

1. 동일 signal/policy canonical Notification 중복 금지.
2. 동일 Notification/User/Channel logical Delivery 중복 금지.
3. Notification != Email.
4. external send는 core transaction 외부.
5. send 직전 eligibility 재검증.

## Article

1. Article은 truth source가 아니다.
2. content는 sanitized 상태로 publish.
3. Preview는 noindex.
4. Published slug 변경은 redirect/canonical migration 대상.
5. structured relation은 HTML link와 별도.

---

# 25. State Machine Summary

## 25.1 Institution

```text
DRAFT
  ↓
PUBLISHED
 ↙      ↘
HIDDEN   ARCHIVED
  ↓
PUBLISHED
```

Operational state는 별도:

```text
UNKNOWN ↔ ACTIVE ↔ INACTIVE
                 ↓
               CLOSED
```

정확한 transition restriction은 Data Model/PRD에서 보강한다.

## 25.2 Opportunity

Publication:

```text
DRAFT → PUBLISHED ↔ HIDDEN → ARCHIVED
```

Business:

```text
UNKNOWN
  ↓
UPCOMING → OPEN → CLOSED → COMPLETED
    \        \        \
     \        └────→ CANCELLED
      └────────────→ CANCELLED
```

공식 Source에 따라 일부 state를 건너뛸 수 있다.

## 25.3 User

```text
PENDING → ACTIVE → SUSPENDED
             ↓         ↓
           DELETED ←───┘
```

## 25.4 Follow

```text
ACTIVE ↔ INACTIVE
```

## 25.5 Consent

```text
GRANTED ↔ REVOKED
```

각 decision은 history로 남고 effective state를 projection한다.

## 25.6 Article

```text
DRAFT → PUBLISHED ↔ UNPUBLISHED
            ↓           ↓
          ARCHIVED ←────┘
```

## 25.7 NotificationDelivery

```text
PENDING → QUEUED → SENT → DELIVERED → OPENED → CLICKED
   │         │       │
   ├─────────┴────→ FAILED
   └──────────────→ SUPPRESSED
```

---

# 26. Domain Event Catalog

## Institution

```text
InstitutionCreated
InstitutionPublished
InstitutionHidden
InstitutionArchived
InstitutionOperationalStateChanged
InstitutionFactVerified
InstitutionSourceBound
InstitutionSlugChanged
```

## Opportunity

```text
OpportunityCreated
OpportunityVerified
OpportunityPublished
OpportunityChanged
OpportunityBusinessStateChanged
OpportunityCancelled
OpportunityHidden
OpportunityArchived
OpportunitySourceBound
OpportunitySlugChanged
```

## Identity

```text
UserRegistered
UserActivated
AuthIdentityLinked
UserProfileUpdated
ConsentGranted
ConsentRevoked
NotificationPreferenceChanged
UserDeleted
```

## Follow

```text
FollowActivated
FollowDeactivated
FollowReactivated
```

## Notification

```text
NotificationCreated
NotificationReady
NotificationCompleted
NotificationCancelled
NotificationDeliveryCreated
NotificationDeliveryQueued
NotificationDeliverySent
NotificationDeliveryDelivered
NotificationDeliveryOpened
NotificationDeliveryClicked
NotificationDeliveryFailed
NotificationDeliverySuppressed
```

## Editorial

```text
ArticleCreated
ArticlePublished
ArticleUpdated
ArticleUnpublished
ArticleArchived
ArticleSlugChanged
ArticleInstitutionLinked
ArticleOpportunityLinked
```

모든 Domain Event를 반드시 Event Store에 저장하라는 의미는 아니다.

필요한 이벤트만 Outbox/Audit/Analytics integration event로 materialize한다.

PREPPY는 Full Event Sourcing을 사용하지 않는다.

---

# 27. Domain Event vs Integration Event

예:

```text
Domain:
OpportunityChanged

Persisted state:
OpportunityChange

Integration:
OpportunityChangePublishedToOutbox

Consumers:
Notification
Cache Revalidation
Analytics
```

원칙:

1. Domain Event는 business 의미를 표현한다.
2. Integration Event는 process 간 전달 계약을 표현한다.
3. Outbox payload는 Domain Entity 자체의 전체 serialization이 아니다.
4. 외부 consumer가 DB 내부 legacy ID를 알아야 하는 구조를 피한다.
5. canonical Institution/Opportunity ID를 전달한다.

---

# 28. Legacy Compatibility Domain Rules

## 28.1 Legacy School

Legacy School:

- existing history root
- compatibility identity

PREPPY Institution:

- canonical public identity
- Follow target
- Analytics target

둘을 혼동하지 않는다.

## 28.2 Legacy AdmissionEvent

Legacy AdmissionEvent:

- existing verified history engine

PREPPY Opportunity:

- canonical public/product identity

Bridge가 존재하는 경우 existing Event history를 재사용한다.

## 28.3 Legacy Subscriber / Subscription

기존 Subscriber/Subscription은 PREPPY User/Follow로 의미상 승격시키지 않는다.

실제 production data가 확인되면 migration candidate로만 취급한다.

## 28.4 Legacy Alert / AlertDelivery

legacy history로 유지한다.

PREPPY canonical Notification/Delivery의 row model로 변형하지 않는다.

재사용 대상은 reliability pattern이다.

## 28.5 Guides / Updates

canonical Article로 신규 write하지 않는다.

기존 데이터 존재가 확인될 경우 migration source로만 사용한다.

---

# 29. Future Expansion Boundary

PREPPY 장기 Phase 3:

- 캠프
- 방과후
- 예체능
- 체험
- 해외 교육 프로그램

이들은 Admissions Opportunity의 kind를 계속 추가해서 표현하지 않는다.

금지:

```text
AdmissionsOpportunity.kind = CAMP
AdmissionsOpportunity.kind = AFTER_SCHOOL
```

향후 별도 bounded context:

```text
EducationOpportunity / Program / Experience
```

를 설계한다.

Institution과 연결될 수는 있지만:

```text
Institution
→ Admission Opportunity
```

의 하위단계라는 의미를 갖지 않는다.

---

# 30. MVP Simplification Rules

확장 가능성을 핑계로 다음을 지금 만들지 않는다.

- generic Entity/Target framework
- universal Opportunity model
- multi-child family graph
- multi-channel messaging engine UI
- recommendation engine
- ranking domain
- community domain
- review/rating domain
- advertising domain
- lead marketplace
- campaign manager
- automated crawler domain implementation
- data warehouse domain
- microservice boundary
- complex RBAC

현재 Domain Model은 미래 확장 **경계만 보존**하고 MVP 구현은 최소화한다.

---

# 31. Decisions Locked by This Document

`04_DATA_MODEL.md`에서 특별한 Repository blocker가 발견되지 않는 한 다음 결정을 뒤집지 않는다.

### DM-001
PREPPY의 canonical 교육기관은 `Institution`이다.

### DM-002
MVP public category는 `영유 / 사립초 / 국제학교` 세 가지다.

### DM-003
국제학교/외국인학교 legacy distinction은 public primary category가 아니라 secondary classification으로 보존한다.

### DM-004
Opportunity는 Institution의 속성이 아니라 독립 Aggregate/Public Entity다.

### DM-005
Admission Opportunity와 미래 Camp/Program Opportunity를 universal entity로 합치지 않는다.

### DM-006
Opportunity Kind에는 `CONSULTATION`과 `LEVEL_TEST`를 독립 의미로 포함한다.

### DM-007
Opportunity publication state, business state, verification state를 분리한다.

### DM-008
Opportunity↔AdmissionEvent는 optional 최대 1:1 bridge다.

### DM-009
Native Opportunity는 AdmissionCycle/AdmissionEvent 없이 존재할 수 있다.

### DM-010
Native Opportunity는 자체 verified version/evidence/history path를 갖는다.

### DM-011
Shadow/compatibility School·Cycle을 native Opportunity 저장을 위해 생성하지 않는다.

### DM-012
`OpportunityChange`가 legacy/native change를 정규화하는 product-level signal이다.

### DM-013
`Last Verified`는 scope별 provenance에서 계산하며 `updated_at`을 대신 사용하지 않는다.

### DM-014
User는 Kakao ID나 Email과 동일하지 않은 canonical identity다.

### DM-015
Consent와 NotificationPreference는 분리한다.

### DM-016
Follow는 User↔Institution Monitoring delegation relationship이다.

### DM-017
동일 User↔Institution active Follow는 최대 하나이며 reactivation을 허용한다.

### DM-018
Follow 이후 signal만 기본 Notification 대상이며 과거 변경을 소급발송하지 않는다.

### DM-019
수신 eligibility는 signal 시점과 실제 send 직전 모두 현재 정책을 검증한다.

### DM-020
Notification은 signal-level aggregate이고 Delivery는 recipient/channel-level 별도 aggregate다.

### DM-021
신규 Notification/Delivery는 legacy Alert/Delivery와 병렬 canonical model이다.

### DM-022
Article은 Institution/Opportunity truth의 원본이 아니다.

### DM-023
Article↔Institution, Article↔Opportunity는 구조적 many-to-many relation이다.

### DM-024
UPDATE Article은 OpportunityChange를 소비할 수 있지만 Opportunity truth를 생성하지 않는다.

### DM-025
User deletion은 auth/profile/follow/preference를 종료시키되 비식별 operational history 보존 가능성을 남긴다.

---

# 32. Requirements Passed to 04_DATA_MODEL.md

다음은 이제 Product/Domain 질문이 아니라 PostgreSQL 물리 설계 질문이다.

## 32.1 Institution

- Institution PK type
- canonical slug constraint
- InstitutionCategory physical enum/check
- international subtype representation
- Institution↔LegacySchool 1:1 mapping constraint
- operational/publication state representation
- Institution Fact versioning의 MVP 범위
- Institution profile verification storage

## 32.2 Opportunity

- Opportunity PK/slug
- Opportunity kind/status/publication enum/check
- optional AdmissionEvent bridge FK
- 1:1 bridge uniqueness
- Institution–School–Cycle aggregate consistency constraint
- Native OpportunityVersion schema
- current version uniqueness
- version lineage constraints
- OpportunityVersionEvidence schema
- OpportunityChange physical schema/dedupe
- current projection/index

## 32.3 Trust

- InstitutionSourceBinding
- OpportunitySourceBinding
- unique/index
- Evidence FK
- manual provenance representation

## 32.4 User

- User/AuthIdentity/Profile normalization
- provider+subject uniqueness
- ConsentDecision schema
- effective consent query/index
- NotificationPreference schema
- email verification/deliverability state

## 32.5 Follow

- one logical row vs follow episodes
- active uniqueness
- reactivation timestamps/history
- indexes for follower resolution

## 32.6 Notification

- Notification trigger FK strategy
- signal/policy dedupe key
- NotificationDelivery uniqueness
- recipient snapshot fields
- provider attempt history
- Outbox dedupe/claim/lease/error/dead-letter fields

## 32.7 Article

- Article schema
- sanitized HTML storage
- slug history/redirect registry
- ArticleInstitution relation
- ArticleOpportunity relation
- relation indexes
- legacy Guide/Update conditional backfill

## 32.8 Metrics

- Active Monitoring Parents query index
- Notification eligibility query index
- My Preppy current read model indexes

---

# 33. Domain Model Acceptance Tests

`04_DATA_MODEL.md`와 구현 설계는 최소 다음 시나리오를 자연스럽게 표현할 수 있어야 한다.

## Scenario 1 — Native 영유 Opportunity

```text
영유 Institution 생성
→ Legacy School 없음
→ 추가모집 Opportunity 생성
→ 공식 홈페이지 Source 연결
→ Admin 검증
→ Native OpportunityVersion 생성
→ Evidence 연결
→ Opportunity publish
```

가짜 School/Cycle/Event가 없어도 정상 동작해야 한다.

## Scenario 2 — Legacy 국제학교 Event 재사용

```text
Legacy School
→ Institution bridge
→ Existing AdmissionEvent
→ Opportunity bridge
→ Existing AdmissionEventVersion history
→ Public Opportunity Current State
```

기존 history가 손실되지 않아야 한다.

## Scenario 3 — Follow after Kakao Signup

```text
Anonymous
→ Follow click
→ Kakao login
→ User ACTIVE
→ Follow ACTIVE
```

Email subscription/cycle subscription 없이 성립해야 한다.

## Scenario 4 — Opportunity Date Change

```text
User Follow ACTIVE
→ Opportunity date verified change
→ OpportunityChange
→ Notification
→ one Delivery per eligible User
→ Email
```

retry되어도 중복 email이 없어야 한다.

## Scenario 5 — Follow after Old Change

```text
Opportunity changed yesterday
→ User follows today
```

과거 change email을 자동발송하지 않는다.

My Preppy에서는 최근 변경을 보여줄 수 있다.

## Scenario 6 — Preference Revoked Before Send

```text
Notification created
→ Delivery pending
→ User disables Email
→ worker send
```

Email이 발송되지 않고 Delivery가 suppressed될 수 있어야 한다.

## Scenario 7 — Article Update

```text
Opportunity verified change
→ optional UPDATE Article publish
→ Article links Opportunity
```

Article이 Opportunity truth를 다시 overwrite하지 않는다.

## Scenario 8 — User Deletes Account

```text
User DELETE
→ Auth disabled
→ PII erased/anonymized
→ Follows inactive
→ preferences disabled
→ pending deliveries suppressed
→ historical non-PII delivery/audit integrity retained
```

## Scenario 9 — Institution Closed

```text
Institution operational state CLOSED
→ public/archive policy applied
→ new Follow disallowed
→ active Monitoring/Notification policy stops
→ historical Opportunity/Article links remain resolvable or redirected
```

## Scenario 10 — Source Becomes Broken

```text
Official Source marked BROKEN
```

과거 Evidence와 verified history가 삭제되지 않아야 한다.

---

# 34. Domain Model Definition of Done

이 Domain Model이 완료된 것으로 보는 조건:

1. PREPPY의 7개 핵심 Domain 용어가 서로 중복되지 않는다.
2. Institution과 legacy School의 의미가 분리된다.
3. Opportunity와 AdmissionEvent의 의미가 분리된다.
4. Native Opportunity가 legacy tree 없이 verified history를 가질 수 있다.
5. legacy/native Opportunity가 하나의 Product contract로 노출된다.
6. Source / Evidence / Verification / Last Verified의 의미가 명확하다.
7. User / AuthIdentity / Profile / Consent / Preference가 분리된다.
8. Follow가 Subscription/Bookmark가 아닌 Monitoring delegation으로 정의된다.
9. Notification과 Delivery가 분리된다.
10. Notification eligibility의 시간 규칙이 정의된다.
11. Article이 truth source가 아님이 명확하다.
12. Future Education Opportunities가 Admissions hierarchy와 분리된다.
13. 주요 state transition과 invariant가 정의된다.
14. Data Model이 결정해야 할 물리 질문이 명확히 분리된다.

---

# 35. Final Domain Model

PREPPY MVP의 canonical Domain 흐름은 다음이다.

```text
                    ┌───────────────┐
                    │    Article    │
                    └──────┬────────┘
                           │ discovery / relation
                           ▼
┌──────────┐       ┌───────────────┐
│   User   │       │  Institution  │
└────┬─────┘       └──────┬────────┘
     │                     │
     │ Follow              │ owns
     ▼                     ▼
┌──────────┐       ┌───────────────┐
│  Follow  │       │  Opportunity  │
└────┬─────┘       └──────┬────────┘
     │                     │
     │                     │ verified through
     │                     ▼
     │              ┌───────────────┐
     │              │ Trust/Source  │
     │              │ Evidence      │
     │              └──────┬────────┘
     │                     │
     │                     ▼
     │              OpportunityChange
     │                     │
     └─────────────────────┤ recipient eligibility
                           ▼
                    ┌───────────────┐
                    │ Notification  │
                    └──────┬────────┘
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

Opportunity 내부 verified truth는 다음 두 경로를 사용한다.

```text
Legacy-backed
Opportunity
  ↓ optional bridge
AdmissionEvent
  ↓
AdmissionEventVersion
  ↓
Evidence

Native
Opportunity
  ↓
OpportunityVersion
  ↓
Evidence
```

두 경로 모두:

```text
Current Verified Opportunity State
→ OpportunityChange
→ Follow Eligibility
→ Notification
```

이라는 동일한 Product Domain 계약으로 수렴한다.

---

# 36. Next Step

다음 문서는:

`04_DATA_MODEL.md`

이다.

`04_DATA_MODEL.md`의 목적은 이 Domain Model을 PostgreSQL/Drizzle 기준으로 구체화하는 것이다.

특히 다음 P0를 확정해야 한다.

1. Institution / LegacySchool mapping
2. Opportunity / AdmissionEvent optional bridge
3. Native Opportunity version/evidence/history
4. Institution Fact verification 최소 모델
5. User / AuthIdentity / Consent / Preference
6. active Follow uniqueness와 history
7. canonical Notification / Delivery / Outbox integrity
8. Article / structured relations
9. additive migration sequence
10. DB-level invariant와 integration test strategy

`04_DATA_MODEL.md` 작성 전까지 Production migration이나 feature implementation을 시작하지 않는다.
