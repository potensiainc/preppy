# WP-14 Analytics Runtime / Measurement Implementation Plan

> **For Codex:** Execute this plan inline with strict RED → GREEN → REFACTOR checkpoints. Do not commit, push, migrate, or deploy.

**Goal:** Turn the existing `src/analytics` typed catalog into a production GA4 client/server runtime, preserve commit-owned conversion semantics, add privacy enforcement and PostgreSQL KPI queries, and verify the public funnel without changing schema or event names.

**Architecture:** `src/analytics/events.ts` remains the only canonical event registry. Every tracker validates through the same strict runtime schemas and PII guard. Public pages use a public-layout client provider and one event per canonical navigation; server conversions use a production-only Measurement Protocol adapter after commit with an ephemeral transport-only client ID. PostgreSQL remains the source of truth for AMP and operational metrics.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod 4, Drizzle/PostgreSQL, native `fetch`, native Google tag, Vitest, existing browser Python/CDP harness.

---

## Task 1: Lock registry validation and privacy invariants

**Files:**
- Modify: `src/analytics/events.ts`
- Modify: `src/analytics/tracker.ts`
- Create: `src/analytics/pii-guard.ts`
- Create: `tests/unit/wp14-analytics-registry.test.ts`
- Modify: `tests/unit/wp05-context-legal-analytics.test.ts`

1. Add failing tests for all 19 registered events: valid payload accepted; unknown, wrong-type, oversized, prohibited-key, raw-query/full-URL, and legacy-ID payloads rejected.
2. Run the focused test and confirm RED because no runtime schemas/guard exist.
3. Add strict Zod schemas and a central recursive dangerous-key-family guard without renaming/reordering/adding events.
4. Make Noop and Test trackers validate through the shared registry; keep Test snapshots isolated.
5. Run focused tests and typecheck until GREEN.

## Task 2: Add capability-scoped GA4 configuration and provider mapping

**Files:**
- Create: `src/analytics/config.server.ts`
- Create: `src/analytics/provider-mapping.ts`
- Modify: `src/config/runtime-env.ts`
- Modify: `.env.example`
- Create: `tests/unit/wp14-analytics-config.test.ts`
- Create: `tests/unit/wp14-provider-mapping.test.ts`

1. Add RED tests for production-only enablement, missing production credentials, Noop non-production, measurement-ID exposure only, exact snake_case mapping, and secret exclusion.
2. Implement separate client-safe and server configuration outputs. Keep `GA4_API_SECRET` server-only.
3. Map canonical camelCase fields to bounded GA4 parameters without arbitrary spreads.
4. Run focused tests GREEN.

## Task 3: Implement server GA4 transport and production runtime

**Files:**
- Create: `src/analytics/ga4-server.server.ts`
- Create: `src/analytics/runtime.server.ts`
- Create: `tests/unit/wp14-ga4-server.test.ts`

1. Add RED tests for Measurement Protocol endpoint/query construction, minimal body, ephemeral transport-only `client_id`, 2.5-second abort, zero retry, safe logging, non-2xx/network best-effort behavior, and validated payloads.
2. Implement native `fetch` transport. Never send `user_data`, user properties, User ID, email, or provider identity.
3. Implement a production singleton/factory and non-production Noop selection.
4. Run focused tests GREEN.

## Task 4: Implement client provider, native Google tag, and navigation dedupe

**Files:**
- Create: `src/analytics/ga4-client.ts`
- Create: `src/analytics/client-context.tsx`
- Create: `app/_components/analytics-provider.tsx`
- Create: `app/_components/page-analytics.tsx`
- Modify: `app/(public)/layout.tsx`
- Create: `tests/unit/wp14-ga4-client.test.ts`
- Create: `tests/unit/wp14-page-analytics.test.ts`

1. Add RED tests for injected test capture, Noop non-production, validated-only gtag calls, query-free parameters, canonical-navigation dedupe, rerender/Strict Mode suppression, and no Admin loader.
2. Implement a public-shell-only provider. Load Google tag only when production analytics is enabled, with automatic `page_view` disabled and Signals/ads personalization disabled.
3. Use an explicit canonical navigation key to dedupe views without localStorage/custom cookies.
4. Run focused tests GREEN.

## Task 5: Instrument public behavior with existing events only

**Files:**
- Modify: `app/(public)/page.tsx`
- Modify: `app/(public)/institutions/page.tsx`
- Modify: `app/(public)/institutions/[slug]/page.tsx`
- Modify: `app/(public)/opportunities/[slug]/page.tsx`
- Modify: `app/(public)/articles/[slug]/page.tsx`
- Modify: `app/(public)/my-preppy/page.tsx`
- Modify: `app/_components/home-page.tsx`
- Modify: `app/_components/institution-pages.tsx`
- Modify: `app/_components/opportunity-article-pages.tsx`
- Modify: `app/_components/public-cards.tsx`
- Modify: `app/_components/follow-cta.tsx`
- Modify: `app/(public)/my-preppy/my-preppy-view.tsx`
- Create: `tests/unit/wp14-public-instrumentation.test.tsx`

1. Add RED tests for successful-only Home/Institution/Opportunity/Article/My Preppy views, sanitized search/filter properties, hero clicks, Article→Institution, Article→Follow, and browser-owned Follow click.
2. Add page trackers only after successful canonical DTO resolution; redirect/404/admin/auth pages receive none.
3. Emit `search`/`filter` from safe server-derived result/filter state. The registry has no Institution-list view event, so do not invent one; plain list renders have no custom event.
4. Move `follow_click` and `my_preppy_view` to the client. Do not duplicate server-owned commit events.
5. Run public/view and affected WP-07/08/09 tests GREEN.

## Task 6: Connect server conversions to production transport after commit

**Files:**
- Modify: `src/modules/auth/runtime.server.ts`
- Modify: `src/modules/auth/http.server.ts`
- Modify: `src/modules/auth/complete-signup.server.ts`
- Modify: `src/modules/follow/runtime.server.ts`
- Modify: `src/modules/follow/activate-follow.server.ts`
- Modify: `src/modules/my-preppy/runtime.server.ts`
- Modify: `src/modules/my-preppy/query.server.ts`
- Modify: `src/modules/notification/send-delivery.server.ts`
- Modify: `src/modules/notification/reconcile-resend.server.ts`
- Modify: `src/modules/notification/process-resend-provider-event.server.ts`
- Modify: `src/modules/notification/resend-webhook-http.server.ts`
- Modify: `src/modules/admin/http/outbox-operations.server.ts`
- Modify: `scripts/worker.ts`
- Create: `tests/unit/wp14-runtime-hookup.test.ts`
- Modify focused WP-08/WP-09/WP-12 tests as ownership expectations change.

1. Add RED tests showing runtime dependencies select the production tracker, all async tracking is awaited outside commit, analytics failure preserves DB/HTTP success, rollback emits zero, webhook receipt dedupe emits once, and client/server owners do not overlap.
2. Replace runtime Noop singletons with the analytics runtime factory.
3. Await `void | Promise<void>` tracker calls inside bounded post-commit try/catch blocks.
4. Remove server `follow_click` and server My Preppy view emission.
5. Run signup/follow/notification regressions GREEN.

## Task 7: Add PostgreSQL operational KPI query

**Files:**
- Create: `src/analytics/kpi-query.server.ts`
- Create: `tests/integration/wp14-kpi-query.test.ts`

1. Add RED fixtures for ACTIVE/PENDING/DELETED users, active/inactive Follows, verified/usable and unusable emails, latest consent tie-breaking, preferences, zero AMP, and 30-day boundaries.
2. Implement one bounded read-only CTE query returning active users, users with active Follow, total active Follows, email-ready Follow users, AMP, average active Follow among AMP, new users 30d, and new logical Follows 30d.
3. Use AMP only as the average denominator and return zero rather than NaN/division errors.
4. Run KPI integration tests GREEN.

## Task 8: Document measurement and deployment contract

**Files:**
- Create: `docs/14_ANALYTICS_MEASUREMENT.md`
- Modify: `.env.example`
- Create: `tests/unit/wp14-measurement-docs.test.ts`

1. Add RED doc-contract checks for every canonical event, metric source/denominator/window, KST reporting, GA4 setup, GSC manual setup, internal-traffic recommendation, non-production isolation, PII bans, and deferred hardening.
2. Write the docs without real credentials and without GA/GSC reporting APIs.
3. Run doc tests GREEN.

## Task 9: Browser fixture and adversarial security audit

**Files:**
- Create: `tests/browser/wp14/seed-analytics.ts`
- Create: `tests/browser/wp14/run-analytics-browser.py`
- Create: `tests/browser/wp14/analytics-scenarios.md`
- Create: `tests/unit/wp14-browser-fixture-contract.test.ts`

1. Add fixture-contract RED test ensuring injected capture only, expected public flow, admin-zero assertion, and forbidden-payload scan.
2. Implement deterministic seed and browser flow: Home → Institution list → detail → Follow/auth/signup → My Preppy → Article; separately browse Admin and assert zero consumer events.
3. Run browser flow against the local test database with no Google network.
4. Scan analytics files and built client assets for PII families, raw queries, legacy IDs, `GA4_API_SECRET`, and arbitrary provider payloads; manually inspect every match.

## Task 10: Controlled full verification and hostile review

**Files:**
- Modify only files needed to fix Critical/Important findings.

1. Run all focused WP-14 tests, affected WP-08/09/12/13 suites, migration fresh/upgrade checks, full unit/integration suite, typecheck, lint, scoped/global format checks, build, and browser fixture.
2. Hostile-review PII, query/secret/legacy-ID leaks, duplicate events, pre-commit emission, failure rollback, Admin pollution, AMP denominator, and notification duplication.
3. Rerun impacted tests after each fix.
4. Review `git diff --check`, `git status`, diff scope, packages, migrations, and schema. Confirm no commit/push/deploy.

## Locked adjustments

- Canonical event count stays 19; no event is added or renamed.
- `/institutions` has no matching canonical list-view event. WP-14 records safe `search`/`filter` actions only and does not fabricate a list event.
- Server Measurement Protocol uses a fresh transport-only random `client_id` per send because no persistent GA identity is approved. It is never stored and is not a PREPPY User identity.
- Existing mutually exclusive `follow_created` versus `additional_follow` semantics remain unchanged; WP-14 does not redefine prior Product events.
- No analytics Outbox, package, migration, schema change, ad-tech, reporting API, or production deployment.
