# PREPPY WP-11 Admin Runtime / Monitoring Console Design

**Status:** APPROVED DESIGN — implementation has not started  
**Date:** 2026-08-24  
**Branch:** `wp-11-admin-runtime`  
**Baseline:** `5e6edaa feat: add monitoring and verification engine`  
**Implementation constraints:** no commit, no push, no package addition, no schema migration

## 1. Purpose

WP-11 makes the WP-10B monitoring and verification engine operable by a trusted internal administrator. It adds a separate Admin authentication runtime, private operational pages, safe read projections, and HTTP adapters that invoke the existing WP-10B application commands.

The Admin UI is an application command console. It is not a generic database editor and must not create a second monitoring policy path.

```text
Trusted OIDC Admin Login
  -> protected /admin runtime
  -> query-driven Monitoring Queue
  -> official Source inspection
  -> typed operator decision
  -> /api/admin adapter
  -> WP-10B application command
  -> canonical transaction / Audit / Outbox semantics
```

## 2. Scope

WP-11 implements:

- single-issuer OIDC Authorization Code login with PKCE S256;
- a separate encrypted Admin session and per-request ACTIVE status check;
- `/admin/login`, protected `/admin/**` pages, and Admin logout;
- Dashboard, Monitoring, Institutions, Opportunities, Sources, Articles, Notifications, Users, and Operations pages;
- Monitoring detail workflows for no-change, Opportunity verification, InstitutionFact verification, Source unavailable, Source move, and Source binding changes;
- server-only, PII-minimized Admin read projections;
- `/api/admin/**` typed mutation adapters over the WP-10B commands;
- origin/CSRF checks, safe error mapping, no-store/private/noindex controls;
- unit, integration, build/route, browser, and responsive verification.

WP-11 explicitly does not implement:

- automatic Admin provisioning or identity linking;
- multiple Admin OIDC issuers;
- complex RBAC;
- Outbox retry, cancellation, dead-letter mutation, or arbitrary state editing;
- Notification recipient resolution or Notification/Delivery creation;
- a Worker, Email provider, provider webhook, or cron process;
- CMS editing, sanitization, Article publishing, or full SEO runtime;
- GA4 transport or production migration/cutover.

## 3. Repository Baseline

The approved WP-10B baseline provides:

- `admin_users` with a unique `external_auth_subject` and ACTIVE/DISABLED status;
- `audit_logs` and the shared `AuditWriter`;
- the query-driven Monitoring Queue;
- ConfirmNoChange, Native/Legacy Opportunity verification, InstitutionFact verification, Source unavailable/move, and Source Bind/Unbind commands;
- canonical OpportunityChange and transactional Outbox behavior;
- encrypted cookie primitives, origin validation, safe application errors, and a bounded process-local rate limiter.

The repository does not provide:

- an Admin authentication/session runtime;
- an OIDC client library;
- a password credential model;
- safe Outbox transition commands;
- browser-test packages.

The design therefore uses the platform `fetch` and Node cryptography APIs for a deliberately narrow OIDC client, reuses the existing secure-cookie and command primitives, keeps Operations mutations deferred, and adds no dependency or migration.

## 4. LOCKED Decisions

### LOCK-001 — Admin identity is a single configured OIDC issuer

WP-11 supports exactly one trusted issuer and one client:

```text
configured ADMIN_AUTH_ISSUER
configured ADMIN_AUTH_CLIENT_ID
verified ID Token iss == configured issuer
verified ID Token sub == admin_users.external_auth_subject
```

Because `admin_users` does not store issuer alongside subject, multiple issuers are forbidden in WP-11. Supporting multiple issuers later requires a separately designed `(issuer, subject)` identity model and migration.

### LOCK-002 — OIDC success does not grant Admin access

An Admin session is issued only when all of the following are true:

1. the Authorization Code flow and PKCE verification succeed;
2. the ID Token passes cryptographic and claim validation;
3. the verified `sub` exactly matches an existing `admin_users.external_auth_subject`;
4. that row is currently `ACTIVE`.

Unknown subjects and DISABLED Admins receive the same generic denial. The runtime never creates an Admin row, links an identity, or updates `external_auth_subject` during login.

### LOCK-003 — state, nonce, and PKCE verifier are separate capabilities

The OIDC flow uses three independent random values and three separate encrypted HttpOnly cookies:

- `state`: OAuth request/callback CSRF binding;
- `nonce`: ID Token replay/substitution binding;
- `code_verifier`: Authorization Code interception defense.

Each cookie has a distinct name, encrypted-cookie purpose, payload schema, and parser. PKCE uses only S256; `plain` fallback is forbidden.

The callback first reads all required cookie values, then schedules every flow cookie for deletion on every success or failure response. It must never delete a cookie before reading it for validation, and it must never leave reusable flow cookies after callback handling.

### LOCK-004 — ID Token validation is cryptographic and fail-closed

The runtime accepts only JWT ID Tokens that satisfy:

- header `alg` is exactly `RS256`;
- signature verifies against an RSA signing key from the configured issuer's trusted JWKS;
- `iss` exactly equals configured `ADMIN_AUTH_ISSUER`;
- `aud` contains and is valid for configured `ADMIN_AUTH_CLIENT_ID`;
- `exp` is valid with a bounded clock skew;
- `iat` is not unreasonably in the future and is recent enough for the current login flow, with bounded clock skew;
- `nonce` exactly matches the independently stored nonce;
- `sub` is a bounded, non-empty string;
- `aud` is either the exact configured client ID string or a single-item array containing only that client ID;
- when `azp` is present, it exactly equals configured `ADMIN_AUTH_CLIENT_ID`.

The clock-skew allowance is exactly 60 seconds. The ID Token must satisfy `iat >= flowStartedAt - 60 seconds`, `iat <= now + 60 seconds`, and `now < exp + 60 seconds`. Optional `nbf`, when present, must satisfy `nbf <= now + 60 seconds`. The three flow cookies expire after exactly 10 minutes, so a token from an older flow cannot qualify.

For a string `aud`, it must equal the configured client ID. For an array `aud`, it must contain exactly one item and that item must equal the configured client ID. Any multi-audience token is rejected even when `azp` equals the client ID. If `azp` is present in either accepted audience form, it must equal the client ID. Supporting additional audiences later requires a separately approved explicit trusted-audience policy. Unsupported algorithms, missing/ambiguous `kid`, malformed Base64URL, oversized responses, or ambiguous keys fail closed.

All security-relevant JSON uses a bounded duplicate-member-rejecting parser before typed validation. Duplicate members in the JWT protected header/payload, discovery document, JWKS document or individual JWK, and token response fail closed rather than relying on `JSON.parse` last-value behavior.

JWKS is obtained only from OIDC discovery rooted at the configured issuer. The discovery document's `issuer` must exactly match configuration. The runtime never follows a Token-controlled `jku`, `x5u`, embedded key, or arbitrary JWKS URL. Authorization, token, and JWKS endpoints must be absolute HTTPS URLs in production and contain no URL credentials.

### LOCK-005 — OIDC redirect and token handling are server-owned

The redirect URI is derived from server configuration and fixed to the Admin callback. Request query/body/header values cannot change it. Post-login navigation is fixed to `/admin` for WP-11.

Authorization Code, access token, refresh token, and raw ID Token are never stored in the database, Admin session, logs, Audit metadata, or client bundle. They are retained only for the minimum callback operation and then discarded. Refresh-token use is not implemented.

### LOCK-006 — Admin and consumer sessions are separate trust domains

The Admin session and consumer session use different:

- cookie names;
- cryptographic secrets;
- encryption purposes;
- payload schemas/types;
- parsers/validators;
- lookup tables and status checks;
- login/logout routes.

The Admin cookie is `preppy_admin_session`. It uses an Admin-only session secret and an Admin-only purpose. Consumer code never reads or accepts it. Admin code never reads or accepts `preppy_user_session`.

The Admin session cookie uses `Path=/` because both `/admin/**` pages and `/api/admin/**` handlers require it. This broad path does not broaden trust because cookie name, cryptographic domain, parser, and authorization lookup remain separate.

### LOCK-007 — An 8-hour cookie is not an 8-hour authorization grant

The Admin session payload is limited to:

```ts
type AdminSession = {
  version: 1;
  adminUserId: string;
  issuedAt: number;
  expiresAt: number;
};
```

It is encrypted and authenticated, HttpOnly, SameSite=Lax, Secure in production, and expires after eight hours. Every protected page render and API request still reloads `admin_users` and requires `status = 'ACTIVE'`. Disabling an Admin therefore blocks the next request even when a valid cookie remains.

### LOCK-008 — Stale writes never overwrite current truth

Verification adapters pass the expected current/version identifier required by WP-10B. A mismatch returns `409 Conflict`, does not write, and renders:

```text
다른 운영자가 먼저 변경했을 수 있습니다.
최신 데이터를 다시 확인한 뒤 변경 여부를 판단해주세요.
```

The client reloads current data. Automatic merge and last-write-wins are forbidden.

### LOCK-009 — Operations is read-only in WP-11

Outbox, Dead Letter, and Audit records can be inspected but not changed. Retry, Cancel, Dead-letter, lease cleanup, and arbitrary status editing are absent because no hardened application transition command currently exists.

Worker lifecycle work must first introduce and validate canonical transition commands. A later Admin mutation may call those commands; WP-11 does not pre-empt them.

### LOCK-010 — Operator reasons are allowlisted, not arbitrary context

The client never supplies `AdminCommandContext.reason` directly. Where operator intent is required, a strict route schema accepts only a WP-11 allowlisted reason code and the adapter maps it to the command context or command override field.

Source lifecycle reasons are derived from the selected operation/outcome:

```text
URL_CORRECTION        -> SOURCE_URL_CORRECTION_CONFIRMED
SOURCE_REPLACEMENT    -> SOURCE_REPLACEMENT_CONFIRMED
Bind/Unbind           -> SOURCE_BINDING_UPDATED
NOT_FOUND             -> SOURCE_NOT_FOUND
ACCESS_ERROR          -> SOURCE_ACCESS_ERROR
PARSE_ERROR           -> SOURCE_PARSE_ERROR
TIMEOUT               -> SOURCE_TIMEOUT
```

A materiality override exposes only:

```text
MATERIALITY_USER_IMPACT_CONFIRMED
MATERIALITY_NON_USER_FACING_CONFIRMED
```

The selected override reason is forwarded to WP-10B only when an override is present. Free-form PII-bearing reason text is not accepted.

### LOCK-011 — `client_secret_basic` uses RFC 6749 credential encoding

Before HTTP Basic construction, the client ID and client secret are each encoded with the `application/x-www-form-urlencoded` encoding required by [RFC 6749 section 2.3.1](https://www.rfc-editor.org/rfc/rfc6749#section-2.3.1). The encoded values, not the raw credentials, are joined with one `:` and then Base64-encoded for the `Authorization: Basic ...` header.

Raw `Base64(clientId + ":" + clientSecret)` construction is forbidden. Tests must include credentials containing spaces, `:`, `+`, and `%` so this rule cannot regress into raw concatenation or `encodeURIComponent` semantics.

### LOCK-012 — Discovery capabilities are validated before starting a flow

The trusted discovery document must satisfy all capabilities required by WP-11:

- `response_types_supported` contains `code`;
- `id_token_signing_alg_values_supported` contains `RS256`;
- when `grant_types_supported` is present, it contains `authorization_code`;
- when `token_endpoint_auth_methods_supported` is present, it contains `client_secret_basic`; omission is accepted because OIDC Discovery defaults it to `client_secret_basic`;
- when `code_challenge_methods_supported` is present, it contains `S256`.
- when `response_modes_supported` is present, it contains `query`; omission is accepted under the OIDC default response-mode behavior.

Missing required capabilities or present-but-incompatible optional capability lists fail fast before state, nonce, verifier, or redirect issuance. Runtime fallback to another response type, signing algorithm, grant, token authentication method, or PKCE method is forbidden.

### LOCK-013 — External protocol JSON is extensible but unambiguous

OIDC Discovery, OAuth token responses, JWKS/JWK objects, JWT protected headers, and ID Token claims are extensible protocol objects. Known security fields are type- and value-validated; unknown non-critical extension members are accepted and stripped/ignored. Blanket strict-object rejection is forbidden for these external objects.

Duplicate decoded member names, malformed JSON, invalid UTF-8, type mismatches, missing/invalid required security fields, and unsupported critical extensions fail closed. The bounded duplicate-member-rejecting parser remains the only external security JSON parser. PREPPY-owned `/api/admin/**` path/body schemas remain strict and reject unknown fields.

Unknown non-critical JWT header members are ignored. Any unsupported `crit` entry is rejected, and `jku`, `x5u`, or embedded `jwk` never redirects trust or selects a key.

### LOCK-014 — Security JSON starts from bounded raw bytes and fatal UTF-8

Discovery, token, and JWKS responses follow `bounded raw bytes -> TextDecoder('utf-8', { fatal: true }) -> parseSecurityJson -> typed validation`. Permissive `response.text()` is not a security boundary. JWT header and payload segments follow `canonical Base64URL -> bytes -> fatal UTF-8 -> parseSecurityJson -> typed validation`. Malformed UTF-8 fails closed at every surface.

### LOCK-015 — Logout clears an Admin cookie without requiring Admin authorization

`POST /api/admin/auth/logout` requires same-origin validation, then unconditionally clears `preppy_admin_session` and succeeds idempotently. ACTIVE lookup and even valid session parsing are not prerequisites: valid, DISABLED, expired, tampered, and missing Admin sessions can all be cleared. The consumer cookie is untouched. Cross-origin requests and non-POST methods remain rejected.

## 5. Application and Route Architecture

### 5.1 Public/Admin shell separation

The root layout becomes the neutral HTML/body boundary. Existing public routes move under `app/(public)` with a public layout that renders the current SiteHeader, `<main>`, and SiteFooter. Route groups do not alter URLs, so existing public URLs remain unchanged.

`app/admin` owns a separate Admin layout with:

- desktop-first left navigation;
- a compact Admin identity/logout area;
- dense but readable operational content;
- responsive navigation for tablet/mobile;
- Admin-only CSS namespace;
- no public header or footer.

Build and route-contract tests prove that the public paths remain unchanged after the route-group move.

### 5.2 Server-only module boundaries

WP-11 introduces focused modules under `src/modules/admin/**`:

```text
auth config / OIDC discovery and validation / sessions / guard
HTTP mutation adapter and safe response helpers
read-only operational projections
monitoring detail projection
PII-safe DTOs and query-input schemas
```

Admin query services may read through the runtime database executor. They return explicit DTOs and never leak raw database rows.

Admin mutation routes may not call Drizzle updates/inserts directly. They authenticate, validate, create a server-owned `AdminCommandContext`, and invoke a WP-10B command.

### 5.3 Admin information architecture

Protected routes are:

```text
/admin
/admin/monitoring
/admin/monitoring/[targetType]/[targetId]/[sourceId]/[role]
/admin/institutions
/admin/institutions/[id]
/admin/opportunities
/admin/opportunities/[id]
/admin/sources
/admin/sources/[id]
/admin/articles
/admin/notifications
/admin/users
/admin/operations
/admin/operations/outbox
/admin/operations/deliveries
/admin/operations/audit
/admin/operations/health
```

`/admin/login`, `/admin/auth/start`, and `/admin/auth/callback` are the only unauthenticated Admin pages/handlers. They still use private/no-store/noindex controls.

## 6. Admin OIDC Flow

### 6.1 Configuration

The Admin auth config parser owns exactly:

- application origin;
- one exact OIDC issuer;
- one client ID;
- the confidential client secret;
- a distinct Admin session secret;
- a distinct Admin OIDC-flow cookie secret;
- the fixed callback URI derived from the application origin.

Secrets must meet the repository's minimum entropy/length rule and must be distinct from the consumer session/state/intent secrets. Configuration is server-only and never serialized to Client Components.

The exact environment names are `APP_BASE_URL`, `ADMIN_AUTH_ISSUER`, `ADMIN_AUTH_CLIENT_ID`, `ADMIN_AUTH_CLIENT_SECRET`, `ADMIN_SESSION_SECRET`, and `ADMIN_OIDC_FLOW_SECRET`. No aliases are supported. Admin OIDC/session configuration is loaded and validated lazily at the Admin auth capability boundary, not at generic module import time; database CLI commands, public pages, unrelated unit tests, and type-only imports do not require Admin credentials.

The issuer is an absolute URL with no user info, query, or fragment. Its exact configured string is the comparison value. Following [OpenID Connect Discovery 1.0 section 4.1](https://openid.net/specs/openid-connect-discovery-1_0.html#ProviderConfig), any terminating `/` is removed only while constructing the discovery URL, then `/.well-known/openid-configuration` is appended. The configured issuer itself is not otherwise normalized for exact `issuer`/`iss` comparison. No request-derived discovery URL is accepted.

WP-11 supports `client_secret_basic` at the token endpoint under LOCK-011. Discovery capability validation follows LOCK-012. `client_secret_post`, `none`, and dynamically selected methods are not used in WP-11.

### 6.2 Login start

`GET /admin/auth/start`:

1. applies the bounded Admin login rate limiter;
2. loads and validates OIDC discovery from the configured issuer;
3. creates an independent flow ID plus cryptographically random state, nonce, and verifier values;
4. derives `code_challenge = BASE64URL(SHA-256(code_verifier))`;
5. writes three short-lived encrypted flow cookies with distinct purposes;
6. redirects to the discovered authorization endpoint with fixed redirect URI, `response_type=code`, `scope=openid`, state, nonce, and `code_challenge_method=S256`.

No user-provided return URL or redirect URI is accepted.

The flow cookies are named `preppy_admin_oidc_state`, `preppy_admin_oidc_nonce`, and `preppy_admin_oidc_pkce`. Each payload contains its one capability, the common flow ID, and `flowStartedAt`; this binds the three independently protected cookies to the same login attempt without reusing one capability for another purpose. They use HttpOnly, SameSite=Lax, Secure in production, `Path=/admin/auth`, and `Max-Age=600`.

### 6.3 Callback

`GET /admin/auth/callback`:

1. reads the three flow cookies and callback parameters;
2. marks all flow cookies for deletion for every eventual response;
3. requires the three flow IDs/start times to match and the flow age to be at most 10 minutes;
4. requires exactly one non-empty `state` parameter and validates it with constant-time equality;
5. accepts exactly one of these shapes: one non-empty `code` and no `error`, or one non-empty `error` and no `code`; duplicate, empty, or ambiguous parameters fail closed;
6. rejects provider error callbacks with a generic denial;
7. exchanges the code at the configured token endpoint using `client_secret_basic`, the fixed redirect URI, and the exact verifier;
8. validates bounded token-response size and shape;
9. validates the ID Token under LOCK-004;
10. takes `externalAuthSubject` only from the verified `sub` claim;
11. loads the matching `admin_users` row and requires ACTIVE;
12. issues the separate eight-hour Admin session and redirects to `/admin`.

No DB transaction is held during discovery, token exchange, or JWKS fetch. The only database operation is the final read-only Admin lookup.

### 6.4 JWKS handling

Discovery, token, and JWKS fetches use a five-second timeout, `redirect: "error"`, a 64 KiB raw-byte response limit, fatal UTF-8 decoding, and bounded known-field validation under LOCK-013/014. The encoded ID Token limit is 16 KiB. JWKS accepts at most 50 keys.

JWKS retrieval is keyed by the exact configured issuer and discovered `jwks_uri`. The single-issuer in-process cache lifetime is at most five minutes and may use only a shorter trusted HTTP cache lifetime. A cache miss or key rotation re-fetches only that trusted URI. On an unknown `kid`, one refresh is allowed before denial. Redirects, unbounded documents, non-RSA/signing keys, and ambiguous matching keys are rejected.

### 6.5 Logout

`POST /api/admin/auth/logout` follows LOCK-015: same-origin validation, unconditional Admin-cookie clearing, and idempotent success without an ACTIVE guard. It has no effect on the consumer session.

## 7. Request Guard, Cache, and Indexing

Every protected Server Component and Route Handler performs:

```text
read only preppy_admin_session
  -> decrypt and validate Admin payload
  -> load admin_users by adminUserId
  -> require ACTIVE
  -> return bounded Admin principal
```

The layout redirect is presentation convenience, not the API authorization boundary. Every protected/domain `/api/admin/**` handler invokes the guard independently. Logout is the sole authorization exception and follows LOCK-015 so an invalid or disabled session can be cleared.

All Admin routes:

- are force-dynamic;
- opt out of data caching;
- return `Cache-Control: private, no-store` where a response header applies;
- publish `noindex, nofollow` metadata/headers;
- are excluded from sitemaps;
- do not reuse public cached DTOs as authorization decisions.

### 7.1 Rate-limit and replay hardening

WP-11 reuses a singleton bounded process-local limiter for Admin login as an emergency ceiling and a separate process-local consumed-flow registry as defense in depth. The encrypted, callback-consumed cookies, nonce, PKCE, and one-time Authorization Code remain mandatory regardless of that registry.

Process-local enforcement does not coordinate hosts, serverless instances, restarts, or regions. Production deployment therefore still requires a trusted edge/shared rate limiter and shared replay telemetry/enforcement appropriate to the selected platform. WP-11 records this as carried-forward production hardening and does not add Redis, a rate-limit table, or a start-time database write.

## 8. Read Projections and PII Policy

All lists use bounded pagination or conservative row limits, stable sorting, and explicit selected fields.

### Dashboard

Shows only real operational counts/query results:

- overdue Monitoring items;
- due Monitoring items;
- recent verified Opportunity changes;
- unavailable Sources;
- pending and dead-letter Outbox counts.

### Monitoring

Uses `getMonitoringQueue` without re-sorting. Supported URL filters map exactly to the WP-10B filter schema: due state, priority, target type, role, and Source lifecycle.

### Institutions

Shows identity, category, publication/operational state, active Source-binding count, and current Opportunity summary. No raw CRUD controls are introduced.

### Opportunities

Shows Institution, Opportunity identity, server-owned truth mode, publication/business state, current version summary, binding count, and recent canonical change.

### Sources

Shows canonical URL, type, authority, lifecycle, monitor config, active bindings, and latest observation. It never renders snapshot bodies, normalized raw text, response bodies, or arbitrary metadata.

### Articles

Shows title, type, status, slug, publication timestamp, and relation counts. It does not return `contentHtml` or provide edit/publish controls.

### Notifications

Shows Notification identity/status/signal and aggregate Delivery/Attempt counts. It does not resolve recipients, send messages, or show recipient email/provider payloads.

### Users

Shows only canonical user ID, status, creation time, Follow count, and a derived email-readiness state. It excludes raw email, Kakao subject, tokens, child name, and exact date of birth.

### Operations

Shows bounded Outbox fields, dead-letter rows, safe Audit summaries, and liveness status. Audit metadata is projected through an allowlist and never dumped as raw JSON. Existing `/api/health` remains liveness-only.

## 9. Monitoring Detail Workflow

The detail projection loads one current queue item and the minimum current truth/binding/fact data needed to make a decision:

```text
Current truth
Source identity and safe official link
Last checked / next due
Expected-current/version token
No Change action
Change Found candidate form
InstitutionFact verification form where applicable
Source Unavailable action
URL Correction action
Source Replacement action
Bind / Unbind actions
```

The route includes target type, target ID, Source ID, and binding role because one target can have multiple canonical Source bindings. The server reconstructs and validates the WP-10B binding identity; it does not trust a client-generated display key.

The official link is rendered only for an absolute HTTP(S) URL and uses `noopener noreferrer`.

The client may manage form state, confirmation dialogs, and Current-vs-Candidate presentation. It may not decide truth mode, final change type, materiality policy, authority, binding conflicts, or Outbox eligibility.

Source move is rendered as two separate actions:

- **URL_CORRECTION:** same Source identity, explicit provenance-continuity confirmation, URL only;
- **SOURCE_REPLACEMENT:** new/reused Source identity, with a clear warning that historical Evidence remains attached to the old Source.

No UI control automatically chooses between the modes.

## 10. Mutation API Contract

The WP-11 mutation surface is:

```text
POST   /api/admin/monitoring/sources/{sourceId}/no-change
POST   /api/admin/opportunities/{opportunityId}/verify
POST   /api/admin/institutions/{institutionId}/facts/{factType}/verify
POST   /api/admin/sources/{sourceId}/unavailable
POST   /api/admin/sources/{sourceId}/moved
POST   /api/admin/institutions/{institutionId}/source-bindings
DELETE /api/admin/institutions/{institutionId}/source-bindings/{sourceId}/{role}
POST   /api/admin/opportunities/{opportunityId}/source-bindings
DELETE /api/admin/opportunities/{opportunityId}/source-bindings/{sourceId}/{role}
POST   /api/admin/auth/logout
```

Every domain mutation follows one pipeline:

```text
Admin session validation + ACTIVE DB recheck
  -> same-origin validation
  -> strict Zod route/body validation
  -> server-generated correlationId and occurredAt
  -> server-owned adminUserId and derived/allowlisted canonical reason code
  -> createAdminCommandContext
  -> invoke WP-10B command
  -> map typed result/error to safe HTTP response
```

Strict request schemas reject `adminUserId`, `truthMode`, change type, Outbox policy, and unknown fields supplied by a client.

Logout is not a domain mutation and is the sole pipeline exception: it performs same-origin validation and unconditional Admin-cookie clearing without `requireCurrentAdmin()`.

The Source move endpoint uses the existing WP-10B discriminated union exactly:

```ts
type SourceMoveBody =
  | {
      moveMode: "URL_CORRECTION";
      newUrl: string;
      provenanceContinuityConfirmed: true;
    }
  | {
      moveMode: "SOURCE_REPLACEMENT";
      replacement:
        | { kind: "CREATE"; canonicalUrl: string; sourceName: string }
        | { kind: "REUSE"; replacementSourceId: string };
    };
```

The path owns `sourceId`; a body-supplied duplicate is rejected. The adapter derives the fixed reason in LOCK-010 and invokes `markSourceMoved`. WP-10B Source commands own row locks and eligibility/conflict detection; WP-11 adds no direct pre-write or alternate expected-current policy.

### No Change

Calls ConfirmNoChange. Success is shown only after commit and means “Source 확인 완료,” not truth freshness mutation. It creates no Version, OpportunityChange, customer Outbox, Notification, or Delivery.

### Opportunity verification

The form sends the typed candidate fields, Source/Evidence reference, expected current identifier, and optional canonical materiality override/reason pair. The server invokes the unified WP-10B verification dispatcher, which resolves Native vs Legacy-backed truth mode.

### InstitutionFact verification

The form sends the canonical Fact type, typed candidate value/display/validity fields, Source/Evidence reference, and expected current identifier. It invokes the WP-10B Fact command and makes no customer-notification claim.

### Source lifecycle and bindings

Unavailable, URL correction, Source replacement, and Bind/Unbind adapters pass only the fields accepted by the corresponding WP-10B command. URL correction requires explicit provenance continuity. Source replacement never rewrites historical Evidence.

## 11. Errors and Operator UX

Responses use the shared safe application-error envelope and include a server-generated correlation ID.

- malformed input: `400` with bounded safe field issues;
- absent/invalid session: generic unauthenticated handling;
- unknown or inactive OIDC subject: same generic access denial;
- authorization/ineligible command: safe `403`;
- missing target: safe `404`;
- stale expected-current or binding conflict: `409` and reload guidance;
- temporary provider/runtime failure: safe retryable response;
- unexpected database/provider errors: generic response without SQL, constraint, stack, token, or raw payload.

Risky Source replacement and Unbind actions require an accessible confirmation step. Forms provide labels, keyboard focus, error summaries, and post-submit status announcements.

## 12. UI Direction and Accessibility

The Admin UI is operational rather than promotional:

- desktop-first left navigation;
- dense semantic tables with readable spacing;
- state chips with text in addition to color;
- clear primary/secondary/destructive action hierarchy;
- responsive table alternatives or horizontal containment on narrow screens;
- visible keyboard focus;
- correctly associated labels/descriptions;
- accessible dialogs and confirmation copy;
- no decorative motion required for core workflows.

The visual system may reuse PREPPY typography tokens but uses an Admin-specific layout and component namespace so public presentation changes do not silently alter operational controls.

## 13. Test Strategy

Implementation follows inline TDD: each security or command boundary begins with a failing focused test, then the minimum implementation, then refactoring while green.

### Unit tests

OIDC tests cover:

- independent state, nonce, and verifier generation/cookies/parsers;
- S256 challenge and rejection of plain/missing PKCE;
- valid RS256 signature/JWKS path;
- invalid signature, algorithm confusion, unknown/ambiguous `kid`;
- wrong issuer, audience, nonce, expiry, future/stale `iat`, optional `nbf`;
- exact string/single-item-array audience acceptance, optional `azp` validation, and unconditional multi-audience rejection;
- refusal to follow Token `jku`/`x5u`;
- oversized/malformed discovery, JWKS, token response, and JWT;
- duplicate JSON members in JWT, discovery, JWKS/JWK, and token response;
- acceptance/stripping of unknown non-critical protocol extensions and rejection of unsupported `crit`;
- malformed UTF-8 rejection in discovery, token response, JWKS, and JWT header/payload;
- logout clearing valid, disabled, expired, tampered, and missing Admin sessions without changing the consumer cookie;
- fixed redirect URI and rejection of client actor/truth-mode fields;
- Admin/consumer cookie name, secret, purpose, parser, and payload separation;
- tampered and expired Admin session denial.

Projection and adapter tests cover filter parsing, PII allowlists, unsafe Source URLs, no-store/noindex, generic errors, and route-to-command wiring.

### Integration tests

Dedicated PostgreSQL tests cover:

- verified `sub` resolving only an existing ACTIVE Admin;
- unknown and DISABLED subjects failing identically;
- ACTIVE status recheck on every protected request;
- consumer session inability to authorize Admin;
- adapter-derived actor/correlation context;
- Origin rejection;
- ConfirmNoChange producing Observation/Audit only;
- Native verification preserving WP-10B Version/Evidence/Change/Audit/Outbox atomicity;
- stale expected-current producing zero writes and `409`;
- both explicit Source move modes;
- Bind/Unbind command delegation;
- Operations remaining read-only;
- no Notification/Delivery creation by Admin adapters.

### Browser fixture

Browser verification uses a separate fake single OIDC issuer process with an ephemeral RSA key, discovery document, authorization endpoint, PKCE-enforcing token endpoint, and JWKS endpoint. The application uses the normal OIDC runtime against that issuer; there is no test-only login bypass in application code.

The dedicated test database contains a pre-provisioned ACTIVE Admin whose `external_auth_subject` matches the fake issuer's signed ID Token.

Desktop Chromium verifies:

```text
/admin -> login
OIDC login -> Dashboard
Monitoring -> due item
No Change -> queue freshness update
Native Change Found -> truth/Audit/applicable Outbox update
Source URL Correction
Source Replacement provenance warning and command
Logout -> protected access denied
```

The browser fixture also verifies that Notification and Delivery counts remain unchanged. Tablet and mobile runs verify navigation, tables/forms, focus, and action usability.

### Final verification

The completion gate runs:

- focused WP-11 tests;
- controlled full suite with a freshly recreated dedicated test database;
- repeated concurrency/stale-write checks where applicable;
- typecheck;
- lint;
- changed-file formatting check;
- production build and route inventory check;
- desktop/tablet/mobile browser flows;
- Git diff and prohibited-scope audit.

## 14. Expected File Scope

Expected changes are limited to:

- `src/modules/admin/**`;
- `app/admin/**` and `app/api/admin/**`;
- the public route-group/layout move required to keep a separate Admin shell;
- small shared cookie/header/presentation helpers only when necessary;
- WP-11 unit, integration, and browser fixtures/tests;
- this design and the later implementation plan.

The diff must not contain migration, schema, package, Worker, Email, Notification resolver, CMS editor/sanitizer, GA4 transport, or production cutover files.

## 15. Acceptance Criteria

WP-11 is complete only when:

1. OIDC Authorization Code + PKCE S256, RFC 6749-compliant `client_secret_basic`, discovery capability/response-mode fail-fast checks, extensible-but-unambiguous external JSON, fatal UTF-8 decoding, single-client audience policy, and strict RS256/JWKS/claim validation pass adversarial tests.
2. Only a verified subject matching an existing ACTIVE Admin receives a separate Admin session.
3. Admin deactivation blocks the next protected request.
4. Consumer authentication never grants Admin access and neither parser accepts the other's cookie.
5. All Admin surfaces are private, dynamic, no-store, noindex, and nofollow.
6. Monitoring uses the WP-10B queue ordering and filters.
7. Every Admin mutation invokes a WP-10B command through the approved adapter pipeline.
8. No-change produces no Product signal; verified change preserves WP-10B atomic semantics.
9. Stale writes return `409` with zero overwrite.
10. Source move modes are explicit and preserve historical Evidence provenance.
11. Operations is read-only and exposes no arbitrary payload/Audit JSON.
12. User, Notification, Source, and Audit views satisfy their PII allowlists.
13. Required browser flows and responsive checks pass against a dedicated database and fake issuer.
14. No package, migration, schema change, commit, or push is made.
15. Logout clears valid/disabled/expired/tampered/missing Admin cookies idempotently after Origin validation without requiring ACTIVE, and leaves the consumer cookie untouched.

### PRD traceability boundary

| PRD requirement | WP-11 disposition |
| --- | --- |
| `FR-ADM-001` Auth | Implemented in WP-11 |
| `FR-ADM-002` Commands | Implemented in WP-11 through typed WP-10B application commands |
| `FR-ADM-003` Audit | Implemented in WP-11 through command-owned audit plus read-only inspection |
| `FR-ADM-004` Monitoring Queue | Implemented in WP-11 |
| `FR-ADM-005` Articles | Intentionally deferred to WP-13 Article CMS; WP-11 provides inspection only, so this is not classified as an unmet WP-11 requirement |
| `FR-ADM-006` Notification Ops | Inspection is implemented; cancel/retry is intentionally deferred until WP-12 introduces safe Worker/Notification transition commands, so this is not classified as an unmet WP-11 requirement |
| `FR-ADM-007` Outbox Ops | Inspection is implemented; retry/cancel/dead-letter is intentionally deferred until WP-12 introduces safe Outbox transition commands, so this is not classified as an unmet WP-11 requirement |
| `FR-ADM-008` User Support | Implemented as minimal PII-safe lookup |
| `FR-ADM-009` Data Quality | Implemented through bounded integrity warnings |
| `FR-ADM-010` Health | Implemented as read-only Admin operational health; `/api/health` remains liveness-only |

## 16. Next Phase Boundary

WP-11 stops after the Admin Runtime and Monitoring Console pass verification. The next recommended phase is WP-12 — Notification Resolver / Worker / Email. WP-12 must define safe Outbox and Worker transition commands before any corresponding Admin mutation is added.
