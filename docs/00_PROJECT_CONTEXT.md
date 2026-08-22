# AdmissionRadar — Project Context & Product Strategy v0.1

**Recommended file:** `docs/00_PROJECT_CONTEXT.md`
**Status:** Foundation / Source of Truth
**Version:** 0.1
**Reference date:** 2026-08-13
**Initial target season:** 2027 Academic Year

---

## 0. Purpose of This Document

This document defines **what AdmissionRadar is, why it exists, how it creates value, how it will make money, what it must not become, and how the product should evolve.**

All future documents and implementation decisions must remain consistent with this document, including:

* PRD
* Information Architecture
* Data model
* Collection architecture
* Change detection
* Alert system
* SEO architecture
* Content generation
* Admin tools
* Analytics
* Monetization
* Infrastructure

When implementation convenience conflicts with the business model defined here, **the business model wins**.

Codex must not reinterpret AdmissionRadar as:

* an admissions consulting service
* a school recommendation engine
* a school ranking site
* a parent community
* a paid admissions SaaS
* an AI product
* a generic school directory
* an education marketplace

AdmissionRadar is an **admission schedule intelligence and discovery media product**.

---

# 1. One-Sentence Definition

> **우리 아이가 지원할 수 있는 학교의 설명회·모집·원서접수 일정을 한곳에서 확인하고, 변경되면 무료로 알려주는 서비스.**

English internal definition:

> **AdmissionRadar is a free admission intelligence service that helps parents discover, track, and receive updates about important school admission schedules before they miss them.**

The primary object of the product is not the school.

The primary object is:

> **a time-sensitive admission event.**

Examples:

* Open House
* 입학설명회
* Application Open
* Application Deadline
* Lottery
* Interview
* Assessment
* Result Announcement
* Registration
* Additional Recruitment

AdmissionRadar exists because these events are fragmented across school websites, admission portals, notices, PDFs, Instagram accounts, blogs, and other sources.

---

# 2. Product Formula

AdmissionRadar can be summarized internally as:

> **Calendar + Search + Alert + SEO Media**

Each component has a specific role.

### Calendar

Answers:

> “What admission events are happening, and when?”

### Search

Answers:

> “What is happening with the school I am interested in?”

### Alert

Answers:

> “Tell me when something changes so I do not have to keep checking.”

### SEO Media

Answers:

> “How does AdmissionRadar acquire users repeatedly without paying for every visitor?”

These four functions together form the core business.

None should be treated as an isolated feature.

---

# 3. The Problem

Parents preparing for school admission face a simple but expensive problem:

> **Important admission information is fragmented, published at different times, and easy to miss.**

The problem is especially severe when:

* a school has not yet published the new academic year's schedule;
* parents must repeatedly check school websites;
* the announcement is buried inside a notice board or PDF;
* registration for an Open House opens before the actual event;
* the admission cycle differs from school to school;
* historical schedules are difficult to compare;
* an existing announcement changes after initial publication;
* important dates are distributed across multiple pages.

Existing alternatives generally require parents to:

1. know which schools to monitor;
2. find each official source;
3. revisit it repeatedly;
4. manually compare dates;
5. remember deadlines themselves.

AdmissionRadar removes this repeated checking.

---

# 4. Core User Job

The primary Job To Be Done is:

> **“내 아이의 입학 준비에서 중요한 날짜를 놓치고 싶지 않다.”**

Secondary jobs:

> “올해 일정이 아직 안 나왔다면 언제쯤 발표될지 알고 싶다.”

> “여러 학교 일정을 한 번에 비교하고 싶다.”

> “내가 직접 학교 홈페이지를 매일 확인하고 싶지 않다.”

> “공식 발표가 나오는 순간 알고 싶다.”

The product should optimize for these jobs rather than maximizing the amount of school information displayed.

---

# 5. Initial Target Audience

## Phase 1 Core Audience

Parents with children approximately **4–8 years old** who are considering admission to schools in Seoul and the Seoul metropolitan area.

Primary geographic market:

* Seoul
* Gyeonggi / 수도권 where relevant

Initial school categories:

### Category A — Seoul Private Elementary Schools

Planning coverage:

> approximately 38 schools

This is the primary launch category.

### Category B — International / Foreign Schools

Initial coverage:

> approximately 10–15 major schools

Examples may include major schools such as:

* Seoul International School
* Korea International School
* YISS
* Dwight School Seoul
* Chadwick International

Exact inclusion must be determined by the initial coverage list.

### Category C — Early Childhood English Institutions

**Not included in Phase 1.**

Candidate for Phase 1.5.

Reason:

Data is more fragmented and often depends on:

* Instagram
* Naver Blog
* academy websites
* manually maintained notices

Collection and verification costs are therefore significantly higher.

---

# 6. Initial Coverage Principle

The goal is **not maximum school coverage**.

The goal is:

> **high reliability for a small number of high-intent schools.**

Initial target:

* ~38 Seoul private elementary schools
* ~10–15 major international / foreign schools

Total:

> approximately 50 schools

For each school, historical admission data should ideally cover:

> **the previous three admission cycles**

This historical dataset is one of AdmissionRadar's first proprietary assets.

A site with 50 well-maintained schools is preferable to a site with 1,000 unreliable schools.

---

# 7. Core Product Objects

The product should revolve around five conceptual objects.

## 7.1 School

A school is the entity the user follows.

Examples:

* school name
* category
* region
* address
* official website
* admission source

School profile information exists only to provide context for admission intelligence.

AdmissionRadar must not become a generic school encyclopedia.

---

## 7.2 Admission Cycle

Represents an academic-year-specific admission process.

Example:

> 경복초등학교 / 2027학년도

A school may have multiple historical cycles.

Examples:

* 2025
* 2026
* 2027

Historical cycles are important because they allow the product to show:

* previous announcement dates
* recurring application periods
* historical changes
* expected timing

---

## 7.3 Admission Event

This is the most important domain object.

Examples:

* briefing
* Open House
* application open
* application deadline
* lottery
* assessment
* interview
* result
* registration
* additional recruitment

Every important date should ultimately be normalized into an event.

---

## 7.4 Source Observation

AdmissionRadar must know:

> what official source was checked, when it was checked, and whether it changed.

Source observations allow the system to establish evidence for the data displayed.

---

## 7.5 Subscription

A lightweight relationship between:

> user email → school or admission target

No full account should be required in MVP.

---

# 8. The Most Important Product Concept: Unknown Is Useful

Most information services treat “not announced” as missing data.

AdmissionRadar must treat it as **valuable product state**.

Instead of:

> 일정 없음

display:

> **2027학년도 일정 미발표**

Then provide context:

* previous year's announcement date
* previous year's admission period
* current source status
* latest source check
* approximate historical publication window

Example:

> 2027학년도 모집 일정은 아직 발표되지 않았습니다.

> 2026학년도 모집공고 발표: 2025.10.20
> 2025학년도 모집공고 발표: 2024.10.18

> 최근 일정 기준 예상 발표 구간: 2026년 10월 중순

> 공식 발표 시 무료로 알려드립니다.

The system must clearly distinguish:

* **official fact**
* **historical fact**
* **estimated window**

Estimated dates must never visually appear as official dates.

---

# 9. Radar State Model

AdmissionRadar should eventually normalize schools or events into clear states.

Suggested conceptual states:

### `NOT_ANNOUNCED`

No official announcement for the target academic year.

### `EXPECTED`

Not officially announced, but historical data provides an expected time window.

### `ANNOUNCED`

Official information exists.

### `REGISTRATION_UPCOMING`

Registration opening date is known but not yet reached.

### `REGISTRATION_OPEN`

Users can currently register or apply.

### `DEADLINE_SOON`

Deadline is approaching.

### `CLOSED`

Application or event registration is closed.

### `COMPLETED`

The event has occurred.

### `UPDATED`

Previously published official information has changed.

These states should drive both UI and alert logic.

---

# 10. Core MVP

MVP consists of only six user-facing capabilities.

## 10.1 Home / Admission Radar

Primary entry point.

Show:

* currently open
* upcoming
* newly announced
* not yet announced but being monitored
* major upcoming deadlines

Primary season selector:

> 2027학년도

---

## 10.2 Admission Calendar

Unified event calendar.

Initial filters:

* academic year
* private elementary
* international / foreign school
* Seoul
* Gyeonggi

Avoid excessive filters.

---

## 10.3 School Directory

Users can find schools being monitored by AdmissionRadar.

Purpose:

* navigation
* discovery
* internal linking
* subscription acquisition

---

## 10.4 School Detail Page

This is the core SEO and data asset.

Each page should answer:

1. What is the current admission status?
2. What dates are currently official?
3. What has not yet been announced?
4. What happened in previous years?
5. When was the official source last checked?
6. What changed recently?
7. Where can I find the official source?
8. Can AdmissionRadar alert me when something changes?

---

## 10.5 Event / Update Page

Generated when a meaningful admission change occurs.

Example:

> 2027학년도 경복초등학교 입학설명회 일정 발표

Purpose:

* search acquisition
* Naver / Google indexing
* time-sensitive traffic
* email landing page
* internal linking back to school detail

These pages must contain meaningful structured information and cannot merely paraphrase an announcement.

---

## 10.6 Email Alert

CTA:

> **이 학교 입학 일정 무료로 받기**

MVP input:

> email only

No password.

No account registration.

A verification mechanism may be used for email validity and consent.

Alerts should drive users back to AdmissionRadar rather than reproducing the entire destination page inside the email.

---

# 11. Explicit Non-Goals

The following must not be implemented during MVP unless the project strategy document is explicitly changed.

## User features

* mobile app
* login-heavy membership system
* parent profiles
* social feed
* community
* reviews
* comments
* chat
* messaging
* school ranking
* school scoring
* personalized school recommendations
* admission probability
* AI chatbot
* admissions consulting
* paid consultations
* payment
* premium subscription
* school dashboard

## Business expansion

* nationwide school coverage
* thousands of schools
* academy marketplace
* tutor marketplace
* education ecommerce
* lead selling
* school CRM

## Technical overengineering

* microservices
* unnecessary event-driven architecture
* Kubernetes
* complex data pipelines
* real-time infrastructure where periodic collection is sufficient
* multi-tenant architecture
* recommendation models

These are distractions until the core traffic-and-alert loop is proven.

---

# 12. User Acquisition Strategy

Paid acquisition is not the core growth strategy.

Primary acquisition channels:

> **Google Search + Naver Search**

The site should be designed from launch as both:

* a structured database product;
* an SEO media property.

Search intent categories:

---

## 12.1 School Intent

Examples:

* 경복초 입학
* 경복초 입학설명회
* 경복초 2027 모집
* 경복초 원서접수

Destination:

> School Detail Page

---

## 12.2 Category Intent

Examples:

* 2027 사립초 입학
* 서울 사립초 입학설명회
* 사립초 원서접수 일정
* 국제학교 입학 일정

Destination:

> Database / Calendar / Guide

---

## 12.3 Problem Intent

Examples:

* 사립초 원서접수 언제
* 사립초 몇 개까지 지원
* 사립초 추첨일
* 국제학교 지원 자격
* 국제학교 외국인학교 차이

Destination:

> Guide

---

# 13. Content Model

Only three major content types should exist initially.

## TYPE A — Database

Permanent structured assets.

Examples:

* 2027 사립초 입학 캘린더
* 서울 사립초 38개 입학 일정
* 국제학교 입학 일정
* individual school pages

These are continuously updated rather than published once and forgotten.

---

## TYPE B — Updates / News

Created when underlying admission data changes materially.

Examples:

* 입학설명회 발표
* 원서접수 일정 발표
* 추가모집 발표
* 일정 변경
* 지원자격 변경

Updates exist because something actually happened.

The system must not manufacture news pages merely to increase page count.

---

## TYPE C — Guides

Evergreen editorial content.

Examples:

* 사립초 입학 준비 가이드
* 사립초 원서접수 방법
* 사립초 중복지원
* 사립초 추첨 방식
* 국제학교와 외국인학교 차이
* 국제학교 지원 자격

Guides support:

* search acquisition
* user trust
* internal linking
* AdSense eligibility
* topical authority

---

# 14. SEO Product Principle

AdmissionRadar must never adopt the strategy:

> “AI로 키워드 수천 개 뽑아서 페이지 수천 개 생성.”

That is not a moat. It is a fast route to creating a large pile of low-value pages.

Each indexable page should provide at least one form of proprietary or structured value.

Examples:

* historical timeline
* current radar status
* source verification status
* update history
* normalized event dates
* historical comparison
* related monitored schools
* relevant admission alerts

Programmatic SEO is acceptable only when the underlying page contains genuine useful structured data.

---

# 15. Business Model

AdmissionRadar is **free for parents**.

There is no paid consumer subscription in the initial business model.

Revenue comes from audience monetization.

---

## 15.1 Revenue Stage 1 — Display Advertising

Primary:

> Google AdSense or equivalent display advertising

Advertising should not interfere with the primary admission information.

Core dates should never be hidden behind ads.

Advertising density should remain secondary to product usefulness.

---

## 15.2 Revenue Stage 2 — Direct Advertising

Once sufficient traffic exists, sell contextual advertising directly to education-related advertisers.

Potential categories:

* English education
* learning services
* education apps
* books
* camps
* academies
* educational materials
* moving services
* relevant family products

Sensitive or regulated advertising categories require separate policy and legal review.

Possible product:

> **2027 사립초 입학 특집 Sponsor**

Direct advertising should eventually produce materially higher revenue per user than programmatic display advertising.

---

## 15.3 Revenue Stage 3 — Newsletter Sponsorship

AdmissionRadar should build an email audience from alert subscriptions.

Potential newsletter:

> **AdmissionRadar Weekly**

Example structure:

* newly announced events
* applications opening
* deadlines approaching
* important updates
* sponsor
* links back to AdmissionRadar

The newsletter is free to users.

Monetization occurs through sponsorship.

---

# 16. Core Business Flywheel

The primary growth loop is:

```text
Google / Naver Search
        ↓
AdmissionRadar landing page
        ↓
User finds school or event
        ↓
Current admission status displayed
        ↓
Schedule not announced / future event exists
        ↓
User subscribes to free alert
        ↓
AdmissionRadar detects official update
        ↓
Email sent
        ↓
User returns to AdmissionRadar
        ↓
More page views / ad impressions
        ↓
User follows additional schools
        ↓
More subscriptions
        ↓
Higher returning traffic
```

This loop is more important than almost every individual feature.

Future feature proposals should be evaluated partly on whether they strengthen this loop.

---

# 17. Core Business Assets

AdmissionRadar's long-term moat is not its frontend or AI integration.

The main assets are:

## Asset 1 — Historical Admission Timeline

For each school:

> multi-year admission history

Over time this becomes difficult for a new competitor to reconstruct.

---

## Asset 2 — Search-Indexed Admission Pages

Pages accumulate:

* backlinks
* search history
* query coverage
* authority
* return visitors

Every season strengthens the next season.

---

## Asset 3 — Parent Audience

An email audience of parents actively preparing for admission.

This creates:

* repeat traffic
* direct distribution
* sponsorship inventory
* lower dependence on search engines

---

## Asset 4 — Source Monitoring Knowledge

AdmissionRadar gradually learns:

* where schools publish admission information;
* how each source behaves;
* how frequently it changes;
* which pages or PDFs matter;
* how to normalize each school's admission process.

This collection configuration becomes operational intellectual property.

---

# 18. Automation Philosophy

AI and automation operate primarily **behind the product**.

They are not the product positioning.

The user should care about:

> accurate admission information

not:

> AI-powered admission intelligence.

Internal automation pipeline:

```text
Source Registry
      ↓
Collector
      ↓
Snapshot
      ↓
Change Detector
      ↓
Parser / Extractor
      ↓
Normalization
      ↓
Validation
      ↓
Approval or Auto-Approval
      ↓
Database Update
      ↓
Alert
      ↓
Update Content
```

---

# 19. Source of Truth Principle

Official sources must be preferred wherever possible.

Examples:

* official school website
* official admission page
* official notice
* official admission portal
* official PDF
* officially operated school account where necessary

Third-party pages may be useful for discovery but should not silently become the authoritative source for critical admission dates.

Each important record should preserve its provenance.

Minimum useful provenance:

* source URL
* observed time
* extracted value
* publication/update time when detectable

---

# 20. Data Accuracy Policy

Admission schedules are high-consequence information for users.

Therefore:

> **accuracy is more important than collection speed.**

AI extraction alone must never automatically establish truth for high-risk fields during the early stages.

High-risk fields include:

* application start
* application deadline
* Open House registration opening
* eligibility
* lottery
* assessment
* result announcement
* enrollment deadline

Initial workflow:

```text
Source
→ Collection
→ Extraction
→ Verification
→ Human approval
→ Publish
```

Later:

```text
Source
→ Collection
→ Deterministic checks
→ AI extraction
→ Confidence / conflict detection
→ Auto-publish only for trusted scenarios
```

Automation scope should increase gradually.

---

# 21. Data Confidence

The system should conceptually distinguish at least:

### Official

Directly supported by an official source.

### Historical

Official information belonging to a previous cycle.

### Estimated

Inferred from historical timing.

### Unverified

Detected but not yet sufficiently validated.

Unverified data must never appear publicly as confirmed admission information.

---

# 22. Change Detection Is a Core Capability

AdmissionRadar is not merely a crawler.

Its valuable behavior is:

> **detect meaningful admission changes.**

Examples:

* announcement added
* application period added
* application period changed
* event canceled
* deadline extended
* new PDF uploaded
* registration link added
* eligibility changed
* additional recruitment opened

A website layout change or unrelated school notice must not automatically become an admission event.

The system must separate:

> webpage change

from:

> meaningful admission change.

---

# 23. Human-in-the-Loop Strategy

MVP intentionally allows manual approval.

This is not a failure of automation.

For ~50 schools, manual validation is economically acceptable while the data pipeline is learning.

Human approval should provide training data for future automation:

* correct extraction
* incorrect extraction
* ignored change
* event classification
* duplicate detection
* source trust

The operational objective is:

> gradually reduce human minutes per monitored school without reducing accuracy.

Not:

> achieve 100% automation on day one.

---

# 24. Seasonal Strategy

AdmissionRadar is seasonal, but seasonality is not considered a flaw.

The initial operating cycle:

### August

* product development
* school registry
* source registry
* historical dataset
* SEO foundation

### September

* Open House / briefing monitoring
* new admission announcements
* SEO content acceleration
* alert subscriber acquisition

### October

* major announcement monitoring
* search demand growth
* category landing pages

### November

> **Primary private-elementary traffic peak**

Focus:

* application
* deadline
* lottery
* changes

### December–January

* additional recruitment
* results / enrollment information
* international schools

### January–April

* international / foreign school demand
* optional Phase 1.5 expansion

### May–July

* evergreen SEO
* dataset cleanup
* next season historical modeling
* infrastructure improvement

The low season is a dataset-building season.

---

# 25. Current Launch Strategy

Reference date:

> **2026-08-13**

The primary launch object is:

> **2027학년도 입학 레이더**

The product should be useful even before every 2027 schedule is published.

Therefore the initial dataset should prioritize:

1. 2027 current status
2. 2026 historical cycle
3. 2025 historical cycle
4. preferably 2024 where easily obtainable

This allows useful “not yet announced” states immediately after launch.

---

# 26. Product Homepage Philosophy

The homepage should answer:

> “What requires my attention now?”

It must not behave like a corporate landing page.

Conceptual sections:

### 지금 신청 가능

Events currently accepting applications or registrations.

### 곧 시작

Known upcoming registration windows.

### 새로 발표됨

Recently detected official announcements.

### 아직 발표 전

High-interest schools whose new admission cycle has not yet been announced.

### 주요 마감

Important near-term deadlines.

The homepage is therefore a radar, not a brochure.

---

# 27. School Detail Philosophy

The school page is the core permanent unit of AdmissionRadar.

It should emphasize:

## Current Status

Example:

> 🟡 2027학년도 모집 일정 미발표

## Current Cycle

Confirmed dates.

## Historical Timeline

Previous admission cycles.

## Expected Window

Only when sufficient historical data exists.

## Source

Direct link to official information.

## Last Checked

When AdmissionRadar last checked the relevant source.

## Change History

Meaningful admission changes detected over time.

## Alert CTA

> 발표되면 무료로 알려드립니다.

Generic school description should remain short.

AdmissionRadar is not Wikipedia for schools.

---

# 28. Alert Philosophy

Alerts are both a utility feature and an audience acquisition mechanism.

But user trust is the priority.

Do not send notifications for:

* meaningless webpage changes
* unrelated school news
* duplicate announcements
* tiny formatting edits

Send alerts for meaningful actions or decisions.

Example:

> 대광초등학교 2027학년도 입학설명회 일정이 발표되었습니다.

The email should contain enough context to establish relevance, then link back to the detail page.

---

# 29. Subscription UX

Initial subscription should require the minimum possible friction.

Preferred flow:

```text
[이 학교 입학 일정 무료로 받기]

Email
[알림 신청]

→ email verification
→ subscription activated
```

No password.

No username.

No profile.

No onboarding questionnaire.

If future personalization creates measurable value, it can be introduced later.

---

# 30. Core Metrics

Revenue is not the first product validation metric.

The initial North Star is:

> **Verified Alert Subscribers**

Because it represents:

* genuine admission intent
* user-recognized value
* owned audience
* future return traffic

Secondary metrics:

1. organic clicks
2. organic impressions
3. alert CTA conversion rate
4. verified subscription rate
5. email → site CTR
6. returning visitor rate
7. pages per session
8. monitored school coverage
9. stale-data rate
10. meaningful update detection latency
11. false-positive detection rate

Monetization metrics become important after traffic begins to scale:

* page RPM
* ad revenue
* newsletter sponsor revenue
* direct advertising revenue

---

# 31. Operational Metrics

The system must also measure data quality.

Important operational KPIs:

### Source Freshness

How recently each source was checked.

### Coverage

Percentage of monitored schools with valid admission sources.

### Verification Queue

Number of changes waiting for human review.

### Detection Latency

Time between official publication and AdmissionRadar detection.

### Publication Latency

Time between detection and verified publication.

### Extraction Error Rate

Incorrect extracted values.

### False Positive Rate

Changes incorrectly classified as admission-related.

### Human Minutes per School

Critical automation efficiency metric.

---

# 32. Product Prioritization Rule

Every feature should be evaluated using four questions:

### 1. Does it help users avoid missing admission events?

### 2. Does it improve search acquisition?

### 3. Does it improve alert subscriber acquisition or return traffic?

### 4. Does it increase data quality or reduce operating cost?

If a feature strongly supports none of these, it should usually not be built.

---

# 33. Monetization Guardrail

User experience must not be distorted merely to create additional ad impressions.

Do not:

* split one useful page into unnecessary pagination;
* hide core dates behind extra clicks;
* create fake news pages;
* force account creation;
* intentionally truncate essential information;
* use misleading buttons.

The business needs repeat trust more than one extra page view.

---

# 34. Technical Philosophy

AdmissionRadar should begin as a simple web product.

Architecture should optimize for:

* maintainability
* structured data
* reliable collection
* observability
* SEO
* low operational cost
* gradual automation

Avoid infrastructure designed for hypothetical millions of users before the product has meaningful traffic.

The difficult technical problem is not serving HTML.

It is:

> **maintaining trustworthy admission intelligence over time.**

Architecture effort should reflect this reality.

---

# 35. Suggested System Boundaries

Conceptually the system will eventually contain:

```text
Public Web
│
├── Homepage
├── Calendar
├── School Directory
├── School Detail
├── Event / Update Detail
└── Guide Content

Core Application
│
├── Schools
├── Admission Cycles
├── Events
├── Sources
├── Subscriptions
└── Alerts

Admission Intelligence Pipeline
│
├── Source Registry
├── Collector
├── Snapshot Store
├── Change Detector
├── Extractor
├── Validator
└── Approval Queue

Publishing
│
├── Database Update
├── SEO Pages
└── Alert Trigger

Operations
│
├── Admin Review
├── Data Quality
├── Logs
└── Analytics
```

Exact technology choices will be defined later.

---

# 36. Development Roadmap

## Phase 0 — Foundation

Goal:

> define the system before implementation.

Deliverables:

1. Project Context
2. PRD
3. Information Architecture
4. Domain / Data Model
5. Source model
6. Collection architecture
7. SEO architecture
8. MVP implementation plan

No unnecessary production code should be written until the above are coherent.

---

## Phase 1 — Data Foundation

Goal:

> make AdmissionRadar useful before automation.

Build:

* school registry
* approximately 50 initial schools
* source registry
* 2025–2027 admission cycle data where available
* historical events
* source provenance

Success condition:

> a user can inspect meaningful historical and current admission information.

---

## Phase 2 — Public MVP

Build:

* homepage radar
* admission calendar
* school directory
* school detail
* event detail
* core guides
* responsive web
* sitemap
* metadata
* structured SEO foundation

Success condition:

> AdmissionRadar is useful as a standalone website even without alerts.

---

## Phase 3 — Alert Capture

Build:

* email subscription
* email verification
* school subscriptions
* unsubscribe
* alert delivery
* basic delivery analytics

Success condition:

> users can rely on AdmissionRadar instead of repeatedly checking school sites.

---

## Phase 4 — Monitoring Automation

Build:

* scheduled source collection
* snapshots
* hashes
* content extraction
* change detection
* admin verification queue

Initially:

> human approval required for critical changes.

Success condition:

> the majority of monitored source changes are automatically surfaced for review.

---

## Phase 5 — Admission Intelligence

Add:

* normalized extraction
* confidence
* duplicate detection
* cross-source conflicts
* historical comparisons
* expected announcement windows
* gradual auto-approval

Success condition:

> human work per school materially declines while accuracy remains high.

---

## Phase 6 — SEO Growth Engine

Build:

* scalable school pages
* category pages
* update content workflow
* internal linking
* structured data
* stale-content detection
* indexation monitoring

Success condition:

> organic traffic becomes the primary acquisition channel.

---

## Phase 7 — Monetization

Sequence:

1. AdSense / display ads
2. newsletter
3. newsletter sponsorship
4. direct advertising

Avoid monetization complexity before meaningful traffic exists.

---

## Phase 8 — Controlled Expansion

Possible expansion:

* additional international schools
* 수도권 private schools if strategically relevant
* English early childhood institutions
* additional geographic categories

Expansion requires evidence that:

* existing sources are reliably monitored;
* operations remain manageable;
* traffic justifies additional coverage.

---

# 37. MVP Definition of Done

AdmissionRadar MVP is considered operational when:

* initial school directory exists;
* current and historical admission cycles are represented;
* major admission event types are normalized;
* calendar works;
* school detail pages work;
* event/update pages work;
* official source attribution exists;
* users can subscribe with email;
* users can unsubscribe;
* meaningful updates can trigger alerts;
* an administrator can verify critical changes before publication;
* pages are crawlable and indexable;
* basic analytics are implemented;
* system health and source freshness can be inspected.

MVP does **not** require fully automated collection.

---

# 38. Initial Business Hypotheses

The project should explicitly test the following assumptions.

## H1 — Search Demand

Parents search for school-specific and admission-specific schedules every year.

## H2 — Fragmentation Pain

Parents consider repeated manual checking sufficiently annoying that a centralized radar provides meaningful value.

## H3 — Alert Value

A meaningful percentage of visitors will provide an email address to receive school updates.

## H4 — Repeat Behavior

Admission alerts can turn one-time organic visitors into returning users.

## H5 — Historical Data Value

Previous admission cycles improve user value even before new schedules are announced.

## H6 — SEO Compounding

Structured historical school pages can accumulate search authority across admission seasons.

## H7 — Audience Monetization

A sufficiently concentrated parent audience can support advertising and sponsorship revenue without charging the parent.

These hypotheses should later be connected to measurable validation thresholds.

---

# 39. Primary Risks

## Risk 1 — Incorrect Admission Information

Impact:

> catastrophic to user trust.

Mitigation:

* official-source preference
* provenance
* human validation
* confidence levels
* change logs

---

## Risk 2 — Stale Information

Mitigation:

* `last_checked_at`
* source freshness monitoring
* recurring checks
* stale-source dashboard

---

## Risk 3 — SEO Thin Content

Mitigation:

* historical timeline
* current status
* update history
* proprietary normalization
* useful category pages
* editorial guides

---

## Risk 4 — Excessive Manual Operations

Mitigation:

* cap initial coverage
* source registry
* reusable collectors
* change detection
* progressive automation

---

## Risk 5 — Premature Expansion

Mitigation:

> Do not expand school categories merely because data exists.

Expansion should follow user demand and operational readiness.

---

## Risk 6 — Building the Wrong Product

The biggest product risk is gradually turning AdmissionRadar into:

> “학교 관련 정보는 뭐든 다 있는 사이트.”

That destroys focus.

The product must remain centered around:

> **admission decisions driven by time-sensitive information.**

---

# 40. Strategic Identity

AdmissionRadar should ultimately occupy this mental category:

> **“입학 일정 확인할 때 가는 곳.”**

Not:

> “학교 리뷰 보는 곳.”

Not:

> “사립초 추천받는 곳.”

Not:

> “교육 정보 읽는 곳.”

Not:

> “입시 상담하는 곳.”

The strongest brand association is:

> **Admission Schedule = AdmissionRadar**

---

# 41. User-Facing Positioning

Brand:

# AdmissionRadar

Primary Korean tagline:

> **우리 아이 입학 일정을 놓치지 마세요.**

Supporting proposition:

> 사립초 · 국제학교 · 외국인학교의 설명회, 모집, 원서접수 일정을 한곳에서 확인하세요.

Secondary CTA:

> 관심 학교 일정이 아직 안 나왔나요?
> 발표되면 무료로 알려드립니다.

---

# 42. Internal Product Positioning

AdmissionRadar should be understood internally as:

> **a free admission information database that acquires high-intent parents through search, captures them through admission alerts, creates repeat traffic through verified updates, and monetizes that audience through advertising and sponsorship.**

Therefore:

```text
Structured Admission Data
        ↓
Search Index
        ↓
Organic Traffic
        ↓
Alert Subscription
        ↓
Owned Audience
        ↓
Repeat Traffic
        ↓
Advertising Inventory
        ↓
Revenue
```

This is the business system.

---

# 43. What Creates the Moat

The moat strengthens with every admission season.

Year 1:

> basic historical schedules

Year 2:

> richer timelines + accumulated subscribers + indexed pages

Year 3:

> multi-year behavioral patterns + stronger SEO + larger parent audience

A competitor can reproduce the interface quickly.

They cannot instantly reproduce:

* years of verified admission history;
* years of source observations;
* search authority;
* subscriber relationships;
* operational knowledge of school sources.

Therefore development should prioritize **data accumulation and distribution assets**, not feature count.

---

# 44. Decision Hierarchy for Codex

When requirements are unclear, use this priority order:

1. **Accuracy**
2. **Admission schedule usefulness**
3. **Search discoverability**
4. **Alert conversion / repeat usage**
5. **Operational efficiency**
6. **Implementation simplicity**
7. Visual sophistication
8. Feature breadth

If an implementation decision sacrifices item 1–5 merely to improve item 7–8, it is probably the wrong decision.

---

# 45. Rules for Future Codex Work

Codex should follow these rules throughout the project.

### Rule 1

Do not add functionality that was not requested simply because it is common in SaaS products.

### Rule 2

Prefer a smaller reliable data model over speculative flexibility.

### Rule 3

Preserve source provenance for admission facts.

### Rule 4

Never present inferred dates as official dates.

### Rule 5

Do not auto-publish critical extracted information until the validation rules explicitly permit it.

### Rule 6

Do not generate indexable SEO pages without meaningful user value.

### Rule 7

Do not require account creation when email subscription is sufficient.

### Rule 8

Do not design around AI branding.

### Rule 9

Do not optimize architecture for hypothetical scale before actual traffic requires it.

### Rule 10

When uncertain whether a feature belongs in AdmissionRadar, ask:

> **Does this help a parent discover, understand, or avoid missing an admission event?**

If not, it likely does not belong in the core product.

---

# 46. Next Specification Documents

The next project documents should be produced in this order:

```text
00_PROJECT_CONTEXT.md
        ↓
01_PRD.md
        ↓
02_INFORMATION_ARCHITECTURE.md
        ↓
03_DOMAIN_MODEL.md
        ↓
04_DATA_MODEL.md
        ↓
05_COLLECTION_ARCHITECTURE.md
        ↓
06_SOURCE_AND_VERIFICATION_POLICY.md
        ↓
07_SEO_ARCHITECTURE.md
        ↓
08_ALERT_ARCHITECTURE.md
        ↓
09_ADMIN_OPERATIONS.md
        ↓
10_MVP_IMPLEMENTATION_PLAN.md
```

The PRD defines **what must be built**.

The IA defines **what pages and navigation exist**.

The domain/data model defines **how admission knowledge is represented**.

The collection architecture defines **how information enters the system**.

The verification policy defines **when information is trusted**.

The SEO architecture defines **how data becomes acquisition assets**.

The alert architecture defines **how traffic becomes an owned audience**.

The implementation plan defines **the order in which Codex should build everything**.

---

# 47. Final Product Principle

The most important strategic distinction is:

> **AdmissionRadar is not an alert service with school data attached.**

It is:

> **a continuously updated admission intelligence database that uses alerts to turn search traffic into a repeat audience.**

The database creates utility.

Search creates acquisition.

Alerts create retention.

Advertising monetizes attention.

Historical data compounds the moat.

That is AdmissionRadar.
