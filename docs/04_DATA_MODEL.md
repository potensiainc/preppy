# 04_DATA_MODEL.md

> **Project:** PREPPY (프레피)  
> **Document Type:** PostgreSQL Data Model  
> **Status:** Data Model v1.0 — Repository validation required before migration implementation  
> **Product Baseline:** `00_PRODUCT_REQUIREMENTS_BASELINE.md`  
> **Target Architecture:** `02_TARGET_ARCHITECTURE.md` Target v1.1  
> **Domain Model:** `03_DOMAIN_MODEL.md` Domain v1.0  
> **Domain Validation:** `03A_DOMAIN_MODEL_REPOSITORY_VALIDATION.md` — VALID  
> **Database Direction:** PostgreSQL + Drizzle, additive migration, strong database invariants  
> **Purpose:** PREPPY의 확정된 Domain Model을 PostgreSQL 물리 모델로 구체화한다. 이 문서는 table, key, FK, unique/check/index, version lineage, deletion/retention, transaction boundary, read path, additive migration 순서를 정의하지만 실제 migration SQL이나 Production code를 작성하지 않는다.

---

# 0. Document Role

`03_DOMAIN_MODEL.md`에서 제품 의미와 Domain invariant가 확정되었다.

이 문서는 그 의미를 PostgreSQL에서 어떻게 보존할지를 결정한다.

이 문서의 우선순위는 다음과 같다.

1. **Domain correctness**
2. **Historical integrity**
3. **Trust / verification provenance**
4. **MVP implementation simplicity**
5. **Queryability**
6. **Future extension without core-domain rewrite**

다음 원칙을 따른다.

> Database는 Domain Model을 단순히 저장하는 장소가 아니라, PREPPY의 중요한 불변조건을 마지막 방어선에서 지키는 시스템이다.

그러나 모든 Business Rule을 trigger로 밀어 넣지는 않는다.

각 invariant는 다음 세 수준 중 가장 적합한 위치에 둔다.

```text
DB Constraint
Transaction/Application Rule
Read Projection / UI Rule
```

---

# 1. Data Modeling Principles

## 1.1 PostgreSQL Is the Operational Source of Truth

다음 operational state는 PostgreSQL에서 재현 가능해야 한다.

- canonical Institution
- current Opportunity
- verification/history
- Source/Evidence
- User/Auth
- Consent/Preference
- Follow
- Notification/Delivery
- Article
- Active Monitoring Parents

GA4는 이 상태의 Source of Truth가 아니다.

## 1.2 Additive Migration First

기존 AdmissionRadar table을 즉시 rename/drop하지 않는다.

새 canonical model을 먼저 추가하고:

```text
Add
→ Validate
→ Backfill
→ Bridge
→ Dual Read
→ Canonical Cutover
→ Legacy Write Retirement
→ Cleanup much later
```

순서로 전환한다.

## 1.3 Stable UUID Identity

신규 canonical aggregate root는 UUID를 사용한다.

주요 대상:

```text
institutions
opportunities
users
follows
notifications
notification_deliveries
articles
```

이유:

- 기존 Repository의 UUID 사용 패턴과 정합
- legacy ID와 canonical ID 분리
- public/internal identity 안정성
- migration/backfill에 유리
- application-generated ID 가능

정확한 UUID generation 방식은 Repository 기존 관행을 재사용한다.

## 1.4 Strong FK over Soft References

Core Domain 관계는 가능한 한 명시적 FK로 만든다.

금지 기본값:

```text
entity_type
entity_id
```

식의 universal polymorphic relation.

예:

```text
institution_source_bindings
opportunity_source_bindings
article_institutions
article_opportunities
```

처럼 명시적 관계를 사용한다.

## 1.5 Historical Rows Are Append-oriented

다음 영역은 현재값 overwrite보다 version/history 보존을 우선한다.

- AdmissionEventVersion — 기존 KEEP
- Native OpportunityVersion
- InstitutionFactVersion
- ConsentDecision
- FollowEpisode
- NotificationDeliveryAttempt
- Evidence
- OpportunityChange

## 1.6 Public Slug Is Not Primary Identity

slug는 public routing identity이지만 database PK가 아니다.

slug 변경으로 canonical aggregate identity가 바뀌지 않는다.

slug 변경은 redirect history를 남긴다.

## 1.7 Timestamps

신규 table은 원칙적으로:

```text
created_at
updated_at
```

을 사용한다.

하지만 append-only record에 의미 없는 `updated_at`을 억지로 추가하지 않는다.

예:

```text
consent_decisions
follow_episodes
notification_delivery_attempts
```

는 append-only event 성격에 맞게 설계한다.

`updated_at`은 `Last Verified`가 아니다.

---

# 2. Schema Groups

Target logical schema는 다음 그룹으로 나눈다.

```text
A. Institution
B. Admissions / Opportunity
C. Trust / Verification
D. Identity / Consent
E. Follow
F. Notification
G. Editorial
H. SEO / Routing
I. Outbox / Operations
J. Legacy Compatibility
```

실제 PostgreSQL schema namespace를 여러 개로 분리해야 한다는 의미는 아니다.

MVP에서는 기존과 동일한 application schema를 유지할 수 있다.

---

# 3. Institution Tables

---

# 3.1 `institutions`

PREPPY canonical educational institution.

### Columns

```text
id                    UUID PK
slug                  VARCHAR / TEXT NOT NULL
display_name          TEXT NOT NULL
category              ENUM/CHECK NOT NULL
international_subtype ENUM/CHECK NULL
operational_state     ENUM/CHECK NOT NULL
publication_state     ENUM/CHECK NOT NULL

region_code           TEXT NULL
city                  TEXT NULL
district              TEXT NULL
address_line          TEXT NULL
latitude              NUMERIC NULL
longitude             NUMERIC NULL

website_url            TEXT NULL
short_description      TEXT NULL

created_at             TIMESTAMPTZ NOT NULL
updated_at             TIMESTAMPTZ NOT NULL
published_at           TIMESTAMPTZ NULL
archived_at            TIMESTAMPTZ NULL
```

### Category

```text
ENGLISH_KINDERGARTEN
PRIVATE_ELEMENTARY
INTERNATIONAL_SCHOOL
```

### International Subtype

nullable:

```text
INTERNATIONAL_SCHOOL
FOREIGN_SCHOOL
OTHER_INTERNATIONAL
```

`category != INTERNATIONAL_SCHOOL`이면 subtype은 NULL을 원칙으로 한다.

DB CHECK로 강제할 수 있다.

### Operational State

```text
ACTIVE
INACTIVE
CLOSED
UNKNOWN
```

### Publication State

```text
DRAFT
PUBLISHED
HIDDEN
ARCHIVED
```

### Constraints

```text
PK(id)

UNIQUE(slug)

CHECK:
category valid
publication_state valid
operational_state valid
international subtype/category consistency
latitude/longitude valid range when present
```

### Indexes

```text
INDEX(publication_state, category)
INDEX(publication_state, region_code)
INDEX(category, region_code, district)
INDEX(display_name)
```

한국어 기관명 검색은 초기 PostgreSQL 기본 검색으로 시작한다.

전용 search engine은 MVP에서 도입하지 않는다.

### Delete Policy

Hard delete 금지 기본값.

오입력이며 어떤 dependent row도 없는 경우에만 내부 운영 절차를 통해 예외적으로 허용할 수 있다.

일반 종료는:

```text
operational_state = CLOSED
publication_state = ARCHIVED
```

로 처리한다.

---

# 3.2 `institution_school_links`

PREPPY Institution ↔ legacy `schools` compatibility mapping.

### Columns

```text
institution_id UUID NOT NULL
school_id      <legacy school PK type> NOT NULL
linked_at      TIMESTAMPTZ NOT NULL
link_reason    TEXT NULL
```

### Constraints

```text
PK 또는 UNIQUE(institution_id)
UNIQUE(school_id)

FK(institution_id) → institutions(id) ON DELETE RESTRICT
FK(school_id) → legacy schools(id) ON DELETE RESTRICT
```

결과:

```text
Institution 0..1 ↔ 0..1 LegacySchool
```

### Important Rule

Native 영유 Institution에 compatibility School row를 생성하지 않는다.

### Delete Policy

mapping 삭제는 매우 제한한다.

한 번 history/public data가 연결된 후에는 mapping 교체보다 데이터 정정 migration을 사용한다.

---

# 3.3 `institution_aliases`

기관명 변형/검색/legacy alias.

### Columns

```text
id              UUID PK
institution_id  UUID NOT NULL
alias           TEXT NOT NULL
alias_normalized TEXT NOT NULL
alias_type      ENUM/CHECK NULL
created_at      TIMESTAMPTZ NOT NULL
```

### Constraint

```text
UNIQUE(institution_id, alias_normalized)
FK → institutions ON DELETE CASCADE
```

alias는 canonical identity가 아니다.

---

# 4. Institution Fact Verification

Repository validation은 Institution Fact verification을 P0 Data Model decision으로 남겼다.

모든 Institution profile field를 version table로 만드는 것은 MVP 과설계다.

따라서 **Hybrid Model**을 사용한다.

---

# 4.1 Stable/Core Profile vs Verified Facts

`institutions`에 직접 저장:

- canonical name
- category
- region/location
- canonical website
- publication/operational state
- short editorial description

별도 verified Fact로 관리:

```text
TUITION
TARGET_AGE_GRADE
CURRICULUM
ELIGIBILITY
TRANSPORT
ADMISSION_PROCESS
OPERATING_INFO
```

초기 MVP에서 비교/판단/신뢰에 중요한 정보다.

---

# 4.2 `institution_facts`

하나의 Institution에 대한 stable fact identity.

### Columns

```text
id              UUID PK
institution_id  UUID NOT NULL
fact_type       ENUM/CHECK NOT NULL
created_at      TIMESTAMPTZ NOT NULL
```

### Constraint

MVP 기본값:

```text
UNIQUE(institution_id, fact_type)
```

즉 한 Institution의 한 Fact Type은 하나의 logical fact aggregate를 가진다.

향후 여러 학년/프로그램별 tuition 등 다차원 Fact가 필요해지면 `scope_key`를 추가할 수 있다.

지금 generic scope framework를 만들지 않는다.

---

# 4.3 `institution_fact_versions`

Institution Fact의 append-oriented verified history.

### Columns

```text
id                    UUID PK
institution_fact_id   UUID NOT NULL
version_number        INTEGER NOT NULL
supersedes_version_id UUID NULL

verification_state    ENUM/CHECK NOT NULL
is_current            BOOLEAN NOT NULL

value_json             JSONB NOT NULL
display_text           TEXT NULL

verified_at            TIMESTAMPTZ NULL
verified_by_admin_id   <existing admin PK type> NULL

valid_from             TIMESTAMPTZ NULL
valid_until            TIMESTAMPTZ NULL

created_at             TIMESTAMPTZ NOT NULL
```

### Why `value_json`

Fact 종류별 의미가 다르기 때문에 하나의 scalar column으로 만들면 부적절하다.

그러나 `value_json`을 무제한 arbitrary schema로 쓰지 않는다.

각 `fact_type`별 application schema를 정의한다.

예:

### TUITION

```json
{
  "currency": "KRW",
  "period": "MONTHLY",
  "amount": 2300000,
  "min_amount": null,
  "max_amount": null,
  "notes": null
}
```

### TARGET_AGE_GRADE

```json
{
  "min_birth_year": 2020,
  "max_birth_year": 2022,
  "grades": []
}
```

### CURRICULUM

```json
{
  "curriculum_codes": ["IB"],
  "description": "..."
}
```

비교 성능이 필요한 key는 이후 generated/extracted column 또는 read projection으로 최적화할 수 있다.

MVP부터 Fact type별 7개 table을 만들지 않는다.

### Constraints

```text
UNIQUE(institution_fact_id, version_number)

UNIQUE current partial:
UNIQUE(institution_fact_id)
WHERE is_current = true

FK supersedes_version_id → same table
```

`supersedes_version_id`가 동일 `institution_fact_id`인지 DB trigger 또는 transaction invariant로 강제한다.

기존 Event/Fact lineage 패턴을 최대한 재사용한다.

### Verification State

```text
UNVERIFIED
VERIFIED
SUPERSEDED
```

Public current projection은 VERIFIED current만 사용한다.

### Append Rule

이미 VERFIED/SUPERSEDED 된 version의 business value를 수정하지 않는다.

잘못된 정보는 새 version으로 정정한다.

---

# 4.4 `institution_fact_version_evidence`

### Columns

```text
institution_fact_version_id UUID NOT NULL
source_id                   <existing source PK type> NOT NULL
source_observation_id       <existing observation PK type> NULL
source_snapshot_id          <existing snapshot PK type> NULL
evidence_role               ENUM/CHECK NOT NULL
created_at                  TIMESTAMPTZ NOT NULL
```

### Constraint

최소:

```text
UNIQUE(
  institution_fact_version_id,
  source_id,
  source_observation_id,
  source_snapshot_id
)
```

PostgreSQL NULL semantics 때문에 실제 dedupe는 normalized unique strategy를 설계할 수 있다.

Repository의 기존 Event/Fact Evidence pattern을 우선 재사용한다.

### Publish Rule

VERIFIED current Fact는 최소 1개 Evidence를 가지는 것을 application transaction에서 강제한다.

---

# 5. Institution Source Bindings

# 5.1 `institution_source_bindings`

### Columns

```text
institution_id UUID NOT NULL
source_id      <legacy source PK type> NOT NULL
role           ENUM/CHECK NOT NULL
is_primary     BOOLEAN NOT NULL DEFAULT false
is_active      BOOLEAN NOT NULL DEFAULT true
bound_at       TIMESTAMPTZ NOT NULL
unbound_at     TIMESTAMPTZ NULL
```

### Role

```text
OFFICIAL_MAIN
ADMISSIONS
TUITION
CURRICULUM
APPLICATION
OTHER
```

### Constraints

```text
UNIQUE(institution_id, source_id, role)
FK institution → institutions
FK source → existing sources
```

한 Institution에 `OFFICIAL_MAIN + active + primary`는 최대 하나를 권장한다.

partial unique index로 강제할 수 있다.

---

# 6. Opportunity Root

# 6.1 `opportunities`

### Columns

```text
id                UUID PK
institution_id    UUID NOT NULL

slug              TEXT NOT NULL
kind              ENUM/CHECK NOT NULL
truth_mode        ENUM/CHECK NOT NULL

publication_state ENUM/CHECK NOT NULL

created_at        TIMESTAMPTZ NOT NULL
updated_at        TIMESTAMPTZ NOT NULL
published_at      TIMESTAMPTZ NULL
archived_at       TIMESTAMPTZ NULL
```

Display title, dates, business state 등 변경 가능한 truth는 root가 아니라 version에서 가져온다.

### truth_mode

```text
NATIVE
LEGACY_BACKED
```

### Opportunity Kind

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

### Publication State

```text
DRAFT
PUBLISHED
HIDDEN
ARCHIVED
```

### Constraints

```text
UNIQUE(slug)
FK institution_id → institutions(id) ON DELETE RESTRICT
```

### Indexes

```text
INDEX(institution_id, publication_state)
INDEX(publication_state, kind)
INDEX(publication_state, published_at DESC)
INDEX(institution_id, kind)
```

---

# 6.2 `opportunity_admission_event_links`

Legacy-backed Opportunity mapping.

### Columns

```text
opportunity_id      UUID NOT NULL
admission_event_id  <legacy event PK type> NOT NULL
linked_at           TIMESTAMPTZ NOT NULL
```

### Constraints

```text
UNIQUE(opportunity_id)
UNIQUE(admission_event_id)

FK opportunity → opportunities ON DELETE RESTRICT
FK admission_event → legacy admission_events ON DELETE RESTRICT
```

### Aggregate Consistency

DB가 확인해야 하는 조건:

```text
Opportunity.institution_id
→ institution_school_links.school_id
==
AdmissionEvent
→ AdmissionCycle.school_id
```

이 invariant는 단순 FK 하나로 표현하기 어려울 수 있다.

권장 우선순위:

1. composite FK/unique로 표현 가능하면 DB constraint
2. 불가능하면 narrow trigger
3. 마지막으로 transaction-level validation

Codex Repository Validation에서 현재 legacy PK/FK 구조를 보고 확정한다.

### truth_mode Consistency

- `LEGACY_BACKED` Opportunity가 PUBLISHED 되기 전 link 존재 필수
- `NATIVE` Opportunity에는 link 금지

cross-table 조건이므로 application publish transaction + optional DB trigger로 강제한다.

---

# 7. Native Opportunity Versioning

# 7.1 `opportunity_versions`

`truth_mode = NATIVE` Opportunity만 사용한다.

### Columns

```text
id                    UUID PK
opportunity_id        UUID NOT NULL
version_number        INTEGER NOT NULL
supersedes_version_id UUID NULL

verification_state    ENUM/CHECK NOT NULL
business_state        ENUM/CHECK NOT NULL
is_current            BOOLEAN NOT NULL

title                 TEXT NOT NULL
summary               TEXT NULL
target_audience       TEXT NULL

event_start_at        TIMESTAMPTZ NULL
event_end_at          TIMESTAMPTZ NULL
application_open_at   TIMESTAMPTZ NULL
application_close_at  TIMESTAMPTZ NULL

action_url            TEXT NULL
location_text         TEXT NULL

verified_at           TIMESTAMPTZ NULL
verified_by_admin_id  <existing admin PK type> NULL

valid_from            TIMESTAMPTZ NULL
valid_until           TIMESTAMPTZ NULL

content_fingerprint   TEXT NULL

created_at            TIMESTAMPTZ NOT NULL
```

### Business State

```text
UPCOMING
OPEN
CLOSED
COMPLETED
CANCELLED
UNKNOWN
```

### Verification State

```text
UNVERIFIED
VERIFIED
SUPERSEDED
```

### Constraints

```text
UNIQUE(opportunity_id, version_number)

partial UNIQUE(opportunity_id)
WHERE is_current = true

FK supersedes_version_id → opportunity_versions(id)
FK opportunity_id → opportunities(id)
```

### Lineage Rules

DB trigger 또는 기존 lineage pattern 재사용:

1. predecessor는 같은 Opportunity
2. version_number는 predecessor보다 증가
3. self-supersede 금지
4. 한 predecessor에 successor 최대 하나
5. current + SUPERSEDED 조합 금지
6. superseded version을 다시 current로 만들지 않음

### Current Swap

동시에 두 current가 존재하지 않도록:

```text
BEGIN
lock Opportunity or current Version
mark previous current = false / SUPERSEDED
insert new current verified version
evidence
change
outbox
COMMIT
```

순서와 constraint interaction은 Codex schema validation 후 최종 implementation spec에서 확정한다.

---

# 7.2 `opportunity_version_evidence`

### Columns

```text
opportunity_version_id UUID NOT NULL
source_id              <existing source PK type> NOT NULL
source_observation_id  <existing observation PK type> NULL
source_snapshot_id     <existing snapshot PK type> NULL
evidence_role          ENUM/CHECK NOT NULL
created_at             TIMESTAMPTZ NOT NULL
```

기존 EventVersionEvidence의 integrity pattern을 복제한다.

### Rule

VERIFIED native OpportunityVersion은 최소 1개 Evidence를 가져야 한다.

---

# 8. Opportunity Source Bindings

# 8.1 `opportunity_source_bindings`

### Columns

```text
opportunity_id UUID NOT NULL
source_id      <existing source PK type> NOT NULL
role           ENUM/CHECK NOT NULL
is_primary     BOOLEAN NOT NULL DEFAULT false
is_active      BOOLEAN NOT NULL DEFAULT true
bound_at       TIMESTAMPTZ NOT NULL
unbound_at     TIMESTAMPTZ NULL
```

### Constraints

```text
UNIQUE(opportunity_id, source_id, role)
```

Native/Legacy-backed 모두 사용할 수 있다.

Legacy-backed Opportunity의 기존 `source_bindings`를 당장 삭제하지 않는다.

---

# 9. Opportunity Change

# 9.1 `opportunity_changes`

canonical immutable product-level signal.

### Columns

```text
id                          UUID PK
opportunity_id              UUID NOT NULL

change_type                 ENUM/CHECK NOT NULL
materiality                 ENUM/CHECK NOT NULL

from_native_version_id      UUID NULL
to_native_version_id        UUID NULL
legacy_meaningful_change_id <legacy PK type> NULL

summary                     TEXT NOT NULL

detected_at                 TIMESTAMPTZ NULL
verified_at                 TIMESTAMPTZ NOT NULL
published_at                TIMESTAMPTZ NOT NULL

dedupe_key                  TEXT NOT NULL

created_at                  TIMESTAMPTZ NOT NULL
```

### Change Type

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

### Materiality

MVP:

```text
NOTIFIABLE
NON_NOTIFIABLE
```

향후 severity를 세분화할 수 있다.

### Constraints

```text
UNIQUE(dedupe_key)
FK opportunity_id → opportunities

UNIQUE(legacy_meaningful_change_id)
WHERE legacy_meaningful_change_id IS NOT NULL
```

Native version IDs가 있을 경우 해당 Opportunity와 동일 aggregate인지 transaction/trigger로 검증한다.

### Native vs Legacy

`legacy_meaningful_change_id`가 있으면 legacy-backed signal.

native signal이면:

```text
to_native_version_id NOT NULL
```

`NEW_OPPORTUNITY`는 from version이 NULL일 수 있다.

---

# 10. Opportunity Current Read Contract

Public API/UI는 persistence path를 알지 않는다.

논리적 read projection:

```text
OpportunityCurrent
```

fields:

```text
opportunity_id
institution_id
slug
kind
publication_state
business_state
title
summary
target_audience
relevant dates
action_url
verified_at
primary_source
updated indicator
truth_mode
```

`truth_mode`는 internal/debug 목적이며 Public UI에서 숨길 수 있다.

### Projection Strategy

MVP에서는 별도 materialized table을 우선 만들지 않는다.

- Native → current `opportunity_versions`
- Legacy-backed → bridge → existing current `admission_event_versions`

을 query layer에서 union/projection한다.

성능이 실제 문제가 된 후 materialized read model을 검토한다.

---

# 11. User Identity

# 11.1 `users`

### Columns

```text
id                 UUID PK
status             ENUM/CHECK NOT NULL
created_at         TIMESTAMPTZ NOT NULL
activated_at       TIMESTAMPTZ NULL
suspended_at       TIMESTAMPTZ NULL
deleted_at         TIMESTAMPTZ NULL
pii_anonymized_at  TIMESTAMPTZ NULL
updated_at         TIMESTAMPTZ NOT NULL
```

### Status

```text
PENDING
ACTIVE
SUSPENDED
DELETED
```

### Delete

User row 자체는 기본적으로 hard delete하지 않는다.

historical FK anchor를 유지한다.

---

# 11.2 `auth_identities`

### Columns

```text
id                UUID PK
user_id           UUID NOT NULL
provider          ENUM/CHECK NOT NULL
provider_subject  TEXT NOT NULL
status            ENUM/CHECK NOT NULL
linked_at         TIMESTAMPTZ NOT NULL
revoked_at        TIMESTAMPTZ NULL
created_at        TIMESTAMPTZ NOT NULL
```

### Provider

MVP:

```text
KAKAO
```

### Identity Status

```text
ACTIVE
REVOKED
```

### Constraints

```text
UNIQUE(provider, provider_subject)
FK user_id → users ON DELETE RESTRICT
```

User deletion 시 provider_subject PII 처리 방식은 privacy implementation에서 결정하되 identity 사용은 즉시 REVOKED 한다.

---

# 11.3 `user_profiles`

제품 개인화 최소 프로필.

### Columns

```text
user_id           UUID PK/FK
child_birth_year  SMALLINT NULL
created_at        TIMESTAMPTZ NOT NULL
updated_at        TIMESTAMPTZ NOT NULL
```

정확한 생년월일/자녀명은 저장하지 않는다.

### Birth Year Check

합리적인 범위 check를 둔다.

정확한 year bound는 application current year에 따라 변하므로 너무 강한 static constraint를 두지 않는다.

---

# 11.4 `user_interest_regions`

```text
user_id      UUID NOT NULL
region_code  TEXT NOT NULL
created_at   TIMESTAMPTZ NOT NULL
```

```text
UNIQUE(user_id, region_code)
```

---

# 11.5 `user_interest_categories`

```text
user_id      UUID NOT NULL
category     institution category NOT NULL
created_at   TIMESTAMPTZ NOT NULL
```

```text
UNIQUE(user_id, category)
```

---

# 12. User Email

Kakao Email과 User identity를 분리하고 deliverability를 다뤄야 하므로 별도 table을 사용한다.

# 12.1 `user_emails`

MVP에서는 User당 current email 최대 1개.

### Columns

```text
id              UUID PK
user_id         UUID NOT NULL
email           TEXT NOT NULL
email_normalized TEXT NOT NULL

source          ENUM/CHECK NOT NULL
verification_state ENUM/CHECK NOT NULL
delivery_state ENUM/CHECK NOT NULL

verified_at     TIMESTAMPTZ NULL
last_bounced_at TIMESTAMPTZ NULL
created_at      TIMESTAMPTZ NOT NULL
updated_at      TIMESTAMPTZ NOT NULL
removed_at      TIMESTAMPTZ NULL
```

### Source

```text
KAKAO
USER_INPUT
```

### Verification State

```text
UNVERIFIED
VERIFIED
```

Kakao가 verified email claim을 제공하는 경우 provider policy에 따라 VERIFIED 처리할 수 있다.

### Delivery State

```text
USABLE
BOUNCED
SUPPRESSED
REMOVED
```

### Constraints

MVP:

```text
UNIQUE(user_id)
```

Email은 global unique로 강제하지 않는다.

같은 가족/공용 email 가능성을 막지 않는다.

### User Delete

raw email을 NULL/삭제할 수 있도록 physical schema에서 nullable transition 전략을 검토한다.

대안:

- row delete + historical Delivery에는 email hash만 보존
- email column nullable + REMOVED

Codex 검증 후 선택한다.

---

# 13. Consent

# 13.1 `consent_decisions`

append-only.

### Columns

```text
id              UUID PK
user_id         UUID NOT NULL
consent_type    ENUM/CHECK NOT NULL
policy_version  TEXT NOT NULL
decision        ENUM/CHECK NOT NULL
decided_at      TIMESTAMPTZ NOT NULL
source          TEXT NULL
created_at      TIMESTAMPTZ NOT NULL
```

### Consent Type

```text
TERMS_OF_SERVICE
PRIVACY_POLICY
SERVICE_EMAIL_UPDATES
MARKETING_EMAIL
```

`MARKETING_EMAIL`은 MVP에서 사용하지 않더라도 type namespace는 향후 추가 가능하다.

현재 migration에서 미리 넣어야 하는지는 Codex/implementation 단계에서 판단한다.

### Decision

```text
GRANTED
REVOKED
```

### Constraint

```text
INDEX(user_id, consent_type, decided_at DESC)
```

동일 timestamp 충돌을 피하기 위해 `created_at/id` tie-breaker를 사용한다.

Effective consent는 최신 decision projection으로 계산한다.

### Why Append-only

동의를 boolean overwrite하면:

- 어떤 policy version에 동의했는지
- 언제 철회했는지
- 과거 notification eligibility가 어땠는지

재현하기 어렵다.

---

# 14. Notification Preference

# 14.1 `notification_preferences`

current user setting.

### Columns

```text
user_id      UUID NOT NULL
channel      ENUM/CHECK NOT NULL
state        ENUM/CHECK NOT NULL
created_at   TIMESTAMPTZ NOT NULL
updated_at   TIMESTAMPTZ NOT NULL
```

### MVP Channel

```text
EMAIL
```

### State

```text
ENABLED
DISABLED
```

### Constraint

```text
UNIQUE(user_id, channel)
```

Consent history와 분리한다.

---

# 15. Follow

Domain Validation P0 decision:

> logical Follow + append-only FollowEpisode를 사용한다.

이 방식이 reactivation history와 query simplicity를 모두 만족시킨다.

---

# 15.1 `follows`

User–Institution logical relation.

### Columns

```text
id                    UUID PK
user_id               UUID NOT NULL
institution_id        UUID NOT NULL
status                ENUM/CHECK NOT NULL

first_activated_at    TIMESTAMPTZ NOT NULL
current_activated_at  TIMESTAMPTZ NULL
deactivated_at        TIMESTAMPTZ NULL

created_at            TIMESTAMPTZ NOT NULL
updated_at            TIMESTAMPTZ NOT NULL
```

### Status

```text
ACTIVE
INACTIVE
```

### Constraints

```text
UNIQUE(user_id, institution_id)

FK user_id → users ON DELETE RESTRICT
FK institution_id → institutions ON DELETE RESTRICT
```

Logical pair가 하나뿐이므로 active duplicate 자체가 불가능하다.

### State Checks

```text
ACTIVE:
current_activated_at IS NOT NULL
deactivated_at IS NULL

INACTIVE:
deactivated_at IS NOT NULL
```

DB CHECK로 상당 부분 강제 가능하다.

---

# 15.2 `follow_episodes`

Follow activation intervals.

### Columns

```text
id              UUID PK
follow_id       UUID NOT NULL
activated_at    TIMESTAMPTZ NOT NULL
deactivated_at  TIMESTAMPTZ NULL
reason          TEXT NULL
created_at      TIMESTAMPTZ NOT NULL
```

### Constraints

```text
FK follow_id → follows ON DELETE RESTRICT

partial UNIQUE(follow_id)
WHERE deactivated_at IS NULL
```

즉 Follow당 open episode 최대 하나.

### Activation Transaction

신규:

```text
create Follow ACTIVE
create FollowEpisode(open)
```

재활성:

```text
lock Follow
ensure INACTIVE
set Follow ACTIVE/current_activated_at
create new FollowEpisode(open)
```

해제:

```text
lock Follow
close current FollowEpisode
set Follow INACTIVE/deactivated_at
```

### Why Not Episodes Only

Recipient resolution과 My Preppy query는 현재 Follow state를 매우 자주 조회한다.

current `follows` row를 operational projection으로 유지하는 것이 단순하다.

Episode는 history다.

---

# 16. Follow Eligibility Indexes

주요 query:

### My Preppy

```text
WHERE user_id = ?
AND status = 'ACTIVE'
```

Index:

```text
INDEX(user_id, status)
```

### Followers of Institution

```text
WHERE institution_id = ?
AND status = 'ACTIVE'
```

Index:

```text
INDEX(institution_id, status)
```

### Signal-time Eligibility

`current_activated_at <= signal_published_at`만으로 historical eligibility를 완전히 재현하지 않는다.

과거 시점 eligibility가 필요하면 `follow_episodes`를 조회한다.

MVP recipient resolution은 signal 생성 직후 진행되므로:

- 현재 ACTIVE
- current_activated_at <= signal time

를 사용하고, delayed/replay reconstruction에는 episode history를 사용한다.

---

# 17. Notification

# 17.1 `notifications`

canonical signal-level notification.

### Columns

```text
id                    UUID PK
opportunity_id        UUID NOT NULL
opportunity_change_id UUID NULL

signal_type           ENUM/CHECK NOT NULL
policy_version        TEXT NOT NULL

status                ENUM/CHECK NOT NULL
signal_published_at   TIMESTAMPTZ NOT NULL

title_snapshot        TEXT NOT NULL
body_context_json     JSONB NOT NULL
deep_link_path        TEXT NOT NULL

dedupe_key            TEXT NOT NULL

created_at            TIMESTAMPTZ NOT NULL
ready_at              TIMESTAMPTZ NULL
completed_at          TIMESTAMPTZ NULL
cancelled_at          TIMESTAMPTZ NULL
```

### Signal Type

```text
OPPORTUNITY_PUBLISHED
OPPORTUNITY_CHANGED
```

### Status

```text
PENDING
READY
COMPLETED
CANCELLED
```

### Constraints

```text
UNIQUE(dedupe_key)
FK opportunity_id → opportunities
FK opportunity_change_id → opportunity_changes nullable
```

### Dedupe

논리:

```text
signal canonical key
+ notification policy version
```

예:

```text
opportunity-change:{change_id}:policy:v1
```

정확한 string format은 implementation detail이다.

### Why Snapshot

Notification 렌더링 시 Opportunity가 이후 또 변경되어도 “그때 어떤 변경을 알렸는지”를 재현할 최소 context가 필요하다.

그러나 snapshot은 canonical Opportunity truth를 대체하지 않는다.

---

# 18. Notification Delivery

# 18.1 `notification_deliveries`

recipient/channel logical delivery.

### Columns

```text
id                UUID PK
notification_id   UUID NOT NULL
user_id           UUID NOT NULL
channel           ENUM/CHECK NOT NULL

status            ENUM/CHECK NOT NULL
suppress_reason   ENUM/CHECK NULL

recipient_hash    TEXT NULL

created_at        TIMESTAMPTZ NOT NULL
queued_at         TIMESTAMPTZ NULL
sent_at           TIMESTAMPTZ NULL
delivered_at      TIMESTAMPTZ NULL
opened_at         TIMESTAMPTZ NULL
clicked_at        TIMESTAMPTZ NULL
failed_at         TIMESTAMPTZ NULL
suppressed_at     TIMESTAMPTZ NULL
```

### Channel

MVP:

```text
EMAIL
```

### Status

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

### Suppress Reason

```text
USER_INACTIVE
FOLLOW_INACTIVE
PREFERENCE_DISABLED
CONSENT_REVOKED
EMAIL_UNAVAILABLE
EMAIL_SUPPRESSED
DUPLICATE
OTHER
```

### Constraints

```text
UNIQUE(notification_id, user_id, channel)

FK notification_id → notifications ON DELETE RESTRICT
FK user_id → users ON DELETE RESTRICT
```

### PII

raw recipient email을 long-term delivery row에 저장하지 않는 것을 기본으로 한다.

실제 send 시 현재 `user_emails`를 조회하고:

- provider에 전달
- normalized recipient hash만 operational record에 저장

한다.

Provider가 webhook matching을 위해 raw email을 요구하지 않도록 provider message ID 중심으로 매핑한다.

필요한 경우 짧은 TTL의 encrypted troubleshooting field는 implementation/security review에서 별도 결정한다.

---

# 19. Notification Delivery Attempts

# 19.1 `notification_delivery_attempts`

provider send/retry append-only history.

### Columns

```text
id                   UUID PK
notification_delivery_id UUID NOT NULL
attempt_number       INTEGER NOT NULL

provider             TEXT NOT NULL
provider_message_id  TEXT NULL

attempt_status       ENUM/CHECK NOT NULL
error_code           TEXT NULL
error_message_safe   TEXT NULL

attempted_at         TIMESTAMPTZ NOT NULL
completed_at         TIMESTAMPTZ NULL

created_at           TIMESTAMPTZ NOT NULL
```

### Attempt Status

```text
STARTED
ACCEPTED
FAILED_RETRYABLE
FAILED_TERMINAL
```

### Constraints

```text
UNIQUE(notification_delivery_id, attempt_number)
```

Raw provider payload/PII를 그대로 저장하지 않는다.

### Why Separate Attempts

`NotificationDelivery`는 logical delivery.

`Attempt`는 retry history.

둘을 합치면 retry할 때 logical uniqueness와 operational history가 섞인다.

---

# 20. Notification Recipient Resolution

Signal 발생 시:

```text
Notification
→ eligible followers query
→ NotificationDelivery INSERT ON CONFLICT DO NOTHING
→ Outbox
```

Eligibility:

```text
User ACTIVE
AND Follow ACTIVE
AND Follow.current_activated_at <= signal_published_at
AND usable user email
AND effective SERVICE_EMAIL_UPDATES consent
AND Email Preference ENABLED
```

### Important

Recipient resolution 시 eligible였더라도 send 직전 다시 확인한다.

변경되면:

```text
SUPPRESSED
```

---

# 21. Outbox

기존 `outbox_events` table을 버리지 않는다.

Repository validation에서 “row lifecycle skeleton”은 재사용 가능하다고 판정되었다.

`04_DATA_MODEL.md`의 목표는 **기존 table을 additive하게 hardened outbox contract로 만드는 것**이다.

---

# 21.1 Required Outbox Contract

기존 column이 있다면 재사용하고, 없으면 additive column candidate로 검증한다.

논리적 fields:

```text
id
aggregate_type
aggregate_id
event_type
payload_json

dedupe_key

status
available_at
attempt_count
max_attempts

locked_at
locked_by

last_error_code
last_error_at

processed_at
dead_lettered_at

created_at
```

### Status

```text
PENDING
PROCESSING
PROCESSED
FAILED
DEAD_LETTER
```

기존 status naming이 다르면 repository convention을 우선할 수 있다.

### Constraints

```text
UNIQUE(dedupe_key)
INDEX(status, available_at)
INDEX(locked_at)
```

### Worker Claim

PostgreSQL:

```text
SELECT ... FOR UPDATE SKIP LOCKED
```

패턴을 권장한다.

MVP는 worker 1개여도 claim protocol을 두는 이유:

- 재시작
- 중복 실행
- scheduler overlap
- 향후 scale

에서 안전하다.

### Lease Recovery

`PROCESSING`인데 `locked_at`이 일정 시간 이상 지난 row를 재처리 가능하게 한다.

정확한 timeout은 implementation config.

---

# 22. Email Send Transaction Boundary

금지:

```text
BEGIN
update Opportunity
send external email
COMMIT
```

권장:

```text
Transaction A
verified state
+ change
+ notification/outbox
COMMIT

Worker
claim outbox
resolve/create delivery
send provider
record attempt/delivery
mark outbox processed
```

provider 성공 후 DB 업데이트 실패 시 idempotency는:

- logical Delivery unique key
- provider idempotency key if supported
- attempt history
- outbox dedupe

를 조합한다.

---

# 23. Article

# 23.1 `articles`

### Columns

```text
id                   UUID PK
slug                 TEXT NOT NULL
type                 ENUM/CHECK NOT NULL
category             ENUM/CHECK NOT NULL
status               ENUM/CHECK NOT NULL

title                TEXT NOT NULL
excerpt              TEXT NULL
content_html         TEXT NOT NULL

seo_title            TEXT NULL
seo_description      TEXT NULL
canonical_url        TEXT NULL

robots_index         BOOLEAN NOT NULL
robots_follow        BOOLEAN NOT NULL

featured_image_url   TEXT NULL
featured_image_alt   TEXT NULL

author_admin_id      <existing admin PK type> NULL

published_at         TIMESTAMPTZ NULL
unpublished_at       TIMESTAMPTZ NULL
archived_at          TIMESTAMPTZ NULL

created_at           TIMESTAMPTZ NOT NULL
updated_at           TIMESTAMPTZ NOT NULL
```

### Type

```text
GUIDE
UPDATE
ROUNDUP
```

### Category

```text
ENGLISH_KINDERGARTEN
PRIVATE_ELEMENTARY
INTERNATIONAL_SCHOOL
ADMISSIONS_GENERAL
```

### Status

```text
DRAFT
PUBLISHED
UNPUBLISHED
ARCHIVED
```

### Constraints

```text
UNIQUE(slug)
```

Publish transaction이 sanitized HTML임을 application-layer sanitizer contract로 보장한다.

DB는 HTML safety를 판단하지 않는다.

---

# 23.2 `article_institutions`

```text
article_id      UUID NOT NULL
institution_id  UUID NOT NULL
relation_type   ENUM/CHECK NOT NULL DEFAULT 'RELATED'
sort_order      INTEGER NULL
created_at      TIMESTAMPTZ NOT NULL
```

### Constraint

```text
UNIQUE(article_id, institution_id, relation_type)
```

---

# 23.3 `article_opportunities`

```text
article_id      UUID NOT NULL
opportunity_id  UUID NOT NULL
relation_type   ENUM/CHECK NOT NULL DEFAULT 'RELATED'
sort_order      INTEGER NULL
created_at      TIMESTAMPTZ NOT NULL
```

### Constraint

```text
UNIQUE(article_id, opportunity_id, relation_type)
```

---

# 24. Slug / Redirect History

Institution, Opportunity, Article 모두 published slug 변경 시 SEO continuity가 필요하다.

MVP에서는 entity별 slug-history table을 세 개 만들지 않고 **routing infrastructure table 하나**를 사용한다.

이것은 Domain polymorphic relation이 아니라 URL routing registry이므로 허용한다.

---

# 24.1 `url_redirects`

### Columns

```text
source_path   TEXT PK
target_path   TEXT NOT NULL
status_code   INTEGER NOT NULL
created_at    TIMESTAMPTZ NOT NULL
disabled_at   TIMESTAMPTZ NULL
reason        TEXT NULL
```

### Constraint

```text
CHECK(status_code IN (301, 308))
CHECK(source_path <> target_path)
```

### Application Rules

- redirect chain을 만들지 않는다.
- target은 항상 current canonical URL로 normalize한다.
- 기존 redirect source path를 새 canonical entity slug로 재사용하지 않는다.
- Draft entity slug change는 redirect가 필요하지 않을 수 있다.

### Index

PK(source_path)로 lookup 충분.

---

# 25. Legacy Guides / Updates

기존 `guides`, `updates`는 신규 canonical write path가 아니다.

Production data 존재 여부가 검증되지 않았기 때문에 Data Model은 conditional migration을 설계한다.

필요 시:

```text
article_legacy_guide_links
article_legacy_update_links
```

같은 1:1 mapping table을 migration 기간에만 둘 수 있다.

하지만 production row가 없다면 만들지 않는다.

Codex validation이 실제 Repository data availability를 확인할 수 없는 경우 migration implementation 전에 production inventory가 필요하다.

---

# 26. User Deletion / PII Model

Domain rule:

```text
User row remains as opaque historical anchor.
PII is erased/anonymized.
```

### Deletion Transaction

```text
lock User

users.status = DELETED
users.deleted_at = now

auth_identities → REVOKED / subject removal policy
user_profiles → delete or null PII attributes
user_emails → REMOVED and erase raw email
notification_preferences → DISABLED
active follows → INACTIVE
open follow episodes → close
pending/queued deliveries → SUPPRESSED
audit

COMMIT
```

### Historical Tables

다음은 User FK를 유지할 수 있다.

- follows
- follow_episodes
- notifications? Notification은 signal-level이므로 user FK 없음
- notification_deliveries
- delivery_attempts
- audit logs

### Raw Email Retention

notification_deliveries에 raw email을 저장하지 않는 이유가 여기 있다.

User deletion 후 historical delivery integrity와 PII deletion을 동시에 만족시키기 쉽다.

---

# 27. Delete / FK Actions

기본 policy:

### Core roots

```text
institutions          RESTRICT / logical archive
opportunities         RESTRICT / logical archive
users                 RESTRICT / logical delete
notifications         RESTRICT
articles              logical archive
sources               existing lifecycle preservation
```

### Child/reference

```text
institution aliases          CASCADE acceptable before public use
article relation rows        CASCADE from Article
interest rows                CASCADE from User if hard deleted, but User hard delete normally no
preferences                  RESTRICT/logical update
```

Historical evidence/version/change/delivery는 cascade delete를 피한다.

---

# 28. Database Invariant Matrix

| Domain Invariant | DB Constraint | Transaction Rule | Application Rule |
|---|---|---|---|
| Institution slug unique | UNIQUE | - | canonical slug generation |
| Institution↔School max 1:1 | two UNIQUE + FK | mapping preflight | migration ownership |
| Opportunity has one Institution | NOT NULL FK | - | institution validity |
| Opportunity↔Event max 1:1 | two UNIQUE + FK | aggregate consistency | truth_mode rule |
| Native current Version max 1 | partial UNIQUE | current swap transaction | verification command |
| Version non-branching | unique predecessor successor / trigger | locking | version service |
| Verified Version has Evidence | difficult cross-row | atomic verify transaction | publish guard |
| Published Opportunity has current verified truth | cross-table | publish transaction | publish guard |
| Source canonical URL dedupe | existing UNIQUE | - | canonicalizer |
| Auth provider subject unique | UNIQUE(provider, subject) | account linking transaction | OAuth adapter |
| User–Institution logical Follow unique | UNIQUE(user,institution) | lock/idempotent upsert | Follow service |
| Open FollowEpisode max 1 | partial UNIQUE | activation/deactivation tx | Follow service |
| Consent is append-only | no UPDATE permission/pattern | append transaction | consent service |
| Preference one/channel | UNIQUE(user,channel) | upsert | preference service |
| Notification signal dedupe | UNIQUE(dedupe_key) | get-or-create | notification policy |
| Delivery logical dedupe | UNIQUE(notification,user,channel) | insert on conflict | recipient resolver |
| Attempt numbering unique | UNIQUE(delivery,attempt_number) | lock/increment | worker |
| Article slug unique | UNIQUE | publish transaction | slug service |
| Article relation unique | UNIQUE pairs | - | editor service |
| External Email outside core tx | not DB constraint | worker boundary | architecture rule |

---

# 29. Last Verified Physical Projection

## Opportunity

Native:

```text
current opportunity_versions.verified_at
```

Legacy-backed:

```text
current admission_event_versions.verified_at
```

Application projection:

```text
OpportunityLastVerifiedAt
```

## Institution Fact

```text
current institution_fact_versions.verified_at
```

## Source

```text
MAX(source_observations.observed_at)
```

단, UI label은 `Last Checked`로 표시한다.

## Institution Page

MVP v1에서는 **page-wide fake Last Verified를 만들지 않는다.**

대신:

- 주요 Fact별 verification
- 공식 Source 마지막 확인

을 보여준다.

향후 Institution profile verification aggregate가 필요해질 때 별도 설계한다.

이 결정으로 MVP 과설계를 피한다.

---

# 30. Active Monitoring Parents Query Model

Definition:

```text
User ACTIVE
+ ≥1 ACTIVE Follow
+ usable Email
+ SERVICE_EMAIL_UPDATES effective granted
+ EMAIL preference ENABLED
```

### Required Indexes

```text
users(status)
follows(user_id, status)
user_emails(user_id, delivery_state)
notification_preferences(user_id, channel, state)
consent_decisions(user_id, consent_type, decided_at DESC)
```

Consent latest decision 계산 비용이 실제 문제가 되면 current projection/cache를 추가할 수 있다.

MVP부터 별도 `user_consent_current` table을 만들지 않는다.

---

# 31. My Preppy Read Queries

주요 화면은 transactional tables에서 충분히 읽을 수 있어야 한다.

### Active Follows

```text
user
→ follows ACTIVE
→ institutions
```

### Current Opportunities

```text
followed institutions
→ published opportunities
→ canonical current state projection
```

### Recent Changes

```text
opportunity_changes
WHERE institution IN followed institutions
ORDER BY published_at DESC
```

### Verification

Opportunity current verified_at + primary source.

MVP에서는 별도 CQRS read database를 만들지 않는다.

필요한 SQL view 또는 application query로 해결한다.

---

# 32. Notification Query Flow

## 32.1 Signal

```text
OpportunityChange materiality = NOTIFIABLE
```

또는 newly published Opportunity.

## 32.2 Canonical Notification Create

dedupe key로 idempotent insert.

## 32.3 Recipient Resolution

```text
institution_id
→ follows ACTIVE
→ users ACTIVE
→ user_emails USABLE
→ consent effective
→ preference ENABLED
```

## 32.4 Delivery Create

```text
INSERT ...
ON CONFLICT(notification_id,user_id,channel)
DO NOTHING
```

## 32.5 Outbox

Delivery send job를 outbox에 기록.

## 32.6 Worker

claim → recheck eligibility → attempt → provider → state.

---

# 33. Concurrency Rules

## 33.1 Opportunity Verification

동일 Opportunity를 두 Admin/process가 동시에 검증할 수 있다.

따라서:

- root/current version row lock
- partial unique current
- version number uniqueness

를 함께 사용한다.

optimistic retry가 가능해야 한다.

## 33.2 Follow

두 번 클릭/Callback retry:

```text
UNIQUE(user_id,institution_id)
```

+ transaction lock/upsert로 idempotent.

## 33.3 Notification

동일 OpportunityChange Outbox 중복 소비:

```text
UNIQUE notification dedupe_key
```

## 33.4 Delivery

worker/retry:

```text
UNIQUE(notification,user,channel)
```

## 33.5 Outbox Claim

`SKIP LOCKED` + lease recovery.

---

# 34. Audit / Actor Metadata

기존 Admin/audit asset을 재사용한다.

최소 critical command:

- Institution publish
- Institution Fact verification
- Opportunity verification
- Opportunity publish/hide/archive
- Source binding
- Article publish/unpublish
- manual Notification cancellation

은 actor와 timestamp를 추적 가능해야 한다.

모든 table에 `created_by`를 붙이는 식으로 과도하게 확장하지 않는다.

기존 audit_logs + version `verified_by_admin_id`를 사용한다.

---

# 35. Legacy Tables — Protection Policy

다음 기존 table/graphs는 migration 초기 보호 대상이다.

```text
schools
school_aliases
admission_cycles
admission_events
admission_event_versions
admission_facts
admission_fact_versions
sources
source_monitor_configs
source_observations
source_snapshots
detected_changes
meaningful_changes
event/fact evidence
subscribers
subscriptions
alerts
alert_deliveries
outbox_events
guides
updates
```

### Keep as active foundation

- sources
- observations
- snapshots
- existing AdmissionEvent/Fact history
- evidence
- meaningful changes for legacy engine
- outbox skeleton

### Legacy read-only after canonical cutover

- subscribers
- subscriptions
- alerts
- alert_deliveries
- guides
- updates

실제 data 존재 여부 확인 전 drop 계획을 세우지 않는다.

---

# 36. Additive Migration Plan

실제 SQL은 작성하지 않는다.

---

## M0 — Production/Repository Preflight

Read-only inventory:

- table row counts
- duplicate/invalid legacy slugs
- orphan FK candidates
- school type distribution
- current EventVersion integrity
- Guide/Update row existence
- Subscriber/Subscription/Alert row existence
- actual production DB availability
- external indexed route evidence if available

Hard migration 전 필수.

---

## M1 — Canonical Institution

Add:

```text
institutions
institution_school_links
institution_aliases
```

Backfill legacy schools → institutions where appropriate.

Native 영유 seed는 canonical Institution에 직접 작성.

Legacy graph untouched.

---

## M2 — Opportunity Identity + Native Truth

Add:

```text
opportunities
opportunity_admission_event_links
opportunity_versions
opportunity_version_evidence
opportunity_changes
institution_source_bindings
opportunity_source_bindings
```

Backfill existing AdmissionEvents → Opportunities conditionally.

Legacy EventVersion remains authoritative for bridged rows.

---

## M3 — Institution Fact Verification

Add:

```text
institution_facts
institution_fact_versions
institution_fact_version_evidence
```

초기 핵심 fact만 seed/backfill.

모든 legacy field를 억지로 migration하지 않는다.

---

## M4 — User / Identity / Consent / Follow

Add:

```text
users
auth_identities
user_profiles
user_emails
user_interest_regions
user_interest_categories
consent_decisions
notification_preferences
follows
follow_episodes
```

Legacy subscribers/subscriptions remain untouched.

자동 account linking 금지.

---

## M5 — Canonical Notification

Add:

```text
notifications
notification_deliveries
notification_delivery_attempts
```

Existing outbox hardening columns/indexes를 additive하게 추가.

Legacy Alert/Delivery new writes 중단은 아직 하지 않는다.

---

## M6 — Article / Routing

Add:

```text
articles
article_institutions
article_opportunities
url_redirects
```

Legacy Guides/Updates row가 실제 있을 때만 conditional backfill/link.

---

## M7 — Dual Read / Application Services

Public/Admin read를 canonical ID 중심으로 전환.

Legacy-backed Opportunity는 bridge를 통해 기존 history 읽기.

Native는 canonical version 읽기.

---

## M8 — Product Cutover

신규:

- Institution routes
- Opportunity routes
- User/Kakao
- Follow
- My Preppy
- Notification
- Article

가 canonical write/read path가 된다.

---

## M9 — Legacy Write Retirement

실제 production 검증 후:

- Subscriber/Subscription signup write stop
- legacy Alert creation stop
- Guides/Updates new write stop

History read 보존.

---

## M10 — Cleanup

Post-MVP, retention/backups/redirect 검증 후에만 후보를 평가한다.

MVP 성공 여부와 무관하게 성급히 drop하지 않는다.

---

# 37. Rollback Strategy

Additive migration의 장점은 초기 rollback이 쉽다는 것이다.

### M1–M6

canonical table에 아직 external write/URL이 많지 않으면:

- application code rollback
- new tables remain unused

로 안전하게 후퇴 가능.

### M7 이후

canonical IDs/slug/User Follow가 외부에 노출되면 table drop rollback은 금지.

forward-fix를 우선한다.

### Legacy

M9 전까지 legacy history는 그대로 남아 있으므로 데이터 복구 anchor 역할을 한다.

---

# 38. Data Quality Preflight Rules

Canonical backfill 전에 다음을 조사한다.

## Institution

- duplicate slug
- duplicate canonical name + region
- invalid/missing school type
- same real institution represented multiple schools
- closed/archived school

## AdmissionEvent

- orphan cycle/event
- current version missing
- multiple current version anomaly
- event type mapping
- invalid dates
- event→school mapping

## Source

- duplicate canonical URL
- broken source
- missing authority
- school/cycle-only binding

## Content

- existing Guide/Update row count
- slug overlap with planned Article
- malformed Markdown

## Audience

- Subscriber row count
- Subscription state
- actual AlertDelivery history

이 preflight는 migration SQL과 별도 read-only report로 수행한다.

---

# 39. Integration Test Strategy

기존 Repository의 DB invariant integration test style을 적극 재사용한다.

최소 신규 tests:

## Institution

1. duplicate institution slug reject
2. duplicate school mapping reject
3. same school → 2 institutions reject
4. Native institution without school allowed
5. invalid category/subtype reject

## Opportunity

6. opportunity requires institution
7. duplicate opportunity slug reject
8. Event bridge duplicate reject
9. cross-institution Event bridge reject
10. Native Opportunity without Event allowed
11. Native current version duplicate reject
12. native version lineage branching reject
13. cross-opportunity predecessor reject
14. verified publish without evidence reject at service test

## Facts

15. one current fact version
16. version lineage integrity
17. evidence linkage valid

## Identity

18. duplicate Kakao provider subject reject
19. same email for two users allowed
20. deleted user cannot activate Follow at service test

## Follow

21. duplicate logical Follow reject
22. open episode duplicate reject
23. reactivation closes/creates episodes correctly
24. double follow callback idempotent

## Notification

25. notification dedupe reject
26. delivery logical duplicate reject
27. attempt number duplicate reject
28. revoked preference suppresses pending send
29. Follow after signal gets no retroactive delivery
30. Follow deactivated before send suppresses

## Article

31. duplicate slug reject
32. duplicate Article relation reject
33. published slug change creates redirect service test

## User deletion

34. deletion revokes auth
35. active follows close
36. pending deliveries suppress
37. raw email removed
38. delivery history remains

---

# 40. Service-level Transaction Tests

DB constraint test만으로 충분하지 않은 영역:

### Verify Native Opportunity

- current swap
- evidence
- change
- outbox
- rollback atomicity

### Verify Legacy-backed Opportunity

- existing EventVersion/MeaningfulChange
- canonical OpportunityChange
- outbox

### Activate Follow

- pending auth callback retry
- idempotent Follow
- episode integrity

### Recipient Resolution

- signal timestamp
- follow activation timestamp
- consent
- preference
- email state

### Send Delivery

- outbox duplicate
- provider failure
- retry
- suppression

### Delete User

- cross-table transactional consistency

---

# 41. Drizzle Modeling Rules

Implementation 단계에서 다음을 따른다.

1. PostgreSQL constraint를 Drizzle schema에도 선언한다.
2. Drizzle이 표현하기 어려운 trigger/advanced constraint는 SQL migration으로 명시한다.
3. DB migration이 authoritative하다.
4. application-only enum validation으로 DB CHECK를 대체하지 않는다.
5. partial unique index를 적극 사용한다.
6. legacy schema를 한 파일에서 강제로 모두 재구성하지 않는다.
7. 신규 schema module 분리는 Domain boundary에 맞춰 점진적으로 한다.
8. generated migration을 맹목적으로 신뢰하지 않고 SQL review를 한다.

---

# 42. Index Budget

초기에는 query-driven index만 만든다.

필수 후보:

```text
institutions(publication_state, category, region_code)

opportunities(institution_id, publication_state)
opportunities(publication_state, kind)

opportunity_versions(opportunity_id, is_current)
opportunity_changes(opportunity_id, published_at DESC)

institution_facts(institution_id, fact_type)
institution_fact_versions(institution_fact_id, is_current)

auth_identities(provider, provider_subject) UNIQUE

user_emails(user_id)
consent_decisions(user_id, consent_type, decided_at DESC)
notification_preferences(user_id, channel)

follows(user_id, status)
follows(institution_id, status)
follow_episodes(follow_id, activated_at DESC)

notifications(status, signal_published_at)
notification_deliveries(status, created_at)
notification_deliveries(user_id, created_at DESC)

outbox_events(status, available_at)

articles(status, published_at DESC)
articles(category, status, published_at DESC)
```

실제 EXPLAIN 없이 speculative multi-column index를 과도하게 늘리지 않는다.

---

# 43. Data Retention Classification

정확한 기간은 Legal/Operations에서 결정하지만 데이터 성격을 분류한다.

## Long-lived business/history

- Institution
- Opportunity
- Versions
- Evidence
- OpportunityChange
- Source/Snapshot where needed
- Article
- non-PII delivery status
- audit

## User-controlled current state

- Profile
- Email
- Preference
- Follow current state

## Append-only legal/product decision history

- ConsentDecision
- FollowEpisode

## PII requiring deletion/anonymization path

- raw email
- provider subject
- profile data
- future lead/contact data

---

# 44. Security-sensitive Fields

다음은 application log에 출력하지 않는다.

- provider_subject
- raw email
- OAuth token
- consent raw request payload
- provider Email request body

OAuth access/refresh token을 DB에 장기 저장할 필요가 없다면 저장하지 않는다.

Kakao login에 token retention이 필요하다면 별도 encrypted credential policy를 설계한다.

User domain table에 access token column을 추가하지 않는다.

---

# 45. MVP Data Model Non-Scope

이번 Data Model에서는 다음을 만들지 않는다.

- family / household
- multiple children entity
- school ranking
- reviews
- community posts
- ads
- campaigns
- advertiser audience table
- lead table
- camp / after-school programs
- generic EducationOpportunity
- AI recommendation memory
- search cluster index schema
- data warehouse star schema
- push tokens
- Kakao message channel
- payment/subscription billing
- generic permissions framework

---

# 46. 14-Day Vertical Slice Data Dependencies

가장 먼저 작동해야 하는 data path:

```text
Institution
→ Opportunity
→ Source/Evidence
→ Public page
→ User/Kakao
→ Follow
→ Admin Verify
→ OpportunityChange
→ Notification
→ Delivery
→ Outbox
→ Email
→ Return
```

### Minimal table dependency order

```text
1 institutions
2 institution_school_links
3 opportunities
4 opportunity_admission_event_links
5 opportunity_versions/evidence
6 opportunity_changes
7 source bindings
8 users/auth/profile/email/consent/preference
9 follows/follow_episodes
10 notifications/deliveries/attempts
11 hardened outbox
12 articles/relations/redirects
```

Institution Fact versioning은 public comparison에 필요한 최소 field와 함께 병렬 구현 가능하다.

---

# 47. Critical P0 Data Decisions — Final

## DD-001 — Canonical PK

신규 canonical aggregate root는 UUID.

## DD-002 — Institution Mapping

Institution↔LegacySchool은 별도 additive 1:1 bridge table.

## DD-003 — Institution Category

Public category는 3개.

국제/외국인학교 legacy distinction은 secondary subtype.

## DD-004 — Institution Fact

MVP는 hybrid model.

stable profile은 Institution root, 중요한 비교/신뢰 정보는 `InstitutionFact + Version + Evidence`.

## DD-005 — Fact Value

MVP Fact value는 type-scoped validated JSONB.

universal unvalidated JSON blob으로 사용하지 않는다.

## DD-006 — Opportunity Root

Opportunity root는 stable identity/kind/publication/truth mode만 소유.

변경 가능한 public truth는 Version에서 읽는다.

## DD-007 — Opportunity Bridge

Opportunity↔AdmissionEvent는 separate 1:1 optional bridge.

## DD-008 — Native Version

Native Opportunity는 별도 `OpportunityVersion + Evidence`.

Legacy EventVersion table에 억지로 넣지 않는다.

## DD-009 — Change Signal

Canonical `OpportunityChange`를 신규 additive table로 둔다.

## DD-010 — Current Projection

MVP에서는 별도 materialized OpportunityCurrent table 없이 query projection.

## DD-011 — User Identity

User / AuthIdentity / UserEmail / Profile 분리.

## DD-012 — Email

User당 current email 최대 1개로 시작하며 global unique는 강제하지 않는다.

## DD-013 — Consent

append-only ConsentDecision.

## DD-014 — Preference

current NotificationPreference 별도.

## DD-015 — Follow

`follows` logical current relation + `follow_episodes` append-only history.

## DD-016 — Notification

signal-level canonical Notification 신규 table.

## DD-017 — Delivery

recipient/channel logical NotificationDelivery 신규 table.

## DD-018 — Attempt

provider retry는 NotificationDeliveryAttempt append-only table.

## DD-019 — Legacy Alert

Alert/AlertDelivery row model은 수정해 신규 canonical delivery에 재사용하지 않는다.

## DD-020 — Outbox

기존 Outbox를 additive hardening해서 재사용.

## DD-021 — Recipient Email

long-lived Delivery에는 raw recipient email을 기본 저장하지 않는다.

## DD-022 — Article

canonical sanitized `content_html` Article 신규 table.

## DD-023 — Article Relations

Institution/Opportunity explicit bridge tables.

## DD-024 — Slug History

generic domain relation이 아닌 `url_redirects` routing registry로 관리.

## DD-025 — User Delete

User row는 opaque history anchor로 logical delete하고 PII를 erase/anonymize.

## DD-026 — Last Verified

page-wide fake timestamp를 만들지 않고 scope별 verification projection 사용.

## DD-027 — Legacy Cleanup

Production data 확인 전 legacy table drop/rename 금지.

---

# 48. Repository Validation Questions

Codex는 이 문서를 검증할 때 최소 다음을 확인해야 한다.

1. 신규 UUID/table names가 existing namespace와 충돌하는가?
2. Legacy PK type과 bridge FK가 실제로 호환되는가?
3. Institution↔School aggregate consistency를 DB에서 어떻게 강제하는 것이 최적인가?
4. Opportunity↔AdmissionEvent aggregate consistency는 composite FK로 가능한가?
5. 기존 EventVersion lineage trigger를 Native OpportunityVersion에 복제 가능한가?
6. 기존 Evidence table 패턴을 InstitutionFact/NativeOpportunity에 적용 가능한가?
7. `source_observation_id`/`snapshot_id` nullable evidence pattern이 실제 schema와 맞는가?
8. Existing `outbox_events`에 어떤 column이 이미 있고 무엇만 추가하면 되는가?
9. Existing Alert/Delivery dedupe pattern 중 어떤 unique key를 재사용할 수 있는가?
10. `admin_users` PK/type을 신규 verified_by/author FK에서 그대로 사용할 수 있는가?
11. FollowEpisode partial unique가 Repository PostgreSQL version에서 문제없는가?
12. Consent latest query와 AMP query가 예상 규모에서 충분한가?
13. raw email 제거 정책이 existing Email delivery schema와 충돌하지 않는가?
14. Guides/Updates 실제 row가 없다면 conditional migration table을 만들 필요가 없는가?
15. Drizzle이 각 partial index/check/FK를 표현 가능한가?
16. DB trigger가 필요한 invariant를 최소화할 수 있는가?
17. 기존 integration test harness로 신규 invariant를 검증 가능한가?

---

# 49. Definition of Done

`04_DATA_MODEL.md`가 완료된 것으로 보는 조건:

1. Domain Model의 모든 canonical aggregate가 물리 table 구조로 내려왔다.
2. Legacy bridge가 additive하게 설계되었다.
3. Native Opportunity truth/history가 독립적으로 완결된다.
4. Institution Fact verification 최소 모델이 존재한다.
5. User/Kakao/Email/Consent/Preference가 분리되었다.
6. Follow current state와 history를 동시에 보존한다.
7. Notification/Delivery/Attempt가 legacy Alert와 분리되었다.
8. Outbox reliability gap을 명시했다.
9. User deletion과 PII erasure path가 존재한다.
10. Article/relations/redirect가 SEO 구조를 지원한다.
11. 핵심 invariant가 DB/transaction/application 중 어디에서 강제되는지 정의했다.
12. 필요한 index와 concurrency strategy가 정의됐다.
13. 실제 migration SQL 없이 additive migration sequence가 정의됐다.
14. Repository 검증 질문이 명확하다.
15. MVP Non-Scope가 schema에 섞이지 않았다.

---

# 50. Next Step

다음 단계는 바로 migration 구현이 아니다.

먼저 Codex에서:

`04_DATA_MODEL.md`

를 현재 Repository의 실제 Drizzle schema, PostgreSQL migration, FK, trigger, test와 대조해 검증한다.

검증 산출물:

```text
04A_DATA_MODEL_REPOSITORY_VALIDATION.md
```

검증 결과가:

```text
VALID
또는
VALID_WITH_IMPLEMENTATION_ADJUSTMENTS
```

이고 Domain/Architecture amendment가 필요 없다면 다음 문서로 진행한다.

권장 다음 설계:

```text
05_MONITORING_ARCHITECTURE.md
```

그 문서에서는:

- Manual-first verification workflow
- Source checking cadence
- Admin verification command
- legacy/native Opportunity verification unification
- OpportunityChange generation
- Outbox orchestration
- notification triggering
- future collector insertion point

을 확정한다.

Production migration 및 feature implementation은 Monitoring/Identity/Notification/Admin 세부 architecture와 PRD의 critical contract가 정리된 후 시작한다.
