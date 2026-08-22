# AdmissionRadar — Admin Operations v0.1

**Recommended file:** `docs/09_ADMIN_OPERATIONS.md`
**Status:** Operations Design / Pre-Implementation
**Version:** 0.1
**Reference date:** 2026-08-14
**Operating assumption:** 1 primary operator, approximately 50 launch schools
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

---

# 0. Purpose

This document defines how AdmissionRadar is operated day to day.

The Admin system exists to minimize:

> **human attention per meaningful admission change**

while maintaining high data accuracy.

The objective is not to create a generic CMS or enterprise back office.

The Admin must answer one question immediately:

> **“지금 내가 처리해야 할 것이 무엇인가?”**

The operator should not spend time:

* browsing every School manually;
* checking every Source manually;
* searching for which crawler failed;
* comparing old/new values across tabs;
* manually deciding which subscribers need an Alert;
* manually updating multiple public pages.

The system should surface exceptions.

---

# 1. Operating Model

Initial operating model:

```text
1 operator
~50 Schools
multiple Sources per School
seasonal monitoring
human verification for critical admission data
```

The Admin system must remain usable without:

* engineering intervention;
* direct SQL;
* SSH;
* manual production scripts.

---

# 2. Core Operations Principle

Routine success should be invisible.

The Admin should focus on:

```text
Changes
Errors
Conflicts
Staleness
Approvals
Alerts
```

Not:

```text
successful unchanged crawls
healthy sources
normal background jobs
```

This is an exception-based operations model.

---

# 3. Admin Navigation

Recommended primary navigation:

```text
Dashboard
Review Queue
Schools
Sources
Updates
Alerts
Subscribers
Guides
System
```

Do not create dozens of top-level sections.

Admission Cycles and Events should normally be managed within School context unless cross-school inspection is necessary.

---

# 4. Admin Dashboard Objective

The Dashboard is not an analytics dashboard.

It is an:

> **operational command center**

It should show actionable work first.

---

# 5. Dashboard — Primary Layout

Recommended:

```text
AdmissionRadar Operations
2026.08.14

────────────────────────

🚨 Needs Attention

Critical Reviews        3
Stale Critical Sources  2
Collector Errors        1
Alert Drafts            4

────────────────────────

Today's Queue

1. 경복초 deadline changed
   CRITICAL · detected 18m ago
   [Review]

2. SIS new admissions notice
   HIGH · detected 43m ago
   [Review]

3. 대광초 source stale
   last successful check 16h ago
   [Inspect]

────────────────────────

System Health

49 / 50 Schools healthy
112 / 116 Sources healthy
4 sources need attention

────────────────────────

Recent Activity

7 changes approved
3 updates published
386 alert emails sent
```

Actionable items must visually dominate metrics.

---

# 6. Dashboard Priority Buckets

Display in this order:

## P0 — Critical Admission Risk

Examples:

* application deadline changed;
* eligibility changed;
* event cancellation;
* conflicting official Sources;
* previously published value may be incorrect.

## P1 — Fresh Critical Candidate

New R2/R3 changes awaiting review.

## P2 — Monitoring Failure

Critical Source stale/error.

## P3 — Publication Tasks

Update drafts, Alert drafts.

## P4 — Routine Operations

Low-risk changes, enrichment, Guide review.

---

# 7. No Empty Dashboard Noise

Do not display:

```text
Healthy Sources: 112
Successful Crawls Today: 2,481
Unchanged Pages: 2,402
```

as dominant cards.

These are useful diagnostics, not operator tasks.

---

# 8. Review Queue

The Review Queue is the most important Admin screen.

URL:

```text
/admin/review
```

Purpose:

> convert machine-detected admission candidates into trusted domain truth as quickly and safely as possible.

---

# 9. Review Queue Default Ordering

Recommended priority score considers:

```text
risk class
deadline proximity
conflict
subscriber count
source authority
event importance
age of candidate
```

Example conceptual order:

```text
R3 eligibility conflict
↓
R2 deadline change
↓
R2 new application dates
↓
R2 Open House date
↓
R1 supporting change
```

---

# 10. Review Queue Filters

Keep filters limited:

```text
Risk
School
Change Type
Status
Source Health
```

Quick presets:

```text
Critical
Conflicts
New Announcements
Deadline Changes
Eligibility
Low Risk
```

---

# 11. Review Queue Row

Each row should show enough information to prioritize without opening it.

Example:

```text
[CRITICAL]

경복초등학교 · 2027

APPLICATION DEADLINE CHANGED

Previous
2026.11.10

Candidate
2026.11.12

Source
Official correction notice

Detected
18 minutes ago

Subscribers
327

[Review]
```

---

# 12. Review Detail Layout

Reviewer should see:

```text
School / Academic Year
Risk
Change Type
Detected Time

────────────────────

Previous Verified Value

2026.11.10

             ↓

Candidate Value

2026.11.12

────────────────────

Source Evidence

Official Source
Authority: S1

Relevant excerpt

PDF page 3

[Open Official Source]

────────────────────

Conflict Check

No unresolved conflict

────────────────────

Impact

327 verified subscriptions
Deadline in 9 days

────────────────────

Actions

[Approve]
[Edit & Approve]
[Reject]
[Duplicate]
[Ignore]
```

No important verification context should require navigating away.

---

# 13. Side-by-Side Diff

For changed Events/Facts, use side-by-side comparison where possible.

Example:

| Field             | Previous   | Candidate      |
| ----------------- | ---------- | -------------- |
| Application Start | Nov 7      | Nov 7          |
| Application End   | **Nov 10** | **Nov 12**     |
| Source            | old PDF    | correction PDF |

Highlight only changed fields.

Do not show huge raw JSON unless the operator explicitly opens technical detail.

---

# 14. Evidence Viewer

For HTML:

show:

* changed excerpt;
* heading context;
* nearby text.

For PDF:

show:

* page;
* extracted relevant section;
* document link.

Raw technical source remains available but secondary.

---

# 15. Evidence Fidelity

The Admin should distinguish:

```text
Original Source Text
Normalized Candidate
```

Example:

```text
Original:
11.7.(토) ~ 11.12.(목)

Normalized:
2026-11-07 → 2026-11-12
```

This catches normalization errors quickly.

---

# 16. Review Action — Approve

`Approve` should:

1. verify candidate;
2. create new EventVersion/FactVersion;
3. supersede previous current version if required;
4. attach Evidence;
5. create/update MeaningfulChange;
6. commit trusted domain state;
7. determine downstream content/Alert tasks.

One click after review.

---

# 17. Review Action — Edit & Approve

Used when:

> extraction is mostly correct but normalization/classification needs correction.

The UI must preserve:

```text
machine candidate
+
operator-approved value
```

Example:

Machine:

```text
event_type = OTHER
```

Operator changes:

```text
event_type = OPEN_HOUSE
```

Then approves.

---

# 18. Review Action — Reject

Use when extracted candidate is wrong.

Examples:

* wrong date;
* wrong academic year;
* false event;
* incorrect interpretation.

Rejection should retain:

* candidate;
* evidence;
* reason.

This becomes future automation-quality data.

---

# 19. Review Action — Ignore

Use when Source changed but change is real and irrelevant.

Example:

> School cafeteria schedule updated.

This is not an extraction error.

It is an admission-irrelevant change.

---

# 20. Review Action — Duplicate

Use when candidate represents already-known semantic information.

Example:

Official page and PDF both announce same Application window.

Result:

```text
existing MeaningfulChange
+
additional Evidence
```

where appropriate.

Do not produce another public change.

---

# 21. Review Action — Escalate Conflict

When official Sources conflict and operator cannot resolve quickly:

```text
ESCALATED
```

The system should:

* preserve last verified truth where appropriate;
* mark candidate unresolved;
* prevent Alert;
* add to Critical queue.

---

# 22. Review Keyboard Efficiency

Because review is repetitive, support simple shortcuts eventually:

```text
A = Approve
E = Edit
R = Reject
I = Ignore
D = Duplicate
```

But MVP can begin with buttons.

Do not sacrifice safe confirmation for speed on CRITICAL changes.

---

# 23. Bulk Review

Avoid bulk-approving critical admission changes.

Bulk actions may be allowed only for:

```text
low-risk irrelevant changes
routine Source maintenance
```

Never:

```text
select 20 critical dates
→ approve all
```

---

# 24. School Admin

URL:

```text
/admin/schools/[id]
```

Recommended tabs:

```text
Overview
Admission Cycles
Timeline
Sources
Changes
Subscribers
```

---

# 25. School Overview

Display:

```text
School identity
Lifecycle status
Current public cycle
Public URL
School type
Region

Current Radar State

Source Health

Pending Reviews

Subscriber count

Last Meaningful Change
```

Primary actions:

```text
View Public Page
Add Source
Add Historical Data
Pause Monitoring
```

---

# 26. Admission Cycles Tab

Show:

```text
2027  PUBLIC FOCUS
2026  HISTORICAL
2025  HISTORICAL
```

For each:

* cycle status;
* admission mode;
* number of verified Events;
* unknown events;
* historical completeness.

---

# 27. Timeline Editor

Operators should be able to inspect one cycle chronologically.

Example:

```text
2027 Admission Timeline

Open House
Sep 17
VERIFIED

Application
Not Announced

Lottery
Not Announced

Registration
Not Announced
```

Manual edit of a verified critical Event must create a new version.

---

# 28. Manual Event Creation

For historical seeding or manual Sources:

```text
Add Event
↓
Event Type
Cycle
Dates
Registration Window
Source
Evidence
↓
Verify
```

No direct “save as official without source” path.

---

# 29. Fact Editor

For:

* eligibility;
* admission method;
* required documents;
* quota.

Same rule:

```text
verified value
→ editing creates version
```

---

# 30. Sources Tab

Each School should show:

```text
Source
Role
Authority
Strategy
Last Success
Last Change
Health
Next Check
```

Example:

```text
Admissions Notice Board
PRIMARY_ADMISSIONS
S1
HTTP
Healthy
Checked 2h ago
```

---

# 31. Source Admin

URL:

```text
/admin/sources/[id]
```

Show:

```text
Canonical URL
Authority
Role
Collection Strategy
Monitoring Profile
School/Cycle bindings

Last attempted
Last successful
Last content change
Last meaningful change
Next scheduled run

Consecutive failures

Recent observations
```

---

# 32. Source Actions

Required:

```text
Run Now
Pause
Resume
Edit Monitoring Profile
Replace Source
Retire
```

Dangerous actions require confirmation.

---

# 33. Source “Run Now”

Useful during:

* manual verification;
* suspected announcement;
* recovery after Source fix.

Run Now must enqueue normal collection pipeline.

It must not use a special shortcut that bypasses snapshots/review.

---

# 34. Source Replacement Workflow

Example:

```text
old admissions URL
→ new admissions portal
```

Operator:

1. add new Source;
2. bind to School;
3. test fetch;
4. activate;
5. retire old Source.

Historical evidence remains attached to old Source.

---

# 35. Stale Source Queue

Dedicated quick view:

```text
/admin/sources?status=stale
```

Prioritize by:

```text
Source criticality
Current season
School subscriber count
Hours stale
```

---

# 36. Source Error Detail

Show:

```text
Last 5 attempts
HTTP status
Normalized error
Final URL
Response latency
Last successful snapshot
```

Actions:

```text
Retry
Open Source
Change Strategy
Pause
Replace
```

Do not expose unnecessary low-level stack traces on default screen.

---

# 37. 403 Handling

If Source begins returning 403:

Admin should see:

```text
ACCESS_ERROR
Last successful: 8h ago
Previously: HTTP strategy
```

Possible actions:

* inspect official site manually;
* change Source;
* move to Browser strategy if appropriate;
* Manual monitoring.

Do not automatically implement bypass behavior.

---

# 38. Updates Admin

URL:

```text
/admin/updates
```

Statuses:

```text
DRAFT
REVIEW
PUBLISHED
ARCHIVED
```

Primary queue:

```text
Update drafts generated from verified MeaningfulChanges
```

---

# 39. Update Draft Screen

Show structured source facts above editable copy.

Example:

```text
Verified Data

School: 경복초
Academic Year: 2027
Change: BRIEFING ANNOUNCED
Date: Sep 17
Registration: Aug 20

────────────────

Draft Title

...

Draft Body

...
```

Critical dates should not be manually retyped where possible.

Use tokens/components sourced from verified data.

---

# 40. Update Publication

Operator can:

```text
Preview
Publish
Discard Draft
```

Publishing triggers:

* public Update page;
* sitemap/SEO revalidation;
* internal links.

It does not automatically send Alert unless Alert policy/release process says so.

---

# 41. Alert Admin

URL:

```text
/admin/alerts
```

Default sections:

```text
Needs Preview
Ready
Sending
Completed
Failed
Cancelled
```

---

# 42. Alert Draft Screen

Show:

```text
Alert Type
School
Academic Year
Meaningful Change
Eligible Subscribers
Landing Page
Subject
Rendered Email Preview
```

Example:

```text
DEADLINE_CHANGED

경복초 2027

327 eligible subscriptions

Previous:
Nov 10

New:
Nov 12

Landing:
updates/...
```

---

# 43. Alert Release Flow

Recommended MVP A1:

```text
Verified MeaningfulChange
↓
Alert Draft auto-created
↓
Operator preview
↓
[Release Alert]
↓
Deliveries created
↓
Worker sends
```

The operator should not manually select recipient emails.

Audience selection is deterministic.

---

# 44. Alert Release Confirmation

For large/high-risk sends:

```text
Release alert to 327 verified subscribers?
```

Show:

* change summary;
* subscriber count;
* Alert type.

One confirmation.

---

# 45. Test Email

Every Alert draft should allow:

```text
Send Test
```

to operator-configured test address.

Test sends must not create real subscriber Delivery records.

---

# 46. Alert Failure View

Show:

```text
Total eligible
Sent
Delivered
Failed
Bounced
Suppressed
Clicked
```

Failed deliveries can be retried by normalized failure category.

---

# 47. Subscribers Admin

Subscriber management is operational, not CRM.

Show aggregate first:

```text
Verified Subscribers
Active Subscriptions
Bounced
Suppressed
```

Search by exact email only when support requires it.

---

# 48. Subscriber Detail

Show minimal:

```text
masked email
status
verified date

Subscriptions:
경복초 2027
SIS 2027

Delivery history
```

Do not build marketing profiles.

---

# 49. Subscriber Actions

Allowed:

```text
Suppress
Unsuppress where appropriate
Inspect Subscriptions
```

Do not manually “subscribe” someone without a verified consent flow except explicit support correction with audit trail.

---

# 50. Guide Admin

Guides are intentionally lightweight.

Required:

```text
Create
Edit
Preview
Publish
Archive
```

Also show:

```text
Last reviewed
Related category
Related Schools
```

No need for an elaborate CMS.

---

# 51. Guide Review Queue

Optional future queue:

```text
Guide not reviewed in X months
```

Priority higher for:

* eligibility;
* application rules;
* policy-sensitive content.

---

# 52. System Admin

URL:

```text
/admin/system
```

Should contain:

```text
Job Health
Outbox Queue
Recent Job Failures
Email Provider Health
Collection Worker Health
Database/Migration Version
```

This is a diagnostic screen.

Not the default operator homepage.

---

# 53. Background Job Health

Show counts:

```text
Pending
Running
Failed
Dead-letter/manual attention
```

By job class:

```text
Collection
Extraction
Publication
Alert
Email delivery
```

---

# 54. Failed Job Retry

Operators should be able to retry safe idempotent jobs.

Examples:

```text
Source Fetch
Extraction
Alert Delivery
```

The UI should explain whether retry is safe.

Critical domain mutations must remain protected by idempotency/DB constraints.

---

# 55. Outbox Monitoring

If using `outbox_events`, show:

```text
Unprocessed
Failed
Oldest pending age
```

Operator action:

```text
Retry
Inspect
```

Avoid manually editing payloads in production.

---

# 56. Audit Log

Important actions must be auditable.

Examples:

```text
critical Event approved
verified Fact edited/versioned
Source retired
Alert released
Alert cancelled
Subscriber suppressed
```

Admin should expose activity history contextually.

No need for operators to browse raw global logs routinely.

---

# 57. Daily Operating Routine

The system should support an approximately simple routine.

## Start of Day

Open Dashboard.

Handle:

```text
Critical Reviews
Stale Sources
Collector Errors
```

## During Day

Process new Review Queue items as they arrive.

## Before Alert Release

Preview significant Alerts.

## End of Day

Confirm:

```text
no unresolved critical review
no critical stale Source beyond threshold
no failed high-priority Alert
```

This should take minutes on normal days, not hours.

---

# 58. Peak Season Routine

During Sep–Nov private elementary season:

priority:

```text
Critical Change
↓
Deadline / Application
↓
New Announcement
↓
Source Failure
↓
Update Publishing
↓
Routine enrichment
```

Historical enrichment work should yield to current admissions operations.

---

# 59. Low Season Routine

During lower-demand period:

focus shifts to:

```text
Historical data enrichment
Source cleanup
Guide refresh
2028 cycle preparation
Monitoring automation improvements
```

---

# 60. Operator SLA

Initial internal target:

### Critical Review

Same operating session/day where practical.

### Critical Source Stale

Investigate within same operating day during peak season.

### Low-Risk Change

Can wait.

The system must not require 24/7 manual staffing.

---

# 61. Workload Objective

For ~50 Schools, desired normal-state behavior:

```text
most Source checks → no human attention
most irrelevant diffs → filtered automatically
only semantic admission candidates → queue
only critical ambiguity → careful review
```

If the operator must inspect dozens of unchanged pages daily, architecture has failed.

---

# 62. Human Minutes per School

Core operations metric:

```text
Human Minutes per Monitored School per Month
```

Also measure:

```text
Human Minutes per Verified Meaningful Change
```

The goal should trend downward over time.

---

# 63. Review Precision Feedback

Every Review outcome becomes automation-quality feedback.

Track by:

```text
Source
Extractor version
Event type
Field type
```

Metrics:

```text
Approved unchanged candidate %
Edit-and-approve %
Rejected %
Ignored %
Duplicate %
```

This identifies automation opportunities.

---

# 64. Auto-Approval Candidate Identification

A Source/field combination may become a future auto-approval candidate if:

```text
high review precision
stable Source structure
low conflict rate
no severe incidents
```

Admin analytics should make such opportunities visible later.

Do not auto-enable automatically.

---

# 65. Auto-Approval Controls

Future Admin should support:

```text
Global kill switch
Source-level disable
Field-level disable
Extractor-version disable
```

Any SEV-1 incident should allow immediate shutdown of automated critical publishing.

---

# 66. Incident Management

Admin should support simple data incidents.

Examples:

```text
Incorrect deadline published
Incorrect Alert sent
Source stale during application opening
```

Record:

```text
severity
affected School
affected Fact/Event
detected time
resolved time
root cause
corrective action
```

MVP may store this in audit/internal notes rather than a dedicated incident system.

---

# 67. SEV-1 Response

If incorrect critical information is public:

```text
1. Correct structured domain truth
2. Publish new verified version
3. Update affected pages
4. Determine affected Alerts
5. Send CORRECTION if necessary
6. Disable faulty automation path if applicable
7. Record root cause
```

Accuracy recovery has priority over SEO/content polish.

---

# 68. Staleness Incident

If a critical Source is stale beyond policy threshold:

Public:

```text
last verified information remains
+
strong "not announced" wording may be weakened
```

Admin:

```text
P0/P1 source recovery task
```

Do not remove existing admission data.

---

# 69. Data Coverage Dashboard

Admin should eventually show per School:

```text
Current Source ✓
2027 Cycle ✓
2026 History ✓
2025 History ✓
Expected Window ✓/—
Alert Enabled ✓
```

This is useful for launch readiness.

---

# 70. Launch Readiness View

Before launch, create a temporary operational checklist.

Per School:

```text
Canonical identity
Current cycle
Official Source
Monitoring active
Historical data
Public page index-ready
Alert CTA
```

Target:

```text
50 / 50 required baseline coverage
```

Schools that do not meet baseline should not masquerade as fully covered.

---

# 71. School Coverage State

Internal:

```text
READY
PARTIAL
BLOCKED
PAUSED
```

This is operational readiness, separate from School lifecycle.

---

# 72. Admin Search

Global Admin search should find:

```text
School
Source URL
Update
Subscriber exact email
Meaningful Change ID
```

This reduces navigation friction.

---

# 73. Command Palette — P1

Future useful feature:

```text
Ctrl/Cmd + K
```

Actions:

```text
Find School
Open Review Queue
Run Source
Create Historical Event
Open Alert Draft
```

Not required for MVP.

---

# 74. Mobile Admin

Admin is primarily desktop-oriented.

Mobile should support emergency operations:

```text
view critical queue
inspect evidence
approve/reject
pause Source
cancel Alert
```

Do not spend significant MVP effort creating a full mobile Admin experience.

---

# 75. Permissions

Initial single-operator setup can remain simple.

Roles:

```text
ADMIN
```

Optional future:

```text
REVIEWER
EDITOR
```

Do not build enterprise RBAC for MVP.

---

# 76. Sensitive Actions

Require explicit confirmation for:

```text
Release Alert
Cancel active Alert
Archive School
Retire Source
Suppress Subscriber
```

Normal review approval should remain efficient.

---

# 77. Destructive Operations

Avoid destructive actions entirely where possible.

Use:

```text
Archive
Retire
Supersede
Cancel
```

rather than Delete.

---

# 78. Admin Notification Policy

The operator should not receive notifications for every normal event.

Potential operator alerts only for:

```text
critical Source stale
critical conflicting admission change
SEV-1 incident
email provider outage
background worker failure affecting monitoring
```

These may initially surface only on Dashboard.

---

# 79. External Operator Alerts — P1

Later:

```text
email/Slack/other operator notification
```

can be added for critical operational incidents.

Not required at MVP.

---

# 80. Admin Analytics Boundaries

Admin operations dashboard is not the place for deep business analytics.

Keep:

```text
review
source health
alerts
coverage
```

Primary.

Traffic/revenue metrics belong in a separate analytics surface or analytics tool.

---

# 81. P0 Admin Screens

Required for MVP:

```text
/admin
/admin/review
/admin/schools
/admin/schools/[id]
/admin/sources
/admin/sources/[id]
/admin/updates
/admin/alerts
/admin/subscribers
/admin/system
```

Guide management may share a lightweight editor.

---

# 82. P1 Admin Features

Later:

```text
keyboard shortcuts
command palette
advanced automation precision dashboard
incident dashboard
bulk low-risk operations
Guide stale review
auto-approval controls
```

---

# 83. Explicitly Not Needed

Do not build:

* CRM;
* advertiser manager;
* user segmentation platform;
* marketing automation builder;
* drag-and-drop email builder;
* complicated workflow designer;
* school relationship CRM;
* customer support ticketing;
* enterprise permissions.

They do not serve MVP operations.

---

# 84. Admin Page Performance

Review Queue and Dashboard must be fast.

Operator-facing target:

* no expensive full-domain queries per page load;
* paginate historical observations;
* fetch large source snapshots only when opened;
* use indexed review/status queries.

---

# 85. Review Queue Query Shape

Primary DB query should filter:

```text
meaningful/detected candidate status
+
risk/significance
+
created time
```

Avoid joining massive snapshot text unless Review Detail opens.

---

# 86. Admin Public Preview

School and Update editors should support:

```text
Preview Public Page
```

using current draft/verified data.

No need for a separate visual page builder.

---

# 87. One-Click Public Navigation

From Admin School:

```text
View Public School Page
```

From Update:

```text
View Public Update
```

From Alert:

```text
View Landing Page
```

This greatly reduces verification friction.

---

# 88. Workflow — New Announcement

Ideal operator flow:

```text
Dashboard:
"New critical announcement"
↓
Review
↓
See extracted dates + Source
↓
Approve
↓
Update Draft generated
↓
Preview/Publish
↓
Alert Draft generated
↓
Preview/Release
```

No DB or code work.

---

# 89. Workflow — Deadline Change

```text
Dashboard:
CRITICAL deadline change
↓
Review side-by-side
↓
Approve
↓
Public timeline immediately updated
↓
Change Update prepared
↓
Alert Draft
↓
Release
```

Target:

> a few deliberate clicks.

---

# 90. Workflow — Irrelevant Diff

```text
Source changes
↓
machine relevance filter
↓
IRRELEVANT
```

Ideally operator never sees it.

If it reaches Review:

```text
[Ignore]
```

one click.

---

# 91. Workflow — Source Failure

```text
Dashboard:
Critical Source stale
↓
Source Detail
↓
Inspect failure
↓
Run Now / Change Strategy / Replace / Manual
↓
successful observation
↓
health restored
```

Admission truth remains intact during recovery.

---

# 92. Workflow — Historical Seeding

```text
School
↓
Historical Cycle
↓
Add Event
↓
Official Source
↓
Dates
↓
Verify
```

No live DetectedChange required.

---

# 93. Workflow — Incorrect Published Value

```text
School Timeline
↓
Create Correction Version
↓
Attach Evidence
↓
Verify
↓
Public current value replaced
↓
Correction MeaningfulChange
↓
Assess Alert impact
↓
CORRECTION Alert if required
```

Never edit old verified version in place.

---

# 94. Operational Definition of Done

AdmissionRadar Admin MVP is complete when one non-developer operator can:

```text
identify today's priority work
↓
review detected admission changes
↓
verify/edit/reject them
↓
recover broken Sources
↓
publish Update content
↓
preview and release Alerts
↓
inspect delivery failures
↓
maintain School historical data
```

without:

```text
SQL
SSH
code changes
manual email lists
manual page editing
```

---

# 95. Efficiency Definition of Done

For normal healthy Sources:

```text
unchanged checks
```

must consume:

```text
0 human minutes
```

For irrelevant changes:

target:

```text
near-zero human minutes
```

For a straightforward verified admission change:

operator flow should be:

```text
review evidence
+
1 approval
+
optional content/Alert previews
```

---

# 96. Safety Definition of Done

The Admin must make it difficult to accidentally:

* publish unverified R2/R3 values;
* overwrite verified history;
* send duplicate Alerts;
* send to unsubscribed users;
* treat Source errors as not-announced;
* lose official evidence;
* release an Alert before domain truth is committed.

---

# 97. Operational Metrics

Primary:

```text
Critical Review Queue Age
Critical Source Stale Count
Human Minutes / Meaningful Change
Human Minutes / School / Month
False Positive Review Rate
Correction Rate
Alert Delivery Failure Rate
```

Secondary:

```text
Review volume
Source failure rate
Update drafts
Alert drafts
```

---

# 98. The Desired End State

The operator experience should eventually look like:

```text
Open AdmissionRadar Admin

3 things need attention.

Review 2 meaningful changes.
Fix 1 stale Source.

Everything else is running.
```

Not:

```text
Open 50 school websites.
Open 100 Source pages.
Compare timestamps manually.
Update WordPress-like pages manually.
Export an email list.
Send emails manually.
```

Automation exists to remove the latter.

---

# 99. Final Operations Principle

AdmissionRadar does not need a powerful Admin because it has many employees.

It needs a focused Admin precisely because it should **not need many employees**.

The operating system should convert:

```text
hundreds of automated observations
```

into:

```text
a handful of human decisions
```

and convert those decisions automatically into:

```text
trusted data
+
public pages
+
Alerts
```

That is the operational design of AdmissionRadar.
