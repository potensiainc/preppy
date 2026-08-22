# PREPPY Domain Model Repository Validation

## 0. 문서 목적과 판정 범위

이 문서는 `docs/03_DOMAIN_MODEL.md`를 다시 설계하지 않는다. 목적은 그 문서가 확정한 Domain 의미와 invariant를 현재 Repository의 PostgreSQL/Drizzle 기반 위에 history 손실이나 제품 의미 왜곡 없이 구현할 수 있는지 검증하는 것이다.

검증 기준일은 2026-08-22이다. 다음 문서의 전체 내용과 현재 Repository의 Drizzle schema, SQL migration, PostgreSQL constraint/trigger, integration test, runtime/config 코드를 대조했다.

- `docs/One Pager.md`
- `docs/MVP.md`
- `docs/00_PRODUCT_REQUIREMENTS_BASELINE.md`
- `docs/01_EXISTING_ARCHITECTURE_AUDIT.md`
- `docs/02_TARGET_ARCHITECTURE.md`
- `docs/02A_TARGET_ARCHITECTURE_REPOSITORY_VALIDATION.md`
- `docs/03_DOMAIN_MODEL.md`
- `src/db/schema/index.ts`
- `src/db/migrations/0000_absent_shen.sql`
- `src/db/migrations/0001_productive_morph.sql`
- `tests/integration/schema-invariants.test.ts`
- `tests/support/test-database.ts`
- `src/db/connection.ts`
- `src/db/migrate.ts`
- `src/config/env.ts`
- `app/api/health/route.ts`

이번 검증에서는 migration을 생성하거나 실행하지 않았다. Production data row/cardinality와 Kakao 외부 provider 동작은 Repository만으로 확인할 수 없으므로 해당 사항은 명시적으로 `NOT_VERIFIABLE`로 구분한다.

판정 용어:

- `SUPPORTED`: 현재 기반에서 Domain 의미를 그대로 보존할 수 있다.
- `SUPPORTED_WITH_DATA_MODEL_DECISION`: Domain 의미는 유효하고 additive 구현이 가능하지만 `04_DATA_MODEL.md`에서 물리 결정을 내려야 한다.
- `CONFLICT`: 기존 강한 invariant 또는 relationship 때문에 Domain 의미를 그대로 적용할 수 없다.
- `NOT_VERIFIABLE`: Production data, 외부 provider 또는 구현 부재로 확인할 수 없다.

## 1. Executive Verdict

`03_DOMAIN_MODEL.md`는 현재 Repository 기반에서 구현 가능하다. 결론은 **VALID**이며, Domain-level blocker나 필수 Domain amendment는 없다.

현재 Repository는 28개 legacy application table을 중심으로 `School → AdmissionCycle → AdmissionEvent/Fact → Version/Evidence → MeaningfulChange → Alert/Delivery` 구조를 강하게 보호한다. 이 구조를 canonical PREPPY 모델로 rename/reshape하거나 Native Opportunity를 기존 Event tree에 강제로 넣으면 충돌한다. 그러나 `03_DOMAIN_MODEL.md`는 바로 그 위험을 피하도록 다음을 명시한다.

- canonical `Institution`을 legacy `School`과 병렬 도입한다.
- `Opportunity↔AdmissionEvent`를 optional 최대 1:1 bridge로 둔다.
- Native Opportunity에는 별도 version/evidence/history path를 둔다.
- canonical `User/Follow/Notification/Delivery/Article`을 legacy row model과 병렬 도입한다.
- 기존 table은 migration source 또는 검증된 pattern으로만 재사용한다.

따라서 Repository 현실은 Domain Model과 충돌하지 않는다. 다만 핵심 invariant를 PostgreSQL에서 강제하는 구체적 key, composite FK, partial unique index, constraint trigger, transaction, retention 전략은 `04_DATA_MODEL.md`의 P0 결정이다.

## 2. Repository Evidence Baseline

### 2.1 현재 구현 범위

| Evidence | State | 확인 결과 |
| --- | --- | --- |
| `tests/integration/schema-invariants.test.ts:19-50` | TESTED | migration 대상으로 관리되는 application table 28개가 명시되어 있다. canonical Institution/Opportunity/User/Follow/Notification/Article table은 아직 없다. |
| `src/db/schema/index.ts:52-1120` | IMPLEMENTED | legacy admission, trust, content, subscriber, alert schema가 Drizzle로 정의되어 있다. |
| `src/db/migrations/0000_absent_shen.sql` | IMPLEMENTED | base table, FK, check, unique/index, cross-entity consistency trigger가 설치된다. |
| `src/db/migrations/0001_productive_morph.sql` | IMPLEMENTED | Event/Fact version lineage의 non-branching과 monotonicity를 보강한다. |
| `tests/integration/schema-invariants.test.ts:190-1090` | TESTED | 28개 DB invariant 시나리오가 실제 SQL 실패/성공으로 검증된다. |
| `app/api/health/route.ts` | IMPLEMENTED | 현재 확인되는 application route는 health check뿐이다. Domain service/runtime은 아직 없다. |
| Kakao OAuth/provider | NOT FOUND | provider subject, callback, token 검증 runtime이 Repository에 없다. |
| Production row/cardinality | NOT VERIFIABLE | Repository 정적 검증 범위에서는 실제 production data를 확인하지 않았다. |

### 2.2 재사용할 수 있는 강한 Repository 철학

현재 Repository는 단순 ORM validation보다 PostgreSQL invariant를 우선한다.

- partial unique index로 current row를 하나만 허용한다.
- composite FK로 cycle/school, event/cycle, change/cycle, delivery/subscriber 관계를 일치시킨다.
- trigger로 단순 FK를 넘는 lineage와 concurrency invariant를 보호한다.
- unique dedupe key로 Alert/Delivery 중복 생성을 막는다.
- evidence row는 Source를 필수로 하고 Observation/Snapshot은 선택적으로 둔다.
- 외부 효과는 Outbox를 통해 transaction 이후 처리할 기반을 둔다.

이 철학은 canonical PREPPY 모델에도 그대로 적용할 수 있다.

## 3. Institution Domain Validation

### 3.1 Canonical Institution 병렬 도입

**Status: SUPPORTED_WITH_DATA_MODEL_DECISION**

`schools`는 이미 AdmissionCycle, aliases, source binding, editorial update의 legacy root다. `admission_cycles.school_id`는 `NOT NULL`이며 delete도 `RESTRICT`다 (`src/db/schema/index.ts:114-154`). 따라서 `schools`를 직접 canonical Institution으로 rename하거나 의미를 확장하는 것은 불필요하게 기존 graph를 흔든다.

반대로 신규 `institutions`와 unique bridge를 additive하게 도입하는 것은 기존 FK graph에 영향을 주지 않는다. Institution은 자기 PK로 독립하며 legacy mapping이 없는 Native 영유도 정상적으로 존재할 수 있다.

권장 물리 방향:

- canonical `Institution`은 자체 PK, canonical slug, public category, secondary classification, operational state, publication state를 가진다.
- legacy mapping은 별도 bridge 또는 nullable unique FK로 표현한다.
- `institution_id`와 `legacy_school_id` 양쪽에 uniqueness를 강제해 `0..1↔0..1`을 보장한다.
- legacy history는 기존 `schools` graph에 그대로 보존하고 public read path만 Institution을 기준으로 수렴시킨다.

### 3.2 Taxonomy와 state 호환성

**Status: SUPPORTED_WITH_DATA_MODEL_DECISION**

`schools_school_type_check`는 `PRIVATE_ELEMENTARY`, `INTERNATIONAL_SCHOOL`, `FOREIGN_SCHOOL`만 허용한다 (`src/db/schema/index.ts:72-75`). `ENGLISH_KINDERGARTEN`이 없으므로 신규 public taxonomy를 기존 `schools.school_type`에 넣을 수는 없다. 그러나 신규 Institution taxonomy는 독립 constraint로 정의할 수 있어 Domain conflict가 아니다.

`INTERNATIONAL_SCHOOL`과 `FOREIGN_SCHOOL`의 legacy 구분은 Institution의 secondary classification 또는 bridge-derived classification으로 보존 가능하다. public category를 `INTERNATIONAL_SCHOOL`로 통합하면서 내부 구분을 잃을 이유가 없다.

`schools.lifecycle_status`와 `is_public`이 분리되어 있다는 기존 pattern도 operational/publication state 분리를 지지한다 (`src/db/schema/index.ts:61-68`). 신규 Institution에서는 이를 명시적인 별도 state로 모델링하면 된다.

### 3.3 Last Verified 오인 위험

**Status: SUPPORTED_WITH_DATA_MODEL_DECISION**

`updated_at`은 공통 modification timestamp이며 direct SQL update에도 trigger로 갱신된다. `tests/integration/schema-invariants.test.ts:1021-1035`는 이 동작을 검증한다. Repository application code에서 `schools.updated_at`을 Last Verified로 읽는 path는 찾지 못했다. 따라서 현재 오용 충돌은 없지만, 신규 UI/query가 이를 verification timestamp로 사용하지 못하도록 명명과 read model을 분리해야 한다.

## 4. Institution Fact Validation

### 4.1 재사용 가능한 pattern과 직접 재사용 불가 이유

**Status: SUPPORTED_WITH_DATA_MODEL_DECISION**

재사용할 수 있는 pattern:

- Fact identity와 FactVersion 분리
- `(fact_id, version_no)` unique
- current version partial unique
- same-parent predecessor composite FK
- one-successor partial unique
- monotonic lineage trigger
- `verified_at`, `verified_by_admin_id`
- Source 필수, Observation/Snapshot 선택 evidence
- typed value/date consistency check

근거는 `admission_facts`/`admission_fact_versions` (`src/db/schema/index.ts:306-430`), `fact_version_evidence` (`src/db/schema/index.ts:827-858`), `0001_productive_morph.sql`, 그리고 lineage/typed value test (`tests/integration/schema-invariants.test.ts:796-1019, 1062-1090`)다.

그러나 `admission_facts.admission_cycle_id`는 `NOT NULL`이고 Event scope도 Event/Cycle 일치를 composite FK로 강제한다. Institution profile fact를 직접 넣으려면 가짜 AdmissionCycle이 필요하므로 직접 row model 재사용은 Domain rule과 충돌한다. 별도 Institution Fact path 또는 최소 profile verification path가 필요하다.

### 4.2 MVP 최소 first-class versioning 권고

모든 Institution field를 versioned fact로 만드는 것은 과설계다. MVP에서 결정 영향과 변경 가능성이 큰 다음 정보만 first-class verified history 후보로 둔다.

1. 학비와 필수 비용: tuition, application/registration fee처럼 비교·의사결정에 직접 영향을 주는 금액
2. 지원 자격: 연령/학년, 국적·거주·언어 등 핵심 eligibility
3. 교육과정 핵심 주장: curriculum/accreditation/language track처럼 잘못되면 기관 선택을 왜곡하는 항목
4. 기관 단위 모집 전제: 상시 지원 가능 여부 등 특정 Opportunity가 아니라 Institution 전체에 적용되는 중요 정책

이름, 주소, 연락처, 설명 같은 profile field는 current column과 명시적인 profile verification metadata로 충분하다. 정확한 Fact key set과 profile verification granularity는 `04_DATA_MODEL.md` P0/P1 결정이다.

## 5. Opportunity Domain Validation

### 5.1 독립 identity와 kind

**Status: SUPPORTED_WITH_DATA_MODEL_DECISION**

기존 `admission_events`는 반드시 AdmissionCycle에 속하고 Event type check를 가진다 (`src/db/schema/index.ts:157-203`). 이 row model을 확장해 `CONSULTATION`, `LEVEL_TEST`, `RECRUITMENT`, `DEADLINE`을 억지로 넣으면 cycle 없는 영유 Opportunity를 표현할 수 없다.

신규 Opportunity에 독립 PK/slug/lifecycle과 Domain kind를 두고, legacy-backed Opportunity만 AdmissionEvent bridge를 갖게 하면 기존 Event type을 mapping 가능한 범위에서 재사용하면서 신규 semantic을 손실 없이 보존할 수 있다. mapping은 일대일 enum 번역이 아니라 Domain 의미 변환이어야 하며 `OTHER` fallback을 명시적으로 관리해야 한다.

Opportunity가 `institution_id NOT NULL` child table이어도 자체 PK, slug, publication state, version history를 가지므로 독립 Aggregate/Public Entity 성격은 유지된다. ownership FK는 identity 종속을 의미하지 않는다.

### 5.2 state, verification, 날짜 선택성

**Status: SUPPORTED_WITH_DATA_MODEL_DECISION**

기존 schema도 Event identity의 `is_public`과 EventVersion의 `verification_status`/`event_status`를 분리한다 (`src/db/schema/index.ts:157-301`). 따라서 publication/business/verification state 분리는 Repository 철학과 일치한다.

EventVersion의 날짜 column은 nullable이며 date order check도 양쪽 값이 존재할 때만 적용된다. 날짜 없는 Opportunity는 현재 philosophy와 충돌하지 않는다. verification은 identity row가 아니라 version row에 두는 것이 기존 pattern과도 일치한다.

## 6. Opportunity ↔ AdmissionEvent Bridge Validation

**Status: SUPPORTED_WITH_DATA_MODEL_DECISION**

최대 1:1 자체는 간단히 강제 가능하다.

- bridge `opportunity_id` unique 또는 PK
- bridge `admission_event_id` unique
- 두 FK 모두 `RESTRICT`
- bridge가 없는 legacy Event와 bridge가 없는 Native Opportunity 모두 허용

어려운 부분은 aggregate consistency다.

```text
Opportunity.institution_id
→ InstitutionLegacySchool.legacy_school_id
→ AdmissionCycle.school_id
→ AdmissionEvent.admission_cycle_id
```

기존 Repository는 비슷한 문제를 composite FK와 trigger로 해결한다. 예를 들어 `source_bindings_cycle_school_fk`, `facts_event_cycle_fk`, `meaningful_changes_event_cycle_fk`, `alerts_change_cycle_fk`가 있으며 이에 대한 실패 test가 `tests/integration/schema-invariants.test.ts:494-630`에 있다.

따라서 bridge에 redundant consistency key를 포함한 composite FK를 사용하거나 deferred constraint trigger를 사용해야 한다. 단순히 Opportunity FK와 AdmissionEvent FK 두 개만 두면 서로 다른 School의 Event를 잘못 연결할 수 있다. application validation만을 유일한 보호막으로 두는 것은 현재 Repository 철학보다 약하다.

정확한 선택은 `04_DATA_MODEL.md`의 P0다. 어느 방식을 택해도 Domain 결정 자체는 유지된다.

## 7. Native OpportunityVersion / Evidence Validation

### 7.1 별도 canonical version table 필요성

**Status: SUPPORTED_WITH_DATA_MODEL_DECISION**

별도 `OpportunityVersion`/`OpportunityVersionEvidence`가 실제 Repository에서도 더 안전하다. `admission_event_versions`는 `admission_event_id NOT NULL`이고 Event는 다시 `admission_cycle_id NOT NULL`이다. 기존 table에 Native version을 넣으면 fake Event/Cycle/School 생성, nullable FK 대수술, conditional invariant 중 하나가 필요하며 모두 DM-009/DM-011을 훼손한다.

### 7.2 반드시 복제할 invariant

| Invariant | Existing Evidence | Native 적용 판단 |
| --- | --- | --- |
| current version 최대 하나 | `admission_event_versions_one_current_per_event`, schema lines 253-257; test 237-262 | 같은 partial unique pattern 사용 |
| version number uniqueness | `(admission_event_id, version_no)` unique, schema lines 249-252 | `(opportunity_id, version_no)` unique |
| same-parent predecessor | `event_versions_supersedes_fk`, schema lines 242-246 | composite self-FK로 같은 Opportunity만 허용 |
| self-supersede 금지 | `event_versions_not_self_superseding_check`; test 957-989 | check 복제 |
| non-branching | `event_versions_one_successor`, migration `0001_productive_morph.sql:1`; test 835-894 | predecessor partial unique |
| monotonic lineage | `enforce_event_version_lineage` trigger in migration `0001_productive_morph.sql`; test 835-894 | trigger 또는 동등한 DB rule |
| current가 SUPERSEDED일 수 없음 | check; test 991-1019 | check 복제 |
| verification attribution | `verified_at`, `verified_by_admin_id`, schema lines 229-235 | Native version에도 유지 |
| evidence | `event_version_evidence`, schema lines 793-825 | Source 필수, Observation/Snapshot 선택 |
| 날짜 순서 | Event/registration date order checks; test 1062-1090 | kind별 nullable date rule에 맞게 적용 |

Manual verification에서 Source만 있고 Observation/Snapshot이 없는 evidence가 기존 schema에서도 가능하다. `event_version_evidence.source_id`는 필수지만 `source_observation_id`와 `snapshot_id`는 nullable이다.

## 8. OpportunityChange Validation

**Status: SUPPORTED_WITH_DATA_MODEL_DECISION**

`meaningful_changes`에서 재사용 가능한 것은 change type/significance/review/publication timestamp, before/after data, admin review attribution, cycle-published index와 immutable signal 개념이다 (`src/db/schema/index.ts:726-791`).

직접 table 확장은 안전하지 않다.

- `admission_cycle_id`가 `NOT NULL`이다.
- Event/Fact relation이 같은 Cycle에 속하도록 composite FK가 걸려 있다.
- change type이 legacy admission semantic으로 제한된다.
- Alert가 MeaningfulChange와 같은 Cycle이어야 한다.

따라서 canonical `OpportunityChange`를 별도 table로 두고 legacy `MeaningfulChange` 또는 native version diff를 source lineage로 연결해야 한다. Notification은 canonical signal만 참조하므로 legacy/native 차이를 몰라도 된다.

중복 방지는 다음 중 하나의 stable source key와 change policy version을 unique로 잡는 방향이 적절하다.

- legacy: mapped Opportunity + MeaningfulChange ID + policy version
- native: Opportunity + from/to version + change kind + policy version

구체적인 key shape, correction/republication 정책, signal `published_at` 불변성은 P0 Data Model 결정이다.

## 9. Trust / Source / Evidence Validation

### 9.1 Source registry

**Status: SUPPORTED_WITH_DATA_MODEL_DECISION**

기존 `sources`는 UUID identity, canonical URL unique, source type, authority level, lifecycle, observation/snapshot history를 이미 제공한다 (`src/db/schema/index.ts:481-510`). registry 자체는 공유하는 것이 안전하다.

Domain enum과 legacy enum은 의미 mapping이 필요하다.

| Domain concept | Existing value | 판단 |
| --- | --- | --- |
| OFFICIAL_PRIMARY | PRIMARY | 직접 mapping 가능 |
| OFFICIAL_SECONDARY | SECONDARY_OFFICIAL | 직접 mapping 가능 |
| TRUSTED_REFERENCE | 없음 | 신규 값/별도 classification 결정 필요 |
| UNVERIFIED_REFERENCE | DISCOVERY_ONLY에 일부 대응 | 의미 범위 확정 필요 |
| ACTIVE | ACTIVE | 직접 mapping 가능 |
| INACTIVE/BROKEN/ARCHIVED | DISCOVERED/PAUSED/RETIRED와 완전 일치하지 않음 | mapping 또는 enum 확장 필요 |

이는 Domain 충돌이 아니라 Data Model vocabulary 결정이다.

### 9.2 Explicit binding과 evidence

**Status: SUPPORTED_WITH_DATA_MODEL_DECISION**

기존 `source_bindings`는 Source↔School/Cycle explicit relation이며 null-aware logical unique와 cycle-school composite FK를 가진다 (`src/db/schema/index.ts:512-552`). 같은 pattern으로 `InstitutionSourceBinding`과 `OpportunitySourceBinding`을 명시적으로 추가할 수 있다. generic `entity_type/entity_id`는 필요하지 않다.

Native Opportunity evidence는 기존 Source/Observation/Snapshot을 FK로 참조할 수 있다. 단, Observation 또는 Snapshot이 지정될 때 그것이 같은 Source에 속하는지까지 강제하려면 existing evidence보다 강한 composite FK/trigger를 고려해야 한다. Manual provenance는 Source만 필수로 하고 observation/snapshot을 비워도 된다.

## 10. Last Verified Validation

**Status: SUPPORTED_WITH_DATA_MODEL_DECISION**

| Verification scope | 계산 근거 | 현재 상태 |
| --- | --- | --- |
| SourceLastCheckedAt | 해당 Source의 최신 `source_observations.observed_at` | IMPLEMENTED pattern |
| Legacy OpportunityLastVerifiedAt | mapped Event의 current verified `admission_event_versions.verified_at` | IMPLEMENTED pattern |
| Native OpportunityLastVerifiedAt | Native current verified OpportunityVersion의 `verified_at` | NOT IMPLEMENTED, additive 필요 |
| InstitutionFactLastVerifiedAt | current verified InstitutionFactVersion의 `verified_at` | NOT IMPLEMENTED, additive 필요 |
| InstitutionPageLastVerified | publish-required profile/fact scope가 모두 검증된 시점의 정책적 projection | NOT IMPLEMENTED |

Page-wide Last Verified는 단순 `MAX(updated_at)`이나 Source check 시각이 아니다. MVP에서는 다음만 노출하는 것이 현실적이다.

1. Opportunity detail: current truth가 실제로 검증된 시각
2. 중요 Institution Fact: 해당 fact의 검증 시각
3. Institution page: 명시적인 profile verification record 또는 required scope projection이 있을 때만 표시

`updated_at`은 절대 fallback으로 사용하지 않는다. Profile verification을 row 하나로 둘지 required fact set의 projection으로 둘지는 P0/P1 결정이다.

## 11. User / AuthIdentity Validation

### 11.1 Canonical identity

**Status: SUPPORTED_WITH_DATA_MODEL_DECISION**

별도 `User` PK와 `AuthIdentity(provider, provider_subject)` unique는 PostgreSQL에서 자연스럽게 구현 가능하다. 기존 `admin_users.external_auth_subject` unique (`src/db/schema/index.ts:30-49`)도 외부 subject를 내부 identity와 분리하는 선례를 제공하지만 public User와는 별도 aggregate로 유지해야 한다.

`subscribers`는 normalized email unique이고 `subscriptions`는 AdmissionCycle에 묶인 legacy email subscription이다 (`src/db/schema/index.ts:936-999`). 이를 canonical User로 승격하지 않고 병렬 유지하면 충돌이 없다. 신규 User email은 profile/contact point로 두며 User PK가 아니다. Kakao가 email을 제공하지 않아도 별도 verified email을 저장할 수 있다.

legacy subscriber email과 신규 User email의 자동 linking은 identity collision/account takeover 위험이 있어 하지 않는 것이 안전하다. 향후 explicit, verified claim migration만 별도 정책으로 고려한다.

### 11.2 검증 한계

Kakao provider callback, token validation, provider subject stability, email scope는 Repository에 없어 **NOT_VERIFIABLE**이다. 이것은 DM-014의 blocker가 아니라 외부 integration 검증 범위다.

## 12. Consent / NotificationPreference Validation

**Status: SUPPORTED_WITH_DATA_MODEL_DECISION**

legacy `subscriptions`의 `consent_version`, `consent_source`, `requested_at`, `verified_at`, `unsubscribed_at`는 policy/document version과 provenance를 보존해야 한다는 좋은 pattern이다. 그러나 이 row는 Cycle subscription lifecycle과 consent를 한 곳에 섞고 append-only decision history가 아니다.

따라서 canonical 모델에서는 다음을 분리해야 한다.

- `ConsentDecision`: User, consent type, decision, policy/document version, source, decided_at을 append-only로 기록
- `NotificationPreference`: 현재 service-email 설정과 변경 시각

boolean 하나는 과거 동의/철회, 어떤 문서에 동의했는지, 서비스성 안내와 marketing consent의 분리를 보존하지 못하므로 Domain 요구를 충족하지 못한다.

`(user_id, consent_type, decided_at/id)` 조회 index와 effective-latest query가 필요하다. `SERVICE_EMAIL_UPDATES`와 미래 `MARKETING_EMAIL`은 서로 다른 consent type으로 분리할 수 있다. Repository-level blocker는 없다.

## 13. Follow Domain Validation

**Status: SUPPORTED_WITH_DATA_MODEL_DECISION**

동일 User–Institution active Follow 최대 하나는 DB에서 강제할 수 있다. Domain identity와 history를 동시에 가장 잘 보존하는 물리 전략은 다음이다.

```text
Follow (logical relation, UNIQUE user_id + institution_id)
  1 ── N FollowEpisode (append-only activation intervals)
```

- Follow는 최초 생성 시각과 logical identity를 보존한다.
- FollowEpisode는 `activated_at`, `deactivated_at`을 보존한다.
- `(follow_id) WHERE deactivated_at IS NULL` partial unique로 현재 active episode를 하나만 허용한다.
- reactivation은 기존 history overwrite가 아니라 새 episode insert다.
- relation row의 cached current state/last activation은 projection으로 둘 수 있다.

한 row의 status/timestamp만 계속 덮어쓰는 방식은 여러 activation/deactivation interval을 잃어 signal 시점 eligibility가 모호해진다. 반대로 episode 자체를 매번 새로운 Follow identity로 취급하면 “동일 User↔Institution logical relation” 의미가 약해진다. logical row + append-only episode가 양쪽 요구를 모두 만족한다.

기존 Subscription은 사용하지 않아도 된다. recipient resolution은 active episode, User state, verified email, effective consent, preference를 join하면 된다. 최소 index는 다음 query 축을 지원해야 한다.

- `Follow(user_id, institution_id)` unique
- active `FollowEpisode(follow_id)` partial unique
- follower resolution용 `Follow(institution_id)` + active state/projection
- signal-time interval 조회용 `(follow_id, activated_at, deactivated_at)`

## 14. Notification Eligibility Validation

**Status: SUPPORTED_WITH_DATA_MODEL_DECISION**

시간 규칙은 SQL로 정확히 구현 가능하다. canonical 기준은 truth의 `verified_at`이 아니라 immutable product signal인 `OpportunityChange.signal_published_at`이어야 한다. 검증 시각은 내부 truth 승인 시각이고, 실제 사용자 대상 signal 공개 시각과 다를 수 있기 때문이다.

eligibility interval:

```text
episode.activated_at <= signal.signal_published_at
AND (episode.deactivated_at IS NULL
     OR episode.deactivated_at > signal.signal_published_at)
AND user.status = ACTIVE
AND usable verified email exists
AND SERVICE_EMAIL_UPDATES consent is effective
AND email preference = ENABLED
```

reactivation은 episode별 interval을 사용하므로 모호하지 않다. 오늘 재활성화한 User에게 어제 signal을 보내지 않는다. Notification/Delivery 생성 transaction에서 signal-time eligibility를 적용하고, worker가 실제 send 직전에 User active, current Follow active, email usability, consent, preference를 다시 검사해야 한다.

Follow가 signal 이후 생성되면 `activated_at <= signal_published_at`가 실패하므로 retroactive email이 생성되지 않는다. Follow가 signal 시점에는 active였지만 send 전에 비활성화되면 pending Delivery를 `SUPPRESSED`로 전이한다. My Preppy read model에서 과거 변경을 보여주는 것과 email eligibility는 별도 query다.

## 15. Notification / Delivery Validation

**Status: SUPPORTED_WITH_DATA_MODEL_DECISION**

canonical 모델은 legacy `alerts`/`alert_deliveries`와 분리하는 것이 여전히 가장 안전하다.

- legacy Alert는 `admission_cycle_id NOT NULL`이고 MeaningfulChange와 같은 Cycle을 강제한다.
- legacy Delivery는 `subscription_id`, `subscriber_id`를 요구한다.
- channel은 현재 `EMAIL`만 허용한다.
- canonical recipient는 User+Follow이며 Cycle Subscription이 아니다.

재사용할 pattern:

- `alerts.dedupe_key` unique (`src/db/schema/index.ts:1026-1066`; test 308-331)
- Delivery logical unique (`src/db/schema/index.ts:1068-1119`; test 333-369)
- `SUPPRESSED`를 포함한 delivery state
- parent consistency trigger와 concurrent insert/update serialization test (`tests/integration/schema-invariants.test.ts:568-753`)
- Outbox 기반 transaction 이후 dispatch

권장 uniqueness:

- Notification: `(signal_id, notification_policy_version)` unique
- Delivery: `(notification_id, user_id, channel)` unique

Delivery row는 logical recipient/channel 상태를 나타내고, provider request/response/retry/error는 별도 append-only `DeliveryAttempt`로 분리하는 것이 적절하다. 현재 legacy Delivery는 `attempt_count`, 한 개 provider ID, 한 개 failure code만 보존하므로 여러 retry의 forensic history를 잃는다. canonical 모델에서는 attempt history 분리를 P0로 결정해야 한다.

현재 `outbox_events`에는 status/available_at/attempt_count index는 있지만 unique dedupe key, claim lease/owner, last error, dead-letter metadata가 없다 (`src/db/schema/index.ts:1146-1172`). canonical Notification dispatch reliability를 위해 보강 여부를 P0에서 결정한다.

## 16. User Deletion Validation

**Status: SUPPORTED_WITH_DATA_MODEL_DECISION**

Notification/Delivery/Audit history가 User를 참조하게 되면 physical delete는 history 무결성을 깨뜨리거나 cascade로 운영 증거를 잃게 한다. 기존 Repository도 history 관계에 `RESTRICT`를 널리 사용한다. 따라서 logical deletion + anonymization이 안전하다.

권장 transaction 의미:

1. User state를 `DELETED`로 전이한다.
2. AuthIdentity를 revoke/disable하고 login을 차단한다.
3. profile/email 등 PII를 erase 또는 별도 retention 정책에 따라 anonymize한다.
4. active FollowEpisode를 닫는다.
5. NotificationPreference를 disable한다.
6. pending Delivery를 suppress한다.
7. Delivery/Audit에는 opaque User FK와 비식별 operational metadata만 보존한다.

Delivery에 recipient email snapshot이 필요하다면 logical Delivery와 분리된 제한 접근/암호화 storage 또는 명시적 retention/purge 대상이어야 한다. immutable operational history에 평문 email을 무기한 보존하는 설계는 피한다.

AuthIdentity revoke는 User deletion과 별도 개념이어야 한다. provider 하나만 unlink하는 경우 User 자체는 유지될 수 있지만, User deletion은 모든 active identity를 종료한다. 법률상 보존기간은 이 문서에서 결정하지 않는다.

## 17. Article Domain Validation

**Status: SUPPORTED_WITH_DATA_MODEL_DECISION**

기존 `guides`/`updates`는 Markdown content, slug unique, publication status를 갖고 `update_changes`가 Update↔MeaningfulChange를 연결한다 (`src/db/schema/index.ts:861-934`). 이들은 실제 data가 확인될 때 migration source로 사용할 수 있지만 canonical Article write model로 직접 확장하지 않는 것이 안전하다.

Additive 구현은 가능하다.

- `ArticleInstitution(article_id, institution_id)` composite PK/unique
- `ArticleOpportunity(article_id, opportunity_id)` composite PK/unique
- Article current slug unique
- `ArticleSlugHistory/Redirect` registry에서 과거 slug도 globally reserved
- sanitized `content_html`을 canonical render content로 저장
- source Markdown은 editorial input/audit 용도로 선택 보존

sanitized HTML canonical storage는 기존 Markdown row와 충돌하지 않는다. conditional migration에서 Markdown을 sanitize/render해 별도 Article로 생성하면 된다. 실제 legacy row 존재 여부와 content 품질은 Production data 없이는 `NOT_VERIFIABLE`이다.

relation target이 unpublished일 수는 있으나 public render/CTA 규칙은 publish transaction에서 검증해야 한다. Article service는 Opportunity version을 쓰는 repository capability를 갖지 않도록 application boundary를 분리하면 Article이 truth를 overwrite하지 못한다.

## 18. Aggregate Boundary and Transaction Validation

**Status: SUPPORTED_WITH_DATA_MODEL_DECISION**

현재 legacy FK graph는 School/Cycle/Event 중심으로 촘촘하지만 신규 canonical aggregate를 additive하게 도입하는 것을 막지 않는다. Domain Aggregate를 하나의 거대한 ORM object graph로 로딩할 필요도 없다. root identity/current projection과 append-only history를 query별로 로딩할 수 있다.

PostgreSQL modular monolith에서 다음 cross-aggregate transaction을 안전하게 구현 가능하다.

### 18.1 Verified Opportunity Change

한 transaction 안에서:

1. 이전 current version을 lock한다.
2. new verified version과 evidence를 기록한다.
3. 이전 current를 닫고 new current를 확정한다.
4. canonical OpportunityChange를 dedupe insert한다.
5. audit와 outbox를 같은 transaction에 기록한다.
6. COMMIT 후 worker가 Notification을 처리한다.

current uniqueness와 lineage race는 unique index + row lock/constraint trigger로 막는다. 외부 email send는 transaction 안에서 하지 않는다.

### 18.2 Follow Activation

한 transaction 안에서 User ACTIVE와 Institution followability를 검증하고 logical Follow를 idempotent upsert한 뒤 active episode를 하나만 생성하고 audit/outbox를 기록한다. unique conflict는 성공으로 해석할 수 있어 repeated click도 idempotent하다.

### 18.3 Article Publish

sanitized content, publication state, structured relations, SEO field, slug reservation, audit를 한 transaction에서 확정한다. 외부 cache revalidation은 outbox/after-commit으로 처리한다.

## 19. Domain Invariant → PostgreSQL Enforceability Matrix

| Domain Invariant | DB Constraint | Transaction Rule | Application Rule | Feasibility |
| --- | --- | --- | --- | --- |
| 1. Institution↔LegacySchool 최대 1:1 | bridge 양쪽 FK + 각각 UNIQUE | mapping 변경 시 양쪽 row lock | 관리자 mapping validation | SUPPORTED |
| 2. Opportunity는 정확히 하나의 Institution에 속함 | `institution_id NOT NULL` FK RESTRICT | Institution 상태 확인 후 생성 | ownership authorization | SUPPORTED |
| 3. Opportunity↔AdmissionEvent 최대 1:1 optional | bridge `opportunity_id`/`admission_event_id` 각각 UNIQUE | aggregate consistency 검증 | mapping command만 허용 | SUPPORTED_WITH_DATA_MODEL_DECISION |
| 4. Native Opportunity current verified version 최대 하나 | current partial UNIQUE; `(opportunity_id, version_no)` UNIQUE | 이전 current lock/close와 신규 insert 원자화 | verified publish command | SUPPORTED |
| 5. version lineage non-branching | predecessor partial UNIQUE + same-parent composite FK + self-check | predecessor lock | monotonic version command | SUPPORTED; existing tested pattern |
| 6. Published Opportunity has verified truth | publication state와 current verified version의 same-parent composite FK 또는 deferred constraint trigger | verify/evidence/publish를 한 transaction으로 처리 | publish precondition | SUPPORTED_WITH_DATA_MODEL_DECISION |
| 7. `(provider, provider_subject)` uniqueness | composite UNIQUE | identity link transaction | provider token 검증 | SUPPORTED; provider runtime NOT_VERIFIABLE |
| 8. active User↔Institution Follow 최대 하나 | logical pair UNIQUE + active episode partial UNIQUE | activate/deactivate row lock | state transition guard | SUPPORTED |
| 9. Follow creation idempotency | logical pair UNIQUE | `INSERT ... ON CONFLICT` 후 active episode 확인 | repeated command를 동일 결과로 취급 | SUPPORTED |
| 10. canonical Notification signal dedupe | `(signal_id, policy_version)` UNIQUE | create + outbox 원자화 | stable policy version 제공 | SUPPORTED |
| 11. NotificationDelivery User/channel dedupe | `(notification_id, user_id, channel)` UNIQUE | eligible recipient batch insert | send 직전 eligibility 재검증 | SUPPORTED |
| 12. Article slug uniqueness | current slug UNIQUE + history registry slug UNIQUE | slug change와 redirect insert 원자화 | canonicalization/금칙어 검사 | SUPPORTED |
| 13. Article structured relation uniqueness | bridge composite PK/UNIQUE | publish relation validation | public target render policy | SUPPORTED |
| 14. Source canonical URL dedupe | existing `sources_canonical_url_unique` | canonicalize 후 insert | URL normalization | SUPPORTED; IMPLEMENTED/TESTED |
| 15. external Email send는 DB transaction 외부 | DB constraint 대상 아님; Outbox row durability | domain commit 이후 claim/lease worker | provider idempotency와 retry | SUPPORTED_WITH_DATA_MODEL_DECISION |

## 20. DM-001 ~ DM-025 Repository Validation Matrix

| Decision | Repository Evidence | Status | Data Model Impact | Amendment Required |
| --- | --- | --- | --- | --- |
| DM-001 Institution이 canonical 교육기관 | legacy `schools` graph는 유지 가능; 신규 table 부재 | SUPPORTED_WITH_DATA_MODEL_DECISION | Institution PK/slug/state와 bridge 추가 | NO |
| DM-002 public category 3종 | legacy school check에는 영유 없음 | SUPPORTED_WITH_DATA_MODEL_DECISION | 신규 Institution category check | NO |
| DM-003 국제/외국 학교 구분은 secondary classification | legacy values 둘 다 존재 | SUPPORTED_WITH_DATA_MODEL_DECISION | secondary subtype와 mapping | NO |
| DM-004 Opportunity는 독립 Aggregate/Public Entity | Event는 Cycle child지만 신규 identity 추가 가능 | SUPPORTED_WITH_DATA_MODEL_DECISION | Opportunity PK/slug/state/FK | NO |
| DM-005 Camp/Program과 universal entity로 합치지 않음 | 범용 entity framework 없음 | SUPPORTED | 별도 bounded-context 확장 경계 유지 | NO |
| DM-006 CONSULTATION/LEVEL_TEST 독립 kind | legacy Event type만으로는 충분하지 않음 | SUPPORTED_WITH_DATA_MODEL_DECISION | canonical kind check/mapping | NO |
| DM-007 publication/business/verification state 분리 | Event identity/public + Version verification/status pattern | SUPPORTED_WITH_DATA_MODEL_DECISION | 세 state의 column/check | NO |
| DM-008 Opportunity↔AdmissionEvent optional 최대 1:1 | additive unique bridge 가능 | SUPPORTED_WITH_DATA_MODEL_DECISION | 양쪽 unique + aggregate consistency | NO |
| DM-009 Native Opportunity는 Cycle/Event 없이 존재 | legacy Event path는 불가, 별도 path는 가능 | SUPPORTED_WITH_DATA_MODEL_DECISION | Native version path | NO |
| DM-010 Native Opportunity 자체 version/evidence/history | EventVersion/Evidence pattern 존재 | SUPPORTED_WITH_DATA_MODEL_DECISION | 별도 canonical tables/triggers | NO |
| DM-011 fake School/Cycle/Event 금지 | additive model이면 fake parent 불필요 | SUPPORTED | legacy FK를 우회하지 않고 병렬 구현 | NO |
| DM-012 OpportunityChange가 canonical signal | MeaningfulChange는 Cycle 결합 | SUPPORTED_WITH_DATA_MODEL_DECISION | canonical signal/dedupe/source lineage | NO |
| DM-013 Last Verified는 provenance로 계산 | verified_at/observed_at 존재; profile scope 없음; updated_at trigger 존재 | SUPPORTED_WITH_DATA_MODEL_DECISION | scope별 projection/profile verification | NO |
| DM-014 User는 Kakao ID/Email과 다름 | admin external subject 분리 선례; public User 없음 | SUPPORTED_WITH_DATA_MODEL_DECISION | User/AuthIdentity/Email 분리; Kakao runtime NV | NO |
| DM-015 Consent와 Preference 분리 | legacy consent fields는 있으나 append-only 아님 | SUPPORTED_WITH_DATA_MODEL_DECISION | 두 table/aggregate와 effective query | NO |
| DM-016 Follow는 User↔Institution Monitoring delegation | legacy Subscription은 Cycle/email 결합 | SUPPORTED_WITH_DATA_MODEL_DECISION | 신규 logical Follow | NO |
| DM-017 active Follow 최대 하나, reactivation 허용 | unique/partial unique pattern 다수 존재 | SUPPORTED_WITH_DATA_MODEL_DECISION | logical row + episode history | NO |
| DM-018 Follow 이후 signal만 발송 | immutable signal timestamp는 신규 필요 | SUPPORTED_WITH_DATA_MODEL_DECISION | signal-time interval index/query | NO |
| DM-019 signal 시점과 send 직전 eligibility 검증 | legacy Delivery lifecycle/SUPPRESSED pattern 존재 | SUPPORTED_WITH_DATA_MODEL_DECISION | creation query + worker recheck | NO |
| DM-020 Notification signal aggregate, Delivery recipient/channel aggregate | legacy Alert/Delivery 분리 pattern | SUPPORTED_WITH_DATA_MODEL_DECISION | canonical keys/FK/attempt 분리 | NO |
| DM-021 canonical Notification/Delivery는 legacy와 병렬 | legacy rows가 Cycle/Subscription에 강결합 | SUPPORTED | 신규 tables, legacy 보존 | NO |
| DM-022 Article은 truth source가 아님 | guides/updates와 verified truth table이 분리됨 | SUPPORTED | service write boundary | NO |
| DM-023 Article relations는 구조적 many-to-many | composite bridge pattern `update_changes` 존재 | SUPPORTED_WITH_DATA_MODEL_DECISION | 두 explicit bridge | NO |
| DM-024 UPDATE Article은 Change를 소비하나 truth를 만들지 않음 | `update_changes` relation pattern 존재 | SUPPORTED_WITH_DATA_MODEL_DECISION | canonical Change relation/read-only dependency | NO |
| DM-025 User deletion 후 비식별 history 보존 | RESTRICT/history pattern, public User 부재 | SUPPORTED_WITH_DATA_MODEL_DECISION | logical deletion/anonymization/retention | NO |

요약:

- `CONFLICT`: 0
- Domain decision 자체의 `NOT_VERIFIABLE`: 0
- `SUPPORTED`: 5
- `SUPPORTED_WITH_DATA_MODEL_DECISION`: 20
- 외부 Kakao runtime과 Production data는 하위 evidence 수준에서 `NOT_VERIFIABLE`

## 21. Domain Acceptance Scenario Validation

| # | Scenario | Status | Repository Evidence / 필요한 additive work |
| --- | --- | --- | --- |
| 1 | Native 영유 Opportunity | SUPPORTED_AFTER_NEW_SCHEMA | 기존 Event는 Cycle 필수이므로 Institution, Native OpportunityVersion/Evidence가 필요하다. Source/Evidence pattern은 재사용 가능하며 fake School/Cycle/Event는 불필요하다. |
| 2 | Legacy 국제학교 Event 재사용 | SUPPORTED_AFTER_NEW_SCHEMA | existing School/Cycle/EventVersion history를 그대로 두고 Institution/Opportunity unique bridge와 consistency constraint를 추가하면 된다. |
| 3 | Kakao Signup → Follow | NOT_VERIFIABLE | User/AuthIdentity/Follow schema는 additive 구현 가능하지만 Kakao provider runtime이 Repository에 없다. Cycle Subscription은 필요하지 않다. |
| 4 | Date Change → Notification → Email | SUPPORTED_AFTER_NEW_SCHEMA | EventVersion lineage, MeaningfulChange, Alert dedupe, Delivery unique, Outbox pattern을 canonical Change/Notification으로 재사용한다. 실제 email provider는 미구현이다. |
| 5 | Follow 이전 과거 변경 비소급 | SUPPORTED_AFTER_NEW_SCHEMA | immutable `signal_published_at`과 FollowEpisode interval 비교로 보장 가능하다. My Preppy history query는 별도다. |
| 6 | Preference Revoked Before Send | SUPPORTED_AFTER_NEW_SCHEMA | worker send 직전 recheck와 `SUPPRESSED` state로 구현 가능하다. legacy Delivery에도 SUPPRESSED precedent가 있다. |
| 7 | Article Update | SUPPORTED_AFTER_NEW_SCHEMA | canonical Article↔Opportunity/Change relation을 추가하고 Article service를 truth write path와 분리한다. |
| 8 | User Delete | SUPPORTED_AFTER_NEW_SCHEMA | logical deletion, PII anonymization, Follow close, preference disable, pending suppression, RESTRICT history FK로 구현 가능하다. |
| 9 | Institution Closed | SUPPORTED_AFTER_NEW_SCHEMA | operational/publication state 분리, followability/notification policy, historical FK 유지로 표현 가능하다. |
| 10 | Source Broken | SUPPORTED_AFTER_NEW_SCHEMA | Source lifecycle mapping/확장 후 BROKEN 처리해도 existing Evidence FK는 RESTRICT이므로 과거 history를 지우지 않아도 된다. |

Block된 scenario는 없다. Scenario 3의 `NOT_VERIFIABLE`은 외부 Kakao integration 부재 때문이며 Domain 구조의 blocker가 아니다.

## 22. Decisions for 04_DATA_MODEL.md

### P0 — Schema 작성 전 반드시 결정

1. Institution PK/slug/category/subtype/state와 `Institution↔LegacySchool` 0..1:0..1 bridge shape
2. Opportunity PK/slug/kind/state와 정확히 하나의 Institution FK
3. Opportunity↔AdmissionEvent bridge의 양쪽 unique 및 Institution–School–Cycle aggregate consistency 강제 방식
4. Native OpportunityVersion의 current unique, same-parent lineage, monotonic/non-branching trigger, verified attribution
5. OpportunityVersionEvidence의 Source/Observation/Snapshot consistency와 manual provenance rule
6. canonical OpportunityChange source lineage, immutable `signal_published_at`, policy-versioned dedupe key
7. Institution Fact의 최소 first-class key set과 profile/page verification projection
8. User/AuthIdentity/Profile/verified email normalization 및 `(provider, provider_subject)` unique
9. append-only ConsentDecision과 current NotificationPreference의 effective query/index
10. logical Follow + append-only FollowEpisode, active uniqueness, idempotent activation, signal-time interval index
11. Notification `(signal, policy)` dedupe와 Delivery `(notification, user, channel)` dedupe
12. Delivery logical state와 append-only provider attempt history 분리
13. User deletion/anonymization, recipient PII retention/purge, history FK policy
14. Article/slug-history/redirect와 explicit Institution/Opportunity bridge
15. Outbox dedupe, claim/lease, retry/error/dead-letter 최소 필드와 after-commit worker contract
16. Verified Opportunity Change, Follow Activation, Article Publish의 transaction/locking 순서와 integration-test matrix

### P1 — MVP launch 전 결정

1. Source authority/lifecycle Domain↔legacy mapping과 BROKEN/ARCHIVED 표현
2. Institution page-wide Last Verified 표시 정책과 freshness threshold
3. Opportunity kind↔legacy Event type mapping table 및 unmapped `OTHER` 운영 절차
4. legacy Guide/Update/Subscriber data의 실제 존재 여부 조사와 conditional backfill 정책
5. Article publish 시 unpublished relation target 처리와 redirect/404 정책
6. Institution CLOSED/ARCHIVED 시 Follow/Notification/public URL 정책
7. email bounce/suppression, provider message ID, retry ceiling과 operator recovery
8. My Preppy current/history query index와 Active Monitoring Parents metric 정의

### P2 — MVP 이후 최적화 가능

1. read projection/materialized view와 cache 최적화
2. 오래된 version/evidence/attempt partitioning 또는 archival
3. Source URL canonicalization 고도화와 duplicate merge tooling
4. 추가 Notification channel을 위한 channel-neutral extension
5. Institution Fact 종류 확대와 field-level freshness UX
6. legacy canonical mapping/backfill의 단계적 정리

## 23. Overengineering Guard

이 검증 결과를 구현하기 위해 Event Sourcing, CQRS framework, polymorphic Entity table, universal `entity_type/entity_id`, microservices, Kafka, Elasticsearch, Data Warehouse, Kubernetes, graph database, generic workflow engine이 필요하지 않다.

PostgreSQL + Drizzle + modular monolith로 충분하다.

- aggregate별 명시적 table과 bridge
- unique/partial unique/composite FK/check
- 제한된 constraint trigger
- 짧은 transaction과 row locking
- outbox worker
- query 목적별 index

이 범위가 MVP에 맞다. multi-channel delivery 구현과 automated crawler 구현도 이번 Data Model의 필수 조건으로 확대하지 않는다.

## 24. Architecture Amendment Candidates

없음.

현재 발견된 모든 gap은 column/index/FK/trigger/transaction/retention 또는 migration policy 선택이며 Domain decision 자체의 오류가 아니다.

## 25. Required Questions — Direct Answers

### Q1. 현재 `03_DOMAIN_MODEL.md`는 Repository 기반으로 구현 가능한가?

**YES_WITH_DATA_MODEL_DECISIONS.** 기존 legacy graph를 유지하고 canonical 모델을 additive하게 도입하면 구현 가능하다.

### Q2. Domain Model 자체를 수정해야 할 blocker가 존재하는가?

**없다.** 기존 table 직접 재사용이 위험한 지점은 Domain Model이 이미 병렬 canonical model로 분리했다.

### Q3. Native Opportunity version/evidence/history model은 기존 Event history pattern을 안전하게 재사용할 수 있는가?

**예, pattern을 재사용할 수 있다.** current partial unique, version number unique, same-parent predecessor, non-branching, monotonic trigger, verified attribution, evidence relation을 복제한다. 기존 EventVersion row 자체를 Native 용도로 재사용해서는 안 된다.

### Q4. Institution Fact verification은 MVP에서 어느 수준까지 first-class versioning이 필요한가?

**의사결정 영향과 변경 가능성이 큰 Fact만 필요하다.** 최소 학비/필수 비용, 핵심 eligibility/age-grade, curriculum/accreditation/language track 같은 고위험 주장을 대상으로 한다. 이름/주소/연락처/설명까지 모두 versioned fact로 만드는 것은 과설계이며 profile verification으로 충분하다.

### Q5. Follow lifecycle은 어떤 physical strategy가 가장 적합한가?

**한 logical Follow row + append-only FollowEpisode가 가장 적합하다.** pair identity와 최초 생성 시각을 유지하면서 모든 activation/deactivation interval과 signal-time eligibility를 보존한다.

### Q6. Consent와 NotificationPreference를 분리하는 데 Repository-level 문제가 있는가?

**없다.** legacy consent field는 provenance pattern으로만 참고하고 append-only ConsentDecision과 current Preference를 additive하게 둔다.

### Q7. Notification eligibility 시간 규칙을 정확하게 구현할 수 있는가?

**예.** immutable `signal_published_at`과 FollowEpisode interval을 비교하고 User/email/consent/preference를 join한 뒤 send 직전에 재검증하면 된다.

### Q8. Canonical Notification/Delivery를 legacy Alert/Delivery와 완전히 분리하는 것이 가장 안전한가?

**예.** legacy rows는 Cycle/Subscription/Subscriber에 강하게 결합되어 있다. reliability와 constraint pattern만 재사용하고 row model은 병렬 유지해야 한다.

### Q9. User deletion 후 history integrity를 유지할 수 있는가?

**예.** logical delete + PII anonymization, RESTRICT opaque FK, pending suppression, 별도 PII retention 정책으로 non-PII operational history를 유지할 수 있다.

### Q10. Article relation과 slug history를 additive하게 구현 가능한가?

**예.** 두 explicit many-to-many bridge와 slug history/redirect registry를 신규 table로 추가하면 기존 Guide/Update와 충돌하지 않는다.

### Q11. `04_DATA_MODEL.md` 작성 전에 추가로 확정해야 할 Domain Decision이 존재하는가?

**없다.** Source vocabulary mapping, Institution Fact 최소 범위, Follow episode, dedupe/attempt/retention은 모두 물리 Data Model 또는 운영 정책 결정이며 DM-001~DM-025를 변경하지 않는다.

## 26. Domain Model Repository Validation Verdict

Domain Model:
VALID

Ready for 04_DATA_MODEL:
YES

Domain-level Blockers:
1. 없음.

Required Domain Amendments:
1. 없음.

Validated Core Decisions:

- Institution은 legacy School과 분리된 canonical identity로 additive 구현 가능하다.
- Opportunity는 독립 public aggregate이며 AdmissionEvent와 optional 최대 1:1 bridge를 가질 수 있다.
- Native Opportunity는 별도 verified version/evidence/history를 가져야 하며 기존 Event lineage pattern을 재사용할 수 있다.
- OpportunityChange로 legacy/native signal을 정규화할 수 있다.
- User/AuthIdentity, Consent/Preference, Follow, Notification/Delivery 분리는 모두 Repository와 양립한다.
- Article은 structured relation을 갖되 truth source와 분리할 수 있다.
- 기존 legacy history는 rename/drop 없이 보존 가능하다.

Highest Data Model Risks:
1. Opportunity–AdmissionEvent bridge에서 Institution–LegacySchool–Cycle–Event consistency를 단순 FK만으로 놓치는 위험
2. Follow reactivation interval과 immutable signal timestamp를 약하게 모델링해 과거 변경을 소급 발송하는 위험
3. canonical Notification/Delivery를 legacy Cycle Subscription row에 재결합하거나 outbox/attempt idempotency를 충분히 강제하지 않는 위험

P0 Decisions for 04_DATA_MODEL:
1. Institution/LegacySchool mapping과 Opportunity/AdmissionEvent bridge의 key 및 DB consistency 전략
2. Native OpportunityVersion/Evidence lineage와 OpportunityChange dedupe/signal timestamp
3. Institution Fact 최소 versioning과 page/profile verification scope
4. User/AuthIdentity/Consent/Preference 및 logical Follow+Episode
5. Notification/Delivery/Attempt/Outbox idempotency와 User deletion/PII retention
6. Article structured relation과 slug history/redirect
7. 핵심 transaction locking과 PostgreSQL integration-test strategy

Repository Assets to Reuse:

- Event/Fact version current uniqueness와 lineage constraint/trigger/test pattern
- Source registry, observation, snapshot, evidence provenance pattern
- composite FK를 통한 parent aggregate consistency pattern
- Alert/Delivery dedupe와 concurrency test pattern
- AuditLog와 Outbox의 transaction boundary pattern
- explicit bridge table과 partial unique index pattern

Recommended Next Step:
`04_DATA_MODEL.md`
