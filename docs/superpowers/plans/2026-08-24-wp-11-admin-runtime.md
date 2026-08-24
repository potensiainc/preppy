# WP-11 Admin Runtime / Monitoring Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Use `superpowers:test-driven-development` for every production-code task and `superpowers:verification-before-completion` before reporting completion. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build PREPPY's private Admin OIDC runtime, server-only operational projections, Monitoring Console, and typed WP-10B command adapters without weakening identity, provenance, stale-write, PII, or transaction boundaries.

**Architecture:** A server-only `src/modules/admin/**` boundary owns strict OIDC parsing/verification, independently protected flow cookies, a distinct Admin session, ACTIVE-Admin request guards, PII-allowlisted read models, and mutation adapters. The Next.js App Router keeps public URLs unchanged under `app/(public)`, renders `/admin/**` in a separate private shell, and accepts writes only through `/api/admin/**`; all truth decisions and mutations remain in WP-10B application commands.

**Tech Stack:** TypeScript 5.9, Node.js 22+, Next.js 16 App Router/Server Components, React 19, Zod 4, Drizzle ORM 0.45, PostgreSQL, Vitest 4, Node `crypto`, platform `fetch`.

**Spec:** `docs/superpowers/specs/2026-08-24-wp-11-admin-runtime-design.md`

## Global Constraints

- Implement inline TDD: establish RED, add the minimum implementation, refactor only while GREEN, then run a focused checkpoint.
- Add no package, migration, schema, Worker, Email provider, Notification resolver, CMS editor/sanitizer, GA4 transport, or production deployment change.
- Do not commit or push. Normal plan commit checkpoints are replaced with test/diff checkpoints.
- Support exactly one configured OIDC issuer and one confidential client. Do not auto-provision or auto-link Admin accounts.
- OIDC success grants a PREPPY Admin session only when the verified `sub` matches an existing ACTIVE `admin_users.external_auth_subject`.
- Use Authorization Code + PKCE S256 only. State, nonce, and verifier remain different capabilities, cookies, payloads, purposes, and parsers.
- `client_secret_basic` MUST encode each credential with RFC 6749 section 2.3.1 `application/x-www-form-urlencoded` rules before Basic construction. Raw credential concatenation is forbidden.
- All external security JSON—discovery, JWKS/JWK, JWT header/payload, and token response—must pass one bounded duplicate-member-rejecting parser before typed validation. External protocol objects accept and strip/ignore unknown non-critical extensions; PREPPY Admin request bodies remain strict.
- Discovery/token/JWKS transport and JWT segment decoding use bounded raw bytes plus fatal UTF-8 before JSON parsing; permissive `response.text()` is forbidden at these security boundaries.
- ID Token audience is limited to the exact client ID as a string or single-item array. Any multi-audience token is rejected even with correct `azp`; any present `azp` must equal the client ID.
- Consumer and Admin cookies, secrets, purposes, payloads, parsers, repositories, and logout routes remain separate trust domains.
- Every protected page and API request reloads `admin_users` and requires ACTIVE; an 8-hour cookie is not an 8-hour authorization grant.
- Every Admin domain mutation follows `ACTIVE session -> Origin -> strict Zod -> server context -> WP-10B command -> safe response`. Logout is the sole exception: `Origin -> unconditional Admin-cookie clear -> idempotent success`, with no ACTIVE/session-validity prerequisite.
- UI and Route Handlers do not mutate the database directly and do not calculate `truthMode`, final change type, materiality policy, authority, or Outbox policy.
- Expected-current mismatch is `409 Conflict` with zero overwrite, automatic merge, or last-write-wins.
- Operations is read-only. No retry, cancel, dead-letter, lease cleanup, or status mutation is introduced.
- `FR-ADM-005`, the mutation portion of `FR-ADM-006`, and the mutation portion of `FR-ADM-007` are intentionally deferred to WP-13/WP-12; they are not classified as unmet WP-11 requirements.

## Explicit Execution-Scope Rulings

- Net-new Opportunity creation/publish is not added in WP-11 because the approved execution prompt enumerates verification and existing WP-10B commands only; introducing a new canonical creation command would be a redesign. Carry it forward for separate command/API approval. Cost if wrong: the console can verify existing Opportunities but cannot originate a new one.
- Privileged exact-email search and Admin-driven User deletion are not added in WP-11; `FR-ADM-008` is limited here to the approved PII-safe inspection projection. Cost if wrong: advanced support cases remain manual/outside this console.
- No fictional kill-switch state is added because the repository has no canonical kill-switch configuration. Admin health exposes only real read-only runtime/data-quality state. Cost if wrong: kill-switch visibility waits for the phase that introduces those controls.

## Planned File Structure

- `src/modules/admin/auth/**`: Admin config, bounded security JSON, discovery/OIDC client, JWKS/JWT verification, flow cookies, Admin session, repository, runtime, rate-limit/replay hardening, and safe HTTP helpers.
- `src/modules/admin/read-model/**`: bounded DTOs and side-effect-free Dashboard, Monitoring, Institution, Opportunity, Source, Article, Notification, User, Operations, and health projections.
- `src/modules/admin/http/**`: strict route schemas, Admin command-context creation, safe error/response mapping, and WP-10B command adapters.
- `app/(public)/**`: existing public pages moved under a route group without URL changes.
- `app/admin/**`: unauthenticated login/auth endpoints plus protected Admin shell, pages, and workflow components.
- `app/api/admin/**`: logout and typed mutation Route Handlers only.
- `tests/unit/wp11-*.test.ts`: protocol, parser, cookie, session, UI/static-contract, and adapter unit tests.
- `tests/integration/wp11-*.test.ts`: Admin lookup/guard, read projection, mutation/transaction, stale-write, and PII tests.
- `tests/browser/wp11/**`: fake issuer, deterministic seed harness, and browser verification runner/checklist without an application login bypass.

---

### Task 1: Isolate the bounded duplicate-member-rejecting security JSON parser

**Files:**
- Create: `src/modules/admin/auth/security-json.server.ts`
- Test: `tests/unit/wp11-security-json.test.ts`

**Interfaces:**
- Produces: `parseSecurityJson(text, limits)` and typed `SecurityJsonError` categories.
- Consumes: UTF-8 text already bounded by the caller's transport limit.
- Security boundary: this is the only JSON decoder permitted for discovery, JWKS/JWK, token responses, and JWT protected header/payload.

- [ ] **Step 1: Write RED tests for duplicate and ambiguous object members**

Cover root and nested duplicates, duplicates inside array objects, decoded-equivalent keys such as `"alg"` and `"\u0061lg"`, empty input, trailing data, invalid escapes/surrogates, and invalid numbers. Assert ordinary unique JSON preserves JSON value semantics, including unknown keys; the parser enforces syntax/ambiguity/bounds and does not impose protocol semantics.

```ts
expect(() => parseSecurityJson('{"alg":"RS256","alg":"none"}')).toThrow(
  SecurityJsonError,
);
expect(() =>
  parseSecurityJson('{"alg":"RS256","\\u0061lg":"none"}'),
).toThrow(SecurityJsonError);
expect(parseSecurityJson('{"keys":[{"kid":"one"}]}')).toEqual({
  keys: [{ kid: "one" }],
});
```

- [ ] **Step 2: Run the parser test and verify RED**

Run: `npm test -- tests/unit/wp11-security-json.test.ts`

Expected: FAIL because the bounded parser does not exist.

- [ ] **Step 3: Implement one recursive-descent parser with explicit limits**

Use a scanner/parser local to `security-json.server.ts`; do not preprocess with regular expressions and do not parse external protocol data with `JSON.parse`. Decode a key before checking a per-object `Set<string>`, so escaped-equivalent duplicates fail. Enforce defaults and allow stricter call-site overrides:

```ts
export type SecurityJsonLimits = Readonly<{
  maxBytes: number;          // default 65_536
  maxDepth: number;          // default 20
  maxObjectMembers: number;  // default 1_000 per object
  maxArrayItems: number;     // default 1_000 per array
  maxStringBytes: number;    // default 16_384
}>;

export function parseSecurityJson(
  text: string,
  limits?: Partial<SecurityJsonLimits>,
): unknown;
```

Reject `__proto__`/constructor side effects by producing null-prototype intermediate objects or safe entry reduction; return ordinary JSON-compatible values only after parsing completes. Do not reject unknown semantic members—the external protocol schema layer validates known fields and strips/ignores unknown non-critical extensions.

- [ ] **Step 4: Add adversarial bound tests**

Test byte limit, depth 21, 1,001 members, 1,001 array items, oversized strings, exponent overflow, control characters, trailing tokens, and many near-limit unique members. Assert failure is deterministic and the error never echoes source JSON.

- [ ] **Step 5: Run focused tests and checkpoint**

Run: `npm test -- tests/unit/wp11-security-json.test.ts`

Run: `git diff --check`

Expected: PASS; the parser is isolated in one server-only module; no OIDC file duplicates parsing logic.

### Task 2: Add Admin configuration, discovery validation, PKCE, and RFC-compliant token authentication

**Files:**
- Modify: `.env.example`
- Modify: `src/config/env.ts`
- Create: `src/modules/admin/auth/config.server.ts`
- Create: `src/modules/admin/auth/oidc-client.server.ts`
- Test: `tests/unit/wp11-admin-oidc-client.test.ts`
- Test: `tests/unit/env.test.ts`

**Interfaces:**
- Produces: lazily loaded `AdminAuthConfig`, fixed redirect URI, discovery URL builder, capability-validated metadata, S256 challenge, bounded fatal-UTF-8 fetch helper, and `createClientSecretBasicHeader`.
- Consumes: `parseSecurityJson`, platform `fetch`, Node `crypto`, and the six Admin environment values.

- [ ] **Step 1: Write RED configuration-domain-separation tests**

Lock exactly `APP_BASE_URL`, `ADMIN_AUTH_ISSUER`, `ADMIN_AUTH_CLIENT_ID`, `ADMIN_AUTH_CLIENT_SECRET`, `ADMIN_SESSION_SECRET`, and `ADMIN_OIDC_FLOW_SECRET`; add no aliases. Require the two new secrets to be at least 32 UTF-8 bytes and pairwise distinct from one another and the consumer `USER_SESSION_SECRET`, `OAUTH_STATE_SECRET`, and `FOLLOW_INTENT_SECRET` when those values are present. Reject issuer credentials/query/fragment, non-HTTP(S) app base URL, and a client secret under 32 bytes. Derive exactly `${new URL(APP_BASE_URL).origin}/admin/auth/callback`.

- [ ] **Step 2: Extend environment examples and implement server-only Admin config**

Add non-secret placeholders only:

```dotenv
ADMIN_SESSION_SECRET=replace-with-admin-session-secret-minimum-32-characters
ADMIN_OIDC_FLOW_SECRET=replace-with-admin-oidc-flow-secret-minimum-32-characters
```

Keep client/secret values out of Client Components. Preserve database-only config parsing so CLI migration/check commands do not require the Admin runtime. Remove the legacy `ADMIN_AUTH_*` requirements from generic `serverEnvSchema`; it may retain only generic application/database values such as `APP_BASE_URL` and `DATABASE_URL`. The new `getAdminAuthConfig(environment = process.env)` owns all five `ADMIN_*` names and validates only when the Admin auth/session capability is invoked. Add tests proving DB CLI parsing, generic server parsing, public imports, unrelated unit tests, and type-only imports work when Admin OIDC variables are absent.

- [ ] **Step 3: Write RED discovery capability tests**

Require exact discovery `issuer`, absolute trusted `authorization_endpoint`, `token_endpoint`, and `jwks_uri`, plus:

```ts
expect(metadata.response_types_supported).toContain("code");
expect(metadata.id_token_signing_alg_values_supported).toContain("RS256");
// present lists must contain authorization_code/client_secret_basic/S256
```

Test `grant_types_supported` omission as allowed, `token_endpoint_auth_methods_supported` omission as the OIDC `client_secret_basic` default, `code_challenge_methods_supported` omission as allowed, and `response_modes_supported` omission as allowed. When present, `response_modes_supported` must contain `query`. For each present-but-incompatible list, assert fail-fast before any flow cookie generation or redirect; never fall back to fragment or form_post. Prove a valid discovery document with an extra non-critical member is accepted/stripped, while a duplicate required member, wrong required-field type, and malformed UTF-8 raw response are rejected.

- [ ] **Step 4: Implement discovery construction and bounded capability validation**

Remove only a terminating slash while constructing `${issuerWithoutTrailingSlash}/.well-known/openid-configuration`; retain the exact configured issuer for `issuer`/`iss` comparisons. Fetch with a five-second abort, `redirect: "error"`, and a 64 KiB raw-byte ceiling. Decode via `new TextDecoder("utf-8", { fatal: true })`, then call `parseSecurityJson`. External discovery/token schemas validate required known fields and strip/ignore unknown non-critical extensions; do not use blanket `.strict()` on protocol objects. Production endpoints must be HTTPS and contain no URL credentials.

- [ ] **Step 5: Write RED PKCE and RFC 6749 Basic tests**

Assert verifier entropy/length, S256 output, no `plain` fallback, and form encoding before Basic construction. Include spaces, `:`, `+`, and `%`; decode the generated Base64 and assert the encoded credential pair rather than raw input.

```ts
const header = createClientSecretBasicHeader(
  "admin client:100%",
  "s+e:c ret%",
);
expect(Buffer.from(header.slice("Basic ".length), "base64").toString("utf8"))
  .toBe("admin+client%3A100%25:s%2Be%3Ac+ret%25");
```

- [ ] **Step 6: Implement form encoding and token exchange construction**

Use `URLSearchParams` application-form semantics on each credential separately, then join the encoded values with one colon and Base64-encode. Never implement `Buffer.from(clientId + ":" + secret)`.

```ts
function formEncodeCredential(value: string): string {
  return new URLSearchParams({ credential: value })
    .toString()
    .slice("credential=".length);
}
```

Token POST body is form-encoded and contains only `grant_type=authorization_code`, code, exact verifier, fixed redirect URI, and no client secret. Authentication is only the constructed Basic header.

- [ ] **Step 7: Run focused tests and checkpoint**

Run: `npm test -- tests/unit/wp11-admin-oidc-client.test.ts tests/unit/env.test.ts`

Expected: PASS, including capability-default and special-character credential cases.

### Task 3: Implement bounded JWKS handling and strict RS256 ID Token verification

**Files:**
- Create: `src/modules/admin/auth/jwks.server.ts`
- Create: `src/modules/admin/auth/id-token.server.ts`
- Test: `tests/unit/wp11-admin-id-token.test.ts`

**Interfaces:**
- Produces: trusted JWKS loader/cache and `verifyAdminIdToken` returning only bounded verified claims `{ sub, iss, aud, iat, exp }`.
- Consumes: capability-validated discovery, `parseSecurityJson`, Node `crypto`, expected nonce, client ID, exact issuer, flow start, and `now`.

- [ ] **Step 1: Write RED happy-path and cryptographic-failure tests**

Generate ephemeral RSA keys in tests. Cover a valid signed ID Token; invalid signature; `alg=none`/HS256/PS256; missing, unknown, duplicated, or ambiguous `kid`; a non-RSA or non-signing JWK; multiple matching keys; malformed Base64URL; and a 16 KiB encoded-token limit. Also prove a valid JWK with an irrelevant permitted extension is accepted/stripped while a duplicate security member is rejected.

- [ ] **Step 2: Implement strict JWT splitting and parser reuse**

Require exactly three non-empty canonical Base64URL segments. Decode header/payload bytes, then fatal-decode UTF-8 before parsing both through `parseSecurityJson` with stricter JWT-specific limits. JWT/JWK schemas validate known fields and strip/ignore unknown non-critical members; they do not blanket-reject extensions. Ignore Token `jku`, `x5u`, `jwk` as trust inputs and reject every unsupported `crit` entry. Verify `RS256` over the original `header.payload` bytes with the selected trusted RSA JWK.

- [ ] **Step 3: Add RED claim-validation tests**

Cover exact issuer; exact string audience; single-item exact-client audience array; correct/wrong optional `azp`; multi-audience rejection with and without correct `azp`; missing-client audience; expired token; future/stale `iat`; missing or late `nbf`; wrong nonce; empty/oversized subject; type confusion; an accepted extra non-critical claim; and exact 60-second boundaries:

```ts
iat >= flowStartedAt - 60
iat <= now + 60
now < exp + 60
nbf === undefined || nbf <= now + 60
```

- [ ] **Step 4: Implement strict claim policy and minimal verified return type**

For string `aud`, require exact client ID. For array `aud`, require exactly one item equal to the client ID. Reject every multi-audience array even when `azp` is correct. If `azp` is present in either accepted form, require exact client ID. Compare nonce with timing-safe equality over fixed-length digests. Return no raw token, provider access token, refresh token, profile, extension field, or unverified claim.

- [ ] **Step 5: Add JWKS transport/cache/rotation tests**

Assert trusted `jwks_uri` only, 64 KiB/50-key ceilings, five-second abort, redirect rejection, bounded raw bytes plus fatal UTF-8, duplicate JSON/JWK member rejection, acceptance of irrelevant non-critical extensions, cache no longer than five minutes, at most one refresh for unknown `kid`, and denial after the refresh. Assert Token `jku`/`x5u` never triggers a fetch. Add malformed UTF-8 cases for JWKS and both JWT header/payload.

- [ ] **Step 6: Run focused tests and checkpoint**

Run: `npm test -- tests/unit/wp11-admin-id-token.test.ts tests/unit/wp11-security-json.test.ts`

Expected: PASS; a source scan shows all four external JSON surfaces import the single security parser.

Run:

```powershell
rg -n "JSON\.parse" src/modules/admin/auth
rg -n "parseSecurityJson" src/modules/admin/auth
```

Expected: no `JSON.parse` on external OIDC/JWT data; parser reuse is visible for discovery, token, JWKS/JWK, and JWT header/payload.

### Task 4: Add independent flow cookies, Admin session, Admin repository, and per-request ACTIVE guard

**Files:**
- Create: `src/modules/admin/auth/flow-cookie.server.ts`
- Create: `src/modules/admin/auth/session.server.ts`
- Create: `src/modules/admin/auth/repository.server.ts`
- Create: `src/modules/admin/auth/current-admin.server.ts`
- Create: `src/modules/admin/auth/rate-limit.server.ts`
- Create: `src/modules/admin/auth/replay.server.ts`
- Test: `tests/unit/wp11-admin-session.test.ts`
- Test: `tests/integration/wp11-admin-guard.test.ts`

**Interfaces:**
- Produces: three distinct OIDC flow cookie seal/open/delete helpers, Admin session seal/open/delete, Admin principal lookup/guard, and bounded process-local emergency limiter/replay registry.
- Consumes: existing `secure-cookie.server.ts` primitive, `admin_users`, Next cookies, and Admin auth config.

- [ ] **Step 1: Write RED cookie-domain-separation tests**

Assert exact cookie names/purposes/payload schemas:

```text
preppy_admin_oidc_state -> admin-oidc-state
preppy_admin_oidc_nonce -> admin-oidc-nonce
preppy_admin_oidc_pkce  -> admin-oidc-pkce
preppy_admin_session    -> admin-session
```

Flow cookies: HttpOnly, Lax, Secure in production, `Path=/admin/auth`, Max-Age 600. Session: HttpOnly, Lax, Secure in production, `Path=/`, Max-Age 28,800. Assert state, nonce, and verifier are generated independently, include the same random flow ID/start time, and cannot be opened by another flow/session parser or consumer parser.

- [ ] **Step 2: Make cookie attributes support the narrow flow path without weakening callers**

Narrowly extend `src/modules/auth/secure-cookie.server.ts` only if necessary so a caller can request exactly `/` or `/admin/auth`; keep `/` as the consumer default and retain the existing constraints. Do not make the path arbitrary. Implement distinct Zod payload validators after decryption.

- [ ] **Step 3: Write RED Admin repository/guard tests**

Seed ACTIVE and DISABLED Admin rows. Assert lookup by verified external subject returns only the bounded identity, unknown and DISABLED subjects produce the same generic denial, session lookup uses `adminUserId`, and changing ACTIVE to DISABLED blocks the next guard call despite an unexpired cookie. Assert a consumer session never authorizes Admin and an Admin session never authorizes consumer code.

- [ ] **Step 4: Implement session and ACTIVE guard**

The session payload is exactly:

```ts
type AdminSession = {
  version: 1;
  adminUserId: string;
  issuedAt: number;
  expiresAt: number;
};
```

`requireCurrentAdmin()` reads only `preppy_admin_session`, validates the payload, reloads `admin_users` by ID, and requires ACTIVE on every call. Return a bounded principal containing only Admin ID and display name for the authenticated shell; do not expose email or external subject.

- [ ] **Step 5: Implement bounded emergency rate/replay helpers**

Use process-local singleton maps with hard entry ceilings, TTL pruning, and deterministic test clocks. Treat them only as defense in depth; state/nonce/PKCE/cookie consumption remain mandatory. Do not add Redis or DB writes. Tests must prove bounded memory and one-use flow IDs.

- [ ] **Step 6: Run focused tests and checkpoint**

Run: `npm test -- tests/unit/wp11-admin-session.test.ts tests/integration/wp11-admin-guard.test.ts --hookTimeout=60000 --no-file-parallelism`

Expected: PASS, including immediate deactivation and cross-domain cookie denial.

### Task 5: Implement the real OIDC start/callback/logout HTTP flow

**Files:**
- Create: `src/modules/admin/auth/runtime.server.ts`
- Create: `src/modules/admin/auth/http.server.ts`
- Create: `app/admin/(auth)/login/page.tsx`
- Create: `app/admin/(auth)/auth/start/route.ts`
- Create: `app/admin/(auth)/auth/callback/route.ts`
- Create: `app/api/admin/auth/logout/route.ts`
- Test: `tests/unit/wp11-admin-auth-http.test.ts`
- Test: `tests/integration/wp11-admin-login.test.ts`

**Interfaces:**
- Produces: real Authorization Code start/callback flow, generic denial page/response, Admin session issuance, and Admin-only logout.
- Consumes: Tasks 2–4, `assertSameOriginForMutation`, fixed callback URI, and ACTIVE-subject lookup.

- [ ] **Step 1: Write RED start-route tests**

Assert a successful start first validates discovery capabilities, then produces different state/nonce/verifier values, an S256 challenge, three encrypted cookies, and one redirect with fixed parameters. Assert request `returnUrl`, `redirect_uri`, issuer, client, and PKCE method cannot influence the redirect. Discovery failure creates no flow cookies and no provider redirect.

- [ ] **Step 2: Implement login/start with injected runtime dependencies**

Keep Route Handlers thin: resolve server config/runtime, call `startAdminLogin`, write its cookie instructions, and return its redirect. Dependency injection is test-only at the server-module seam; do not add an application bypass route or bypass environment variable.

- [ ] **Step 3: Write RED callback shape/consumption tests**

Cover exactly one non-empty state plus exactly one of `{ code }` or `{ error }`; reject duplicates via `URLSearchParams.getAll`, empty values, code+error, missing values, wrong state, mixed flow IDs/times, expired flow, replayed flow ID, provider error, and token exchange failure. Every callback outcome must delete all three flow cookies after reading them.

```ts
const states = url.searchParams.getAll("state");
expect(states).toHaveLength(1);
// Cookies are opened/read before the response schedules all three deletions.
```

- [ ] **Step 4: Implement callback orchestration in the locked order**

Read all flow cookies and parameters; prepare deletion instructions; validate flow binding/age/state; consume the flow ID; exchange the code using Task 2 Basic construction; parse the token response through Task 1; validate the ID Token through Task 3; use only verified `sub`; load exact ACTIVE Admin; issue the eight-hour Admin session; redirect to `/admin`. Never persist or log code/access/refresh/raw ID Token values.

- [ ] **Step 5: Add identity-denial and token-response adversarial tests**

Assert unknown subject and DISABLED Admin return identical status/body and no session. Reject missing/duplicate `id_token`, duplicate token JSON members, malformed token-response UTF-8, raw non-JSON response, unexpected token types when validated, and oversized response. Accept and strip an extra non-critical token-response member. Assert no automatic `admin_users` insert/update occurs.

- [ ] **Step 6: Implement same-origin Admin logout**

`POST /api/admin/auth/logout` calls the Origin guard but deliberately does not call `requireCurrentAdmin()`. It unconditionally clears only `preppy_admin_session` and returns idempotent success for valid, DISABLED, expired, tampered, and missing Admin sessions. Assert the consumer cookie remains intact, cross-origin POST is rejected without clearing, and GET cannot log out. Optional safe telemetry must never block clearing.

- [ ] **Step 7: Run focused auth tests and checkpoint**

Run: `npm test -- tests/unit/wp11-admin-auth-http.test.ts tests/integration/wp11-admin-login.test.ts tests/integration/wp11-admin-guard.test.ts --hookTimeout=60000 --no-file-parallelism`

Expected: PASS. Inspect test output/log spies to confirm raw OAuth values never appear.

### Task 6: Preserve public URLs while creating the separate private Admin shell

**Files:**
- Modify: `app/layout.tsx`
- Create: `app/(public)/layout.tsx`
- Move: `app/page.tsx` -> `app/(public)/page.tsx`
- Move: `app/institutions/**` -> `app/(public)/institutions/**`
- Move: `app/opportunities/**` -> `app/(public)/opportunities/**`
- Move: `app/articles/**` -> `app/(public)/articles/**`
- Move: `app/my-preppy/**` -> `app/(public)/my-preppy/**`
- Move: `app/onboarding/**` -> `app/(public)/onboarding/**`
- Create: `app/admin/layout.tsx`
- Create: `app/admin/(protected)/layout.tsx`
- Create: `app/admin/(protected)/page.tsx`
- Create: `app/admin/_components/admin-nav.tsx`
- Create: `app/admin/_components/admin-shell.tsx`
- Create: `app/admin/admin.css`
- Test: `tests/unit/wp11-admin-route-layout.test.ts`

**Interfaces:**
- Produces: neutral root layout, unchanged public routes under a route group, an unauthenticated Admin auth group, a protected private Admin group, separate navigation/styles, and dynamic/no-store/noindex policy.
- Consumes: `requireCurrentAdmin`, Next metadata/runtime APIs, and existing SiteHeader/SiteFooter.

- [ ] **Step 1: Write RED route/layout contract tests**

Source-level/render tests must assert public pages live under `(public)` while expected URLs remain `/`, `/institutions`, `/institutions/[slug]`, `/opportunities/[slug]`, `/articles/[slug]`, `/my-preppy`, and `/onboarding`; root layout no longer renders SiteHeader/SiteFooter; public group layout does; Admin layout does not. Assert `/admin/login` and `/admin/auth/**` do not execute the ACTIVE-Admin guard, while `/admin` and every operational page do.

- [ ] **Step 2: Move public route files without content rewrites**

Use path-preserving App Router groups. Update only relative imports broken by the physical move, favoring `@/` aliases. Leave `app/auth/**`, `app/api/**`, global error/not-found, globals, and shared components at root. Run existing WP-06/07/08/09 UI/route tests immediately to detect URL or shell regression.

Update the existing My Preppy/Onboarding absolute imports and their WP-08/WP-09 path-sensitive tests to the new physical `(public)` paths. Keep the root error/not-found boundary neutral so it cannot leak the public shell into Admin; add scoped public error/not-found boundaries only where existing `notFound()`/error behavior needs the public shell.

- [ ] **Step 3: Create separate Admin root/auth/protected layout boundaries**

The unguarded `app/admin/layout.tsx` owns Admin CSS plus `export const dynamic = "force-dynamic"`, `export const revalidate = 0`, and `robots: { index: false, follow: false }` for both auth and protected paths. The `(auth)` group contains only login/start/callback and no Admin shell. The `(protected)/layout.tsx` calls `requireCurrentAdmin()` and renders the shell/navigation for Dashboard, Monitoring, Institutions, Opportunities, Sources, Articles, Notifications, Users, and Operations plus logout. This prevents the parent layout from redirecting the login/callback before authentication.

- [ ] **Step 4: Create focused operational styling and accessible shell behavior**

Use Admin-scoped classes/tokens, visible focus, skip link, text-bearing state chips, semantic tables, horizontal containment on narrow screens, and a compact mobile navigation. No public marketing component may become the authorization or layout boundary.

- [ ] **Step 5: Run focused route/public-regression tests and checkpoint**

Run:

```powershell
npm test -- tests/unit/wp11-admin-route-layout.test.ts tests/unit/wp07-home-page.test.ts tests/unit/wp07-institution-pages.test.ts tests/unit/wp07-detail-pages.test.ts tests/unit/wp08-auth-routes.test.ts tests/unit/wp09-my-preppy-ui.test.ts
```

Expected: PASS; route group changes no URL, and Admin has a distinct shell.

### Task 7: Build strict Admin read contracts and bounded operational projections

**Files:**
- Create: `src/modules/admin/read-model/contracts.ts`
- Create: `src/modules/admin/read-model/input.ts`
- Create: `src/modules/admin/read-model/dashboard-query.server.ts`
- Create: `src/modules/admin/read-model/institution-query.server.ts`
- Create: `src/modules/admin/read-model/opportunity-query.server.ts`
- Create: `src/modules/admin/read-model/source-query.server.ts`
- Create: `src/modules/admin/read-model/article-query.server.ts`
- Create: `src/modules/admin/read-model/notification-query.server.ts`
- Create: `src/modules/admin/read-model/user-query.server.ts`
- Create: `app/admin/(protected)/institutions/page.tsx`
- Create: `app/admin/(protected)/institutions/[id]/page.tsx`
- Create: `app/admin/(protected)/opportunities/page.tsx`
- Create: `app/admin/(protected)/opportunities/[id]/page.tsx`
- Create: `app/admin/(protected)/sources/page.tsx`
- Create: `app/admin/(protected)/sources/[id]/page.tsx`
- Create: `app/admin/(protected)/articles/page.tsx`
- Create: `app/admin/(protected)/notifications/page.tsx`
- Create: `app/admin/(protected)/users/page.tsx`
- Test: `tests/integration/wp11-admin-read-model.test.ts`
- Test: `tests/unit/wp11-admin-read-ui.test.ts`

**Interfaces:**
- Produces: stable bounded DTOs/pagination and read-only operational pages.
- Consumes: canonical schema, side-effect-free DB executor, and protected Admin layout.

- [ ] **Step 1: Write RED projection-shape and pagination tests**

Seed records with PII/raw payload traps. Assert explicit selected fields, stable `(createdAt/id)` or domain-appropriate ordering, strict page/filter schemas, maximum page sizes, not-found behavior, and no mutation. The DTO contracts must make disallowed fields unrepresentable.

- [ ] **Step 2: Implement dashboard real-count queries**

Return only overdue/due Monitoring counts, recent verified Opportunity change count/list, unavailable Source count, pending Outbox count, and dead-letter count. Do not use mock data or count from client-side arrays. Keep `/api/health` untouched and liveness-only.

- [ ] **Step 3: Implement Institution, Opportunity, and Source projections**

Institution rows: identity/category/publication/operational state, active binding count, bounded Opportunity summary. Opportunity rows: Institution, identity, server-owned truth mode, publication/business state, current version, binding count, recent canonical change. Source rows: canonical URL/type/authority/lifecycle/config/binding counts/latest observation—never snapshot body, normalized raw text, response body, or arbitrary metadata.

- [ ] **Step 4: Implement inspection-only Article, Notification, and User projections**

Article: title/type/status/slug/publication timestamp/relation counts, no `contentHtml` and no write controls. Notification: ID/status/signal plus aggregate Delivery/Attempt counts, no recipient/provider payload. User: canonical ID/status/created time/Follow count/derived email-readiness, excluding raw email, external subject, tokens, child name, and DOB.

- [ ] **Step 5: Render accessible bounded pages**

Use server-side query parsing, tables with captions/header scopes, explicit empty/error states, safe absolute HTTP(S) Source links with `noopener noreferrer`, and no Client Component DB access. All pages inherit the protected layout and no-store policy.

- [ ] **Step 6: Add negative PII and no-write source audits**

Tests and source scans must fail if DTO/page sources include forbidden fields or import mutation helpers:

```powershell
rg -n "contentHtml|externalAuthSubject|providerPayload|snapshotBody|normalizedText|childName|dateOfBirth" src/modules/admin/read-model app/admin
rg -n "\.update\(|\.insert\(|\.delete\(|TransactionManager" src/modules/admin/read-model app/admin
```

Expected: only explicit negative-test fixtures/comments match the first command; no projection/page mutation call matches the second.

- [ ] **Step 7: Run focused projection/UI tests and checkpoint**

Run: `npm test -- tests/integration/wp11-admin-read-model.test.ts tests/unit/wp11-admin-read-ui.test.ts --hookTimeout=60000 --no-file-parallelism`

Expected: PASS with real DB projections and PII allowlists.

### Task 8: Implement the canonical Monitoring queue and detail decision UI

**Files:**
- Create: `src/modules/admin/read-model/monitoring-query.server.ts`
- Create: `src/modules/admin/read-model/monitoring-detail-query.server.ts`
- Create: `app/admin/(protected)/monitoring/page.tsx`
- Create: `app/admin/(protected)/monitoring/[targetType]/[targetId]/[sourceId]/[role]/page.tsx`
- Create: `app/admin/_components/monitoring-filters.tsx`
- Create: `app/admin/_components/monitoring-detail.tsx`
- Create: `app/admin/_components/monitoring-actions.tsx`
- Create: `app/admin/_components/source-move-actions.tsx`
- Test: `tests/integration/wp11-admin-monitoring-read.test.ts`
- Test: `tests/unit/wp11-admin-monitoring-ui.test.ts`

**Interfaces:**
- Produces: filterable queue preserving WP-10B ordering and a decision-ready detail page with expected-current tokens.
- Consumes: `getMonitoringQueue`, canonical binding coordinates, current Native/Legacy/Fact truth, safe Source identity, and action components.

- [ ] **Step 1: Write RED queue delegation/filter tests**

Map URL query arrays exactly to `monitoringQueueFilterSchema`. Assert invalid/unknown filters are safe 400/empty guidance, `getMonitoringQueue` order is preserved without re-sort, and row links encode `targetType/targetId/sourceId/role` rather than trusting `bindingId` from a client.

- [ ] **Step 2: Implement Monitoring list projection/page**

Expose due state, priority, target type, role, and Source lifecycle filters only. Render due/overdue state, last/next check, target identity, Source identity, role, and current summary. No persistent monitoring task/job table is introduced.

- [ ] **Step 3: Write RED detail ownership/current-token tests**

Assert the four route coordinates reconstruct an existing active canonical binding and cannot be mixed across targets. Load the minimum safe current truth and exact `expectedCurrentVersionId` (nullable where creation is valid). Reject a stale/nonexistent/inactive binding and unsafe Source URL.

- [ ] **Step 4: Implement the detail read model**

Return a discriminated Native/Legacy/Institution detail DTO containing Source, latest observation, current truth/fact data, and server-owned truth mode as display-only information. Do not return arbitrary evidence snapshot content or give the client control over truth mode.

- [ ] **Step 5: Implement candidate-only forms and explicit Source move modes**

Render separate controls for No Change, Change Found, Fact Verify where applicable, Source Unavailable, Bind/Unbind, URL Correction, and Source Replacement. URL Correction requires an explicit same-provenance checkbox; Replacement offers CREATE/REUSE and warns historical Evidence stays on the old Source. No button automatically chooses the mode.

- [ ] **Step 6: Add accessibility/responsiveness unit checks**

Verify labels/descriptions, error-summary focus target, status announcement region, confirmation requirements for replacement/unbind, text plus color for state, keyboard-operable controls, and narrow-screen containment. Client components may own form state only.

- [ ] **Step 7: Run focused Monitoring read/UI tests and checkpoint**

Run: `npm test -- tests/integration/wp11-admin-monitoring-read.test.ts tests/unit/wp11-admin-monitoring-ui.test.ts tests/integration/wp10b-monitoring-query.test.ts --hookTimeout=60000 --no-file-parallelism`

Expected: PASS; WP-10B queue ordering/filter semantics remain unchanged.

### Task 9: Establish one strict Admin mutation HTTP boundary and wire Confirm No Change

**Files:**
- Create: `src/modules/admin/http/contracts.ts`
- Create: `src/modules/admin/http/command-context.server.ts`
- Create: `src/modules/admin/http/command-handler.server.ts`
- Create: `src/modules/admin/http/error-response.server.ts`
- Create: `src/modules/admin/http/no-change.server.ts`
- Create: `app/api/admin/monitoring/sources/[sourceId]/no-change/route.ts`
- Test: `tests/unit/wp11-admin-command-http.test.ts`
- Test: `tests/integration/wp11-admin-no-change.test.ts`

**Interfaces:**
- Produces: reusable `runAdminCommandRequest` pipeline and the first WP-10B adapter.
- Consumes: Admin guard, Origin guard, strict Zod schemas, `createAdminCommandContext`, safe application-error mapping, and `confirmNoChange`.

- [ ] **Step 1: Write RED boundary-order and injection tests**

Spy dependencies to prove the exact order: ACTIVE session, same Origin, strict path/body parse, server correlation/time/reason, command, safe response. Reject bodies containing `adminUserId`, `truthMode`, `changeType`, Outbox flags, path-owned `sourceId`, or unknown keys. Assert no command call on any earlier failure.

- [ ] **Step 2: Implement server-generated context and safe response envelopes**

Create a UUID correlation ID and one `occurredAt` after auth/input validation. Obtain `adminUserId` only from the ACTIVE principal. Reason codes come only from a route-owned constant or an exact allowlist. Map Validation/Forbidden/NotFound/Conflict/Retryable/unknown errors without SQL, constraint, stack, token, or raw payload leakage. Set `Cache-Control: private, no-store`.

- [ ] **Step 3: Write RED No Change integration tests**

Seed one due Source with multiple bindings. A valid request must create one UNCHANGED Observation and Audit/check projection update only. Assert zero OpportunityVersion, InstitutionFactVersion, OpportunityChange, customer Outbox, Notification, and Delivery rows. Invalid Origin/session/source ID/body must write nothing.

- [ ] **Step 4: Implement the thin No Change adapter and Route Handler**

Accept only an optional bounded note; take `sourceId` from the validated path; derive the fixed reason; call `confirmNoChange` once. Return the committed observation/check timestamp and correlation ID. Do not reimplement a transaction or write an observation in the Route Handler.

- [ ] **Step 5: Add generic 409 and inactive-session tests**

Force a WP-10B conflict and assert status 409 plus the approved Korean reload guidance. Disable the Admin between two requests and assert the second fails before the command with no write.

- [ ] **Step 6: Run focused boundary/No Change tests and checkpoint**

Run: `npm test -- tests/unit/wp11-admin-command-http.test.ts tests/integration/wp11-admin-no-change.test.ts tests/integration/wp10b-source-commands.test.ts --hookTimeout=60000 --no-file-parallelism`

Expected: PASS; Product signals for No Change remain zero.

### Task 10: Wire Opportunity and InstitutionFact verification without client-owned truth decisions

**Files:**
- Create: `src/modules/admin/http/verify-opportunity.server.ts`
- Create: `src/modules/admin/http/verify-institution-fact.server.ts`
- Create: `app/api/admin/opportunities/[opportunityId]/verify/route.ts`
- Create: `app/api/admin/institutions/[institutionId]/facts/[factType]/verify/route.ts`
- Modify: `app/admin/_components/monitoring-actions.tsx`
- Test: `tests/unit/wp11-admin-verification-http.test.ts`
- Test: `tests/integration/wp11-admin-verification.test.ts`

**Interfaces:**
- Produces: strict candidate-only HTTP adapters for unified Opportunity and Fact verification.
- Consumes: Task 9 pipeline, `verifyOpportunity`, `verifyInstitutionFact`, path-owned IDs/types, and expected-current tokens from Task 8.

- [ ] **Step 1: Write RED strict-body and server-ownership tests**

Opportunity bodies may contain only expected current ID, one valid Native-or-Legacy candidate shape, Source/Evidence reference, and an optional canonical materiality override/reason pair. Fact bodies may contain only expected current ID, proposed value/display/validity, and Source/Evidence. Reject client `opportunityId`, `institutionId`, `factType`, `truthMode`, final change type, actor, occurredAt, correlation ID, and Outbox policy.

- [ ] **Step 2: Implement candidate schemas without using the client as dispatcher**

Validate that `proposedState` matches one of the two bounded candidate structures, but pass it to the unified `verifyOpportunity`; the command loads the Opportunity and resolves Native vs Legacy-backed truth mode. Path ownership overrides no body field because duplicate path-owned fields are rejected. Fact type is an exact schema enum parsed only from the path.

- [ ] **Step 3: Add RED Native/Legacy/Fact transaction tests through HTTP**

Exercise:

- Native no-change and meaningful change;
- Legacy-backed no-change and meaningful change;
- Fact create/no-change/change;
- expected-current stale conflict;
- wrong active binding/evidence Source;
- materiality override with only the two approved reasons.

Assert Version/Evidence/Change/Audit/applicable Outbox counts match WP-10B and that Notification/Delivery counts remain zero.

- [ ] **Step 4: Implement context/reason mapping and delegate exactly once**

Map only `MATERIALITY_USER_IMPACT_CONFIRMED` and `MATERIALITY_NON_USER_FACING_CONFIRMED`. Pass `adminUserId`, correlation ID, and one server time through `createAdminCommandContext`. Return the command's safe result; do not reconstruct final change type/materiality in HTTP/UI.

- [ ] **Step 5: Add stale-write and rollback assertions**

Submit two candidates with the same expected current ID. The first may commit; the second must return 409 with the approved reload message, preserve the first current row, and create no second Evidence/Change/Audit/Outbox. Force Audit/Outbox failure in the command dependency seam and assert the entire command transaction rolls back.

- [ ] **Step 6: Update forms to reload after 409/success**

Display the Korean conflict guidance, refetch/re-render the detail page, and require the operator to reassess. Do not automatically re-submit or merge. Announce successful committed outcomes accessibly.

- [ ] **Step 7: Run focused verification suites and checkpoint**

Run:

```powershell
npm test -- tests/unit/wp11-admin-verification-http.test.ts tests/integration/wp11-admin-verification.test.ts tests/integration/wp10b-opportunity-verification.test.ts tests/integration/wp10b-institution-fact-verification.test.ts --hookTimeout=60000 --no-file-parallelism
```

Expected: PASS, including exact 409/no-overwrite behavior and unchanged WP-10B atomicity.

### Task 11: Wire explicit Source lifecycle/move and canonical Bind/Unbind commands

**Files:**
- Create: `src/modules/admin/http/source-commands.server.ts`
- Create: `app/api/admin/sources/[sourceId]/unavailable/route.ts`
- Create: `app/api/admin/sources/[sourceId]/moved/route.ts`
- Create: `app/api/admin/institutions/[institutionId]/source-bindings/route.ts`
- Create: `app/api/admin/institutions/[institutionId]/source-bindings/[sourceId]/[role]/route.ts`
- Create: `app/api/admin/opportunities/[opportunityId]/source-bindings/route.ts`
- Create: `app/api/admin/opportunities/[opportunityId]/source-bindings/[sourceId]/[role]/route.ts`
- Modify: `app/admin/_components/source-move-actions.tsx`
- Test: `tests/unit/wp11-admin-source-http.test.ts`
- Test: `tests/integration/wp11-admin-source-commands.test.ts`

**Interfaces:**
- Produces: strict unavailable/move/bind/unbind adapters with fixed reason mapping.
- Consumes: `markSourceUnavailable`, `markSourceMoved`, four WP-10B binding commands, and Task 9 pipeline.

- [ ] **Step 1: Write RED route-schema and reason-mapping tests**

Unavailable accepts only `NOT_FOUND | ACCESS_ERROR | PARSE_ERROR | TIMEOUT` plus the bounded WP-10B observation fields and `pauseSource`; map them to the exact reason constants. Bind accepts only Source ID, role, and `isPrimary`; Unbind takes all identity from path. Reject duplicate path IDs and free-form context reason.

- [ ] **Step 2: Write RED explicit move-mode tests**

Use the existing discriminated union exactly:

```ts
type SourceMoveBody =
  | { moveMode: "URL_CORRECTION"; newUrl: string; provenanceContinuityConfirmed: true }
  | { moveMode: "SOURCE_REPLACEMENT"; replacement:
      | { kind: "CREATE"; canonicalUrl: string; sourceName: string }
      | { kind: "REUSE"; replacementSourceId: string } };
```

Reject absent/false continuity for URL correction, mixed branches, client `sourceId`, automatic/unknown mode, and unexpected fields. Map URL correction/replacement to their fixed reason codes.

- [ ] **Step 3: Implement thin adapters and Route Handlers**

After shared auth/Origin/validation/context, call the exact WP-10B command once. Do not pre-lock, update Source/binding rows, rewrite Evidence, or create a separate transaction in HTTP. The WP-10B root transaction remains authoritative.

- [ ] **Step 4: Add provenance and Product-signal integration assertions**

For URL correction, assert Source identity, bindings, and Evidence source IDs remain unchanged while only canonical URL/Audit changes. For replacement, assert old Source retirement, new active bindings, and all historical Evidence source IDs remain on old Source. Both modes create zero OpportunityVersion, FactVersion, OpportunityChange, Notification, and customer Outbox.

- [ ] **Step 5: Add binding conflict/idempotency/rollback tests**

Cover exact active bind replay, inactive reactivation, primary conflict, lifecycle conflict, stale/inactive unbind, Institution/Opportunity role mismatch, concurrent primary attempts, and forced Audit failure. Conflicts return safe 409; failures roll back the root command transaction.

- [ ] **Step 6: Verify the UI never infers move mode**

Render two separately labeled forms with distinct confirmation copy. URL Correction says “same Source, URL only”; Replacement says “new Source identity; historical Evidence preserved.” No combined submit handler may choose mode from URL comparison or other heuristic.

- [ ] **Step 7: Run focused Source/binding tests and checkpoint**

Run: `npm test -- tests/unit/wp11-admin-source-http.test.ts tests/integration/wp11-admin-source-commands.test.ts tests/integration/wp10b-source-commands.test.ts --hookTimeout=60000 --no-file-parallelism`

Expected: PASS with explicit provenance semantics and Product signals 0.

### Task 12: Add read-only Operations, safe Audit summaries, data-quality warnings, and Admin health

**Files:**
- Create: `src/modules/admin/read-model/operations-query.server.ts`
- Create: `src/modules/admin/read-model/data-quality-query.server.ts`
- Create: `src/modules/admin/read-model/health-query.server.ts`
- Create: `app/admin/(protected)/operations/page.tsx`
- Create: `app/admin/(protected)/operations/outbox/page.tsx`
- Create: `app/admin/(protected)/operations/deliveries/page.tsx`
- Create: `app/admin/(protected)/operations/audit/page.tsx`
- Create: `app/admin/(protected)/operations/health/page.tsx`
- Test: `tests/integration/wp11-admin-operations.test.ts`
- Test: `tests/unit/wp11-admin-operations-ui.test.ts`

**Interfaces:**
- Produces: bounded inspection-only Outbox/dead-letter/delivery aggregate/Audit/health/data-quality pages.
- Consumes: canonical operational tables, safe metadata allowlist, and existing liveness primitive without changing `/api/health`.

- [ ] **Step 1: Write RED safe-projection/PII tests**

Seed Outbox payload/body context, an Outbox row whose status is `DEAD_LETTER`, Delivery `recipientHash`, DeliveryAttempt provider/providerMessageId/error-safe fields, and Audit before/after JSON containing secrets/PII. Assert the DTO exposes only IDs, event/status/type, bounded attempts/timestamps, safe error category/code, actor/action/reason/correlation, and an allowlisted metadata summary. There is no separate dead-letter table or raw provider-payload/recipient-address column. Never return Outbox payload/body context, recipient hash, provider message ID/response, SQL, stack, or arbitrary Audit JSON.

- [ ] **Step 2: Implement stable bounded Operations queries**

Use strict filters and maximum page sizes. Dead-letter is `outbox_events.status = 'DEAD_LETTER'`, not a separate table or mutation path. Delivery view is aggregate/inspection only and cannot resolve recipients or send. Admin health may inspect real safe database connectivity/queue/data-quality state only; it must not invent unavailable kill-switch configuration. Public `/api/health` remains unchanged liveness-only.

- [ ] **Step 3: Implement critical integrity warnings as reads**

Report bounded counts/details for invariants already expressible from the canonical model, such as multiple current versions, invalid active-primary multiplicity, orphaned canonical links, or overdue critical monitoring items. Do not repair or mutate data from the warning page.

- [ ] **Step 4: Render pages with no mutation affordance**

Tests must assert absence of Retry, Cancel, Dead-letter, status edit, lease cleanup, send, resolve, publish, and CMS edit forms/buttons/Route Handlers. Provide explanatory copy that mutations are deferred until canonical commands exist.

- [ ] **Step 5: Add filesystem/API-surface audit tests**

Fail if any unapproved Operations method or handler appears under `app/api/admin/operations`, or if Operations modules import an update/insert/delete/transaction command. Keep `app/api/health/route.ts` byte-for-byte unchanged unless an unrelated pre-existing formatting requirement forces a diff, in which case stop and review.

- [ ] **Step 6: Run focused Operations tests and checkpoint**

Run: `npm test -- tests/integration/wp11-admin-operations.test.ts tests/unit/wp11-admin-operations-ui.test.ts tests/unit/health-route.test.ts --hookTimeout=60000 --no-file-parallelism`

Expected: PASS; Operations is demonstrably read-only and PII-safe.

### Task 13: Build a real fake issuer fixture and complete browser verification

**Files:**
- Create: `tests/browser/wp11/fake-admin-oidc-issuer.ts`
- Create: `tests/browser/wp11/seed-admin-console.ts`
- Create: `tests/browser/wp11/browser-scenarios.md`
- Create: `tests/unit/wp11-fake-oidc-issuer.test.ts`

**Interfaces:**
- Produces: separate local issuer process with discovery/authorization/token/JWKS endpoints, PKCE verification, ephemeral RSA signing, deterministic error modes, and dedicated DB seed.
- Consumes: existing `tsx`, Node HTTP/crypto, Admin env variables, and a dedicated `_test`/`_verifyN` database.

- [ ] **Step 1: Write RED fake-issuer protocol tests**

Assert exact issuer metadata/capabilities, ephemeral RS256 JWKS, one-time code, fixed registered redirect, state/nonce echo rules, PKCE S256 verification, RFC-encoded Basic credential parsing, and token signing. Include switches for invalid signature/issuer/audience/nonce/expiry, duplicate JSON member fixtures, and discovery capability failures.

- [ ] **Step 2: Implement the external fixture without an app bypass**

Run it directly with the already-installed `tsx` binary as its own local process on a controlled loopback port; do not modify `package.json`. The application points normal `ADMIN_AUTH_ISSUER`/client config at it. Seed an existing ACTIVE `admin_users` row with the fixture `sub`; do not expose a “test login” route, header, query flag, or session minting helper in application code.

- [ ] **Step 3: Start a dedicated browser environment**

Use a freshly migrated dedicated database, seed a due Monitoring item with Native change and Source move fixtures, start the fake issuer, then start Next with Admin secrets distinct from consumer secrets. Record the exact ports and process IDs for safe teardown. Do not target a development/shared database.

- [ ] **Step 4: Verify the desktop Chromium happy path**

Using the `webapp-testing`/in-app browser procedure during implementation, execute and record:

```text
/admin -> generic login page
OIDC Authorization Code + PKCE -> Dashboard
Monitoring filters -> due detail
No Change -> queue check time changes, Product signals remain 0
Native Change Found -> truth/Audit/applicable Outbox changes atomically
URL Correction -> same Source identity
Source Replacement -> warning + old Evidence provenance retained
Logout -> /admin access denied/redirected
```

- [ ] **Step 5: Verify denial/stale/read-only browser behavior**

Exercise unknown and DISABLED subjects with indistinguishable denial, stale expected-current returning 409 and reload guidance, Origin rejection where observable, no Operations mutations, and Articles inspection without edit/publish. Confirm Notification/Delivery counts do not change during No Change/Source moves.

- [ ] **Step 6: Verify tablet/mobile accessibility**

At representative tablet/mobile viewports, verify navigation, table containment/alternatives, form labels, focus order/visibility, confirmation dialogs, error summary/status announcement, and action usability. Record screenshots/notes outside tracked source unless the implementation prompt explicitly requests artifacts.

- [ ] **Step 7: Tear down fixture processes and run focused fixture tests**

Run: `npm test -- tests/unit/wp11-fake-oidc-issuer.test.ts`

Expected: PASS. Stop only the exact recorded Next/fake-issuer processes; preserve the dedicated database until final controlled verification completes.

### Task 14: Complete security, PRD traceability, regression, and prohibited-scope verification

**Files:**
- Modify: `docs/superpowers/plans/2026-08-24-wp-11-admin-runtime.md` only to check completed steps and record evidence during execution.
- Modify: in-scope WP-11 files only if verification reveals an in-scope defect.
- Test: all WP-11 tests plus the repository-wide controlled suite.

**Interfaces:**
- Consumes: Tasks 1–13.
- Produces: verification evidence and the mandated WP-11 completion report; no commit/push.

- [x] **Step 1: Run all focused WP-11 unit/integration tests**

Run:

```powershell
npm test -- tests/unit/wp11-security-json.test.ts tests/unit/wp11-admin-oidc-client.test.ts tests/unit/wp11-admin-id-token.test.ts tests/unit/wp11-admin-session.test.ts tests/unit/wp11-admin-auth-http.test.ts tests/unit/wp11-admin-route-layout.test.ts tests/unit/wp11-admin-read-ui.test.ts tests/unit/wp11-admin-monitoring-ui.test.ts tests/unit/wp11-admin-command-http.test.ts tests/unit/wp11-admin-verification-http.test.ts tests/unit/wp11-admin-source-http.test.ts tests/unit/wp11-admin-operations-ui.test.ts tests/unit/wp11-fake-oidc-issuer.test.ts tests/integration/wp11-admin-guard.test.ts tests/integration/wp11-admin-login.test.ts tests/integration/wp11-admin-read-model.test.ts tests/integration/wp11-admin-monitoring-read.test.ts tests/integration/wp11-admin-no-change.test.ts tests/integration/wp11-admin-verification.test.ts tests/integration/wp11-admin-source-commands.test.ts tests/integration/wp11-admin-operations.test.ts --hookTimeout=60000 --no-file-parallelism
```

Expected: PASS.

- [x] **Step 2: Re-run the highest-risk adversarial cases separately**

Run separate Vitest invocations for duplicate JSON/escaped-equivalent key; accepted unknown non-critical discovery/token/JWT/JWK extensions; RFC Basic special characters; incompatible discovery capabilities including present-without-query response modes; invalid signature/issuer/audience/nonce/expiry; multi-audience plus correct `azp` rejection; malformed UTF-8 discovery/token/JWKS/JWT header/payload rejection; unknown/DISABLED subject; immediate Admin deactivation; valid/DISABLED/expired/tampered/missing-session logout clearing; stale expected-current; Source Replacement provenance; and Operations no-mutation. Repeat stale/concurrency cases three times.

Expected every run: deterministic denial or one canonical commit, never partial state.

- [x] **Step 3: Run controlled fresh/upgrade database verification**

Require `TEST_DATABASE_URL` to pass `assertDedicatedTestDatabaseUrl`. Recreate/migrate a fresh dedicated database through migration `0009`, run the focused integration tests, then take a separate pre-0009 upgrade fixture through current migrations and rerun schema/runtime tests. WP-11 adds no migration; current fresh/upgrade paths must remain green.

- [x] **Step 4: Run typecheck, lint, targeted formatting, and production build**

Run:

```powershell
npm run typecheck
npm run lint
npm run format:check
npm run build
```

Expected: PASS. Inspect build route inventory to confirm unchanged public URLs, separate `/admin/**`, exact approved mutation endpoints, and no unexpected Operations mutation route.

- [x] **Step 5: Run the full controlled suite**

Run: `npm test -- --hookTimeout=60000 --no-file-parallelism`

Expected: PASS on the dedicated controlled database with all earlier WP tests green.

- [x] **Step 6: Perform identity/OIDC secret and parser audit**

Run source scans for raw token logging/storage, client secrets in client code, raw Basic concatenation, external `JSON.parse`, dynamic issuer/JWKS URLs, `jku`/`x5u` fetches, consumer/Admin cookie crossover, and absent per-request ACTIVE checks. Manually inspect every match.

```powershell
rg -n "access_token|refresh_token|id_token|client_secret|Authorization" src app
rg -n "JSON\.parse|jku|x5u|jwks_uri|client_secret_basic" src/modules/admin
rg -n "response\.text\(" src/modules/admin/auth
rg -n "TextDecoder" src/modules/admin/auth
rg -n "preppy_(user|admin)_session|PREPPY_(USER|ADMIN)_SESSION" src app
```

Expected: protocol values appear only in bounded server code/tests; no persisted/logged raw token; no raw credential Basic construction; no permissive `response.text()` security boundary; fatal `TextDecoder` exists for HTTP/JWT bytes; no arbitrary Token-directed key fetch; trust domains stay separate.

- [x] **Step 7: Perform mutation, Product-signal, PII, and route-scope audit**

Run:

```powershell
rg -n "\.insert\(|\.update\(|\.delete\(|TransactionManager" app/admin src/modules/admin/read-model
rg -n "retry|cancel|dead.?letter|lease|contentHtml|providerPayload|externalAuthSubject|dateOfBirth|childName" app/admin app/api/admin src/modules/admin
rg --files app/api/admin
git diff --name-only
git diff --stat
git diff --check
```

Expected: mutations exist only behind approved Admin API adapters invoking WP-10B; no Operations/CMS/Notification-worker mutation; no forbidden PII projection; no migration/schema/package-lock addition; no whitespace errors.

- [x] **Step 8: Verify the PRD traceability disposition**

| PRD | Execution evidence | WP-11 disposition |
| --- | --- | --- |
| `FR-ADM-001` Auth | OIDC/session/ACTIVE-guard tests and browser login/logout | Implemented |
| `FR-ADM-002` Commands | Route-order tests and WP-10B delegation tests | Implemented |
| `FR-ADM-003` Audit | command integration plus safe Audit inspection | Implemented |
| `FR-ADM-004` Monitoring Queue | WP-10B ordering/filter and detail tests | Implemented |
| `FR-ADM-005` Articles | inspection-only Article page, no editor | Intentionally deferred to WP-13 Article CMS; not an unmet WP-11 item |
| `FR-ADM-006` Notification Ops | safe inspection and zero mutation surface | Retry/cancel intentionally deferred to WP-12 canonical Worker/Notification commands; not an unmet WP-11 item |
| `FR-ADM-007` Outbox Ops | safe inspection and zero mutation surface | Retry/cancel/dead-letter intentionally deferred to WP-12 canonical Outbox commands; not an unmet WP-11 item |
| `FR-ADM-008` User Support | minimal PII-safe lookup tests | Implemented |
| `FR-ADM-009` Data Quality | read-only integrity warning tests | Implemented |
| `FR-ADM-010` Health | Admin health projection plus unchanged liveness test | Implemented |

- [x] **Step 9: Prepare the mandated completion report and stop**

Report exact migration status (`none`, current `0009` verified), OIDC/session/security parser/discovery/Basic results, Admin routes/projections/commands, stale/rollback/Product-signal results, focused/full/fresh-upgrade/browser test evidence, branch/baseline/diff scope, and `commit/push: NO`. Do not begin WP-12 or WP-13.

## Plan Completion Gate

Implementation is complete only if every checkbox is supported by fresh command/browser evidence, all required discovery and RFC Basic adversarial tests pass, unknown non-critical external extensions are accepted/stripped, duplicate members and malformed UTF-8 fail closed, multi-audience tokens are rejected, the duplicate-member parser is the sole external security JSON decoder, disabled Admin access is revoked on the next protected request, invalid/disabled Admin cookies can always be logged out after Origin validation, stale writes produce no overwrite, Source provenance remains intact, Operations is read-only, all PII allowlists hold, public URLs remain unchanged, the full suite/build pass, and Git shows no commit/push/package/migration/schema drift.
