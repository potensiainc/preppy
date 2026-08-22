# AdmissionRadar — Collection Architecture v0.1

**Recommended file:** `docs/05_COLLECTION_ARCHITECTURE.md`
**Status:** Pre-Implementation Architecture
**Version:** 0.1
**Reference date:** 2026-08-14
**Parent documents:**

* `00_PROJECT_CONTEXT.md`
* `01_PRD.md`
* `02_INFORMATION_ARCHITECTURE.md`
* `03_DOMAIN_MODEL.md`
* `04_DATA_MODEL.md`

---

# 0. Purpose

This document defines how AdmissionRadar discovers, collects, detects, extracts, and prepares admission information for verification.

The collection system exists to answer:

> **“공식 입학정보에 의미 있는 변화가 생겼는가?”**

It does **not** decide by itself:

> **“이 정보가 사실인가?”**

That decision belongs to:

`06_SOURCE_AND_VERIFICATION_POLICY.md`

The architectural boundary is therefore:

```text
Collection
→ Candidate Knowledge

Verification
→ Trusted Knowledge
```

---

# 1. Primary Objective

For approximately 50 launch schools, the system should:

1. know which official sources matter;
2. check them automatically;
3. avoid downloading unchanged content unnecessarily;
4. preserve source evidence;
5. detect changes;
6. discard irrelevant changes;
7. extract structured admission candidates;
8. identify conflicts and duplicates;
9. send only meaningful candidates to human review;
10. eventually reduce human work without reducing accuracy.

---

# 2. Non-Objective

The Collector is not intended to:

* crawl the entire web;
* scrape every school page;
* automatically publish whatever an LLM extracts;
* bypass login, CAPTCHA, or access restrictions;
* monitor arbitrary parent communities;
* collect personal applicant information;
* replicate school websites.

AdmissionRadar monitors a **small, curated Source Registry**.

---

# 3. Core Architecture

```text
Source Registry
      ↓
Monitoring Scheduler
      ↓
Fetcher
      ↓
Response Classifier
      ↓
Normalizer
      ↓
Snapshot / Hash
      ↓
Change Detector
      ↓
Admission Relevance Filter
      ↓
Structured Extractor
      ↓
Normalizer / Entity Resolver
      ↓
Deterministic Validator
      ↓
Duplicate / Conflict Detector
      ↓
Review Queue
      ↓
Human Verification
      ↓
Publish Transaction
      ↓
Update / Alert Candidate
```

No stage may skip directly from:

```text
Fetcher
→ Public Database
```

---

# 4. MVP Deployment Principle

Do not build distributed crawler infrastructure for 50 schools.

Recommended logical deployment:

```text
AdmissionRadar Application
│
├── Public Web
├── Admin
├── API
│
└── Background Worker
     ├── Scheduler
     ├── Fetch
     ├── Diff
     ├── Extraction
     └── Alert Jobs

PostgreSQL

Object Storage
└── Raw HTML/PDF/snapshots where needed
```

A dedicated Kafka cluster, Kubernetes platform, crawler fleet, or separate microservices are unnecessary for MVP.

The system should remain separable later, but begin operationally simple.

---

# 5. Source Registry

Every monitored endpoint must exist intentionally in the Source Registry.

Examples:

* official admissions page;
* admissions notice board;
* application portal;
* official PDF URL;
* school news page;
* school-controlled announcement page.

Each Source must know:

```text
Source identity
Authority level
Collection strategy
Monitoring profile
School binding
Admission-cycle binding if applicable
```

---

# 6. Collection Strategies

Initial strategies:

```text
HTTP
BROWSER
DOCUMENT
MANUAL
```

## HTTP

Default.

Used for ordinary HTML and publicly reachable endpoints.

## BROWSER

Used only when meaningful content requires JavaScript rendering and direct HTTP retrieval is insufficient.

## DOCUMENT

Used for directly monitored documents such as PDFs.

## MANUAL

Used when automation is inappropriate or impossible.

Examples:

* login-gated portal;
* CAPTCHA;
* unstable social source;
* source whose terms/access model do not permit reliable automated monitoring.

---

# 7. Strategy Escalation

Always prefer:

```text
HTTP
↓ if necessary
BROWSER
↓ if unsuitable
MANUAL
```

Do not begin with browser automation for every page.

Browser automation is:

* slower;
* more brittle;
* more expensive;
* harder to debug.

---

# 8. Source Monitoring Profiles

MVP should use a small set of reusable profiles.

Example:

```text
CRITICAL_SEASONAL
STANDARD_SEASONAL
LOW_CHANGE
DOCUMENT_STATIC
MANUAL
```

Individual Sources can override the profile later.

---

# 9. Initial Monitoring Cadence

Suggested starting defaults:

## `CRITICAL_SEASONAL`

During expected announcement/application season:

```text
every 3 hours
```

Outside season:

```text
every 24 hours
```

Typical:

* admissions notice board;
* application announcement page.

## `STANDARD_SEASONAL`

Peak:

```text
every 6–12 hours
```

Off-season:

```text
every 24 hours
```

## `LOW_CHANGE`

```text
every 48–72 hours
```

Typical:

* eligibility page;
* static admissions overview.

## `DOCUMENT_STATIC`

No recurring check after archival unless referenced by a changing index page.

These values are configuration defaults, not permanent business rules.

---

# 10. Season-Aware Scheduling

AdmissionRadar should not check every Source at the same frequency all year.

Monitoring intensity can be based on:

```text
school type
event history
historical announcement window
current admission cycle state
active registration windows
```

Example:

A private elementary admissions board becomes high priority around expected autumn announcements.

This lowers unnecessary requests and operating cost.

---

# 11. Scheduler Requirements

The scheduler must support:

* due source selection;
* source-specific cadence;
* retry scheduling;
* temporary suspension;
* manual run;
* priority ordering;
* no duplicate concurrent fetches for the same Source.

A Source should not have multiple concurrent collection jobs under normal operation.

---

# 12. Scheduler Idempotency

Retrying scheduler execution must not create duplicated downstream work.

Use a logical job identity based on:

```text
source_id
+
scheduled time bucket
```

or equivalent locking.

PostgreSQL advisory locks or job uniqueness may be sufficient for MVP.

A distributed locking service is unnecessary initially.

---

# 13. Fetcher Responsibilities

The Fetcher should:

1. request the canonical Source;
2. follow legitimate redirects;
3. record final URL;
4. record HTTP status;
5. record latency;
6. record response type;
7. preserve useful caching headers;
8. return raw content to normalization;
9. classify failures.

It must not perform admission interpretation.

---

# 14. Conditional Requests

Where supported, use:

```text
ETag
If-None-Match

Last-Modified
If-Modified-Since
```

Benefits:

* lower bandwidth;
* lower origin load;
* faster monitoring.

HTTP `304 Not Modified` should create an observation but no new snapshot.

---

# 15. Fetch Safety

AdmissionRadar must:

* use reasonable request frequency;
* identify itself appropriately where relevant;
* honor applicable access restrictions;
* respect explicit rate limiting;
* not evade CAPTCHA;
* not rotate identities merely to bypass blocking;
* not access private applicant data.

If automation is not permitted or reliably available:

```text
MANUAL
```

is a valid strategy.

---

# 16. HTTP Result Classification

Examples:

```text
200
→ process

304
→ unchanged observation

301/302
→ record redirect/final URL

404/410
→ source lifecycle review

403
→ ACCESS_ERROR

429
→ RATE_LIMITED / retry later

5xx
→ temporary failure
```

A failed fetch never means:

> no admission announcement exists.

---

# 17. Retry Policy

Suggested MVP policy for transient failures:

```text
maximum 3 attempts
```

with increasing backoff.

Retry:

* timeout;
* temporary network failure;
* selected 5xx;
* 429 according to server guidance.

Do not aggressively retry:

* persistent 403;
* 404;
* unsupported page;
* authentication requirement.

After final failure:

```text
SourceObservation = error
```

and Source enters operational review if failures persist.

---

# 18. Circuit Breaking

Repeated source failures should not create endless traffic.

Example:

```text
3 consecutive failures
→ slower retry cadence

persistent failure
→ admin attention
```

Existing verified admission facts remain unchanged.

---

# 19. HTML Processing

For HTML:

```text
Raw HTML
↓
Remove known non-content noise
↓
Extract meaningful text/links
↓
Normalize whitespace
↓
Generate hashes
```

Do not strip information that may be significant, including:

* dates;
* links;
* headings;
* table contents;
* button labels;
* attachments.

---

# 20. Two-Level Hashing

Use at least:

```text
raw/content hash
normalized text hash
```

Why?

A page may change technically without changing visible admission information.

Example:

```text
analytics script updated
```

Raw hash changes.

Normalized admission text may not.

This prevents unnecessary expensive processing.

---

# 21. Snapshot Rule

Create a new Snapshot when meaningful normalized source state changes.

Repeated checks of identical content should reference the existing Snapshot.

Example:

```text
08:00 → Snapshot A
11:00 → Snapshot A
14:00 → Snapshot B
```

This preserves observations without duplicating storage.

---

# 22. Raw Storage

Large source bodies should preferably be stored in object storage.

Examples:

* HTML;
* PDF;
* screenshot when operationally necessary.

PostgreSQL stores:

```text
hash
normalized text
metadata
storage key
```

Avoid making PostgreSQL a file archive.

---

# 23. PDF Pipeline

PDF should follow:

```text
Download
↓
Hash
↓
Native text extraction
↓
Structure/page mapping
↓
Normalize
↓
Diff / Extract
```

If the PDF does not contain usable text:

```text
OCR fallback
```

may be used.

OCR-derived critical fields require stronger human verification.

Preserve:

```text
document hash
page numbers
source URL
original file
```

---

# 24. Same-URL PDF Replacement

Schools may replace a PDF without changing its URL.

Therefore:

```text
URL equality ≠ document equality
```

Always compare content hash.

Example:

```text
/admission-guide.pdf

v1 hash = A
v2 hash = B
```

This should trigger change processing.

---

# 25. PDF Version Evidence

For extracted data, retain:

```text
PDF page
relevant excerpt
document hash
observation timestamp
```

Reviewer should be able to inspect the exact document version used.

---

# 26. JavaScript Pages

Only use browser rendering when:

* HTTP content does not expose meaningful page data;
* content is public;
* browser automation is permitted/reasonable.

Browser fetch output should ultimately be normalized into the same pipeline:

```text
Rendered DOM
→ normalized text
→ Snapshot
```

Do not create a separate truth model for browser Sources.

---

# 27. Public Application Portals

If an application portal exposes public admission information:

monitor the public portion normally.

If information requires:

* applicant authentication;
* private account;
* CAPTCHA;

do not automate around those restrictions.

Use an alternative official Source or Manual monitoring.

---

# 28. Official Social Sources

Official social posts may be useful where a School actually publishes admission announcements there.

However, initial preference is:

```text
official admission page/document
>
official school website
>
official social
```

Social sources should normally be secondary or discovery sources.

If social media is the only official publication channel for a relevant institution, critical facts still require human verification.

---

# 29. Change Detector

A Source change should initially be treated as:

```text
technical difference
```

not:

```text
admission change
```

The detector generates a `DetectedChange`.

---

# 30. Change Detection Levels

Possible levels:

### Level 1 — Hash

Did normalized content change?

### Level 2 — Structural/Text Diff

What blocks changed?

### Level 3 — Semantic Relevance

Does the changed content concern admissions?

### Level 4 — Domain Extraction

Which Admission Events/Facts may have changed?

This staged approach minimizes unnecessary LLM calls.

---

# 31. Admission Relevance Filter

First use deterministic signals where possible.

Examples:

```text
입학
입학설명회
모집
원서
접수
추첨
합격
등록
추가모집
admission
application
open house
deadline
enrollment
```

Also use:

* relevant page location;
* known notice-board category;
* document title;
* source role.

---

# 32. LLM Relevance Classification

LLM classification may be used after deterministic filtering where ambiguity remains.

Expected output:

```text
relevant: true/false

candidate_event_types

reason

changed_excerpt_ids
```

LLM output is:

> classification assistance

not evidence.

---

# 33. Relevance False Positives

Example:

Page adds:

> 2027학년도 학교급식 안내

Contains `2027학년도`, but is not admissions-related.

This should terminate as:

```text
IRRELEVANT
```

before entering human review where possible.

---

# 34. Structured Extractor

For relevant changes, extraction output should be schema-constrained.

Conceptual example:

```json
{
  "school_id": "...",
  "academic_year": 2027,
  "candidate_changes": [
    {
      "event_type": "APPLICATION",
      "event_key_candidate": "application-main",
      "registration_open_date": "2026-11-07",
      "registration_close_date": "2026-11-12",
      "evidence": {
        "excerpt": "...",
        "locator": "PDF page 3"
      }
    }
  ]
}
```

Free-form prose extraction is insufficient.

---

# 35. Original Text Preservation

Every extracted critical value should preserve the relevant source wording.

Example:

```text
Normalized:
2026-11-07

Original:
2026. 11. 7.(토)
```

This allows reviewers to verify normalization.

---

# 36. Date Normalization

The normalizer must understand contextual formats such as:

```text
2026.11.7
11/7
11월 7일
Nov. 7
November 7, 2026
```

But if calendar year cannot safely be determined:

```text
do not invent it
```

The academic year cannot automatically be substituted for the calendar year.

---

# 37. Time Normalization

If official text says:

```text
10:00
```

store known time.

If it says only:

```text
9월 17일
```

do not create:

```text
00:00
```

Timezone defaults to:

```text
Asia/Seoul
```

for Korean Schools unless source context indicates otherwise.

---

# 38. Academic Year Resolution

The extractor should use:

* source title;
* document heading;
* linked AdmissionCycle;
* historical context;

to resolve academic year.

If conflicting or unclear:

```text
REVIEW_REQUIRED
```

Never silently attach a 2026 event to the 2027 cycle.

---

# 39. Entity Resolution

The normalizer determines whether extracted data refers to:

* an existing Event;
* a new Event;
* an existing Fact;
* a new Fact.

Example:

```text
"입학설명회 일정 변경"
```

should update/version the existing Event rather than creating another briefing.

---

# 40. Event Matching

Signals:

```text
School
AdmissionCycle
Event type
Event title similarity
Occurrence/session
Existing date
Source linkage
```

If ambiguous:

```text
do not auto-merge
```

Send candidate relationships to review.

---

# 41. Duplicate Detector

Two changes may represent the same announcement.

Example:

```text
School notice HTML
+
linked PDF
```

Both announce the same application period.

Desired result:

```text
one MeaningfulChange
+
multiple SourceEvidence records
```

not:

```text
two Alerts
```

---

# 42. Duplicate Fingerprint

A semantic fingerprint can use:

```text
school
academic year
event type
normalized changed fields
normalized values
```

Example:

```text
school123|2027|APPLICATION|close_date|2026-11-12
```

This assists but does not replace semantic review.

---

# 43. Deterministic Validator

Before human review, validate basic invariants.

Examples:

```text
end >= start

registration close >= registration open

academic year plausible

date within plausible admission horizon

event belongs to School/Cycle

required evidence exists
```

Failure:

```text
VALIDATION_ERROR
```

not automatic publication.

---

# 44. Plausibility Checks

Example:

For 2027 admissions:

An extracted date of:

```text
2016-11-12
```

is probably parsing failure.

Plausibility rules should flag it.

They should not silently “correct” it to 2026.

---

# 45. Conflict Detector

Compare candidate data against:

* current verified EventVersion;
* current verified FactVersion;
* other authoritative Sources;
* active cycle.

Examples:

```text
existing deadline: Nov 10
candidate: Nov 12
```

→ potential meaningful change.

Or:

```text
Source A: Nov 10
Source B: Nov 12
```

→ conflict requiring verification.

---

# 46. Review Queue Input

The collection pipeline's final product is a **review package**.

For each candidate:

```text
School
Academic Year
Source
Authority Level
Detected At

Previous verified value

Candidate value

Changed source excerpt

Source link

Snapshot/document version

Risk classification

Conflict flag

Duplicate candidates

Extraction metadata
```

The operator should not need to manually rediscover the entire source.

---

# 47. AI Confidence

Model confidence may be recorded for:

* triage;
* queue ordering;
* debugging.

It must **not** independently authorize publication.

Example:

```text
confidence = 0.99
```

does not mean:

```text
safe to publish
```

Publication is governed by `06_SOURCE_AND_VERIFICATION_POLICY.md`.

---

# 48. Review Outcomes

Reviewer can:

```text
APPROVE
EDIT_AND_APPROVE
REJECT
IGNORE
MARK_DUPLICATE
ESCALATE_CONFLICT
```

Any critical manual edit should preserve:

```text
original extracted value
+
approved value
```

for auditability.

---

# 49. Publish Transaction

On approval:

```text
BEGIN

Create/update stable Event or Fact if necessary

Create new EventVersion / FactVersion

Attach SourceEvidence

Supersede previous current version if required

Create MeaningfulChange

Update relevant AdmissionCycle lifecycle if required

Mark approved version current

COMMIT
```

Only after successful commit may downstream publication occur.

---

# 50. Downstream Publication

After DB truth is committed:

```text
Public page refresh/revalidation
↓
Update article draft/creation
↓
Alert candidate generation
```

Email must not be sent before trusted DB state exists.

---

# 51. No Inline Email Sending

Never:

```text
Approve
→ open DB transaction
→ send email
→ commit
```

An email provider failure must not roll back verified admission truth.

Use:

```text
DB commit
→ delivery job
```

---

# 52. Update Content Generation

A verified MeaningfulChange may trigger an Update draft.

AI may draft:

* title;
* summary;
* explanation.

But exact critical values must come from structured verified data.

Do not let a content model regenerate dates from prose.

---

# 53. Source Discovery

AdmissionRadar may identify new relevant Sources while monitoring.

Example:

A notice page links to a new 2027 admissions portal.

Process:

```text
DISCOVERED
↓
human/source-policy review
↓
ACTIVE
```

Do not automatically add every outbound URL to active monitoring.

---

# 54. Source Retirement

A Source can be retired when:

* School replaces admission platform;
* URL permanently disappears;
* page becomes unrelated;
* better official source supersedes it.

Historical snapshots and evidence remain.

---

# 55. Broken Source Does Not Delete Truth

If a School removes an old announcement:

Existing verified data remains.

Source becomes:

```text
404/RETIRED
```

Do not delete:

* Event;
* Fact;
* historical evidence pointer.

The stored Snapshot remains evidence.

---

# 56. Monitoring Error States

Operational states should distinguish:

```text
HEALTHY
DEGRADED
STALE
ERROR
PAUSED
```

These are monitoring projections, not admission states.

---

# 57. Initial Freshness Profiles

Suggested operational defaults during peak periods:

```text
Critical source:
expected successful check within 12h

Standard:
within 24h

Low-change:
within 72h
```

These are admin health thresholds.

Public status rules are governed separately.

---

# 58. Queue Prioritization

Review priority should consider:

```text
critical field change
deadline proximity
source authority
user subscriber count
event importance
detected time
```

Example:

> Application deadline changed for a School with 500 subscribers

should rank above:

> minor Open House venue wording change.

---

# 59. Subscriber Count Must Not Alter Truth

Subscriber volume may influence:

```text
review priority
```

but never:

```text
verification threshold
```

A low-traffic School still requires accurate data.

---

# 60. Observability

Required collection metrics:

```text
fetch attempts
fetch success rate
304 rate
changed snapshot rate
admission-relevant change rate
false-positive rate
extraction failure rate
review queue size
source stale count
detection latency
verification latency
```

---

# 61. Per-Source Health

Admin Source page should show:

```text
last attempted check
last successful check
last content change
last meaningful admission change
consecutive failures
current monitoring profile
next scheduled check
```

---

# 62. Logging

Use structured logs containing:

```text
source_id
school_id when known
observation_id
detected_change_id
job_id
outcome
duration
error_code
```

Do not log:

* subscriber email;
* auth tokens;
* entire private documents.

---

# 63. Manual Collection

Manual is a first-class collection strategy.

Admin should be able to:

```text
Add source
Upload/reference official document
Enter extracted candidate
Attach evidence
Submit for verification
```

Manual input still follows:

```text
Evidence
→ Review
→ Version
→ MeaningfulChange
```

It must not bypass the domain model.

---

# 64. Historical Seeding

Historical 2025/2026 data should not be forced through the live change detector.

Preferred:

```text
Historical Import
↓
Manual/structured verification
↓
AdmissionCycle / Event / Fact / Evidence
```

No fake `DetectedChange` is necessary.

---

# 65. Collection Cost Control

For 50 Schools, optimize in this order:

```text
conditional HTTP
↓
hashing
↓
deterministic relevance
↓
LLM only when required
↓
browser rendering only when required
```

Do not run an LLM against every source check.

---

# 66. Graceful Degradation

If LLM extraction is unavailable:

Collection should continue:

```text
fetch
snapshot
change detection
```

Relevant changed Sources can enter:

```text
manual review
```

The system must not become blind because one AI service is unavailable.

---

# 67. Graceful Degradation — Browser

If browser rendering fails:

* preserve last verified truth;
* record source error;
* notify admin if freshness threshold exceeded.

Do not mark target schedule as unannounced.

---

# 68. Security Boundary

Fetched external content is untrusted.

Treat HTML/PDF text as data, not instructions.

The extraction system must not allow external page content to:

* alter system prompts;
* invoke arbitrary tools;
* run code;
* change database behavior;
* expose secrets.

---

# 69. Prompt Injection Defense

LLM extraction prompts must explicitly treat source contents as untrusted documents.

Extraction should be limited to a fixed schema.

Never let source text determine:

* API calls;
* publication authorization;
* admin operations.

---

# 70. Required Data Model Amendment

Before migrations are implemented, `04_DATA_MODEL.md` should be amended with source-monitoring configuration.

Recommended MVP table:

## `source_monitor_configs`

```text
id uuid
source_id uuid UNIQUE FK
collection_strategy text
monitoring_profile text
custom_interval_minutes integer nullable
seasonal_enabled boolean
browser_required boolean
max_attempts smallint default 3
is_enabled boolean
created_at
updated_at
```

Optional later fields:

```text
next_check_at
priority_override
```

The scheduler may calculate `next_check_at`, but persistent scheduling state can be added if needed.

This table should move from conceptual P1 to **P0**.

---

# 71. Recommended Observation Amendment

Add nullable response metadata to `source_observations`:

```text
etag
last_modified
```

This supports conditional requests and debugging.

---

# 72. MVP Collection Definition of Done

Collection architecture is operational when:

```text
registered Source
↓
scheduled automatically
↓
fetched
↓
observation recorded
↓
snapshot reused/created correctly
↓
meaningful content change detected
↓
admission relevance classified
↓
structured candidate extracted
↓
deterministic validation executed
↓
conflicts/duplicates surfaced
↓
review package created
```

No public change is required to happen automatically.

---

# 73. Phase Progression

## Stage C0 — Manual Data

Historical database manually seeded.

## Stage C1 — Automated Observation

Sources fetched and snapshots created.

## Stage C2 — Automated Change Detection

Relevant source changes surfaced.

## Stage C3 — Automated Extraction

Structured candidate Events/Facts generated.

## Stage C4 — Human-Verified Publishing

Most important MVP automation state.

## Stage C5 — Selective Auto-Approval

Only after verification quality is proven.

The project should launch successfully at **C4**.

100% autonomous publishing is not an MVP requirement.

---

# 74. Final Architecture Principle

The system must optimize for:

> **minimum human attention per meaningful admission change**

not:

> minimum human involvement regardless of accuracy.

The correct pipeline is:

```text
Machine does repetitive monitoring.
Machine removes obvious noise.
Machine structures the evidence.
Human handles consequential uncertainty.
Verified structured data becomes public truth.
```

This is AdmissionRadar's collection architecture.
