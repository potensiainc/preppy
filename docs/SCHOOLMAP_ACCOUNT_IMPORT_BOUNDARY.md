# Account import: exact remaining boundary

Partial import of the 35 reviewed identities is feasible; the other three can remain in the browser queue. The three mapping conflicts do **not** technically require blocking the 35. This candidate leaves all imports disabled because the existing account contract cannot safely bind a multi-request import to a reviewed account/session, or make ambiguous retries distinguishable from a new reactivation.

## Exact primary-source identity questions

| Commute ID / official name | Original commute address (unchanged) | Existing institution/seed address | Live public institution page |
| --- | --- | --- | --- |
| `kwangwoon` / 광운초등학교 | 서울 성북구 한천로 693 | 서울특별시 성북구 한천로 694 | https://preppy-web-production.up.railway.app/institutions/kwangwoon |
| `sejong` / 세종초등학교 | 서울 광진구 능동로 209 | 서울특별시 광진구 군자로 114 | https://preppy-web-production.up.railway.app/institutions/sejong |
| `hanyang` / 한양초등학교 | 서울 성동구 왕십리로 222 | 서울특별시 성동구 살곶이길 208 | https://preppy-web-production.up.railway.app/institutions/hye |

The official names above are rendered by the public institution pages and match the repository's Schoolinfo seed names. These are not assertions that either conflicting address is current. The identity audit includes page hashes and the 35 matched UUIDs. Resolve address differences using school/registry primary sources; never infer that the public slug `hye` equals the commute slug solely from spelling.

## Existing contract evidence

- `createSessionHandler` in `src/modules/auth/http.server.ts` returns only `{authenticated: boolean}`. It does not expose an account identity, account-specific opaque import scope, onboarding completion or session generation. A→B while both are signed in produces the same response. A failed lookup also returns false, so it cannot distinguish a logout from an auth lookup failure.
- `createFollowStatusHandler` returns only authenticated/following booleans; no account binding.
- `createFollowPostHandler` accepts strictly `{institutionId}` and takes the user from the cookie present at **each** request. An `expectedAccountId` payload is rejected, not enforced as a precondition. A batch started for A could continue for B if another tab changes the session between requests. A before/after frontend check cannot undo a write already sent under B.
- The repository deduplicates logical follows by `(userId,institutionId)` using `onConflictDoNothing` and transactional reads/locks. An active follow is idempotent. But an inactive follow is deliberately reactivated, opening a new episode. Logical-row deduplication alone does **not** prevent re-adding a school the user removed after an earlier import.
- There is no import-operation receipt/idempotency key or deletion-generation precondition in the current request. If a POST commits but its response is lost, keeping the browser queue is correct. A later retry after an account-side deletion would reactivate it. Removing the queue on an unconfirmed response would instead risk losing the user's save.

## Current candidate semantics (implemented)

Browser saves are device/browser scoped and remain separate from every Kakao account. Logout does not clear them; switching A→B does not copy, delete or mutate them. There is no automatic import on login, reload or focus and no favorites API write, so it cannot silently re-add an account favorite. Deleting a browser school removes that browser ID; reloads do not recreate it. The three unresolved schools are retained exactly like all other browser saves. Shared-browser users can see these public school IDs; the UI labels their scope clearly. No account ID/token or home location is stored.

## Safe partial-import follow-up

1. Add a server-issued, short-lived opaque import context bound to the authenticated account/session generation, with onboarding eligibility. Keep it only in memory. Every import mutation checks that binding in the same authorization/transaction boundary; account switch/logout rejects outstanding work. Do not weaken existing cookie-derived authorization or accept a client-supplied user ID as authority.
2. Add a per-account operation ID and durable item receipts/tombstones. Receipt lookup precedes reactivation. Replaying an acknowledged or ambiguously committed item must return its original outcome, not reactivate a school subsequently removed. Re-import after an intentional new browser save needs a new explicit user action/generation.
3. Present an explicit review: 35 mapped candidates, existing account favorites, three unresolved items and their retained-browser status. Deduplicate by canonical UUID on the server. Do not fabricate an account favorite for an unmapped school.
4. Freeze the submitted selection generation. Remove **only** confirmed item generations after success; preserve failed/unknown/unmapped IDs. If browser storage cannot persist removal, stop and retain a recoverable in-memory receipt rather than claim durable queue cleanup. Concurrent local deletions invalidate pending items and must not be reconstructed from an old snapshot.
5. On logout/switch: abort unsent work, discard in-memory context, invalidate pending UI state, retain the anonymous queue, and require a fresh explicit review for the newly authenticated account. Confirmed imports are scoped to their server receipt's account; never copy A's private favorites into B's local/account view. An in-flight response for A must not update B's state.
6. Verify existing follow/notification/outbox semantics before release; no real-user writes or alerts for testing. Use mocks for races and isolated authorized test accounts for integration.

Required tests for that backend change: active-follow dedupe, inactive-follow/tombstone behavior, lost response before and after deletion, repeat login/retry, local deletion while pending, same school re-saved intentionally, A→B between status and POST, A→B during an in-flight response, logout/expiry/auth lookup failure, storage removal failure, duplicate tabs, partial API failure and all three unmapped-item preservation cases. These future import guarantees are **not** claimed by the current candidate.

## Verification performed now

`commute-account-boundary.test.ts` uses mocked users and activation only, never a DB or live account. It verifies that the A/B session responses are indistinguishable, follow POSTs bind independently to their request cookies and reject an invented account precondition, and logout clears the account cookie without a browser-storage-clearing header. Existing auth/follow unit suites cover same-origin enforcement and API response behavior. This demonstrates the precise contract gap; it does not pretend to test a completed merge implementation.
