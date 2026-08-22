# PREPPY Analytics Architecture Repository Validation

## 0. Purpose, Scope, and Evidence

이 문서는 `docs/08_ANALYTICS_ARCHITECTURE.md`를 다시 설계하지 않는다. 08의 Acquisition → Follow → Monitoring → Notification → Return 측정 계약을 현재 Next.js runtime, package/config, target User/Follow/Notification model, Outbox, route tree와 test harness에 대조한다.

검증 근거:

- 문서: 요청된 One Pager부터 `08_ANALYTICS_ARCHITECTURE.md`까지
- runtime/config: `package.json`, `next.config.ts`, `.env.example`, `src/config/env.ts`
- routes: `app/api/health/route.ts`와 현재 app tree
- DB: `src/db/schema/index.ts`, migrations, 04/04A target tables, 05/05A Outbox contract
- tests: current Vitest/PostgreSQL unit/integration harness

분류는 `DOCUMENTED`, `IMPLEMENTED`, `TESTED`, `NOT_IMPLEMENTED`, `NOT_FOUND`, `NOT_VERIFIABLE`을 사용한다. 판정은 `SUPPORTED`, `SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT`, `CONFLICT`, `NOT_IMPLEMENTED`, `NOT_FOUND`, `NOT_VERIFIABLE`이다. 08 자체 변경이 필요할 때만 `CONFLICT`다.

## 1. Executive Verdict

**Architecture: VALID_WITH_IMPLEMENTATION_ADJUSTMENTS**

08은 현재 repository와 구조적으로 호환된다. PostgreSQL operational truth, GA4 behavioral observation, GSC search visibility의 분리는 target schema와 Next.js boundary에서 구현 가능하다. AMP, Average Follow, Notification delivery, DB indexability는 warehouse 없이 PostgreSQL query로 계산할 수 있다. 현재 GA4/GTM/GSC/analytics runtime은 전혀 없으므로 모든 instrumentation은 후속 구현 대상이다.

Architecture blocker와 required amendment는 없다. 주요 implementation adjustment는 다음이다.

1. 중앙 typed event registry와 Noop/Test adapter를 provider wiring보다 먼저 만든다.
2. Client click/view와 committed server transition을 별도 owner/event로 유지한다.
3. Critical conversion은 MVP에서 transition-aware commit 후 best-effort 전송한다. 현재 Outbox를 즉시 analytics queue로 강제하지 않는다.
4. 동일 User의 서로 다른 Institution 동시 Follow에서도 `additional_follow`가 정확하도록 User row를 먼저 lock한다.
5. 14-day returning은 MVP에서 GA4/optional User-ID 기반 behavioral estimate로 명시하고 DB-exact KPI로 과장하지 않는다.
6. production 외 environment는 default Noop/Test adapter로 production stream을 절대 호출하지 않는다.

## 2. Current Analytics Inventory

| Capability | Repository Evidence | Classification | Result |
|---|---|---:|---|
| GA4 SDK | dependency 없음 | NOT_FOUND | client adapter 신규 필요 |
| `gtag` | source/script 없음 | NOT_FOUND | 직접 global 호출보다 adapter 권장 |
| Google Tag Manager | package/config/snippet 없음 | NOT_FOUND | MVP 필수 아님 |
| Measurement Protocol | dependency/transport/config 없음 | NOT_FOUND | optional server transport 신규 필요 |
| Analytics utility | `src/analytics` 또는 tracker 없음 | NOT_FOUND | registry/adapter 신규 필요 |
| Event registry | 없음 | NOT_FOUND | TypeScript map 신규 필요 |
| GA4 env | measurement ID/API secret 없음 | NOT_FOUND | public ID/private secret 분리 필요 |
| GSC dependency/API config | 없음 | NOT_FOUND | API integration 없음 |
| GSC verification/property | repo evidence 없음 | NOT_VERIFIABLE | external setup 확인 필요 |
| sitemap/public SEO routes | app에는 `/api/health`만 존재 | NOT_FOUND | 06/06A target 구현 선행 |
| cookie/analytics consent | UI/state/adapter gate 없음 | NOT_IMPLEMENTED | auth cookie와 분리된 enable gate 필요 |
| UTM handling | parser/storage 없음 | NOT_FOUND | PendingFollowIntent allowlist로 구현 가능 |
| Search runtime | route/component 없음 | NOT_FOUND | raw query 전송 가능성도 현재 없음 |
| Application logging | analytics logger 없음; DB scripts의 stdout만 존재 | NOT_IMPLEMENTED | safe warning/redaction policy 필요 |
| Dashboard/metrics queries | 없음 | NOT_FOUND | 09 Admin에서 SQL + external UI 조합 |
| Current Outbox | basic row/status/index 존재 | IMPLEMENTED + partially TESTED | dedupe/lease/worker 없음; 05 target hardening 미구현 |
| Target User/Follow/Notification | 04/07 문서에만 존재 | DOCUMENTED / NOT_IMPLEMENTED | operational KPI 구현 전제 |
| Test harness | Vitest, Node test env, PostgreSQL integration/concurrency tests | IMPLEMENTED + TESTED | TestTracker/PII/dedupe tests와 호환 |

## 3. Source-of-Truth Validation

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

| Truth | Target Evidence | Feasibility |
|---|---|---|
| PostgreSQL operational | User/Follow/Consent/Preference/Email/Delivery/Article target tables | AMP, Follow, send, publication 계산 가능 |
| GA4 behavior | Next Client/Server adapter boundary | view, CTA, funnel, campaign 관찰 가능; 현재 미구현 |
| GSC visibility | canonical Article URL/redirect/indexability policy | external observation과 DB policy 분리 가능; wiring 없음 |
| Email provider telemetry | Delivery/Attempt provider ID target | open/click mapping 가능; provider unknown |

GA4가 차단/누락되어도 Follow/AMP/Delivery/Article indexability는 DB에서 변하지 않는다. 반대로 GA4/GSC 수치를 operational state로 쓰지 않는다.

## 4. North Star and Average Follow SQL Feasibility

### 4.1 Active Monitoring Parents

**Status: SUPPORTED_AFTER_TARGET_IMPLEMENTATION**

논리 query:

```sql
WITH latest_service_consent AS (
  SELECT DISTINCT ON (user_id)
         user_id, decision
  FROM consent_decisions
  WHERE consent_type = 'SERVICE_EMAIL_UPDATES'
  ORDER BY user_id, decided_at DESC, id DESC
)
SELECT count(*)
FROM users u
JOIN latest_service_consent c
  ON c.user_id = u.id AND c.decision = 'GRANTED'
WHERE u.status = 'ACTIVE'
  AND EXISTS (
    SELECT 1 FROM follows f
    WHERE f.user_id = u.id AND f.status = 'ACTIVE'
  )
  AND EXISTS (
    SELECT 1 FROM user_emails e
    WHERE e.user_id = u.id
      AND e.verification_state = 'VERIFIED'
      AND e.delivery_state = 'USABLE'
  )
  AND EXISTS (
    SELECT 1 FROM notification_preferences p
    WHERE p.user_id = u.id
      AND p.channel = 'EMAIL'
      AND p.state = 'ENABLED'
  );
```

04A의 `(user_id, consent_type, decided_at DESC, id DESC)`, `follows(user_id,status)`, current-row unique indexes로 충분하다. `EXISTS`는 multi-row joins에 의한 duplicate User count를 피하고, Follow pair unique는 logical duplicate를 막는다. MVP에 materialized metric table/warehouse는 필요 없다.

### 4.2 Average Follow

Expansion Gate 정의는 다음으로 고정한다.

```text
Active Follows belonging to Active Monitoring Parents
/
Active Monitoring Parents
```

AMP CTE를 재사용해 `follows.status='ACTIVE'` count와 distinct eligible user count를 나눈다. “active Follow가 하나 이상인 모든 ACTIVE User” 평균과 혼용하지 않는다. Current indexes면 충분하다.

## 5. Critical Event Ownership

| Event | Owner | Exact Trigger | Committed State | Duplicate Risk / Guard | Repository Point |
|---|---|---|---|---|---|
| `follow_click` | Client Follow island | user CTA activation 직전, context/Institution validated shape | 없음 | double click/navigation 재시도 허용; conversion 아님 | future client island |
| `signup_start` | Server boundary | provider identity resolution이 새 PENDING User/AuthIdentity를 commit하고 onboarding response를 시작 | new User PENDING | callback retry는 existing User라 재발송 금지 | future auth callback/application result |
| `signup_complete` | Server | PENDING→ACTIVE transaction commit 후 transition result=true | ACTIVE + required consent | retry는 no transition; deterministic event ID | future onboarding service |
| `follow_created` | Server | nonexistent/INACTIVE→ACTIVE Follow+Episode commit 후 | ACTIVE Follow/open Episode | transition-aware result + pair/open unique | future Follow service |
| `additional_follow` | Server | same activation commit의 post-count >=2 | new active Follow count | User row lock으로 cross-Institution concurrency 직렬화 | future Follow service |
| `notification_sent` | Server worker | provider accepted 후 Delivery가 SENT로 commit된 경우 | Delivery SENT | status transition + Delivery-derived event ID | future notification worker |

`follow_click`을 optimistic conversion으로 사용하지 않는다. `follow_created`는 mutation HTTP 200 자체가 아니라 실제 DB transition 결과가 true일 때만 전송한다.

## 6. Page View Instrumentation

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

현재 home/article/institution/opportunity/My Preppy route가 모두 없다. 구현 시 각 canonical page가 stable canonical ID/path를 prop으로 넘기는 작은 Client `PageViewTracker`를 한 번 mount한다. Effect key는 `eventName + canonicalPath + entityId`이며 같은 mounted page의 rerender/hydration에서는 재전송하지 않는다. SPA route navigation으로 page identity가 바뀔 때만 새 event를 보낸다.

- `home_view`: canonical home route
- `article_view`: published canonical Article UUID
- `institution_view`: canonical Institution UUID
- `opportunity_view`: canonical Opportunity UUID + Institution UUID
- `my_preppy_view`: ACTIVE session이 확인된 private page render 후; follow count/email effective enum만

React Strict Mode dev 동작은 production KPI로 보내지 않도록 non-production Noop/Test adapter가 막는다. Global default page view와 custom view를 함께 쓰면 dashboard에서 double-count하지 않도록 역할을 문서화한다.

## 7. Public Follow Island Analytics

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

07A의 cached public Server Component + private Client island와 양립한다. Island click handler가 allowlisted `institution_id/context`로 `follow_click`을 보내고 auth/mutation을 시작한다. Server Follow command가 commit 후 `follow_created`를 보낸다. Client optimistic UI나 successful fetch status는 conversion source가 아니다. Public cache key에는 analytics User-ID/session/PII를 넣지 않는다.

## 8. Server Analytics Adapter / Failure Boundary

### 8.1 Adapter

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

현재 server GA4 capability는 없다. 다음 interface는 dependency 없이 정의 가능하다.

```text
AnalyticsTracker.track(eventName, safeProperties, context)
ClientGa4Tracker / ServerProviderTracker / NoopTracker / TestTracker
```

Measurement Protocol 또는 provider SDK 선택은 implementation detail이다. Server credential/API secret은 Zod server env와 secret manager에만 두고 client bundle/log에 노출하지 않는다. Transport가 요구하는 pseudonymous client/user context, payload limits, endpoint behavior는 provider integration 시 검증한다. Production property/secret은 **NOT_VERIFIABLE**다.

### 8.2 Non-blocking Failure

Business transaction을 먼저 commit하고 tracker를 호출한다. Timeout/network/4xx/5xx는 PII-free safe warning 후 drop한다. Signup/Follow/Notification/Publish를 rollback하지 않는다.

### 8.3 Best-effort vs Outbox

| Option | Reliability | Current Repo Cost | Dedupe/Contention | MVP Verdict |
|---|---|---|---|---|
| direct best-effort after commit | loss 가능, duplicate 낮음 | 가장 낮음 | transition result로 대부분 방어 | **RECOMMENDED** |
| separate analytics Outbox row/consumer | retry 가능 | worker/lease/dedupe/consumer 필요 | distinct row/consumer면 manageable | DEFER until proven need |

현재 Outbox는 `status/available_at/attempt_count` skeleton뿐이고 dedupe key, lease, worker가 없다. 05 target hardening 전 analytics queue로 의존하면 복잡성만 늘어난다. DB가 critical business truth를 이미 보존하므로 MVP GA4 side effect는 best-effort가 적절하다. 실제 conversion loss가 PMF 판단을 방해하면 hardened Outbox에 별도 `ANALYTICS_*` row와 stable dedupe key를 추가한다. Email worker와 하나의 processed row를 공유해 fan-out하지 않는다.

## 9. Server Event Dedupe

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

GA4 exactly-once를 가정하지 않는다.

- `signup_complete`: User UUID + activated_at/activation integration ID
- `follow_created` / `additional_follow`: FollowEpisode UUID
- `notification_sent`: NotificationDelivery UUID + SENT transition

Application command는 `transitionOccurred`를 반환하고 false이면 event를 전송하지 않는다. Callback/retry가 current ACTIVE state를 다시 읽어도 conversion을 재발송하지 않는다. Direct best-effort에는 retry가 없으므로 provider-side exactly-once가 필요하지 않다. Outbox를 도입하면 `analytics:{event}:{transition-id}` unique dedupe key가 필수다.

## 10. Canonical IDs and Migration Cutover

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

Target Institution/Opportunity/Article는 UUID다. 현재 runtime에는 legacy School/AdmissionEvent/Guide/Update만 있고 canonical public routes도 없다.

권장:

1. production KPI instrumentation은 canonical route/entity cutover 후 활성화한다.
2. mapping이 존재하는 transitional route는 server가 canonical UUID를 resolve한 뒤 전송한다.
3. mapping 전 legacy event를 canonical event stream에 섞지 않는다. 꼭 필요하면 별 debug stream/event namespace로 격리한다.
4. `school_id/admission_event_id`를 primary analytics property로 보내지 않는다.

## 11. PII and Search Privacy

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

현재 analytics code가 없어 현재 전송 위험은 없다. Target registry는 event별 허용 property만 객체 type으로 노출하고 arbitrary `Record<string, unknown>`를 product code에 허용하지 않는다.

금지: email, Kakao subject, OAuth code/token, child name, phone, address, raw consent. `child_birth_year`와 User interest/home region은 GA4 기본 제외다. Institution public region은 허용한다. Error/logging도 같은 redaction을 적용한다.

Search runtime은 **NOT FOUND**다. 구현 시 raw query 대신 `query_length_bucket`, `result_count`, allowlisted category/filter만 전송할 수 있다. Server operational log에도 raw query를 기본 저장하지 않는다.

## 12. Attribution / PendingFollowIntent

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

07A model에 `landing_page` route category, canonical `article_id/opportunity_id/institution_id`, capped `utm_source/medium/campaign`을 넣을 수 있다. UUID와 짧은 enum/string이면 cookie size 안에 충분하다. 전체 URL/query, `utm_term`, HTML/free text, PII는 금지하고 per-field/total byte limit을 둔다.

OAuth state와 PendingFollowIntent는 계속 분리한다. Attribution은 Follow 권한 근거가 아니며 target Institution은 transaction에서 재검증한다. MVP는 current conversion context/last-touch뿐이고 permanent attribution table은 필요 없다.

## 13. Anonymous → Authenticated Analytics

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

GA4 User-ID로 opaque canonical User UUID를 optional 설정할 수 있다. Kakao subject/email은 사용하지 않는다. Client는 private session endpoint가 ACTIVE User를 확인한 후에만 User-ID를 설정하고 logout/delete 시 clear한다. ID를 public cached Server Component에 주입하지 않는다.

Anonymous/client stitching은 완전하지 않을 수 있고 Product truth는 이에 의존하지 않는다. Server conversion transport가 browser client context를 요구하는 경우 PendingFollow context 또는 provider-safe client identifier threading을 integration에서 검증하되 auth/session cookie를 analytics cookie와 합치지 않는다.

## 14. Notification Telemetry

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT / provider telemetry NOT_VERIFIABLE**

- `notification_sent`: Delivery SENT state transition 후 server event
- `notification_open`: verified provider webhook → Attempt/Delivery → opened timestamp/event
- `notification_click`: verified provider webhook 또는 signed PREPPY click redirect → Delivery click state/event

Sent/open/click numerator와 denominator의 primary truth는 unique Delivery rows다. Provider open은 privacy proxy/image blocking으로 directional이다. Webhook signature, provider message ID, duplicate/order/timeout, click redirect capability는 **NOT_VERIFIABLE**다.

## 15. Return / 14-Day Retention

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT, OBSERVATIONAL**

First FollowEpisode activation timestamp로 cohort origin을 만들 수 있다. GA4 exploration에서 User-ID가 있는 meaningful Article/Institution/Opportunity/My Preppy/Follow event의 day 1–14 return을 계산할 수 있다. Warehouse는 필요 없다.

한계:

- ad blocker/analytics consent/anonymous return은 누락 가능
- public cached page는 session을 읽지 않으므로 모든 authenticated public return을 server에서 관찰하지 않음
- My Preppy, Follow command, notification click은 authenticated validation subset을 제공하지만 전체 return은 아님

따라서 MVP 14-day returning은 behavioral estimate와 coverage caveat를 표시한다. 지금 visit table을 추가하지 않는다. 향후 Expansion Gate를 auditable DB truth로 요구할 때만 minimal daily user-activity model을 별도 검토한다.

## 16. Qualified Visitor / Detail → Follow / Signup / Additional Follow

### Qualified Visitor

GA4 session-scoped segment로 Article/Institution/Opportunity detail event 또는 search/filter event가 하나 이상인 `qualified_sessions`를 계산할 수 있다. DB visitor table은 불필요하다. “visitor”와 “session” label을 혼용하지 않는다.

### Detail → Follow

같은 GA4 session의 institution/opportunity view denominator와 `follow_click` numerator로 계산 가능하다. Public island는 page context를 allowlisted property로 보낸다. Browser blocking으로 undercount될 수 있어 DB Follow count와 별도로 해석한다.

### Signup Completion

`signup_start`는 newly committed PENDING User에만, `signup_complete`는 same new User의 PENDING→ACTIVE commit에만 전송한다. Existing User direct Follow는 두 event 모두 제외한다.

### Additional Follow

동일 User의 concurrent cross-Institution activation을 정확히 분류하려면 모든 Follow activation이 lock order `User → logical Follow`를 지켜야 한다. User lock 아래 pre/post active count를 계산한다. Post-count 1이면 first Follow, 2 이상이면 `additional_follow`; `follow_created`는 모든 real activation에서 한 번이다. 이는 schema amendment가 아닌 service transaction adjustment다.

## 17. Dashboard Source Matrix

| Metric | Proposed Source | Repository Feasibility | Adjustment |
|---|---|---|---|
| Qualified Visitors | GA4 qualified sessions | NOT_IMPLEMENTED | event/segment 정의; session label 사용 |
| Organic Visitors | GA4 + GSC clicks | NOT_IMPLEMENTED / NOT_VERIFIABLE | 서로 다른 scope로 병렬 표시 |
| Indexed Articles | DB indexable + GSC visible | target DB feasible; GSC 없음 | `Indexable`과 `Search-visible` 분리 |
| Institutions per Session | GA4 | NOT_IMPLEMENTED | unique Institution UUID/session |
| Detail→Follow | GA4 | NOT_IMPLEMENTED | view/follow_click same-session funnel |
| Signup Completion | server events in GA4 | NOT_IMPLEMENTED | new-user path only |
| Active Monitoring Parents | PostgreSQL | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | latest-consent EXISTS query |
| Average Follow | PostgreSQL | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | AMP denominator 고정 |
| Notification sent/failed | PostgreSQL Delivery/Attempt | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | DB primary truth |
| Email Open | Delivery/provider webhook | provider NOT_VERIFIABLE | directional annotation |
| Email CTR | Delivery/provider/click redirect | provider NOT_VERIFIABLE | sent-delivery denominator 고정 |
| 14-Day Returning | GA4 + authenticated subset | SUPPORTED_WITH_LIMITATION | observational/coverage 표시 |
| Organic AMP trend | GA4 conversion cohort + current DB AMP | approximate cross-source | warehouse 전까지 trend only |

## 18. GSC and Indexed Article Reality

**GSC Status: NOT_IMPLEMENTED / external property NOT_VERIFIABLE**

Dependency, credential, property config, API client, sitemap route가 모두 없다. GSC API는 MVP Product/AMP blocker가 아니다. 초기에는 external GSC UI/manual export로 search visibility를 보고 09 dashboard에는 DB `Published + robots_index=true` exact count를 제공할 수 있다.

DB indexable count와 Google 관찰을 한 숫자로 합치지 않는다. GSC Search Analytics가 제공하는 URL with impression/click은 `search-visible`로, URL Inspection/coverage 확인을 쓴 경우에만 `indexed`라고 label한다. Canonical URL/redirect로 Article과 mapping한다.

## 19. Environment Isolation and Analytics Consent

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

현재 Zod env pattern을 확장해 mode, public measurement ID, private server credential을 분리할 수 있다.

권장 우선순위:

1. test: `TestTracker`, network 금지
2. local/dev: default `NoopTracker`; 필요 시 별도 non-production stream/DebugView
3. production: 명시적으로 enabled + production credentials

Event의 `environment` property로 사후 필터링하는 것만으로 격리하지 않는다. 별도 stream 또는 no-op가 우선이다.

Cookie/analytics consent runtime은 **NOT_IMPLEMENTED**다. Client adapter는 enabled/disabled gate를 가져야 하며 analytics cookie는 auth/PendingFollow cookie와 분리한다. Analytics가 disabled여도 DB operational metrics와 auth/Follow/Monitoring은 동작한다. 법적 consent requirement는 **NOT_VERIFIABLE**다.

## 20. Typed Event Registry

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

TypeScript mapped/discriminated union으로 `src/analytics/events.ts`, tracker interface/adapters를 `src/analytics`에 둘 수 있다. 새 package는 필수 아님. 기존 Zod를 critical server payload runtime validation에 재사용할 수 있다.

Registry에는 owner, trigger, required/optional allowlisted properties, privacy class, dedupe semantic을 둔다. Client/server가 safe shared types를 사용하되 server secret/provider transport는 server-only module에 둔다. Generic arbitrary property bag은 금지한다.

## 21. Analytics Outbox Decision

**MVP Recommendation: DIRECT BEST-EFFORT AFTER COMMIT.**

이유:

- PostgreSQL이 AMP/Follow/Delivery truth를 이미 보존한다.
- 현재 Outbox는 hardened contract/worker가 구현되지 않았다.
- GA4 side-effect loss는 product rollback보다 안전하다.
- MVP volume에서 separate queue를 선제 도입할 근거가 없다.

Loss rate가 의사결정을 방해한다는 evidence가 생기면 hardened Outbox에 별도 analytics rows/consumer를 둔다. Stable transition ID와 dedupe key가 필수이며 operational notification row의 처리 상태를 analytics consumer와 공유하지 않는다.

## 22. Event QA / Test Feasibility

**Status: SUPPORTED_AFTER_TARGET_IMPLEMENTATION**

현재 Vitest/TestTracker/PostgreSQL harness로 실제 GA4 network 없이 다음을 검증할 수 있다.

- typed mapping/required property/UUID/enum
- PII and raw-query allowlist rejection
- test/dev Noop 및 production credential gate
- tracker throw/timeout이 business result를 바꾸지 않음
- duplicate callback/double click에서 one `follow_created`
- concurrent cross-Institution Follow에서 post-count/additional classification
- PENDING→ACTIVE에서 one `signup_complete`
- Delivery SENT에서 one `notification_sent`
- delete 후 server event suppression/PII-free payload
- DB indexability query와 KST date boundary

Browser E2E는 adapter mock/spy를 사용한다. GA4/GSC/provider network call은 test에서 금지한다.

## 23. Metric Definition Audit

| KPI | Numerator | Denominator | Source | Verdict / Clarification |
|---|---|---|---|---|
| Qualified Visitors | qualified sessions | all relevant period sessions implicit | GA4 | 구현 가능; 이름을 `Qualified Sessions`로 표시 권장 |
| Organic Visitors | organic sessions/users | n/a count | GA4; GSC clicks complementary | 두 source를 합산/일치시키지 않음 |
| Detail→Follow | sessions with follow_click after detail | sessions with institution/opportunity view | GA4 | 구현 가능; session scope 고정 |
| Signup Completion | new-user signup_complete | new-user signup_start | server GA4 events | commit boundary/기존 User 제외 |
| AMP | eligible distinct Users | n/a count | PostgreSQL | exact after target schema |
| Average Follow | active Follows of AMP | AMP | PostgreSQL | denominator 명확히 고정 |
| Email Open | unique opened Deliveries | SENT Deliveries | DB/provider | directional, provider unknown |
| Email CTR | unique clicked Deliveries | SENT Deliveries | DB/provider | denominator SENT로 고정 |
| 14-Day Returning | activated Users with meaningful event day 1–14 | first-Follow activation cohort | GA4 + authenticated subset | observational, incomplete coverage |

모호성은 implementation clarification으로 해결 가능하며 architecture amendment는 아니다.

## 24. ANA-001 ~ ANA-024 Validation

| ANA | Decision | Repository Evidence | Status | Adjustment |
|---|---|---|---|---|
| 001 | DB/GA4/GSC source 분리 | target schema, analytics 없음 | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | adapter/dashboard label |
| 002 | AMP from PostgreSQL | 04/07 target/indexes | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | EXISTS/latest query |
| 003 | critical success after commit | transaction harness/pattern | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | transition result + best-effort |
| 004 | click != success | public island/server service boundary | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | owner 분리 |
| 005 | canonical UUIDs | target Institution/Opportunity/Article UUID | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | cutover 전 legacy 격리 |
| 006 | prohibited PII | no analytics code; 07A privacy boundary | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | typed allowlist/tests |
| 007 | child_birth_year excluded | target optional profile | SUPPORTED | registry에 property 미정의 |
| 008 | raw query excluded | search runtime 없음 | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | bucket/result only |
| 009 | failure non-blocking | post-commit adapter feasible | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | catch/drop, no rollback |
| 010 | FollowCreated real transition only | Follow/Episode unique+lock target | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | transition flag/Episode ID |
| 011 | SignupComplete after activation commit | User status/consent target | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | PENDING→ACTIVE only |
| 012 | NotificationSent from Delivery | Delivery SENT target | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | worker transition |
| 013 | stitching not operational truth | DB KPI query independent | SUPPORTED | GA4 optional |
| 014 | capped PendingIntent attribution | 07A cookie model | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | total/per-field limit |
| 015 | simple last-touch | no attribution table | SUPPORTED | current conversion context |
| 016 | Asia/Seoul reporting | TIMESTAMPTZ conventions | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | KST query/GA config |
| 017 | Article measured by conversion | target relations/canonical IDs | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | view→CTA→Follow funnel |
| 018 | GSC visible != DB indexable | target Article robots fields; GSC 없음 | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | labels/manual GSC |
| 019 | Email Open directional | provider 없음 | SUPPORTED / NOT_VERIFIABLE | proxy caveat |
| 020 | no warehouse MVP | PostgreSQL/GA4 UI sufficient | SUPPORTED | retention limitation 표시 |
| 021 | no User/child profile export | target profile separate | SUPPORTED | institution region only |
| 022 | central privacy-classified registry | TS/Zod capable; registry 없음 | NOT_IMPLEMENTED | `src/analytics` 구현 |
| 023 | optional Outbox, non-blocking | basic Outbox exists; hardening absent | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | MVP best-effort, defer queue |
| 024 | dev/test no prod pollution | env parser/Test harness | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | Noop/Test default, separate stream |

No ANA decision is `CONFLICT`.

## 25. Acceptance Scenarios

| # | Scenario | Status | Validation |
|---:|---|---|---|
| 1 | Article Organic Follow | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | canonical context cookie + client views/click + server commits, no PII |
| 2 | Existing User Follow | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | click + transition event, no signup events |
| 3 | Duplicate Follow Click | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | clicks may repeat; transition flag emits one success |
| 4 | Email OFF User | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | DB Follow remains; AMP query false |
| 5 | Analytics-blocked Browser | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | views missing; DB truth unchanged |
| 6 | Notification Sent/Open/Click | SUPPORTED_AFTER_TARGET_IMPLEMENTATION / provider NOT_VERIFIABLE | SENT DB truth; webhook telemetry external |
| 7 | No-change Monitoring | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | no verified change/notification transition, no event |
| 8 | User Deletes | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | server ACTIVE check blocks future; typed payload contains no PII |
| 9 | Search Raw Query | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | registry accepts length bucket/result only |
| 10 | Article Noindex | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | DB indexability remains separate from GSC visibility |
| 11 | Follow Reactivation | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | new Episode/real ACTIVE transition gives one event ID |
| 12 | Test Environment | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | TestTracker/Noop, zero production network |

## 26. Analytics Invariant Matrix

| Rule | DB | Client | Server | Provider | Policy | Feasibility |
|---|---|---|---|---|---|---|
| AMP from DB | target states/indexes | — | SQL query | — | GA4 not truth | SUPPORTED_AFTER_TARGET_IMPLEMENTATION |
| follow_click != follow_created | — | click owner | transition owner | — | separate definitions | SUPPORTED_AFTER_TARGET_IMPLEMENTATION |
| signup_complete after commit | User status/consent | — | post-commit flag | transport | no pre-commit event | SUPPORTED_AFTER_TARGET_IMPLEMENTATION |
| one success event per transition | unique/Episode/Delivery | no conversion | transition ID | no exactly-once assumption | retry false=no event | SUPPORTED_AFTER_TARGET_IMPLEMENTATION |
| no PII | target raw PII separate | safe props | typed allowlist/redaction | payload limits | privacy tests | SUPPORTED_AFTER_TARGET_IMPLEMENTATION |
| analytics failure non-blocking | truth retained | catch/drop | after commit | may fail | no rollback | SUPPORTED_AFTER_TARGET_IMPLEMENTATION |
| raw query suppressed | — | bucket only | no raw log/default | — | registry prohibition | SUPPORTED_AFTER_TARGET_IMPLEMENTATION |
| dev data isolated | — | Noop/Test | Noop/Test | separate/no call | prod explicit enable | SUPPORTED_AFTER_TARGET_IMPLEMENTATION |
| notification_sent from Delivery | SENT status | — | transition event | accepted precedes state | DB primary | SUPPORTED_AFTER_TARGET_IMPLEMENTATION |
| GSC != DB indexability | Article robots/status | — | DB metric | GSC observation | label split | SUPPORTED_AFTER_TARGET_IMPLEMENTATION |
| canonical IDs only | target UUID/FKs | canonical props | mapping/cutover | — | legacy stream 격리 | SUPPORTED_AFTER_TARGET_IMPLEMENTATION |
| browser blocking no DB effect | Follow/AMP truth | event may drop | business continues | GA may miss | annotate coverage | SUPPORTED_AFTER_TARGET_IMPLEMENTATION |

## 27. Implementation Order

1. canonical User/Follow/Notification/Article target schema와 services
2. central typed event registry + privacy classification
3. NoopTracker/TestTracker + environment gate
4. client GA4 adapter
5. server best-effort adapter/credential boundary
6. route-level view/search/filter instrumentation
7. Follow/Signup committed server events와 concurrency tests
8. Notification sent/open/click mapping
9. PostgreSQL dashboard queries (AMP/Average Follow/Delivery/indexability)
10. GSC UI/manual search-visibility workflow; API는 필요 시 후속
11. funnel/privacy/environment QA

## 28. Architecture Amendment Candidate

**None.**

14-day returning의 incomplete coverage, GSC/provider telemetry 부재, current Outbox hardening 부재는 implementation/measurement limitation이다. 08의 source separation을 바꿀 이유가 없다. Authenticated activity를 auditable DB truth로 승격하는 future requirement가 생길 때만 별도 extension을 검토한다.

## 29. Required Questions

| Q | Answer |
|---|---|
| Q1 08 구현 가능한가? | **YES_WITH_IMPLEMENTATION_ADJUSTMENTS** |
| Q2 amendment 필요한가? | **NO** |
| Q3 현재 GA4/GSC runtime? | **NO**. dependency/config/route/API 모두 없음; external GSC property는 NOT_VERIFIABLE |
| Q4 AMP/Average Follow warehouse 없이 가능? | **YES**. target PostgreSQL EXISTS/latest-consent/index query로 충분 |
| Q5 click/success 정확히 분리? | **YES**. Client island click vs server committed transition |
| Q6 best-effort vs Outbox? | **MVP는 direct best-effort after commit**. loss evidence 후 hardened Outbox |
| Q7 GA4 User-ID 없이 Product truth 충분? | **YES** for Follow/AMP/Delivery; acquisition/retention stitching은 불완전 |
| Q8 PendingIntent attribution 안전? | **YES**. allowlist/cap/no PII, OAuth state 분리, target 재검증 |
| Q9 14-day return 신뢰도? | warehouse 없이 GA4 behavioral estimate + authenticated subset; DB-exact는 아님 |
| Q10 Email unknown? | webhook signature/order/dedupe, message ID, open proxy, click mapping, timeout/complaint semantics |
| Q11 typed registry로 유출 방지? | **YES**. compile-time allowlist + critical runtime Zod + tests; logs도 동일 redaction |
| Q12 09로 진행 가능? | **YES** |

## 30. Analytics Architecture Repository Validation Verdict

**Architecture:**
VALID_WITH_IMPLEMENTATION_ADJUSTMENTS

**Ready for 09_ADMIN_OPERATIONS_ARCHITECTURE:**
YES

**Architecture Blockers:**
None.

**Required Amendments:**
None.

**Implementation Adjustments:**

- canonical schema/services 이후 typed event registry와 Noop/Test adapters 선행
- route transition당 one view event 및 Client click/Server success owner 분리
- critical conversion은 transition-aware commit 후 best-effort; Outbox는 reliability need가 검증될 때 사용
- User→Follow lock order로 `additional_follow` concurrency 정확성 보장
- canonical UUID cutover 전 legacy analytics 격리
- PII/raw-query allowlist, environment isolation, consent-disable gate
- 14-day returning을 observational metric으로 표시

**Current Analytics Runtime:**
No GA4, GTM, Measurement Protocol, GSC API, analytics utility, event registry, consent gate, dashboard, or analytics tests exist.

**Recommended Client Tracking Model:**
Central typed registry + environment-gated ClientGa4Tracker; route-scoped one-shot view tracker and Client Follow island click events; Noop/Test by default outside production.

**Recommended Server Tracking Model:**
Transition-aware, PII-safe Server AnalyticsTracker called best-effort after business commit. Use stable domain transition IDs; defer analytics Outbox until measured event loss justifies it.

**Recommended Metric Source Split:**
PostgreSQL for AMP/Follow/Delivery/indexability, GA4 for behavior/funnels/observational retention, GSC for external search visibility, Email provider for directional open/click telemetry.

**Highest Analytics Risks:**

1. Client clicks/views를 committed conversions로 오인하거나 hydration/callback retry로 중복 집계하는 위험
2. email/Kakao subject/raw query/child data 또는 legacy IDs를 arbitrary event payload로 유출하는 위험
3. GA4/GSC/provider 누락·차단 데이터를 DB operational truth 또는 exact 14-day retention으로 과장하는 위험

**External Unknowns:**

- Production GA4 property/stream, Measurement Protocol credentials and identity-context behavior
- GSC property verification, sitemap discovery, API/URL visibility data
- Email provider message ID, webhook authentication/order/dedupe, open/click semantics
- Analytics cookie consent/legal requirement and production TLS/security controls

**Recommended Next Step:**
`09_ADMIN_OPERATIONS_ARCHITECTURE.md`
