# PREPPY — CODEX IMPLEMENTATION PROMPT — PHASE 0B

> **Execution Mode:** IMPLEMENTATION  
> **Phase:** 0B — Canonical Institution Additive Migration  
> **Project:** PREPPY  
> **Prerequisite:** Phase 0A PASS  
> **Validated Plan:** `docs/12A_IMPLEMENTATION_PLAN_REPOSITORY_VALIDATION.md`  
> **Primary Rule:** Implement canonical Institution schema/bridge/backfill foundation only, run tests, report, and STOP.  
> **Do Not Proceed To:** Opportunity, InstitutionFact, User/Follow, Notification, Article, public routes, Admin runtime, worker, provider, SEO, Analytics.

## 0. Role

너는 PREPPY Repository를 실제로 수정하는 **Staff PostgreSQL Engineer / Data Migration Engineer / Backend Engineer**다.

Phase 0A에서 다음 foundation이 이미 구현되어 있다.

```text
process-local PostgreSQL pool
runtime Drizzle
explicit DatabaseExecutor / TransactionExecutor
TransactionManager
typed ApplicationError
correlation ID
capability-scoped environment validation
safe side-effect defaults
```

이번 Phase에서는 이 foundation 위에 **canonical Institution identity**를 additive하게 도입한다.

이번 Phase의 핵심 목적은:

> 기존 AdmissionRadar `schools`를 파괴하거나 rename하지 않고, PREPPY의 canonical `Institution`을 추가하고, legacy School과 안전하게 0..1 ↔ 0..1 bridge할 수 있게 만드는 것.

## 1. 반드시 먼저 읽을 문서

구현 전에 아래 문서를 순서대로 읽어라.

```text
docs/03_DOMAIN_MODEL.md
docs/03A_DOMAIN_MODEL_REPOSITORY_VALIDATION.md
docs/04_DATA_MODEL.md
docs/04A_DATA_MODEL_REPOSITORY_VALIDATION.md
docs/10_PRD.md
docs/10A_PRD_REPOSITORY_VALIDATION.md
docs/11_API_CONTRACT.md
docs/11A_API_CONTRACT_REPOSITORY_VALIDATION.md
docs/12_IMPLEMENTATION_PLAN.md
docs/12A_IMPLEMENTATION_PLAN_REPOSITORY_VALIDATION.md
```

그리고 직전 Phase 결과/실제 코드를 확인한다.

```text
src/infrastructure/db/runtime.server.ts
src/application/context.ts
src/application/errors.ts
src/config/runtime-env.ts
tests/integration/transaction-foundation.test.ts
```

Repository reality가 문서와 다르면 실제 코드 evidence를 우선하되, Product/Domain semantic은 validated 문서를 우선한다.

## 2. Repository를 먼저 실제로 조사

수정 전 최소 아래를 확인한다.

```text
package.json
src/db/schema/*
src/db/connection.ts or current replacement
src/infrastructure/db/*
src/db/migrate.ts
drizzle config
migration journal
existing migrations:
  0000_absent_shen.sql
  0001_productive_morph.sql
schools table definition
school type enum/check
school slug/index
school foreign-key relationships
tests/integration/*
tests/unit/*
scripts/*
```

특히 실제 legacy `schools` schema를 정확히 읽고:

```text
id type
name fields
slug
school_type/category
region/address fields
timestamps
existing unique indexes
existing references
```

를 확인한다. 추측해서 migration을 만들지 않는다.

## 3. Phase 0B 최종 목표

Phase 종료 시 다음이 가능해야 한다.

```text
Canonical Institution
        │
        ├─ native PREPPY institution
        │   └─ legacy School 없음
        │
        └─ legacy-backed institution
            └─ exactly one optional School bridge
```

즉:

```text
Institution 0..1 ↔ 0..1 LegacySchool
```

semantic을 지원해야 한다.

특히 `영유`는 legacy `schools` row 없이 canonical Institution으로 존재 가능해야 한다.

## 4. 이번 Phase 구현 범위

이번 Phase에서 구현할 수 있는 것은 다음뿐이다.

```text
1. institutions table
2. institution_school_links bridge table
3. Institution-related Drizzle schema/types
4. required enum/check/index/unique constraints
5. legacy School → Institution preflight
6. deterministic/idempotent backfill foundation
7. migration
8. DB/integration tests
```

필요한 최소 repository/query helper는 backfill/test 지원 목적으로만 허용.

아직 Product application command/public DAL은 만들지 않는다.

## 5. Canonical Institution Domain Contract

Canonical public Institution Category:

```text
ENGLISH_KINDERGARTEN
PRIVATE_ELEMENTARY
INTERNATIONAL_SCHOOL
```

Public labels:

```text
영유
사립초
국제학교
```

중요: `영유`는 PREPPY Product Taxonomy이며 법적 School status를 주장하는 값이 아니다.

## 6. International Subtype

Public category:

```text
INTERNATIONAL_SCHOOL
```

Internal/secondary subtype:

```text
INTERNATIONAL_SCHOOL
FOREIGN_SCHOOL
OTHER_INTERNATIONAL
```

Legacy mapping 원칙:

```text
legacy PRIVATE_ELEMENTARY
→ category PRIVATE_ELEMENTARY

legacy INTERNATIONAL_SCHOOL
→ category INTERNATIONAL_SCHOOL
→ subtype INTERNATIONAL_SCHOOL

legacy FOREIGN_SCHOOL
→ category INTERNATIONAL_SCHOOL
→ subtype FOREIGN_SCHOOL
```

Legacy schema가 실제로 다른 값/enum을 사용한다면 actual values를 기준으로 mapping을 구현하고 보고한다.

## 7. Institution States

Operational:

```text
ACTIVE
INACTIVE
CLOSED
UNKNOWN
```

Publication:

```text
DRAFT
PUBLISHED
HIDDEN
ARCHIVED
```

정확한 DB representation은 `04_DATA_MODEL.md`를 따른다.

불필요하게 PostgreSQL ENUM을 만들기보다 existing repository convention을 우선 검토한다.

## 8. `institutions` Table

정확한 physical definition은 `04_DATA_MODEL.md`가 source of truth다.

최소 semantic:

```text
id
canonical/display name
slug
category
international subtype nullable
region/location fields required by target model
publication_state
operational_state
stable public profile fields defined by 04
created_at
updated_at
```

이번 Phase에서 InstitutionFact로 갈 값까지 root에 임의로 넣지 않는다.

예:

```text
tuition
eligibility
curriculum
admission process
```

등 versioned Fact 대상은 Phase 0B root column으로 invent하지 않는다.

## 9. Institution ID

Canonical Institution PK는 UUID.

Legacy School ID와 independent canonical identity.

Backfill 시 stable mapping을 보장하되 canonical identity는 `institution_id`, legacy compatibility identity는 `school_id`다.

## 10. Slug Contract

Institution slug는 canonical URL identity이고 PK가 아니다.

DB uniqueness를 준비한다.

Backfill collision을 자동 suffix로 숨기지 않는다.

```text
duplicate 발견
→ FAIL / report
```

가 기본.

## 11. `institution_school_links` Bridge

목적:

```text
canonical Institution
↔ legacy School
```

필수 invariant:

```text
one Institution → at most one School
one School → at most one Institution
```

따라서 최소:

```text
institution_id UNIQUE
school_id UNIQUE
```

또는 동등한 PK/unique.

## 12. Bridge FK Policy

FK:

```text
institution_school_links.institution_id → institutions.id
institution_school_links.school_id → schools.id
```

Delete behavior는 validated Data Model을 따른다.

이번 Phase에서 legacy School hard delete workflow를 만들지 않는다.

## 13. Native Institution

반드시 가능:

```text
Institution(category=ENGLISH_KINDERGARTEN)
without institution_school_links row
```

테스트 필수.

fake School 생성 금지.

## 14. Legacy School은 그대로 유지

금지:

```text
schools rename
schools drop
school FK rewrite
school column destructive change
AdmissionCycle FK 변경
AdmissionEvent FK 변경
```

## 15. Backfill Philosophy

이번 Phase backfill은:

```text
legacy School
→ canonical Institution
→ institution_school_links
```

까지만.

Opportunity/Event는 건드리지 않는다.

## 16. Backfill Preflight — Mandatory

실제 insert 전에 read-only preflight 구현.

최소 검사:

```text
school total count
school type distribution
null/empty canonical names
null/invalid slug
duplicate slug
duplicate normalized names + region warning
unknown school type
invalid required region/location
existing partially backfilled mapping
orphan/inconsistent bridge if rerun
```

## 17. Preflight Severity

BLOCKING 예:

```text
duplicate canonical slug
unknown school type
school already mapped to conflicting Institution
required value impossible to derive
```

BLOCKING이면 apply 금지.

WARNING 예:

```text
normalized name duplicate but different valid slug
missing optional profile
weak region normalization
```

## 18. Deterministic / Idempotent Backfill

같은 legacy School input은 같은 canonical mapping을 만들어야 한다.

두 번 실행해도 duplicate Institution/bridge가 생기면 실패.

테스트:

```text
run once → N mappings
run again → same N mappings
```

## 19. Backfill Is Silent

절대 생성 금지:

```text
OpportunityChange
Notification
customer-facing Outbox
legacy Alert side effect
```

향후 migration context:

```text
source=MIGRATION
emitProductSignals=false
```

와 양립하도록 구조화.

## 20. Migration Shape

새 migration은 applied history 뒤에 append.

기존:

```text
0000_absent_shen.sql
0001_productive_morph.sql
```

수정/rename/squash 금지.

이번 Phase에서 새 migration은 Institution 관련 additive schema만 포함.

## 21. Backfill Placement

Production row state가 NOT_VERIFIED이므로 기본 추천:

```text
schema migration
+
separate explicit preflight/backfill tooling
```

production data transform을 migration apply 자체에 숨기지 않는다.

Production canonical backfill 실행은 WP-15B이며, Phase 0B에서는 tested tooling/foundation까지만.

## 22. Database Constraint Is Final Guard

DB로 최종 보장:

```text
unique slug
valid category
valid subtype/category relation where required
bridge one-to-one
FK integrity
```

## 23. Publication/Operational Defaults

Backfilled legacy Institution 초기 state는 04/validated plan을 따른다.

모두 PUBLISHED로 임의 변환 금지.

Public behavior를 바꾸는 Product decision이 문서로 고정되지 않았다면 safer non-public state를 우선하고 보고.

## 24. Timestamp Semantics

Migration time을 Last Verified로 사용하지 않는다.

Last Verified는 이번 Phase 대상 아님.

## 25. Minimal Repository Helpers

허용:

```text
Institution persistence types
backfill preflight function
backfill apply function/script
```

금지:

```text
CreateInstitution Application Command
PublishInstitution
Public Institution DAL
Institution API
```

## 26. Mandatory Tests — Schema

반드시 포함:

```text
1. Native ENGLISH_KINDERGARTEN without School → PASS
2. legacy PRIVATE_ELEMENTARY mapping
3. legacy INTERNATIONAL_SCHOOL → public INTERNATIONAL_SCHOOL + subtype
4. legacy FOREIGN_SCHOOL → public INTERNATIONAL_SCHOOL + FOREIGN_SCHOOL subtype
5. one School cannot map to two Institutions
6. one Institution cannot map to two Schools
7. duplicate Institution slug rejected
8. invalid category/subtype rejected when target constraint requires
9. bridge FK integrity
```

## 27. Mandatory Tests — Backfill

반드시 포함:

```text
deterministic mapping
idempotent second run
duplicate slug preflight BLOCKING
unknown type BLOCKING
partial correct mapping safe
conflicting existing mapping BLOCKING
forced mid-backfill failure → full rollback
no Product side effect
```

Backfill apply는 Phase 0A `TransactionManager`/executor를 사용.

새 독립 transaction helper 금지.

## 28. Existing Tests Regression

Full existing suite green 유지.

Legacy schools/cycles/events/facts/lineage/source/alert/outbox tests 깨지면 안 됨.

## 29. Migration Test

Fresh test DB:

```text
0000
→ 0001
→ new Institution migration
```

passes.

Existing fixture DB upgrade도 passes.

## 30. Backfill Script Safety

CLI/script를 추가한다면:

```text
dry-run/preflight
apply explicit
```

Default invocation이 production mutate하지 않게 한다.

`npm run build`, app startup, `db:migrate`에서 자동 production backfill 금지.

## 31. No Production Data Assumption

Test fixture가 통과해도:

```text
production collision state NOT_VERIFIED
```

라고 보고.

WP-15A에서 read-only production preflight 필요.

## 32. No Public Cutover

이번 Phase 후에도 public Institution page/API가 없어야 정상.

public canonical read cutover 금지.

## 33. Scope Exclusions

절대 하지 않는다.

```text
❌ opportunities
❌ opportunity_admission_event_links
❌ opportunity_versions
❌ opportunity_changes
❌ institution_facts

❌ users
❌ auth_identities
❌ follows
❌ follow_episodes

❌ notifications
❌ deliveries
❌ article tables
❌ url_redirects

❌ Outbox hardening

❌ public Institution page
❌ Institution API
❌ CreateInstitution command
❌ PublishInstitution command

❌ Kakao auth
❌ Admin
❌ Worker
❌ Email
❌ SEO
❌ Analytics
```

## 34. Scope Creep Handling

예:

```text
"Institution이 생겼으니 /institutions 페이지도 만들자"
→ NO

"Opportunity FK를 미리 붙이자"
→ NO

"Source Binding을 canonical Institution으로 일반화하자"
→ NO, later phase

"schools를 Institution으로 rename하자"
→ ABSOLUTELY NO
```

## 35. Package / Tooling

새 package 설치 금지.

기존 Drizzle/Postgres/Vitest tooling 사용.

## 36. Test / Build Commands

Repository에 실제 존재하는 script 기준으로 실행:

```text
npm run typecheck
npm run lint
npm run test
npm run build
npm run db:migrate
```

없는 command invent 금지.

## 37. Independent Diff Review

완료 전 반드시 확인:

```text
Did I modify legacy schools destructively?
Did I accidentally add Opportunity?
Did I put production backfill in startup/migrate?
Did I silently resolve slug collision?
Did I add Product signal?
Did I bypass Phase 0A TransactionManager?
Did I edit 0000/0001?
Did I expose Institution publicly?
```

하나라도 YES면 scope violation 수정 후 재테스트.

## 38. Phase Completion Criteria

모두 만족해야 PASS.

```text
[ ] institutions table exists
[ ] institution_school_links exists
[ ] schema is additive
[ ] legacy schools untouched
[ ] native ENGLISH_KINDERGARTEN without School works
[ ] legacy PRIVATE_ELEMENTARY mapping works
[ ] legacy INTERNATIONAL_SCHOOL mapping works
[ ] legacy FOREIGN_SCHOOL mapping works
[ ] one School ↔ max one Institution enforced
[ ] Institution slug unique enforced
[ ] category/subtype integrity enforced per 04
[ ] preflight exists
[ ] blocking collision prevents apply
[ ] backfill deterministic
[ ] backfill idempotent
[ ] partial correct mapping safe
[ ] conflicting mapping blocks
[ ] Phase 0A transaction foundation reused
[ ] failure rolls back fully
[ ] no Product signal side effect
[ ] new migration appended after existing migrations
[ ] 0000/0001 untouched
[ ] full existing tests green
[ ] typecheck/lint/build green
[ ] no Opportunity/User/Notification/Article/Public route added
```

## 39. Git

```text
git commit 금지
git push 금지
```

## 40. 완료 후 반드시 STOP

PASS 후에도 다음:

```text
WP-02A — Canonical Opportunity root + legacy AdmissionEvent bridge
```

를 시작하지 않는다.

## 41. 최종 보고 형식

```text
Phase 0B Implementation Complete

Implemented:
- ...

Files Changed:
- ...

Packages Added:
- NONE

Migration:
- file:
- purpose:
- existing migrations modified: NO

Canonical Institution:
- table:
- category model:
- publication state:
- operational state:
- native institution support:

Legacy Bridge:
- table:
- School → Institution uniqueness:
- Institution → School uniqueness:
- FK behavior:

Legacy Mapping:
- PRIVATE_ELEMENTARY → ...
- INTERNATIONAL_SCHOOL → ...
- FOREIGN_SCHOOL → ...

Preflight:
- blocking checks:
- warnings:
- production state verified: NO

Backfill:
- mode:
- deterministic:
- idempotent:
- partial existing mapping:
- conflict behavior:
- transaction model:
- Product signals emitted: NO

Tests Added/Changed:
- ...

Tests Run:
- ...
- Result: PASS / FAIL

Existing Test Regression:
- NONE
or
- ...

Architecture Deviations:
- NONE
or
- ...

Implementation Adjustments:
- ...

Blockers:
- NONE
or
- ...

Scope Check:
- Legacy schools untouched
- No Opportunity schema added
- No User/Follow schema added
- No Notification/Article schema added
- No Product route added
- No Outbox hardening
- No provider/runtime feature

Next Recommended Phase:
WP-02A — Canonical Opportunity root + legacy AdmissionEvent bridge

STOPPED:
YES
```

## 42. 핵심 성공 기준

이 Phase의 성공은 public Institution 화면이 아니다.

성공은 다음 문장이 true가 되는 것이다.

> **“기존 `schools`와 그 history/FK graph를 그대로 보존한 채 PREPPY canonical Institution identity를 additive하게 도입했고, legacy School은 정확히 하나의 Institution에 선택적으로 bridge되며, native 영유 Institution은 fake legacy School 없이 존재할 수 있고, production backfill 전에 collision을 안전하게 탐지할 수 있다.”**

이 상태까지만 구현하고 반드시 멈춰라.
