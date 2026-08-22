# 12_IMPLEMENTATION_PLAN.md

> **Project:** PREPPY (프레피)  
> **Document Type:** Repository-aware MVP Implementation Plan  
> **Status:** v1.1 — Repository validated; production sequencing amendment applied  
> **Validated Product Contract:** `10_PRD.md`  
> **Validated API Contract:** `11_API_CONTRACT.md`  
> **Latest Validation:** `11A_API_CONTRACT_REPOSITORY_VALIDATION.md` — VALID_WITH_IMPLEMENTATION_ADJUSTMENTS  
> **Runtime Target:** Next.js 16.3 + React 19 + TypeScript + Drizzle ORM + PostgreSQL  
> **Architecture Style:** Modular Monolith  
> **Primary Goal:** 가장 짧은 경로로 PREPPY의 `Discover → Follow → Monitor → Notify → Return` vertical slice를 production-safe하게 구현한다.  
> **Implementation Principle:** Architecture for Extension. Implementation for Validation.  
> **Hard Rule:** 구현 중 새로운 Product/Architecture 기능을 발명하지 않는다. 검증된 `00–11A` contract를 코드로 옮긴다.

---

# 0. Document Role

이 문서는 다음 질문에 답한다.

1. 어떤 순서로 구현해야 하는가?
2. 어떤 작업이 선행되어야 하는가?
3. 어떤 migration을 먼저 해야 하는가?
4. 어떤 application service와 route가 먼저 필요한가?
5. 각 단계에서 어떤 테스트를 통과해야 다음 단계로 갈 수 있는가?
6. 무엇을 병렬로 할 수 있고 무엇은 병렬로 하면 안 되는가?
7. legacy schema를 어떻게 additive하게 canonical model로 옮기는가?
8. 언제 public UI를 연결하는가?
9. 언제 Email provider를 연결하는가?
10. 언제 production launch 준비가 끝났다고 판단하는가?

이 문서는 API를 다시 설계하지 않는다.

이 문서는 다음을 하지 않는다.

- 새로운 MVP 기능 제안
- UI visual design 확정
- provider/vendor 강제 선택
- production SQL을 미리 작성
- exact PR 개수 강제
- exact 개발 기간 추정
- microservice decomposition
- crawler implementation
- AI implementation

---

# 1. Current Repository Starting Point

`10A`/`11A` 검증 기준 current repository는 다음 상태다.

## Implemented / Reusable

```text
Next.js 16.3
React 19
TypeScript
Zod
Drizzle/PostgreSQL
legacy schools
admission cycles/events/facts
event/fact version history
lineage/evidence
sources
source bindings
source monitor configs
source snapshots/observations
meaningful changes
admin_users
audit_logs
legacy subscribers/subscriptions
legacy alerts/deliveries
basic outbox_events
/api/health
DB migrations/tests
```

## Not Implemented

```text
canonical Institution
canonical Opportunity
InstitutionFact
OpportunityChange

User/AuthIdentity/UserEmail/Profile
ConsentDecision/NotificationPreference
Follow/FollowEpisode

canonical Notification
NotificationDelivery
DeliveryAttempt

public pages
Kakao auth/session
My Preppy
Admin runtime
application command/query layer

Article CMS
sanitizer
SEO runtime
redirects
cache revalidation adapter

hardened Outbox worker
Email provider adapter/webhook

GA4/GSC runtime
typed analytics registry

backup/restore proof
external observability
production worker topology
```

---

# 1A. Repository Validation Amendment Applied

`12A_IMPLEMENTATION_PLAN_REPOSITORY_VALIDATION.md` 판정에 따라 다음 required amendment를 v1.1에 반영한다.

```text
WP-15A Preflight / Non-production Rehearsal
→ WP-16A Backup / Restore / Baseline Observability / Migration Runbook
→ WP-15B Production Backfill / Canonical Cutover
→ WP-16B Post-cutover Operations Validation
```

Production data mutation/cutover는 `WP-16A` evidence 없이 시작할 수 없다.

또한 execution 시 다음 subphase를 사용한다.

```text
Phase 0A — DB runtime / transaction / error foundation
Phase 0B — Institution additive migration

WP-02A — Opportunity root / legacy bridge
WP-02B — Native version / evidence / change / Institution Fact

WP-04A — Outbox hardening
WP-04B — Canonical Notification / Delivery / Attempt
WP-04C — Article / relations / redirects
```

Outbox hardening은 canonical Notification writer보다 선행한다.

# 2. Implementation Strategy

PREPPY는 기능별로 완성하는 방식보다 **vertical capability** 기준으로 구현한다.

잘못된 방식:

```text
DB 전부
→ API 전부
→ UI 전부
→ Admin 전부
→ 마지막에 Email
```

권장 방식:

```text
Foundation
→ Canonical Domain Slice
→ Public Read
→ User/Follow
→ Monitoring Verification
→ Notification/Email
→ Article/SEO
→ Admin Ops
→ Analytics
→ Production Hardening
→ Full Vertical Slice
```

각 단계가 다음 단계를 위한 실제 executable foundation이 되어야 한다.

---

# 3. Global Implementation Rules

모든 작업에 적용한다.

## RULE-01 — Additive Migration

```text
add
→ backfill
→ validate
→ dual compatibility
→ cutover
→ deprecate
```

Production validation 전 legacy table drop/rename 금지.

## RULE-02 — Typed Application Commands

Route에서 direct DB write 금지.

## RULE-03 — Transaction Ownership

Application command가 transaction 소유.

nested command transaction 금지.

## RULE-04 — External Side Effect After Commit

Email, Analytics, Cache Revalidation, provider unlink는 DB core transaction 밖.

## RULE-05 — Idempotency at DB Boundary

retry safety는 UI logic이 아니라 DB unique/transition invariant로 최종 보장.

## RULE-06 — Tests Before Cutover

새 canonical write path는 integration test 없이 public/Admin cutover 금지.

## RULE-07 — Migration Is Silent

Backfill/migration은 Product signal을 만들지 않는다.

## RULE-08 — Private/Public Cache Separation

User/Admin state는 public cached DAL에 들어가지 않는다.

## RULE-09 — PII Minimal

로그/Audit/Analytics에 raw Email/Kakao subject/child data 금지.

## RULE-10 — No Premature Automation

crawler/AI/queue infra 추가 금지.

---

# 4. Implementation Workstream Overview

```text
WP-00  Repository Foundation
WP-01  Canonical Schema — Institution
WP-02  Canonical Schema — Opportunity/Trust
WP-03  Canonical Schema — Identity/Follow
WP-04  Canonical Schema — Notification/Article/Outbox
WP-05  Application Transaction + Error Foundation
WP-06  Public Query Layer
WP-07  Public Product Pages
WP-08  Kakao Auth / User Activation
WP-09  Follow / My Preppy
WP-10  Monitoring / Verification Commands
WP-11  Admin Runtime
WP-12  Notification / Outbox Worker / Email
WP-13  Article CMS / SEO
WP-14  Analytics
WP-15  Seed / Backfill / Canonical Cutover
WP-16  Production Operations
WP-17  Full Vertical Slice
WP-18  Launch Readiness
```

---

# 5. Critical Dependency Graph

```text
WP-00
  ↓
WP-01
  ↓
WP-02
  ├──────────────┐
  ↓              ↓
WP-03          WP-06
  ↓              ↓
WP-04          WP-07
  ↓              │
WP-05────────────┘
  ↓
WP-08
  ↓
WP-09
  ↓
WP-10
  ↓
WP-11
  ↓
WP-12
  ↓
WP-13
  ↓
WP-14
  ↓
WP-15A
  ↓
WP-16A
  ↓
WP-15B
  ↓
WP-16B
  ↓
WP-17
  ↓
WP-18
```

실제로 일부 작업은 병렬 가능하지만 canonical schema와 transaction foundation은 우선한다.

---

# 6. WP-00 — Repository Foundation

## Goal

기존 repo를 canonical implementation을 안전하게 받을 수 있는 형태로 준비.

## Required Work

### 00.1 Server-only DB Boundary

현재 singleton raw postgres client를 server-only infrastructure module로 정리.

필수:

```text
raw pool/client
Drizzle db instance
transaction helper
test DB isolation
server-only import boundary
```

### 00.2 Production Connection Pool

`11A`가 확인한 current `max:1`은 production web+worker concurrency에 부적절.

구현:

```text
environment-aware pool sizing
web/worker compatible connection strategy
```

exact 숫자는 deployment provider에 맞춰 later.

### 00.3 Transaction Context

최우선 구현.

concept:

```ts
type DbTx = ...
```

Repository method:

```text
repo.method(input, tx?)
```

또는 transaction-scoped repository factory.

중요:

```text
CompleteSignup
VerifyOpportunity
DeleteUser
PublishArticle
```

가 같은 transaction context를 하위 module에 전달할 수 있어야 함.

### 00.4 Typed Application Error

구현:

```text
ApplicationError
ValidationError
UnauthenticatedError
ForbiddenError
NotFoundError
ConflictError
NotEligibleError
RetryableError
ExternalProviderError
```

### 00.5 Correlation ID

mutation boundary마다 server-generated UUID.

### 00.6 Safe Error Mapper

Route Handler:

```text
ApplicationError → HTTP
Unknown → INTERNAL_ERROR
```

raw SQL/stack 금지.

### 00.7 Environment Validation Expansion

추가 target config:

```text
APP_BASE_URL

USER_SESSION_SECRET
ADMIN_SESSION_SECRET
OAUTH_STATE_SECRET
FOLLOW_INTENT_SECRET
INTERNAL_REVALIDATION_SECRET

KAKAO_CLIENT_ID
KAKAO_CLIENT_SECRET optional/provider requirement
KAKAO_REDIRECT_URI

EMAIL_SEND_ENABLED
WORKER_ENABLED
ANALYTICS_ENABLED

GA4 measurement config later
EMAIL provider config later
```

Non-prod side effects default deny.

---

# 7. WP-00 Tests

## Unit

- env validation
- error mapping
- correlation generation
- safe error serialization

## Integration

- transaction rollback
- transaction context shared across repositories
- concurrent transaction capability
- test DB guard

## Exit Criteria

```text
[ ] pooled DB usable
[ ] Drizzle + raw SQL transaction helper available
[ ] shared transaction context proven
[ ] safe error contract tested
[ ] environment side-effect defaults safe
```

---

# 8. WP-01 — Canonical Institution Schema

## Goal

Legacy `schools`를 유지하면서 canonical `institutions` foundation 생성.

---

# 9. WP-01 Migration Scope

Create:

```text
institutions
institution_school_links
```

Potential:

```text
institution_aliases
```

only if 04 Data Model explicitly requires.

Do not invent extra tables.

---

# 10. Institution Migration Requirements

### institutions

Must support:

```text
id
name
category
subcategory where applicable
region
slug
publication_state
operational_state
profile fields
created_at
updated_at
```

### institution_school_links

Guarantee:

```text
one legacy School
→ at most one canonical Institution

legacy-backed Institution
→ one School
```

Native 영유:

```text
no School required
```

---

# 11. Institution Constraints

Must implement:

- canonical PK
- slug unique
- category checks
- bridge uniqueness
- required timestamps
- applicable indexes

No FK blast-radius rewrite.

---

# 12. Institution Backfill

Read-only preflight:

```text
school count
school type distribution
duplicate normalized names
duplicate slugs
null/inconsistent region
```

Then:

```text
legacy School
→ Institution
→ Link
```

Backfill is silent.

No public routes yet.

---

# 13. WP-01 Tests

- one School cannot map to two Institutions
- one legacy-backed Institution cannot map to two Schools
- native Institution without School allowed
- slug unique
- rollback safe
- backfill deterministic
- second backfill idempotent

---

# 14. WP-01 Exit

```text
[ ] Institution canonical table exists
[ ] legacy School bridge exists
[ ] native 영유 possible
[ ] backfill script dry-run works
[ ] constraints tested
```

---

# 15. WP-02 — Canonical Opportunity / Trust Schema

## Goal

Product-level Opportunity와 legacy Event bridge, Native version/evidence/history, canonical OpportunityChange를 만든다.

---

# 16. WP-02 Tables

Create target from `04_DATA_MODEL.md`:

```text
opportunities
opportunity_admission_event_links
opportunity_versions
opportunity_version_evidence
opportunity_changes
```

and Institution Fact target:

```text
institution_facts
institution_fact_versions
institution_fact_version_evidence
```

Exact names follow 04 target/repo convention.

---

# 17. Opportunity Bridge

Legacy-backed:

```text
Opportunity
↔ AdmissionEvent
```

Need composite consistency:

```text
Opportunity.institution
↔ linked Event cycle.school
```

04A required composite FK/constraint reinforcement.

Do not rely only on application validation.

---

# 18. Native Version Lineage

Dedicated lineage trigger.

Invariant:

```text
one current version
non-branching supersession
```

Do not reuse Event trigger blindly if table/type differs.

Reuse pattern, dedicated trigger.

---

# 19. Evidence Source Ownership

04A adjustment:

```text
Evidence.source_id
must equal Observation/Snapshot source ownership
```

DB composite FK or narrow trigger.

---

# 20. Opportunity Change

Canonical signal.

Legacy:

```text
MeaningfulChange
→ OpportunityChange
```

Native:

```text
OpportunityVersion diff
→ OpportunityChange
```

Consumers only canonical change.

---

# 21. Institution Fact

Implement selected P0 types only.

Do not over-normalize every Institution field.

---

# 22. WP-02 Backfill

Legacy admission events:

```text
Event
→ canonical Opportunity
→ Opportunity/Event link
```

Important:

```text
NO OpportunityPublished signal
NO Notification
NO customer Outbox
```

---

# 23. WP-02 Tests

Must include:

- Native Opportunity without Event
- Legacy-backed exact bridge
- composite FK consistency
- one current Version
- no lineage branching
- Evidence Source ownership
- Legacy MeaningfulChange mapping
- backfill zero Product signal
- Institution Fact lineage

---

# 24. WP-02 Exit

```text
[ ] canonical Opportunity exists
[ ] native/legacy both possible
[ ] Version/Evidence safe
[ ] OpportunityChange exists
[ ] silent backfill proven
```

---

# 25. WP-03 — Identity / Follow Schema

## Goal

Canonical User and Institution Follow model.

---

# 26. WP-03 Tables

Create:

```text
users
auth_identities
user_emails
user_profiles
user_interest_regions
user_interest_categories
consent_decisions
notification_preferences

follows
follow_episodes
```

Use exact 04 naming.

---

# 27. User Constraints

Must ensure:

```text
UNIQUE(provider, provider_subject)
```

but User PK independent.

Email:

- not global User identity
- current Email semantics
- delivery state

Consent:

append-only.

Preference:

channel current state.

---

# 28. Follow Constraints

```text
UNIQUE(user_id, institution_id)
```

FollowEpisode:

```text
one open episode per Follow
```

partial unique.

---

# 29. PII Delete Semantics

04A:

physical child-row delete:

```text
AuthIdentity provider subject
UserEmail
Profile
Interest
```

Opaque User anchor retained.

FKs must allow historical Follow/Delivery.

---

# 30. WP-03 Tests

- duplicate provider callback
- Email duplicate assumptions
- one Follow logical pair
- one open Episode
- activate/deactivate/reactivate
- signal interval query
- user delete PII child deletion
- historical references survive delete

---

# 31. WP-04 — Notification / Article / Redirect / Outbox Schema

## Goal

Canonical side-effect/history infrastructure.

---

# 32. Notification Tables

Create:

```text
notifications
notification_deliveries
notification_delivery_attempts
```

Constraints:

```text
one Notification per canonical signal/policy
one Delivery per Notification/User/Channel
provider/message lookup
```

---

# 33. Provider Ambiguity Representation

Do not change architecture unnecessarily.

Use:

```text
Attempt status STARTED
completed_at NULL
error_code PROVIDER_RESULT_UNKNOWN
```

as retry-blocking unresolved state.

Optional explicit enum later.

---

# 34. Article Tables

Create:

```text
articles
article_institutions
article_opportunities
url_redirects
```

Reuse admin_users author.

---

# 35. Outbox Hardening

Modify existing `outbox_events` additively.

Add as required:

```text
dedupe_key
max_attempts
locked_at
locked_by
last_error_code
last_error_at
dead_lettered_at
```

Maybe:

```text
available_at
attempt_count
```

already exists—reuse.

---

# 36. Outbox Migration Order

Critical:

```text
1 nullable columns
2 backfill existing rows
3 add indexes
4 validate constraints
5 canonical writers cutover
6 worker cutover
7 tighten nullability only if safe
```

No blind NOT NULL.

---

# 37. Outbox Dedupe Backfill

Existing rows need deterministic dedupe semantics by legacy event type.

If impossible:

- keep nullable for legacy rows
- enforce unique for new canonical subset with partial index

Prefer safety over fake dedupe.

---

# 38. WP-04 Tests

- Notification dedupe
- Delivery dedupe
- Attempt append
- provider message uniqueness
- unresolved timeout no immediate retry
- Article relation FK
- slug redirect uniqueness
- Outbox claim indexes
- legacy rows survive hardening

---

# 39. WP-05 — Application Foundation

## Goal

Schema 위에 reusable command/query infrastructure.

---

# 40. Module Layout

Recommended logical structure:

```text
src/modules/
  institution/
  admissions/
  trust/
  identity/
  follow/
  notification/
  editorial/
  analytics/
  admin/

src/infrastructure/
  db/
  auth/
  email/
  analytics/
  cache/
  logging/

src/app/
  ...
```

Exact paths may adapt to repo convention.

---

# 41. Repository Interfaces

Each module owns write/read repository boundary.

Avoid one giant DB repository.

---

# 42. Command Infrastructure

Implement:

```text
CommandContext
TransactionManager
ApplicationError
AuditWriter
OutboxWriter
```

---

# 43. Audit Writer

Critical Admin mutation same transaction.

Safe metadata only.

Reuse existing `audit_logs`.

---

# 44. Outbox Writer

```text
enqueue(eventType, aggregateId, payloadSafe, dedupeKey, tx)
```

must be transaction-aware.

---

# 45. Legal Policy Manifest

Implement server-only:

```text
TERMS_OF_SERVICE
PRIVACY_POLICY
SERVICE_EMAIL_UPDATES
```

with:

```text
version
effectiveAt
content reference/hash
```

Terms/Privacy rendering and signup validation share same source.

No DB legal table MVP.

---

# 46. WP-05 Tests

- nested transaction forbidden/avoided
- same tx passed
- Audit rollback with command
- Outbox rollback with command
- safe metadata
- legal manifest current version validation

---

# 47. WP-06 — Public Query Layer

## Goal

Public pages before UI polish.

---

# 48. Public Queries

Implement:

```text
getHomePage
listInstitutions
getInstitutionBySlug
getOpportunityBySlug
getArticleBySlug
```

with canonical DTOs.

---

# 49. Current Opportunity Projection

Must hide:

```text
NATIVE vs LEGACY
```

from public.

One projection.

---

# 50. Indexability Policy

Implement one central function/service used by:

- page metadata
- sitemap
- public relation rendering

---

# 51. Public DTO Safety

No:

- private User
- legacy Subscriber
- raw audit
- admin
- provider fields

---

# 52. WP-06 Tests

- Native/Legacy same DTO
- hidden/draft excluded
- Last Verified semantic
- official Source
- Article relation filtering
- no PII/private fields

---

# 53. WP-07 — Public Product Pages

## Goal

Core SEO/product discovery runtime.

---

# 54. Routes

Implement:

```text
/
 /institutions
 /institutions/[slug]
 /opportunities/[slug]
 /articles/[slug]
 /terms
 /privacy
```

---

# 55. Rendering

Use:

```text
Server Components
Cache Components where appropriate
```

No client API waterfall for core content.

---

# 56. Public Cache

Cache only public projection.

Do not include Follow state.

---

# 57. Home

Functional first:

- Hero
- current opportunities
- institution discovery
- articles
- Monitoring CTA

Visual polish later.

---

# 58. Institution List

Implement:

- category
- region
- search
- current admissions state

Filter URLs:

```text
noindex
canonical /institutions
```

---

# 59. Institution Detail

Must show:

- name/category/region
- current Opportunities
- verified Facts
- Source
- Last Verified
- Articles
- Follow placeholder/island

---

# 60. Opportunity Detail

Must show:

- Institution
- current state
- dates/action
- Source
- Last Verified
- recent Change
- Follow Institution CTA

---

# 61. Article Detail

Initially may use seeded Article before CMS UI complete.

Must render sanitized canonical HTML.

---

# 62. Legal Pages

Render from legal policy manifest.

---

# 63. WP-07 Tests

- SSR initial HTML
- 404 unknown slug
- no private cache
- canonical metadata later can be staged
- legal policy version visible

---

# 64. WP-08 — Kakao Auth / Session / Onboarding

## Goal

First real User.

---

# 65. User Session

Implement distinct:

```text
preppy_user_session
```

encrypted/authenticated HttpOnly.

Every protected request checks DB ACTIVE.

---

# 66. Pending Follow Intent

Implement:

```text
POST /api/auth/follow-intent
```

cookie:

```text
preppy_follow_intent
```

separate from OAuth state.

Limit payload.

---

# 67. OAuth Routes

```text
/auth/kakao/start
/auth/kakao/callback
```

Implement provider adapter.

Provider exchange outside DB tx.

---

# 68. OAuth State

Short-lived, one-time/replay-resistant.

---

# 69. New User

Callback:

```text
User PENDING
AuthIdentity
```

then onboarding.

---

# 70. Existing User

ACTIVE:

session + pending Follow completion.

---

# 71. Onboarding

Implement:

- required Terms
- Privacy
- optional Email service consent
- optional Email input
- optional profile
- pending Institution summary

---

# 72. Complete Signup

One shared transaction:

```text
Consent
Email/Profile
Preference
User ACTIVE
Follow
Episode
Audit/domain events
```

No nested tx.

---

# 73. Auth Security

Implement:

- return path allowlist
- same-site cookies
- state validation
- safe logs
- rate-limit adapter boundary

---

# 74. WP-08 Tests

- state mismatch
- callback replay
- duplicate provider subject
- existing ACTIVE user
- new PENDING user
- required consent missing
- stale policy version
- expired Follow intent
- Institution archived during OAuth
- signup commits despite invalid pending Follow
- signup+Follow atomic

---

# 75. WP-09 — Follow / My Preppy

## Goal

Activation loop 완성.

---

# 76. Follow API

Implement:

```text
GET /api/me/follows/status
POST /api/me/follows
DELETE /api/me/follows/{institutionId}
```

Anonymous status:

200 safe.

Private/no-store.

---

# 77. Follow Island

Client component states:

```text
anonymous
not following
following
loading
error
```

Anonymous click:

create intent → Kakao.

---

# 78. My Preppy

Route:

```text
/my-preppy
```

private Server Component.

No shared cache.

---

# 79. My Preppy Query

Show:

- followed institutions
- current/upcoming Opportunities
- recent Changes
- Last Verified/Source
- Email state

---

# 80. Profile / Preference

Implement:

```text
PATCH profile
GET/PATCH notification preference
```

Email missing state supported.

---

# 81. Account Delete

Implement now, not later.

`10A`/`11A` explicitly require traceability.

Flow:

```text
DELETE /api/me/account
→ DeleteUser transaction
→ clear session
→ optional provider unlink Outbox
```

---

# 82. WP-09 Tests

- double Follow
- reactivation
- Unfollow
- signal-time interval
- preference OFF leaves Follow
- no Email User
- stale session User DELETED
- Delete User removes PII
- pending Delivery suppression
- public cache contains no User state

---

# 83. WP-10 — Monitoring / Verification Application

## Goal

PREPPY's core trust engine.

---

# 84. Monitoring Queue Query

Implement query-driven.

No task table.

Output due/overdue.

---

# 85. ConfirmNoChange

Implement:

```text
Observation
Audit
last checked projection
```

No Version/Change/Notification/cache freshness.

---

# 86. VerifyOpportunity Command

One canonical command.

Server-owned `truth_mode`.

Strategies:

```text
NativeVerificationStrategy
LegacyVerificationStrategy
```

share same tx/orchestrator.

---

# 87. Verify Native

Atomic:

```text
lock
compare
new Version
Evidence
OpportunityChange
Audit
Outbox
```

---

# 88. Verify Legacy

Atomic:

```text
EventVersion
Evidence
MeaningfulChange if applicable
OpportunityChange
Audit
Outbox
```

No legacy Alert.

---

# 89. Materiality Policy

Central deterministic policy.

Admin override with reason.

---

# 90. Verify Institution Fact

Separate command.

No Email notification.

---

# 91. Source Failure

Commands:

```text
MarkSourceUnavailable
MarkSourceMoved
```

No truth mutation.

---

# 92. WP-10 Tests

Critical.

- Native verify happy path
- Legacy verify happy path
- same canonical Change contract
- concurrent verify stale version
- no-change zero Version
- source unavailable zero truth mutation
- materiality override audit
- Outbox insert failure rolls back truth
- Evidence Source mismatch rejected
- backfill emits zero signals

---

# 93. WP-11 — Admin Runtime

## Goal

1인 운영 가능.

---

# 94. Admin Auth

Separate cookie/session.

Use current `admin_users`.

Need real runtime.

Per request ACTIVE check.

---

# 95. Admin Route Guard

Private:

```text
/admin/*
/api/admin/*
```

Noindex/no-store.

---

# 96. Admin IA Minimum

Implement first:

```text
Dashboard
Monitoring
Institutions
Opportunities
Sources
Articles
Notifications
Users
Operations
```

UI functional, not polished.

---

# 97. Monitoring Admin First

First usable Admin screen.

Must allow:

- source open
- no change
- verify change
- source unavailable
- create/update Opportunity

---

# 98. Institution / Opportunity / Source Admin

CRUD-looking UI may exist, but mutation always typed command.

---

# 99. Audit

Show PII-safe history.

---

# 100. Admin Health

Implement:

```text
DB reachable
Outbox counts
oldest pending
stale processing
dead letter
Delivery failures
data quality
kill switches
```

Public health remains minimal.

---

# 101. CSRF / Same-origin

Central guard for cookie-auth mutation.

---

# 102. Rate-limit Boundary

Implement simplest deploy-compatible adapter.

Do not block whole project on external rate limit service.

---

# 103. WP-11 Tests

- User cookie cannot access Admin
- Admin cookie cannot act as User
- inactive Admin blocked
- direct CRUD route absent
- same-origin mutation guard
- audit on critical command
- Admin health no secrets

---

# 104. WP-12 — Notification / Worker / Email

## Goal

Monitoring loop externalizes value.

---

# 105. Create Notification from Signal

Implement:

```text
OpportunityPublished / OpportunityChange
→ Notification
→ recipient-resolution Outbox
```

idempotent.

---

# 106. Worker Runtime

Same repo separate process entry.

Must:

```text
WORKER_ENABLED
```

before claiming.

---

# 107. Outbox Claim

Short tx:

```text
FOR UPDATE SKIP LOCKED
→ PROCESSING
→ lease
→ attempt increment
COMMIT
```

---

# 108. Recipient Resolution

One event per Notification.

Query:

```text
FollowEpisode at signal time
User ACTIVE
Email usable
Consent
Preference
```

Create Delivery + send Outbox.

---

# 109. Send-time Revalidation

Immediately before Email send:

```text
User
Follow
Email
Consent
Preference
EMAIL_SEND_ENABLED
```

false → SUPPRESSED.

---

# 110. EmailSender

Provider-neutral interface first.

Implement:

```text
NoopEmailSender
TestEmailSender
RealEmailSender
```

Non-prod cannot use real customer recipients.

---

# 111. Delivery Attempt

Before provider:

STARTED.

Provider accepted:

ACCEPTED + provider message id.

Retryable proven failure:

FAILED_RETRYABLE.

Terminal:

FAILED_TERMINAL.

Unknown timeout:

STARTED unresolved + `PROVIDER_RESULT_UNKNOWN`.

---

# 112. Ambiguity Recovery

No blind retry.

Resolve by:

- provider idempotency
- status lookup
- webhook
- manual Admin

---

# 113. Email Webhook

Implement provider-specific adapter behind:

```text
/api/webhooks/email/{provider}
```

Must:

- verify signature raw body
- replay guard
- dedupe
- monotonic transition
- message ID lookup

---

# 114. Webhook Receipt

If provider has stable event ID, persist dedupe receipt.

If not, provider adapter-derived stable hash.

Exact table/field may be small target extension.

Do not overgeneralize.

---

# 115. Dead Letter

Worker transitions after max attempts.

Admin can retry only after fix.

---

# 116. Cache Revalidation Worker Event

Separate event path.

Worker calls protected internal route.

---

# 117. HMAC Revalidation

Implement:

```text
timestamp
body hash
HMAC
replay window
constant-time compare
```

No arbitrary paths/tags.

Handler maps event type → canonical revalidation.

---

# 118. Next.js Cache API

Use actual Next 16.3 API.

`revalidateTag` explicit profile.

Test runtime.

---

# 119. WP-12 Tests

Most critical integration tests:

- one Notification/signal
- duplicate resolver event
- one Delivery/User/channel
- Follow after signal excluded
- reactivated gap excluded
- preference off after resolver
- user delete after resolver
- Email missing
- worker crash lease recovery
- duplicate worker
- provider retry
- ambiguous timeout no blind resend
- webhook duplicate
- webhook out-of-order
- Email kill switch
- cache event HMAC invalid
- cache retry idempotent

---

# 120. WP-13 — Article CMS / SEO

## Goal

Acquisition loop.

---

# 121. Sanitizer First

Before CMS publish UI.

Implement server sanitizer.

Test:

- script
- event handlers
- javascript URL
- iframe policy
- malformed HTML

---

# 122. Article Application

Commands:

```text
CreateArticle
UpdateDraft
PublishArticle
Unpublish
Archive
ChangeSlug
```

---

# 123. Article Admin UI

Implement:

- title
- slug
- excerpt
- WYSIWYG
- HTML source
- SEO
- featured image URL/alt
- relations
- preview

Exact editor library after package selection.

---

# 124. Preview

Admin auth.

Sanitized.

Noindex.

---

# 125. Metadata Builder

Central.

Implement for:

```text
Home
Institution
Opportunity
Article
```

---

# 126. Indexability

One central policy.

Use in:

- metadata
- sitemap
- relation rendering

---

# 127. Sitemap / Robots

Single sitemap.

Noindex private/draft/filter.

---

# 128. Structured Data

Implement:

- BreadcrumbList
- Article
- Organization/EducationalOrganization
- selective Event

---

# 129. Redirect Resolver

On canonical route miss:

```text
lookup redirect
→ permanent
```

No chain.

Slug change flatten.

---

# 130. WP-13 Tests

- stored XSS
- preview noindex
- Article publish transaction
- relation validation
- slug redirect
- redirect chain prevention
- sitemap noindex exclusion
- no false freshness
- Event markup omitted when insufficient
- My Preppy/Admin absent sitemap

---

# 131. WP-14 — Analytics

## Goal

PMF measurement without blocking Product.

---

# 132. Typed Event Registry

Implement centralized types.

Required events only first.

---

# 133. Client Tracker

Production GA4 adapter.

Non-prod Noop/Test.

---

# 134. Server Tracker

Best-effort after commit.

No Analytics Outbox initially.

---

# 135. Event Ownership

Client:

```text
views
clicks
search/filter
```

Server:

```text
signup_complete
follow_created
additional_follow
notification_sent
```

---

# 136. PII Allowlist

Typed properties.

Prohibit raw query/Email/provider subject.

---

# 137. DB Metrics

Queries:

```text
AMP
Average Follow
Notification summary
Follow growth
```

---

# 138. Analytics Tests

- follow_click != follow_created
- duplicate Follow no second conversion
- signup complete only after commit
- non-prod no production GA4
- PII forbidden compile/runtime tests
- analytics failure product success

---

# 139. WP-15A / WP-15B — Seed, Rehearsal, Production Backfill & Cutover

## Goal

Legacy data를 canonical product로 연결.

---

# 140. WP-15A — Preflight / Non-production Rehearsal

Production mutation 전에 먼저 수행한다.

Read-only production preflight report:

```text
School count
duplicate names/slugs
Event count
current-version anomalies
Source bindings
Outbox existing rows
Subscriber/Alert rows
Guide/Update rows
```

No write.

---

# 141. Canonical Backfill Order

```text
1 Institution
2 Institution↔School
3 Opportunity
4 Opportunity↔Event
5 legacy historical mappings
6 Source bindings
7 Article migration only if verified necessary
```

User/Follow not auto-created from Subscriber.

---

# 142. Backfill Safety

Every import command:

```text
emitProductSignals=false
source=MIGRATION
```

Tests assert:

```text
Notification count unchanged
Delivery count unchanged
customer signal Outbox unchanged
```

---

# 143. Legacy URL Preflight

Because `/schools`, `/guides`, `/updates` runtime does not exist currently:

do not mass-create redirects unless production external URLs proven.

---

# 144. WP-15B — Production Canonical Cutover

**Hard dependency: WP-16A PASS evidence가 있어야 시작 가능.**

Production cutover 직전 fresh backup 성공을 다시 확인한다.

Sequence:

```text
fresh backup confirmation
→ additive production migration
→ canonical backfill
→ integrity/data validation
→ canonical reads
→ canonical writes
→ public routes
→ Admin canonical writes
→ new Notification path
→ smoke test
→ forward-fix / rollback decision
```

Legacy write retirement later.

`WP-15A` rehearsal 결과가 재현되지 않으면 Production cutover 금지.

---

# 145. WP-15 Tests

- idempotent backfill
- no duplicates
- FK/constraint validation
- no Product signals
- public projection parity
- rollback/re-run safety

---

# 146. WP-16A / WP-16B — Production Operations

## Goal

“works locally” → launch-safe.

---

# 147. WP-16A — Production Safety Readiness

**WP-15B production migration/backfill/cutover의 선행 조건이다.**

반드시 확보:

```text
automated backup + retention visibility
successful non-production restore drill
baseline structured error monitoring
worker/process monitoring baseline
migration runbook
secret management
non-production side-effect isolation
```

## Admin Auth Production

Verify actual IdP/session.

MFA if available, not blocker if secure internal auth otherwise.

---

# 148. Backup

Must configure managed backup or equivalent.

Need:

```text
retention
success visibility
restore target
```

---

# 149. Restore Drill

Actually restore into non-prod environment.

Run validation queries:

```text
Institution
Opportunity
Version
Follow
User
Notification
Article
Outbox
```

Document evidence.

---

# 150. Observability

Implement:

- structured logs
- error tracking
- uptime
- worker/process monitoring
- provider error monitoring

Vendor choice open.

---

# 151. Kill Switch Verification

Production test:

```text
EMAIL_SEND_ENABLED false
WORKER_ENABLED false
ANALYTICS_ENABLED false
```

effects as designed.

---

# 152. Secret Management

Production secrets outside repository.

No browser leak.

---

# 153. Non-prod Isolation

Verify:

- no real customer Email
- no prod analytics
- no prod provider side effects

---

# 154. Migration Runbook

Document:

```text
backup
preflight
migrate
validate
cutover
smoke
rollback/forward-fix
```

---

# 155. WP-16A / WP-16B Exit

## WP-16A Exit — before WP-15B

```text
[ ] Backup automated
[ ] Backup retention/success visibility confirmed
[ ] Restore drill passed in non-production
[ ] Baseline error monitoring active
[ ] Migration/worker observability active
[ ] Migration runbook ready
[ ] secrets safe
[ ] non-prod side effects isolated
```

## WP-16B Exit — after WP-15B

```text
[ ] Admin auth verified
[ ] production cutover smoke passed
[ ] post-cutover error monitoring clean/understood
[ ] uptime/process monitoring active
[ ] kill switches tested
[ ] provider operational checks passed
[ ] Admin operational health validated
[ ] launch evidence package complete
```

---

# 156. WP-17 — Full Vertical Slice

## Goal

PRD Definition of Done.

---

# 157. Vertical Slice Seed

Use controlled test records:

```text
1 Institution
1 Opportunity
1 Official Source
1 Article
1 User
```

Prefer real-ish but safe test data before production live.

---

# 158. Vertical Slice Flow A — Acquisition

```text
Article
→ Institution
→ Follow
→ Kakao
→ Signup
→ Follow ACTIVE
→ My Preppy
```

Verify Analytics:

```text
article_view
article_to_institution
follow_click
signup_start
signup_complete
follow_created
```

---

# 159. Vertical Slice Flow B — Monitoring

```text
Admin Monitoring Queue
→ Official Source
→ Verify Change
→ Version
→ Evidence
→ OpportunityChange
→ Outbox
```

---

# 160. Vertical Slice Flow C — Notification

```text
Recipient Resolution
→ Delivery
→ Email
→ Click
→ Opportunity
→ Return
```

---

# 161. Vertical Slice Negative Tests

Must simulate:

1. No Change
2. Follow after signal
3. Email OFF
4. User deleted
5. Source unavailable
6. worker crash
7. duplicate worker
8. provider timeout ambiguity
9. cache revalidation failure
10. analytics failure

---

# 162. Vertical Slice Pass Criteria

```text
[ ] exactly one canonical Version
[ ] Evidence correct
[ ] exactly one OpportunityChange
[ ] exactly one Notification
[ ] exactly one eligible Delivery
[ ] no ineligible Delivery send
[ ] Email deep link correct
[ ] public page updated
[ ] analytics non-blocking
[ ] audit trace complete
```

---

# 163. WP-18 — Launch Readiness

## Goal

Production release decision.

---

# 164. Product Gate

- Home
- Institution
- Opportunity
- Article
- Follow
- Signup
- My Preppy
- Monitoring
- Email

all live.

---

# 165. Data Gate

- target coverage seeded
- official Sources active
- verified Opportunities
- no blocking duplicate
- no version anomaly
- no backfill signal

---

# 166. Security Gate

- OAuth state
- User/Admin session separation
- no PII log
- sanitizer
- secret config
- CSRF/origin
- rate limit boundary

---

# 167. Reliability Gate

- hardened Outbox
- lease worker
- retry/dead-letter
- delivery dedupe
- send-time revalidation
- timeout ambiguity handling
- kill switch

---

# 168. Operations Gate

- backup
- restore evidence
- observability
- Admin health
- migration runbook
- worker monitoring

---

# 169. SEO Gate

- SSR
- metadata/canonical
- sitemap
- robots
- noindex private
- redirect resolver
- structured relations

---

# 170. Analytics Gate

- typed registry
- production config
- non-prod isolation
- AMP query
- core funnel events

---

# 171. Launch Decision

Launch only if:

```text
Vertical Slice PASS
AND
no BLOCKING data quality issues
AND
Outbox dead-letter understood/zero for launch path
AND
backup/restore proven
AND
production auth/provider config verified
```

---

# 172. Implementation Batches

Recommended batching by dependency.

## Batch 1 — Foundation

```text
WP-00
WP-01
WP-02
WP-03
WP-04
WP-05
```

## Batch 2 — Product Activation

```text
WP-06
WP-07
WP-08
WP-09
```

## Batch 3 — Core Monitoring

```text
WP-10
WP-11
WP-12
```

## Batch 4 — Acquisition / Measurement

```text
WP-13
WP-14
```

## Batch 5 — Rehearsal / Production Safety / Cutover

```text
WP-15A
→ WP-16A
→ WP-15B
→ WP-16B
→ WP-17
→ WP-18
```

**WP-15B cannot start without WP-16A evidence.**

Do not begin production cutover with unvalidated Batch 3 reliability or without backup/restore/observability readiness.

---

# 173. Parallelizable Work

After target schema contract is stable:

can parallelize:

```text
Public page shell
Admin page shell
Article editor research
Email provider adapter behind interface
Analytics adapter
```

Cannot safely parallelize without shared contract:

```text
schema migrations vs application repositories
Follow implementation vs User schema
Notification worker vs Outbox hardening
Admin verification UI vs Verify command
production backfill vs canonical constraints
```

---

# 174. Code Review Gates

Every canonical write PR/check should answer:

1. Which command owns the transaction?
2. Can retry duplicate state?
3. What DB constraint is final guard?
4. Does it emit Product signal?
5. Is signal suppressed for migration?
6. Is PII logged?
7. Does external network occur inside tx?
8. Is Audit required?
9. Is Outbox required?
10. What concurrency test exists?

---

# 175. Migration Review Gates

Every migration:

```text
Additive?
Backward compatible?
Backfill safe?
Constraint validation order?
Existing rows?
Rollback/forward fix?
Notification side effect?
```

No destructive shortcut.

---

# 176. Test Pyramid

## DB/Constraint Tests

Highest value early.

## Command Integration Tests

Most business correctness.

## Route Tests

Auth/error/security.

## E2E

Critical vertical slice only.

Avoid broad brittle UI E2E before core invariants.

---

# 177. Mandatory Concurrency Tests

Must exist before launch:

```text
duplicate Kakao callback
double Follow
Follow reactivation
two Verify submissions
duplicate Notification creation
two worker claimers
worker crash lease recovery
Preference OFF while send pending
Delete User while send pending
provider duplicate webhook
```

---

# 178. Mandatory Migration Tests

```text
fresh DB
legacy fixture DB
backfill twice
constraint validation
silent signal
cutover read
```

---

# 179. Mandatory Security Tests

```text
User cookie on Admin route
Admin cookie on User route
invalid OAuth state
tampered Follow intent
external returnPath
CSRF Origin mismatch
invalid internal HMAC
replayed internal request
invalid webhook signature
PII error/log serializer
stored XSS Article
```

---

# 180. Mandatory SEO Tests

```text
initial HTML
canonical
noindex
sitemap inclusion
filter exclusion
redirect
404
dateModified
Event structured data eligibility
```

---

# 181. Mandatory Analytics Tests

```text
click vs commit
duplicate transition
test Noop
PII property reject
analytics failure non-blocking
```

---

# 182. Do Not Implement Yet

Even if convenient:

```text
Crawler
LLM extraction
KakaoTalk messaging
Push
Mobile app
Review/community
Recommendation
Family/Child entity
Programmatic SEO
Data warehouse
Complex Admin RBAC
Scheduler UI
Bulk importer UI
Marketing email composer
Advertiser dashboard
Payment
```

---

# 183. Production Sequencing Amendment

Repository validation `12A` locked the production order:

```text
WP-15A
  read-only production preflight
  non-production rehearsal
  dry-run / idempotency / signal-silence evidence

→ WP-16A
  backup / retention
  restore drill
  baseline observability
  migration runbook
  secrets / side-effect isolation

→ WP-15B
  fresh backup confirmation
  production additive migration
  production backfill
  canonical cutover
  smoke / validation

→ WP-16B
  post-cutover operations validation
  provider / kill-switch / uptime / process checks
```

This is a hard execution dependency, not an optional note.

# 184. Production Provider Selection Timing

Provider decisions can happen while core modules are built, but interfaces first.

## Kakao

Needed before WP-08 completion.

## Email

Needed before WP-12 production completion.

## Analytics

Before WP-14 production.

## Observability

Before WP-16 exit.

Do not block schema/foundation on vendor choice.

---

# 184. Implementation Decision Log

If implementation discovers a repo constraint:

classify:

```text
IMPLEMENTATION_ADJUSTMENT
DATA_MODEL_AMENDMENT
API_CONTRACT_AMENDMENT
PRODUCT/ARCHITECTURE_AMENDMENT
```

Most issues should remain implementation adjustments.

Do not silently change Product semantics in code.

---

# 185. Stop Conditions

Pause broad implementation only if:

1. canonical invariant cannot be expressed safely in PostgreSQL
2. Native/Legacy bridge cannot preserve history/evidence
3. signup+Follow atomicity impossible under chosen DB abstraction
4. provider model fundamentally breaks Delivery idempotency
5. production migration reveals irreconcilable identifier collision
6. Product/PRD contradiction discovered

Otherwise continue with implementation adjustment.

---

# 186. MVP Delivery Risk Register

## Risk 1 — Transaction Fragmentation

Impact:

false partial states.

Mitigation:

WP-00/05 first.

## Risk 2 — Migration Signal Leakage

Impact:

mass wrong Email.

Mitigation:

explicit migration context + tests.

## Risk 3 — Worker Duplicate Send

Impact:

trust damage.

Mitigation:

Outbox/Delivery/Attempt idempotency + ambiguity handling.

## Risk 4 — Public Cache Privacy Leak

Impact:

PII/security.

Mitigation:

server public DTO + private island/no-store.

## Risk 5 — Admin Direct DB Bypass

Impact:

history/evidence corruption.

Mitigation:

typed commands only.

## Risk 6 — Production No Recovery

Impact:

data loss/outage.

Mitigation:

backup/restore/observability launch gate.

---

# 187. Definition of Implementation Complete

Implementation is complete only when:

```text
Canonical schema
+
Public product
+
Auth/Follow
+
My Preppy
+
Monitoring/Admin
+
Verification
+
Notification/Worker/Email
+
Article/SEO
+
Analytics
+
Backup/Observability
+
Vertical Slice
```

all pass.

Not when only UI renders.

---

# 188. Recommended Codex Execution Strategy After Validation

Do not give Codex the entire project as one implementation request.

After `12A` validation, execute in controlled phases:

```text
Phase 0
Foundation + DB transaction layer

Phase 1
Institution canonical migration

Phase 2
Opportunity/Trust canonical migration

Phase 3
Identity/Follow schema

Phase 4
Notification/Article/Outbox schema

Phase 5
Application command/query foundation

...
```

Each phase:

```text
read relevant docs
inspect repo
implement only phase
run tests
report changed files
report migration
report tests
report unresolved issues
STOP
```

Do not let Codex autonomously jump to next phase.

---

# 189. First Implementation Phase Recommendation

After `12A` passes, first actual code task should be:

> **Foundation / Transaction Infrastructure + Canonical Institution additive migration**

But if repository validation finds the transaction/pool change should be isolated first, execute:

```text
Phase 0A — DB runtime + transaction context
Phase 0B — Institution migration
```

Prefer smaller blast radius.

---

# 190. Implementation Completion Report Contract

Every Codex phase must report:

```text
Implemented:
...

Files Changed:
...

Migrations:
...

Tests Added/Changed:
...

Tests Run:
...

Result:
PASS / FAIL

Architecture Deviations:
NONE / ...

Implementation Adjustments:
...

Blockers:
...

Do Not Proceed Until:
...
```

---

# 191. Repository Validation Questions

Codex should validate this plan against actual repo and answer:

1. Is WP order correct for actual module/migration dependencies?
2. Should transaction/pool foundation be its own first phase?
3. Does any existing migration numbering/order change WP-01–04?
4. Can canonical schema be introduced in four additive migration groups safely?
5. Should Institution and Opportunity migration be combined or separated?
6. Is current test harness sufficient for constraint/concurrency tests?
7. Does current DB client require replacement or extension?
8. Are any existing writer paths active that must be frozen before backfill?
9. Can public read layer begin before all target schemas are complete?
10. Can Admin UI shell run in parallel without direct DB shortcuts?
11. Is Outbox hardening required before any canonical Notification writer?
12. What smallest vertical slice can be completed before full Article CMS?
13. Are backup/observability repo-external tasks correctly placed at WP-16?
14. Does the plan miss any production launch-critical repository task?
15. Does any work package accidentally require MVP non-scope infrastructure?
16. Is the recommended first coding phase the safest one?

---

# 192. Definition of Done

Implementation Plan is valid when:

- every PRD launch-critical requirement maps to a work package
- every API command/query has an implementation stage
- migrations precede dependent runtime
- transaction foundation precedes cross-module orchestration
- Outbox hardening precedes Email retry
- backfill is late and silent
- production operations precede launch
- vertical slice is explicitly tested
- non-scope remains excluded
- Codex can execute one bounded phase at a time

---

# 193. Next Artifact

Repository validation:

```text
12A_IMPLEMENTATION_PLAN_REPOSITORY_VALIDATION.md
```

If:

```text
VALID
or
VALID_WITH_IMPLEMENTATION_ADJUSTMENTS
```

and no plan amendment is required:

next artifact should NOT be another architecture document.

Next:

```text
CODEX_IMPLEMENTATION_PROMPT_PHASE_0.md
```

for the first real code implementation phase.
