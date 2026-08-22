# 02_TARGET_ARCHITECTURE.md

> **Project:** PREPPY (프레피)  
> **Document Type:** Target System Architecture  
> **Status:** Target v1.0 — Repository validation required before migration/implementation  
> **Decision Baseline:** `00_PRODUCT_REQUIREMENTS_BASELINE.md`  
> **Audit Input:** `01_EXISTING_ARCHITECTURE_AUDIT.md`  
> **Purpose:** PREPPY MVP의 Product Loop를 가장 빠르게 구현하면서도 AdmissionRadar에서 이미 구축한 신뢰·이력·전달 기반을 보존하고, 향후 School Intelligence / Education Opportunities / Personal Education Intelligence로 확장할 수 있는 목표 아키텍처를 정의한다.

---

# 0. Document Role

이 문서는 상세 PRD, 최종 Domain Model, 최종 Data Model 또는 Implementation Plan이 아니다.

이 문서의 역할은 다음과 같다.

1. Architecture Audit에서 발견된 P0 문제에 대해 **목표 구조와 경계**를 확정한다.
2. 기존 AdmissionRadar에서 유지할 자산과 PREPPY 기준으로 교체할 자산의 결합 방식을 정의한다.
3. `Institution / Opportunity / Source / User / Follow / Notification / Article`의 상위 모듈 경계를 확정한다.
4. Manual-first Monitoring이 실제 End-to-End Product Loop로 연결되는 방식을 정의한다.
5. 기존 데이터와 이력을 파괴하지 않는 **additive migration 전략**을 정의한다.
6. Public Web / Admin / Worker / Database / External Adapter의 책임을 정의한다.
7. 이후 `03_DOMAIN_MODEL.md`, `04_DATA_MODEL.md`, 상세 Architecture 문서와 PRD가 따라야 할 구조적 제약을 제공한다.

이 문서에서는 테이블명과 API 형태를 일부 예시로 제시하지만, 컬럼·제약·Aggregate lifecycle의 최종 정의는 `03_DOMAIN_MODEL.md`와 `04_DATA_MODEL.md`에서 확정한다.

---

# 1. Architecture Objective

PREPPY MVP의 Architecture가 가장 먼저 지원해야 하는 End-to-End 흐름은 다음이다.

```text
Google / Naver / Community
        ↓
Article / Institution / Opportunity
        ↓
Discover / Compare
        ↓
Follow Intent
        ↓
Kakao Signup
        ↓
Institution Follow
        ↓
Manual Monitoring / Verification
        ↓
Verified Change / New Opportunity
        ↓
Notification
        ↓
Email Delivery
        ↓
Return
```

Architecture의 목표는 시스템을 크게 만드는 것이 아니다.

핵심 목표는 다음 세 Engine을 하나의 Modular Monolith 안에서 안정적으로 연결하는 것이다.

```text
Editorial
= Organic Acquisition Engine

Institution + Admissions + Trust
= Discovery / Comparison / Trust Engine

Identity + Follow + Monitoring + Notification
= Activation / Retention Engine
```

---

# 2. Architecture Principles

## 2.1 Architecture for Extension, Implementation for Validation

장기 확장을 수용할 수 있는 경계를 설계하되, MVP Non-Scope 기능을 미리 구현하지 않는다.

예:

- Notification Domain은 채널 중립적으로 설계하지만 MVP에서는 Email만 구현한다.
- AuthIdentity는 provider를 분리하지만 MVP에서는 Kakao만 구현한다.
- Monitoring input은 사람이든 자동 Collector든 동일한 Verification 경로로 들어올 수 있게 하되 MVP에서는 Manual만 구현한다.
- 미래 Education Opportunities가 붙을 수 있는 경계를 남기되 캠프·방과후 Domain은 구현하지 않는다.

## 2.2 Modular Monolith First

PREPPY는 **Next.js + TypeScript 기반 Modular Monolith**를 유지한다.

현재 규모에서 Microservice는 사용하지 않는다.

모듈은 코드와 Domain boundary로 분리하지만 다음을 공유한다.

- 하나의 Repository
- 하나의 Application deployment unit
- 하나의 PostgreSQL
- 하나의 migration ownership
- 하나의 shared observability model

필요하면 Worker/Scheduler는 동일 Repository와 Domain/Application code를 사용하는 별도 runtime role로 실행할 수 있다.

## 2.3 PostgreSQL Is the Operational Source of Truth

Product state와 Monitoring state의 시스템 기준은 PostgreSQL이다.

GA4, Email Provider, Search Console 등 외부 시스템을 비즈니스 상태의 원본으로 사용하지 않는다.

예:

- Follow 상태 → PostgreSQL
- Notification delivery 상태 → PostgreSQL
- Last Verified → PostgreSQL
- Active Monitoring Parents → PostgreSQL에서 재현 가능
- GA4 → 행동 분석/획득 분석

## 2.4 Strong Integrity over Generic Flexibility

기존 Architecture의 강점인 PK/FK, uniqueness, lineage, dedupe, audit 원칙을 유지한다.

범용성을 이유로 다음과 같은 구조를 남발하지 않는다.

```text
entity_type + entity_id
```

가능하면 다음처럼 FK가 살아 있는 관계를 사용한다.

```text
institution_sources
opportunity_sources
article_institutions
article_opportunities
```

## 2.5 Preserve History, Expose Current Projection

사용자에게는 현재의 검증된 상태를 빠르게 보여주고, 내부적으로는 변경 이력과 Evidence를 보존한다.

Public read path가 append-only history 구조를 그대로 노출할 필요는 없다.

```text
Historical / Versioned Write Model
        ↓
Current Verified Projection
        ↓
Public UI / SEO
```

## 2.6 Admin Must Use the Same Domain Rules

Admin은 DB를 직접 편집하는 우회 경로가 아니다.

Admin에서 기관·Opportunity를 수정하더라도 Application Service를 통해:

- Validation
- Version / History
- Evidence
- Change detection
- Audit
- Outbox

규칙을 동일하게 적용한다.

## 2.7 External Side Effects Are Never Inside Core DB Transactions

Email 전송 같은 외부 I/O는 핵심 데이터 변경 transaction 안에서 실행하지 않는다.

DB commit과 외부 작업의 일관성은 기존 Outbox 패턴을 유지한다.

---

# 3. Audit Decisions Resolved

Architecture Audit에서 제시한 핵심 P0 문제를 다음과 같이 해결한다.

| Audit Issue | Target Decision |
|---|---|
| canonical Institution 및 영유 타입 부재 | 신규 canonical `Institution`을 도입하고 기존 `schools`를 additive bridge로 연결한다. |
| Opportunity 독립 도메인 부재 | Product-level `Opportunity` identity를 신설하고 기존 `admission_events` 및 versions를 Admission engine으로 재사용한다. |
| Kakao User/Profile/Follow 부재 | `User / AuthIdentity / Profile / Consent / Follow / NotificationPreference` 책임을 분리해 신규 도입한다. |
| Notification이 legacy Subscription·Email에 결합 | Product-level `Notification`과 channel delivery를 분리하며 기존 Outbox/Dedupe를 재사용한다. |
| Article CMS·SEO Acquisition 경로 부재 | `Article`을 통합 Editorial Domain으로 신규 도입하고 Institution/Opportunity relation을 구조화한다. |

---

# 4. Target System Context

```text
                         ┌─────────────────────┐
                         │ Google / Naver      │
                         │ Community / Kakao   │
                         └─────────┬───────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────┐
│                         PREPPY                               │
│                                                              │
│  Public Web ── Identity ── Follow ── My Preppy              │
│      │                                      │                │
│      ├── Institution / Opportunity          │                │
│      ├── Article / SEO                      │                │
│      └── Trust / Last Verified              │                │
│                                             │                │
│  Admin ── Monitoring / Verification ── Change               │
│                                             │                │
│                                             ▼                │
│                                      Notification            │
│                                             │                │
│                                      Outbox / Worker          │
└───────────────────────┬─────────────────────┼────────────────┘
                        │                     │
                        ▼                     ▼
                 ┌────────────┐       ┌──────────────┐
                 │ PostgreSQL │       │ Email Provider│
                 └────────────┘       └──────────────┘
                        │
                        ├────────── Kakao OAuth
                        ├────────── GA4
                        └────────── Google Search Console
```

---

# 5. Runtime Architecture

PREPPY는 최소 세 가지 runtime responsibility로 본다.

## 5.1 Web Runtime

책임:

- Public pages
- SSR/SSG/ISR rendering
- Public search/filter
- Institution / Opportunity / Article read
- Kakao Auth flow
- Follow mutation
- My Preppy
- Admin UI
- Admin application commands
- Internal API / Server Actions

## 5.2 Worker Runtime

동일 Repository의 application/domain code를 사용한다.

책임:

- Outbox consume
- Notification target resolution
- Email delivery
- delivery retry
- scheduled monitoring reminders/jobs
- 향후 automated collector execution

MVP에서는 별도 복잡한 queue cluster를 사용하지 않는다.

PostgreSQL Outbox를 작업 원본으로 유지하고 단일 worker 또는 scheduled execution으로 충분하다.

## 5.3 Database Runtime

PostgreSQL이 다음의 기준 상태를 보유한다.

- Institution
- Admissions / Opportunity
- Source / Evidence / Verification
- historical versions
- User / Identity / Follow / Preferences
- Article
- Notification / Delivery / Outbox
- operational audit state

---

# 6. Target Module Boundaries

최상위 모듈은 다음과 같이 구성한다.

```text
src/
  modules/
    institution/
    admissions/
    trust/
    identity/
    follow/
    notification/
    editorial/
    analytics/
    admin/
  infrastructure/
    db/
    auth/
    email/
    analytics/
    jobs/
  app/
    (public)/
    (account)/
    admin/
    api/
```

정확한 directory naming은 구현 단계에서 조정할 수 있지만 **모듈 책임의 경계는 유지**한다.

---

# 7. Institution Architecture

## 7.1 Decision

`Institution`을 PREPPY의 canonical 교육기관 identity로 신설한다.

기존 `schools`는 바로 삭제하거나 물리 rename하지 않는다.

이유:

- 기존 AdmissionRadar FK가 광범위하다.
- Admission cycle/event/version history를 보존해야 한다.
- 영유는 기존 school type constraint로 표현되지 않는다.
- 지금 물리 rename을 하면 MVP와 무관한 migration blast radius가 커진다.

## 7.2 Target Relationship

```text
Institution (canonical PREPPY identity)
        │
        ├── Institution Profile / Category-specific data
        ├── Sources
        ├── Opportunities
        ├── Follows
        └── Articles

Legacy School
        │
        └── Institution ↔ School Bridge
                │
                └── existing AdmissionCycle / Event / Fact history
```

## 7.3 Migration Strategy

초기에는 다음 additive 전략을 사용한다.

```text
schools
   ↓ backfill
institutions
   ↕ 1:1 bridge for legacy school-backed institutions
institution_school_links
```

이후 기존 Admission 구조에 필요한 곳부터 `institution_id`를 추가하고 backfill한다.

Public PREPPY code는 가능한 한 `institution_id`를 canonical ID로 사용한다.

Legacy `school_id`는 AdmissionRadar compatibility ID로 취급한다.

## 7.4 Institution Type

MVP에서 최소 다음 타입을 표현할 수 있어야 한다.

- 영유
- 사립초
- 국제학교

기존 `PRIVATE_ELEMENTARY / INTERNATIONAL_SCHOOL / FOREIGN_SCHOOL` 구분은 데이터 migration 시 보존한다.

정확한 taxonomy와 국제학교/외국인학교의 공개 분류 규칙은 `03_DOMAIN_MODEL.md`에서 확정한다.

Architecture 수준의 원칙은 **Institution identity가 현재 세 타입에 하드코딩되어 확장을 막지 않아야 한다**는 것이다.

## 7.5 Category-specific Attributes

Institution 하나에 모든 타입별 컬럼을 계속 추가하는 mega-table을 지양한다.

공통 정보는 canonical Institution에 두고, 타입별로 구조가 크게 다른 정보는 extension boundary를 허용한다.

정확한 physical schema는 `04_DATA_MODEL.md`에서 결정한다.

---

# 8. Admissions / Opportunity Architecture

## 8.1 Bounded Context Decision

MVP의 `Opportunity`는 **Admissions bounded context의 핵심 public entity**다.

여기서 Opportunity는 다음과 같은 입학 관련 행동 기회를 의미한다.

- 신규모집
- 추가모집
- 설명회
- 상담
- 레벨테스트
- Application
- Open House
- Assessment
- Interview
- 원서접수
- 추첨
- 등록

장기 Phase 3의 캠프·방과후·예체능·체험 등 **Education Opportunities와 동일한 universal entity로 만들지 않는다.**

즉 미래에는 다음과 같이 병렬 bounded context가 가능하다.

```text
Admissions
  └── Opportunity

Education Opportunities (future)
  └── Camp / Program / Experience ...
```

## 8.2 Reuse Existing Admission Engine

기존 `admission_events` 및 version history는 폐기하지 않는다.

Target 구조:

```text
Opportunity
  ├── canonical public identity
  ├── institution_id
  ├── kind / lifecycle
  ├── slug / publication state
  └── legacy admission event bridge
          ↓
     admission_events
          ↓
     admission_event_versions
          ↓
     evidence / historical lineage
```

## 8.3 Why a Product-level Opportunity Identity Is Needed

기존 AdmissionEvent는 내부 cycle event로는 강하지만 다음 제품 요구를 충분히 표현하지 못한다.

- 독립 public URL
- SEO identity
- Institution과 직접 연결되는 현재 Opportunity 목록
- 공개/비공개 상태
- Product analytics object ID
- 향후 UI에서 안정적인 deep link

따라서 `Opportunity`가 public/product identity를 소유하고 기존 AdmissionEvent engine은 history/verification engine으로 재사용한다.

## 8.4 AdmissionCycle

기존 AdmissionCycle은 제거하지 않는다.

Cycle은 다음 목적에서 유효하다.

- 학년도/지원주기 grouping
- historical context
- 여러 Admission events의 관계

그러나 Public Product의 primary discovery unit은 Cycle이 아니라 Institution과 Opportunity다.

```text
Public Navigation:
Institution → Opportunity

Internal Admission Context:
Institution → AdmissionCycle → AdmissionEvent Versions
```

---

# 9. Trust / Source / Verification Architecture

## 9.1 Preserve Existing Trust Engine

다음 기존 자산은 KEEP한다.

- source registry
- source authority
- source monitoring configuration
- observations
- snapshots
- detected changes
- meaningful changes
- evidence
- append-only version history
- lineage
- deduplication

## 9.2 Decouple Source Binding from Legacy School/Cycle

Source 자체는 재사용하되 target binding을 PREPPY Domain에 맞게 확장한다.

권장 관계:

```text
Source
 ├── InstitutionSourceBinding
 └── OpportunitySourceBinding
```

Generic `target_type + target_id` polymorphic FK보다 명시적인 relation을 우선한다.

AdmissionCycle 수준 source가 실제 운영에 필요하면 별도 명시적 binding으로 유지할 수 있다.

## 9.3 Last Verified

`Last Verified`는 단순 UI timestamp가 아니다.

공개되는 핵심 fact 또는 Opportunity의 검증 상태에서 파생되어야 한다.

Architecture는 다음을 구분한다.

- Source가 마지막으로 확인된 시점
- 특정 Opportunity/current version이 마지막으로 검증된 시점
- Institution profile field가 마지막으로 검증된 시점

어떤 값을 Public UI의 `Last Verified`로 노출할지는 Domain Model에서 규칙을 확정한다.

## 9.4 Editorial References Are Not Monitoring Sources

Article이 외부 링크를 포함할 수 있지만 Article reference와 Monitoring Source는 같은 의미가 아니다.

- Monitoring Source: 공식 정보 검증을 위한 operational source
- Editorial reference: Article의 근거/추가 읽기 링크

두 개념을 억지로 하나의 lifecycle로 합치지 않는다.

---

# 10. Manual-first Monitoring Architecture

## 10.1 MVP Monitoring Principle

MVP에서는 자동 수집 성공률이 아니라 사용자가 Monitoring을 맡기는지를 검증한다.

따라서 기본 운영 경로는 다음이다.

```text
Official Source 확인
        ↓
Admin에서 Institution / Opportunity 변경 입력
        ↓
Evidence / Verified Version 생성
        ↓
Meaningful Change 판정
        ↓
Notification Event 생성
        ↓
Outbox commit
        ↓
Worker가 Follow 대상 해석
        ↓
Email Delivery
```

## 10.2 Critical Transaction Boundary

Admin이 검증된 변경을 Publish할 때 하나의 DB transaction 안에서 최소한 다음을 원자적으로 처리한다.

```text
1. current verified state/version 변경
2. evidence 연결
3. change record 기록
4. audit metadata 기록
5. notification-triggering domain event 또는 outbox event 기록
COMMIT
```

Email 전송은 이 transaction 안에서 하지 않는다.

## 10.3 Notification Target Resolution

Worker는 Outbox event를 처리할 때 다음 조건을 사용해 대상자를 결정한다.

- 해당 Institution을 active Follow 중
- 변경 발생 시점 이전 또는 정책상 유효한 시점에 Follow 생성
- Email notification preference ON
- 계정이 active
- 전달 가능한 Email 존재

대상 선정 정책의 정확한 시간 규칙은 Notification 상세 설계에서 확정한다.

## 10.4 Future Automated Collection

향후 Collector가 추가되더라도 verification 이후 경로는 변경하지 않는다.

```text
Today:
Human Observation
    ↓
Verification
    ↓
Publish

Future:
Automated Observation / Snapshot / Diff
    ↓
Human or Policy Verification
    ↓
Publish
```

즉 Collector는 Monitoring Product Contract의 교체 가능한 input adapter다.

---

# 11. Identity / User Architecture

## 11.1 Replace Subscriber-as-User

기존 `subscriber(email)`는 PREPPY User가 아니다.

Target model responsibility:

```text
User
 ├── AuthIdentity
 ├── Profile
 ├── Consent
 └── NotificationPreference
```

## 11.2 User

PREPPY 내부 canonical account identity다.

User는 Kakao account와 동일하지 않다.

향후 모바일 앱이나 다른 provider가 추가되어도 동일 User를 사용할 수 있어야 한다.

## 11.3 AuthIdentity

외부 인증 provider와 User 사이의 mapping을 소유한다.

MVP:

```text
provider = KAKAO
provider_subject = Kakao unique subject/id
```

향후 provider 추가 가능성을 위해 User PK에 Kakao ID를 직접 사용하지 않는다.

## 11.4 Profile

MVP에서 필요한 최소 profile을 관리한다.

- email
- child birth year
- interested regions
- interested education types

자녀 이름, 정확한 생년월일, 소득, 자산 등 불필요한 정보는 수집하지 않는다.

## 11.5 Consent

계정 생성, 개인정보 처리, Email update 등의 동의는 Follow와 분리해서 관리한다.

동의는 최소한 다음 특성을 가져야 한다.

- consent type
- version
- granted/revoked status
- timestamp

정확한 법적 문구나 보존기간은 별도 Privacy/PRD에서 확정한다.

## 11.6 Legacy Subscriber Migration

기존 Subscriber를 이메일이 같다는 이유만으로 자동 User로 생성하거나 Kakao identity에 자동 연결하지 않는다.

필요할 경우 로그인 후 명시적 정책에 따라 verified email matching을 migration hint로 사용할 수 있다.

---

# 12. Follow Architecture

## 12.1 Follow Is a Product Relationship

Follow는 Bookmark가 아니라 Institution Monitoring을 PREPPY에 위임하는 핵심 Product relationship이다.

Canonical relationship:

```text
User ── Follow ── Institution
```

## 12.2 Follow Responsibility

Follow는 다음만 소유한다.

- 누가
- 어떤 Institution을
- 현재 Follow하는지
- 언제 시작/종료했는지

Email ON/OFF나 마케팅 동의를 Follow row 자체에 섞지 않는다.

## 12.3 Notification Preference

Email update preference는 User-level 또는 scope-specific preference 책임으로 분리한다.

MVP에서 UI가 단순 전체 ON/OFF라면 구현은 단순하게 유지하되, Follow identity와 preference를 하나의 개념으로 합치지 않는다.

## 12.4 Follow Intent Before Login

핵심 conversion flow:

```text
Institution Detail
→ Follow Click
→ Pending Follow Intent 저장
→ Kakao Login
→ User 생성/복구
→ Follow idempotent 생성
→ 성공 화면
```

Pending intent는 짧은 수명의 signed session/cookie 또는 server-side temporary state로 처리한다.

Kakao callback 성공 후 동일 Institution Follow가 이미 있으면 중복 생성하지 않는다.

---

# 13. Notification Architecture

## 13.1 Domain Separation

Target 구조:

```text
Meaningful Change / New Opportunity
        ↓
Notification
        ↓
Recipient Resolution
        ↓
Notification Delivery
        ↓
Email Adapter
```

`Notification != Email`이다.

## 13.2 Notification

무엇이 왜 사용자에게 알려져야 하는지를 표현한다.

예:

- 새 Opportunity 공개
- 기존 Opportunity deadline 변경
- 설명회 일정 변경

## 13.3 Notification Delivery

누구에게 어떤 채널로 어떻게 전달했는지를 표현한다.

MVP channel:

```text
EMAIL
```

향후 Push/Kakao 등이 추가되더라도 Notification core를 변경하지 않는다.

## 13.4 Reuse Existing Delivery Infrastructure

기존 Architecture에서 다음은 재사용한다.

- Outbox
- dedupe key
- delivery status
- retry safety
- failure recording

Legacy AdmissionCycle Subscription FK는 제거 또는 bridge하고 canonical target은 User/Follow를 기준으로 재설계한다.

## 13.5 Idempotency

동일 change + recipient + channel에 대해 중복 발송이 발생하지 않도록 DB unique constraint 또는 deterministic dedupe key를 사용한다.

외부 provider retry와 Worker retry가 중첩되어도 동일 이메일이 반복 발송되지 않아야 한다.

---

# 14. Editorial / Article Architecture

## 14.1 Unified Article Domain

기존 `Guides`와 `Updates`를 PREPPY의 canonical CMS 모델로 계속 확장하지 않는다.

신규 `Article`을 Editorial Domain의 기준으로 사용한다.

```text
Article
 ├── lifecycle: draft / published
 ├── title / slug / excerpt
 ├── sanitized content_html
 ├── category/type
 ├── featured image metadata
 ├── author
 ├── SEO metadata
 ├── Institution relations
 └── Opportunity relations
```

## 14.2 CMS Boundary

Admin Article Editor는 다음 흐름을 사용한다.

```text
Editor Input
→ Validate
→ Sanitize HTML
→ Save Draft
→ Preview(noindex)
→ Publish
→ Revalidate public page / sitemap state
```

script, inline JavaScript 등 위험한 콘텐츠는 저장 또는 렌더 전 제거한다.

## 14.3 Structured Relations

Article 내부 링크를 HTML 문자열에만 의존하지 않는다.

```text
Article ↔ Institution
Article ↔ Opportunity
```

관계를 구조화해 다음을 가능하게 한다.

- 관련 Institution block
- 관련 Opportunity block
- Article → Institution conversion analytics
- automatic related content
- future DB-driven information block

## 14.4 Legacy Guides / Updates Migration

기존 Guide/Update 데이터가 존재하면 Article migration input으로 사용한다.

원칙:

- 기존 slug 보존 또는 redirect
- published_at 보존
- SEO metadata 보존 가능한 만큼 backfill
- body Markdown은 sanitized HTML로 변환하거나 migration period 동안 controlled dual-read
- 기존 table은 migration 검증 전 삭제하지 않음

---

# 15. Public Web Architecture

## 15.1 Public Routes

Target public route contract:

```text
/
/institutions
/institutions/{slug}
/opportunities/{slug}
/articles/{slug}
/my-preppy
```

Authentication routes는 provider adapter 하위로 둔다.

예:

```text
/auth/kakao/start
/auth/kakao/callback
```

정확한 Next.js route handler 구성은 Implementation Plan에서 확정할 수 있다.

## 15.2 Legacy Routes

기존 AdmissionRadar의 `/schools`, `/guides`, `/updates` URL이 이미 외부에 노출된 경우 새 canonical route로 301 redirect한다.

아직 실제 public traffic이 없더라도 migration registry를 명확히 두어 route naming이 혼재하지 않게 한다.

## 15.3 Rendering Strategy

Article / Institution / Opportunity는 검색엔진이 최초 HTML에서 핵심 콘텐츠를 읽을 수 있어야 한다.

기본 원칙:

- Server-rendered content
- 필요한 경우 SSG/ISR
- Admin publish/update 시 관련 cache revalidation
- authenticated My Preppy는 dynamic/private rendering
- Admin은 index 대상 아님

## 15.4 Public Read Model

Public UI가 version history table을 직접 조립하지 않도록 Application query layer가 다음 current projection을 제공한다.

예:

```text
InstitutionDetailView
OpportunityDetailView
InstitutionListItem
CurrentOpportunitySummary
ArticleDetailView
MyPreppyInstitutionView
```

초기에는 PostgreSQL query/view/join으로 충분하며 별도 Search Engine이나 CQRS infrastructure는 도입하지 않는다.

---

# 16. SEO Architecture

SEO는 Public Architecture의 P0 capability다.

## 16.1 Indexable Primary Assets

```text
Article
Institution
Opportunity
```

## 16.2 Required SEO Capabilities

- title
- meta description
- canonical
- robots
- Open Graph
- XML sitemap
- breadcrumb
- structured data
- published/modified dates
- redirects
- draft/preview noindex

## 16.3 Internal Linking Graph

```text
Article ↔ Institution ↔ Opportunity
```

핵심 Growth Path:

```text
Search
→ Article
→ Institution / Opportunity
→ Follow
```

SEO metadata는 HTML body parser가 임의 생성하는 부가정보가 아니라 각 public aggregate의 publication state와 함께 관리한다.

## 16.4 Sitemap Strategy

Sitemap에는 다음 조건을 충족한 URL만 포함한다.

- public
- published
- index allowed
- canonical destination

Legacy redirect URL, draft, preview는 포함하지 않는다.

---

# 17. Analytics Architecture

## 17.1 MVP Analytics Split

MVP에서는 두 종류의 데이터를 분리한다.

### Operational Truth — PostgreSQL

- signup complete
- active user
- Follow
- email preference
- Notification delivery
- Active Monitoring Parents

### Behavioral Analytics — GA4

- view
- search
- filter
- CTA click
- article/institution/opportunity navigation
- campaign attribution

## 17.2 Stable Object Identifiers

GA4 event에는 가능한 한 canonical PREPPY ID를 사용한다.

```text
institution_id
opportunity_id
article_id
```

Legacy `school_id`, `admission_event_id`를 Product analytics의 primary key로 사용하지 않는다.

## 17.3 North Star Reproducibility

`Active Monitoring Parents`는 외부 analytics platform에만 의존하지 않는다.

DB 기준 정의:

```text
active User
AND active Institution Follow >= 1
AND email updates enabled
```

정확한 SQL/metric contract는 Analytics 상세 문서에서 확정한다.

## 17.4 Intent Data

MVP에서 별도 warehouse를 구축하지 않는다.

다만 event taxonomy에 object identity와 context를 유지해 향후 GA4 export 또는 별도 analytical storage로 확장할 수 있게 한다.

---

# 18. Admin Architecture

Admin은 Manual-first MVP에서 core infrastructure다.

## 18.1 Admin Modules

```text
Dashboard
Institutions
Opportunities
Sources
Articles
Notifications
Users
```

## 18.2 Admin Responsibilities

### Institutions

- canonical Institution 관리
- category/type-specific 핵심 정보 관리
- publication state
- source 연결

### Opportunities

- Admission Opportunity 생성/수정
- current verified state
- 일정/상태 변경
- evidence 연결
- publish

### Sources

- 공식 source registry
- authority
- binding
- last checked / verification context

### Articles

- CRUD
- Draft / Published
- Visual/HTML Editor
- Preview
- SEO
- relations

### Notifications

- Notification event 확인
- 대상/템플릿 preview
- delivery status/history
- retry visibility

### Users

- 계정 상태
- Follow 상태
- email preference
- 최소 privacy operation

## 18.3 No Direct Table Editing

Admin action은 module application service를 호출한다.

운영자가 버전 이력이나 evidence를 우회해 현재 값을 강제로 덮어쓰는 별도 CRUD path를 만들지 않는다.

## 18.4 Authorization

MVP에서는 복잡한 RBAC를 도입하지 않는다.

최소 원칙:

- Public User와 Admin identity 분리
- `/admin` 접근 guard
- critical mutation은 authenticated admin만 가능
- audit actor 기록

세부 Admin identity provider는 현재 Repository 상태와 deployment 환경 검증 후 확정한다.

---

# 19. Dependency Rules

모듈 간 의존성은 다음 방향을 따른다.

```text
Institution
   ↑
Admissions ──────→ Trust
   ↑               ↑
Follow ← Identity  │
   │               │
   └────→ Notification

Editorial ──references──→ Institution / Admissions

Analytics ← domain/application events

Admin → application services of all modules
```

핵심 규칙:

1. Institution은 Follow/Notification에 의존하지 않는다.
2. Admissions는 User를 몰라야 한다.
3. Follow는 Institution identity를 참조하지만 Institution이 Follow를 참조하지 않는다.
4. Notification은 Follow/Identity를 조회할 수 있지만 core Institution/Admissions write를 소유하지 않는다.
5. Editorial은 Institution/Opportunity를 reference할 수 있지만 Institution publication이 Article 존재에 의존하면 안 된다.
6. Analytics는 core business flow를 block하지 않는다.
7. Admin은 Domain을 우회하지 않고 Application Service를 조합한다.
8. Infrastructure adapter는 Domain/Application 안쪽으로 dependency inversion한다.

---

# 20. Application Service Boundaries

정확한 이름은 구현 단계에서 바뀔 수 있지만 다음 수준의 use case boundary를 권장한다.

## Institution

```text
ListInstitutions
GetInstitutionDetail
CreateInstitution
UpdateInstitutionProfile
PublishInstitution
```

## Admissions

```text
ListOpportunities
GetOpportunityDetail
CreateOpportunity
VerifyOpportunityChange
PublishOpportunity
```

## Identity

```text
StartKakaoLogin
CompleteKakaoLogin
UpdateUserProfile
DeleteAccount
```

## Follow

```text
CreateFollow
RemoveFollow
ListUserFollows
```

## Notification

```text
CreateNotificationFromChange
ResolveRecipients
DispatchEmailDelivery
RetryDelivery
```

## Editorial

```text
CreateArticle
SaveDraft
PreviewArticle
PublishArticle
UpdateArticleRelations
```

Admin UI와 public routes는 이 use case를 재사용한다.

---

# 21. Critical End-to-End Flows

## 21.1 Search / Editorial Acquisition

```text
Search Engine
→ SSR Article
→ Article relation block
→ Institution Detail
→ Follow CTA
```

필수 측정:

```text
article_view
article_to_institution
institution_view
follow_click
```

## 21.2 Follow + Kakao Signup

```text
Anonymous Institution Detail
→ Follow Click
→ pending intent
→ Kakao OAuth
→ AuthIdentity lookup/create
→ User create/recover
→ minimum consent/profile
→ Follow idempotent create
→ My Preppy / success state
```

## 21.3 Manual Monitoring Update

```text
Admin opens official Source
→ verifies new/changed information
→ submits change + evidence
→ Domain validates
→ version/history written
→ current projection updated
→ meaningful change recorded
→ outbox event committed
```

## 21.4 Notification Delivery

```text
Worker consumes outbox
→ resolves eligible followers
→ creates idempotent deliveries
→ renders Email
→ provider send
→ records provider result
→ deep link points to canonical Institution/Opportunity
```

## 21.5 Return

```text
Email click
→ Opportunity / Institution
→ notification_click
→ return attribution
→ related opportunities / My Preppy
```

---

# 22. Transaction Boundaries

## 22.1 Follow Transaction

하나의 transaction에서:

- User 존재 확인
- Institution 존재/공개상태 검증
- duplicate Follow 방지
- Follow 생성/복구
- 필요한 operational audit/event 기록

외부 analytics 전송은 transaction을 block하지 않는다.

## 22.2 Verified Opportunity Change Transaction

하나의 transaction에서:

- 새 verified version 또는 current state 기록
- evidence 연결
- 이전 current state 종료
- change record 생성
- notification-trigger event/outbox 생성

## 22.3 Article Publish Transaction

하나의 transaction에서:

- sanitized content 확인
- publish state 갱신
- SEO metadata 검증
- relation 상태 저장
- publish audit/event 기록

Cache revalidation/Search Console 같은 외부 작업은 commit 이후 실행한다.

## 22.4 Notification Delivery

외부 Email send와 DB state transition을 한 transaction으로 묶지 않는다.

At-least-once Worker execution을 전제로 idempotent delivery key로 중복을 방지한다.

---

# 23. Data Ownership Rules

| Data | Owner Module |
|---|---|
| Institution canonical identity | Institution |
| Admission Cycle/Event/Opportunity | Admissions |
| Source/Evidence/Observation/Verification | Trust |
| User/AuthIdentity/Profile/Consent | Identity |
| Institution Follow | Follow |
| Notification/Delivery/Outbox orchestration | Notification |
| Article/SEO metadata/relations | Editorial |
| GA4 event contract / metric definitions | Analytics |
| Admin audit actor/context | Admin + shared audit infrastructure |

한 모듈이 다른 모듈의 table을 직접 update하지 않는다.

조회 join은 query layer에서 허용할 수 있지만 write ownership은 module service가 가진다.

---

# 24. Read/Write Architecture

PREPPY는 CQRS framework를 도입하지 않는다.

다만 개념적으로 write model과 read model을 분리한다.

## Write

- strict domain validation
- versioning
- evidence
- integrity
- transaction

## Read

- Institution list/detail projection
- Opportunity current projection
- My Preppy projection
- SEO page projection
- Admin dashboard projection

초기에는 같은 PostgreSQL에서 SQL/query layer로 처리한다.

성능 문제가 실제로 발생할 때 materialized view, denormalized read table, search index 등을 검토한다.

---

# 25. Cache and Freshness Strategy

PREPPY에서 오래된 정보는 Product defect이므로 무제한 static caching을 사용하지 않는다.

원칙:

- Article은 publish/update 시 revalidate
- Institution은 검증된 profile 변경 시 revalidate
- Opportunity는 publish/change 시 즉시 관련 page revalidate
- Institution Detail 변경 시 해당 Institution 및 관련 list/tag revalidate
- Draft/Preview는 public cache/sitemap 대상 아님
- My Preppy는 private/dynamic

정확한 TTL보다 **domain change에 따른 invalidation**을 우선한다.

---

# 26. Security and Privacy Architecture

## 26.1 Authentication

- Kakao OAuth state 검증
- callback replay/CSRF 방어
- provider subject uniqueness
- session cookie는 secure/httpOnly/sameSite 정책 적용

세부 OAuth mechanics는 Identity 상세 설계에서 확정한다.

## 26.2 Data Minimization

MVP에서 필요하지 않은 사용자/자녀 정보는 수집하지 않는다.

특히:

- 자녀 이름 미수집
- 정확한 생년월일 미수집
- 소득/자산 미수집

## 26.3 Separation of Concerns

다음을 동일 필드 하나로 합치지 않는다.

- service terms consent
- privacy consent
- email update preference
- marketing consent(향후 필요 시)

## 26.4 Account Deletion

탈퇴는 단순 Follow 해제와 구분한다.

삭제/익명화 정책은 향후 법률/운영정책에 맞춰 확정하되 Architecture는 다음을 지원해야 한다.

- AuthIdentity disable/remove
- active Follow 종료
- Notification preference disable
- 불필요한 PII 제거/익명화
- 보존이 필요한 operational/audit record와 PII 분리

## 26.5 Logging

다음을 로그에 직접 남기지 않는다.

- OAuth token
- session secret
- unnecessary Kakao profile payload
- full personal data

---

# 27. Deployment Topology

MVP Target topology는 다음 정도로 제한한다.

```text
┌───────────────────────┐
│ Next.js Web/App       │
│ Public + Account +    │
│ Admin + API           │
└──────────┬────────────┘
           │
           ▼
┌───────────────────────┐
│ PostgreSQL            │
└──────────┬────────────┘
           ▲
           │
┌──────────┴────────────┐
│ Worker / Scheduler    │
│ same repository       │
└──────────┬────────────┘
           │
           ├── Email Provider
           └── future Collector adapters

External:
- Kakao OAuth
- GA4
- Google Search Console
```

Hosting vendor는 이 문서에서 고정하지 않는다.

선택 기준은 다음이다.

- Next.js 지원
- managed PostgreSQL 연결
- scheduled worker/job 실행 가능
- secrets 관리
- backup/restore
- logs/error monitoring

---

# 28. Observability

MVP Launch 전 최소한 다음을 관찰 가능해야 한다.

## Application

- web error rate
- Kakao login failures
- Follow creation failures
- Admin publish failures

## Monitoring

- overdue verification targets
- failed admin verification transaction
- source checking backlog

## Notification

- pending outbox count
- failed deliveries
- retry count
- duplicate prevention violations
- provider send failures

## Database

- migration status
- connection failures
- backup success/failure

복잡한 observability platform보다 운영 실패를 발견할 수 있는 최소 지표와 로그를 우선한다.

---

# 29. Failure Handling

## 29.1 Kakao Failure

- pending Follow intent는 제한 시간 동안 보존
- callback 실패 시 Follow를 생성하지 않음
- 재시도 가능

## 29.2 Email Missing

Kakao 계정에서 usable email을 받을 수 없는 경우:

- User/Follow는 생성 가능
- 별도 Email 입력/검증이 필요
- Email preference는 valid email 확보 전 effective OFF

따라서 사용자는 Follow 상태와 Email delivery eligibility가 다를 수 있다.

## 29.3 Notification Failure

- Notification 자체는 유지
- Delivery failed 상태 기록
- retry policy 적용
- dedupe key 유지

## 29.4 Admin Partial Failure

검증된 Opportunity 상태만 바뀌고 change/outbox가 누락되는 partial commit이 발생하면 안 된다.

critical write는 하나의 transaction으로 묶는다.

## 29.5 External Source Unavailable

공식 Source 접근 실패가 기존 verified information을 자동 삭제하거나 unverify하지 않는다.

실패는 monitoring observation으로 기록하고 운영자가 판단한다.

---

# 30. Legacy Migration Architecture

Migration 원칙은 **additive → backfill → dual compatibility → cutover → deprecate**다.

기존 history를 파괴하는 big-bang migration을 하지 않는다.

## Phase M0 — Freeze Legacy Product Expansion

새 PREPPY Domain 경계를 확정하기 전 legacy Subscriber/Guide/Update/School route 기반 기능 개발을 중단한다.

Database integrity bug fix는 예외다.

## Phase M1 — Institution Foundation

- `Institution` canonical identity 추가
- 기존 School → Institution backfill
- legacy mapping 생성
- 영유 Institution seed 가능하게 함
- Public code의 canonical ID를 Institution으로 전환 준비

기존 School FK는 아직 유지한다.

## Phase M2 — Opportunity Product Layer

- Product-level Opportunity identity 추가
- legacy AdmissionEvent bridge/backfill
- Institution direct association
- slug/publication/read projection 추가
- history/evidence는 기존 Admission engine 재사용

## Phase M3 — Identity + Follow

- User
- AuthIdentity
- Profile
- Consent
- NotificationPreference
- Follow

신규 Product flow는 legacy Subscriber/Subscription을 사용하지 않는다.

## Phase M4 — Notification Cutover

- Product Notification 모델 추가
- existing Outbox/Delivery reliability pattern 재사용
- target resolution을 User/Follow 기준으로 변경
- Email adapter 구현
- legacy Alert history는 보존

## Phase M5 — Article Cutover

- unified Article 추가
- relations/SEO fields 추가
- legacy Guides/Updates backfill
- canonical URL / redirects 확정
- Admin editor 연결

## Phase M6 — Source Binding Generalization

- Institution/Opportunity Source binding 추가
- legacy School/Cycle binding을 유지한 채 backfill
- Manual Verification workflow를 새 Application Service에 연결

## Phase M7 — Public/Admin Cutover

- Institution/Opportunity/Article routes 활성화
- Follow/Kakao/My Preppy 활성화
- Admin 7개 모듈 연결
- GA4 event wiring

## Phase M8 — Legacy Deprecation

MVP 안정화와 migration 검증 후에만:

- unused legacy code path 제거
- old routes redirect-only 전환
- legacy tables read-only 또는 deprecation 후보 지정

**MVP 출시 전에 legacy history table을 drop하는 것을 목표로 하지 않는다.**

---

# 31. Stable ID and URL Strategy

## 31.1 IDs

PREPPY public/product object는 신규 canonical IDs를 사용한다.

- institution_id
- opportunity_id
- user_id
- article_id
- notification_id

Legacy IDs는 migration mapping에 유지한다.

## 31.2 Slugs

Slug는 public URL identity이지만 DB PK가 아니다.

Slug 변경 시:

- old slug redirect 기록
- canonical은 new slug
- redirect chain 방지

## 31.3 Legacy URL Mapping

기존 노출 URL이 존재하면 redirect registry에서 관리한다.

Application code 곳곳에 수동 redirect를 하드코딩하지 않는다.

---

# 32. API / Command Boundary

MVP는 REST냐 Server Action이냐보다 **use case contract**를 먼저 고정한다.

외부/public client가 안정적으로 필요로 하는 최소 capability는 다음이다.

## Public Read

```text
GET institutions
GET institution detail by slug
GET opportunity detail by slug
GET article detail by slug
```

## Account

```text
Kakao login start/callback
GET my profile
UPDATE my profile
CREATE institution follow
DELETE institution follow
GET my follows / My Preppy
UPDATE email preference
```

## Admin

```text
CRUD Institution through domain service
CRUD/verify/publish Opportunity through domain service
Manage Source binding
CRUD/preview/publish Article
View/operate Notifications
View Users/Follows
```

최종 HTTP method/path/request schema는 PRD/API Contract 단계에서 확정한다.

---

# 33. 14-day MVP Vertical Slice Architecture

Architecture는 Build Plan을 방해해서는 안 된다.

가장 먼저 다음 Thin Vertical Slice가 끝까지 작동해야 한다.

```text
1 Institution
+ 1 Opportunity
+ 1 Official Source
+ 1 Article
        ↓
Public SSR pages
        ↓
Follow Click
        ↓
Kakao Signup
        ↓
Follow created
        ↓
Admin verifies Opportunity change
        ↓
Outbox
        ↓
Email
        ↓
Deep-link Return
        ↓
GA4 + Active Monitoring Parent metric
```

이 Slice가 작동하기 전 다음 자동화는 우선순위가 아니다.

- browser crawler
- PDF extractor
- LLM extraction
- multi-channel notification
- recommendation
- full-text search engine
- complex approval workflow

---

# 34. MVP vs Future Architecture Boundary

| Capability | Architecture Position | MVP Implementation |
|---|---|---|
| Institution | canonical core | 영유/사립초/국제학교 |
| Admissions Opportunity | core bounded context | 모집·설명회·지원 등 |
| Source/Verification | core | manual official-source verification |
| Historical versions | preserve core | 기존 구조 재사용 |
| Auth provider abstraction | boundary | Kakao only |
| Follow | core | Institution Follow |
| Notification | channel-neutral core | Email only |
| Outbox/Dedupe | core | 구현/재사용 |
| Article | core acquisition | Tiptap/HTML CMS |
| SEO | public core | Article/Institution/Opportunity |
| Analytics | product core | GA4 + DB KPI |
| Automated collection | replaceable adapter | 미구현/유예 |
| Education Opportunities | future parallel context | 미구현 |
| Personalization | future consumer of intent data | 미구현 |
| Ads/Lead Marketplace | future commercial layer | 미구현 |
| Microservices | unnecessary | 미구현 |

---

# 35. Architecture Non-Goals

이 Architecture는 다음을 설계하거나 구현하지 않는다.

- Microservices topology
- Kafka/Event Bus cluster
- Kubernetes
- Event Sourcing 전체 시스템
- CQRS framework
- Elasticsearch/OpenSearch
- Data Warehouse
- AI recommendation
- AI admissions consultation
- Automated crawling implementation
- Push/Kakao message notification
- Mobile App
- Ads platform
- Lead marketplace
- Camp/after-school database
- Complex multi-role Admin workflow

Outbox와 Domain Events를 사용하는 것이 Microservice/Event-driven architecture를 도입한다는 의미는 아니다.

---

# 36. Architecture Decision Records to Carry Forward

아래 결정을 이후 문서에서 임의로 뒤집지 않는다. 변경할 경우 별도 Architecture Decision이 필요하다.

## ADR-001 — Modular Monolith

**Decision:** Next.js + PostgreSQL Modular Monolith 유지.  
**Reason:** 현재 규모와 14-day MVP에 최적이며 Audit에서도 인프라 구조는 KEEP 판정.

## ADR-002 — Canonical Institution via Additive Migration

**Decision:** 신규 Institution을 canonical identity로 도입하고 existing School을 bridge한다.  
**Reason:** 영유 지원과 장기 확장 필요, 기존 FK/history 보호.

## ADR-003 — Opportunity as Product-level Admissions Entity

**Decision:** Opportunity를 독립 public/product identity로 신설하고 legacy AdmissionEvent history를 bridge한다.  
**Reason:** SEO, analytics, UI, public lifecycle이 필요하면서 기존 version history를 보존해야 함.

## ADR-004 — Preserve Trust/History Engine

**Decision:** Source/Evidence/Observation/Snapshot/Version history를 재사용한다.  
**Reason:** PREPPY의 Trust/Freshness/Historical moat와 직접 부합.

## ADR-005 — Replace Subscriber/Subscription with User/Follow

**Decision:** 신규 User/AuthIdentity/Follow model을 도입한다.  
**Reason:** legacy cycle subscription과 PREPPY Monitoring delegation의 의미가 다름.

## ADR-006 — Notification Is Channel-neutral

**Decision:** Notification과 Delivery/Email Adapter를 분리한다.  
**Reason:** MVP Email만 구현하면서도 제품 핵심 개념을 Email에 종속시키지 않음.

## ADR-007 — Outbox for External Side Effects

**Decision:** DB commit과 Email send 사이를 Outbox로 연결한다.  
**Reason:** 기존 안정성 자산 재사용, retry/dedupe 보장.

## ADR-008 — Manual-first Monitoring

**Decision:** Admin verified write를 first-class ingestion path로 구현한다.  
**Reason:** MVP 핵심은 crawler 성능이 아니라 Monitoring delegation 검증.

## ADR-009 — Unified Article

**Decision:** Guide/Update split을 canonical CMS로 유지하지 않고 unified Article로 migration한다.  
**Reason:** SEO Acquisition Engine과 structured relations 필요.

## ADR-010 — SEO Is Launch Architecture

**Decision:** Article/Institution/Opportunity public rendering, metadata, canonical, sitemap, internal links를 MVP launch architecture에 포함한다.

## ADR-011 — PostgreSQL Operational Metrics

**Decision:** Active Monitoring Parents 등 제품 핵심 상태는 DB에서 재현 가능해야 한다. GA4는 보완적 behavioral analytics다.

## ADR-012 — Future Education Opportunities Are Separate Context

**Decision:** 캠프·방과후·체험을 Admissions Opportunity의 subtype으로 강제하지 않는다.

---

# 37. Validation Checklist for Codex Repository Review

이 Target Architecture를 실제 Repository에 반영하기 전에 Codex는 다음을 검증해야 한다.

## Institution

- `schools`를 참조하는 모든 FK/table/module 목록
- additive `institutions` + mapping 도입 가능성
- existing slug/ID 충돌 가능성
- school type constraint 변경 필요 범위

## Opportunity

- `admission_events`와 `admission_event_versions`의 identity/lifecycle 정확한 관계
- public Opportunity bridge를 1:1로 만들 수 있는지
- AdmissionCycle 없이 존재하는 event가 가능한지/필요한지
- existing constraints를 깨지 않고 institution_id를 연결하는 방법

## Trust

- source_bindings의 현재 target 구조
- Institution/Opportunity binding 추가 시 가장 안전한 migration
- existing observations/snapshots/evidence를 그대로 reuse 가능한지

## Identity/Follow

- subscriber/subscription/action token/alert delivery FK blast radius
- legacy data가 실제 존재하는지
- 신규 User/Follow를 additive하게 추가할 수 있는지

## Notification

- alerts/alert_deliveries/outbox_events 중 재사용 가능한 필드와 강결합 FK
- dedupe key 생성 규칙
- worker 구현에 필요한 existing infrastructure

## Article

- guides/updates 실제 데이터 존재 여부
- slug conflict
- Markdown migration 필요 여부
- current SEO metadata reuse 범위

## Runtime

- 현재 Next.js version/App Router 구조
- Worker/Scheduler 실행 방식 후보
- existing migration/test harness와 additive migration 호환성

Codex 검증의 목적은 Target Architecture를 다시 설계하는 것이 아니라 **Repository 현실과 충돌하는 세부사항을 찾아 조정하는 것**이다.

---

# 38. Exit Criteria for Target Architecture Phase

다음 조건을 만족하면 `02_TARGET_ARCHITECTURE.md` 단계는 완료된다.

1. Audit의 P0 5개 문제에 목표 구조가 정의되어 있다.
2. 기존 Trust/History/Outbox 자산의 재사용 방식이 정의되어 있다.
3. Institution / Opportunity migration 방향이 확정되어 있다.
4. User / Follow / Notification 경계가 확정되어 있다.
5. Manual Verification → Outbox → Email transaction 흐름이 확정되어 있다.
6. Article / SEO Acquisition 경계가 확정되어 있다.
7. Public/Admin/Worker runtime 책임이 정의되어 있다.
8. 미래 Education Opportunities가 Admission hierarchy에 묶이지 않는다.
9. 14-day MVP Vertical Slice를 방해하는 과설계가 없다.
10. Codex Repository Validation에서 치명적 충돌이 없거나 수정사항이 이 문서에 반영된다.

---

# 39. Next Documents

Target Architecture 승인 후 다음 순서로 진행한다.

```text
03_DOMAIN_MODEL.md
        ↓
04_DATA_MODEL.md
        ↓
05_MONITORING_ARCHITECTURE.md
        ↓
06_CONTENT_SEO_ARCHITECTURE.md
        ↓
07_IDENTITY_FOLLOW_NOTIFICATION.md
        ↓
08_ANALYTICS_ARCHITECTURE.md
        ↓
09_ADMIN_OPERATIONS_ARCHITECTURE.md
        ↓
10_PRD.md
        ↓
API Contract / Implementation Plan
```

`03_DOMAIN_MODEL.md`에서는 이 문서가 정한 모듈 경계를 바탕으로 Entity, Aggregate, Value Object, lifecycle, invariants를 확정한다.

`04_DATA_MODEL.md`에서는 기존 28개 legacy table과 신규 PREPPY model 사이의 실제 PostgreSQL schema 및 migration sequence를 확정한다.

---

# 40. Final Architecture Definition

PREPPY의 Target Architecture는 **AdmissionRadar를 폐기하고 새 시스템을 만드는 구조가 아니다.**

기존 AdmissionRadar의 가장 가치 있는 부분인:

```text
Source
Verification
Observation
Snapshot
Evidence
Historical Versions
Database Integrity
Outbox
Deduplication
```

을 PREPPY의 신뢰·모니터링 엔진으로 보존한다.

그 위에 현재 제품에 없는 다음 canonical Product Domain을 추가한다.

```text
Institution
Opportunity
User / Identity
Follow
Notification
Article
```

결과적으로 목표 구조는 다음과 같다.

```text
                       PREPPY

          ┌──────── Organic Acquisition ────────┐
          │              Article                │
          └───────────────┬─────────────────────┘
                          │
                          ▼
              Institution / Opportunity
                          │
                          ▼
                   Source / Trust
                          │
                          ▼
                 Follow / Monitoring
                          │
                          ▼
                 Verified Change
                          │
                          ▼
                    Notification
                          │
                          ▼
                   Email / Return

          Identity ──────────────┘
          Analytics observes the Product Loop
          Admin operates the same Domain Services
```

이 Architecture가 최적화하는 것은 서버 대수나 미래 트래픽이 아니다.

최적화 대상은 다음 두 가지다.

1. **지금 가장 빠르게 MVP의 Delegation 가설을 검증하는 것**
2. **검증 후 확장할 때 핵심 Product Domain과 Historical Asset을 다시 뜯어고치지 않는 것**

따라서 최종 원칙은 그대로 유지한다.

> **Architecture for Extension. Implementation for Validation.**
