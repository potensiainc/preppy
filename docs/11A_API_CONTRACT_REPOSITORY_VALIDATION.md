# 11A API Contract Repository Validation

> **Project:** PREPPY (프레피)  
> **Validation Target:** `docs/11_API_CONTRACT.md`  
> **Validated Product Contract:** `docs/10_PRD.md`, `docs/10A_PRD_REPOSITORY_VALIDATION.md`  
> **Date:** 2026-08-22  
> **Verdict:** `VALID_WITH_IMPLEMENTATION_ADJUSTMENTS`

---

# 1. Scope, Method, and Evidence

이 문서는 API를 재설계하지 않는다. `11_API_CONTRACT.md`의 HTTP/Application/Domain/Infrastructure boundary를 One Pager, MVP, 00, 02–10, 02A–10A와 현재 repository의 Next.js runtime, route tree, package, env, PostgreSQL schema/migrations/tests에 대조했다.

Validation states:

```text
SUPPORTED
SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT
CONFLICT
NOT_IMPLEMENTED
NOT_VERIFIABLE
```

Repository evidence states:

```text
DOCUMENTED
IMPLEMENTED
TESTED
NOT_IMPLEMENTED
NOT_FOUND
NOT_VERIFIABLE
```

검증한 `11_API_CONTRACT.md`는 3,193 lines, 44,071 bytes이며 SHA-256은 `608B6AC79FEDED95B40F8C7E4BFA7218C47EFA6952B9ED07DD56E0BBA111019B`다.

---

# 2. Executive Verdict

**API Contract: VALID_WITH_IMPLEMENTATION_ADJUSTMENTS**

Contract는 validated Product 의미를 Next.js/PostgreSQL modular monolith의 안전한 boundary로 내린다. Public SEO reads를 Server Component→DAL/query service로 두고, browser API는 Follow island와 mutation에만 사용한다. User/Admin/Internal/Webhook auth를 분리하고, transaction과 business invariant를 typed application command가 소유하며, worker/provider/cache side effect를 commit 이후로 격리한다. Public REST catalog, `/api/v1`, GraphQL, API Gateway, Redis, external queue 같은 MVP overbuild도 없다.

API-level conflict나 required amendment는 없다. 다만 current repository는 `/api/health` 외 route, application service, target schema, auth, worker, provider adapter가 없으므로 이 verdict는 **구현 가능성 검증**이지 구현 완료 판정이 아니다.

| Decision | Result |
|---|---|
| Architecture/API blockers | **NONE** |
| Required API amendments | **NONE** |
| Ready for `12_IMPLEMENTATION_PLAN.md` | **YES** |
| Current API runtime complete | **NO** |
| Public read model | **Server Components → server-only Query Service/DAL** |
| User mutation model | **Cookie-auth Route Handlers → typed commands** |
| Admin mutation model | **Private Route Handlers → typed commands; reads via Server Components/query services** |
| Worker/internal model | **Same-repo direct application services; protected HTTP only for Next cache runtime** |

---

# 3. Current Repository Reality

## 3.1 Route Tree

Actual App Router routes:

```text
GET /api/health
```

No `/api/me/*`, `/api/admin/*`, `/api/internal/*`, `/api/webhooks/*`, `/api/auth/*`, or `/auth/kakao/*` route exists. Therefore namespace collision is absent.

| Namespace | Current | Contract Fit | Status |
|---|---|---|---|
| `/api/health` | static JSON 200 | low-information liveness | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT |
| `/api/me/*` | NOT_FOUND | private User APIs available | NOT_IMPLEMENTED |
| `/api/admin/*` | NOT_FOUND | separate Admin API available | NOT_IMPLEMENTED |
| `/api/internal/*` | NOT_FOUND | internal credential boundary available | NOT_IMPLEMENTED |
| `/api/webhooks/*` | NOT_FOUND | provider signature boundary available | NOT_IMPLEMENTED |
| `/api/auth/*` | NOT_FOUND | Follow intent namespace available | NOT_IMPLEMENTED |
| `/auth/kakao/*` | NOT_FOUND | OAuth browser routes available | NOT_IMPLEMENTED |

Current health body is `{status:"ok", service:"admissionradar"}`, while section 82 illustrates `service:"preppy"`. Keep the endpoint semantics and choose one stable service identifier in implementation/tests; this naming mismatch is not an API-contract conflict.

## 3.2 Runtime and Package Evidence

- `next@16.3.0`, React 19, Node ≥22, TypeScript, Zod 4 are compatible with App Router Server Components, Route Handlers, server cookies, and typed request parsing.
- `drizzle-orm@0.45.2`, `postgres@3.4.9`, PostgreSQL migrations/tests support transaction, row lock, partial unique/index, and raw `FOR UPDATE SKIP LOCKED` operations.
- Current runtime connection helper exposes only a singleton raw `postgres` client with `max:1`; no application `db`, repository, transaction manager, or transaction-context abstraction exists.
- No auth/OAuth, rate-limit, sanitizer/editor, analytics, email provider, structured logging, or observability dependency exists.
- Env validation covers database, base URL, and Admin issuer/client/secret only. Kakao/session/internal HMAC/GA4/kill-switch values are absent.
- Current schema provides legacy trust/history, Sources/Observations, `admin_users`, `audit_logs`, legacy Alert/Delivery, and basic `outbox_events`; canonical target tables and runtime are not implemented.

---

# 4. Public DAL-first Contract

**Status: SUPPORTED**

Next.js public pages can call server-only query services directly during Server Component rendering. This keeps PostgreSQL credentials and unpublished fields server-side, renders SEO content in initial HTML, and avoids a duplicate public REST catalog. Public DTOs deliberately omit `isFollowed`; only the small client island uses a private endpoint.

Recommended enforcement:

1. Mark DB/repository/DAL entry modules with `server-only` or keep them below server-only imports.
2. Return explicit public projection DTOs, never schema rows.
3. Share indexability and canonical projection functions across page metadata, sitemap, and relations.
4. Keep User/Consent/Follow/Delivery reads out of public cached functions.
5. Use direct private Server Component query for initial My Preppy; create browser APIs only for interactive refresh/mutations.

No `/api/institutions` or generic REST catalog is required for MVP.

---

# 5. Error, Validation, and Correlation Contract

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

Canonical `ApplicationError` hierarchy and a single safe HTTP mapper fit the current TypeScript/Zod/Vitest style, but none exists yet.

Required implementation rules:

- Generate correlation UUID on the server at every mutation boundary; never trust a client value as canonical.
- Carry correlation through command context, safe Audit metadata, Outbox payload where needed, structured log, and response.
- Map Zod issues to allowlisted field path + stable issue code/message. Do not echo rejected raw values.
- Translate identifiable unique/optimistic concurrency failures to `409 CONFLICT`; everything else from repository/provider becomes a safe generic typed error.
- Never return SQL, constraint internals, stack, raw provider body, OAuth values, raw email, or child profile.
- Treat `details` as a per-error allowlist, not arbitrary metadata serialization.

Current `audit_logs` has JSONB `before_data`/`after_data`, so 09A's reason/correlation decision can be represented as reserved PII-safe metadata without adding a mandatory correlation column. Avoid putting full Article HTML or request bodies into Audit.

---

# 6. Session and Authentication Boundaries

## 6.1 User/Admin Separation

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

Use different cookie names, key purposes/secrets, parsers, contexts, route roots, and status lookups. Every protected request must parse the cookie and query current `User.status=ACTIVE` or `admin_users.status=ACTIVE`; cookie validity alone is insufficient. An `auth_sessions` table is not needed for MVP.

Recommended helpers:

```text
getOptionalActiveUser()
requireActiveUser()
requireActiveAdmin()
requireInternalWorker()
verifyEmailWebhook()
```

Do not expose a helper that silently accepts either User or Admin context.

## 6.2 PendingFollowIntent

**Status: SUPPORTED**

Keep `POST /api/auth/follow-intent` as the MVP adapter rather than putting raw target/attribution/return data in `/auth/kakao/start` query parameters or replacing it with a Server Action. The dedicated Route Handler gives one testable validation/error/cookie boundary and works from the Follow island.

The encrypted/authenticated HttpOnly cookie should contain only canonical UUIDs, allowlisted short context, normalized relative return path, nonce, issued/expiry timestamps, and small attribution fields. Enforce a serialized payload budget under approximately 1 KiB, far below normal cookie limits; never include titles, raw search query, external URL, or arbitrary metadata.

`preppy_follow_intent` and `preppy_oauth_state` remain separate cryptographic purposes/cookies. The state is one-time and callback-bound; the intent is a short-lived business continuation. The return path must be relative and matched against known route patterns.

## 6.3 Follow Status Convention

Choose the contract's recommended anonymous-safe `200` convention:

```json
{"data":{"authenticated":false,"following":false}}
```

For authenticated callers, check current User ACTIVE status. Always return `Cache-Control: private, no-store` (or stricter `no-store`) and never let the request enter a public cached function. This prevents public Cache Components from being personalized while avoiding expected anonymous 401 noise in the island.

---

# 7. Follow, Signup, and User Commands

## 7.1 Follow Mutation

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

Canonical UUID, User ACTIVE, Institution followability, `UNIQUE(user_id,institution_id)`, row lock, and one-open FollowEpisode partial unique make activation/reactivation/callback retries safe. `ActivateFollowResult` is sufficient if semantics are fixed:

```text
new relation:       created=true,  reactivated=false
inactive→active:    created=false, reactivated=true
already active:     created=false, reactivated=false
transitionOccurred: created || reactivated
```

Emit `follow_created`/`additional_follow` only after commit and only when `transitionOccurred=true`; `activeFollowCount` decides second+ Follow. `DELETE` is an idempotent 204 no-op if already inactive.

## 7.2 Signup + Follow Transaction

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

The modular monolith uses one PostgreSQL database, so `CompleteSignup` can atomically append consents/profile/email/preferences, activate User, revalidate intent Institution, and activate Follow. Provider exchange remains outside the transaction.

Do not implement this by nesting an `ActivateFollow` command that starts its own transaction. Introduce a typed transaction context/Unit of Work:

```text
transactionManager.run(tx => CompleteSignupOrchestrator.execute(input, ctx, tx))
```

Repositories and transaction-internal domain operations receive the same `tx`. Standalone `ActivateFollow` wraps the same core operation in its own top-level transaction. The current singleton `postgres(...,{max:1})` helper must be replaced or extended with a pooled Drizzle/raw client and explicit transaction handle before concurrent web/worker work.

If the pending Institution is no longer followable, User activation commits and Follow is omitted as the contract specifies.

## 7.3 Consent Policy Version

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT; NO NEW TABLE REQUIRED FOR MVP**

`consent_decisions.policy_version` records the accepted version, but current target schema does not store legal documents. Use one server-only legal policy manifest as the source of truth:

```text
type + version + effectiveAt + content hash/reference
```

The `/terms` and `/privacy` renderers, onboarding query, and `CompleteSignup` validation must import/query the same manifest. Do not hardcode versions only in the client bundle. A `legal_policies` table is needed only if policies become Admin-managed, scheduled, localized with independent rollout, or require database-resident historical text; none is an MVP requirement.

## 7.4 Account Deletion

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

04/04A/07A's RESTRICT historical anchors are compatible with one logical transaction: lock User, mark DELETED, physically delete AuthIdentity/UserEmail/Profile/Interest PII children, disable preferences, close Follow/Episodes, suppress pending/queued Deliveries, and write PII-free history/Audit. Then clear the local session.

Current target FK policy intentionally keeps opaque User/Follow/Delivery/Attempt history, so do not hard-delete the User anchor. Provider unlink/revocation, if Kakao/legal policy requires it, is an external side effect: local deletion must commit first, then a dedicated post-commit adapter/Outbox event performs or records remote revocation. A provider outage must not restore local access or retain provider subject PII. Exact Kakao unlink capability is `NOT_VERIFIABLE` until provider policy/credentials are selected.

---

# 8. Admin Mutation Model

**Recommendation: Private Route Handlers for mutations; Server Components/query services for reads.**

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

Keep `/api/admin/*` Route Handlers as the primary mutation adapter instead of Server Actions. They provide explicit HTTP status/error contracts, centralized Admin/session/origin guards, correlation/audit propagation, predictable route-level tests, and a stable boundary for operator tooling. Server Actions may later wrap the same commands for narrow UI convenience but must not become a second business path.

Every handler follows:

```text
requireActiveAdmin
→ assertSameOrigin
→ validate Zod input
→ generate command context/correlation
→ command/query
→ safe result/error mapping
```

Admin reads may call query services directly from private/no-store Server Components; read HTTP endpoints are optional.

## 8.1 One Canonical Verify Opportunity Endpoint

**Status: SUPPORTED**

`POST /api/admin/opportunities/{id}/verify` is correctly product-centric. The command loads canonical Opportunity and server-owned `truth_mode`, then dispatches to Native Version/Evidence or legacy EventVersion/Evidence persistence while producing the same canonical OpportunityChange/Audit/Outbox contract. The client must not choose `truth_mode`.

No repository blocker requires separate native/legacy endpoints. Separate internal repository strategies are recommended, but the orchestration command owns one transaction and one typed result/error surface.

## 8.2 No Change

**Status: SUPPORTED**

`POST /api/admin/monitoring/sources/{sourceId}/no-change` must remain separate from Opportunity verification. A Source check can cover multiple bindings and has intentionally different effects: Observation/Audit/check projection only, never Version, OpportunityChange, Notification, or SEO freshness.

## 8.3 Article

**Status: NOT_IMPLEMENTED; CONTRACT SUPPORTED**

Draft raw editor state may be stored privately, but preview and publish both sanitize server-side. `PublishArticle` atomically persists sanitized canonical HTML, SEO fields, relations, publication, and Audit; revalidation is post-commit. Slug change remains an explicit command with redirect chain flattening. There is no public CMS API. Editor/sanitizer dependencies and Article target schema are absent.

## 8.4 Notification/Outbox Operations

**Status: NOT_IMPLEMENTED; CONTRACT SUPPORTED**

Cancel applies only before irreversible send. Retry Delivery reuses the logical row and appends Attempt history after current eligibility and ambiguity checks. SUPPRESSED cannot be force-sent. Outbox retry/cancel is event-type/state policy, reasoned and audited; payload editing and blind rerun of PROCESSED rows remain forbidden. Notification preview is safety-only and creates no signal/delivery/outbox. Test send is P1 and must stay outside canonical customer history.

---

# 9. Worker and Outbox Contracts

## 9.1 Claim/Lease

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

PostgreSQL and the installed drivers can implement `FOR UPDATE SKIP LOCKED`. Required flow:

```text
short transaction: select eligible rows + mark PROCESSING/lease/attempt → commit
perform DB work or network outside claim transaction
short transaction: complete/retry/dead-letter transition
```

Do not hold a transaction or row lock across provider/cache network calls. Current Outbox must add stable dedupe key, max attempts, locked_at/locked_by/lease recovery, safe last error, dead-letter state/time, and worker indexes. The current global pool size of one is not a viable production web+worker concurrency configuration.

## 9.2 Two-stage Model

**Status: SUPPORTED**

Use one recipient-resolution event per Notification and one delivery-send event per logical Delivery. Resolution queries FollowEpisode at `signal_published_at`, creates Delivery rows with DB uniqueness, and emits per-delivery work. Send rechecks current User/Follow/Email/Consent/Preference immediately before provider call. At MVP scale this is simpler and safer than one giant send job or external queue.

Stable examples:

```text
notification-resolve:{notificationId}:{policyVersion}
delivery-send:{deliveryId}:{attemptNumber-or-generation}
```

## 9.3 Kill Switch Placement

- `WORKER_ENABLED`: check before claiming new work; do not strand freshly claimed rows when disabled.
- `EMAIL_SEND_ENABLED`: check again immediately before provider call. Disabled is not provider failure; retain a retry-safe/paused state.
- `ANALYTICS_ENABLED`: check at AnalyticsTracker adapter boundary and use Noop when disabled.

All switches must be validated server config, excluded from browser bundles, and default-deny production side effects outside production.

---

# 10. Cache Revalidation Internal Boundary

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

A standalone worker should not call Next cache internals without a Next request/render store. The protected same-app `POST /api/internal/cache/revalidate` Route Handler is the correct boundary for `revalidateTag`/`revalidatePath`; other same-repo DB worker commands should call application services directly.

Fresh installed-package evidence:

- `next/cache` exports `revalidateTag` and `revalidatePath`.
- Next 16.3's type requires `revalidateTag(tag, profile)`; use an explicit profile such as the shared policy's selected cache-life profile rather than deprecated one-argument usage.
- Dynamic `revalidatePath` needs the appropriate `page`/`layout` type; prefer canonical IDs→allowlisted tags/paths mapping inside the handler.

Recommended internal auth:

```text
HMAC-SHA256(timestamp + raw-body-hash)
+ dedicated secret
+ narrow replay window
+ constant-time comparison
+ event ID/correlation header
```

The body contains only allowlisted event types and canonical UUIDs. Never accept an arbitrary tag/path from the caller. Revalidation is idempotent; failure retries the dedicated Outbox event and never rolls back domain truth.

---

# 11. Email Provider/Webhook and Timeout Ambiguity

## 11.1 Webhook

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

`POST /api/webhooks/email/{provider}` is provider-neutral at the application layer and collision-free. The route must allowlist provider adapters, verify signature/timestamp against the raw body before business mapping, reject replay, and map `(provider, provider_message_id)` to one Attempt. 04A already requires the partial unique/index on that pair.

For webhook event idempotency, add a durable provider-event receipt/dedupe key when the selected provider supplies a stable event ID; otherwise derive the documented stable hash allowed by that adapter. Out-of-order events use a monotonic transition policy and must not regress SENT/DELIVERED/OPENED/CLICKED terminal progress blindly. Raw email is never the primary lookup.

## 11.2 Provider Timeout Ambiguity

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT; TARGET SCHEMA CHANGE NOT REQUIRED**

04's Attempt enum is `STARTED | ACCEPTED | FAILED_RETRYABLE | FAILED_TERMINAL`; it lacks `AMBIGUOUS`. Safe representation without changing the model:

```text
Attempt.attempt_status = STARTED
Attempt.completed_at = NULL
Attempt.error_code = PROVIDER_RESULT_UNKNOWN
Delivery remains non-terminal and retry-blocked
```

The worker must not convert this to FAILED or create an immediate new Attempt. Reconcile by provider idempotency key/status lookup/webhook/manual operator decision. Then transition the same Attempt to ACCEPTED with provider message ID, or to a typed failure if absence/failure is proven. An explicit `AMBIGUOUS` enum is an optional clarity enhancement, not necessary for safety and not an API amendment.

Provider-specific signature scheme, replay window, accepted/timeout semantics, message ID guarantees, idempotency support, status lookup, bounce/complaint taxonomy, and unlink capability remain `NOT_VERIFIABLE` until Kakao/Email providers are selected.

---

# 12. Migration, Audit, Security, and Privacy

## 12.1 Migration Context

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

`source=MIGRATION, emitProductSignals=false` is an application/script context, not client input. Implement a separate import/backfill entrypoint or signal-disabled command mode that cannot default to live publication. Migration must not call normal signal-enabled `PublishOpportunity` accidentally. Add integration tests asserting zero Notification/Delivery/Outbox customer signal.

## 12.2 Audit/Correlation

Critical Admin commands can write current `audit_logs` in the same transaction. Store actor/action/target/reason/correlation and safe deltas in a bounded JSONB metadata convention; never serialize raw request, email, OAuth subject/token, full HTML, or provider response. User self-delete may use PII-free domain history/Audit with no Admin actor. No new Audit table is required.

## 12.3 CSRF and Rate Limits

No external rate-limit service is a required MVP dependency. Use a central same-origin guard for cookie-authenticated POST/PATCH/PUT/DELETE: compare canonical `Origin` to `APP_BASE_URL`/Host, reject absent or mismatched browser mutation origins according to a documented policy, use Secure/HttpOnly/SameSite cookies, and optionally validate `Sec-Fetch-Site` as defense in depth. Account deletion additionally needs explicit confirmation and can use a one-time CSRF token or recent-auth challenge.

Internal/webhook routes use HMAC/provider signatures, not browser CSRF. Rate limiting is an adapter concern: platform-native or PostgreSQL-backed production enforcement is acceptable; in-memory limiting is development/single-instance only. Auth start/callback failures, Follow, email preference/update, deletion, Admin auth, exact-email lookup, and webhook are minimum targets.

## 12.4 Privacy Audit

The DTO/error/log contracts do not require exposure of email, Kakao subject, OAuth code/token, child data, or legacy subscriber fields. Admin exact-email lookup via POST is sufficient only with dedicated authorization, purpose/reason, body-redacted access logging, exact normalized match, minimal result, audit, and rate limit. Provider/message IDs and opaque canonical UUIDs are safe operational correlation values; raw provider payloads are not.

---

# 13. API Overbuild Audit

| Candidate | Contract Result | Verdict |
|---|---|---|
| Public REST catalog | explicitly avoided | CORRECT FOR MVP |
| OpenAPI mandatory source | deferred | CORRECT FOR MVP |
| `/api/v1` | explicitly not required | CORRECT FOR MVP |
| GraphQL/gRPC/RPC framework | non-scope | CORRECT FOR MVP |
| API Gateway | non-scope | CORRECT FOR MVP |
| Redis/session cache | non-scope | CORRECT FOR MVP |
| Kafka/external queue | non-scope | CORRECT FOR MVP |
| Generic Admin CRUD | explicitly forbidden | CORRECT FOR MVP |
| Mass email composer | explicitly forbidden | CORRECT FOR MVP |
| Public CMS API | not required | CORRECT FOR MVP |

The endpoint list is broad but not overbuilt: it maps to launch-critical User, Monitoring, verification, CMS, notification, support, and operations commands. Optional test-send remains P1.

---

# 14. API Contract Matrix

Current implementation is absent for all listed Product adapters; `Status` evaluates the contract's fit and notes the target implementation requirement.

| Capability | HTTP/DAL Adapter | Application Command/Query | Auth | Transaction | Idempotency | Status |
|---|---|---|---|---|---|---|
| 1. Institution read | Server Component→DAL | InstitutionList/DetailQuery | Anonymous | read committed | canonical slug/read | NOT_IMPLEMENTED |
| 2. Opportunity read | Server Component→DAL | OpportunityDetailQuery | Anonymous | read committed | canonical slug/read | NOT_IMPLEMENTED |
| 3. Article read | Server Component→DAL | ArticleDetailQuery | Anonymous | read committed | canonical slug/read | NOT_IMPLEMENTED |
| 4. Follow status | GET `/api/me/follows/status` | FollowStatusQuery | Optional ACTIVE User | none/read | safe repeat | NOT_IMPLEMENTED |
| 5. Activate Follow | POST `/api/me/follows` | ActivateFollow | ACTIVE User | command-owned | pair unique + row lock + open episode unique | NOT_IMPLEMENTED |
| 6. Kakao callback | GET `/auth/kakao/callback` | ResolveOrCreateUserFromKakaoIdentity | OAuth state/provider | identity tx after exchange | one-time state + provider-subject unique | NOT_IMPLEMENTED |
| 7. Complete Signup | POST `/api/me/onboarding/complete` | CompleteSignup orchestration | PENDING User context | identity+consent+Follow one tx | User lock + latest state + Follow uniques | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT |
| 8. My Preppy | private Server Component preferred | MyPreppyQuery | ACTIVE User | read committed | private read | NOT_IMPLEMENTED |
| 9. Email preference | GET/PATCH `/api/me/notification-preferences*` | NotificationPreferenceQuery/UpdateEmailPreference | ACTIVE User | command-owned | channel unique + transition-aware upsert | NOT_IMPLEMENTED |
| 10. Delete Account | DELETE `/api/me/account` | DeleteUser | ACTIVE User + confirmation | one logical delete tx | lock/status transition; repeat session denied | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT |
| 11. Admin No Change | POST `/api/admin/monitoring/sources/{id}/no-change` | ConfirmNoChange | ACTIVE Admin | observation/audit tx | expected context + semantic no-change | NOT_IMPLEMENTED |
| 12. Verify Opportunity | POST `/api/admin/opportunities/{id}/verify` | VerifyOpportunity dispatcher | ACTIVE Admin | version/evidence/change/audit/outbox tx | row lock + expected version + signal dedupe | NOT_IMPLEMENTED |
| 13. Verify Fact | POST `/api/admin/institutions/{id}/facts/{type}/verify` | VerifyInstitutionFact | ACTIVE Admin | version/evidence/audit/outbox tx | row lock + expected version | NOT_IMPLEMENTED |
| 14. Publish Article | POST `/api/admin/articles/{id}/publish` | PublishArticle | ACTIVE Admin | sanitized HTML/SEO/relation/audit tx | expected draft version + post-commit event dedupe | NOT_IMPLEMENTED |
| 15. Retry Delivery | POST `/api/admin/deliveries/{id}/retry` | RetryDelivery | ACTIVE Admin | short state/attempt tx | logical Delivery unique + ambiguity/current eligibility | NOT_IMPLEMENTED |
| 16. Retry Outbox | POST `/api/admin/outbox/{id}/retry` | RetryOutboxEvent | ACTIVE Admin | short transition tx | state machine + stable dedupe + audit | NOT_IMPLEMENTED |
| 17. Cache Revalidation | POST `/api/internal/cache/revalidate` | ProcessCacheRevalidation | InternalWorkerContext | no Product tx | event ID + idempotent mapped revalidation | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT |
| 18. Email Webhook | POST `/api/webhooks/email/{provider}` | canonical provider-event handler | signed ProviderWebhookContext | short transition tx | provider event ID/hash + monotonic state | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT |

---

# 15. Requirement and Vertical-Slice Traceability

| Product Contract | API/Application Contract | Result |
|---|---|---|
| FR-PUB | PublicHome/Institution/Opportunity/Article query services + Server Components | COMPLETE TRACE |
| FR-AUTH | Follow intent, Kakao start/callback, onboarding/CompleteSignup | COMPLETE TRACE |
| FR-FOL | Follow status, Activate/DeactivateFollow, Episode idempotency | COMPLETE TRACE |
| FR-MYP | private MyPreppyQuery and preference/profile commands | COMPLETE TRACE |
| FR-MON | MonitoringQueue, ConfirmNoChange, Source and verify commands | COMPLETE TRACE |
| FR-NOT | Notification/Delivery/Attempt, two-stage worker, Admin ops/webhook | COMPLETE TRACE |
| FR-SEO | indexability/redirect/relations/structured data/revalidation | COMPLETE TRACE |
| FR-ANA | client events + post-commit AnalyticsTracker | COMPLETE TRACE |
| FR-ADM | `/api/admin/*`, Admin queries/commands/audit/health | COMPLETE TRACE |
| Scenario H | DELETE account→DeleteUser→PII erase/closure/suppression | COMPLETE TRACE |

Launch vertical slice is fully connected:

```text
Article query
→ Institution query
→ Follow intent
→ Kakao callback/CompleteSignup
→ ActivateFollow
→ MyPreppyQuery
→ MonitoringQueue/ConfirmNoChange or VerifyOpportunity
→ Notification/Outbox
→ recipient resolution/Delivery send
→ Email webhook/deep link
→ Return analytics
```

No launch-critical Product action is missing from the contract.

---

# 16. Implementation Adjustments

1. Add a server-only DB/repository layer and typed transaction context; avoid nested command transactions, and replace the singleton `max:1` runtime connection strategy for production web+worker concurrency.
2. Keep `POST /api/auth/follow-intent`, enforce small allowlisted encrypted payloads, separate OAuth state, and use anonymous-safe 200 private/no-store Follow status.
3. Use Route Handlers for User/Admin mutations and direct Server Component query services for public/private/Admin initial reads.
4. Make server-owned `truth_mode` dispatch one Verify Opportunity endpoint; keep No Change at Source-check boundary.
5. Harden Outbox and implement one resolution event per Notification plus one send event per Delivery; commit claim before external work.
6. Represent provider timeout as retry-blocking unfinished `STARTED` Attempt until reconciliation; never blindly mark FAILED/retry.
7. Use a server-only legal-policy manifest shared by legal pages/onboarding/CompleteSignup; no legal table for MVP.
8. Authenticate cache revalidation with HMAC, map canonical event DTOs to allowlisted targets, and call Next 16.3 `revalidateTag` with explicit profile.
9. Add provider message lookup and durable webhook event dedupe/monotonic ordering when provider capability is known.
10. Place kill-switch checks at worker claim, provider-call, and analytics-adapter boundaries; default non-prod side effects to Noop/allowlist.
11. Centralize ApplicationError mapping, correlation, same-origin/CSRF, safe logging, and rate-limit adapters.
12. Process optional remote Kakao unlink/revocation after local DeleteUser commit through a reliable adapter/Outbox path.

---

# 17. API Contract Amendment Candidates

**NONE.**

The health service label, transaction-context mechanics, explicit cache profile, webhook receipt storage, provider ambiguity representation, legal policy manifest, and provider unlink sequencing are implementation adjustments. None changes Product semantics, public API intent, or application boundary enough to require editing `11_API_CONTRACT.md`.

---

# 18. Required Questions

| Question | Answer |
|---|---|
| Q1. Current repo/target schema에 구현 가능한가? | **YES_WITH_IMPLEMENTATION_ADJUSTMENTS** |
| Q2. API Contract amendment가 필요한가? | **NO** |
| Q3. Public DAL-first + small private API가 맞는가? | **YES** |
| Q4. User/Admin/Internal auth가 충분히 분리되는가? | **YES**, distinct cookies/keys/helpers/routes and per-request DB status check required |
| Q5. Follow/PendingFollowIntent가 callback retry에 안전한가? | **YES**, separate one-time state + signed intent + DB uniques/locks |
| Q6. Signup+Follow same transaction 가능한가? | **YES**, shared PostgreSQL; typed tx context required |
| Q7. One Verify endpoint가 Native/Legacy를 숨기는가? | **YES**, truth_mode is server-owned and repository strategy internal |
| Q8. Outbox/worker가 current PostgreSQL stack에 맞는가? | **YES_WITH_IMPLEMENTATION_ADJUSTMENTS**, hardening/pool/worker required |
| Q9. Protected cache endpoint가 Next 16 topology에 적절한가? | **YES**, Route Handler request context + HMAC/allowlist; explicit cache profile required |
| Q10. Timeout ambiguity를 schema 변경 없이 표현 가능한가? | **YES**, unresolved STARTED + safe retry-blocking error until reconciliation |
| Q11. Consent policy source에 schema가 필요한가? | **NO for MVP**, shared server policy manifest sufficient |
| Q12. Delete에 누락된 FK/provider side effect가 있는가? | **No FK blocker**; optional provider unlink is post-commit external work |
| Q13. API가 MVP보다 과도한가? | **NO** |
| Q14. `12_IMPLEMENTATION_PLAN.md`로 진행 가능한가? | **YES** |

---

# 19. API Contract Repository Validation Verdict

**API Contract:**  
VALID_WITH_IMPLEMENTATION_ADJUSTMENTS

**Ready for 12_IMPLEMENTATION_PLAN:**  
YES

**Architecture/API Blockers:**  
NONE

**Required API Amendments:**  
NONE

**Implementation Adjustments:**  
Typed transaction context and production pool; private/no-store Follow status; route-handler mutation guards; Outbox hardening/two-stage worker; retry-blocking provider ambiguity; server legal-policy manifest; HMAC/allowlisted Next cache revalidation with explicit profile; webhook dedupe; post-commit provider unlink; centralized errors/CSRF/rate limits/privacy-safe logging.

**Recommended Public Read Model:**  
Public Server Components call server-only typed Query Services/DAL directly and render canonical DTOs in initial HTML. No public REST catalog. Follow state remains a separate private/no-store client island.

**Recommended User Mutation Model:**  
`/api/auth/*` and `/api/me/*` Route Handlers authenticate/validate/map errors and invoke typed commands. OAuth state and PendingFollowIntent are separate; Follow and signup are DB-idempotent; account deletion is one local transaction plus optional post-commit provider revocation.

**Recommended Admin Mutation Model:**  
Private `/api/admin/*` Route Handlers with ACTIVE Admin, same-origin protection, correlation/reason and typed commands. Commands own locks/transactions/Audit/Outbox; private Server Components call Admin query services for reads. No generic CRUD or alternate Server Action business path.

**Recommended Worker/Internal Model:**  
Same-repo worker directly invokes application/repository services for DB work, claims hardened Outbox rows with short `SKIP LOCKED` lease transactions, and performs network calls after commit. Only Next cache invalidation crosses a protected HMAC same-app Route Handler with allowlisted event mapping.

**External Provider Unknowns:**  
Kakao subject/email/unlink and callback failure semantics; Email provider idempotency/message ID/status reconciliation, timeout acceptance, webhook signature/replay/event ordering, bounce/complaint taxonomy; production TLS/rate-limit and deployment topology.

**Highest API/Concurrency Risks:**

1. Nested/ad-hoc transactions or route-level writes split signup, verification, deletion, Audit, and Outbox invariants under retries/concurrency.
2. Provider timeout, webhook reordering, or worker lease recovery triggers a blind resend or regresses Delivery state, causing duplicate/ineligible Email.
3. Public cache/auth namespace mistakes expose private Follow/User state or allow User/Admin/Internal/Webhook credentials to cross trust boundaries.

**Recommended Next Step:**

```text
12_IMPLEMENTATION_PLAN.md
```
