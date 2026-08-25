# WP-14 Analytics Runtime and Measurement Contract

Status: implemented MVP contract (2026-08-25)

This document is the operating contract for PREPPY measurement. PostgreSQL is
the source of truth for product state and operational KPIs. GA4 is a
best-effort behavioral mirror. GSC is the search-acquisition source. Analytics
must never create, change, or repair canonical product state.

## Runtime modes and secrets

The public layout initializes analytics; the Admin layout never does.

| Environment | `ANALYTICS_ENABLED` | Runtime |
| --- | --- | --- |
| development/test | any value | Noop or injected Test capture; Google is never loaded |
| production | `false` | Noop |
| production | `true` | GA4, only when both credentials validate |

Production configuration:

```text
ANALYTICS_ENABLED=true
GA4_MEASUREMENT_ID=G-XXXXXXXX
GA4_API_SECRET=<Measurement Protocol secret>
```

`GA4_MEASUREMENT_ID` is the only analytics configuration allowed in the
browser. The API secret is server-only and must never use a `NEXT_PUBLIC_`
name, client prop, response, log, or built asset. Missing/invalid enabled
production credentials fail closed during runtime construction. Blank
credentials are permitted only while analytics is disabled or non-production.

Non-production Test capture uses the bounded
`window.__PREPPY_ANALYTICS_CAPTURE__` hook installed before hydration. It
captures the canonical event after the same runtime validation and never loads
or calls Google.

## Canonical event ownership

The application emits exactly these 19 typed events. Unknown names, unknown
keys, wrong types, unbounded values, PII keys, and non-canonical identifiers
are rejected before provider mapping.

| Event | Owner | Success/action boundary | Allowlisted properties |
| --- | --- | --- | --- |
| `home_view` | Client-owned | successful canonical Home render, once per navigation | `landing_page` |
| `article_view` | Client-owned | successful PUBLIC Article render; never redirect/404 | `article_id` |
| `search` | Client-owned | successful Institution results render when a query exists | `query_length_bucket`, `result_count`, optional `category` |
| `filter` | Client-owned | successful results render for each structured filter | `filter_type`, `filter_value`, `result_count` |
| `institution_view` | Client-owned | successful canonical Institution render | `institution_id`, `category`, optional canonical `region_code` |
| `opportunity_view` | Client-owned | successful canonical Opportunity render | `opportunity_id`, `institution_id`, `kind` |
| `follow_click` | Client-owned | actionable Follow CTA click, before its request | `institution_id`, `context`, optional Article/Opportunity ID |
| `signup_start` | Server-owned | PENDING identity commit after provider callback | `context` |
| `signup_complete` | Server-owned | signup root transaction commit | `context` |
| `follow_created` | Server-owned | first active Follow commit only | `institution_id`, `follow_count=1` |
| `additional_follow` | Server-owned | later Follow create/reactivation commit only | `institution_id`, `follow_count>=2` |
| `my_preppy_view` | Client-owned | successful ACTIVE private view, once per navigation | `follow_count`, `email_state` |
| `notification_sent` | Server-owned | provider acceptance and Delivery settlement commit | `notification_id`, `opportunity_id` |
| `notification_open` | Server-owned | first deduplicated provider open receipt commit | `delivery_id` |
| `notification_click` | Server-owned | first deduplicated provider click receipt commit | `delivery_id` |
| `article_to_institution` | Client-owned | structured related Institution link click | `article_id`, `institution_id` |
| `article_to_follow` | Client-owned | Article-context Follow CTA click | `article_id`, `institution_id` |
| `hero_primary_cta_click` | Client-owned | Home primary CTA click | `cta=INSTITUTIONS` |
| `hero_secondary_cta_click` | Client-owned | Home secondary CTA click | `cta=CURRENT_OPPORTUNITIES` |

The plain `/institutions` list view has no canonical list-view event. It emits
only `search` and/or `filter` when applicable; no new event is invented.
Client navigation dedupe suppresses rerender/Strict Mode duplicates while a
real canonical navigation, including back navigation, can emit again.

Every Server-owned conversion runs after commit. Transport uses a short
bounded timeout, no retry, safe bounded warning metadata, and swallows network
or non-2xx failure. Server Measurement Protocol sends an ephemeral random
`client_id` per request: there is no persistent analytics identity and no GA4
User-ID stitching. Analytics failure cannot roll back or alter auth, Follow,
Delivery, provider-event, HTTP, or worker truth.

## PII and URL guard

The following are forbidden in canonical or provider payloads: email, phone,
name, Kakao subject, OAuth subject, raw User ID, child data, date of birth,
free text, memo, Admin input, provider payload, Source snapshot, raw query,
query string, and arbitrary object spread. Legacy School IDs, AdmissionEvent
IDs, and legacy bridge IDs are forbidden; only explicitly contracted canonical
IDs are accepted.

`search` records a length bucket (`EMPTY`, `1_3`, `4_10`, `11_PLUS`) rather
than search text. Free-text region input is not emitted unless it is already a
bounded canonical taxonomy value. No current full URL, pathname, query, or
fragment enters a typed event. Because Google otherwise defaults
`page_location` to `document.location`, PREPPY overrides provider
`page_location` to the APP origin root and reduces `page_referrer` to its HTTP(S)
origin root. This retains a bounded acquisition origin while blocking raw paths
and queries. The canonical page/event type supplies product meaning.

The runtime guard is defense in depth: strict Zod event schemas, recursive
prohibited-key detection, an exhaustive provider mapper, and the same parser in
Noop, Test, browser GA4, and server GA4 adapters.

## Operational KPI contract

`src/analytics/kpi-query.server.ts` is server-only, read-only, and returns one
bounded aggregate row. It never reads GA4.

| Metric | PostgreSQL source of truth and definition | Window/denominator |
| --- | --- | --- |
| Active Users | `users.status = ACTIVE` | current state |
| Users with active Follow | ACTIVE users with at least one `follows.status = ACTIVE` | current state |
| Total active Follows | count of current ACTIVE Follow rows | current state |
| Email-ready Follow users | ACTIVE users with an active Follow and a VERIFIED, USABLE, non-removed email | current state; before consent/preference |
| Active Monitoring Parents (AMP) | email-ready Follow user whose latest `SERVICE_EMAIL_UPDATES` decision is `GRANTED` and EMAIL preference is `ENABLED` | current state; latest consent ordered by `decided_at`, `id` |
| Average active Follow count among AMP | sum of active Follow counts for AMP users divided by AMP count | AMP users are the denominator; zero AMP returns `0` |
| New users 30d | User rows created since the cutoff | rolling 30-day window from `asOf` |
| New follows 30d | logical Follow rows whose `first_activated_at` is since the cutoff | rolling 30-day window from `asOf` |

Operational reports display dates in `Asia/Seoul` (KST). The query accepts an
exact UTC `asOf` instant and uses an exact rolling 30-day duration. If a future
report requires KST calendar-day cohorts, it must define a separate query;
silently changing this window is forbidden.

Behavioral sources remain separate: detail/page behavior and funnels are GA4;
canonical Follow/AMP/notification state is PostgreSQL; search impressions,
clicks, queries, and indexed visibility are GSC. Email opens are directional
because provider/privacy behavior can inflate or suppress them.

## GA4 manual setup

1. Create one GA4 property and Web data stream for the production PREPPY
   origin. Set the property reporting time zone to `Asia/Seoul`.
2. Create a Measurement Protocol API secret. Store the measurement ID and
   secret only in the server production environment, then set
   `ANALYTICS_ENABLED=true`.
3. Disable all Enhanced Measurement events for this stream. PREPPY owns its
   page/action contract and sets `send_page_view=false`; automatic page views,
   site search, form, and outbound-link events would bypass the typed registry.
4. Keep Google signals and ad-personalization signals disabled. Do not connect
   Google Ads audiences or export advertiser profiles in MVP.
5. Register event-scoped custom dimensions only for bounded categorical
   properties needed in reports: `landing_page`, `query_length_bucket`,
   `category`, `filter_type`, `filter_value`, `region_code`, `kind`, `context`,
   `email_state`, and `cta`. Do not register high-cardinality IDs as custom
   dimensions. Register `result_count` and `follow_count` as custom metrics only
   if an approved exploration needs them.
6. Define and exclude internal traffic using GA4's production office/operator
   traffic rule. Verify Realtime/DebugView with a non-production capture or a
   short controlled production check; never point development/test at the
   production property.
7. Confirm the provider receives no current path/query and that application
   events match the 19-name table. The Google configuration reference documents
   that `page_location` otherwise defaults to the browser location:
   https://developers.google.com/analytics/devguides/collection/ga4/reference/config

## GSC manual setup

GSC setup is manual in WP-14:

1. Verify the production domain property using the organization-controlled DNS
   account.
2. Submit the production sitemap and validate canonical/indexability behavior.
3. Review Search results by page/query/country/device and report dates in KST.
4. Compare GSC landing pages to GA4 `article_view` and downstream typed events
   only as separate systems; do not fabricate GSC behavior from DB proxies.

GA Data API integration: NONE. GSC API integration: NONE. No service account,
OAuth reporting scope, reporting endpoint, warehouse, BI dashboard, or
scheduled KPI snapshot is added in WP-14.

## Deferred hardening and known limitations

- Browser blockers and network loss can omit GA4 behavior; Postgres truth is
  unaffected.
- Server events intentionally cannot be stitched to a persistent browser/User
  identity in MVP.
- GA4 provider/system-generated events are not PREPPY canonical product events.
- KPI snapshots are queried live; durable daily snapshots and automated alerts
  are deferred.
- Multi-environment property governance, consent-mode policy, and distributed
  browser capture tooling require an explicit future privacy/operations review.
- GSC and GA reporting ingestion remain manual until a separately approved work
  package defines scopes, storage, retention, and access control.
