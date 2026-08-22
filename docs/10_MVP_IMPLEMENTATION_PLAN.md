# AdmissionRadar — MVP Implementation Plan v0.1

**Recommended file:** `docs/10_MVP_IMPLEMENTATION_PLAN.md`
**Status:** Implementation Source of Truth
**Version:** 0.1
**Reference date:** 2026-08-14
**Primary launch target:** 2027 Academic Year
**Launch coverage:** approximately 50 Schools

**Parent documents:**

* `00_PROJECT_CONTEXT.md`
* `01_PRD.md`
* `02_INFORMATION_ARCHITECTURE.md`
* `03_DOMAIN_MODEL.md`
* `04_DATA_MODEL.md`
* `05_COLLECTION_ARCHITECTURE.md`
* `06_SOURCE_AND_VERIFICATION_POLICY.md`
* `07_SEO_ARCHITECTURE.md`
* `08_ALERT_ARCHITECTURE.md`
* `09_ADMIN_OPERATIONS.md`

---

# 0. Purpose

This document translates AdmissionRadar's product, domain, data, collection, verification, SEO, alert, and operational specifications into a concrete implementation sequence.

The implementation objective is not:

> build every possible AdmissionRadar feature.

It is:

> **build the smallest production-quality system capable of maintaining approximately 50 Schools, publishing trusted admission intelligence, acquiring organic search traffic, capturing verified Alert Subscribers, and returning them to the site when meaningful changes occur.**

This document is authoritative for implementation order.

Codex must not skip ahead merely because later features are easier or more interesting.

---

# 1. Implementation Philosophy

AdmissionRadar should be built:

```text
Domain first
↓
Data integrity
↓
Operator workflow
↓
Public utility
↓
Alert capture
↓
Collection automation
↓
Verification
↓
Distribution
↓
SEO scaling
↓
Production hardening
```

Not:

```text
Pretty homepage
↓
AI crawler
↓
mass content generation
↓
fix database later
```

---

# 2. Preferred Technical Stack

Unless an existing repository already contains a compatible production-quality stack, use the following default.

## Language

```text
TypeScript
```

Use one primary application language wherever practical.

---

## Application Framework

```text
Next.js
App Router
TypeScript
```

Responsibilities:

* public web;
* Admin;
* server-side rendering;
* API/server actions;
* SEO metadata;
* subscription endpoints;
* internal operations UI.

---

## Database

```text
PostgreSQL 15+
```

---

## ORM / Query Layer

Preferred:

```text
Drizzle ORM
+
drizzle-kit
```

Reasons:

* SQL-like relational control;
* explicit schema;
* good PostgreSQL support;
* predictable migrations;
* appropriate for version-heavy domain modeling.

If the repository already uses another mature PostgreSQL ORM, do not rewrite it solely to follow this preference.

---

## Background Jobs

Preferred:

```text
PostgreSQL-backed job execution
```

Recommended candidate:

```text
pg-boss
```

or an equivalently mature PostgreSQL-backed job library.

Avoid adding Redis solely for MVP background jobs.

Requirements:

* retries;
* job uniqueness/idempotency;
* scheduled jobs;
* safe concurrent worker processing.

---

## Browser Collection

```text
Playwright
```

Only for Sources that actually require browser rendering.

---

## HTTP Collection

Use ordinary server-side HTTP fetch as default.

Browser escalation only where necessary.

---

## Document Processing

PDF strategy:

```text
native text extraction first
↓
fallback/manual path for unsupported/scanned documents
```

Do not make OCR a core dependency unless real Sources require it.

---

## Object Storage

Use an S3-compatible abstraction for:

* raw HTML where retention is required;
* PDFs;
* large snapshots.

Local development may use filesystem-backed storage through the same adapter.

Do not store large binary documents directly in PostgreSQL.

---

## Email

Implement an internal EmailProvider interface.

Provider must remain replaceable.

Initial implementation may target one transactional email provider selected through environment configuration.

Do not couple Alert domain logic to vendor-specific APIs.

---

## Authentication

Public users:

```text
No accounts
```

Admin:

Use a simple secure external/authenticated mechanism.

Do not build password authentication from scratch.

---

## Styling / UI

Use the existing design stack if present.

If greenfield:

```text
Tailwind CSS
```

Keep Admin functional and dense.

Do not spend MVP scope on a custom design system.

---

## Analytics

Public analytics:

* GA4 or equivalent;
* Search Console integration later.

Business-critical events such as Subscriptions and Alerts remain in PostgreSQL.

---

# 3. Repository Shape

Recommended greenfield structure:

```text
/
├── app/
│   ├── (public)/
│   │   ├── page.tsx
│   │   ├── calendar/
│   │   ├── schools/
│   │   ├── private-elementary/
│   │   ├── international-schools/
│   │   ├── updates/
│   │   ├── guides/
│   │   ├── search/
│   │   ├── subscribe/
│   │   └── unsubscribe/
│   │
│   ├── admin/
│   │   ├── page.tsx
│   │   ├── review/
│   │   ├── schools/
│   │   ├── sources/
│   │   ├── updates/
│   │   ├── alerts/
│   │   ├── subscribers/
│   │   └── system/
│   │
│   ├── api/
│   └── sitemap.ts
│
├── src/
│   ├── domain/
│   │   ├── schools/
│   │   ├── admissions/
│   │   ├── sources/
│   │   ├── verification/
│   │   ├── subscriptions/
│   │   └── alerts/
│   │
│   ├── db/
│   │   ├── schema/
│   │   ├── queries/
│   │   ├── migrations/
│   │   └── views/
│   │
│   ├── collection/
│   │   ├── scheduler/
│   │   ├── fetchers/
│   │   ├── normalizers/
│   │   ├── snapshots/
│   │   ├── diff/
│   │   ├── relevance/
│   │   ├── extraction/
│   │   └── validation/
│   │
│   ├── publishing/
│   │   ├── radar/
│   │   ├── updates/
│   │   └── seo/
│   │
│   ├── alerts/
│   │   ├── policy/
│   │   ├── rendering/
│   │   ├── delivery/
│   │   └── providers/
│   │
│   ├── jobs/
│   ├── storage/
│   ├── analytics/
│   ├── admin/
│   └── shared/
│
├── worker/
│   └── index.ts
│
├── scripts/
│   ├── seed/
│   ├── import/
│   ├── smoke/
│   └── maintenance/
│
├── docs/
│   ├── 00_PROJECT_CONTEXT.md
│   ├── 01_PRD.md
│   ├── 02_INFORMATION_ARCHITECTURE.md
│   ├── 03_DOMAIN_MODEL.md
│   ├── 04_DATA_MODEL.md
│   ├── 05_COLLECTION_ARCHITECTURE.md
│   ├── 06_SOURCE_AND_VERIFICATION_POLICY.md
│   ├── 07_SEO_ARCHITECTURE.md
│   ├── 08_ALERT_ARCHITECTURE.md
│   ├── 09_ADMIN_OPERATIONS.md
│   └── 10_MVP_IMPLEMENTATION_PLAN.md
│
├── tests/
├── .env.example
├── package.json
└── README.md
```

This is a guideline.

Do not create folders with no immediate implementation purpose merely to imitate the diagram.

---

# 4. Implementation Gates

Implementation is divided into sequential Steps.

Each Step must:

1. implement only its defined scope;
2. add appropriate tests;
3. run the relevant verification commands;
4. update documentation if implementation intentionally differs;
5. pass its Gate before the next Step begins.

A failing Gate must not be hidden.

---

# 5. STEP 0 — Repository & Specification Preflight

## Objective

Understand the current repository and ensure the 00–10 specification set is internally coherent before creating production architecture.

## Tasks

* inspect repository;
* read all `docs/00` through `docs/10`;
* identify existing stack;
* identify conflicting requirements;
* identify missing required environment dependencies;
* identify any conflict between Data Model and Collection/Alert amendments;
* create a concise implementation decision record.

Required reconciliation:

### Add to P0 data model

```text
source_monitor_configs
```

### Add Alert type

```text
CORRECTION
```

### Add reliability mechanism

Recommended:

```text
outbox_events
```

### Add Source observation metadata where useful

```text
etag
last_modified
```

## Output

Create:

```text
docs/11_IMPLEMENTATION_DECISIONS.md
```

It should record only concrete implementation choices and reconciliations.

## Gate STEP-0

PASS if:

* docs 00–10 read;
* contradictions identified/resolved;
* existing repo preserved where sensible;
* implementation stack decided;
* no production feature code added prematurely.

---

# 6. STEP 1 — Application Foundation

## Objective

Create the minimum runnable project foundation.

## Tasks

If greenfield:

* initialize Next.js + TypeScript;
* configure lint;
* configure formatter where appropriate;
* configure environment validation;
* configure PostgreSQL connection;
* configure migration system;
* add health endpoint;
* create development/test scripts.

Do not yet implement public features.

## Required environment variables

At minimum:

```text
DATABASE_URL
APP_BASE_URL
ADMIN authentication configuration
```

Future placeholders:

```text
EMAIL_PROVIDER
EMAIL_API_KEY
OBJECT_STORAGE_*
LLM_API_KEY
```

Secrets must never be committed.

## Gate STEP-1

Must pass:

```text
typecheck
lint
build
database connection test
```

---

# 7. STEP 2 — Database Schema & Migrations

## Objective

Implement the domain/data model before product pages.

## Implement P0 tables

### School

* schools
* school_aliases
* admission_cycles

### Admission

* admission_events
* admission_event_versions
* admission_facts
* admission_fact_versions
* expected_windows

### Source

* sources
* source_bindings
* source_monitor_configs
* source_observations
* source_snapshots
* detected_changes

### Verification

* event_version_evidence
* fact_version_evidence
* meaningful_changes

### Publishing

* updates
* update_changes
* guides

### Audience

* subscribers
* subscriptions
* subscription_action_tokens
* alerts
* alert_deliveries

### Operations

* admin_users
* audit_logs
* outbox_events

## Critical DB guarantees

Implement:

* one School/Cycle per academic year;
* one public-focus Cycle per School;
* unique Event key per Cycle;
* one current EventVersion;
* one current FactVersion;
* subscription dedupe;
* Alert dedupe;
* AlertDelivery dedupe;
* stable Source URL uniqueness.

## Gate STEP-2

Tests must prove DB invariants.

Minimum automated tests:

1. cannot create duplicate School cycle/year;
2. cannot create two current EventVersions;
3. cannot create two current FactVersions;
4. same Subscriber cannot have duplicate Cycle Subscription;
5. same Alert dedupe key cannot duplicate;
6. same Alert/Subscription cannot produce duplicate Email Delivery.

---

# 8. STEP 3 — Domain Services

## Objective

Make domain mutations safe before creating Admin UI.

Implement service-layer operations such as:

```text
createSchool
createAdmissionCycle
createAdmissionEvent
createDraftEventVersion
verifyEventVersion
createFact
verifyFactVersion
supersedeEventVersion
supersedeFactVersion
createMeaningfulChange
createSubscription
verifySubscription
unsubscribe
createAlert
```

Critical rule:

> Admin/routes must not directly mutate verified version rows.

Use domain services.

## Gate STEP-3

Tests must prove:

### Deadline change

```text
v1 verified/current
→ v2 created
→ v1 no longer current
→ v2 current
→ history preserved
```

### Additional recruitment

creates new Event.

### Existing verified data

cannot be mutated in place through normal domain service.

---

# 9. STEP 4 — Historical Seed / Import Foundation

## Objective

Make the first 50 Schools manageable without manual SQL.

Implement structured import mechanism.

Preferred:

```text
CSV/JSON
→ validation
→ dry-run
→ import
```

Support:

* School;
* aliases;
* admission cycles;
* historical Events;
* source URLs;
* Evidence where available.

## Requirements

```text
--dry-run
```

must validate without modifying DB.

Import must be idempotent or deterministic enough to safely rerun.

Do not hardcode School data in migrations.

## Initial data target

Eventually:

```text
~38 Seoul private elementary
~10–15 international/foreign schools
```

Historical target:

```text
2026
2025
preferably 2024 where available
```

Actual research/data population can proceed separately from core code implementation.

## Gate STEP-4

Import fixture must prove:

* repeat execution does not create duplicates;
* invalid dates are rejected;
* unknown School aliases do not silently create wrong Schools;
* historical version data remains separated by Cycle.

---

# 10. STEP 5 — Admin Foundation

## Objective

Enable non-developer operation of core entities.

Implement:

```text
/admin
/admin/schools
/admin/schools/[id]
/admin/sources
/admin/sources/[id]
```

Capabilities:

* School management;
* Cycle management;
* manual historical Event creation;
* manual Fact creation;
* Source registration;
* Source binding;
* monitoring config;
* public page navigation.

Admin must be authenticated.

## Gate STEP-5

Operator can create:

```text
School
→ Cycle
→ Event
→ verified EventVersion
→ Evidence
```

without SQL.

---

# 11. STEP 6 — Public Read Model & Core Pages

## Objective

Make AdmissionRadar useful before automation.

Implement:

```text
/
/calendar
/schools
/schools/[slug]
/private-elementary
/international-schools
```

Must derive from verified current domain data.

School Detail must show:

* current cycle;
* Radar state;
* official dates;
* unknown state;
* historical timeline;
* ExpectedWindow;
* official Sources;
* meaningful change history;
* Alert CTA placeholder/inactive until Step 7.

## Critical rule

Do not use unverified versions in public read queries.

## Gate STEP-6

Fixture-based tests must prove:

* NOT_ANNOUNCED displays correctly;
* SOURCE_ERROR does not become NOT_ANNOUNCED;
* rolling admission shows no fake deadline;
* historical cycles remain visible;
* Deadline Soon derives from verified current deadline.

---

# 12. STEP 7 — Subscription & Verification

## Objective

Turn visitors into verified AdmissionRadar Subscribers.

Implement:

```text
Alert CTA
email submission
Subscriber creation
Subscription creation
verification token
verification email adapter
/subscribe/verify
/unsubscribe
```

Email provider may initially use a local/dev adapter.

Production provider integration can occur once credentials exist.

## Security

* hash raw tokens;
* rate limit resend;
* no email enumeration;
* no raw email in analytics/logs.

## Gate STEP-7

E2E test:

```text
new visitor
→ subscribe
→ verification token generated
→ verify
→ VERIFIED subscription
→ unsubscribe
→ future eligibility false
```

Repeated subscribe must not create duplicate Subscription.

---

# 13. STEP 8 — Collection Foundation

## Objective

Automatically observe Sources without publishing anything.

Implement:

```text
scheduler
HTTP fetcher
conditional HTTP
source observation
snapshot normalization
snapshot dedupe
object-storage adapter
job retries
source health
```

Do not implement LLM publication.

## Strategies

P0:

```text
HTTP
DOCUMENT
MANUAL
```

Browser:

implement only when real launch Sources require it.

## Gate STEP-8

Fixture/local Source tests must prove:

```text
first fetch
→ observation + snapshot

unchanged fetch
→ new observation
→ same snapshot

changed fetch
→ new snapshot

403
→ ACCESS_ERROR
→ existing domain truth untouched
```

---

# 14. STEP 9 — Change Detection & Relevance

## Objective

Turn Source changes into candidate admission changes.

Implement:

```text
normalized diff
DetectedChange
deterministic admission relevance filter
duplicate fingerprint
review-candidate creation
```

LLM integration may be introduced behind an interface.

The system must continue functioning without LLM availability.

## Gate STEP-9

Tests:

* irrelevant content change filtered;
* relevant admission phrase enters candidate path;
* same snapshot never produces repeated semantic candidate unnecessarily;
* Source error does not create admission candidate.

---

# 15. STEP 10 — Structured Extraction

## Objective

Produce typed admission candidates from relevant Source changes.

Implement extraction interface:

```text
AdmissionExtractor
```

Output must be schema-validated.

Fields may include:

* academic year;
* Event type;
* Event key candidate;
* dates;
* registration window;
* Facts;
* Evidence excerpt;
* Evidence locator.

## Required protection

External Source content is untrusted.

LLM cannot:

* execute instructions;
* authorize publication;
* call arbitrary application operations.

## Gate STEP-10

Curated fixture set must include:

* Korean dates;
* English dates;
* application ranges;
* Open House registration window;
* rolling admission;
* deadline correction;
* ambiguous year.

Ambiguity must go to review, not be guessed.

---

# 16. STEP 11 — Review Queue & Verification

## Objective

Reach Collection maturity level C4.

Implement:

```text
/admin/review
```

Review detail must display:

* previous verified value;
* candidate;
* original Source wording;
* normalized value;
* Source authority;
* Evidence;
* conflict;
* subscriber impact.

Actions:

```text
Approve
Edit & Approve
Reject
Ignore
Duplicate
```

R2/R3 human approval mandatory.

## Gate STEP-11

E2E:

```text
changed Source
→ DetectedChange
→ extracted candidate
→ Review Queue
→ Approve
→ new verified version
→ old version preserved
→ MeaningfulChange created
→ public School page updated
```

This is the most important technical MVP Gate.

---

# 17. STEP 12 — Update Publishing

## Objective

Convert verified MeaningfulChanges into useful SEO Updates.

Implement:

```text
/admin/updates
/updates
/updates/[slug]
```

AI may draft prose.

Critical dates always originate from structured verified values.

Update workflow:

```text
MeaningfulChange
→ Draft
→ Preview
→ Publish
```

## Gate STEP-12

Test:

One 모집요강 adding multiple related Facts can produce one Update rather than multiple thin pages.

---

# 18. STEP 13 — Alert Generation & Delivery

## Objective

Complete the retention loop.

Implement:

```text
MeaningfulChange
→ outbox
→ Alert Draft
→ Admin Preview
→ Release
→ Delivery rows
→ Email worker
```

Admin:

```text
/admin/alerts
```

Initial maturity:

```text
A1 — automatic Alert draft, manual release
```

Required Alert types include:

```text
NEW_ANNOUNCEMENT
DATE_CHANGED
DEADLINE_CHANGED
ADDITIONAL_RECRUITMENT
IMPORTANT_ELIGIBILITY_CHANGE
EVENT_CANCELLED
CORRECTION
```

## Gate STEP-13

E2E:

```text
327 theoretical eligible subscriptions
→ one logical Alert
→ one Delivery per eligible Subscription
→ retry does not duplicate
→ unsubscribed Subscription excluded
```

Actual email sending can be fixture/mock-tested without production provider credentials.

---

# 19. STEP 14 — SEO Production Layer

## Objective

Make public pages search-ready.

Implement:

* titles;
* descriptions;
* canonical tags;
* robots directives;
* sitemap;
* breadcrumbs;
* structured data where appropriate;
* internal linking;
* index readiness;
* noindex parameter combinations.

Pages:

```text
School
Category
Update
Guide
Calendar
```

## Gate STEP-14

Automated checks should verify:

* no Admin URLs in sitemap;
* no verification/unsubscribe pages indexed;
* School canonical stable;
* filtered Calendar URLs noindex/canonical as specified;
* unverified facts never leak into metadata;
* sitemap contains only public/index-ready resources.

---

# 20. STEP 15 — Guides

## Objective

Add initial evergreen content foundation.

Implement Guide publishing UI/template.

Initial target:

```text
5–10 genuinely useful Guides
```

Do not auto-generate large content volumes.

Where appropriate, embed live structured AdmissionRadar modules.

## Gate STEP-15

Guide template must:

* be indexable;
* contain unique editorial content;
* support internal linking;
* not manually duplicate volatile admission dates where structured data can be embedded.

---

# 21. STEP 16 — Analytics

Implement core product event tracking:

```text
page_view
school_view
calendar_view
calendar_filter_applied
official_source_click
alert_cta_click
alert_subscription_started
alert_subscription_verified
alert_unsubscribed
update_view
guide_view
alert_email_click
search_performed
```

No raw emails.

Operational metrics come from DB.

## Gate STEP-16

Verify events contain:

```text
page type
school/cycle IDs where appropriate
non-PII acquisition context
```

---

# 22. STEP 17 — Operational Dashboard Completion

Implement final operational requirements from `09_ADMIN_OPERATIONS.md`.

Dashboard must prioritize:

```text
Critical Reviews
Stale Critical Sources
Collector Errors
Alert Drafts
```

Implement:

* source stale view;
* collection error view;
* alert failure view;
* coverage readiness;
* system/job health.

## Gate STEP-17

Operator can determine all urgent work from `/admin`.

---

# 23. STEP 18 — End-to-End Smoke Suite

Create reproducible smoke tests.

Required scenario:

```text
Seed School
↓
Create 2027 Cycle
↓
Register Source
↓
Initial Source fetch
↓
Source changes
↓
DetectedChange
↓
Extract candidate
↓
Review
↓
Approve
↓
Public School page updates
↓
Update draft
↓
Alert draft
↓
Release
↓
Delivery
↓
return landing URL valid
```

Also test:

### Error

```text
Source 403
→ verified truth preserved
```

### Correction

```text
wrong/old deadline
→ new version
→ CORRECTION-capable path
```

### Duplicate

```text
HTML + PDF same announcement
→ one logical change/Alert
```

---

# 24. STEP 19 — Production Readiness

Before deployment verify:

## Security

* Admin protected;
* tokens hashed;
* secrets externalized;
* no raw PII logs;
* rate limits;
* webhook validation where applicable.

## Database

* migrations clean;
* production migration path tested;
* backups configured;
* restore plan documented.

## Jobs

* worker process deployable separately;
* retry behavior tested;
* dead/failed jobs observable.

## Collection

* user agent configured appropriately;
* Source cadence safe;
* Browser strategy limited.

## Email

* sender domain configured;
* SPF/DKIM/DMARC depending on provider/domain;
* bounce/suppression path tested.

## SEO

* production canonical domain;
* robots;
* sitemap;
* no accidental staging indexation.

---

# 25. GO / NO-GO — Technical MVP

`MVP = GO` only if all are true:

```text
Public School page uses verified domain data
Historical timelines work
NOT_ANNOUNCED semantics work
Rolling admission works
Subscription verification works
Unsubscribe works
Source observations work
Snapshot/change detection works
Critical changes reach Review Queue
Human approval versions domain truth
Public page updates after approval
Alert dedupe works
Delivery dedupe works
Admin can operate without SQL
SEO fundamentals work
Smoke suite passes
```

---

# 26. NO-GO Conditions

Do not claim MVP GO if any of these remain:

```text
critical data auto-publishes without required verification
verified versions mutate in place
Source errors become "not announced"
duplicate Alerts possible
unsubscribe does not reliably prevent future sends
Admin requires database editing
public metadata can expose unverified dates
production migration has not been tested
```

---

# 27. Business Launch Gate

Technical MVP GO is not the same as public business launch.

Public launch additionally requires:

```text
initial School coverage
usable historical data
official Source registry
active monitoring
initial Guides
privacy/terms/source policy pages
production email/domain configuration
analytics
```

Recommended launch data target:

```text
~50 Schools
```

But quality beats hitting exactly 50.

---

# 28. Initial Data Launch Gate

Per public launch School:

Required:

```text
canonical School identity
correct category
current 2027 Cycle
at least one meaningful authoritative Source path
current state
public School page
```

Strongly desired:

```text
2026 history
2025 history
```

A PARTIAL School must not be presented as fully monitored.

---

# 29. External Dependency Policy

Implementation must not be blocked unnecessarily by missing credentials.

Use adapters/mocks for:

```text
email provider
object storage
LLM extraction
```

while core system is developed.

Only mark the affected integration as:

```text
UNVERIFIED_EXTERNAL
```

until real credentials/environment testing succeeds.

Do not falsely mark integration PASS.

---

# 30. Codex Reporting Format

After each major implementation Step, report:

```text
STEP X — [Name]

Status:
PASS / PARTIAL / BLOCKED / FAIL

Implemented:
- ...

Tests:
- ...

Results:
- ...

Files changed:
- ...

Remaining risks:
- ...

Next Step:
- ...
```

Do not produce long celebratory summaries.

---

# 31. Codex Decision Rules

If specification is ambiguous:

Priority:

```text
00 Project Context
↓
03 Domain Model
↓
06 Verification Policy
↓
04 Data Model
↓
01 PRD
↓
02 IA
↓
05/07/08/09 architecture docs
↓
10 Implementation Plan
```

Where a later document explicitly amends an earlier technical detail, the later explicit amendment wins.

Examples:

```text
05 makes source_monitor_configs P0
08 adds CORRECTION alert
08 recommends outbox_events
```

These amendments should be reflected before migrations are finalized.

---

# 32. Codex Must Not Invent Product Scope

Codex must not add:

* authentication for parents;
* reviews;
* community;
* rankings;
* recommendations;
* payment;
* premium plan;
* AI chatbot;
* CRM;
* advertiser platform;
* school dashboard;
* microservices;
* Redis solely for jobs;
* Kubernetes;
* Elasticsearch;
* native app.

unless a later explicit requirement changes scope.

---

# 33. Coding Quality Requirements

Use:

* strict TypeScript;
* explicit domain types;
* schema validation at external boundaries;
* database transactions for version transitions;
* deterministic identifiers/dedupe where required;
* structured errors;
* minimal dependency footprint.

Avoid:

```text
any
```

except where unavoidable at isolated external boundaries.

---

# 34. Testing Pyramid

## Unit

* Radar derivation;
* normalization;
* dedupe;
* Alert policy;
* validation.

## Database Integration

* constraints;
* transactions;
* versioning.

## Pipeline Integration

* Source → Snapshot → Change → Review.

## E2E

* subscription;
* public School pages;
* admin review;
* Alert release.

---

# 35. Test Fixtures

Build a small representative fixture corpus.

Must include:

```text
Korean private elementary fixed application
International rolling admission
Open House + registration window
PDF replacement
deadline extension
additional recruitment
official Source conflict
403 Source failure
duplicate HTML/PDF announcement
```

This corpus becomes critical regression infrastructure.

---

# 36. Performance Philosophy

Initial scale is small.

Optimize first for:

```text
correctness
query clarity
page speed
operator speed
```

Do not prematurely optimize for millions of Schools.

---

# 37. Expected MVP Architecture

```text
Browser
│
├── Public AdmissionRadar
└── Admin

Next.js Application
│
├── Server Components / Routes
├── Domain Services
├── Public Read Queries
├── Subscription API
└── Admin Operations

PostgreSQL
│
├── Domain truth
├── Version history
├── Source observations
├── Jobs / Outbox
└── Audience / Alerts

Worker
│
├── Scheduler
├── Collector
├── Diff
├── Extraction
├── Publishing jobs
└── Alert delivery

Object Storage
└── Source artifacts
```

This is intentionally boring.

Boring infrastructure is desirable for this MVP.

---

# 38. Final Implementation Principle

AdmissionRadar must reach production with:

```text
50 reliable Schools
```

before trying to become:

```text
5,000 unreliable Schools.
```

The MVP wins if:

```text
parents trust the dates
search engines find the pages
parents subscribe
changes bring them back
one operator can run the system
```

Everything else is secondary.
