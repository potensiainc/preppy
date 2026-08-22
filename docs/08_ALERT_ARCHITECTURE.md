# AdmissionRadar — Alert Architecture v0.1

**Recommended file:** `docs/08_ALERT_ARCHITECTURE.md`
**Status:** Retention / Audience Architecture
**Version:** 0.1
**Reference date:** 2026-08-14
**Primary MVP Channel:** Email
**Parent documents:**

* `00_PROJECT_CONTEXT.md`
* `01_PRD.md`
* `02_INFORMATION_ARCHITECTURE.md`
* `03_DOMAIN_MODEL.md`
* `04_DATA_MODEL.md`
* `05_COLLECTION_ARCHITECTURE.md`
* `06_SOURCE_AND_VERIFICATION_POLICY.md`
* `07_SEO_ARCHITECTURE.md`

---

# 0. Purpose

This document defines how AdmissionRadar turns anonymous search visitors into a reusable parent audience.

Alert is not merely an email feature.

It is the retention layer of the business.

```text
Organic Visitor
↓
School uncertainty / future event
↓
Alert Subscription
↓
Verified admission change
↓
Relevant Email
↓
AdmissionRadar Return Visit
↓
Additional School Discovery
↓
More Subscriptions
```

The Alert system must prioritize:

1. relevance;
2. trust;
3. minimal friction;
4. exactly-once logical notification;
5. return traffic;
6. privacy;
7. operational simplicity.

---

# 1. MVP Alert Scope

MVP channel:

```text
EMAIL
```

MVP subscription target:

```text
School + Academic Year
```

Example:

```text
parent@example.com
→ 경복초등학교
→ 2027
```

Do not implement:

* Kakao;
* SMS;
* push;
* native-app notifications;
* parent accounts;
* complex preferences.

---

# 2. Subscription CTA

Primary CTA:

> **이 학교 입학 일정 무료로 받기**

For unannounced cycle:

> **2027 일정이 발표되면 알려주세요**

For active cycle:

> **이 학교 일정 변경 알림 받기**

The copy may vary by state.

Underlying subscription scope remains the same.

---

# 3. Best Conversion Moment

The highest-value Alert CTA occurs when:

```text
target cycle exists
+
official information is incomplete
+
parent has clear future uncertainty
```

Especially:

> 아직 공식 일정이 발표되지 않았습니다.

The system should use this moment rather than relying on generic newsletter popups.

---

# 4. Subscription UX

Preferred:

```text
[Alert CTA]
↓
Inline form or modal

Email
[무료 알림 신청]
```

No password.

No user account.

No child profile.

No onboarding wizard.

---

# 5. Subscription Context

The frontend sends:

```text
email
admission_cycle_id
source_page
```

Optional analytics context:

```text
cta_variant
landing_page_type
```

The backend derives:

```text
School
Academic Year
```

from `admission_cycle_id`.

Never trust a client-provided School name as domain identity.

---

# 6. Subscription Flow

```text
Email submitted
↓
Normalize email
↓
Find/Create Subscriber
↓
Find/Create Subscription
↓
Set PENDING
↓
Generate verification action token
↓
Send verification email
↓
User clicks
↓
Validate token
↓
Subscription VERIFIED
↓
Confirmation page
```

---

# 7. Double Verification Principle

A subscription becomes alert-eligible only after verification.

Benefits:

* validates address ownership;
* reduces typo subscriptions;
* improves deliverability;
* provides explicit consent record.

---

# 8. Subscription Idempotency

Repeated requests for the same:

```text
Subscriber + AdmissionCycle
```

must not create duplicate subscriptions.

Possible behavior:

### Existing PENDING

Resend verification if allowed.

### Existing VERIFIED

Return:

> 이미 이 학교의 알림을 받고 있습니다.

### Existing UNSUBSCRIBED

Explicit new subscription request may reactivate through verification.

### SUPPRESSED

Do not reactivate automatically.

---

# 9. Verification Token

Requirements:

* cryptographically random;
* raw token never stored;
* hash stored;
* single purpose;
* expiry;
* single use for verification.

Concept:

```text
raw_token
↓ hash
DB token_hash
```

---

# 10. Verification Expiry

Suggested:

```text
24 hours
```

or similarly reasonable configurable value.

Expired verification:

```text
request new verification email
```

rather than asking user to restart from scratch.

---

# 11. Verification Email

Purpose:

> verify subscription, not advertise.

Conceptual structure:

```text
경복초등학교 2027학년도 입학 알림을 신청하셨습니다.

[이메일 확인하고 알림 받기]

신청하지 않았다면 아무 작업도 하지 않아도 됩니다.
```

Keep it short.

---

# 12. Verification Success Page

URL:

```text
/subscribe/verify
```

Result:

```text
경복초등학교 2027 입학 알림이 등록되었습니다.
```

Then:

```text
[학교 입학정보 보기]
[2027 입학 캘린더 보기]
```

Optional:

```text
다른 관심 학교 찾기
```

This creates an immediate second-subscription opportunity without forcing it.

---

# 13. No Implicit Future-Year Consent

Subscription:

```text
경복초 / 2027
```

must not silently become:

```text
경복초 / 2028
```

Future cycle requires a new explicit subscription or later opt-in model.

---

# 14. Subscriber vs Subscription

One Subscriber:

```text
parent@example.com
```

may have:

```text
경복초 2027
대광초 2027
SIS 2027
```

These are separate Subscriptions.

Unsubscribing from one School does not necessarily suppress all email.

---

# 15. Unsubscribe Scope

Every admission alert email must support unsubscribing from that logical subscription.

Example:

> 경복초등학교 2027 알림 해제

Future:

> 모든 AdmissionRadar 이메일 수신 중단

may be added separately.

MVP should at minimum support per-subscription unsubscribe.

---

# 16. Unsubscribe UX

No login.

No password.

Click:

```text
unsubscribe action URL
```

→ confirmation.

Avoid dark patterns.

---

# 17. Alert Eligibility

A Subscription can receive an Alert only if:

```text
subscription.status = VERIFIED
AND
subscriber.status = ACTIVE
AND
not already delivered for logical alert
```

---

# 18. Alert Source Rule

Alerts may originate only from:

```text
Verified MeaningfulChange
```

Never directly from:

```text
SourceObservation
DetectedChange
LLM extraction
```

---

# 19. Alert Types

Initial:

```text
NEW_ANNOUNCEMENT
REGISTRATION_OPEN
DATE_CHANGED
DEADLINE_CHANGED
ADDITIONAL_RECRUITMENT
IMPORTANT_ELIGIBILITY_CHANGE
EVENT_CANCELLED
RESULT_PUBLISHED
CORRECTION
```

`CORRECTION` should be added to the Data Model alert taxonomy.

---

# 20. Notifiable Change Rule

Not every MeaningfulChange produces an Alert.

A change should be notifiable when it affects:

```text
parent action
important timing
admission opportunity
eligibility
cancellation
material correction
```

---

# 21. Examples — Notify

Send:

```text
2027 모집요강 발표
설명회 신청 오픈
원서접수 시작
원서접수 마감일 변경
추가모집
설명회 취소
중요 지원자격 변경
```

---

# 22. Examples — Do Not Notify

Normally do not send:

```text
school description updated
phone number formatting changed
venue punctuation change
same announcement mirrored on another source
SEO content edited
source HTML changed without admission impact
```

---

# 23. Alert Generation Pipeline

```text
MeaningfulChange PUBLISHED
↓
Alert Policy Evaluation
↓
Determine Alert Type
↓
Generate dedupe key
↓
Create Alert
↓
Resolve eligible Subscriptions
↓
Create AlertDeliveries
↓
Dispatch
↓
Track delivery status
```

---

# 24. Alert Dedupe

Each semantic change must generate at most one logical Alert per Alert type.

Example:

```text
change:{meaningful_change_id}:DEADLINE_CHANGED
```

DB constraint on:

```text
alerts.dedupe_key
```

is mandatory.

---

# 25. Delivery Dedupe

Each:

```text
Alert + Subscription + Channel
```

must have at most one logical delivery record.

Retries update the same Delivery.

---

# 26. Exactly-Once vs At-Least-Once

External email systems cannot guarantee perfect exactly-once network behavior.

AdmissionRadar should guarantee:

> **exactly one logical delivery record**

and implement retry-safe sending.

Practical goal:

```text
at-least-once processing
+
strong idempotency
```

---

# 27. Outbox Pattern Recommendation

To prevent:

```text
DB updated
but alert job lost
```

consider a lightweight transactional outbox pattern.

Conceptually:

```text
MeaningfulChange commit
+
outbox event commit
```

Worker:

```text
outbox
→ Alert creation
→ mark processed
```

For MVP, this may be implemented using a DB jobs table rather than a new message broker.

---

# 28. No Kafka Requirement

For approximately 50 Schools:

Do not add:

* Kafka;
* RabbitMQ cluster;
* distributed event bus;

unless existing infrastructure already justifies it.

PostgreSQL-backed job processing is sufficient.

---

# 29. Alert Dispatch Worker

Responsibilities:

1. fetch pending Deliveries;
2. lock a batch safely;
3. render email;
4. send through provider;
5. store provider message ID;
6. classify result;
7. retry eligible failures;
8. update suppression/bounce state where appropriate.

---

# 30. Delivery Locking

Multiple workers must not send the same Delivery concurrently.

Use:

```text
SELECT ... FOR UPDATE SKIP LOCKED
```

or job-runner equivalent.

---

# 31. Delivery Retry

Suggested:

```text
maximum 3–5 attempts
```

for transient provider/network failures.

Use exponential/increasing backoff.

Do not retry permanent failures indefinitely.

---

# 32. Failure Categories

Examples:

```text
TEMPORARY_PROVIDER_ERROR
RATE_LIMITED
INVALID_EMAIL
HARD_BOUNCE
SOFT_BOUNCE
SUPPRESSED
AUTH_ERROR
TEMPLATE_ERROR
```

Provider-specific errors should map into normalized internal categories.

---

# 33. Bounce Policy

Hard bounce:

```text
Subscriber → BOUNCED or SUPPRESSED
```

Pending future deliveries should not continue.

Soft bounce:

may retry according to provider policy.

Repeated soft bounce may eventually suppress.

---

# 34. Complaint / Suppression

If the email provider reports a complaint or suppression:

```text
Subscriber.status = SUPPRESSED
```

No further alerts until intentionally resolved.

---

# 35. Provider Abstraction

Application should depend on an internal interface.

Concept:

```text
send_email(
  recipient,
  template,
  payload,
  idempotency_context
)
```

Provider specifics stay behind adapter.

This allows migration without rewriting Alert domain logic.

---

# 36. Email Provider Requirements

Provider must support at minimum:

* transactional sending;
* API delivery;
* bounce handling;
* delivery/webhook events where available;
* sender-domain authentication;
* reasonable observability.

The exact provider should be selected during implementation/infrastructure phase.

---

# 37. Sender Identity

Use a consistent AdmissionRadar sender.

Example concept:

```text
AdmissionRadar <alerts@admissionradar.kr>
```

Exact domain setup belongs to deployment.

Keep:

* alerts;
* verification;
* operational email

consistent.

---

# 38. Email Content Architecture

Alert email should contain:

```text
School
Academic Year
Why user is receiving this
Critical changed information
Clear CTA
Unsubscribe
```

---

# 39. Core Email Rule

Do not let the email replace the site.

Include enough information to establish urgency and trust.

Then:

> **AdmissionRadar에서 전체 일정 보기**

This supports return traffic.

---

# 40. Alert Example — Announcement

Conceptual:

```text
[AdmissionRadar]

경복초등학교 2027학년도
입학설명회 일정이 발표됐습니다.

설명회
2026.09.17

신청 시작
2026.08.20

[전체 입학 일정 보기]

공식 출처를 확인한 정보입니다.
```

---

# 41. Alert Example — Deadline Change

Conceptual:

```text
경복초등학교 원서접수 마감일이 변경됐습니다.

이전
11월 10일

변경
11월 12일

[변경 내용과 전체 일정 보기]
```

Changes should be visually explicit.

---

# 42. Alert Example — Correction

If AdmissionRadar previously sent incorrect critical information:

```text
[정정 안내]

앞서 안내한 경복초등학교 원서접수 마감일을 정정합니다.

잘못 안내:
11월 10일

정정:
11월 12일

혼선을 드려 죄송합니다.

[공식 출처 및 전체 일정 보기]
```

Correction should not be disguised as an ordinary update.

---

# 43. Critical Values Source

Email rendering must read dates from:

```text
verified structured domain data
```

not from AI-generated article prose.

---

# 44. Email Template Strategy

Use template types:

```text
VERIFY_SUBSCRIPTION
NEW_ANNOUNCEMENT
REGISTRATION_OPEN
DATE_CHANGED
DEADLINE_CHANGED
ADDITIONAL_RECRUITMENT
IMPORTANT_ELIGIBILITY_CHANGE
EVENT_CANCELLED
RESULT_PUBLISHED
CORRECTION
```

Content should remain concise and deterministic.

---

# 45. Template Versioning

Templates should have an application-level version.

Useful for debugging:

```text
template_name
template_version
```

Exact content snapshots do not necessarily need full DB versioning during MVP.

---

# 46. Subject Lines

Subject should prioritize:

```text
School
+
change
```

Examples:

```text
[AdmissionRadar] 경복초 2027 입학설명회 일정 발표
[AdmissionRadar] 경복초 원서접수 마감일 변경
```

Avoid clickbait.

---

# 47. Frequency

AdmissionRadar alerts are event-driven, not newsletter-frequency emails.

Do not send daily “nothing changed” messages.

---

# 48. Multiple Changes Same Day

If several changes are part of one official announcement:

prefer one Alert.

Example 모집요강 adds:

```text
application period
lottery date
registration date
```

→ one:

```text
NEW_ANNOUNCEMENT
```

with key facts.

---

# 49. Unrelated Changes Same Day

If two separate consequential events occur:

they may produce separate Alerts.

However excessive email should be avoided.

Future batching may be introduced if volume becomes meaningful.

---

# 50. Alert Batching — MVP

Do not overengineer batching initially.

With approximately 50 Schools, event volume should be manageable.

Design data model so future batching remains possible.

---

# 51. `REGISTRATION_OPEN` Trigger

A special issue:

Registration opening can be known days in advance.

Should AdmissionRadar alert twice?

Example:

```text
Aug 10:
Open House announced
Registration opens Aug 20

Aug 20:
registration actually opens
```

Recommended MVP:

### Announcement Alert

Send when schedule first becomes known.

### Opening Reminder

Do **not** automatically send a second `REGISTRATION_OPEN` email in MVP unless user value is proven.

Otherwise alert volume can double.

---

# 52. Initial Alert Philosophy

MVP should optimize for:

> material changes

not reminder abundance.

Primary:

```text
announcement
date/deadline changes
additional recruitment
eligibility changes
cancellations
corrections
```

Time-based reminders can be P1.

---

# 53. P1 Reminder Architecture

Future:

```text
D-7
D-1
registration opens today
```

should require explicit user preference or carefully defined default.

Not included in initial MVP.

---

# 54. Alert Landing Destination

Every Alert must link to the most relevant AdmissionRadar page.

Preferred:

### Broad/new announcement

```text
School Detail
```

or relevant Update if it contains useful context.

### Specific significant change

```text
Update Detail
```

with prominent School link.

---

# 55. Tracking Links

Use first-party redirect/tracking or tagged URLs for:

```text
alert_id
delivery_id
campaign context
```

Avoid exposing subscriber PII in URL query parameters.

---

# 56. Email Click Event

On return:

```text
alert_email_click
```

should be attributable to:

```text
alert
subscription
landing page
```

without passing raw email.

---

# 57. UTM / Analytics

Example internal campaign dimensions:

```text
source=email
medium=admission-alert
campaign=school-update
```

Exact implementation can use non-PII IDs.

---

# 58. Email Open Tracking

Open rates are increasingly noisy.

Treat:

```text
click
```

as a stronger behavioral metric than:

```text
open
```

Primary retention KPI:

```text
Alert Email → Site CTR
```

---

# 59. Alert Funnel Metrics

Track:

```text
CTA click
↓
subscription submitted
↓
verification email sent
↓
verified
↓
alert generated
↓
delivery sent
↓
delivery success
↓
click
↓
return session
```

---

# 60. Core Alert KPIs

## Acquisition

```text
Alert CTA CTR
Subscription Submit Rate
Verification Completion Rate
```

## Deliverability

```text
Delivery Success Rate
Bounce Rate
Suppression Rate
```

## Retention

```text
Alert CTR
Returning Sessions from Alert
Multiple-School Subscription Rate
```

---

# 61. North Star Relationship

Project North Star:

```text
Verified Alert Subscribers
```

But additionally track:

```text
Verified Active Subscriptions
```

One Subscriber may follow multiple Schools.

These metrics answer different questions.

---

# 62. Subscriber Metric Definitions

## Verified Subscribers

Unique active verified email identities.

## Verified Subscriptions

Total active School/Cycle subscriptions.

Example:

```text
1 parent
3 schools
```

equals:

```text
1 Subscriber
3 Subscriptions
```

---

# 63. Subscription Conversion by Page

Must measure by:

```text
School page
Category page
Homepage
Update page
Guide
```

This determines which SEO assets actually create owned audience.

---

# 64. Source Page Attribution

Store or analytically record:

```text
source_page
```

at subscription initiation.

This allows:

> Which organic landing pages produce subscribers?

---

# 65. Multiple-School Expansion

After a subscription verifies, AdmissionRadar may suggest:

```text
비슷한 사립초 일정도 확인하기
```

Do not auto-subscribe.

This is a key potential growth loop.

---

# 66. No Newsletter Consent Bundling

Admission alert consent should not silently mean:

> marketing newsletter subscription.

If `AdmissionRadar Weekly` is added later, treat newsletter consent separately unless a clear lawful/UX policy explicitly defines otherwise.

Domain model may later add:

```text
NEWSLETTER subscription scope
```

---

# 67. Privacy Principle

Collect the minimum.

For Alerts, core personal data:

```text
email
subscription
verification/consent timestamps
delivery status
```

Do not ask:

* child name;
* child age;
* phone;
* home address;
* school preference profile.

---

# 68. PII Isolation

Alert service should operate using:

```text
subscriber_id
subscription_id
delivery_id
```

internally.

Raw email should be accessed only where necessary for sending/admin support.

---

# 69. Admin Email Display

Consider masking email by default:

```text
pa***@example.com
```

Reveal only where operationally necessary.

Not essential for MVP but recommended.

---

# 70. Alert Auditability

For each delivered Alert, system should reconstruct:

```text
MeaningfulChange
→ Alert
→ Subscription
→ Delivery
→ provider result
```

This is critical for complaints/corrections.

---

# 71. Cancellation Alert

If previously announced Event is verified cancelled:

send:

```text
EVENT_CANCELLED
```

to affected verified Subscribers.

This is high priority.

---

# 72. Changed-Then-Reverted Scenario

Example:

```text
10:00 source says deadline Nov 12
10:20 source corrected back to Nov 10
```

If first candidate has not been verified/published:

do not send anything.

If first was published and Alerted:

second becomes another verified change, potentially a Correction/Date Change.

---

# 73. Race Conditions

Possible concurrency:

```text
two source changes
two reviewers
same Event
```

Publication/version transaction must prevent:

```text
two current EventVersions
```

Alert generation uses committed MeaningfulChange IDs and dedupe keys.

---

# 74. Subscriber State Race

If user unsubscribes while Delivery is pending:

dispatch worker must re-check eligibility before sending.

Do not rely only on eligibility at Delivery-row creation time.

---

# 75. Delivery Eligibility Check

Immediately before external send:

```text
subscription still VERIFIED?
subscriber ACTIVE?
delivery not cancelled?
```

If not:

```text
SUPPRESSED/CANCELLED
```

---

# 76. Verification Resend Abuse

Rate-limit verification requests by:

* normalized email;
* IP or session where appropriate;
* Subscription.

Do not allow unlimited outbound verification mail.

---

# 77. Alert Abuse / Enumeration

Subscription endpoint should not expose excessive information about whether an arbitrary email is already registered.

Responses can remain user-friendly without enabling email enumeration.

---

# 78. Email Injection Safety

Do not accept client-generated:

```text
subject
HTML body
destination URL
```

for Alert sending.

Templates and targets derive server-side.

---

# 79. Link Safety

CTA destination must be a known AdmissionRadar route.

Official Source link may appear on landing page.

Avoid turning the email system into an arbitrary URL delivery service.

---

# 80. Provider Webhooks

Where supported, process:

```text
delivered
bounce
complaint
click
```

using authenticated webhook verification.

Webhook handler must be idempotent.

---

# 81. Webhook Idempotency

Provider may retry webhook events.

Store provider event identifier where available or dedupe based on:

```text
provider
event_id
```

Do not double-apply bounce/suppression logic.

---

# 82. Alert Operational Dashboard

Admin should show:

```text
Alerts Ready
Deliveries Pending
Failed Deliveries
Bounce Rate
Recent Alert CTR
Suppressed Subscribers
```

But review/change accuracy remains higher priority than marketing vanity metrics.

---

# 83. Manual Alert Control

MVP should allow:

```text
Preview
Approve/Ready
Cancel
```

before mass dispatch if desired.

Recommended during initial launch:

> verified change → Alert draft → operator preview → send

This reduces early template/logic risk.

Later, trusted alert types can auto-dispatch after verified publication.

---

# 84. Test Send

Admin needs:

```text
send test email
```

to a configured operator address before first production dispatch of new templates.

Do not use real Subscribers for testing.

---

# 85. Alert Maturity

## A0 — Manual Send

Operator manually creates/sends alert.

## A1 — Automatic Alert Draft

Verified MeaningfulChange automatically creates Alert draft.

Operator previews and releases.

Recommended launch state.

## A2 — Automatic Dispatch

Trusted Alert types automatically dispatch after verification.

## A3 — Smart Timing / Batching

Future.

Launch can succeed at **A1**.

---

# 86. Failure Recovery

If email provider is down:

```text
verified admission truth remains published
Alert stays pending/failed
worker retries
```

Do not roll back public data.

---

# 87. Provider Outage

If outage exceeds useful notification window:

Admin should be able to:

```text
retry pending
cancel stale alert
regenerate message
```

with audit history.

---

# 88. Alert Staleness

Some Alerts lose value if delayed too long.

Example:

```text
registration opens today
```

Future policy may set expiry.

MVP material-change Alerts generally remain useful longer.

Potential field later:

```text
expires_at
```

Not required initially.

---

# 89. Email Rendering

Must support:

```text
HTML
+
plain text fallback
```

Primary CTA visible without complex image loading.

Do not make critical dates image-only.

---

# 90. Accessibility

Email and landing pages should use:

* semantic headings;
* adequate link labels;
* text-based critical information;
* reasonable mobile layout.

---

# 91. Alert-to-SEO Loop

The return destination should reinforce permanent SEO assets.

Example:

```text
Update Alert
↓
Update Detail
↓
School Detail
↓
Related Schools
↓
More Subscriptions
```

Alert traffic should not disappear into isolated one-off pages.

---

# 92. Newsletter — Future

Newsletter is a separate distribution product.

Potential:

```text
AdmissionRadar Weekly
```

It may aggregate:

```text
new announcements
upcoming deadlines
recent changes
```

But Newsletter is not part of Alert MVP.

---

# 93. Newsletter Architecture Reuse

Future Newsletter can reuse:

```text
MeaningfulChanges
Events
Category data
```

but should have:

```text
separate subscription scope
separate consent
separate send model
```

---

# 94. Alert Data Model Amendments

`04_DATA_MODEL.md` should be amended to include:

### Alert type

```text
CORRECTION
```

### Optional future provider event dedupe table

Not P0 unless webhooks require it.

Possible:

```text
email_provider_events
```

### Optional outbox table

Recommended P0/P0.5 for reliability:

```text
outbox_events
```

Suggested:

```text
id uuid
event_type text
aggregate_type text
aggregate_id uuid
payload jsonb
status text
available_at timestamptz
processed_at timestamptz
attempt_count integer
created_at timestamptz
```

This avoids needing an external message broker.

---

# 95. Outbox Uses

Possible events:

```text
MEANINGFUL_CHANGE_PUBLISHED
UPDATE_PUBLISHED
ALERT_READY
```

Do not use it as a second business truth store.

It is infrastructure for reliable downstream jobs.

---

# 96. Launch Alert Flow

Recommended MVP production flow:

```text
Verified MeaningfulChange
↓
Publish structured admission data
↓
Create Alert Draft
↓
Admin Preview
↓
Release
↓
Create Deliveries
↓
Worker Sends
↓
Track results
```

This provides strong control with minimal manual labor.

---

# 97. Later Automated Flow

After confidence:

```text
Verified MeaningfulChange
↓
Alert Policy
↓
Auto-create READY Alert
↓
Auto-dispatch
```

Human verification of R2/R3 source truth still remains according to verification policy.

---

# 98. Alert Acceptance Criteria

Alert architecture is complete when:

```text
visitor
→ submits email
→ verifies
→ verified subscription exists
→ meaningful verified change occurs
→ one Alert is created
→ exactly one logical Delivery exists per eligible Subscription
→ email sends successfully
→ user clicks
→ returns to correct AdmissionRadar page
→ unsubscribe stops future delivery
```

Retries must not create duplicate Alerts or Deliveries.

---

# 99. Business Acceptance Criteria

Alert system should prove:

```text
Organic Visitor
→ Verified Subscriber
→ Return Visit
```

If Alerts do not produce measurable return traffic, the retention hypothesis is not validated.

---

# 100. Final Alert Principle

AdmissionRadar should not optimize for sending the most email.

It should optimize for:

> **being the email a parent opens because it probably means something changed that matters.**

Trust compounds only if alerts are:

```text
rare enough to matter
accurate enough to trust
fast enough to act on
useful enough to click
```

That is the role of the Alert architecture.
