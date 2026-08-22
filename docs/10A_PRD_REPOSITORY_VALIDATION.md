# 10A PRD Repository Validation

> **Project:** PREPPY (프레피)  
> **Validation Target:** `docs/10_PRD.md`  
> **Validation Type:** Product contract ↔ validated architecture ↔ repository reality  
> **Date:** 2026-08-22  
> **Verdict:** `VALID_WITH_IMPLEMENTATION_NOTES`

---

# 1. Validation Scope and Evidence

이 문서는 `10_PRD.md`를 재설계하거나 구현 계획으로 확장하지 않는다. 최신 `One Pager.md`, `MVP.md`, `00_PRODUCT_REQUIREMENTS_BASELINE.md`, `01_EXISTING_ARCHITECTURE_AUDIT.md`, `02`–`09` Architecture와 `02A`–`09A` repository validation, 그리고 현재 repository의 route, package, config, schema, migration, test를 대조했다.

Evidence classification:

```text
DOCUMENTED       문서상 target contract
IMPLEMENTED      현재 repository에 구현
TESTED           자동화 검증 존재
NOT_IMPLEMENTED  target은 유효하나 runtime/schema 없음
NOT_FOUND        요구 capability/dependency/evidence 없음
NOT_VERIFIABLE   production/external 상태를 local repository로 판단 불가
```

Consistency classification:

```text
CONSISTENT
CONSISTENT_WITH_IMPLEMENTATION_NOTE
CONFLICT
MISSING_CRITICAL_REQUIREMENT
NOT_VERIFIABLE
```

`10_PRD.md`의 검증본은 3,314 lines, 45,092 bytes이며 검증 시 SHA-256은 `B7591ABC99A4043207B2E0600E25BCA9A270C2969EEDCDC321E76F5BD8E32B6C`였다.

---

# 2. Executive Verdict

**PRD: VALID_WITH_IMPLEMENTATION_NOTES**

`10_PRD.md`는 Product를 단순 정보 검색 사이트가 아니라 `Discover → Follow → Monitor → Notify → Return` 관계형 Monitoring product로 정의하며, One Pager/MVP/Baseline과 `02A`–`09A`에서 검증된 architecture contract를 일관되게 통합한다. Canonical domain, Native/Legacy bridge, verification, identity, Follow, notification, SEO, analytics, Admin/operations 경계에 PRD-level 충돌이나 launch-critical 누락은 발견되지 않았다.

현재 repository가 PRD를 구현했다는 뜻은 아니다. 구현된 것은 legacy trust/history schema, 일부 DB invariant, Admin actor/audit skeleton, Source monitoring primitives, basic Outbox skeleton, static liveness, migration/test 기반이다. Canonical target schema와 전체 Product runtime은 아직 `NOT_IMPLEMENTED`다.

| Decision | Result |
|---|---|
| Product/Architecture blocker | **NONE** |
| Required PRD amendment | **NONE** |
| Ready for API Contract | **YES** |
| Ready for Implementation Plan | **YES** |
| Production-ready now | **NO** |
| Required vertical slice | **SUPPORTED_AFTER_TARGET_IMPLEMENTATION** |

---

# 3. Product Definition and MVP Scope Consistency

| Area | PRD Contract | Evidence | Status |
|---|---|---|---|
| One-line definition | 영유·사립초·국제학교 입학정보 discovery + monitored updates | One Pager/MVP/Baseline | CONSISTENT |
| Primary user | 서울·경기, 4–8세 자녀, high-intent parent | One Pager/MVP/Baseline | CONSISTENT |
| Core problem | 정보 부재가 아니라 분산 Source 반복 확인 부담 | Baseline/Product decisions | CONSISTENT |
| Positioning | Information discovery에서 Monitoring relationship으로 전환 | 02–09 validated architecture | CONSISTENT |
| Product Loop | Discover→Compare→Follow→Monitor→Update→Return | Baseline/08 | CONSISTENT |
| Growth Loop | Search/community→Article→Institution/Opportunity→Follow→Kakao→Email→Return | 06/07/08 | CONSISTENT |
| North Star | Active Monitoring Parents | 08/08A | CONSISTENT |
| 30-day target | Qualified Sessions ≈ original Qualified Visitors 500, AMP 50+ | 08A normalization | CONSISTENT_WITH_IMPLEMENTATION_NOTE |
| P0 영유 | 강남·서초·송파 중심 20–30, year-round | One Pager/MVP/Baseline | CONSISTENT |
| P0 국제학교 | 서울·경기 주요 10–15, year-round | One Pager/MVP/Baseline | CONSISTENT |
| P1 서울 사립초 | DB/public/SEO/Follow, season-sensitive validation | One Pager/MVP/Baseline | CONSISTENT |
| Non-scope | app/push/Kakao message/AI/reviews/community/payment/crawler/warehouse 등 제외 | 02–09 | CONSISTENT |

`Qualified Visitors`는 원래 business target 문구이고 실제 GA4 measurement unit은 `Qualified Sessions`라는 사실을 sections 84, 136, 137이 명시한다. 이는 모순이 아니라 08A의 required labeling을 반영한 것이다.

---

# 4. Domain and Data Model Consistency

| Contract | Architecture Match | Repository Reality | Status |
|---|---|---|---|
| Institution canonical, School compatibility | 03/04의 additive 1:1 bridge | legacy `schools`; target Institution 없음 | CONSISTENT_WITH_IMPLEMENTATION_NOTE |
| Opportunity independent entity | 03/04의 canonical Opportunity | legacy `admission_events`; target 없음 | CONSISTENT_WITH_IMPLEMENTATION_NOTE |
| Native/Legacy-backed convergence | OpportunityChange consumer boundary | legacy history/evidence 기반 존재; bridge 없음 | CONSISTENT_WITH_IMPLEMENTATION_NOTE |
| Source/Evidence trust | 03–06의 official source/semantic verification | Sources, bindings, observations, evidence tables 구현 | CONSISTENT_WITH_IMPLEMENTATION_NOTE |
| InstitutionFact | selected verified facts/version/evidence | legacy admission facts; target fact 없음 | CONSISTENT_WITH_IMPLEMENTATION_NOTE |
| User != Kakao/Email | User/AuthIdentity/UserEmail separation | target tables/runtime 없음 | CONSISTENT_WITH_IMPLEMENTATION_NOTE |
| Follow targets Institution | Follow + FollowEpisode | legacy subscriber/subscription은 canonical 아님 | CONSISTENT_WITH_IMPLEMENTATION_NOTE |
| Notification != Email | Notification→Delivery→Attempt | legacy alert/delivery만 존재 | CONSISTENT_WITH_IMPLEMENTATION_NOTE |
| Article != truth source | Article acquisition asset + explicit relations | legacy guide/update만 존재 | CONSISTENT_WITH_IMPLEMENTATION_NOTE |
| Redirect/Outbox/Audit | target tables/transaction boundaries | Audit/basic Outbox 구현; redirect/hardening 없음 | CONSISTENT_WITH_IMPLEMENTATION_NOTE |

PRD는 `School`, `AdmissionEvent`, `Subscriber`, `Subscription`, `Alert`, `Guide/Update`를 신규 canonical object로 되살리지 않는다. Legacy-backed Opportunity만 명시적 compatibility path로 보존하며 canonical consumer는 `OpportunityChange`에서 수렴한다. 04/04A의 additive migration으로 표현 가능하다.

---

# 5. Monitoring, Identity, Notification Consistency

## 5.1 Monitoring

`Follow target = Institution`, `Monitoring target = SourceBinding`, `Change target = Opportunity/InstitutionFact`, `Notification target = User`가 05/05A와 일치한다. Queue는 `SourceMonitorConfig + SourceBinding + latest Observation + business state`로 query-driven이며 persistent `monitoring_tasks`를 요구하지 않는다. `ConfirmNoChange`는 Observation/Audit와 check projection만 갱신하고 Version/Change/Notification/SEO freshness를 만들지 않는다. Source failure는 truth를 바꾸지 않으며 backfill은 product signals를 emit하지 않는다.

**Status: CONSISTENT_WITH_IMPLEMENTATION_NOTE.** Source/Observation/config primitives는 일부 `IMPLEMENTED`; canonical command/query runtime은 `NOT_IMPLEMENTED`다.

## 5.2 Identity/Auth/Follow

Kakao Authorization Code, 별도 OAuth state, ephemeral signed/encrypted PendingFollowIntent, authenticated/encrypted HttpOnly session, protected request마다 `User.status=ACTIVE` 확인, required Terms/Privacy consent, optional Profile, optional Email, Consent/Preference 분리, FollowEpisode interval, reactivation/no-retroactive semantics가 07/07A와 일치한다. Scenario H가 delete/PII child physical removal, session denial, Follow close, pending delivery suppression을 보존한다.

**Status: CONSISTENT_WITH_IMPLEMENTATION_NOTE.** Admin auth env config 외 public auth/session/User/Follow는 `NOT_IMPLEMENTED`다.

## 5.3 Notification/Worker

Signal-time FollowEpisode eligibility와 send-time current eligibility를 분리하고, one Notification/signal-policy, one Delivery/Notification-User-Channel, append-only Attempts, suppression before provider, external send outside transaction을 요구한다. Single PostgreSQL Outbox + single worker의 recipient-resolution/send stages도 04A/05A/07A와 일치한다.

**Status: CONSISTENT_WITH_IMPLEMENTATION_NOTE.** Current Outbox는 status/available/attempt skeleton만 있고 dedupe, lease, max attempts, safe error, dead-letter, worker가 없다.

---

# 6. Content, SEO, Routes and Pages

## 6.1 Route Contract

| Route | Contract | Current Repository | Status |
|---|---|---|---|
| `/` | indexable Home | NOT_FOUND | CONSISTENT_WITH_IMPLEMENTATION_NOTE |
| `/institutions` | SSR list/filter/search; arbitrary filters noindex | NOT_FOUND | CONSISTENT_WITH_IMPLEMENTATION_NOTE |
| `/institutions/{slug}` | canonical verified detail + Institution Follow | NOT_FOUND | CONSISTENT_WITH_IMPLEMENTATION_NOTE |
| `/opportunities/{slug}` | actionable detail; CTA follows Institution | NOT_FOUND | CONSISTENT_WITH_IMPLEMENTATION_NOTE |
| `/articles/{slug}` | sanitized acquisition content + relations | NOT_FOUND | CONSISTENT_WITH_IMPLEMENTATION_NOTE |
| `/my-preppy` | private, dynamic/no shared cache, noindex | NOT_FOUND | CONSISTENT_WITH_IMPLEMENTATION_NOTE |
| `/auth/kakao/start` | public auth start | NOT_FOUND | CONSISTENT_WITH_IMPLEMENTATION_NOTE |
| `/auth/kakao/callback` | state-validated callback | NOT_FOUND | CONSISTENT_WITH_IMPLEMENTATION_NOTE |
| `/privacy`, `/terms` | required legal routes | NOT_FOUND | CONSISTENT_WITH_IMPLEMENTATION_NOTE |
| `/admin/*` | private Admin namespace | NOT_FOUND | CONSISTENT_WITH_IMPLEMENTATION_NOTE |
| `/api/health` | low-information liveness | static 200 route | CONSISTENT / IMPLEMENTED+TESTED |

Namespace conflict는 없다. Current App Router route는 `/api/health` 하나뿐이다.

## 6.2 Rendering and SEO Contract

Public core content는 Next.js 16 Server Components initial HTML, shared public cache, personalized Follow client/private island로 분리한다. My Preppy/Admin은 private dynamic/no shared cache다. Public과 indexable을 분리하고, self-canonical, single sitemap, page-level noindex, selective JSON-LD, semantic freshness, explicit permanent redirects, server-side sanitization을 요구한다. Cache revalidation은 domain commit 후 dedicated Outbox → worker → protected same-app Route Handler이고 failure가 truth를 rollback하지 않는다.

**Status: CONSISTENT_WITH_IMPLEMENTATION_NOTE.** 06/06A와 일치하지만 public pages, Cache Components policy, metadata/sitemap/robots, sanitizer, redirects, revalidation handler는 모두 `NOT_IMPLEMENTED`다.

---

# 7. Functional Requirement Coverage

모든 57개 FR이 고유하고 선행 architecture에 trace된다. 아래 `Target support`는 architecture feasibility이며 current implementation 완료를 뜻하지 않는다.

| Requirement | Architecture Source | Repository / Target Support | Status | Note |
|---|---|---|---|---|
| FR-PUB-001 | 02,06 | target public Server Home; current absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | hero/value/entries 구현 필요 |
| FR-PUB-002 | 02,03,06 | Institution query model feasible; absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | filters/search/indexability 분리 |
| FR-PUB-003 | 03–06 | verified projection feasible; absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | official Source/Last Verified semantic |
| FR-PUB-004 | 03–06 | Opportunity projection feasible; absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | Follow target Institution |
| FR-PUB-005 | 06 | target Article/relations; absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | sanitized server content |
| FR-PUB-006 | 02,06 | public/private boundary documented; absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | login 없이 core access |
| FR-AUTH-001 | 07 | PendingFollowIntent + Kakao target; absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | OAuth state와 분리 |
| FR-AUTH-002 | 07 | session User ACTIVE resolution; absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | existing ACTIVE only |
| FR-AUTH-003 | 07 | PENDING→consent→ACTIVE target; absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | Terms/Privacy required |
| FR-AUTH-004 | 07 | nullable Profile target; absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | Follow 차단 금지 |
| FR-FOL-001 | 03,04,07 | User–Institution Follow target; absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | followability check |
| FR-FOL-002 | 04,07 | unique Follow/open Episode target; absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | transition-aware callback |
| FR-FOL-003 | 07 | deactivate/close episode target; absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | global preference 유지 |
| FR-FOL-004 | 07 | reactivate/new episode target; absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | inactive gap 보존 |
| FR-MYP-001 | 07 | Follow projection target; absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | private/noindex |
| FR-MYP-002 | 03,07 | followed Institution Opportunity join; absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | current/upcoming policy |
| FR-MYP-003 | 03,05,07 | OpportunityChange projection; absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | Native/Legacy 동일 |
| FR-MYP-004 | 05–07 | Source/verified projection supported; absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | timestamps 구분 |
| FR-MYP-005 | 07 | Email+consent+preference projection; absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | AMP와 동일 effective rule |
| FR-MYP-006 | 07 | Profile/interests target; absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | 최소 개인정보 |
| FR-MON-001 | 05,09 | query-driven queue supported; runtime absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | no monitoring_tasks |
| FR-MON-002 | 05 | Observation/Audit primitives partly exist | CONSISTENT_WITH_IMPLEMENTATION_NOTE | no truth mutation |
| FR-MON-003 | 03–05,09 | target command feasible; absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | lock/version/evidence/change |
| FR-MON-004 | 03–05,09 | legacy version/evidence base exists | CONSISTENT_WITH_IMPLEMENTATION_NOTE | canonical Change bridge required |
| FR-MON-005 | 03–05 | target InstitutionFact feasible; absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | selected fact types only |
| FR-MON-006 | 05 | observation health semantics supported | CONSISTENT_WITH_IMPLEMENTATION_NOTE | no false truth/cancel |
| FR-NOT-001 | 03–05,07 | target Notification unique; absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | material signal only |
| FR-NOT-002 | 04,07 | FollowEpisode interval target; absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | signal-time eligibility |
| FR-NOT-003 | 07 | current-state recheck target; worker absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | provider 직전 |
| FR-NOT-004 | 04,07 | target DB unique; legacy pattern exists | CONSISTENT_WITH_IMPLEMENTATION_NOTE | logical Delivery dedupe |
| FR-NOT-005 | 04,07 | Attempt append model target; absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | Delivery 복제 금지 |
| FR-NOT-006 | 07 | suppression transition target; absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | provider call 없음 |
| FR-NOT-007 | 04,05,07 | silent migration contract | CONSISTENT_WITH_IMPLEMENTATION_NOTE | import signal off |
| FR-SEO-001 | 06 | Next Server Components supported; absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | core initial HTML |
| FR-SEO-002 | 06 | central builders feasible; absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | canonical/robots shared policy |
| FR-SEO-003 | 06 | native sitemap feasible; absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | canonical/indexable only |
| FR-SEO-004 | 06 | selective JSON-LD target; absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | Event overuse 금지 |
| FR-SEO-005 | 03,04,06 | explicit relation target; absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | bidirectional links |
| FR-SEO-006 | 04,06 | url_redirects target; absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | explicit slug command |
| FR-SEO-007 | 06,09 | authenticated/noindex preview; absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | sanitized representation |
| FR-SEO-008 | 06,09 | server sanitizer required; dependency absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | publish boundary |
| FR-ANA-001 | 08 | typed event registry target; absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | 18 canonical events |
| FR-ANA-002 | 08 | post-commit transition event; absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | click != success |
| FR-ANA-003 | 07,08 | privacy classification documented | CONSISTENT_WITH_IMPLEMENTATION_NOTE | raw query/PII 금지 |
| FR-ANA-004 | 04,08 | target SQL metrics feasible; tables absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | AMP/Average Follow DB truth |
| FR-ANA-005 | 08,09 | Noop/separate config target; absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | production pollution 차단 |
| FR-ANA-006 | 08 | best-effort failure boundary | CONSISTENT_WITH_IMPLEMENTATION_NOTE | product non-blocking |
| FR-ADM-001 | 02,07,09 | admin_users/env base; session/routes absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | public User와 namespace 분리 |
| FR-ADM-002 | 02,05,09 | command architecture documented; absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | direct CRUD 금지 |
| FR-ADM-003 | 03–05,09 | audit_logs implemented; command atomicity absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | safe metadata/correlation |
| FR-ADM-004 | 05,09 | source primitives exist; UI/query absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | due/overdue projection |
| FR-ADM-005 | 06,09 | Article CMS target; absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | sanitize/preview/relations |
| FR-ADM-006 | 07,09 | notification ops target; absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | no mass composer |
| FR-ADM-007 | 05,09 | basic Outbox exists; hardening/UI absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | no payload edit/blind rerun |
| FR-ADM-008 | 07,09 | PII-safe support target; absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | exact lookup audited |
| FR-ADM-009 | 04–06,09 | integrity queries feasible; absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | canonical schema prerequisite |
| FR-ADM-010 | 05,09 | public liveness exists; admin health absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | external process monitor 별도 |

No FR conflict, duplicate semantic owner, or missing launch-critical group was found. Account deletion is normatively covered by Scenario H even though it is not assigned a standalone FR identifier; preserve it in API/implementation traceability.

---

# 8. Non-functional Requirement Coverage

| Requirement | Architecture / Repository Evidence | Status | Note |
|---|---|---|---|
| NFR-INT-001 | 04 target partial unique; legacy equivalent tested | CONSISTENT_WITH_IMPLEMENTATION_NOTE | Native table pending |
| NFR-INT-002 | lineage model; legacy successor trigger/test | CONSISTENT_WITH_IMPLEMENTATION_NOTE | target migration required |
| NFR-INT-003 | Source ownership FKs/evidence contract | CONSISTENT_WITH_IMPLEMENTATION_NOTE | target bridges pending |
| NFR-INT-004 | target unique User–Institution Follow | CONSISTENT_WITH_IMPLEMENTATION_NOTE | absent |
| NFR-INT-005 | target one-open Episode partial unique | CONSISTENT_WITH_IMPLEMENTATION_NOTE | absent |
| NFR-INT-006 | target Notification/Delivery uniques; legacy dedupe exists | CONSISTENT_WITH_IMPLEMENTATION_NOTE | canonical absent |
| NFR-INT-007 | 03–05/09 atomic command contract | CONSISTENT_WITH_IMPLEMENTATION_NOTE | service runtime absent |
| NFR-SEC-001 | 07 encrypted/authenticated HttpOnly cookie | CONSISTENT_WITH_IMPLEMENTATION_NOTE | session absent |
| NFR-SEC-002 | 07 OAuth state contract | CONSISTENT_WITH_IMPLEMENTATION_NOTE | Kakao runtime absent |
| NFR-SEC-003 | allowlisted return path contract | CONSISTENT_WITH_IMPLEMENTATION_NOTE | handler absent |
| NFR-SEC-004 | separate admin root/public User target | CONSISTENT_WITH_IMPLEMENTATION_NOTE | runtime guards absent |
| NFR-SEC-005 | 07/08/09 PII classifications | CONSISTENT_WITH_IMPLEMENTATION_NOTE | logging layer absent |
| NFR-SEC-006 | 06 server sanitizer contract | CONSISTENT_WITH_IMPLEMENTATION_NOTE | dependency/runtime absent |
| NFR-SEC-007 | server-only env contract | CONSISTENT_WITH_IMPLEMENTATION_NOTE | provider clients absent |
| NFR-REL-001 | Outbox/provider boundary documented | CONSISTENT_WITH_IMPLEMENTATION_NOTE | worker absent |
| NFR-REL-002 | current basic Outbox lacks lease/dead-letter | CONSISTENT_WITH_IMPLEMENTATION_NOTE | hardening required |
| NFR-REL-003 | lease recovery target | CONSISTENT_WITH_IMPLEMENTATION_NOTE | worker absent |
| NFR-REL-004 | verification commit then provider | CONSISTENT_WITH_IMPLEMENTATION_NOTE | runtime absent |
| NFR-REL-005 | dedicated post-commit revalidation event | CONSISTENT_WITH_IMPLEMENTATION_NOTE | handler/worker absent |
| NFR-REL-006 | 08 direct best-effort after commit | CONSISTENT | analytics outage non-blocking |
| NFR-SEO-001 | 06 Server Components initial HTML | CONSISTENT_WITH_IMPLEMENTATION_NOTE | pages absent |
| NFR-SEO-002 | shared indexability/sitemap policy | CONSISTENT_WITH_IMPLEMENTATION_NOTE | sitemap absent |
| NFR-SEO-003 | semantic timestamps/no-change rule | CONSISTENT_WITH_IMPLEMENTATION_NOTE | renderers absent |
| NFR-SEO-004 | url_redirects + resolver policy | CONSISTENT_WITH_IMPLEMENTATION_NOTE | absent |
| NFR-SEO-005 | programmatic SEO explicit non-scope | CONSISTENT | not required |
| NFR-OPS-001 | 09/09A launch gate; local volume only | CONSISTENT_WITH_IMPLEMENTATION_NOTE | external proof required |
| NFR-OPS-002 | 09/09A external monitoring gate | CONSISTENT_WITH_IMPLEMENTATION_NOTE | NOT_FOUND |
| NFR-OPS-003 | env kill switches target | CONSISTENT_WITH_IMPLEMENTATION_NOTE | absent |
| NFR-OPS-004 | test DB guard tested; adapters absent | CONSISTENT_WITH_IMPLEMENTATION_NOTE | default-deny side effects |
| NFR-OPS-005 | static `/api/health` 200 + unit test | CONSISTENT / IMPLEMENTED+TESTED | keep low-information |

---

# 9. Analytics and KPI Audit

| Metric | Definition / Source | Verdict | Limitation |
|---|---|---|---|
| Qualified Sessions | GA4 sessions with Article/Institution/Opportunity detail or search/filter | CONSISTENT | original “Visitors 500” target must display session-based label |
| AMP | ACTIVE User + active Follow + usable Email + service consent + Email preference | CONSISTENT | PostgreSQL operational truth after target schema |
| Average Follow | active Follows owned by AMP / AMP | CONSISTENT | denominator is AMP, not all users |
| Detail→Follow | sessions with follow_click / sessions with Institution or Opportunity detail | CONSISTENT | click is intent, not Follow success |
| Signup Completion | signup_complete / signup_start, new-user path | CONSISTENT | retries/existing users excluded |
| Email Open | unique opened Deliveries / sent Deliveries | CONSISTENT | privacy/provider effects make it directional |
| Email CTR | unique clicked Deliveries / sent Deliveries | CONSISTENT | provider reconciliation needed |
| 14-Day Returning | first Follow cohort, meaningful return day 1–14 | CONSISTENT_WITH_IMPLEMENTATION_NOTE | behavioral estimate, incomplete cross-device/consent coverage |
| Organic AMP | organic-attributed conversion cohort + current DB AMP trend | CONSISTENT_WITH_IMPLEMENTATION_NOTE | approximate trend without warehouse |

Canonical server successes are emitted transition-aware and best-effort **after commit** for MVP. Analytics does not share an operational notification Outbox row and failure never blocks Product action. PostgreSQL, GA4, GSC, and Email provider retain separate truth ownership.

Expansion gate `AMP≥100`, `Detail→Follow≥10%`, `Average Follow≥2`, `Email Open≥45%`, `14-Day Returning≥25%`, positive Organic AMP trend is measurable after target implementation. The last two remain observational/approximate and must be labeled as such; this is an implementation/dashboard note, not a PRD amendment.

---

# 10. Launch Gate Audit

No listed launch-gate item is optional. `ALREADY_IMPLEMENTED` is reserved for a gate fully satisfied now; partial primitives do not qualify.

## 10.1 Product

| Item | Status | Evidence / Required Proof |
|---|---|---|
| Home | TARGET_IMPLEMENTATION_REQUIRED | no route |
| Institution list/detail | TARGET_IMPLEMENTATION_REQUIRED | canonical schema/DAL/routes absent |
| Opportunity detail | TARGET_IMPLEMENTATION_REQUIRED | canonical projection/route absent |
| Article detail | TARGET_IMPLEMENTATION_REQUIRED | Article schema/CMS/route absent |
| Follow flow | TARGET_IMPLEMENTATION_REQUIRED | User/Follow/session absent |
| Kakao signup | TARGET_IMPLEMENTATION_REQUIRED | OAuth runtime/config absent |
| My Preppy | TARGET_IMPLEMENTATION_REQUIRED | private route/projection absent |
| Monitoring Queue | TARGET_IMPLEMENTATION_REQUIRED | source primitives only |
| Native/legacy verification | TARGET_IMPLEMENTATION_REQUIRED | application commands/bridge absent |
| Email delivery | TARGET_IMPLEMENTATION_REQUIRED | canonical notification/worker/provider absent |
| Admin operations | TARGET_IMPLEMENTATION_REQUIRED | admin runtime absent |

## 10.2 Data

| Item | Status | Evidence / Required Proof |
|---|---|---|
| Institution seed coverage | EXTERNAL_PRODUCTION_VALIDATION_REQUIRED | actual production data unknown |
| Active official Sources | EXTERNAL_PRODUCTION_VALIDATION_REQUIRED | current local schema cannot prove live URL coverage |
| Verified Opportunities | EXTERNAL_PRODUCTION_VALIDATION_REQUIRED | production truth/evidence unknown |
| Article content | EXTERNAL_PRODUCTION_VALIDATION_REQUIRED | production corpus unknown |
| No blocking duplicate slug | EXTERNAL_PRODUCTION_VALIDATION_REQUIRED | migration preflight required |
| No current-version anomaly | EXTERNAL_PRODUCTION_VALIDATION_REQUIRED | target schema + post-migration query required |
| No accidental backfill signals | TARGET_IMPLEMENTATION_REQUIRED | silent import mode/tests absent |

## 10.3 Security

| Item | Status | Evidence / Required Proof |
|---|---|---|
| Public User auth | TARGET_IMPLEMENTATION_REQUIRED | absent |
| Admin auth | TARGET_IMPLEMENTATION_REQUIRED | env validation only; session/guard absent |
| Session separation | TARGET_IMPLEMENTATION_REQUIRED | both runtimes absent |
| OAuth state validation | TARGET_IMPLEMENTATION_REQUIRED | absent |
| No PII logs | TARGET_IMPLEMENTATION_REQUIRED | structured logging/redaction absent |
| Sanitizer | TARGET_IMPLEMENTATION_REQUIRED | package/runtime absent |
| Secure secrets | EXTERNAL_PRODUCTION_VALIDATION_REQUIRED | hosting/TLS/secret storage not verifiable locally |

## 10.4 Reliability

| Item | Status | Evidence / Required Proof |
|---|---|---|
| Hardened Outbox | TARGET_IMPLEMENTATION_REQUIRED | basic skeleton lacks dedupe/lease/dead-letter |
| Worker | TARGET_IMPLEMENTATION_REQUIRED | process absent |
| Retry/dead-letter | TARGET_IMPLEMENTATION_REQUIRED | lifecycle/ops absent |
| Provider send safety | TARGET_IMPLEMENTATION_REQUIRED | adapter/idempotency absent |
| Delivery dedupe | TARGET_IMPLEMENTATION_REQUIRED | canonical Delivery absent |
| Send-time recheck | TARGET_IMPLEMENTATION_REQUIRED | worker absent |
| Email kill switch | TARGET_IMPLEMENTATION_REQUIRED | config absent |

## 10.5 Operations

| Item | Status | Evidence / Required Proof |
|---|---|---|
| Admin queue | TARGET_IMPLEMENTATION_REQUIRED | query/UI absent |
| Dead-letter operations | TARGET_IMPLEMENTATION_REQUIRED | hardening/Admin absent |
| Automated backup/retention | EXTERNAL_PRODUCTION_VALIDATION_REQUIRED | named local volume is not backup |
| Restore runbook/drill evidence | EXTERNAL_PRODUCTION_VALIDATION_REQUIRED | no procedure/evidence |
| External error/uptime/process monitoring | EXTERNAL_PRODUCTION_VALIDATION_REQUIRED | vendor/deployment absent |
| Health | TARGET_IMPLEMENTATION_REQUIRED | public liveness exists; Admin DB/Outbox health absent |
| Migration runbook | TARGET_IMPLEMENTATION_REQUIRED | scripts exist; preflight/backup/cutover/post-check absent |

## 10.6 SEO

| Item | Status | Evidence / Required Proof |
|---|---|---|
| Server-rendered public pages | TARGET_IMPLEMENTATION_REQUIRED | absent |
| Metadata/canonical | TARGET_IMPLEMENTATION_REQUIRED | absent |
| Single sitemap | TARGET_IMPLEMENTATION_REQUIRED | absent |
| Robots/page-level noindex | TARGET_IMPLEMENTATION_REQUIRED | absent |
| Private/draft exclusion | TARGET_IMPLEMENTATION_REQUIRED | routes/policy absent |
| Redirect safety | TARGET_IMPLEMENTATION_REQUIRED | target table/resolver absent |
| Sanitizer | TARGET_IMPLEMENTATION_REQUIRED | absent |
| Structured internal links | TARGET_IMPLEMENTATION_REQUIRED | target relations absent |

## 10.7 Analytics

| Item | Status | Evidence / Required Proof |
|---|---|---|
| Typed event registry | TARGET_IMPLEMENTATION_REQUIRED | no analytics module/dependency |
| Production GA4 config | EXTERNAL_PRODUCTION_VALIDATION_REQUIRED | property/stream not verifiable |
| Non-prod isolation | TARGET_IMPLEMENTATION_REQUIRED | Noop/separate config absent |
| Critical server success events | TARGET_IMPLEMENTATION_REQUIRED | application transitions absent |
| AMP SQL metric | TARGET_IMPLEMENTATION_REQUIRED | canonical User/Follow data absent |

---

# 11. Production Launch Blockers

PRD sections 140–146 correctly retain all five 09A blockers: Admin auth/session, backup/restore evidence, hardened Outbox + worker, external observability, and non-production side-effect isolation. Whole-chain review adds the following current-repository gaps; these are delivery blockers, not Product/Architecture blockers:

1. Canonical Institution/Opportunity/User/Follow/Notification/Article schema, bridges, additive migrations, data preflight/backfill and invariants.
2. Public Server Component pages/DAL, private Follow island, legal pages, Kakao auth/session and My Preppy.
3. Typed Admin command/query runtime with row locks, Version/Evidence/Change/Audit/Outbox atomicity and PII-safe support paths.
4. Canonical notification/delivery/attempt model, hardened Outbox, lease-recoverable worker, provider adapter, send-time suppression and kill switches.
5. Article CMS, server sanitizer, preview, relations, redirect resolver, sitemap/robots/metadata and post-commit cache revalidation.
6. Typed analytics registry/adapters, transition-aware server events, GA4 production config, non-prod isolation and KPI queries.
7. Production data quality proof, secure secret/TLS setup, automated backup retention, successful restore drill, migration runbook, structured logging/error monitoring/external uptime and worker process monitoring.

---

# 12. Required Vertical Slice

**Verdict: SUPPORTED_AFTER_TARGET_IMPLEMENTATION**

| Step | Dependency | Current Status |
|---|---|---|
| Article acquisition | Article schema/CMS/sanitizer/public SSR/relations | NOT_IMPLEMENTED |
| Institution discovery | canonical Institution + School bridge + public DAL/page | NOT_IMPLEMENTED |
| Follow click | Follow client island + allowlisted attribution | NOT_IMPLEMENTED |
| Kakao activation | PendingFollowIntent, OAuth state, User/consent/session | NOT_IMPLEMENTED |
| My Preppy | private session guard + Follow/Opportunity/Change projection | NOT_IMPLEMENTED |
| Admin Source Check | Admin auth + query-driven queue + Source observation | PARTIAL PRIMITIVES ONLY |
| Verify Change | command + lock + Version/Evidence/Change/Audit/Outbox transaction | NOT_IMPLEMENTED |
| Outbox processing | hardening + SKIP LOCKED lease recovery + worker | NOT_IMPLEMENTED |
| Email | recipient resolution + Delivery/Attempt + recheck + provider | NOT_IMPLEMENTED |
| Return measurement | deep link + notification events + GA4/DB attribution | NOT_IMPLEMENTED |

No architectural dead end exists. The slice can be implemented in the same Next.js/PostgreSQL repository without Kafka, microservices, crawler, warehouse, mobile app or KakaoTalk message.

---

# 13. Acceptance Scenario Audit

## 13.1 Scenarios A–L

| Scenario | Status | Dependency / Note |
|---|---|---|
| A Organic Article→First Follow | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | Article relations, Kakao, consent, Follow, My Preppy, analytics |
| B Existing User Adds Institution | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | ACTIVE session, idempotent Follow, transition-aware additional_follow |
| C New Native Opportunity | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | native schema, verification command, signal, worker/provider |
| D Legacy Deadline Change | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | legacy bridge to canonical OpportunityChange |
| E No Change | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | observation/audit only; regression tests required |
| F Follow After Change | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | FollowEpisode interval query prevents retroactive email |
| G Email OFF Before Send | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | immediate eligibility recheck→SUPPRESSED |
| H User Delete | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | DELETED/session deny/PII child delete/closures/suppression |
| I Source Failure | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | health observation without truth mutation |
| J Worker Crash | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | lease expiry/recovery and idempotent retry |
| K Article Publish | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | sanitize/relations/publish/audit then revalidation |
| L Backfill | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | separate import mode with product signals disabled |

## 13.2 AC-001–AC-015

| Acceptance Criterion | Status | Verification Needed |
|---|---|---|
| AC-001 Value Comprehension | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | Home UX/content test |
| AC-002 Discovery | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | seeded search/filter journey test |
| AC-003 Trust | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | Source/Last Verified projection test |
| AC-004 Follow | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | anonymous + authenticated E2E |
| AC-005 Signup | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | optional Profile skip E2E |
| AC-006 My Preppy | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | private projection E2E |
| AC-007 Monitoring | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | No Change/Change command integration |
| AC-008 Verification | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | Version/Evidence/lineage transaction tests |
| AC-009 Notification | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | eligible single-email integration/E2E |
| AC-010 Suppression | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | preference/status race tests |
| AC-011 Backfill | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | zero-signal migration test |
| AC-012 SEO | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | rendered HTML/canonical/sitemap tests |
| AC-013 Admin Safety | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | guarded route→command tests; no CRUD bypass |
| AC-014 Recovery | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | crash/lease/provider timeout/dedupe tests |
| AC-015 Analytics | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | click vs committed Follow event tests |

No scenario or AC is blocked by an unresolved Product/Architecture decision. None is implemented end-to-end today.

---

# 14. MVP Non-Scope and Legacy Contamination Audit

| Risk | Result | Evidence |
|---|---|---|
| Full-auto crawler becomes launch dependency | CLEAR | Manual-first; collector automation P2 |
| Push/KakaoTalk notification implied | CLEAR | MVP channel EMAIL only |
| AI/recommendation/consulting implied | CLEAR | explicit non-scope/P2 boundary |
| Data warehouse required by KPIs | CLEAR | GA4/GSC/provider + DB; Organic AMP approximate |
| Complex RBAC required | CLEAR | one internal Admin role MVP |
| Programmatic SEO required | CLEAR | explicit non-scope; no thin pages |
| Family/multi-child entity required | CLEAR | optional minimal Profile only |
| School is sole canonical Institution | CLEAR | compatibility bridge only |
| AdmissionEvent is sole Opportunity | CLEAR | Native/Legacy-backed canonical Opportunity |
| Subscriber/Email is User identity | CLEAR | separate User/AuthIdentity/UserEmail |
| Subscription is Follow | CLEAR | new Follow/Episode model |
| Alert is canonical Notification | CLEAR | legacy write path rejected |
| Guide/Update is canonical content | CLEAR | unified Article model |

PRD가 과도하게 요구하는 MVP scope는 발견되지 않았다. WYSIWYG/HTML/preview, Admin operations, backup/observability는 넓어 보이지만 각각 acquisition safety, manual-first operations, production recoverability에 직접 필요한 P0다. 기존 `10_MVP_IMPLEMENTATION_PLAN.md`와 `11_IMPLEMENTATION_DECISIONS.md`는 현재 repository의 legacy documentation이며, 새 API Contract/Implementation Plan이 작성될 때 최신 Product Decision→PRD→validated architecture hierarchy를 명시적으로 따라야 한다.

---

# 15. Repository Reality Summary

## Implemented / Tested

- Next.js 16.3, React 19, TypeScript, Drizzle/PostgreSQL, Zod 기반.
- `/api/health` static low-information 200 route와 unit test.
- Legacy `schools`, admission cycles/events/facts, version lineage/evidence, sources/bindings/config/snapshots/observations/changes.
- `admin_users`, `audit_logs`, legacy subscriber/subscription/alert/delivery, basic `outbox_events` skeleton.
- Unique/check/FK/partial index와 lineage/current-version trigger를 다루는 migrations/integration tests.
- Test database safety, connection/migration scripts, local PostgreSQL Docker configuration.

## Documented but Not Implemented

- Canonical Institution/Opportunity/InstitutionFact/OpportunityChange bridges and migrations.
- User/AuthIdentity/UserEmail/Profile/Consent/Preference/Follow/FollowEpisode.
- Notification/Delivery/Attempt and hardened Outbox worker.
- Public routes, Kakao auth, My Preppy, Admin runtime/UI, application commands/queries.
- Article CMS/public rendering, sanitization, metadata/sitemap/robots/redirect/revalidation.
- Analytics registry/adapters/GA4/GSC integration and KPI queries.
- Email provider integration, backup/restore, deployment/CI evidence, structured observability and external uptime/process monitoring.

Package/config evidence confirms there are no auth/OAuth, analytics, editor/sanitizer, email provider or observability dependencies. `.env.example` has only database/base URL/Admin auth settings plus unused future integration placeholders; Kakao/session/GA4/kill-switch configuration is absent.

---

# 16. Implementation Notes

1. Treat the canonical target schema as additive: preflight → add/bridge → silent backfill → validate invariants → cut over; never rewrite legacy tables into canonical meaning in place.
2. Carry Scenario H account deletion into API Contract traceability even though no standalone FR ID exists; child PII is physically removed while opaque operational history may remain.
3. Keep PendingFollowIntent and OAuth state separate, use distinct public/Admin cookie names and keys, and check DB status on every protected request.
4. Implement verification as typed commands owning row locks, transaction, history, Evidence, canonical Change, PII-safe Audit and required Outbox. No network call in that transaction.
5. Harden Outbox before notification retry/dead-letter Admin: unique dedupe, attempts/max attempts, available time, lock/lease recovery, safe error, dead-letter and `FOR UPDATE SKIP LOCKED` worker.
6. Server-sanitize both preview and publish; keep public initial HTML cacheable while Follow state is isolated. Use semantic verified/published timestamps, not generic `updated_at`.
7. Emit analytics conversions transition-aware and best-effort after commit. Keep `Qualified Sessions`, observational 14-day return and approximate Organic AMP labels visible.
8. Default non-production provider and analytics adapters to Noop/blocked, add Email/Worker/Analytics switches, and keep public health low-information.

---

# 17. PRD Amendment Candidates

**NONE.**

There is no `CONFLICT` or `MISSING_CRITICAL_REQUIREMENT` requiring `10_PRD.md` modification. All identified gaps are implementation, production evidence, or traceability notes. Provider/library/vendor choices in section 154 remain intentionally open and do not block the next documents.

---

# 18. Required Questions

| Question | Answer |
|---|---|
| Q1. Validated Architecture와 일관적인가? | **YES_WITH_IMPLEMENTATION_NOTES** |
| Q2. PRD amendment가 필요한가? | **NO** |
| Q3. MVP Scope가 One Pager/MVP/Baseline과 일치하는가? | **YES** |
| Q4. 모든 P0 Domain/Architecture contract가 반영됐는가? | **YES**. Delete semantics는 Scenario H로 포함되며 API traceability 필요 |
| Q5. Launch Gate가 current production gaps를 정확히 포함하는가? | **YES**. 09A의 5개 blocker와 전체 product/data/security/reliability/ops/SEO/analytics gaps 포함 |
| Q6. Product Analytics KPI 정의에 모순이 있는가? | **NO**. Visitors target은 Qualified Sessions로 명시 정규화 |
| Q7. Legacy model contamination이 남아 있는가? | **NO**. 명시적 compatibility bridge만 존재 |
| Q8. Vertical Slice가 target architecture로 구현 가능한가? | **YES**, after target implementation |
| Q9. MVP보다 과도한 scope가 있는가? | **NO** |
| Q10. Launch-critical requirement 누락이 있는가? | **NO** |
| Q11. API Contract와 Implementation Plan으로 진행 가능한가? | **YES** |

---

# 19. PRD Repository Validation Verdict

**PRD:**  
VALID_WITH_IMPLEMENTATION_NOTES

**Ready for API Contract:**  
YES

**Ready for Implementation Plan:**  
YES

**Product/Architecture Blockers:**  
NONE

**Required PRD Amendments:**  
NONE

**Implementation Notes:**  
Canonical additive schema/bridges, public/auth/Follow/Admin/CMS/SEO/analytics runtimes, notification model, hardened Outbox/worker and production operations must be implemented. Preserve deletion traceability, silent backfill, semantic freshness, transition-aware analytics and strict private/public boundaries.

**Validated MVP Scope:**  
P0 영유 20–30 and 서울·경기 주요 국제학교 10–15; P1 서울 주요 사립초; Institution Follow-based manual-first Monitoring; EMAIL notification; Article acquisition; one internal Admin role. Explicit non-scope remains excluded.

**Production Launch Blockers:**  
Canonical schema/data migration and validation; complete public/Auth/Follow/My Preppy/Admin/CMS/SEO/analytics runtime; Admin auth/session; hardened Outbox and worker; Email provider safety; non-prod side-effect isolation; secure production configuration; backup/restore drill; migration runbook; external observability; production data-quality proof.

**Vertical Slice:**  
SUPPORTED_AFTER_TARGET_IMPLEMENTATION

**Highest Delivery Risks:**

1. Admin/verification or migration code bypasses canonical Version/Evidence/Change/Audit/Outbox invariants and produces false truth or live backfill signals.
2. Worker/provider retry races bypass signal-time/send-time eligibility or idempotency and send duplicate or ineligible Email.
3. Product ships without restore evidence, external observability, production data-quality proof, or safe environment isolation, making incorrect data and outages hard to detect or recover.

**Recommended Next Step:**

```text
11_API_CONTRACT.md
then
12_IMPLEMENTATION_PLAN.md
```
