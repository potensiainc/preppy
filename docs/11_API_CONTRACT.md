# 11_API_CONTRACT.md

> **Project:** PREPPY (프레피)  
> **Document Type:** API / Application Contract  
> **Status:** v1.0 — Repository validation required before implementation  
> **Validated Product Contract:** `10_PRD.md`  
> **Latest Validation:** `10A_PRD_REPOSITORY_VALIDATION.md` — VALID_WITH_IMPLEMENTATION_NOTES  
> **Runtime Target:** Next.js 16 App Router + TypeScript + PostgreSQL/Drizzle  
> **Architecture Style:** Modular Monolith  
> **Core Principle:** HTTP is an adapter; canonical business invariants live in typed application commands and queries.  
> **Purpose:** PREPPY MVP를 실제 코드로 구현하기 직전에 Public Web, Auth, Follow, My Preppy, Admin, Monitoring, Notification, Worker, Webhook, Cache Revalidation의 외부/내부 계약을 고정한다. 이 문서는 transport naming보다 command semantics, authorization, idempotency, transaction, error, privacy contract를 우선한다.

---

# 0. Document Role

`10_PRD.md`까지는 “무엇을 만들어야 하는가”를 정의했다.

이 문서는:

> **“그 기능이 어떤 application boundary를 통해 호출되고, 어떤 입력·출력·권한·transaction·error·idempotency 규칙을 가져야 하는가?”**

를 정의한다.

이 문서는 implementation plan이 아니다.

다음은 `12_IMPLEMENTATION_PLAN.md`에서 결정한다.

- 파일 단위 작업 순서
- migration 번호
- PR/commit 단위
- 테스트 구현 순서
- 실제 library/package 선택
- 배포 순서
- production cutover 명령

---

# 1. Contract Layers

PREPPY의 호출 경계는 네 층으로 나눈다.

```text
1. HTTP / Next.js Adapter
2. Application Command / Query
3. Domain + Repository
4. Infrastructure Adapter
```

예:

```text
POST /api/follows
→ ActivateFollowCommand
→ FollowRepository + InstitutionQuery
→ PostgreSQL
```

Email:

```text
Delivery Worker
→ SendEmailDeliveryCommand
→ EmailSender
→ External Provider
```

---

# 2. Core Rule: Route Is Not Business Logic

금지:

```text
Route Handler
→ db.update(...)
→ response
```

권장:

```text
Route Handler
→ authenticate/authorize
→ validate request
→ typed application command/query
→ map typed result/error
→ response
```

Business invariants:

- Follow unique/open episode
- Opportunity verification
- Evidence
- Notification eligibility
- Audit
- Outbox

는 Route에 구현하지 않는다.

---

# 3. API Surface Categories

MVP API surface:

```text
Public Read
Auth
Authenticated User
Admin
Internal Worker
Provider Webhook
Health
```

---

# 4. Public Read Strategy

SEO page data는 browser REST API를 통해 늦게 fetch하는 것을 기본으로 하지 않는다.

Public Server Components:

```text
Server Component
→ Public Query Service / DAL
→ PostgreSQL
```

사용.

즉 다음 page의 core data에는 public JSON API가 필수 아니다.

```text
/
 /institutions
 /institutions/{slug}
 /opportunities/{slug}
 /articles/{slug}
```

필요한 client interaction만 Route Handler 사용.

---

# 5. Why No Public REST Catalog First

MVP는:

- 외부 developer API 제품이 아님
- mobile app 없음
- public pages server-rendered

이므로 `/api/institutions` 전체 catalog REST를 먼저 만드는 것은 중복이다.

Public DAL/query contract를 먼저 고정한다.

향후 external/mobile API 필요 시 HTTP adapter 추가.

---

# 6. Common Transport Rules

JSON mutation API:

```text
Content-Type: application/json
```

Response envelope는 모든 endpoint에 강제하지 않는다.

성공:

```json
{
  "data": {}
}
```

형식을 사용할 수 있으나 Next Route Handler의 단순 HTTP semantics를 유지해도 된다.

중요한 것은 status/error contract 일관성.

---

# 7. Canonical Error Shape

Mutation/API error:

```json
{
  "error": {
    "code": "FOLLOW_NOT_ALLOWED",
    "message": "이 기관은 현재 업데이트 받기를 신청할 수 없습니다.",
    "correlationId": "uuid"
  }
}
```

optional:

```json
{
  "details": {}
}
```

단 `details`에:

- DB raw error
- stack
- SQL
- PII
- provider token

금지.

---

# 8. Error Classes

Canonical:

```text
VALIDATION_ERROR
UNAUTHENTICATED
FORBIDDEN
NOT_FOUND
CONFLICT
RATE_LIMITED
NOT_ELIGIBLE
RETRYABLE
EXTERNAL_PROVIDER_ERROR
INTERNAL_ERROR
```

---

# 9. HTTP Status Mapping

권장:

```text
400 VALIDATION_ERROR
401 UNAUTHENTICATED
403 FORBIDDEN / NOT_ELIGIBLE where permission-like
404 NOT_FOUND
409 CONFLICT
422 business input invalid where appropriate
429 RATE_LIMITED
502/503 EXTERNAL_PROVIDER_ERROR / RETRYABLE
500 INTERNAL_ERROR
```

Product-specific business codes는 `error.code`.

---

# 10. Correlation ID

모든 mutation request:

```text
correlation_id
```

server generated.

전달:

```text
Route response
Application context
Audit
Outbox payload where needed
Structured log
```

Client가 제공한 correlation ID를 canonical로 신뢰하지 않는다.

---

# 11. Idempotency Taxonomy

세 종류를 구분.

## Natural DB Idempotency

예:

```text
Activate Follow
```

DB unique + transition logic.

## Explicit Idempotency Key

외부 side-effect나 retryable internal API.

예:

```text
provider webhook
internal cache revalidation
```

## One-time OAuth State

Auth transaction.

---

# 12. Authentication Contexts

```text
AnonymousContext
UserContext
AdminContext
InternalWorkerContext
ProviderWebhookContext
```

서로 혼용하지 않는다.

---

# 13. Public User Session Contract

Session:

```text
HttpOnly
authenticated/encrypted
short-lived
```

contains minimum:

```text
user_id
issued_at
expires_at
```

Protected request:

```text
session parse
→ User lookup
→ status == ACTIVE
```

User status DB check를 매 요청 수행.

---

# 14. Admin Session Contract

Public User cookie와:

- cookie name
- signing/encryption purpose/key
- auth namespace

분리.

Admin protected request:

```text
session
→ admin_user_id
→ admin_users.status == ACTIVE
```

---

# 15. Internal Worker Authentication

Worker가 same-app protected endpoint를 호출할 경우:

```text
Internal Service Credential
```

사용.

예:

```text
POST /api/internal/cache/revalidate
```

브라우저 User/Admin session과 분리.

권장:

```text
HMAC/shared secret or deployment-level internal token
```

exact mechanism implementation decision.

---

# 16. Public Query Contracts

Public DAL은 아래 typed query를 제공한다.

```text
getHomePage()
listInstitutions(filters, pagination)
getInstitutionBySlug(slug)
getOpportunityBySlug(slug)
getArticleBySlug(slug)
getRelatedArticles(...)
getRelatedInstitutions(...)
getRelatedOpportunities(...)
```

---

# 17. `getHomePage`

Output logical DTO:

```ts
type HomePageDTO = {
  currentOpportunities: OpportunityCardDTO[];
  featuredInstitutions: InstitutionCardDTO[];
  latestArticles: ArticleCardDTO[];
  categories: CategoryEntryDTO[];
};
```

No private User state.

---

# 18. `listInstitutions`

Input:

```ts
type InstitutionListQuery = {
  category?: InstitutionCategory;
  region?: string;
  recruitmentState?: string;
  query?: string;
  page?: number;
  pageSize?: number;
};
```

Rules:

- allowlisted filters
- raw search not logged to analytics by default
- server pagination
- published/visible institutions only

---

# 19. Institution Card DTO

```ts
type InstitutionCardDTO = {
  id: string;
  slug: string;
  name: string;
  category: InstitutionCategory;
  region: string | null;
  currentAdmissionsState: string | null;
  currentOpportunity?: {
    id: string;
    slug: string;
    title: string;
    kind: OpportunityKind;
    state: OpportunityBusinessState;
    keyDate?: string | null;
  } | null;
  lastVerifiedAt?: string | null;
};
```

No `isFollowed` in shared cached DTO.

---

# 20. Institution Detail Query

```text
getInstitutionBySlug(slug)
```

Output:

- canonical Institution
- current/upcoming/recent Opportunities
- selected verified Facts
- official Sources
- relevant Last Verified
- related Articles
- SEO/indexability projection

Must not expose:

- legacy DB internals
- internal IDs except canonical UUID
- unpublished/private data

---

# 21. Opportunity Detail Query

Output:

```text
id
slug
institution
title
kind
businessState
key dates
target audience
summary
action URL
official Source
lastVerifiedAt
recent meaningful changes
related Articles
SEO projection
```

No legacy `admission_event_id` publicly required.

---

# 22. Article Detail Query

Output:

```text
id
slug
title
excerpt
sanitized contentHtml
author display
publishedAt
dateModified
featured image
related Institutions
related Opportunities
SEO
```

Public renderer MUST render sanitized canonical HTML only.

---

# 23. Follow Status Query

Public cached page cannot contain User-private Follow state.

Client island calls:

```text
GET /api/me/follows/status?institutionId={uuid}
```

or equivalent authenticated endpoint.

Response:

```json
{
  "data": {
    "authenticated": true,
    "following": true
  }
}
```

Anonymous:

either:

```text
401
```

or public-safe:

```json
{
  "data": {
    "authenticated": false,
    "following": false
  }
}
```

Choose one convention consistently.

Recommended MVP: 200 public-safe response to simplify island state.

---

# 24. Follow Mutation Endpoint

```text
POST /api/me/follows
```

Auth:

```text
User ACTIVE
```

Input:

```json
{
  "institutionId": "uuid"
}
```

Application command:

```text
ActivateFollow
```

---

# 25. ActivateFollow Result

```ts
type ActivateFollowResult = {
  followId: string;
  institutionId: string;
  state: "ACTIVE";
  activatedAt: string;
  created: boolean;
  reactivated: boolean;
  activeFollowCount: number;
};
```

`created=false` and already ACTIVE can still be 200 idempotent success.

---

# 26. Follow Error Codes

```text
INSTITUTION_NOT_FOUND
INSTITUTION_NOT_FOLLOWABLE
USER_NOT_ACTIVE
FOLLOW_CONFLICT
```

---

# 27. Unfollow Endpoint

```text
DELETE /api/me/follows/{institutionId}
```

Command:

```text
DeactivateFollow
```

Idempotent:

already INACTIVE / no active relation:

```text
204 or 200 no-op
```

recommended:

```text
204
```

---

# 28. Follow Transaction Contract

Activate:

```text
BEGIN
lock/validate User ACTIVE
validate Institution followable
get/create logical Follow
lock existing Follow
if inactive:
  activate
  open FollowEpisode
if active:
  no duplicate Episode
derive activeFollowCount
COMMIT
```

Analytics after commit.

---

# 29. Pending Follow Intent API

Anonymous CTA must not create Follow.

Recommended:

```text
POST /api/auth/follow-intent
```

Input:

```json
{
  "institutionId": "uuid",
  "context": "INSTITUTION",
  "articleId": "uuid optional",
  "opportunityId": "uuid optional",
  "returnPath": "/institutions/..."
}
```

Server:

- validates Institution
- allowlists context
- normalizes attribution
- creates encrypted/authenticated short-lived cookie
- returns Kakao auth start URL or success

---

# 30. Pending Follow Intent Does Not Equal OAuth State

Separate cookies/state:

```text
preppy_follow_intent
preppy_oauth_state
```

or equivalent distinct cryptographic payloads.

---

# 31. Kakao Auth Start

```text
GET /auth/kakao/start
```

Responsibilities:

- generate OAuth state
- persist short-lived state
- construct provider auth URL
- redirect

Must not create User/Follow yet.

---

# 32. Kakao Callback

```text
GET /auth/kakao/callback
```

Input:

```text
code
state
provider error parameters
```

Flow:

```text
validate state
exchange code
resolve provider identity
find/create User/AuthIdentity
```

External network outside business transaction.

---

# 33. Existing ACTIVE User Callback

```text
AuthIdentity exists
User ACTIVE
→ session
→ if valid PendingFollowIntent:
   ActivateFollow
→ redirect
```

If Follow already active: idempotent.

---

# 34. New User Callback

```text
no AuthIdentity
→ transaction create User(PENDING)+AuthIdentity
→ session/onboarding context
→ /onboarding
```

Do not activate Follow before required consent.

Pending intent preserved through onboarding.

---

# 35. Onboarding Query

```text
GET /api/me/onboarding
```

returns:

```text
User status
provider email candidate presence
required consent state
optional profile defaults
pending follow target summary
```

No provider token.

---

# 36. Complete Signup Endpoint

```text
POST /api/me/onboarding/complete
```

Input:

```json
{
  "consents": [
    {
      "type": "TERMS_OF_SERVICE",
      "decision": "GRANTED",
      "policyVersion": "..."
    },
    {
      "type": "PRIVACY_POLICY",
      "decision": "GRANTED",
      "policyVersion": "..."
    }
  ],
  "serviceEmailUpdatesConsent": true,
  "email": "optional",
  "childBirthYear": "optional",
  "interestRegions": [],
  "interestCategories": []
}
```

Exact shape can separate consent array; semantic requirements fixed.

---

# 37. Complete Signup Transaction

```text
BEGIN
lock User PENDING
validate required consent policy versions
append ConsentDecision
upsert Email/Profile/Interests
set Email Preference based on valid consent/email
User → ACTIVE
if valid PendingFollowIntent:
  Activate Follow in same transaction orchestration
Audit/domain events
COMMIT
```

Server analytics after commit.

---

# 38. Signup Result

```json
{
  "data": {
    "userState": "ACTIVE",
    "follow": {
      "institutionId": "uuid",
      "active": true
    },
    "redirectTo": "/my-preppy"
  }
}
```

If pending Institution is no longer followable:

- User activation still succeeds
- Follow omitted
- safe message/code returned

---

# 39. My Preppy Query

```text
GET /api/me/preppy
```

or direct private Server Component query.

Preferred:

```text
private Server Component
→ MyPreppyQueryService
```

No browser API required for initial page.

Logical DTO:

```text
followed Institutions
current/upcoming Opportunities
recent Changes
source/verified context
effective Email state
Profile
```

---

# 40. Profile Update

```text
PATCH /api/me/profile
```

Input only:

```text
childBirthYear?
interestRegions?
interestCategories?
```

No child name/exact birthday.

---

# 41. Email Preference Query

```text
GET /api/me/notification-preferences
```

Response:

```text
EMAIL requested preference
effective email state
consent state
email state
reason if unavailable
```

---

# 42. Email Preference Update

```text
PATCH /api/me/notification-preferences/email
```

Input:

```json
{
  "enabled": true
}
```

Enable requires:

```text
User ACTIVE
usable Email
effective SERVICE_EMAIL_UPDATES consent
```

Disable is idempotent.

---

# 43. Consent Revocation

Recommended:

```text
POST /api/me/consents/service-email/revoke
```

Command:

```text
RevokeServiceEmailConsent
```

Atomic:

- append REVOKED decision
- disable Email preference
- audit/user event where appropriate

---

# 44. Email Update

Recommended:

```text
PUT /api/me/email
```

Flow:

- validate normalized email
- create/update candidate
- verification if policy requires
- new Email not usable until required verification
- previous address no longer resolved for future sends after cutover

Exact verification flow implementation decision.

---

# 45. Account Delete Endpoint

```text
DELETE /api/me/account
```

High-risk mutation.

Requires:

- authenticated ACTIVE User
- explicit confirmation
- CSRF/origin protection

---

# 46. DeleteUser Command

Atomic semantic:

```text
User → DELETED
remove/revoke AuthIdentity PII
delete UserEmail/Profile/Interest PII
disable Preferences
close active Follows/Episodes
suppress pending deliveries
audit
COMMIT
```

Then clear session.

Opaque history may remain.

---

# 47. Account Delete Result

```text
204
```

No deleted profile returned.

---

# 48. Admin API Base

Recommended:

```text
/api/admin/*
```

Every endpoint:

```text
requireAdminActive()
```

before command/query.

Admin pages themselves:

```text
/admin/*
```

Server Components query admin services.

---

# 49. Admin Query Endpoints

If Admin UI is Server Component-driven, read APIs are optional.

Logical query services are mandatory:

```text
getAdminDashboard
getMonitoringQueue
getInstitutionAdminDetail
getOpportunityAdminDetail
getSourceAdminDetail
getArticleAdminDetail
getNotificationAdminDetail
getUserSupportDetail
getOutboxAdminQueue
getAuditTrail
getAdminHealth
```

---

# 50. Admin Dashboard DTO

Operational first:

```text
monitoring due/overdue
P0 due
source failures
pending/dead-letter Outbox
failed/suppressed Delivery
data quality counts
AMP/Average Follow
safe external analytics availability
```

---

# 51. Monitoring Queue Query

Input:

```text
priority?
dueState?
category?
region?
sourceHealth?
page?
```

Output row:

```text
source
binding target
Institution
priority
last checked
next due
reason
current Opportunity state
source health
follow count optional
```

---

# 52. Confirm No Change Endpoint

```text
POST /api/admin/monitoring/sources/{sourceId}/no-change
```

Input:

```json
{
  "expectedContextVersion": "optional",
  "note": "optional"
}
```

Command:

```text
ConfirmNoChange
```

---

# 53. ConfirmNoChange Result

```text
Observation ID
checkedAt
nextDueAt projection
```

MUST NOT return/create:

- Version
- OpportunityChange
- Notification

---

# 54. Mark Source Unavailable

```text
POST /api/admin/sources/{sourceId}/unavailable
```

Input:

```text
reason/outcome
safe note
```

No Opportunity truth mutation.

---

# 55. Mark Source Moved

```text
POST /api/admin/sources/{sourceId}/moved
```

Input:

```json
{
  "newUrl": "https://..."
}
```

Command decides:

- correction same Source
- create new Source + retire/move old

Admin may be presented with explicit choice if ambiguous.

---

# 56. Create Institution

```text
POST /api/admin/institutions
```

Command:

```text
CreateInstitution
```

Input:

```text
name
category
region
slug
description optional
official source optional for Draft
```

---

# 57. Update Institution Profile

```text
PATCH /api/admin/institutions/{id}
```

Stable root fields only.

Verified facts use separate command.

---

# 58. Publish Institution

```text
POST /api/admin/institutions/{id}/publish
```

Validates:

- slug
- category/region
- meaningful profile
- official Source
- duplicate/canonical constraints

Post-commit cache/sitemap revalidation.

---

# 59. Institution Close/Archive

Separate:

```text
POST /api/admin/institutions/{id}/close
POST /api/admin/institutions/{id}/archive
```

No hard delete.

---

# 60. Verify Institution Fact

```text
POST /api/admin/institutions/{id}/facts/{factType}/verify
```

Input:

```json
{
  "expectedCurrentVersionId": "uuid optional",
  "value": {},
  "sourceId": "uuid",
  "evidence": {},
  "note": "optional"
}
```

No-change should use separate check path rather than force new Version.

---

# 61. Create Native Opportunity

```text
POST /api/admin/opportunities
```

Input:

```text
institutionId
kind
title
slug
initial draft data
```

Creates Draft/root only unless explicit verify+publish command follows.

---

# 62. Verify Native Opportunity

```text
POST /api/admin/opportunities/{id}/verify
```

Input:

```json
{
  "expectedCurrentVersionId": "uuid|null",
  "proposedState": {},
  "sourceId": "uuid",
  "evidence": {},
  "materialityOverride": "optional",
  "overrideReason": "required if override"
}
```

---

# 63. Verify Native Transaction

```text
BEGIN
lock Opportunity/current
validate truth_mode=NATIVE
validate Source binding/Evidence
compare
if no meaningful truth change:
  reject to ConfirmNoChange or return NO_CHANGE
else:
  new Version
  Evidence
  OpportunityChange if material
  Audit
  required Outbox
COMMIT
```

---

# 64. Verify Legacy Opportunity

Can share same endpoint:

```text
POST /api/admin/opportunities/{id}/verify
```

Application dispatches based on `truth_mode`.

Preferred HTTP contract:

```text
one canonical opportunity verify endpoint
```

not separate native/legacy endpoints.

This keeps transport product-centric.

---

# 65. Publish Opportunity

```text
POST /api/admin/opportunities/{id}/publish
```

Validates:

- verified current truth
- Evidence
- Institution
- title/kind/slug
- publication rules

First live publish may generate canonical signal.

Backfill/import cannot call this live command in signal-enabled mode.

---

# 66. Opportunity Hide/Archive

```text
POST /api/admin/opportunities/{id}/hide
POST /api/admin/opportunities/{id}/archive
```

No hard delete.

---

# 67. Article Create

```text
POST /api/admin/articles
```

Creates Draft.

---

# 68. Article Draft Update

```text
PUT /api/admin/articles/{id}/draft
```

Input:

```text
title
slug draft suggestion
excerpt
raw editor content
SEO
featured image
relations
```

Raw content is not automatically public.

---

# 69. Article Preview

Recommended:

```text
GET /admin/articles/{id}/preview
```

Admin-auth page.

Server:

- read draft
- sanitize
- render
- noindex

No public API required.

---

# 70. Publish Article

```text
POST /api/admin/articles/{id}/publish
```

Command:

```text
PublishArticle
```

Input can include:

```text
expectedUpdatedAt/version
```

Server:

- sanitize
- validate relations
- validate SEO
- persist canonical sanitized HTML
- audit
- commit
- enqueue/retry cache/sitemap revalidation

---

# 71. Change Article Slug

```text
POST /api/admin/articles/{id}/change-slug
```

Input:

```json
{
  "newSlug": "..."
}
```

Atomic:

- validate
- update
- redirect old → final canonical
- flatten chain
- audit

---

# 72. Unpublish/Archive Article

```text
POST /api/admin/articles/{id}/unpublish
POST /api/admin/articles/{id}/archive
```

Public route behavior follows SEO policy.

---

# 73. Notification Admin Cancel

```text
POST /api/admin/notifications/{id}/cancel
```

Only pending/not fully sent semantics.

Reason required.

Already sent delivery unchanged.

---

# 74. Retry Delivery

```text
POST /api/admin/deliveries/{id}/retry
```

Command:

```text
RetryDelivery
```

Requires:

- failed/retryable state
- no unresolved provider accepted ambiguity unless reconciled
- current send eligibility
- idempotency

Does not create duplicate logical Delivery.

---

# 75. Retry Outbox Event

```text
POST /api/admin/outbox/{id}/retry
```

Allowed:

- FAILED
- DEAD_LETTER after underlying issue fixed
- stale recovery via worker policy

Disallowed by default:

- PROCESSED

Reason/audit required.

---

# 76. Cancel Outbox Event

```text
POST /api/admin/outbox/{id}/cancel
```

Only events safe to cancel.

Cannot cancel event whose required side effect already succeeded.

Application-level event-type policy decides.

---

# 77. Admin User Lookup

Recommended:

```text
POST /api/admin/users/search
```

instead of query-string GET for exact email lookup.

Input:

```json
{
  "email": "..."
}
```

Server:

- normalize
- exact lookup
- do not log raw body
- audit actor/purpose/result count

Response PII minimized.

---

# 78. Admin Delete User Support

```text
DELETE /api/admin/users/{id}
```

Requires explicit support reason.

Calls same canonical `DeleteUser`.

No alternate DB path.

---

# 79. Admin Consent

Read-only query only.

No endpoint:

```text
grant-consent
```

for Admin.

---

# 80. Admin Follow Support

Read-only by default.

If support-required:

```text
DELETE /api/admin/users/{userId}/follows/{institutionId}
```

calls canonical DeactivateFollow.

No Admin create Follow in MVP.

---

# 81. Admin Health

Recommended:

```text
GET /api/admin/operations/health
```

returns safe:

```text
database reachable
outbox pending count
oldest pending age
stale processing count
dead-letter count
failed delivery count
data-quality blocking count
kill-switch booleans
```

No secrets.

---

# 82. Public Health

Existing:

```text
GET /api/health
```

Keep minimal:

```json
{
  "status": "ok",
  "service": "preppy"
}
```

No DB/provider details publicly.

---

# 83. Internal Cache Revalidation Endpoint

Validated 06A model:

```text
POST /api/internal/cache/revalidate
```

Auth:

```text
InternalWorkerContext
```

Input typed allowlist:

```json
{
  "eventType": "OPPORTUNITY_CHANGED",
  "institutionId": "uuid",
  "opportunityId": "uuid"
}
```

Handler maps to:

```text
revalidateTag
revalidatePath
```

No arbitrary user-provided path/tag.

---

# 84. Cache Revalidation Idempotency

Calling same event multiple times is safe.

No Product state changes.

Failure:

```text
retry Outbox
```

---

# 85. Email Provider Webhook

Recommended namespace:

```text
POST /api/webhooks/email/{provider}
```

Auth:

- provider signature verification
- timestamp/replay controls where supported

No User/Admin session.

---

# 86. Email Webhook Canonical Mapping

Provider event maps by:

```text
provider_message_id
→ DeliveryAttempt
→ NotificationDelivery
```

Do not resolve by raw email.

Canonical events:

```text
DELIVERED
OPENED
CLICKED
BOUNCED
COMPLAINED
FAILED
```

Adapter maps provider-specific taxonomy.

---

# 87. Webhook Idempotency

Store/derive unique provider event identity when available.

Duplicate webhook:

```text
no duplicate state transition side effects
```

Out-of-order webhook must not regress terminal state blindly.

---

# 88. Email Link / Unsubscribe

Preferred MVP:

```text
Email footer → /my-preppy
```

Optional one-click/service-unsubscribe:

```text
GET confirmation page
POST signed scoped action
```

Do not put raw User ID/email in URL.

If provider/list-unsubscribe requirements demand headers, adapter handles while preserving canonical preference command.

---

# 89. Worker Command Contracts

Worker does not call arbitrary Route Handlers for DB work if it shares repository/application code.

Same repo worker directly invokes:

```text
ProcessRecipientResolution
ProcessDeliverySend
ProcessCacheRevalidation
```

Application/infrastructure services.

Only Next cache API requires same-app protected HTTP adapter if runtime separation prevents direct call.

---

# 90. Outbox Claim Contract

Logical:

```text
claimBatch(eventTypes, limit, workerId, now)
```

Transaction:

```text
SELECT ...
FOR UPDATE SKIP LOCKED
```

mark:

```text
PROCESSING
locked_at
locked_by
attempt_count
```

commit before network.

---

# 91. Outbox Completion

```text
complete(eventId)
retry(eventId, availableAt, safeError)
deadLetter(eventId, safeError)
```

All transition-aware/idempotent.

---

# 92. Recipient Resolution Command

Input:

```text
notification_id
signal_published_at
```

Query:

```text
FollowEpisode at signal time
User current ACTIVE
Email/consent/preference current
```

Creates:

```text
NotificationDelivery
delivery Outbox
```

unique constraints make retry safe.

---

# 93. Delivery Send Command

Input:

```text
delivery_id
```

Flow:

```text
load Delivery
recheck User/Follow/Email/Consent/Preference
if ineligible:
  SUPPRESSED
else:
  create Attempt
  resolve current Email
  commit/pre-send state
  call EmailSender
  reconcile result
```

Provider network outside long DB transaction.

---

# 94. Provider Timeout Result

Canonical:

```text
AMBIGUOUS
```

or retry-blocking Attempt error semantic may be used.

Must not blindly immediate retry until provider idempotency/reconciliation policy permits.

---

# 95. Application Commands Catalog

## Identity

```text
ResolveOrCreateUserFromKakaoIdentity
CompleteSignup
UpdateProfile
UpdateUserEmail
UpdateEmailPreference
RevokeServiceEmailConsent
DeleteUser
```

## Follow

```text
ActivateFollow
DeactivateFollow
```

## Institution

```text
CreateInstitution
UpdateInstitutionProfile
PublishInstitution
CloseInstitution
ArchiveInstitution
VerifyInstitutionFact
```

## Opportunity

```text
CreateNativeOpportunity
VerifyOpportunity
PublishOpportunity
HideOpportunity
ArchiveOpportunity
```

## Monitoring/Source

```text
ConfirmNoChange
CreateSource
UpdateSource
BindSource
UnbindSource
MarkSourceUnavailable
MarkSourceMoved
```

## Article

```text
CreateArticle
UpdateArticleDraft
PublishArticle
UnpublishArticle
ArchiveArticle
ChangeArticleSlug
```

## Notification

```text
CreateNotificationFromSignal
ResolveNotificationRecipients
SendEmailDelivery
CancelNotification
RetryDelivery
```

## Operations

```text
ClaimOutboxBatch
RetryOutboxEvent
CancelOutboxEvent
ProcessCacheRevalidation
```

---

# 96. Query Services Catalog

```text
PublicHomeQuery
InstitutionListQuery
InstitutionDetailQuery
OpportunityDetailQuery
ArticleDetailQuery

CurrentUserQuery
FollowStatusQuery
MyPreppyQuery
NotificationPreferenceQuery

AdminDashboardQuery
MonitoringQueueQuery
InstitutionAdminQuery
OpportunityAdminQuery
SourceAdminQuery
ArticleAdminQuery
NotificationAdminQuery
UserSupportQuery
OutboxAdminQuery
AuditQuery
AdminHealthQuery
```

---

# 97. Command Context

All application commands receive context.

User:

```ts
type UserCommandContext = {
  userId: string;
  correlationId: string;
  occurredAt: Date;
};
```

Admin:

```ts
type AdminCommandContext = {
  adminUserId: string;
  correlationId: string;
  occurredAt: Date;
  reason?: string;
};
```

System:

```ts
type SystemCommandContext = {
  source: "WORKER" | "MIGRATION" | "WEBHOOK";
  correlationId: string;
  occurredAt: Date;
};
```

---

# 98. Migration Context

Migration/backfill must use explicit:

```text
source=MIGRATION
emitProductSignals=false
```

semantic.

It must not invoke live publish command in default signal-enabled mode.

---

# 99. Validation Boundary

Request validation:

```text
Route Handler Zod/schema
```

Domain/business validation:

```text
Application Command
```

Example:

Route:

```text
UUID format valid
```

Command:

```text
Institution followable?
```

---

# 100. Transaction Ownership

Command/application service owns transaction.

Route Handler must not start nested ad-hoc transactions around multiple commands unless defined orchestration requires it.

---

# 101. Signup + Follow Orchestration

`CompleteSignup` is allowed to coordinate Identity + Follow in one DB transaction because Modular Monolith shares PostgreSQL.

No distributed transaction.

---

# 102. Verify Opportunity Orchestration

One command owns:

```text
Version
Evidence
OpportunityChange
Audit
required Outbox
```

atomic transaction.

---

# 103. Article Publish Transaction

Owns:

```text
sanitized HTML
SEO
relations
publication
Audit
```

Cache/sitemap side effect post-commit.

---

# 104. Delete User Transaction

Owns canonical delete semantics and Follow closure/suppression coordination.

---

# 105. Read Consistency

Public page reads canonical committed state only.

Admin draft reads may see Draft.

Notification worker reads current committed eligibility.

No eventual-consistency cache used for send eligibility.

---

# 106. Cache Rule

Never use public cache for:

```text
User Follow state
My Preppy
Admin
Consent
Email
Delivery eligibility
```

---

# 107. Pagination Contract

List APIs/queries:

```text
page/pageSize
```

MVP offset pagination acceptable.

Defaults/max:

implementation config.

Server must cap max page size.

---

# 108. Sorting Contract

Only allowlisted fields.

No arbitrary SQL field/order from query.

---

# 109. Filter Contract

Only canonical enums/region codes.

Unknown value:

```text
400
```

or ignored only if explicitly designed.

Prefer validation error.

---

# 110. Search Contract

Institution search:

- normalized text
- result limited
- no raw query analytics by default

No external search engine.

---

# 111. Privacy in Responses

Public DTO must never include:

- User info
- Admin info
- raw audit
- provider subject
- internal Source credentials
- legacy subscriber data

User endpoints only self.

Admin endpoints privileged.

---

# 112. Privacy in Errors

Never echo:

- raw email unnecessarily
- OAuth code/state
- provider response
- SQL value
- child profile

---

# 113. Rate Limit Targets

At minimum:

```text
auth start/callback
Follow mutation
Email preference
Account delete
Admin auth
provider webhook
```

Exact limiter implementation belongs to implementation plan.

---

# 114. CSRF / Origin

Authenticated state-changing endpoints:

```text
POST/PATCH/PUT/DELETE
```

must apply framework/origin/CSRF protections appropriate to cookie auth.

Webhook/internal endpoints use signature/service auth, not CSRF.

---

# 115. Audit Requirements by Command

Admin audit required:

```text
Publish/Archive/Close Institution
Verify Opportunity
Publish/Hide/Archive Opportunity
Verify Fact
Source bind/move/unavailable
Publish/Unpublish/Slug Article
Cancel Notification
Retry Delivery
Retry/Cancel Outbox
Support Delete/Suspend/Unfollow
Materiality override
```

User self-service activity may be recorded in domain history/analytics and does not require Admin audit.

---

# 116. Analytics Trigger Map

Client:

```text
follow_click
page views
search/filter
article navigation
```

Server after commit:

```text
signup_complete
follow_created
additional_follow
notification_sent
```

No analytics network inside DB transaction.

---

# 117. Follow Created Analytics

ActivateFollow command returns transition info:

```text
created
reactivated
activeFollowCount
```

Server adapter decides:

```text
follow_created
additional_follow
```

after commit.

---

# 118. Notification Sent Analytics

Trigger only after canonical Delivery transitions to SENT.

Provider webhook DELIVERED is separate.

---

# 119. SEO Revalidation Event Map

Examples:

```text
INSTITUTION_PUBLISHED
INSTITUTION_UPDATED
OPPORTUNITY_PUBLISHED
OPPORTUNITY_CHANGED
ARTICLE_PUBLISHED
ARTICLE_UPDATED
ARTICLE_SLUG_CHANGED
```

No-change does not emit.

---

# 120. API Versioning

MVP does not need `/api/v1`.

Internal contracts evolve in one product/repo.

If external public API emerges later, version separately.

---

# 121. OpenAPI

MVP does not require OpenAPI as source of truth before implementation.

TypeScript typed command/query schemas are primary.

OpenAPI may be generated later if external clients appear.

---

# 122. API Testing Contract

## Unit

- request schema
- error mapping
- authorization helper
- DTO mapper
- idempotency decision

## Integration

- DB transaction
- Follow idempotency
- signup+Follow
- Verify atomicity
- Backfill silence
- Delivery dedupe
- User delete
- audit same transaction

## Route

- auth guard
- status mapping
- no PII errors
- CSRF/origin
- internal/webhook auth

## E2E

- Article→Follow→Kakao mock→My Preppy
- Admin verify→Outbox→Email fake→Return

---

# 123. External Adapter Contracts

## KakaoAuthProvider

```text
buildAuthorizationUrl
exchangeCode
resolveIdentity
```

Returns normalized provider identity.

## EmailSender

```text
send(message, idempotencyContext)
```

returns:

```text
accepted
providerMessageId
or typed failure/ambiguity
```

## AnalyticsTracker

```text
track(event, props)
```

non-blocking.

## CacheRevalidator

```text
revalidate(event)
```

retryable.

---

# 124. Email Message DTO

```text
to current resolved address
template type
Institution
Opportunity
change summary
deep link
settings link
delivery id / provider metadata
```

No child/private profile.

---

# 125. Webhook Adapter Contract

Provider webhook adapter must output canonical:

```ts
type EmailProviderEvent = {
  providerEventId?: string;
  providerMessageId: string;
  type:
    | "DELIVERED"
    | "OPENED"
    | "CLICKED"
    | "BOUNCED"
    | "COMPLAINED"
    | "FAILED";
  occurredAt: Date;
  metadataSafe?: Record<string, unknown>;
};
```

---

# 126. Admin Mutation Response Contract

Successful critical command can return:

```json
{
  "data": {
    "id": "uuid",
    "state": "...",
    "correlationId": "uuid"
  }
}
```

Allows operator trace.

---

# 127. Conflict Response

Example:

```json
{
  "error": {
    "code": "STALE_VERSION",
    "message": "다른 변경이 먼저 반영되었습니다. 최신 상태를 다시 확인해 주세요.",
    "correlationId": "uuid",
    "details": {
      "currentVersionId": "uuid"
    }
  }
}
```

No internal DB details.

---

# 128. Notification Preview Contract

Admin query/action:

```text
POST /api/admin/notifications/preview
```

Input:

```text
opportunity/change context
```

Output:

```text
rendered subject/body preview
estimated eligible follower count
deep link
```

Does not create Notification/Delivery/Outbox.

Optional MVP but useful safety feature.

---

# 129. Test Send Contract

If implemented:

```text
POST /api/admin/notifications/test-send
```

Restrictions:

- allowlisted Admin email
- TEST marker
- no canonical customer Delivery
- no production analytics

P1 acceptable; not launch-blocking if preview exists.

---

# 130. Legal Page Contract

`/terms`, `/privacy`:

- public server-rendered
- version identifiers used by Consent
- current effective policy version retrievable by onboarding

Recommended internal query:

```text
getCurrentLegalPolicyVersions()
```

Do not hardcode consent version only in frontend bundle.

---

# 131. Consent Policy Version Contract

CompleteSignup must reject unknown/stale required policy version.

Possible error:

```text
CONSENT_POLICY_UPDATED
```

Client reloads latest terms/privacy.

---

# 132. Return Path Contract

Only relative, allowlisted internal routes.

No:

```text
https://external.com
//evil.com
javascript:
```

---

# 133. Slug Contract

Slug:

- URL safe
- unique within canonical namespace
- immutable by title edit
- lookup resolves canonical root
- old slug exact redirect lookup on miss

No slug as PK.

---

# 134. Redirect Resolution Contract

Dynamic route resolution:

```text
lookup canonical slug
if found → render
if not:
  lookup exact url_redirect
  if found → permanent redirect final target
  else → 404
```

No last-resort redirect that overrides specific route namespaces.

---

# 135. Article Relation Contract

Article draft may hold relation to nonpublic target.

Public renderer:

- only safe/public relation cards
- omit broken/private target
- Admin warning

Publish validation may block certain broken relations depending on importance.

---

# 136. Opportunity Event Structured Data Query

Not HTTP endpoint.

SEO builder calls:

```text
getOpportunityStructuredDataEligibility(opportunity)
```

returns eligible Event DTO or null.

No fabricated required fields.

---

# 137. Indexability Contract

Central policy function:

```text
getIndexability(entity)
```

used by:

- page metadata
- sitemap
- internal link/public relation visibility

Prevents policy drift.

---

# 138. Admin Data Quality Query Contract

```text
getDataQualityIssues(filters)
```

Types:

```text
PUBLISHED_INSTITUTION_NO_OFFICIAL_SOURCE
PUBLISHED_OPPORTUNITY_NO_VERIFIED_TRUTH
PUBLISHED_OPPORTUNITY_NO_EVIDENCE
BROKEN_SOURCE
DUPLICATE_SLUG_CANDIDATE
CURRENT_VERSION_ANOMALY
ACTIVE_FOLLOW_ARCHIVED_INSTITUTION
NOTIFICATION_WITHOUT_SIGNAL
STALE_P0_SOURCE
BROKEN_ARTICLE_RELATION
```

---

# 139. Kill Switch Contract

Read from validated config:

```text
EMAIL_SEND_ENABLED
WORKER_ENABLED
ANALYTICS_ENABLED
```

Email sender:

if disabled:

```text
do not provider call
leave/retry-safe operational state according to worker policy
```

Worker:

if disabled:

```text
do not claim new work
```

Analytics:

```text
Noop
```

---

# 140. Non-production Side-effect Contract

Default:

```text
EmailSender = Noop/Test/Allowlist
AnalyticsTracker = Noop/Test
Kakao = test/dev config where applicable
```

Never silently use production credentials from test.

---

# 141. Health Contract

Public liveness:

```text
process alive
```

Admin health:

```text
dependency/queue/data-quality
```

External monitor:

```text
process/availability
```

Do not overload one endpoint.

---

# 142. Security Logging Contract

Log safe IDs:

```text
correlation_id
user_id opaque
admin_user_id
institution_id
opportunity_id
source_id
notification_id
delivery_id
outbox_id
article_id
```

No raw email/provider subject/token.

---

# 143. Command Error Contract

Application commands return/throw typed domain/application errors.

Repository raw exceptions mapped at module boundary.

Constraint violation expected for concurrency maps to:

```text
CONFLICT
```

when identifiable.

---

# 144. Retryable Error Contract

External/infrastructure transient errors:

```text
RETRYABLE
```

with safe error code.

No raw provider body.

---

# 145. Provider Ambiguity Contract

Timeout after send cannot be automatically classified as FAILED.

Use distinct attempt state/metadata to prevent blind duplicate retry.

Exact state enum may vary; semantic invariant mandatory.

---

# 146. Delete Semantics Traceability

`10A` explicitly noted account deletion has no standalone FR ID.

API Contract MUST preserve Scenario H.

Trace:

```text
DELETE /api/me/account
→ DeleteUser
→ NFR privacy/integrity
→ Scenario H
```

Implementation Plan must include dedicated tests.

---

# 147. Requirement Traceability Matrix

| Product Requirement | Contract |
|---|---|
| FR-PUB | Public Query Services + Server Components |
| FR-AUTH | Kakao routes + onboarding commands |
| FR-FOL | Follow status/mutations |
| FR-MYP | MyPreppyQuery |
| FR-MON | Monitoring/Admin commands |
| FR-NOT | Notification/worker contracts |
| FR-SEO | Metadata/indexability/redirect/revalidation |
| FR-ANA | Client/server AnalyticsTracker boundaries |
| FR-ADM | `/api/admin/*` + Admin queries/commands |
| Account Delete Scenario H | DELETE account + DeleteUser |

---

# 148. MVP API Non-Scope

Do not add:

```text
GraphQL
Public developer API
API gateway
API versioning framework
gRPC
Microservice RPC
WebSocket
Kafka consumer API
Redis session API
Mobile-specific API
Advertiser API
Payment API
AI endpoints
Crawler control API
Bulk mass-email API
Generic Admin CRUD API
```

---

# 149. Implementation Exit Criteria for This Contract

Before coding broad UI, implementation should be able to answer:

1. Which route/query invokes each Product action?
2. Which commands own DB transactions?
3. Which commands are idempotent?
4. Which endpoint requires User/Admin/Internal auth?
5. Which side effects are post-commit?
6. Which errors are conflict vs retryable?
7. How is PII prevented from responses/logs?
8. How does worker recover?
9. How does migration suppress product signals?
10. How is deletion tested?

---

# 150. Repository Validation Questions

Codex should validate:

1. Current Next.js 16 route structure supports these namespaces.
2. Current repo has no conflicting public/admin/auth API route.
3. Drizzle/postgres transaction primitives support command boundaries.
4. Existing admin_users/audit_logs can back Admin context/audit.
5. Existing Source/Observation/Version/Outbox primitives fit these contracts.
6. Target 04 schema supports User/Follow/Notification contracts.
7. Follow status island can safely fetch private state without poisoning public cache.
8. PendingFollowIntent cookie + OAuth state separation is feasible.
9. Same transaction signup+Follow is feasible.
10. One canonical `/api/admin/opportunities/{id}/verify` can dispatch Native/Legacy safely.
11. Existing Outbox can be hardened for worker contracts without replacement.
12. Internal protected revalidation Route Handler is compatible with Next.js 16 cache APIs.
13. Email webhook namespace/signature adapter has no route conflict.
14. Account deletion transaction and FK actions are implementable.
15. API Contract does not require any MVP non-scope infra.

---

# 151. Definition of Done

API Contract is valid when:

- public reads are server/DAL-first
- user/admin/internal auth boundaries are explicit
- commands own transactions
- Follow and signup semantics are idempotent
- verification owns Version/Evidence/Change/Audit/Outbox
- Notification worker contract is retry-safe
- Admin has no direct CRUD bypass
- cache revalidation is post-commit/internal
- provider webhook is signed/idempotent
- PII/error rules are explicit
- account deletion is traceable
- no microservice/public API overbuild is introduced

---

# 152. Next Step

Repository validation output:

```text
11A_API_CONTRACT_REPOSITORY_VALIDATION.md
```

If:

```text
VALID
or
VALID_WITH_IMPLEMENTATION_ADJUSTMENTS
```

and no API-level amendment is required:

```text
12_IMPLEMENTATION_PLAN.md
```

will convert this contract into executable migration/module/test/vertical-slice work packages.
