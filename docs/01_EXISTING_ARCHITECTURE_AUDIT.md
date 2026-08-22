# PREPPY Existing Architecture Audit

**Status:** Architecture audit only  
**Date:** 2026-08-22  
**Decision baseline:** `00_PRODUCT_REQUIREMENTS_BASELINE.md`  
**Audited implementation:** repository state through AdmissionRadar STEP 2

## 1. Executive Summary

현재 저장소는 PREPPY 애플리케이션이라기보다 **AdmissionRadar의 신뢰 가능한 입학 일정 데이터베이스 기반**이다. Next.js, PostgreSQL, Drizzle, 엄격한 데이터 제약, 출처 관찰, 버전 이력, 변경 탐지, 중복 방지형 알림 전달 모델은 재사용 가치가 높다. 특히 공식 출처와 검증된 사실을 분리하고, 현재값을 덮어쓰지 않고 버전으로 남기는 설계는 PREPPY의 Trust/Monitoring 핵심과 잘 맞는다.

반면 PREPPY의 제품 루프를 성립시키는 `Institution`, 독립 `Opportunity`, Kakao 기반 `User`, 지속적 `Follow`, 채널 중립적 `Notification`, 통합 `Article CMS`는 없거나 AdmissionRadar 전제에 강하게 결합되어 있다. 실제 런타임은 STEP 0~2에 머물러 있어 Public UI, Admin, 인증, Email, CMS, SEO 렌더링, Analytics가 구현되지 않았다. 따라서 기존 코드를 전면 폐기할 이유는 없지만, **기능 개발을 계속하기 전에 핵심 도메인 경계를 재정렬해야 한다.**

### Overall Verdict

**부분 재설계 필요 — Architecture Rewrite Level: MAJOR**

“MAJOR”는 전체 기술 스택을 갈아엎는다는 뜻이 아니다. 데이터 신뢰 기반은 유지하되, 사용자·팔로우·기관·기회·콘텐츠의 제품 중심축을 PREPPY 기준으로 재정의해야 한다는 뜻이다. 아직 비즈니스 서비스와 UI가 거의 없어 지금이 가장 저렴하게 경계를 바꿀 수 있는 시점이다.

## 2. Audit Scope and Evidence

검토 대상은 다음과 같다.

- 제품 기준: `docs/One Pager.md`, `docs/MVP.md`, `docs/00_PRODUCT_REQUIREMENTS_BASELINE.md`
- 기존 설계: `docs/00_PROJECT_CONTEXT.md` ~ `docs/11_IMPLEMENTATION_DECISIONS.md`
- 실제 구현: `package.json`, 환경설정, Next.js health route, DB 연결/마이그레이션 코드, Drizzle schema, SQL migrations, unit/integration tests
- 구현 상태 근거: README는 현재 범위를 STEP 0~2로 한정하며 Public pages, Admin UI, collection, extraction, email, Alert dispatch가 미구현이라고 명시한다 (`README.md:5-12`).

판정 기준은 다음과 같다.

- **KEEP:** PREPPY 요구와 경계가 일치하고 그대로 확장 가능
- **MODIFY:** 기반은 유효하지만 명칭, 관계, 책임, 구현 순서를 변경해야 함
- **REPLACE:** 기존 핵심 전제가 PREPPY 제품 계약과 충돌하여 병행 모델 또는 대체 모델 필요
- **NOT DESIGNED:** 문서와 코드 모두에서 운영 가능한 설계가 확인되지 않음

## 3. Architecture Audit Matrix

| 영역 | 현재 상태 | 판정 | 우선순위 | 핵심 근거 |
|---|---|---:|---:|---|
| Product/System Boundary | AdmissionRadar 단일 입학 레이더 중심 | MODIFY | P0 | PREPPY는 Discovery→Compare→Follow→Monitor→Return 루프 |
| Frontend | Health endpoint 외 Public UI 없음 | NOT DESIGNED | P0 | README의 명시적 미구현 범위 |
| Backend/API | DB bootstrap 외 도메인 API/service 없음 | NOT DESIGNED | P0 | 실제 route는 health뿐 |
| Database Integrity | PostgreSQL 제약·트리거·통합 테스트 | KEEP | P0 | 현재값 유일성, lineage, cross-aggregate FK |
| Institution | `schools`, 3개 school type으로 한정 | MODIFY | P0 | 영유가 없고 범용 Institution 경계가 아님 |
| Opportunity | `admission_events`가 cycle 하위에 존재 | MODIFY | P0 | 일부 재사용 가능하나 독립 public/core domain이 아님 |
| Source | Registry, authority, binding, snapshot, evidence | KEEP/MODIFY | P0 | 신뢰 기반은 강하나 School/Cycle에 결합 |
| Historical Data | cycle + append-only event/fact versions | KEEP | P0 | PREPPY 자산과 직접 부합 |
| User/Identity | 이메일 subscriber만 존재 | REPLACE | P0 | Kakao user/profile/child year/interests 없음 |
| Follow | cycle 단위 verified subscription | REPLACE | P0 | User↔Institution의 지속적 Monitoring 위임이 아님 |
| Notification | Alert/delivery/outbox 존재, Email 고정 | MODIFY | P0 | 전달 신뢰성은 좋으나 legacy subscription/cycle 결합 |
| Article/CMS | Guides/Updates + Markdown | REPLACE | P0 | 통합 Article, Tiptap, preview, 관계/SEO 필드 부족 |
| Monitoring Workflow | 자동 수집 파이프라인 중심 설계 | MODIFY | P0 | MVP는 manual-first 운영 루프가 핵심 |
| Admin | 상세 문서만 있고 UI 미구현 | MODIFY | P0 | 새 모듈과 manual workflow 기준으로 재편 필요 |
| SEO | 원칙은 상세, taxonomy는 School/Guide/Update | MODIFY | P0 | Institution/Opportunity/Article 기준으로 변경 |
| Analytics | 과거 KPI 문서만 존재, GA4 미구현 | NOT DESIGNED | P0 | Active Monitoring Parents 산출 불가 |
| Authentication | 미래 Admin OIDC 변수만 존재 | REPLACE | P0 | Kakao OAuth 및 세션/계정 연결 없음 |
| Authorization | Admin role/guard 미구현 | NOT DESIGNED | P1 | 복잡한 RBAC는 불필요하나 최소 경계 필요 |
| Security/Privacy | 이메일 최소수집 전제 | MODIFY | P0 | Kakao ID, 자녀 출생연도, 동의/탈퇴 정책 필요 |
| Deployment/Infra | 로컬 Docker DB와 Next 실행만 | NOT DESIGNED | P1 | production topology, backup, secrets, jobs 미정 |
| Observability | health check와 DB 오류 분류 정도 | MODIFY | P1 | logs, metrics, alerting, delivery/monitoring SLO 필요 |
| Scalability | modular monolith + outbox 기반 | KEEP | P2 | 현재 규모에 적합, 분산 시스템 불필요 |
| Future Opportunities | AdmissionCycle 하위 구조 | MODIFY | P3 | 미래 Education Opportunities 병렬 도메인 보장 필요 |

## 4. Detailed Findings

### 4.1 Product and System Architecture

기존 시스템은 `School → AdmissionCycle → AdmissionEvent/Fact → Change → Alert` 흐름에 최적화되어 있다. PREPPY는 `Article/검색 → Institution/Opportunity → Follow → Kakao Signup → Monitoring → Email → Return`을 제품 루프로 정의한다 (`00_PRODUCT_REQUIREMENTS_BASELINE.md:223-232`). 기존 구조는 Monitoring 후반부는 강하지만 Discovery, 회원화, 반복 사용의 전반부가 비어 있다.

**판정: MODIFY (P0).** 기존 modular monolith와 신뢰 데이터 파이프라인은 유지하고, 애플리케이션 모듈의 최상위 경계를 PREPPY 7개 핵심 도메인으로 재정렬해야 한다.

### 4.2 Frontend

Public frontend는 **NOT DESIGNED/NOT IMPLEMENTED**다. 기존 IA 문서는 Home, Calendar, Schools, Updates, Guides 중심이지만 실제 페이지 구현은 없다. PREPPY가 요구하는 Institution List/Detail, Opportunity, Article, Kakao Login, Follow, My Preppy가 모두 필요하다.

**판정: NOT DESIGNED (P0).** 과거 IA의 모바일·breadcrumb·internal linking 원칙은 참고하되 route와 화면 계약은 새로 정의한다.

### 4.3 Backend and API

실제 Backend는 health route, 환경 검증, DB 연결/마이그레이션 수준이다. Institution 조회, Opportunity 조회, Follow mutation, Kakao callback, Admin CRUD, Article publish, Notification dispatch API는 없다.

**판정: NOT DESIGNED (P0).** 다음 문서에서 API를 확정해야 하며, 현재 schema를 그대로 CRUD로 노출해서는 안 된다. 특히 버전 행은 domain service transaction을 통해서만 변경해야 한다는 기존 결정은 유지한다.

### 4.4 Database Foundation

현재 28개 테이블은 강한 관계 무결성과 재시도 안전성을 제공한다. event/fact 현재 버전 유일성, 단조로운 lineage, source URL dedupe, alert/delivery dedupe, 동일 cycle 강제, `updated_at` trigger가 실제 migration과 DB integration test로 검증된다.

**판정: KEEP (P0 보호대상).** 새 도메인을 추가하더라도 이 제약 수준을 낮추지 않는다. 단, legacy 테이블을 즉시 rename/drop하지 말고 additive migration과 backfill을 우선한다.

### 4.5 Institution Domain

`schools`는 canonical identity, alias, region, 공개 상태를 이미 갖고 있어 좋은 출발점이다 (`src/db/schema/index.ts:52`). 그러나 `school_type`은 `PRIVATE_ELEMENTARY`, `INTERNATIONAL_SCHOOL`, `FOREIGN_SCHOOL`만 허용한다 (`src/db/schema/index.ts:80`). PREPPY P0인 영유를 표현할 수 없고, 장기적으로 범용 교육기관과 캠퍼스/브랜드 관계를 담기 어렵다.

**판정: MODIFY (P0).** School을 바로 삭제하지 말고 Institution canonical model을 도입하거나 호환 가능한 일반화 migration을 설계한다. 초기에는 legacy school ID를 보존하는 1:1 mapping이 가장 안전하다.

### 4.6 Opportunity Domain

`admission_events`는 설명회, 지원, 평가, 인터뷰, 추첨, 등록 등 많은 입학 기회를 이미 표현하며, stable identity + version 구조도 훌륭하다 (`src/db/schema/index.ts:157`). 하지만 모든 Event가 `admission_cycle_id`에 종속되고 public Opportunity identity, 독립 slug/SEO lifecycle, Institution과의 직접 관계가 없다.

**판정: MODIFY (P0).** 입학 Opportunity는 기존 Event/Version을 폐기하기보다 제품 계층에서 일반화한다. 다만 미래 캠프·방과후 등 Education Opportunity를 AdmissionCycle의 하위 이벤트로 억지로 넣지 않도록 별도의 opportunity kind/scope 경계를 확보해야 한다.

### 4.7 Source Domain and Verification

`sources`, bindings, monitor configs, observations, snapshots, detected/meaningful changes, evidence는 현 구조의 가장 강한 부분이다 (`src/db/schema/index.ts:481-726`). authority와 lifecycle을 분리하며 수집 실패가 검증 사실을 덮어쓰지 않는 원칙도 적절하다.

**판정: KEEP + 제한적 MODIFY (P0).** Source registry/evidence/history는 유지한다. `source_bindings`가 School/Cycle에 고정된 부분만 Institution/Opportunity에 연결 가능하도록 일반화한다. Article은 출처를 인용할 수 있으나 Monitoring Source와 Editorial reference의 의미는 구분한다.

### 4.8 Historical Data

AdmissionCycle과 append-only Event/Fact versions, supersedes lineage, evidence 관계는 과거 일정과 수정 이력을 보존한다. 이는 PREPPY의 신뢰·비교·예상 시기 자산에 직접 기여한다.

**판정: KEEP (P0).** 공개 current projection과 historical timeline을 분리하고, migration 중 기존 ID와 version history를 보존한다.

### 4.9 User and Identity

현재 audience는 `subscribers(email)`이며 계정이 아니다 (`src/db/schema/index.ts:936`). Kakao subject, user lifecycle, child birth year, region, interests, email preference가 없다. Admin용 external OIDC 변수는 사용자 인증의 대체물이 아니다.

**판정: REPLACE (P0).** `User`와 `AuthIdentity`를 분리해 Kakao를 MVP provider로 두고, 프로필/동의/탈퇴를 명시한다. 이메일 subscriber 데이터는 user migration 또는 별도 legacy contact로 보존하되 동일시하지 않는다.

### 4.10 Follow

기존 `subscriptions`는 이메일 인증된 Subscriber가 특정 AdmissionCycle을 구독하는 모델이다 (`src/db/schema/index.ts:958`). 학년이 바뀌면 관계가 끊기며, PREPPY가 정의한 User↔Institution의 지속적 Monitoring 위임과 다르다.

**판정: REPLACE (P0).** `Follow(user_id, institution_id)`를 canonical relation으로 만들고 notification preference/consent는 별도 책임으로 둔다. Opportunity follow가 MVP 범위인지 여부는 다음 architecture에서 명시하되 Institution follow를 우선한다.

### 4.11 Notification

`alerts`, `alert_deliveries`, `outbox_events`는 dedupe, 상태, 재시도 및 전달 기록 측면에서 우수하다 (`src/db/schema/index.ts:1026-1146`). 하지만 Alert가 AdmissionCycle/MeaningfulChange에 결합되고 delivery가 legacy subscription/subscriber를 참조하며 channel check는 Email만 허용한다 (`src/db/schema/index.ts:1109`).

**판정: MODIFY (P0).** Alert 생성·Delivery·Outbox 기법은 유지하되 product-level Notification을 legacy cycle subscription에서 분리한다. MVP channel은 Email만 구현하되 Notification과 Email을 같은 개념으로 만들지 않는다.

### 4.12 Article and Editorial CMS

현재 `updates`와 `guides`는 Markdown body와 일부 SEO metadata만 제공한다 (`src/db/schema/index.ts:861-921`). 통합 Article type/category, HTML body sanitization, preview, canonical/robots, featured image, author, Institution/Opportunity relation, Tiptap 계약이 없다. PREPPY는 Article을 Organic Acquisition Engine으로 규정한다 (`00_PRODUCT_REQUIREMENTS_BASELINE.md:590-694`).

**판정: REPLACE (P0).** Guides/Updates를 그대로 확장하기보다 통합 Article 모델과 relation tables를 도입한다. 기존 row가 존재할 경우 type이 `GUIDE`/`UPDATE`인 Article로 변환하고 legacy slug redirect를 유지한다.

### 4.13 Monitoring Workflow

기존 문서는 HTTP/browser/document collection, diff, extraction, review queue를 상세 설계했다. schema에도 자동화 전제의 snapshots/observations/changes가 이미 있다. 그러나 PREPPY MVP는 공식 Source 확인 → Admin 수정 → Follow 사용자 조회 → Email 발송의 manual-first 경로가 우선이다 (`00_PRODUCT_REQUIREMENTS_BASELINE.md:553-554`).

**판정: MODIFY (P0).** 자동 수집 테이블을 삭제하지 않되 구현 순서를 뒤로 미룬다. 먼저 Admin에서 source evidence를 붙인 verified version을 만들고 동일 transaction/outbox로 Notification 후보를 생성하는 최소 경로를 완성한다.

### 4.14 Admin

기존 Admin 문서는 운영 사고방식이 성숙하지만 crawler/review queue 중심이며 실제 UI는 없다. PREPPY는 Dashboard, Institutions, Opportunities, Sources, Articles, Notifications, Users를 요구한다 (`00_PRODUCT_REQUIREMENTS_BASELINE.md:844-876`).

**판정: MODIFY (P0).** 복잡한 승인/RBAC보다 한 운영자가 manual verification과 publish/send를 안전하게 수행하는 thin vertical slice를 우선한다. 모든 critical edit는 새 version, evidence, audit log를 남겨야 한다.

### 4.15 SEO

기존 SEO 문서는 SSR/SSG, canonical, redirects, sitemap, robots, breadcrumb, structured data, internal linking을 잘 정의한다. 그러나 URL과 sitemap이 Schools/Updates/Guides 중심이고 실제 Next.js 구현은 없다.

**판정: MODIFY (P0).** 원칙은 KEEP하고 indexable taxonomy를 Institution/Opportunity/Article로 교체한다. Article↔Institution↔Opportunity 양방향 internal link와 최초 HTML 렌더링을 launch architecture에 포함한다.

### 4.16 Analytics

기존 PRD에 일부 이벤트/KPI는 있으나 GA4 wiring, event schema, identity policy, warehouse/export, dashboard가 없다. 현 schema로는 Active Monitoring Parents를 계산할 User/Follow/email preference 자체가 없다.

**판정: NOT DESIGNED (P0).** GA4 event taxonomy와 DB source-of-truth metric query를 함께 정의한다. `Active Monitoring Parents = active user + ≥1 active Follow + email enabled`를 서버 데이터로 재현 가능해야 한다.

### 4.17 Authentication and Authorization

환경 변수에는 미래 Admin OIDC 설정만 있고 Kakao OAuth는 없다. 사용자 session, callback, account linking, CSRF/state/nonce, refresh/revocation 정책도 없다.

**판정: REPLACE/NOT DESIGNED (P0/P1).** User auth는 Kakao adapter 기반으로 설계하고 provider identity를 User와 분리한다. Admin은 별도 route guard와 최소 role만 둔다. 복잡한 조직/권한 체계는 P1 이후다.

### 4.18 Security and Privacy

기존 모델은 이메일 최소수집이라 단순했지만 PREPPY는 Kakao identity, 자녀 출생연도, 지역, 관심 카테고리, 마케팅/알림 동의를 다룬다. 보존기간, 탈퇴, 계정 익명화, provider token 저장, audit 접근 통제가 정의되지 않았다.

**판정: MODIFY (P0).** 최소수집, 목적 제한, consent version, unsubscribe와 account deletion의 구분, 민감정보 logging 금지를 launch gate로 둔다. 자녀 이름/정확한 생년월일은 수집하지 않는다.

### 4.19 Deployment, Infrastructure, Observability

로컬 Docker PostgreSQL, migration command, health endpoint는 있다. Production hosting, background worker topology, scheduled job, object storage, email provider, secrets, backup/restore, log aggregation, error tracking, SLO는 **NOT DESIGNED**다.

**판정: NOT DESIGNED/MODIFY (P1).** MVP는 Next.js app + PostgreSQL + 동일 repo worker 또는 scheduled job + managed email로 충분하다. Kafka, Kubernetes, 검색 클러스터, data warehouse는 필요하지 않다. Outbox worker와 monitoring/email failure observability는 launch 전 필요하다.

### 4.20 Scalability and Future Expansion

modular monolith와 PostgreSQL/outbox는 초기 규모에 적절하며 오히려 운영 복잡도를 낮춘다. 위험은 infra scale이 아니라 domain coupling이다. 특히 미래 Education Opportunities를 AdmissionCycle/Event 트리에 강제하면 확장이 막힌다 (`00_PRODUCT_REQUIREMENTS_BASELINE.md:1195-1205`).

**판정: KEEP infra, MODIFY domain boundary (P2/P3).** 현재는 interface와 식별자 경계만 확보하고 미래 기능은 구현하지 않는다.

## 5. Legacy Assumptions That Conflict with PREPPY

1. **School이 유일한 발견 단위다.** PREPPY는 영유를 포함한 Institution이 기준이다.
2. **입학 Event는 AdmissionCycle의 내부 구성요소다.** PREPPY의 Opportunity는 독립 검색·SEO·비교 대상이다.
3. **Audience는 이메일 주소다.** PREPPY는 Kakao 계정을 가진 User와 프로필을 필요로 한다.
4. **Subscription은 특정 학년도 cycle 구독이다.** PREPPY Follow는 Institution에 대한 지속적 Monitoring 위임이다.
5. **Notification은 이메일 Alert다.** MVP 전달 채널은 Email이지만 도메인은 채널 중립적이어야 한다.
6. **Guides와 Updates가 별도 콘텐츠 타입이다.** PREPPY는 관계형 통합 Article CMS가 필요하다.
7. **자동 수집 파이프라인이 Public MVP보다 먼저다.** PREPPY 14-day MVP는 manual-first 운영이 우선이다.
8. **사립초/국제학교가 우선이고 영유는 후순위다.** 새 baseline에서는 세 카테고리가 P0다.
9. **North Star는 verified alert subscribers다.** 새 North Star는 Active Monitoring Parents다.
10. **로그인 없는 이메일 인증이 핵심 conversion이다.** 새 conversion은 Follow intent → Kakao signup → Follow completion이다.

## 6. Product/Growth Loop Support Assessment

| Loop 단계 | 현재 지원 | Gap |
|---|---|---|
| Discover | 문서상 School directory/SEO만 존재 | 영유, Article acquisition, 실제 UI 없음 |
| Compare | historical facts/events 기반은 있음 | Institution 비교 projection/API/UI 없음 |
| Follow | cycle email subscription 존재 | User↔Institution Follow 없음 |
| Monitor | Source/version/change 기반 강함 | manual-first service/Admin 미구현 |
| Update | MeaningfulChange/Update/Alert 기반 있음 | Article/Notification 새 경계 필요 |
| Return | Email delivery 기록 모델 존재 | Kakao user attribution, deep link, 실제 email 없음 |
| Measure | 과거 KPI 문서만 존재 | GA4와 Active Monitoring Parents 산출 불가 |

결론적으로 **Monitoring data engine은 부분 지원하지만 Growth Loop는 end-to-end로 작동하지 않는다.** 특히 Article → Institution → Follow → Kakao Signup 구간이 전무하다.

## 7. Required Questions — Direct Answers

### Q1. 기존 구조는 유지 가능한가?

**부분 재설계 필요.** 기술 스택과 신뢰 데이터/이력 기반은 유지 가능하지만, 핵심 제품 도메인 다섯 개(Institution, Opportunity, User, Follow, Article)를 재정렬하지 않고는 PREPPY를 올바르게 구현할 수 없다.

### Q2. Opportunity는 현재 어디에 있는가?

`admission_events`와 그 versions에 **암묵적으로 포함**되어 있다. 입학 기회 데이터 구조로는 재사용 가능하지만 독립 core/public/SEO domain으로는 부족하다. **MODIFY**가 적절하며 완전 폐기는 권하지 않는다.

### Q3. User / Follow / Notification / Article은 어디에 있는가?

- User: 없음. `subscribers`는 이메일 contact일 뿐이다.
- Follow: 없음. `subscriptions`는 특정 cycle 이메일 구독이다.
- Notification: `alerts`/`alert_deliveries`/`outbox_events`에 부분 존재한다.
- Article: `guides`/`updates`에 분산되어 있고 CMS 요구를 충족하지 못한다.

### Q4. Source / Verification / Historical은 얼마나 재사용 가능한가?

가장 재사용 가능성이 높다. registry, authority, observations, snapshots, evidence, append-only versions, lineage, dedupe, audit 원칙은 **KEEP**한다. School/Cycle 고정 FK만 Institution/Opportunity 기준으로 점진적으로 일반화한다.

### Q5. Kakao 로그인과 프로필 수집을 어디에 붙여야 하는가?

Audience 모듈을 대체하는 Identity/User 모듈에 붙인다. `AuthIdentity(provider, provider_subject)`와 `User`를 분리하고, profile/consent/preferences를 User에 귀속한다. Follow 생성은 로그인 전 intent를 보존한 뒤 callback transaction에서 완료한다.

### Q6. Follow는 Subscription을 재사용할 수 있는가?

그대로는 불가하다. 의미와 수명이 다르므로 **새 Follow가 필요**하다. 기존 Subscription은 legacy email/cycle preference로 유지하고, 마이그레이션 가능 데이터가 있으면 User 식별 후 Follow로 backfill한다.

### Q7. Article CMS는 얼마나 추가되어야 하는가?

사실상 새로 필요하다. 통합 Article, type/category, lifecycle, sanitized HTML, preview, author/image, SEO metadata, Institution/Opportunity relations, redirects가 필요하다. 기존 Guides/Updates 내용과 slug는 migration input으로 사용한다.

### Q8. 현재 구조가 14-day MVP에 과도하게 복잡한가?

자동 수집/변경탐지 전체 파이프라인을 먼저 완성한다면 과도하다. 그러나 이미 구현된 schema를 삭제하는 것도 낭비다. **자동화 구현은 유예하고 manual verification vertical slice를 먼저 연결**하는 것이 가장 현실적이다.

## 8. Top 5 Architecture Decisions Before Any More Coding

1. **Canonical Institution boundary:** School을 rename할지, 새 Institution + legacy mapping을 둘지와 영유 taxonomy를 확정한다.
2. **Opportunity contract:** AdmissionEvent/Version을 어떻게 재사용하며 public identity, slug, lifecycle, SEO projection을 어디에 둘지 확정한다.
3. **User–Follow–Preference separation:** Kakao identity, User profile, Institution Follow, Email preference/consent를 서로 다른 책임으로 확정한다.
4. **Manual verification transaction:** Admin edit → evidence/version → meaningful change → target resolution → outbox의 최소 원자적 경로를 확정한다.
5. **Unified Article model:** Article lifecycle, editor output/sanitization, SEO fields, Institution/Opportunity relations와 legacy Guides/Updates migration을 확정한다.

## 9. Technical Debt Already Present

### P0 Debt

- package/service/docs의 `AdmissionRadar` naming이 새 제품 기준과 불일치한다.
- School type constraint가 영유를 거부한다.
- audience/notification FK가 legacy cycle subscription에 강하게 결합되어 있다.
- Article CMS와 Kakao auth가 전무하다.
- 실제 서비스 계층 없이 schema가 먼저 고정되어 있다.

### P1 Debt

- production deployment, worker, email provider, secrets, backup/restore가 미정이다.
- Admin auth/authorization과 audit access policy가 미구현이다.
- GA4 event contract와 서버 지표 산출 정의가 없다.
- SEO 문서와 새 route taxonomy가 불일치한다.

### P2/P3 Debt

- Source binding의 polymorphic/generalized target 전략이 없다.
- Future Education Opportunities를 현재 admission hierarchy와 분리할 extension seam이 없다.
- Search/filter projection과 read model 전략이 아직 없다.

## 10. Migration Impact Analysis

### 10.1 School → Institution (MODIFY, P0)

- **Affected docs/modules:** context, PRD, IA, domain/data model, Admin, SEO, implementation plan; future catalog module
- **Affected tables:** `schools`, `school_aliases`, `admission_cycles`, `source_bindings`, `updates`
- **API/UI impact:** `/schools` 계약을 `/institutions` 중심으로 교체; filters에 영유 포함
- **Data migration:** additive Institution 또는 compatible rename, stable IDs/slug alias 유지, legacy type mapping, 영유 seed
- **Risk:** 기존 FK가 광범위하므로 물리 rename을 한 번에 하면 migration blast radius가 큼

### 10.2 AdmissionEvent → Opportunity (MODIFY, P0)

- **Affected modules/tables:** cycles, events, event_versions, facts, evidence, meaningful_changes, alerts
- **API/UI impact:** 독립 Opportunity detail/list/read model과 SEO metadata 필요
- **Data migration:** 기존 Event ID를 opportunity identity에 매핑; historical versions/evidence 보존
- **Risk:** 입학 과정 내부 event와 미래 독립 education opportunity를 한 테이블에 무리하게 합치면 nullable/conditional 규칙이 폭증

### 10.3 Subscriber/Subscription → User/Follow (REPLACE, P0)

- **Affected tables:** `subscribers`, `subscriptions`, action tokens, alert deliveries; 신규 users/auth identities/profiles/follows/preferences
- **API/UI impact:** Kakao login/callback, pending follow intent, My Preppy, unfollow, email toggle
- **Data migration:** 이메일만으로 Kakao User를 자동 생성하지 않는다; 로그인 시 검증된 이메일이 일치할 때 명시적 linking 정책 적용
- **Risk:** 동의 목적 혼합, 중복 계정, follow 유실, 탈퇴 후 개인정보 잔존

### 10.4 Alert → Notification (MODIFY, P0)

- **Affected tables:** alerts, alert_deliveries, outbox_events, meaningful_changes
- **API/UI impact:** Admin preview/send/history, User notification history 또는 최소 email log
- **Data migration:** legacy Alert type/status를 Notification event/template로 매핑; delivery history 보존
- **Risk:** target resolution과 delivery를 같은 transaction에서 외부 전송하면 재시도/중복 오류 발생

### 10.5 Guides/Updates → Article (REPLACE, P0)

- **Affected tables:** guides, updates, update_changes; 신규 articles/categories/relations/redirects
- **API/UI impact:** Admin editor/preview/publish, Article pages, related Institution/Opportunity blocks
- **Data migration:** Markdown→sanitized HTML 변환 또는 dual-read 기간, slug/SEO metadata/status/published_at 보존
- **Risk:** HTML sanitization 실패, canonical 중복, 기존 URL traffic 손실

### 10.6 Monitoring Automation → Manual-first (MODIFY, P0)

- **Affected modules:** collection, verification, Admin queue, notification orchestration
- **Tables:** 기존 source/change/version/outbox 유지; manual observation/evidence 작성 경로 보강
- **Data migration:** 불필요. 구현 순서 변경이 핵심
- **Risk:** manual edit가 version/evidence를 우회하면 신뢰 이력이 깨짐

### 10.7 SEO Taxonomy (MODIFY, P0)

- **Affected docs/modules:** IA, SEO, sitemap, metadata, redirect registry, frontend routes
- **Data migration:** old School/Guide/Update slugs에 301 mapping; canonical self-reference 검증
- **Risk:** redirect chain, duplicate indexation, thin Opportunity pages

## 11. Pre-launch vs Post-launch Decisions

### Pre-launch required

- Institution taxonomy와 영유 지원
- Opportunity 경계 및 기존 Event bridge
- Kakao User/AuthIdentity/Profile
- User↔Institution Follow와 Email preference 분리
- manual verification → Notification outbox vertical slice
- Article CMS 최소 모델과 안전한 rendering
- Institution/Opportunity/Article SEO route/canonical/sitemap
- Admin 7개 핵심 모듈의 최소 운영 경로
- GA4 핵심 funnel과 Active Monitoring Parents 서버 지표
- privacy/consent/deletion, backup/restore, error monitoring

### Post-launch acceptable

- browser/PDF/LLM 자동 수집 고도화
- KakaoTalk/push 등 다중 notification channel
- 복잡한 Admin approval/RBAC
- personalization/recommendation
- search engine 분리
- data warehouse/BI stack
- Education Opportunities 실제 기능
- microservices, Kafka, Kubernetes

## 12. Priority Summary

### P0 — Must resolve before further feature coding

1. Institution/Opportunity canonical model
2. User/Kakao/Follow/Preference model
3. Notification targeting and manual verification transaction
4. Unified Article CMS and SEO relation model
5. New route/API/Admin/analytics contracts

### P1 — Must resolve before production launch

1. Production deployment/worker/email topology
2. Admin authorization and privacy operations
3. Observability, backup/restore, failure runbooks
4. Redirect and legacy content migration execution plan

### P2 — Shortly after launch

1. Automated source collection prioritization
2. Read-model/query optimization
3. richer comparison and personalization analytics

### P3 — Future expansion

1. Parallel Education Opportunities domain
2. multi-channel notifications
3. advanced recommendations and intelligence products

## 13. Final Verdict

### Overall Verdict

**부분 재설계 필요**

### Architecture Rewrite Level

**MAJOR** — domain/application boundary rewrite; **not** an infrastructure rewrite.

### KEEP

- Next.js + TypeScript modular monolith
- PostgreSQL + Drizzle migration ownership
- Source registry, authority, observations, snapshots, evidence
- append-only Event/Fact version history and DB invariants
- Alert delivery dedupe, outbox, audit principles
- canonical/redirect/sitemap/structured-data SEO principles

### MODIFY

- School → Institution generalization
- AdmissionEvent → Opportunity product boundary
- Alert → channel-neutral Notification
- automated-first plan → manual-first MVP sequence
- old Admin/IA/SEO/analytics documents → PREPPY growth loop 기준
- security/privacy → Kakao user profile and consent 기준

### REPLACE

- Subscriber/AdmissionCycle Subscription as primary audience model
- Guides/Updates split as editorial CMS
- old category priority, conversion flow, North Star assumptions
- AdmissionRadar public route and product naming contracts

### P0 Issues

1. PREPPY의 canonical Institution 및 영유 타입이 없다.
2. Opportunity가 독립 핵심 도메인/공개 자산으로 표현되지 않는다.
3. Kakao User/Profile과 User↔Institution Follow가 없다.
4. Notification이 legacy cycle subscription과 Email에 결합되어 있다.
5. Article CMS 및 Article→Institution→Follow acquisition path가 없다.

### Recommended Next Step

`02_TARGET_ARCHITECTURE.md`를 작성해 위 5개 P0 결정의 목표 경계, additive migration 순서, API/route 계약, 14-day vertical slice를 확정한다. 그 문서 승인 전에는 새 migration이나 feature 구현을 시작하지 않는다.
