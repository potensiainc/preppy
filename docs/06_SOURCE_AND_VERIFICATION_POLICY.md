# AdmissionRadar — Source & Verification Policy v0.1

**Recommended file:** `docs/06_SOURCE_AND_VERIFICATION_POLICY.md`
**Status:** Trust Policy / Publication Gate
**Version:** 0.1
**Reference date:** 2026-08-14
**Parent documents:**

* `00_PROJECT_CONTEXT.md`
* `01_PRD.md`
* `02_INFORMATION_ARCHITECTURE.md`
* `03_DOMAIN_MODEL.md`
* `04_DATA_MODEL.md`
* `05_COLLECTION_ARCHITECTURE.md`

---

# 0. Purpose

This document defines:

> **when AdmissionRadar is allowed to treat collected information as trusted admission information.**

Collection success does not equal verification.

Extraction success does not equal verification.

High model confidence does not equal verification.

The public site must display only information that passes this policy.

---

# 1. Core Trust Principle

For consequential admission information:

> **Source authority + evidence + consistency + verification matter more than extraction confidence.**

The most dangerous AdmissionRadar failure is not:

> missing an announcement by several hours.

It is:

> confidently publishing the wrong admission date.

---

# 2. Verification Objectives

Every important public value should answer:

```text
Who published it?
Where was it published?
Which admission cycle does it belong to?
What exactly did the source say?
When did AdmissionRadar observe it?
Was it independently reviewed where required?
```

---

# 3. Source Classes

AdmissionRadar uses four operational source classes.

## S1 — Direct Authoritative

The source directly establishes the admission fact.

Examples:

* official admissions notice;
* official 모집요강;
* official admissions PDF;
* official application portal;
* official correction notice;
* official education authority admissions notice where applicable.

This is the preferred evidence class.

---

# 4. S2 — Official Supporting

School-controlled official source that supports the information but may not be the formal definitive notice.

Examples:

* school homepage notice;
* school news page;
* school-controlled official social post;
* general admissions overview.

Useful for:

* discovery;
* corroboration;
* low-risk information.

Critical conflicting information requires deeper review.

---

# 5. S3 — Trusted External Reference

Non-school source with legitimate informational value.

Examples may include:

* authoritative public directories;
* reputable education organizations;
* credible third-party reporting.

S3 can help:

* discover official Sources;
* reconstruct historical context.

S3 should normally not be the sole basis for current critical dates.

---

# 6. S4 — Discovery Only

Examples:

* parent community post;
* personal blog;
* search result snippet;
* reposted screenshot;
* forum;
* unverified social account.

S4 may point AdmissionRadar toward an official Source.

It is not trusted current admission evidence by itself.

---

# 7. Authority Is Claim-Specific

A Source can be authoritative for one claim and not another.

Example:

A government admissions portal may be authoritative for:

```text
application period
lottery schedule
```

while the School's own page may be authoritative for:

```text
school-specific briefing
venue
```

Do not build one simplistic global:

```text
Source A always beats Source B
```

rule.

---

# 8. Evidence Requirements

A verified critical Event/Fact should contain:

```text
source URL
source authority
observation
snapshot/document version
relevant excerpt or locator
normalized value
verification record
```

For a PDF:

```text
page number
```

should be preserved where possible.

For HTML:

```text
section/header/text locator
```

should be retained where practical.

---

# 9. Risk Classification

Public admission data is divided into risk classes.

## R0 — Non-Consequential Metadata

Examples:

* short school description;
* region label;
* generic category;
* cosmetic title wording.

Wrong information is undesirable but unlikely to cause missed admission action.

---

# 10. R1 — Operational Supporting Information

Examples:

* venue;
* public contact link;
* general event description;
* official source URL;
* non-critical explanatory text.

May affect convenience but normally not admission eligibility/deadline.

---

# 11. R2 — Action-Critical

Examples:

* briefing registration opening;
* briefing registration closing;
* Open House date;
* application start;
* application deadline;
* assessment date;
* interview date;
* lottery date;
* result date;
* enrollment/registration deadline;
* additional recruitment dates;
* cancellation;
* deadline extension.

Wrong information may cause a parent to miss an opportunity.

---

# 12. R3 — Eligibility / Requirement Critical

Examples:

* applicant eligibility;
* nationality/residency requirement;
* grade eligibility;
* age cutoff;
* required admission documents;
* application method where it changes eligibility/action;
* rolling vs fixed application availability.

These require particularly careful interpretation because the underlying rules may be nuanced.

---

# 13. MVP Human Approval Rule

During MVP:

> **Every new or changed R2/R3 value requires human approval before publication.**

No exception based solely on:

* model confidence;
* source parser confidence;
* exact date regex;
* repeated historical pattern.

This includes information extracted from S1 Sources.

---

# 14. R0/R1 Auto-Publication

MVP may permit selective automated publication of R0/R1 values only if:

```text
source is S1 or S2
AND
no conflicting trusted evidence exists
AND
deterministic validation passes
AND
change does not alter admission action
```

If implementation simplicity matters more than saving a few review minutes, human approval for all changed public fields is also acceptable during initial launch.

---

# 15. AI Confidence Policy

Model confidence is a queue signal.

It is not a publication credential.

Prohibited logic:

```text
if confidence >= 0.95:
    publish()
```

Allowed logic:

```text
if confidence is low:
    raise review priority
```

or:

```text
high-confidence R0 candidate
→ eligible for low-risk automated workflow
```

subject to policy.

---

# 16. Verification Status

Use:

```text
DRAFT
UNVERIFIED
VERIFIED
REJECTED
SUPERSEDED
```

Only:

```text
VERIFIED
```

can appear as official public truth.

---

# 17. Verification Result Is Version-Specific

Verification attaches to:

```text
EventVersion
FactVersion
```

not merely:

```text
Event
Fact
```

Example:

```text
Deadline v1 = VERIFIED

new candidate v2 = UNVERIFIED
```

Until v2 is verified, public truth remains v1.

---

# 18. New Announcement Verification

For a new R2 event:

Reviewer must verify at least:

```text
correct School
correct academic year
correct event type
correct date/window
source authority
source context
```

Then approve the new version.

---

# 19. Date Change Verification

For a changed critical date, reviewer must inspect:

```text
Previous verified value
Candidate value
Current Source evidence
Reason/change context
```

If source explicitly states:

```text
변경
수정
연장
정정
```

record that context in the MeaningfulChange.

---

# 20. Cancellation Verification

Do not infer cancellation merely because an Event disappears from a webpage.

Cancellation should require:

* explicit authoritative cancellation;
* authoritative replacement that clearly invalidates prior event;
* or human verification with strong contextual evidence.

Page deletion alone is insufficient.

---

# 21. Deadline Extension Verification

Distinguish:

```text
deadline extension
```

from:

```text
new additional recruitment
```

Extension:

> same application process, close date moved later.

Additional recruitment:

> primary window completed, new intake later opened.

Reviewer must select the correct domain interpretation.

---

# 22. Not Announced Policy

AdmissionRadar may publicly say:

> **아직 공식 일정이 발표되지 않았습니다.**

only when there is reasonable evidence supporting that statement.

Minimum condition:

```text
at least one designated authoritative current source
was successfully checked recently
AND
target cycle/event was not present
AND
no conflicting known official evidence exists
```

---

# 23. `NOT_ANNOUNCED` Is Not `NOT_FOUND`

If AdmissionRadar does not know where a School publishes an event:

Public state should not confidently say:

> 미발표.

Instead use wording such as:

> 공식 일정 확인 중

or omit that specific event state.

---

# 24. Source Failure Policy

If latest collection attempt fails:

```text
403
timeout
parser error
```

do not change public truth to:

```text
NOT_ANNOUNCED
```

Existing verified information remains.

Monitoring health changes independently.

---

# 25. Freshness Requirement for “Not Announced”

Suggested initial policy during active admission season:

For a critical designated Source, last successful check should normally be within:

```text
12 hours
```

before presenting a strong “currently not announced” claim.

For less time-sensitive states:

```text
24 hours
```

may be acceptable.

These thresholds are configurable.

---

# 26. Stale Public State

If the authoritative Source has not been successfully checked within policy threshold:

Instead of:

> 아직 미발표

prefer:

> 공식 페이지를 다시 확인 중입니다.

Historical information may remain visible.

---

# 27. Expected Window Policy

Expected timing is allowed when based on historical verified data.

Requirements:

```text
minimum useful historical basis
methodology recorded
clearly labeled estimate
no current official conflicting date
```

Preferred initial minimum:

```text
2 prior comparable cycles
```

One historical cycle may be shown as:

> 지난해에는…

but is weak evidence for producing a generalized expected window.

---

# 28. Estimate Precision Policy

Prefer:

```text
10월 중순
9월 하순
10월 말~11월 초
```

Avoid:

```text
2026년 10월 19일 예상
```

unless there is a genuine deterministic official rule.

AdmissionRadar should not manufacture precision.

---

# 29. Estimate Presentation

Every estimate must state:

```text
공식 일정이 아닙니다.
```

and indicate basis.

Example:

> 최근 3개 학년도 공고 시기를 기준으로 10월 중순~하순으로 예상됩니다. 공식 일정이 아닙니다.

---

# 30. Official Overrides Estimated

When verified official information is published:

```text
Official
>
Estimated
```

ExpectedWindow may remain internally for analytics/history but should no longer be the primary public timing.

---

# 31. Historical Data Verification

Historical information can be marked VERIFIED if supported by:

* archived official page;
* official PDF;
* official portal record;
* stored authoritative source snapshot.

If only third-party evidence exists:

do not silently label it as official historical truth.

Use appropriate internal confidence or leave it out.

---

# 32. Historical Missing Data

Never fill historical gaps by inference.

Example:

Known:

```text
2026 application Nov 7–12
2025 application unknown
2024 application Nov 8–13
```

Do not synthesize a 2025 date.

Display missing history honestly.

---

# 33. Source Conflict Policy

A conflict exists when two trusted Sources support materially different values for the same claim.

Example:

```text
Official page:
Deadline Nov 10

Official PDF:
Deadline Nov 12
```

Critical conflicts require human review.

No auto-publication.

---

# 34. Conflict Resolution Principles

Consider:

1. whether one Source explicitly corrects another;
2. publication/version timestamps;
3. claim scope;
4. authority for that specific claim;
5. document version;
6. whether one Source is stale;
7. context surrounding the value.

Do not use “latest timestamp wins” blindly.

---

# 35. Explicit Correction Precedence

An explicit official:

```text
정정 공고
수정 공고
변경 안내
```

normally supersedes the earlier corresponding announcement.

Preserve both versions.

---

# 36. Same-Day Conflicts

If the correct value cannot be confidently determined:

publicly retain the last verified value if still defensible, or mark the item:

> 확인 중

depending on impact.

Do not guess.

---

# 37. Multiple Supporting Sources

If several trusted Sources support the same Fact:

store multiple evidence links.

This improves resilience if one page disappears later.

---

# 38. Source Disappearance

An official source becoming unavailable does not make previously verified facts false.

Preserve:

```text
verified version
snapshot
evidence record
```

Monitoring Source can be marked stale/retired separately.

---

# 39. Source Replacement

If a School moves admissions to a new portal:

```text
old Source → RETIRED
new Source → ACTIVE
```

Historical evidence remains attached to the old Source.

---

# 40. Duplicate Announcement Policy

If the same announcement appears:

* on homepage;
* in notice board;
* as PDF;

this is generally:

```text
one semantic change
multiple evidence sources
```

not three public Updates and not three Alerts.

---

# 41. Update Article Verification

Generated Update content must use:

```text
verified structured fields
```

for:

* dates;
* deadlines;
* eligibility;
* action links.

AI-generated prose may explain verified data.

AI must not independently regenerate or reinterpret critical values.

---

# 42. Update Article Review

During MVP, an Update containing R2/R3 information should be reviewable before publication, even if underlying structured values are already verified.

The goal is to prevent the prose layer from creating a contradiction.

---

# 43. Alert Verification Gate

No Alert may be generated from:

```text
DetectedChange
```

alone.

Required chain:

```text
DetectedChange
↓
MeaningfulChange
↓
APPROVED/PUBLISHED
↓
Notifiable classification
↓
Alert
```

---

# 44. Alert-Relevant Changes

Default alert candidates:

```text
NEW_ANNOUNCEMENT
REGISTRATION_OPEN
DATE_CHANGED
DEADLINE_CHANGED
EVENT_CANCELLED
ADDITIONAL_RECRUITMENT
IMPORTANT_ELIGIBILITY_CHANGE
```

Not every verified change deserves an email.

---

# 45. No Duplicate Alert Policy

Before Alert creation confirm:

```text
same logical change has not already produced an Alert
```

Multiple evidence sources must not produce multiple emails.

Database dedupe remains the final safety control.

---

# 46. R2/R3 Human Review Checklist

Reviewer should confirm:

* [ ] School is correct.
* [ ] Academic year is correct.
* [ ] Event/Fact type is correct.
* [ ] Source is official enough for the claim.
* [ ] Extracted original wording matches source.
* [ ] Normalized date/value is accurate.
* [ ] Date range direction is valid.
* [ ] No unresolved trusted-source conflict exists.
* [ ] Existing record is correctly matched.
* [ ] Change type is correct.
* [ ] Public summary does not overstate certainty.
* [ ] Alert classification is appropriate.

---

# 47. Eligibility Verification

Eligibility is especially sensitive.

Do not reduce complex official eligibility language into an overly strong binary conclusion.

Prefer:

> 학교가 공개한 지원 자격은 다음과 같습니다…

rather than:

> 귀하는 지원 가능합니다.

AdmissionRadar is not making individual legal/admission eligibility decisions.

---

# 48. Eligibility Structuring

Where safe, extract structured components:

```text
grade
age
nationality-related condition
residency-related condition
document requirement
```

Also preserve:

```text
official wording
source link
```

If simplification could alter meaning, show a summary plus official source.

---

# 49. Required Documents

Document lists may change and may include context-dependent requirements.

For critical document requirements:

* preserve official list wording;
* distinguish required vs optional;
* distinguish applicant-specific conditions;
* require R3 human review.

---

# 50. Rolling Admission Verification

To display:

> Rolling Admission

AdmissionRadar should have official evidence that the School uses rolling/open application behavior.

Do not infer rolling admission merely because no deadline was found.

---

# 51. No Deadline vs Unknown Deadline

These are different.

## No fixed deadline

Official source indicates rolling availability.

## Unknown deadline

AdmissionRadar has not found/verified closing information.

The UI must not conflate them.

---

# 52. Application Open State

To derive:

```text
REGISTRATION_OPEN
```

there must be a verified application/registration window or verified rolling-open status.

Historical dates cannot create a current open state.

---

# 53. Deadline Soon

`DEADLINE_SOON` is derived from a verified deadline.

Default initial threshold:

```text
7 days
```

Estimate-only dates must not trigger a deadline warning.

---

# 54. Event Completed

Time passing can derive:

```text
COMPLETED
```

from a verified event date.

But time passing must not change:

```text
verification truth
```

or erase the Event.

---

# 55. Public Source Label

Where useful, public pages can show:

```text
공식 출처
마지막 확인
```

Do not expose internal:

* confidence score;
* crawler method;
* prompt output.

Trust is created by evidence, not AI jargon.

---

# 56. `Last Checked` Semantics

“마지막 확인” should refer to:

> latest successful relevant Source observation

not simply:

> latest crawler attempt

If latest attempt failed, public wording may need to distinguish the situation.

---

# 57. Corrections Policy

If AdmissionRadar published incorrect information:

1. correct the structured Fact/Event via new version;
2. preserve previous version;
3. create MeaningfulChange or correction record;
4. update affected public pages;
5. determine whether subscribers require correction notice.

Do not silently overwrite consequential mistakes.

---

# 58. Correction Alerts

If users previously received incorrect critical information, send a correction alert where appropriate.

Example:

> 앞서 안내한 원서접수 마감일을 정정합니다.

This should be a distinct high-priority alert.

A future alert type can include:

```text
CORRECTION
```

Recommended addition to `04_DATA_MODEL.md`.

---

# 59. Error Severity

Suggested internal data incident levels:

## SEV-1

Incorrect critical date/eligibility publicly displayed and materially actionable.

## SEV-2

Incorrect non-critical admission detail publicly displayed.

## SEV-3

Stale/missing information without false statement.

Critical incidents should lead to a root-cause review before expanding automation.

---

# 60. Automation Maturity Levels

## V0 — Manual Trust

All public admission changes human-approved.

## V1 — Assisted Verification

Machine extracts and validates; R2/R3 human-approved.

Recommended MVP.

## V2 — Low-Risk Auto-Publish

Selected R0/R1 changes auto-publish.

## V3 — Trusted-Source Selective Critical Automation

Only specific source/field combinations may auto-publish after proven operational quality.

---

# 61. Auto-Approval Must Be Source × Field Specific

Future authorization should look like:

```text
Source X
+
APPLICATION_START
+
deterministic parser Y
```

not:

```text
all data from School X
```

or:

```text
all high-confidence model output
```

This sharply reduces blast radius.

---

# 62. Suggested Gate for Critical Auto-Approval

Do not implement in MVP.

Before any R2 automatic publication is considered, require evidence such as:

```text
large reviewed sample for same extraction path
very high precision
no unresolved severe errors over a sustained period
stable source structure
deterministic cross-checks
clear rollback/correction path
```

A reasonable internal target could be:

```text
≥99.5% reviewed precision
+
zero SEV-1 errors in recent production history
```

but this is a governance threshold to validate later, not a guarantee created by the number itself.

---

# 63. Auto-Approval Revocation

Any severe error should allow immediate disabling of automation at:

```text
global
school
source
field type
extractor
```

levels.

Human review remains the fallback.

---

# 64. Source Trust Can Decrease

Previously reliable Sources can change:

* CMS redesign;
* PDF format change;
* portal migration;
* language/template change.

Trust authorization must be revocable.

Historical parser accuracy does not permanently authorize future content.

---

# 65. Parser Change Policy

A materially changed extraction model/parser should reset or reduce its automation trust.

Example:

```text
Parser v1 validated
Parser v2 deployed
```

Do not automatically inherit all V1 critical auto-publish privileges without validation.

---

# 66. LLM Model Change Policy

Similarly, changing:

* LLM model;
* extraction prompt;
* schema;
* normalization logic;

can alter behavior.

For critical automated paths, version the extraction configuration and reevaluate before trusting it.

---

# 67. Verification Auditability

For every approved critical change, AdmissionRadar should be able to reconstruct:

```text
source
snapshot
candidate
previous value
approved value
reviewer
verification time
public change
alert
```

This is a core operational asset.

---

# 68. Admin Review UX Requirement

Reviewer should not need to open five browser tabs to verify a candidate.

Review screen should provide:

```text
source link
source excerpt
PDF page if applicable
previous verified value
new candidate
risk level
conflicts
subscriber impact
```

Human-in-the-loop only works if review is fast.

---

# 69. Subscriber Impact Is Informational

Review screen may show:

```text
327 active subscribers
```

to communicate urgency.

It must not encourage lowering verification standards.

---

# 70. Publication Wording by Confidence

## Official

> 공식 일정이 발표되었습니다.

## Historical

> 2026학년도에는 다음 일정으로 진행됐습니다.

## Estimated

> 최근 일정 기준 예상 시기입니다. 공식 일정이 아닙니다.

## Unknown / Checking

> 공식 일정을 확인 중입니다.

These states must be visually distinguishable.

---

# 71. Prohibited Public Wording

Do not say:

> 확정 예정일

for an estimate.

Do not say:

> 아직 발표되지 않았다

when authoritative Sources could not be checked.

Do not say:

> 지원 가능

when only general eligibility information has been summarized.

Do not say:

> AI가 검증했습니다.

---

# 72. Search Snippet Integrity

SEO title/meta descriptions must not convert estimates into facts.

Bad:

> 경복초 2027 원서접수 11월 7일

when only historical/estimated.

Good:

> 경복초 2027 입학 일정 | 공식 발표 현황·지난 일정

---

# 73. Page Staleness Policy

A School page may remain indexed even when monitoring has a temporary problem.

Do not remove pages because a Source is stale.

Instead:

* retain last verified facts;
* update monitoring freshness presentation;
* prioritize source recovery.

---

# 74. Historical Evidence Retention

Historical evidence should remain stored even if:

* original Source disappears;
* School redesigns site;
* Source URL changes.

This is why AdmissionRadar stores Snapshots.

---

# 75. Third-Party Discovery Workflow

Example:

A parent blog states:

> School X briefing registration opens Aug 20.

AdmissionRadar may:

```text
discover claim
↓
search/check official source
↓
verify official evidence
↓
publish
```

It should not publish the blog claim itself as an official current date.

---

# 76. Search Engine Snippets

Search engine snippets may expose content no longer present on a current page.

Treat search snippets as:

```text
discovery evidence
```

not sufficient R2/R3 verification.

---

# 77. Screenshots

A screenshot may help a human investigate.

Unless provenance can be established reliably, a standalone screenshot is weak evidence.

Prefer the original official page/document.

---

# 78. Human Manual Entry

A human operator entering data does not remove evidence requirements.

Manual workflow:

```text
Enter candidate
Attach official Source
Verify
Publish
```

Never:

```text
remembered date
→ publish
```

---

# 79. Source Policy for Historical Seeding

Historical research priority:

```text
archived/direct official documents
↓
official School pages
↓
official authority records
↓
credible external historical reference
```

If reliable evidence cannot be found:

leave the historical field missing.

Incomplete trusted history is superior to complete invented history.

---

# 80. Review Queue SLA

Initial operational targets can be:

## Critical changes during peak season

Review as soon as operationally practical and prioritize within the same operating day.

## Normal changes

Lower priority.

AdmissionRadar does not need second-level real-time publishing.

Accuracy remains the constraint.

---

# 81. Trust KPI

Track:

```text
reviewed extraction precision
critical correction rate
false-positive rate
source conflict rate
stale-source rate
SEV-1 incident count
```

The most important automation metric is not:

> percentage auto-published.

It is:

> accuracy achieved per unit of human review effort.

---

# 82. Data Quality Gate Before Launch

Before public launch, every launch School should have:

```text
canonical identity
active source registry
current cycle
current state
at least one authoritative source path
historical data where available
monitoring owner/strategy
```

Schools with uncertain monitoring coverage should be clearly treated differently rather than pretending full coverage.

---

# 83. Coverage Label

Potential future public differentiation:

```text
자동 모니터링 중
정기 확인 중
```

However this is not required for MVP and should not expose unnecessary implementation mechanics.

More important:

> current information and last verified check.

---

# 84. Verification Definition of Done

A critical candidate is publishable when:

```text
source authority accepted
+
evidence captured
+
School resolved
+
academic year resolved
+
Event/Fact resolved
+
normalized value verified
+
conflicts resolved
+
human approval completed
```

Then and only then:

```text
VERIFIED
```

---

# 85. Final Trust Principle

AdmissionRadar's competitive advantage will eventually depend on speed.

But it will survive only if users trust its dates.

Therefore the hierarchy is:

```text
Correct
>
Explainable
>
Fresh
>
Fast
>
Fully automated
```

A system that publishes six hours later but is trustworthy can become useful.

A system that publishes instantly and gets one critical deadline wrong can destroy the entire brand.

AdmissionRadar should automate **observation, comparison, extraction, and preparation aggressively**.

It should automate **truth cautiously**.
