# PREPPY Target Architecture Repository Validation

> **Project:** PREPPY (프레피)  
> **Document Type:** Repository Validation  
> **Date:** 2026-08-22  
> **Validation Target:** `docs/02_TARGET_ARCHITECTURE.md`  
> **Repository State:** AdmissionRadar STEP 0–2

---

# 0. Validation Scope and Method

이 문서는 Target Architecture를 다시 설계하지 않는다. `02_TARGET_ARCHITECTURE.md`의 Product/Domain 결정을 유지한 상태에서 현재 Repository의 코드, PostgreSQL schema, migration, FK, constraint, trigger, test와 대조해 실제 적용 가능성을 판정한다.

## 0.1 Source-of-Truth Order Applied

1. 최신 명시적 Product Decision
2. `One Pager.md`
3. `MVP.md`
4. `00_PRODUCT_REQUIREMENTS_BASELINE.md`
5. `02_TARGET_ARCHITECTURE.md`
6. `01_EXISTING_ARCHITECTURE_AUDIT.md`
7. 기존 AdmissionRadar Architecture 문서
8. 현재 구현 코드

현재 코드와 Target이 다르다는 사실 자체는 conflict가 아니다. 데이터 손실, history 파괴, FK 무결성 저하 또는 P0 제품 경계의 모순이 있을 때만 `CONFLICT`로 판정했다.

## 0.2 Evidence Classification

- **DOCUMENTED:** 문서에만 정의됨
- **IMPLEMENTED:** 코드/schema/migration에 존재함
- **TESTED:** Repository integration/unit test가 해당 동작을 검증함
- **NOT IMPLEMENTED:** 설계는 있으나 runtime code가 없음
- **NOT FOUND:** Repository 어디에서도 확인되지 않음

## 0.3 Repository Facts

- `package.json`은 Next.js 16.3, React 19.2, TypeScript, PostgreSQL driver, Drizzle을 사용한다.
- 실제 application route는 `app/api/health/route.ts` 하나뿐이다.
- README는 Public pages, Admin UI, collection, extraction, email, Alert dispatch가 미구현임을 명시한다.
- DB에는 28개 application table과 2개 migration이 있다.
- `tests/integration/schema-invariants.test.ts`는 28개 table을 truncate하며 실제 PostgreSQL 제약을 검증한다.
- Repository에는 seed/import script와 production database snapshot이 없다. **No existing production data verified.**
- Git repository metadata가 없어 external deployment/traffic/history는 검증할 수 없다.
- 명시적 금지사항에 따라 DB migration 및 integration test는 실행하지 않았고 migration/test source를 정적으로 검증했다.

---

# 1. Executive Verdict

## Q1 — Can the Target Architecture be implemented on this Repository?

**YES_WITH_CHANGES**

현재 Repository에는 Target을 불가능하게 만드는 별도 backend, 이미 배포된 module graph, 대규모 application code 또는 incompatible database가 없다. 신규 canonical domain을 additive하게 추가할 공간이 충분하고 기존 Trust/History 자산은 강하게 재사용할 수 있다.

다만 다음 두 항목은 `03_DOMAIN_MODEL.md` 전에 Target Architecture에 명시적 amendment가 필요하다.

1. legacy AdmissionEvent가 없는 신규 Institution, 특히 영유의 Opportunity가 어떤 canonical verified history를 소유하는지 정의되어 있지 않다.
2. 기존 Alert/AlertDelivery row model은 legacy Cycle Subscription에 DB trigger까지 결합되어 있으므로, “delivery infrastructure 재사용”은 **테이블 재사용이 아니라 reliability pattern 재사용**으로 제한해야 한다.

Implementation Feasibility는 **MEDIUM**이다. 데이터베이스 기반은 강하지만 Product Loop의 Web/Auth/Follow/Admin/CMS/Email/GA4 runtime은 거의 모두 신규 구현이며 외부 provider 구성은 Repository에서 검증할 수 없다.

---

# 2. Architecture Validation Matrix

| Architecture Area | Target Decision | Repository Reality | Status | Severity | Required Change |
|---|---|---|---|---|---|
| Modular Monolith | Next.js+TS, 단일 PostgreSQL, same-repo worker | 단일 package와 DB 존재, worker/service 없음 | SUPPORTED_WITH_CHANGE | LOW | worker entrypoint와 shared application services 추가 |
| Canonical Institution | 신규 Institution + School bridge | School direct FK 4개, 간접 history 다수 | SUPPORTED_WITH_CHANGE | MEDIUM | additive table/link/backfill, unique 1:1 검증 |
| Opportunity | product identity + AdmissionEvent bridge | Event/Version은 강하지만 Cycle 필수 | SUPPORTED_WITH_CHANGE | HIGH | bridge cardinality와 native Opportunity history 확정 |
| Trust/Source | 기존 registry/evidence/history 보존 | schema와 migration 존재, 핵심 invariants 일부 TESTED | SUPPORTED | NONE | 신규 explicit bindings만 추가 |
| Manual-first Monitoring | Admin verified transaction → outbox | nullable detected change/observation으로 manual path 가능, service 없음 | SUPPORTED_WITH_CHANGE | HIGH | application transaction과 manual provenance 구현 |
| User/Identity | User/AuthIdentity/Profile/Consent | subscriber와 admin OIDC schema만 존재 | SUPPORTED_WITH_CHANGE | HIGH | 신규 additive identity model과 Kakao adapter |
| Follow | User↔Institution | 기존 Subscription은 Subscriber↔Cycle | SUPPORTED_WITH_CHANGE | HIGH | 신규 Follow; legacy Subscription과 분리 |
| Notification | channel-neutral core + delivery | Alert/Delivery는 Cycle/Subscription/Email에 강결합 | SUPPORTED_WITH_CHANGE | HIGH | 신규 canonical Notification/Delivery, legacy read-only |
| Outbox | post-commit side effects | generic outbox schema 존재, worker/dedupe claim 없음 | SUPPORTED_WITH_CHANGE | MEDIUM | claim/retry/error/idempotency contract 보강 |
| Unified Article | 신규 Article + relations | Guides/Updates Markdown schema만 존재 | SUPPORTED_WITH_CHANGE | HIGH | 신규 Article/relations; 실제 데이터는 UNKNOWN |
| Public Routes/SEO | Institution/Opportunity/Article routes | health route만 구현, legacy route는 문서에만 존재 | SUPPORTED_WITH_CHANGE | HIGH | public pages와 SEO capability 신규 구현 |
| Analytics | PostgreSQL truth + GA4 | package/config/event abstraction 없음 | SUPPORTED_WITH_CHANGE | MEDIUM | DB metric contract와 GA4 adapter 신규 구현 |
| Admin | 7 modules, same services | admin_users/audit schema만 존재, UI/guard/service 없음 | SUPPORTED_WITH_CHANGE | HIGH | module-oriented Admin 신규 구현 |
| Module Boundaries | 9 modules + infrastructure adapters | schema가 단일 file이나 application dependency 없음 | SUPPORTED_WITH_CHANGE | LOW | Domain Model 후 점진적 module extraction |
| Transactions | Follow/change/article atomic writes | postgres-js supports transactions; helper/service 없음 | SUPPORTED_WITH_CHANGE | HIGH | service transaction API와 idempotency 구현 |
| PostgreSQL Integrity | existing integrity 유지 | FK/index/check/trigger/test가 강함 | SUPPORTED | NONE | 신규 model도 동일 수준 유지 |
| Additive Migration | add→backfill→dual→cutover | 2개 committed migration, no destructive legacy change | SUPPORTED | NONE | 단계별 preflight/backfill verification |
| Deployment | Web+DB+same-repo worker | local Docker DB/health만 존재 | NOT_VERIFIABLE | MEDIUM | hosting/job/secrets/backup/provider 결정 |
| 14-day Vertical Slice | E2E delegation loop | DB 일부만 REUSE, 나머지 대부분 NEW | SUPPORTED_WITH_CHANGE | HIGH | critical path 순서 준수, automation 유예 |
| Future Education Opportunities | Admissions와 병렬 context | 현재 code는 AdmissionCycle만 표현 | SUPPORTED | NONE | 미래 boundary만 유지; 지금 구현하지 않음 |

**Conflict count: 0.** Target 전체를 폐기해야 하는 Repository-level conflict는 발견되지 않았다.

---

# 3. Modular Monolith and Runtime Validation

## Status: SUPPORTED_WITH_CHANGE

### Evidence

- **IMPLEMENTED:** `package.json`은 단일 Next.js/TypeScript package다.
- **IMPLEMENTED:** `src/config`, `src/db`, `app/api`가 하나의 Repository에 있다.
- **IMPLEMENTED:** PostgreSQL migration ownership은 `drizzle.config.ts`와 `src/db/migrate.ts`에 단일화되어 있다.
- **NOT FOUND:** 별도 backend/service deployment 또는 cross-service protocol.
- **NOT IMPLEMENTED:** Worker/Scheduler entrypoint, outbox consumer, job runner.

현재 package 구조는 module boundary 도입을 방해하지 않는다. application code가 거의 없어 cycle dependency도 없다. 동일 Repository worker는 `src/db`와 앞으로 추가될 application service를 import할 수 있다.

보완점은 두 가지다.

1. Web process와 Worker process의 entrypoint/config lifecycle을 분리해야 한다.
2. 현재 `src/db/schema/index.ts` 단일 schema export를 모든 module이 직접 mutation하도록 사용하지 말고 module repository/application service가 write ownership을 가져야 한다.

물리 directory 이동은 지금 필요하지 않다. Domain/Data Model이 확정된 후 새 module부터 경계에 맞게 배치하는 편이 안전하다.

---

# 4. Canonical Institution Validation

## Status: SUPPORTED_WITH_CHANGE

## 4.1 Actual FK Blast Radius

`schools`를 직접 참조하는 FK는 migration snapshot 기준 다음 4개다.

| Referencing Table | FK / Behavior | Risk |
|---|---|---|
| `admission_cycles` | `school_id`, ON DELETE RESTRICT | Admission history root |
| `school_aliases` | `school_id`, ON DELETE CASCADE | alias identity |
| `source_bindings` | `school_id`, ON DELETE RESTRICT; cycle+school composite FK | Trust binding |
| `updates` | nullable `school_id`, ON DELETE RESTRICT | legacy editorial link |

간접 blast radius는 `admission_cycles`를 통해 Event, Fact, ExpectedWindow, MeaningfulChange, Subscription, Alert, Delivery, Evidence history 전체로 이어진다. 따라서 physical rename/drop보다 additive bridge가 명백히 안전하다.

### Constraint/Test Evidence

- `schools.slug` unique (`src/db/schema/index.ts:52-85`).
- school type은 3개 legacy type만 허용한다.
- School+academic year cycle unique와 한 School당 public-focus cycle 1개 제약이 있다.
- `source_bindings`는 Cycle과 School이 동일 aggregate인지 composite FK로 강제한다.
- 위 제약은 integration test에서 duplicate/mismatched relation을 거부하는 것으로 검증된다.

## 4.2 Required Questions

1. **신규 `institutions` 추가 가능:** YES. 기존 table/constraint namespace와 충돌하지 않는다.
2. **1:1 bridge 가능:** YES_WITH_PREFLIGHT. `institution_id`와 `school_id` 각각에 unique를 두는 additive link는 기존 FK와 충돌하지 않는다.
3. **stable school_id/history 보존:** YES. 기존 School/Cycle/Event graph는 그대로 유지할 수 있다.
4. **Public institution_id + legacy school_id 병행:** YES. Public query가 bridge를 통해 legacy history를 읽는 방식이 가능하다.
5. **영유 type만 기존 School에 추가하는 것보다 안전한가:** 장기적으로 Institution이 안전하다. 단기 column 변경량만 보면 legacy enum/check 확장이 더 작지만, 모든 canonical product identity를 School에 고정해 미래 경계를 훼손한다.
6. **Backfill 난이도:** schema상 LOW~MEDIUM. 실제 row count, duplicate canonical names, slug quality는 production data가 없어 UNKNOWN이다.

### Required Change

- backfill 전에 duplicate/invalid slug와 orphan 여부를 read-only preflight한다.
- bridge는 1:1 uniqueness와 non-null mapping 정책을 명시한다.
- legacy School과 신규 Institution의 publication/lifecycle 중 어느 쪽이 canonical인지 Domain Model에서 확정한다.

---

# 5. Opportunity Bridge Validation

## Status: SUPPORTED_WITH_CHANGE

## 5.1 Reusable Admission Engine

- `admission_events`는 stable UUID, cycle-scoped unique event key, type, occurrence, title, audience, importance, actionability, public flag를 가진다.
- `admission_event_versions`는 version number, predecessor, current flag, verification/knowledge/event state, event/registration dates, verified timestamp/admin을 가진다.
- 한 Event당 current version 최대 1개와 version number uniqueness가 DB index로 강제된다.
- migration `0001_productive_morph.sql`은 identity/lineage immutability, monotonic version, predecessor 1-successor를 trigger/index로 보장한다.
- integration tests는 cross-event lineage, branching, reverse version, self-supersede, current+SUPERSEDED를 거부한다.

## 5.2 Event-related FK Blast Radius

| From | Relationship |
|---|---|
| `admission_event_versions` | Event identity와 append-only lineage |
| `admission_facts` | Event+Cycle composite FK |
| `meaningful_changes` | Event+Cycle composite FK |
| `event_version_evidence` | EventVersion evidence |
| `alerts` | MeaningfulChange+Cycle을 통해 간접 결합 |

## 5.3 Type Coverage

현재 Event type은 `BRIEFING`, `OPEN_HOUSE`, `APPLICATION`, `DOCUMENT_SUBMISSION`, `ASSESSMENT`, `INTERVIEW`, `LOTTERY`, `RESULT_ANNOUNCEMENT`, `REGISTRATION`, `ADDITIONAL_RECRUITMENT`, `OTHER`다.

직접 표현되는 항목:

- 설명회, Open House, Application/원서접수, Assessment, Interview, 추첨, 등록, 추가모집

명시적 type이 없는 항목:

- 상담/consultation
- 레벨테스트(Assessment로 의미 축약 가능하지만 category-specific semantic이 손실될 수 있음)
- 일반 신규모집/recruitment announcement
- 독립 deadline type(현재 registration/application close field로 표현)

Product-level Opportunity kind가 위 세부 taxonomy를 소유하면 legacy event는 `OTHER` 또는 근접 type으로 bridge 가능하다.

## 5.4 Required Questions

1. **Event↔Opportunity 1:1 mapping:** 기존 Event 각각에는 가능하다. unique bridge로 명시할 수 있다.
2. **append-only history 보존:** 가능하다. Event/Version row를 수정하지 않고 link만 추가한다.
3. **독립 slug/publication/SEO:** 신규 Opportunity가 소유하면 기존 engine과 충돌하지 않는다.
4. **Cycle을 internal context로 유지:** 가능하다. Public navigation과 DB history root는 분리할 수 있다.
5. **별도 canonical identity vs rename:** 별도 identity가 안전하다. rename은 Event 관련 FK와 tests/migrations 전체를 건드린다.

## 5.5 Architecture Gap

모든 AdmissionEvent는 AdmissionCycle이 필수이고 모든 AdmissionCycle은 legacy School이 필수다. 반면 Target의 신규 영유 Institution은 legacy School이 없을 수 있다. 따라서 다음 질문이 Target에 아직 답해져 있지 않다.

> legacy Event가 없는 native PREPPY Opportunity는 어떤 version/evidence/current-state engine을 사용하는가?

이것은 단순 column 결정이 아니다. P0 영유 Monitoring과 canonical truth ownership을 결정하므로 Architecture Amendment Candidate #1로 올린다.

---

# 6. Trust / Source / Verification Reuse

## Status: SUPPORTED

## 6.1 Reusable Assets

| Asset | Implementation | Integrity/Test |
|---|---|---|
| Source registry | `sources` | canonical URL unique; authority/type/lifecycle checks |
| Monitor config | `source_monitor_configs` | one per Source; MANUAL strategy supported/tested |
| Observation | `source_observations` | outcomes, timing, ETag/Last-Modified; indexes |
| Snapshot | `source_snapshots` | Source+content hash unique |
| Detected Change | `detected_changes` | optional fingerprint dedupe |
| Meaningful Change | `meaningful_changes` | Event/Fact must match Cycle |
| Event Evidence | `event_version_evidence` | explicit Source and optional Observation/Snapshot |
| Fact Evidence | `fact_version_evidence` | explicit Source and optional Observation/Snapshot |
| Historical lineage | Event/Fact versions | unique current, non-branching monotonic lineage TESTED |

## 6.2 Direct Legacy Coupling

- `source_bindings.school_id` is required.
- `source_bindings.admission_cycle_id` is optional but, when present, must belong to the same School.
- Evidence rows do not point to School/Cycle directly; they point to Event/Fact Version plus Source. This makes evidence highly reusable for bridged Opportunity.

## 6.3 Explicit Binding Feasibility

신규 Institution–Source와 Opportunity–Source relation을 별도 explicit FK table로 추가하는 것은 기존 `source_bindings`와 충돌하지 않는다. Generic polymorphic target으로 변환할 필요가 없다.

## 6.4 Last Verified Reality

- Source last checked: `source_observations.observed_at`에서 계산 가능.
- Event/Opportunity version last verified: `admission_event_versions.verified_at`에서 계산 가능.
- Fact last verified: `admission_fact_versions.verified_at`에서 계산 가능.
- Institution profile field last verified: **NOT IMPLEMENTED / NOT FOUND.** 현재 `schools.updated_at`은 편집시각이지 verification evidence가 아니다.
- current projection은 query로 만들 수 있지만 current row가 반드시 존재하거나 VERIFIED임을 보장하는 constraint는 없다. “current verified projection이 쉽다”는 가정은 부분적으로만 확인된다.

---

# 7. Manual-first Monitoring Validation

## Status: SUPPORTED_WITH_CHANGE

Automated collector 없이도 schema-level flow는 성립할 수 있다.

- `source_monitor_configs`가 `MANUAL` strategy/profile을 허용한다.
- Event/Fact Evidence의 `source_observation_id`는 nullable이므로 공식 Source만 연결한 manual evidence가 가능하다.
- `meaningful_changes.detected_change_id`는 nullable이므로 automated diff 없이 change를 만들 수 있다.
- verified version에는 `verified_at`, `verified_by_admin_id`가 있다.
- `outbox_events`는 aggregate type/id와 payload를 수용한다.

그러나 다음은 **NOT IMPLEMENTED**다.

- Admin command/application service
- 이전 current version 종료와 새 version 생성의 atomic operation
- evidence/change/audit/outbox를 묶는 transaction
- manual observation actor/method provenance
- outbox consumer/worker

postgres-js는 transaction을 지원하며 integration test도 `begin`을 사용하므로 기술적 transaction blocker는 없다. 구현 시 하나의 application service transaction으로 묶고 external Email I/O는 commit 이후 worker로 분리할 수 있다.

---

# 8. User / AuthIdentity / Profile / Consent

## Status: SUPPORTED_WITH_CHANGE

## 8.1 Repository Reality

- `subscribers`: normalized email identity와 status만 소유한다.
- `subscriptions`: Subscriber↔AdmissionCycle, verification/unsubscribe state와 consent version/source를 소유한다.
- `subscription_action_tokens`: verify/unsubscribe token이다.
- `admin_users`: external auth subject unique와 status를 갖지만 public User가 아니다.
- `.env.example`과 `src/config/env.ts`: Admin OIDC placeholder만 존재한다.
- Kakao SDK/OAuth/session dependency와 route는 **NOT FOUND**다.

## 8.2 Coexistence

신규 User/AuthIdentity/Profile/Consent/Preference는 기존 table과 이름/FK 충돌 없이 additive하게 도입 가능하다. `(provider, provider_subject)` uniqueness도 기존 `admin_users.external_auth_subject`와 별도 namespace에서 구현 가능하다. User PK에 Kakao ID를 직접 쓰도록 강제하는 현재 구조는 없다.

legacy Subscriber는 자동 User 변환 없이 보존 가능하다. production rows가 실제 존재하는지는 **UNKNOWN — No existing production data verified**다.

## 8.3 Legacy Delivery Coupling

- `alert_deliveries`는 `subscription_id`와 `subscriber_id`가 모두 NOT NULL이다.
- composite FK는 delivery의 subscriber가 subscription owner와 같음을 강제한다.
- trigger는 Alert와 Subscription이 같은 AdmissionCycle인지 insert/update와 parent update에서 강제한다.

Pending Follow Intent는 현재 session/auth infrastructure가 없어 **NOT VERIFIABLE**다. signed cookie/server temporary state, OAuth state/nonce, callback idempotency를 신규 구현해야 한다.

---

# 9. Follow Validation

## Status: SUPPORTED_WITH_CHANGE

기존 Subscription을 Follow로 직접 재사용할 수 없는 이유가 schema에서 확인된다.

1. target이 `institution_id`가 아니라 필수 `admission_cycle_id`다.
2. owner가 User가 아니라 email Subscriber다.
3. lifecycle이 email verification/bounce/suppression을 혼합한다.
4. unique key가 Subscriber+Cycle이라 학년도마다 관계가 갈린다.
5. AlertDelivery와 cycle-consistency trigger에 결합되어 있다.

신규 `Follow(user_id, institution_id)`는 additive하게 도입 가능하다. active uniqueness는 기존 Repository의 partial unique index 패턴(current version, public-focus cycle)과 일관되게 구현할 수 있다. 또는 one-row-per-pair + active/end timestamp로 복구할 수 있으며 선택은 Domain/Data Model로 넘긴다.

Follow와 Email preference를 분리하면 기존 `alert_deliveries` target resolution은 사용할 수 없다. 신규 Notification recipient resolution은 User/Follow/Preference를 읽고 신규 delivery row를 만들어야 한다. Legacy delivery history는 변경하지 않는다.

---

# 10. Notification / Delivery / Outbox Validation

## Status: SUPPORTED_WITH_CHANGE

## 10.1 Reusable Parts

- deterministic `alerts.dedupe_key` unique pattern
- delivery status, attempt count, sent/delivered/opened/clicked/failed timestamps
- delivery logical unique pattern
- outbox status/available/processed/attempt fields
- cross-parent consistency를 DB에서 지키는 철학과 테스트 방식

## 10.2 Non-reusable Legacy Coupling

- `alerts.admission_cycle_id` is required.
- `alerts.meaningful_change_id`는 Cycle과 composite FK로 묶인다.
- `alert_deliveries.subscription_id`와 `subscriber_id`는 required다.
- channel check는 `EMAIL`만 허용한다.
- 3개 trigger가 Alert/Subscription Cycle 일관성을 보장한다.

따라서 legacy table에 nullable User FK를 덧붙여 다형적 recipient를 만드는 방식은 강한 integrity를 약화시키고 conditional constraint를 늘린다. 신규 canonical Notification/Delivery를 병렬 추가하고 legacy Alert/Delivery는 history/read-only로 유지하는 방식이 가장 안전하다.

## 10.3 Outbox Contract Reality

`outbox_events`는 generic payload와 retry status를 수용하므로 재사용 가능하다. 그러나 다음은 없다.

- outbox-level unique dedupe key
- claim owner/lease/locked timestamp
- last error/provider error
- dead-letter policy/max attempts
- worker implementation

단일 worker MVP는 row locking과 idempotent Notification/Delivery key로 보완 가능하지만 “existing outbox가 완성된 processing infrastructure”라는 가정은 false다.

## 10.4 Transition Decision

신규 Notification과 legacy Alert는 transition 동안 schema상 함께 존재해야 한다. 신규 PREPPY flow는 신규 Notification path만 write하고 legacy records는 보존한다. Legacy delivery를 신규 User delivery로 backfill할지는 production data 확인 후 결정한다.

---

# 11. Unified Article CMS Validation

## Status: SUPPORTED_WITH_CHANGE

## 11.1 Current Schema

`guides`와 `updates`는 다음 공통 필드를 가진다.

- UUID, slug unique, status
- title, summary, `body_markdown`
- `seo_title`, `meta_description`
- `published_at`, timestamps

`updates`만 optional School/Cycle relation과 `update_changes` relation을 가진다.

## 11.2 Target Feasibility

신규 Article, Article–Institution, Article–Opportunity relation은 namespace/FK conflict 없이 additive하게 추가 가능하다. 기존 SEO title/description, slug, title/summary, publication timestamp는 변환 대상이 존재할 경우 재사용 가능하다.

## 11.3 Unknowns

- Repository에는 Guide/Update seed 또는 content row가 없다.
- production DB에 row가 있는지 확인할 credentials/snapshot이 없다.
- legacy routes는 문서에만 있고 실제 route code가 없다.
- external traffic/indexation은 확인할 수 없다.
- redirect registry/infrastructure는 **NOT FOUND**다.

따라서 **No existing production data verified.** Markdown→HTML backfill과 redirect는 조건부 migration이며 현재 사실로 단정하지 않는다.

---

# 12. Public Routes and SEO Validation

## Status: SUPPORTED_WITH_CHANGE

- 실제 route: `/api/health`만 **IMPLEMENTED**.
- `/schools`, `/guides`, `/updates`, sitemap 등은 기존 Architecture 문서에 **DOCUMENTED**일 뿐이다.
- target `/institutions`, `/opportunities`, `/articles`, `/my-preppy`는 **NOT IMPLEMENTED**.
- canonical, robots, sitemap, structured data, metadata, redirects는 **NOT IMPLEMENTED**.
- Next.js 16 App Router와 empty `next.config.ts`는 SSR/SSG/ISR 사용을 방해하지 않는다.

실제 legacy traffic이 검증되지 않았으므로 redirect가 반드시 migration-critical하다고 단정할 수 없다. 다만 canonical namespace 혼재 방지를 위해 redirect registry capability는 Target대로 추가할 가치가 있다.

---

# 13. Analytics Validation

## Status: SUPPORTED_WITH_CHANGE

- GA4 package/config: **NOT FOUND**
- event abstraction: **NOT FOUND**
- analytics tables: **NOT FOUND**
- canonical Institution/Opportunity/Article ID를 방해하는 existing event contract: 없음

Target의 PostgreSQL operational truth 방향은 구현 가능하다. User, Follow, NotificationPreference, Delivery가 추가되면 Active Monitoring Parents를 SQL로 재현할 수 있다. 정확한 metric reproducibility를 위해 최소한 다음 상태가 timestamp와 함께 명확해야 한다.

- User active/deleted status
- Follow active interval
- effective email preference
- usable/verified email eligibility

Data Warehouse 제약은 필요하지 않다.

---

# 14. Admin Validation

## Status: SUPPORTED_WITH_CHANGE

### Reusable

- `admin_users` canonical admin identity/status
- Event/Fact `verified_by_admin_id`
- MeaningfulChange/ExpectedWindow reviewer metadata
- generic `audit_logs`
- 기존 `09_ADMIN_OPERATIONS.md`의 evidence/history를 우회하지 않는 운영 원칙

### Not Implemented

- Admin routes/UI
- auth guard/OIDC callback
- application services
- review queue queries
- crawler management runtime
- complex RBAC/workflow

현재 direct DB editor code도 없으므로 Target의 “Admin uses same Application Service” 규칙과 충돌하지 않는다. Manual verification service가 이전 current version, 새 verified version, evidence, meaningful change, audit, outbox를 한 transaction으로 다루면 기존 invariant를 유지할 수 있다.

---

# 15. Module and Dependency Boundary Validation

## Status: SUPPORTED_WITH_CHANGE

현재 application module/import graph가 거의 없으므로 확인된 cycle dependency는 없다. `src/db/schema/index.ts`가 모든 table을 한 파일에서 export하지만 이는 persistence declaration의 집중이지 이미 발생한 domain cycle은 아니다.

Target module을 적용할 때 주의할 점:

1. Admissions가 Institution ID/bridge를 참조하되 Institution module이 Admissions write에 의존하지 않는다.
2. Trust evidence는 Admission version을 참조하지만 generic entity mutation을 소유하지 않는다.
3. Notification recipient query는 Follow/Identity를 읽되 이들의 row를 update하지 않는다.
4. Admin은 각 module application service를 조합한다.
5. shared schema를 module이 직접 update하는 관행을 만들지 않는다.

추가 framework, DI container, CQRS library는 필요하지 않다. physical directory migration은 새 Domain Model이 확정된 뒤 점진적으로 수행해야 한다.

---

# 16. Transaction Boundary Validation

| Transaction | Repository Support | Missing | Status |
|---|---|---|---|
| Follow create | PostgreSQL, postgres-js transaction 가능 | User/Institution/Follow/service 없음 | SUPPORTED_WITH_CHANGE |
| Verified Opportunity Change | version/evidence/change/outbox tables 존재 | atomic service/current swap 없음 | SUPPORTED_WITH_CHANGE |
| Article Publish | PostgreSQL transaction 가능 | Article/sanitizer/service 없음 | SUPPORTED_WITH_CHANGE |
| Email Delivery | delivery/outbox patterns 존재 | provider/worker/claim protocol 없음 | SUPPORTED_WITH_CHANGE |

Transaction nesting을 발생시키는 application helper가 현재 없어 기존 conflict는 없다. 앞으로 service가 transaction handle을 명시적으로 전달하거나 unit-of-work boundary를 하나만 소유해야 한다.

Verified version 변경 시 partial unique current index 때문에 순서와 concurrency가 중요하다. 이전 current를 해제하고 새 row를 current로 추가하는 과정은 하나의 transaction과 row/advisory locking policy가 필요하다. 기존 tests는 uniqueness를 검증하지만 이 mutation service 자체는 검증하지 않는다.

---

# 17. PostgreSQL Integrity Preservation

## Status: SUPPORTED

Target을 additive하게 적용하면 다음 기존 자산을 그대로 보존할 수 있다.

- School/Cycle, Event/Cycle, Fact/Event/Cycle composite FK
- current Event/Fact version partial unique indexes
- version identity/lineage immutability triggers
- monotonic non-branching lineage
- Source canonical URL and snapshot dedupe
- Alert/Delivery dedupe와 Cycle consistency triggers
- updated_at database triggers
- test database safety/advisory lock

주의: 기존 strong constraint를 보호한다는 것은 legacy AlertDelivery를 억지로 신규 User delivery에 재사용해야 한다는 뜻이 아니다. 신규 canonical table에도 동등한 explicit FK/unique/check를 설계하는 것이 맞다.

---

# 18. Additive Migration Dependency Graph

Migration SQL은 작성하지 않는다. 아래는 dependency와 위험만 검증한 단계다.

## Stage A — New Canonical Foundations

- **Prerequisite:** Domain cardinality/lifecycle decisions 승인
- **Scope:** Institution, Opportunity identity, User/Auth/Profile/Consent, Follow, Notification/Delivery, Article, explicit relations
- **FK risk:** LOW; existing tables를 변경하지 않는 신규 namespace
- **Data loss risk:** NONE
- **Rollback difficulty:** LOW if no production writes

## Stage B — Legacy Mapping and Conditional Backfill

- **Prerequisite:** production row inventory, slug/type mapping rules
- **Affected:** Schools→Institutions, Events→Opportunities, optional Guides/Updates→Articles
- **FK risk:** MEDIUM; mapping must match Event→Cycle→School aggregate
- **Data loss risk:** LOW when legacy rows remain untouched
- **Rollback difficulty:** MEDIUM after canonical IDs are externally exposed

## Stage C — Dual Compatibility

- **Prerequisite:** mapping coverage checks and query contract
- **Affected:** Public read projection, source bindings, Admin reads
- **FK risk:** MEDIUM; duplicate truth sources/incorrect mapping risk
- **Data loss risk:** LOW
- **Rollback difficulty:** MEDIUM

## Stage D — Canonical Public/Product Switch

- **Prerequisite:** complete target pages, auth/follow, notification, article, analytics
- **Affected:** public IDs/slugs, Admin commands, GA4 properties, deep links
- **FK risk:** LOW at DB, HIGH at application consistency
- **Data loss risk:** LOW
- **Rollback difficulty:** HIGH after traffic/Follow writes begin

## Stage E — Legacy Write Retirement

- **Prerequisite:** new flow stable, delivery/history reconciliation complete
- **Affected:** legacy Subscriber/Subscription/Alert/Guide/Update write paths
- **FK risk:** MEDIUM
- **Data loss risk:** MEDIUM if retirement precedes retention checks
- **Rollback difficulty:** HIGH

## Stage F — Legacy Cleanup, Post-validation Only

- **Prerequisite:** production validation, backup, retention/redirect policy
- **Affected:** deprecated code/table candidates only
- **FK risk:** HIGH due indirect School/Cycle graph
- **Data loss risk:** HIGH
- **Rollback difficulty:** VERY HIGH

Target의 M1→M6 순서에는 한 가지 조정이 필요하다. Manual vertical slice가 Source binding과 verified Opportunity를 필요로 하므로 Institution/Opportunity explicit source relation의 최소 subset은 Article/Notification cutover보다 먼저 준비되어야 한다. 전체 source generalization은 후속 단계로 남겨도 된다.

---

# 19. 14-Day Vertical Slice Feasibility

## Critical Path

| Order | Capability | Repository Classification | Dependency/Note |
|---:|---|---|---|
| 1 | PostgreSQL/Drizzle migration harness | EXISTS | additive migration 기반 |
| 2 | Institution + School bridge | NEW | Opportunity/Public ID의 선행조건 |
| 3 | Opportunity + Event bridge/native truth path | NEW/MODIFY | Amendment #1 필요 |
| 4 | Source/Evidence/Version history | REUSE | explicit binding과 manual provenance 보강 |
| 5 | User/AuthIdentity/Profile/Consent | NEW | Kakao integration 선행 |
| 6 | Follow + pending intent | NEW | User+Institution 필요 |
| 7 | Notification/Delivery + outbox contract | NEW/REUSE | pattern 재사용, legacy table 직접 재사용 금지 |
| 8 | Article + structured relations | NEW | Public acquisition asset |
| 9 | Public SSR pages/read projections | NEW | canonical objects 필요 |
| 10 | Admin verification service/UI | NEW/REUSE | version/evidence/outbox 사용 |
| 11 | Worker + Email adapter | NEW/REUSE | outbox claim/dedupe 필요 |
| 12 | GA4 + DB North Star query | NEW | stable IDs/state 필요 |
| 13 | Deep-link E2E verification | NEW | 전체 slice 통합 |

## Parallelizable Work

- Institution/Opportunity schema 결정 후 Public read UI와 Admin UI skeleton
- Identity/Follow와 Article CMS
- Email adapter와 GA4 adapter는 core domain contract가 정해진 뒤 병렬 가능
- 초기 content/data preparation은 canonical schema 이후 병렬 가능

## Reusable Assets

- migration harness
- Trust/Source/Version/Evidence schema
- database invariants and test style
- outbox row lifecycle skeleton
- Admin actor/audit metadata
- Next.js App Router runtime

## Blocking Assessment

확인된 **Repository-level hard blocker는 없다.** 그러나 vertical slice 구현 전에 다음 architecture decisions가 필요하다.

1. native Opportunity truth/history ownership
2. canonical Notification/Delivery parallel transition

Kakao credentials/provider settings, Email provider, deployment worker와 GA4 property는 Repository에 없어 external readiness는 `NOT_VERIFIABLE`이다.

---

# 20. ADR Validation Matrix

| ADR | Decision | Repository Evidence | Status | Risk | Note |
|---|---|---|---|---|---|
| ADR-001 | Modular Monolith | single Next package/PostgreSQL; no services | SUPPORTED_WITH_CHANGE | LOW | worker entrypoint NEW |
| ADR-002 | Canonical Institution additive | School direct FK 4개 + large indirect history | SUPPORTED_WITH_CHANGE | MEDIUM | 1:1 preflight required |
| ADR-003 | Product Opportunity + Event bridge | Event/Version reusable; Cycle/School required | SUPPORTED_WITH_CHANGE | HIGH | native Opportunity gap |
| ADR-004 | Preserve Trust/History | source/evidence/version/lineage IMPLEMENTED+TESTED | SUPPORTED | LOW | Institution verification 신규 |
| ADR-005 | New User/Follow | legacy Subscriber/Subscription semantics mismatch | SUPPORTED_WITH_CHANGE | HIGH | additive coexistence safe |
| ADR-006 | Channel-neutral Notification | Alert/Delivery Email/Cycle coupled | SUPPORTED_WITH_CHANGE | HIGH | parallel canonical tables |
| ADR-007 | Outbox external effects | outbox schema exists, consumer/dedupe absent | SUPPORTED_WITH_CHANGE | MEDIUM | processing contract needed |
| ADR-008 | Manual-first Monitoring | MANUAL config; nullable detection/observation refs | SUPPORTED_WITH_CHANGE | MEDIUM | service/provenance NEW |
| ADR-009 | Unified Article | Guides/Updates exist; data UNKNOWN | SUPPORTED_WITH_CHANGE | MEDIUM | conditional migration |
| ADR-010 | SEO launch architecture | Next supports SSR; pages/SEO NOT IMPLEMENTED | SUPPORTED_WITH_CHANGE | HIGH | entirely new public layer |
| ADR-011 | PostgreSQL metrics | PostgreSQL exists; User/Follow/Preference NEW | SUPPORTED_WITH_CHANGE | MEDIUM | metric state contract needed |
| ADR-012 | Future Education Opportunities separate | no code blocks future parallel context | SUPPORTED | LOW | do not implement now |

ADR 자체를 뒤집어야 할 `CONFLICT`는 없다. ADR-003과 ADR-006의 적용 범위를 명확히 하는 amendment가 필요하다.

---

# 21. Architecture Assumptions Validation

| Assumption | Status | Repository Fact |
|---|---|---|
| same-repo worker 실행 가능 | PARTIALLY_CONFIRMED | single package/import reuse 가능, worker entrypoint/hosting 없음 |
| legacy School bridge가 1:1 가능 | PARTIALLY_CONFIRMED | schema 충돌 없음, actual production cardinality/data UNKNOWN |
| AdmissionEvent와 Opportunity 1:1 bridge 가능 | PARTIALLY_CONFIRMED | existing Event에는 가능, native 영유 Opportunity에는 Event root 없음 |
| append-only history를 그대로 보존 가능 | CONFIRMED | Event/Fact versions and lineage constraints |
| Outbox를 Notification에 그대로 재사용 가능 | PARTIALLY_CONFIRMED | row schema generic; dedupe/claim/worker 미구현 |
| existing delivery infrastructure 재사용 가능 | FALSE if interpreted as table reuse | non-null Subscriber/Subscription and Cycle triggers |
| delivery reliability pattern 재사용 가능 | CONFIRMED | status/attempt/dedupe/test pattern 존재 |
| Guide/Update migration 대상 데이터가 존재 | UNKNOWN | schema만 있고 production data 미검증 |
| legacy routes가 traffic을 보유 | UNKNOWN | 문서만 있고 실제 route/analytics 없음 |
| current verified projection 생성이 쉽다 | PARTIALLY_CONFIRMED | indexes 존재; current existence/verified status 보장 없음 |
| Source binding generalization이 additive 가능 | CONFIRMED | independent explicit FK relations 추가 가능 |
| Manual path에 collector가 필요 없음 | CONFIRMED | nullable detectedChange/Observation + MANUAL config |
| Last Verified를 기존 data로 모두 계산 가능 | FALSE | Event/Fact/Source는 가능, Institution profile verification 없음 |
| Kakao pending Follow intent를 기존 auth에 붙일 수 있음 | UNKNOWN | public auth/session infrastructure 없음 |
| Article redirect가 반드시 필요 | UNKNOWN | production URL exposure/traffic 미검증 |

---

# 22. Direct Answers to Required Questions

## Q1

`02_TARGET_ARCHITECTURE.md`는 현재 Repository 위에서 구현 가능한가?

**YES_WITH_CHANGES.** additive domain tables와 bridge를 도입할 물리적 공간이 있고 existing history를 보존할 수 있다. 두 architecture gap을 보완해야 한다.

## Q2

Repository 사실과 다른 가장 중요한 가정 Top 5:

1. Existing AlertDelivery table을 신규 Notification delivery에 재사용할 수 있다는 해석.
2. 모든 Opportunity가 legacy AdmissionEvent history에 자연스럽게 bridge된다는 가정.
3. Existing Outbox가 worker-ready/dedupe-complete infrastructure라는 가정.
4. 모든 public `Last Verified`가 existing data에서 파생 가능하다는 가정.
5. Guides/Updates data와 legacy route traffic이 실제로 존재한다는 가정.

## Q3

예상보다 더 많이 재사용할 수 있는 자산:

- Event/Fact append-only version과 lineage
- Evidence가 Observation 없이도 official Source에 직접 연결되는 manual path
- nullable `detected_change_id`를 통한 manual MeaningfulChange
- MANUAL monitor config
- composite FK와 concurrency-focused test pattern
- Alert/Delivery의 status/timestamp/dedupe 설계 패턴

## Q4

예상보다 migration risk가 큰 영역:

1. Notification delivery: non-null legacy FKs와 3개 cycle consistency trigger.
2. Opportunity: native Institution이 legacy School/Cycle 없이 history를 가져야 하는 문제.
3. Institution backfill: schema는 안전하지만 actual production slug/type/cardinality가 UNKNOWN.

## Q5

Institution additive bridge는 실제로 안전한가?

**YES_WITH_PREFLIGHT.** 기존 FK를 건드리지 않는 1:1 link는 안전하다. actual duplicate/invalid slug 및 mapping cardinality는 production data 확인 전 확정할 수 없다.

## Q6

Opportunity→AdmissionEvent bridge는 실제로 가능한가?

**기존 Event에는 YES. 신규 native Opportunity 전체에는 PARTIAL.** bridge cardinality와 non-legacy truth path를 Target에 명시해야 한다.

## Q7

User/Follow와 legacy Subscriber/Subscription은 공존 가능한가?

**YES.** 독립 additive tables로 안전하게 공존할 수 있다. Email 동일성만으로 자동 account linking을 해서는 안 된다.

## Q8

Alert/Delivery/Outbox를 얼마나 재사용할 수 있는가?

- Alert/Delivery **row model:** 낮음
- status/dedupe/retry/history **pattern:** 높음
- Outbox **table skeleton:** 중간
- existing worker runtime: 없음

## Q9

Manual-first Monitoring은 collector 없이 가능한가?

**YES.** schema가 manual evidence/change를 허용한다. 다만 Admin transaction service는 신규 구현해야 한다.

## Q10

Unified Article과 legacy Guides/Updates를 안전하게 보존 가능한가?

**YES_WITH_CHANGE.** legacy tables를 유지한 additive Article은 안전하다. 실제 data/traffic이 미검증이므로 backfill/redirect 필요성은 conditional이다.

## Q11

14-day slice를 막는 Repository-level blocker가 있는가?

**확인된 hard blocker는 없다.** 거의 모든 Product runtime이 NEW이므로 일정 리스크는 높지만 architecture incompatibility는 아니다.

## Q12

`03_DOMAIN_MODEL.md` 전에 Target 자체를 수정해야 하는가?

**YES.** Amendment Candidate #1과 #2를 반영하거나 명시적으로 승인해야 한다.

---

# 23. Architecture Amendment Candidates

## Architecture Amendment Candidate #1

**Target Section:** 8.2 Reuse Existing Admission Engine, 10.2 Critical Transaction Boundary, ADR-003

**Current Decision:** Product-level Opportunity를 신규 도입하고 legacy AdmissionEvent/Version history를 bridge한다.

**Repository Evidence:** `admission_events.admission_cycle_id`는 required이고 AdmissionCycle은 required `school_id`를 가진다. P0 영유는 신규 Institution이지만 legacy School type constraint로 표현되지 않는다.

**Problem:** legacy School/Event가 없는 native Institution Opportunity의 verified current state, evidence, version history owner가 정의되지 않았다.

**Recommended Amendment:** Opportunity↔AdmissionEvent bridge를 `0..1`로 명시하고, native Opportunity가 사용할 canonical version/evidence path를 Architecture 수준에서 선택한다. 대안은 (a) native Opportunity version/evidence 모델 또는 (b) 모든 admissions Institution에 compatibility School/Cycle을 생성하는 정책이다. 구체 schema는 Data Model로 넘기되 truth ownership은 Target에서 결정한다.

**Why architecture-level change is necessary:** Admissions truth의 aggregate owner와 history system을 결정하는 문제이며 exact column 문제가 아니다.

**Impact if not changed:** 영유 P0 Opportunity가 history/evidence를 우회하거나, 의미 없는 shadow School/Cycle이 구현 중 임의로 생성되어 canonical model이 흔들린다.

## Architecture Amendment Candidate #2

**Target Section:** 13.4 Reuse Existing Delivery Infrastructure, Phase M4, ADR-006

**Current Decision:** Product Notification을 추가하고 existing Outbox/Delivery reliability pattern을 재사용하며 legacy Subscription FK를 제거 또는 bridge한다.

**Repository Evidence:** `alert_deliveries.subscription_id/subscriber_id`는 NOT NULL이고 composite FK가 있으며, Alert와 Subscription Cycle을 맞추는 insert/update/parent-update trigger 3개가 있다. `alerts.admission_cycle_id`도 required다.

**Problem:** 기존 row model을 nullable dual-target 또는 FK removal로 전환하면 legacy integrity를 약화시키고 transition risk가 커진다.

**Recommended Amendment:** PREPPY canonical Notification/Delivery는 additive parallel model로 신설하고, 기존 Alert/Delivery에서는 status/dedupe/retry/history 패턴만 재사용한다고 명시한다. Legacy tables는 migration 검증 전 read-only history로 보존한다.

**Why architecture-level change is necessary:** Notification transition topology와 data ownership을 결정한다.

**Impact if not changed:** 구현자가 legacy table을 다형적 recipient table로 변형해 강한 FK/trigger를 제거하거나 복잡한 conditional integrity를 만들 수 있다.

---

# 24. Domain Model Open Questions

이 섹션은 결정을 확정하지 않고 `03_DOMAIN_MODEL.md`로 넘긴다.

1. Institution type taxonomy와 영유의 공식 naming
2. International School과 Foreign School의 public classification
3. Institution lifecycle/publication state와 legacy School lifecycle의 우선권
4. Opportunity kind taxonomy: 상담, 레벨테스트, 신규모집, deadline 포함 방식
5. Opportunity lifecycle와 publication/verification state 분리
6. Opportunity↔AdmissionEvent cardinality 및 native Opportunity truth owner
7. AdmissionCycle이 없는 Opportunity 허용 여부
8. Institution profile field verification/evidence aggregate
9. Public `Last Verified` derivation 규칙
10. Follow lifecycle, reactivation, active interval
11. Consent lifecycle과 Email preference의 effective state
12. Follow 시각과 change 시각에 따른 Notification eligibility
13. Notification과 MeaningfulChange/New Opportunity의 cardinality
14. Article type/category/lifecycle와 Update성 Article의 관계
15. User deletion 후 Delivery/Audit history의 identity 처리

---

# 25. Data Model Open Questions

이 섹션은 Migration SQL 없이 `04_DATA_MODEL.md`로 넘긴다.

1. Institution PK/slug 및 legacy school mapping unique constraint
2. mapping backfill preflight와 unresolved row 처리
3. Opportunity PK/slug와 optional AdmissionEvent bridge FK
4. bridge의 Institution–School–Cycle aggregate 일치 보장 방식
5. native Opportunity version/evidence physical schema
6. current verified projection과 current existence constraint/transaction
7. Institution profile verification storage
8. explicit Institution/Opportunity Source binding FK와 unique/index
9. User/AuthIdentity provider+subject unique와 account status
10. Profile/Consent/NotificationPreference normalization
11. active Follow unique 및 history 보존 방식
12. canonical Notification dedupe key와 recipient snapshot timing
13. NotificationDelivery User/channel unique와 provider attempt history
14. Outbox dedupe/claim/lease/error/dead-letter fields
15. Article slug/status/SEO/HTML sanitization state
16. Article–Institution/Opportunity relation indexes
17. optional legacy Guide/Update backfill 및 slug conflict inventory
18. redirect registry PK/chain prevention
19. Active Monitoring Parents query indexes
20. additive migration verification/rollback checkpoints

---

# 26. MVP Non-Scope Guard

다음은 기존 문서에 언급되거나 future path가 있어도 MVP critical path에서 제외한다.

- automated collector/browser/PDF/LLM extraction
- Microservices, Kafka, Kubernetes
- CQRS framework/full Event Sourcing
- Elasticsearch/OpenSearch/Data Warehouse
- AI recommendation/consultation
- Push/Kakao message notification
- Mobile App
- Ads/Lead Marketplace
- Camp/After-school DB
- Complex RBAC/approval workflow

이 중 actual runtime code는 Repository에서 발견되지 않았다.

---

# 27. Repository Validation Verdict

## Repository Validation Verdict

### Target Architecture

**VALID_WITH_AMENDMENTS**

### Implementation Feasibility

**MEDIUM**

### Repository-level Blockers

1. 확인된 물리적 hard blocker는 없다.
2. 외부 Kakao/Email/GA4/deployment readiness는 Repository에서 검증할 수 없다.

### Architecture Amendments Required Before 03_DOMAIN_MODEL

1. legacy AdmissionEvent가 없는 native Opportunity의 canonical version/evidence/history ownership을 명시한다.
2. Notification 전환은 legacy Alert/Delivery table 변경이 아니라 additive parallel model + reliability-pattern reuse임을 명시한다.

### Validated Reusable Assets

- Next.js/TypeScript/PostgreSQL/Drizzle modular-monolith foundation
- Source registry, authority, monitoring config, observations, snapshots
- Event/Fact append-only versions, current uniqueness, evidence, lineage
- MeaningfulChange manual-compatible schema
- Alert/Delivery dedupe/status/history patterns
- Outbox row lifecycle skeleton
- Admin actor/audit metadata
- PostgreSQL integration-test safety and invariant test style

### Highest Migration Risks

1. Opportunity bridge 밖 native Institution의 verified truth/history 공백
2. legacy AlertDelivery의 Subscription/Subscriber/Cycle FK 및 trigger 결합
3. production data/slug/traffic 부재로 인한 backfill·redirect 규모의 불확실성

### Domain Model Open Questions

1. Opportunity↔AdmissionEvent cardinality와 native Opportunity truth owner
2. Institution/Opportunity lifecycle 및 Last Verified 규칙
3. Follow/Consent/Preference/Notification eligibility lifecycle
4. Article lifecycle와 structured relation semantics

### Data Model Open Questions

1. Institution–School 및 Opportunity–Event mapping constraints
2. native Opportunity versions/evidence schema
3. active Follow와 Notification/Delivery dedupe constraints
4. Outbox processing/idempotency columns
5. Article/redirect/source binding backfill sequencing

### Recommended Next Step

`02_TARGET_ARCHITECTURE.md`에 Amendment Candidate #1과 #2를 반영하거나 별도 승인 기록으로 확정한 뒤 `03_DOMAIN_MODEL.md`를 작성한다. 그 전에는 schema/migration/feature 구현을 시작하지 않는다.
