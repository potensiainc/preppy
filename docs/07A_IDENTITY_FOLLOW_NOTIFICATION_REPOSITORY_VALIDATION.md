# PREPPY Identity / Follow / Notification Repository Validation

## 0. Purpose, Scope, and Evidence

이 문서는 `docs/07_IDENTITY_FOLLOW_NOTIFICATION.md`를 다시 설계하지 않는다. 07에 고정된 Kakao → canonical User → Follow → My Preppy → Notification lifecycle을 현재 Next.js runtime, PostgreSQL/Drizzle schema, target Data Model, legacy Subscriber/Alert graph와 대조해 구현 가능성을 검증한다.

검증 근거는 요청된 선행 문서 전체와 `package.json`, `next.config.ts`, `.env.example`, `src/config/env.ts`, app route tree, `src/db/schema/index.ts`, migrations, unit/integration tests다.

Evidence 분류:

- **DOCUMENTED**: target 문서에만 정의
- **IMPLEMENTED**: 현재 code/schema/config에 존재
- **TESTED**: 자동 test가 invariant를 검증
- **NOT_IMPLEMENTED**: 목표는 있으나 runtime/schema 없음
- **NOT_FOUND**: 대응 자산 없음
- **NOT_VERIFIABLE**: 외부 provider/deployment/production data 필요

판정은 `SUPPORTED`, `SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT`, `CONFLICT`, `NOT_IMPLEMENTED`, `NOT_FOUND`, `NOT_VERIFIABLE`을 사용한다. `CONFLICT`는 07 자체를 변경해야 할 때만 사용한다.

## 1. Executive Verdict

**Architecture: VALID_WITH_IMPLEMENTATION_ADJUSTMENTS**

07은 현재 repository 위에 additive하게 구현 가능하다. Next.js 16 App Router/Node 22는 server-side cookie와 private rendering 경계를 제공하고, PostgreSQL 16 + Drizzle은 provider subject unique, Follow logical pair unique, open FollowEpisode partial unique, row-lock transaction, deterministic latest-consent query를 지원한다. 공개 User auth가 전혀 없는 것은 architecture conflict가 아니라 구현 공백이다.

Architecture blocker와 required amendment는 없다. 구현 시 다음을 고정해야 한다.

1. OAuth `state`와 `PendingFollowIntent`를 별도 purpose/state로 운용한다.
2. 모든 protected request가 cookie뿐 아니라 current User status를 DB에서 확인한다.
3. callback/new-user race는 provider exchange 밖, identity creation 안쪽 DB transaction과 unique constraint로 닫는다.
4. Follow command는 logical Follow row를 lock하고 Follow/Episode를 한 transaction에서 갱신한다.
5. public cached content와 private Follow island/My Preppy cache를 분리한다.
6. worker는 provider call 직전 eligibility를 재확인하되 network call 동안 DB lock을 유지하지 않는다.
7. deletion은 User anchor를 남기고 AuthIdentity/UserEmail/Profile/Interest PII child를 물리 삭제한다.

## 2. Current Identity Runtime Inventory

| Area | Repository Evidence | Classification | Result |
|---|---|---:|---|
| Public auth routes | app route는 `/api/health`만 존재 | NOT_FOUND | start/callback/logout/onboarding 신규 필요 |
| Public User session | auth/session/cookie utility 없음 | NOT_FOUND | 07 contract 구현 필요 |
| Admin auth config | `.env.example`, `src/config/env.ts`의 issuer/client/secret validation | IMPLEMENTED | config뿐이며 public Kakao와 별도 root |
| OAuth dependency | `package.json`에 auth/OAuth SDK 없음 | NOT_FOUND | provider-neutral adapter/library 필요 |
| Cookie/crypto utility | module 없음; Node >=22 | NOT_FOUND / CAPABLE | Next cookie API와 검증된 crypto mechanism 사용 가능 |
| Middleware/proxy | 없음 | NOT_FOUND | page/layout server guard로 My Preppy 보호 가능 |
| CSRF utility | 없음 | NOT_FOUND | POST/Origin/SameSite control 구현 필요 |
| Kakao env/config | 없음 | NOT_FOUND | client/callback/state/session keys 필요 |
| Canonical User tables | User/Auth/Email/Consent/Preference/Follow 없음 | NOT_IMPLEMENTED | 04/04A target migration 선행 |
| Legacy Subscriber | global normalized-email unique | IMPLEMENTED + TESTED | canonical User와 분리 |
| Legacy Subscription | Subscriber+AdmissionCycle unique, consent provenance | IMPLEMENTED + TESTED | cycle-coupled; Follow로 재사용 불가 |
| Legacy action token | hashed VERIFY/UNSUBSCRIBE token, Subscription FK | IMPLEMENTED | pattern만 재사용 가능 |
| Legacy Alert/Delivery | Alert+Subscription graph 및 consistency trigger | IMPLEMENTED + TESTED | canonical notification history 아님 |
| Email provider | env placeholder만 존재 | NOT_IMPLEMENTED | adapter/worker/webhook 없음 |
| Analytics | SDK/pipeline 없음 | NOT_IMPLEMENTED | canonical UUID boundary는 호환 |
| Test harness | Vitest + PostgreSQL integration harness | IMPLEMENTED + TESTED | target race/invariant test 기반 있음 |

`admin_users.external_auth_subject` unique는 DB pattern precedent일 뿐 public User identity로 재사용하지 않는다.

## 3. Kakao Provider Feasibility

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

- Kakao dependency/config는 **NOT FOUND**다.
- `/auth/kakao/*` namespace는 현재 route와 충돌하지 않는다.
- provider exchange/mapping을 infrastructure adapter 뒤에 두고 application에는 provider+normalized subject만 전달 가능하다.
- canonical User UUID와 provider subject 분리는 target schema 및 기존 namespace와 호환된다.
- background Kakao API use case가 없으므로 provider access/refresh token을 장기 저장하지 않고 application session을 발급할 수 있다.
- Kakao email scope/availability/verified flag, subject contract, timeout/replay behavior는 **NOT_VERIFIABLE**다.

Provider network exchange는 DB transaction 밖에서 수행하고 OAuth code/token/raw response/provider subject는 log, audit, outbox에 남기지 않는다.

## 4. Session Model

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

권장 MVP 모델:

```text
authenticated/encrypted HttpOnly cookie
→ opaque user_id + issued_at + expires_at + key/version
→ protected request마다 users.status 조회
→ ACTIVE만 private capability 허용
```

Next.js 16 App Router에서 Server Component는 cookie를 읽고 Route Handler/Server Action은 발급·삭제할 수 있다. `/my-preppy`는 server guard 후 private projection을 읽는 dynamic/no-store route로 구현 가능하다.

Cookie는 `HttpOnly`, production `Secure`, `SameSite=Lax` 이상, host-only, `Path=/`, 명시적 TTL/purpose/key ID를 사용한다. email/Kakao subject/profile/consent는 payload에 넣지 않는다. suspend/delete는 DB status check로 즉시 차단하고 logout은 cookie를 삭제한다. mutation은 POST + Origin 검증을 적용한다.

별도 `auth_sessions` table은 필요하지 않다. server-side per-device revocation, device inventory, opaque rotation family 요구가 현재 없다. 향후 생기면 implementation extension이지 현재 amendment가 아니다.

## 5. OAuth State / PendingFollowIntent

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

Permanent DB table 없이 두 개의 short-lived authenticated/encrypted HttpOnly cookie로 구현하는 것이 가장 단순하다.

| State | Purpose | Fields | Consumption |
|---|---|---|---|
| OAuth transaction | request/callback binding | random verifier, nonce, issued/expiry, allowed return key | callback 검증 후 one-use clear |
| PendingFollowIntent | product continuity | Institution UUID, source enum, capped attribution, nonce, issued/expiry | successful Follow commit 후 clear |

OAuth CSRF state와 product intent는 권한·실패·retry 의미가 달라 분리한다. 한 envelope를 쓰더라도 purpose/key/expiry를 논리적으로 분리해야 한다.

- raw external `return_to`를 저장하지 않고 internal route registry/allowlisted relative path만 사용한다.
- Institution과 Article/Opportunity relation은 intent 생성과 Follow transaction에서 server가 다시 검증한다.
- attribution은 allowlisted short fields만 허용하고 PII/arbitrary query를 금지한다.
- hard byte limit을 두고 초과 attribution은 버린다.
- invalid/expired intent는 Follow를 만들지 않고 login 또는 safe public destination만 완료한다.

첫 callback commit 후 response/cookie clear가 실패해도 다음 login은 같은 identity를 resolve하고 Follow upsert가 idempotent success를 반환한다. Provider authorization code 자체의 replay 결과는 **NOT_VERIFIABLE**다.

## 6. New User Transaction

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

1. OAuth state 검증과 provider exchange를 transaction 밖에서 완료한다.
2. `(provider, provider_subject)` identity를 조회한다.
3. 없으면 한 transaction에서 User `PENDING` + AuthIdentity를 생성한다.
4. identity unique conflict 시 전체 transaction을 rollback하고 winner를 다시 조회한다.
5. orphan PENDING User가 남지 않게 두 insert를 분리하지 않는다.
6. existing User가 ACTIVE면 session 발급, SUSPENDED/DELETED면 접근 거부한다.

`UNIQUE(provider, provider_subject)`는 concurrent first login/duplicate callback의 충분한 final guard다. application check만으로 대체하면 안 된다.

## 7. Activation / Onboarding

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

Append-only ConsentDecision으로 latest Terms/Privacy GRANTED를 확인할 수 있다. User row를 lock한 activation transaction에서 required policy version을 재검증한다. cross-table ACTIVE invariant는 단순 CHECK로 표현하기 어려우므로 service transaction + integration test가 책임진다.

```text
lock PENDING User
append Terms/Privacy
optional Profile/Interest
optional UserEmail + service consent/preference
activate User
revalidate Institution
activate Follow + open Episode when valid
PII-safe audit/outbox
commit
```

한 modular monolith/DB이므로 distributed transaction은 불필요하다. Institution이 더 이상 followable하지 않으면 User activation은 commit하고 Follow만 생략하는 expected branch로 처리한다. Email missing/Profile skipped는 activation/Follow를 막지 않는다.

## 8. Email Model

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

- `UNIQUE(user_id)`로 one current email을 보장한다.
- global email unique가 없어 같은 보호자 email을 여러 User가 쓸 수 있다.
- Email은 User state가 아니며 absence가 정상이다.
- KAKAO/USER_INPUT source, verification state, delivery state를 분리한다.
- replacement는 User/current row lock 아래 주소를 교체하고 verification/delivery/bounce를 reset한다. usable 전까지 eligibility=false다.
- deletion은 UserEmail child를 물리 삭제한다. raw email tombstone을 남기지 않는다.
- worker는 send 직전 current address를 resolve하고 Delivery에는 raw email 대신 recipient hash만 둔다.

Kakao verified email 의미를 PREPPY usable로 자동 간주할 수 있는지는 **NOT_VERIFIABLE**다.

## 9. Consent / Preference

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

`TERMS`, `PRIVACY`, `SERVICE_EMAIL_UPDATES` decision은 append-only이고 NotificationPreference는 `(user_id, channel)` current unique row다. latest query index는 다음으로 충분하다.

```text
(user_id, consent_type, decided_at DESC, id DESC)
```

Initial EMAIL preference는 same transaction의 explicit service-email GRANTED가 있을 때만 ENABLED다. Preference ON은 usable email + latest consent를 재검증한다. Preference OFF는 Follow를 건드리지 않는다. Revoke는 decision append + preference disable + pending suppression + audit를 한 command transaction에서 수행한다. 두 모델을 합쳐야 할 DB blocker는 없다.

## 10. Follow Transaction

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

04A와 동일한 protocol을 사용한다.

1. transaction 안에서 User ACTIVE와 Institution followable을 재검증한다.
2. `(user_id, institution_id)`를 `INSERT ... ON CONFLICT`로 get-or-create한다.
3. logical Follow row를 `FOR UPDATE` lock한다.
4. 이미 ACTIVE면 idempotent success다.
5. INACTIVE면 current state/timestamps와 새 open Episode를 함께 갱신한다.
6. Unfollow는 same lock 아래 Follow를 INACTIVE로 바꾸고 open Episode를 같은 DB timestamp로 닫는다.

Final guards는 pair unique, `UNIQUE(follow_id) WHERE deactivated_at IS NULL`, interval/state checks다. Double click, two callbacks, reactivation 모두 같은 transaction으로 수렴하며 trigger 기반 중복 state machine은 필요 없다. Signup도 transaction context를 공유할 수 있다.

## 11. Follow Intent Without Login

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

Public page는 canonical relation에서 Institution UUID를 CTA에 줄 수 있다. client가 target을 변조할 수 있으므로 서버가 intent 생성과 completion에서 존재/상태/관계를 검증한다. `follow_click` analytics와 auth initiation은 분리 가능하다. Expired intent는 Follow 없이 safe fallback한다. Article은 structured Article→Institution relation, Opportunity는 its Institution을 target으로 하며 slug/query text를 authority로 쓰지 않는다.

## 12. My Preppy / Public Follow Island

### My Preppy

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

`/my-preppy`는 현재 **NOT FOUND**이나 충돌은 없다. protected Server Component가 session을 읽고 ACTIVE User를 확인한 뒤 Follow→Institution→current Opportunity와 email/consent/preference effective state를 조회할 수 있다.

- dynamic/private render, shared cache 금지
- private query/fetch `no-store`
- noindex/nofollow metadata
- server authorization이 최종 권한
- user/session/PII를 public cache key에 넣지 않음

### Public Follow Island

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

Public core는 session-independent Server Component로 유지한다. 작은 Client island만 private no-store endpoint에서 current Follow를 조회한다. 초기 neutral/skeleton state로 hydration mismatch를 피하고 anonymous이면 auth flow, ACTIVE User면 mutation response를 authoritative state로 사용한다. public cached tree에 cookie read/personalization을 섞지 않으므로 06A와 양립한다.

## 13. Signal-time / Send-time Eligibility

### Signal-time

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

```text
activated_at <= signal_published_at
AND (deactivated_at IS NULL OR deactivated_at > signal_published_at)
```

Activation은 inclusive, deactivation은 exclusive다. exact deactivation timestamp signal은 제외된다. command는 DB clock timestamp 하나를 current Follow/Episode에 함께 사용한다. Re-follow는 새 Episode를 만들고 과거 interval을 바꾸지 않는다. Follow 이전 signal에는 retroactive Delivery가 없다. Follow institution/current index와 `follow_episodes(follow_id, activated_at DESC)`로 MVP query가 가능하며 warehouse가 필요 없다.

### Send-time

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

Provider call 직전 한 current query로 `User ACTIVE + Follow ACTIVE + Email USABLE + latest service consent GRANTED + EMAIL preference ENABLED`를 재확인한다. Ineligible이면 Delivery를 reason과 함께 SUPPRESSED한다. Eligible이면 Attempt claim/STARTED를 commit한 뒤 network call한다. Network call 동안 User/Follow/Preference lock이나 transaction을 유지하지 않는다. Recheck와 provider acceptance 사이의 짧은 race에 대한 semantic boundary는 "provider call 직전 current state"다.

## 14. Preference OFF / Revoke / Bounce

Preference OFF는 Follow를 유지하며 pending/queued delivery를 suppress하고 AMP에서 제외한다. Consent revoke는 decision append + preference disable + pending suppression이다. Resolver가 이미 row를 만들었더라도 worker recheck가 최종 guard다. **SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**.

Bounce는 `(provider, provider_message_id)` Attempt lookup → Delivery/User로 처리 가능하다. Raw email lookup은 필요 없다. 다만 old address send 후 email replacement 뒤 bounce가 오면 Delivery `recipient_hash`와 current normalized-email hash가 일치할 때만 current UserEmail을 BOUNCED로 바꾼다. 불일치면 과거 Attempt/Delivery만 갱신한다. Provider signature, event ordering, message ID, timeout/complaint semantics는 **NOT_VERIFIABLE**다.

## 15. Account Deletion / Re-registration

### Deletion

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

권장 single transaction:

1. User row lock, status `DELETED`
2. AuthIdentity physical child delete
3. UserEmail/Profile/Interest physical child delete
4. Preference disable
5. active Follow와 open Episode close
6. pending/queued Delivery suppress
7. PII-free audit
8. commit

User/Consent/Follow/Episode/Delivery/Attempt opaque history는 유지되어 RESTRICT FK를 깨지 않는다. AuthIdentity를 raw subject와 REVOKED로 남기기보다 child delete가 04A의 PII policy와 target NOT NULL/unique를 가장 단순하게 양립시킨다. Stale cookie는 old UUID를 가리키지만 protected request의 User ACTIVE check가 차단한다. Cookie clear는 보조다.

Audit/outbox/error/provider logs에 email, subject, token을 금지하고 Delivery에는 raw recipient를 저장하지 않는다.

### Re-registration

AuthIdentity 삭제 후 같은 subject는 unique collision 없이 새 AuthIdentity를 만들 수 있다. 새 `PENDING` User와 명시적 onboarding을 거치며 old DELETED User/history에 자동 link/merge/reactivation하지 않는다. Cooling-off/recovery/영구 차단 요구가 생기면 privacy/legal retention 설계가 별도로 필요하지만 현재 근거로 tombstone subject/hash를 추가하지 않는다.

## 16. Legacy / Preference Action Tokens

Legacy Subscriber는 email identity/global unique, Subscription은 Cycle-coupled, AlertDelivery는 이 graph의 trigger/FK에 묶여 있다. Canonical signup이 legacy email을 조회하지 않으면 same email도 auto merge되지 않는다. Legacy AlertDelivery는 canonical history가 아니다. **SUPPORTED**.

`subscription_action_tokens`의 hash-at-rest, purpose, expiry, used-at pattern만 참고한다. 기존 table은 Subscription VERIFY/UNSUBSCRIBE scope라 User/channel preference에 직접 재사용하면 안 된다.

Optional EMAIL disable token은 purpose/channel/opaque User/expiry/key version을 가진 signed scoped token으로 구현 가능하다. Disable은 idempotent라 persistent table이 필수는 아니다. One-use/revocation proof가 요구되면 canonical table을 추가한다. Email scanner 오동작을 피하려 GET은 confirmation만, explicit POST가 mutation을 수행한다. Return path는 internal allowlist다. MVP blocker가 아니다.

## 17. Auth Security Matrix

| Threat | Required Control | Repo Capability | Status |
|---|---|---|---|
| OAuth CSRF/state | random one-use state, callback binding | Node/Next 가능, utility 없음 | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT |
| callback replay | state consume, identity/Follow unique | target documented | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT; provider NOT_VERIFIABLE |
| open redirect | internal route registry/relative allowlist | route 없음 | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT |
| forged Follow target | authenticated intent + server revalidation | target FK/relation | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT |
| session theft | Secure/HttpOnly/SameSite, TTL, rotation, TLS | framework 가능; TLS 외부 | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT |
| XSS/session exposure | HttpOnly, sanitized content, CSP | 06 policy documented; headers 없음 | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT |
| CSRF mutation | POST, Origin, SameSite | utility 없음 | NOT_IMPLEMENTED |
| account enumeration | generic response, rate limit | public auth/limiter 없음 | NOT_IMPLEMENTED |
| OAuth token leakage | no persistence, redacted logs | runtime 없음 | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT |
| PII logging | allowlisted structured logs | public identity events 없음 | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT |
| deleted-user stale session | request마다 User ACTIVE check | target status | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT |
| preference token forgery | scoped signature/AEAD, expiry, rotation | Node 가능; module 없음 | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT |

## 18. Analytics Privacy

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

현재 analytics는 **NOT_IMPLEMENTED**다. Canonical opaque `user_id`/`institution_id`를 쓰고 Kakao subject, email, OAuth token/code를 보내지 않는 경계는 구현 가능하다. `child_birth_year`는 아동 관련 개인정보로 Follow funnel에 필요하지 않으므로 기본 property에서 제외한다. UTM/source는 PendingFollowIntent의 allowlisted short fields만 carry하고 arbitrary query/PII를 금지한다. Anonymous click/auth/follow completion은 별도 event로 측정하며 provider subject로 stitching하지 않는다.

## 19. Active Monitoring Parent

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

PostgreSQL에서 다음으로 재현 가능하다.

```text
User ACTIVE
AND EXISTS ACTIVE Follow
AND current UserEmail USABLE
AND latest SERVICE_EMAIL_UPDATES = GRANTED
AND EMAIL Preference = ENABLED
```

Latest consent는 `(user_id, consent_type, decided_at DESC, id DESC)` + `DISTINCT ON`/lateral query로 충분하다. Follow count는 distinct active logical Follow를 센다. Email/preference missing은 false다. Warehouse/current-consent projection은 MVP에 필요 없다.

## 20. IFN-001 ~ IFN-027

| IFN | Decision | Repository Evidence | Status | Adjustment |
|---|---|---|---|---|
| 001 | User independent of subject/email | target separate tables | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | schema 구현 |
| 002 | Kakao not User PK | UUID User + composite identity | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | adapter/config |
| 003 | no long-lived provider token | token store/use case 없음 | SUPPORTED | redaction test |
| 004 | cookie session, no Redis | Next/Node capable | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | cookie + DB status |
| 005 | anonymous public, Follow gated | IA/cache 호환 | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | auth boundary |
| 006 | click creates PendingIntent | cookie capable | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | ephemeral state |
| 007 | no permanent intent table | persistence 필요 evidence 없음 | SUPPORTED | state purpose 분리 |
| 008 | Terms/Privacy for ACTIVE | target consent/User | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | activation guard |
| 009 | service email optional | independent child/preference | SUPPORTED | safe disabled default |
| 010 | Email may be absent | optional child | SUPPORTED | UI unavailable |
| 011 | Profile optional | optional child | SUPPORTED | step 비차단 |
| 012 | Consent ≠ Preference | append-only vs current | SUPPORTED | latest tie-breaker |
| 013 | Follow ≠ Email Preference | independent tables | SUPPORTED | commands 분리 |
| 014 | Institution Follow target | target FK/relations | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | server relation validation |
| 015 | Follow + Episode | 04A unique/lock pattern | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | schema/service |
| 016 | Unfollow leaves global preference | independent rows | SUPPORTED | no preference write |
| 017 | Email OFF leaves Follow | independent rows | SUPPORTED | UI state 분리 |
| 018 | signal Episode/send current | 04/05/05A target | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | resolver/worker |
| 019 | no retroactive email | interval + delivery unique | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | replay test |
| 020 | pre-send suppress | target Delivery/Attempt; worker 없음 | NOT_IMPLEMENTED | immediate recheck |
| 021 | My Preppy private/noindex | App Router 가능; route 없음 | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | dynamic/no-store |
| 022 | analytics no email/subject | analytics 없음 | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | event allowlist |
| 023 | anchor retain/PII erase | 04A deletion/FK | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | child physical delete |
| 024 | no legacy email merge | separate schema/no runtime link | SUPPORTED | lookup 금지 |
| 025 | legacy delivery not canonical | Cycle/Subscription FK | SUPPORTED | query/UI 분리 |
| 026 | webhook by message/Attempt | target attempt index | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | hash guard; provider unknown |
| 027 | marketing separate | service consent type 분리 | SUPPORTED | future type 별도 |

No IFN decision is `CONFLICT`.

## 21. Acceptance Scenarios

| # | Scenario | Status | Validation |
|---:|---|---|---|
| 1 | Anonymous Follow | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | intent + onboarding + Follow transaction |
| 2 | Existing User Follow | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | direct idempotent command |
| 3 | Callback Retry | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | identity/follow/episode unique; provider replay unknown |
| 4 | Kakao Email Missing | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | User/Follow valid, email disabled |
| 5 | Optional Profile skipped | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | no activation blocker |
| 6 | Email OFF | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | Follow active, send suppress |
| 7 | Unfollow one Institution | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | pair-scoped; others/preferences unchanged |
| 8 | Re-follow | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | same Follow, new Episode |
| 9 | Old signal before Follow | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | interval excludes; no retroactive send |
| 10 | Consent revoked | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | append+disable+suppress; Follow remains |
| 11 | Hard bounce | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | Attempt lookup/hash guard; provider unknown |
| 12 | Delete | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | session deny/PII erase/close/suppress/history retain |
| 13 | Article CTA | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | structured Institution relation |
| 14 | Opportunity CTA | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | Follow Institution |
| 15 | Legacy same email | SUPPORTED | no canonical legacy lookup/merge |

Target schema/auth/routes/workers가 없으므로 1~14는 구현과 test 후에만 실제 PASS다.

## 22. Invariant Matrix

| Rule | DB | Transaction | Session/Auth | Worker | Policy | Feasibility |
|---|---|---|---|---|---|---|
| one subject → one User | composite unique | User+Identity atomic | state | — | conflict reread | SUPPORTED_AFTER_TARGET_IMPLEMENTATION |
| ACTIVE requires required consent | history/index | User lock/latest decisions | ACTIVE check | — | activation command | SUPPORTED_AFTER_TARGET_IMPLEMENTATION |
| one User–Institution Follow | pair unique | upsert+lock | ACTIVE actor | — | followable recheck | SUPPORTED_AFTER_TARGET_IMPLEMENTATION |
| one open Episode | partial unique/check | Follow lock/state sync | — | interval read | no bypass writer | SUPPORTED_AFTER_TARGET_IMPLEMENTATION |
| Follow idempotent | unique guards | current-state success | authenticated | — | transition-aware event | SUPPORTED_AFTER_TARGET_IMPLEMENTATION |
| Email optional | optional child | optional branch | no email claim | suppress | UI unavailable | SUPPORTED_AFTER_TARGET_IMPLEMENTATION |
| Preference separate | current unique | independent update | auth/token | recheck | Follow unchanged | SUPPORTED_AFTER_TARGET_IMPLEMENTATION |
| Follow after signal no send | episode interval | DB timestamps | — | signal query | no retroactive backfill | SUPPORTED_AFTER_TARGET_IMPLEMENTATION |
| send-time suppression | status/reason | short recheck tx | — | pre-call query | boundary documented | SUPPORTED_AFTER_TARGET_IMPLEMENTATION |
| deleted User no access | User status | deletion tx | request ACTIVE check | suppress | cookie not authority | SUPPORTED_AFTER_TARGET_IMPLEMENTATION |
| deleted PII removed | explicit child delete | one tx | cookie clear | raw email absent | safe audit/log | SUPPORTED_AFTER_TARGET_IMPLEMENTATION |
| legacy no auto merge | separate FK graph | no bridge | no email identity lookup | separate history | explicit migration only | SUPPORTED |
| no PII analytics/log | no raw Delivery email | payload allowlist | no PII claim | redaction | privacy tests | SUPPORTED_AFTER_TARGET_IMPLEMENTATION |
| PendingIntent safe | no permanent row | validated consume | AEAD/expiry/purpose | — | safe fallback | SUPPORTED_AFTER_TARGET_IMPLEMENTATION |

## 23. Implementation Order

1. target identity/consent/preference/follow schema + invariant tests
2. session/auth context, CSRF/origin/redirect policy, env validation
3. provider-neutral auth adapter + Kakao adapter
4. auth start/callback/logout + state/PendingFollowIntent
5. onboarding/activation transaction
6. Follow service + concurrency/idempotency tests
7. My Preppy private route/projection/noindex
8. public Follow island/private no-store endpoints
9. Email/preference/action token
10. deletion/re-registration + PII erase tests
11. Notification signal/send/bounce integration
12. analytics event allowlist/privacy validation

## 24. Architecture Amendment Candidate

**None.** 모든 gap은 implementation adjustment 또는 external verification이다. `auth_sessions`, permanent PendingFollowIntent table, legacy merge, Follow state trigger를 07에 추가할 근거가 없다.

## 25. Required Questions

| Q | Answer |
|---|---|
| Q1 구현 가능한가? | **YES_WITH_IMPLEMENTATION_ADJUSTMENTS** |
| Q2 amendment 필요한가? | **NO** |
| Q3 public auth/session runtime 존재? | **NO**. Admin auth env validation만 있음 |
| Q4 auth_sessions 없이 충분? | **YES**. secure cookie + request별 User ACTIVE check |
| Q5 PendingIntent DB 없이 안전? | **YES**. state와 분리한 short-lived authenticated cookie |
| Q6 activation+Follow one transaction? | **YES**. same monolith/DB; provider network는 밖 |
| Q7 Email 없는 ACTIVE/Follow 안전? | **YES**. delivery eligibility만 false |
| Q8 Consent/Preference 분리 적합? | **YES**. legal history와 current control 분리 |
| Q9 Follow+Episode retry/reactivation 충분? | **YES**. pair/open unique + row lock |
| Q10 My Preppy/public island와 06A 양립? | **YES**. private no-store/public cache 분리 |
| Q11 stale cookie delete 차단? | **YES**. 모든 protected request User ACTIVE check |
| Q12 legacy same-email merge 회피? | **YES**. canonical code가 legacy lookup하지 않음 |
| Q13 NOT_VERIFIABLE? | Kakao email/subject/replay/timeout, email provider message ID/idempotency/webhook signature-order/bounce taxonomy, deployment TLS/rate limit |
| Q14 08로 진행? | **YES** |

## 26. Identity/Follow/Notification Repository Validation Verdict

**Architecture:**
VALID_WITH_IMPLEMENTATION_ADJUSTMENTS

**Ready for 08_ANALYTICS_ARCHITECTURE:**
YES

**Architecture Blockers:**
None.

**Required Amendments:**
None.

**Implementation Adjustments:**

- target identity/follow/notification schema와 tests 선행
- OAuth state/PendingFollowIntent 분리, expiry/allowlist/tamper control
- cookie session의 request별 User ACTIVE DB check
- identity create/Follow activate unique+transaction+row-lock protocol
- My Preppy no-store/public Follow island cache 분리
- pre-send eligibility recheck와 no-network-lock boundary
- child PII physical delete 및 old-address bounce hash guard

**Current Auth Runtime:**
No public User auth/session runtime exists. Only admin auth environment validation is present.

**Recommended Session Model:**
Short-lived secure authenticated/encrypted HttpOnly cookie carrying opaque User ID and metadata, with current User ACTIVE database validation on every protected request; no MVP `auth_sessions` table.

**Recommended Pending Follow Model:**
Short-lived purpose-bound authenticated/encrypted PendingFollowIntent cookie, separated from one-use OAuth state; Institution revalidated in the Follow transaction; no permanent DB table.

**Highest Identity/Security Risks:**

1. callback/Follow concurrency를 application check만으로 처리해 duplicate User/Episode를 만드는 위험
2. cookie만 신뢰하거나 public cached tree에 private state를 섞어 stale access/PII cache leak을 만드는 위험
3. pre-send recheck, log redaction, old-address bounce hash guard 누락으로 revoked/deleted User에게 보내거나 새 email을 잘못 suppress하는 위험

**External Provider Unknowns:**

- Kakao email scope/availability/verified semantics와 subject contract
- OAuth callback replay/timeout/error semantics
- email provider idempotency, provider message ID, webhook signature/ordering
- bounce/complaint taxonomy와 email-only reconciliation requirement
- production TLS/security headers/rate-limit controls

**Recommended Next Step:**
`08_ANALYTICS_ARCHITECTURE.md`
