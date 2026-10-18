# Reviewed English-kindergarten sessions

This change depends on PR40, commit `5ce108874c282a4067bf0965de5e452807113ec5`. It does not include PR39 or authorize a Railway change, merge, or production import.

## Reviewed data and identities

`data/review/english-kindergarten-20261018/session-registration-package.json` contains **80 campuses:35 existing and45 new;213 dated sessions (199 future/14 past at2026-10-18 16:50 KST)**. Seven researched locations without a dated session remain research records; an undated waitlist is not converted into an event. Reservation states are177 unknown,34 closed,2 open as explicitly published; no live seat availability is claimed.

The four source transports were reconstructed from trusted delegated JSON and are not byte-identical to the original files. `transport-manifest.json` records both hashes without claiming equality. Semantic counts, unique record IDs,65 namespaced official session IDs and81 official campus IDs were checked. `resolved-campus-mappings.json` contains the eight official identity resolutions. Existing UUIDs/name/address were read from the actual public directory and are checked again in runtime planning. Production drafts, hidden institutions, source bindings and existing versions still require authenticated dry-run.

Existing names are retained, including Harangsup. Reviewed names are persisted in english_campus_aliases independently of session dates/cancellations; matching aliases are displayed on institution cards. Card links open the institution’s full schedule, rather than implying a search-matched event anchor. The brand transition date is unknown. PSA Yongsan has one explicit address correction; the old address remains in the backup and reviewed official identity snapshot. No relocation/date is inferred.

Session keys are fixed identities independent of dates. Official namespace/value is preserved; URL-safe keys use hyphens. Where no official session ID was observed, the initial reviewed key is a fixed registry key. **Never regenerate it from a changed date.** Reconcile new research records to that registry before preparing a later package. A changed date under the same key creates a new version of the same opportunity. An ambiguous pre-existing same-campus/time event rejects instead of being merged automatically.

Original published target text and registration conditions remain in reviewed source contexts. Only explicit age labels are normalized; birth years do not generate ages. Unknown ages appear under all ages but do not satisfy a specific-age search. The package retains raw conditions while public notes use parent-facing Korean. A native opportunity's event time, application deadline and reservation state are separate fields.

## Validation, backup and apply

Validate without database access:

```sh
npx tsx --tsconfig scripts/db/tsconfig.json scripts/data/register-english-kindergarten-sessions.ts --package <reviewed-json>
```

The command prints the checksum of the parsed canonical package. Use that checksum, not a raw file hash, for `--expected-checksum`.

Authenticated dry-run requires an existing ACTIVE administrator and an authorized database connection:

```sh
npx tsx --tsconfig scripts/db/tsconfig.json scripts/data/register-english-kindergarten-sessions.ts --package <reviewed-json> --dry-run --admin-user-id <existing-id> --backup-dir <protected-backups>
```

Review every current identity/version and reject, exact create/update/unchanged counts and full original backup. All current institutions, including draft/hidden roots, participate in duplicate planning. Do not create a new administrator, obtain tokens, expand privileges or guess a mapping to make the command run. New roots require official identity evidence and at least one dated session. Unknown operational status remains UNKNOWN.

Apply additionally requires `--apply --expected-checksum <validated-checksum> --cache-consumers-v2-ready`, explicit `EMAIL_SEND_ENABLED=false` and `WORKER_ENABLED=false` in the execution runtime. It writes an exclusive original backup before the transaction and a complete `.readback.json` after checking all rows are unchanged on repeat. Any mapping reject prevents all domain writes. Stale versions reject. Evidence-only replacement is rejected for explicit review rather than silently updating verification dates.

The Docker runtime includes scripts/src but does not bundle `data/review`. Supply the reviewed JSON through an authorized management execution path. A local test connection is not production management access.

## Worker and cache rollout gate

1. Establish an authenticated, authorized management execution path first. Inventory existing web/worker deployments, original flags, automatic main deployment and in-flight events. Pause general worker execution and preserve complete notification/delivery/non-cache outbox fingerprints. Do not cancel/delete/replay existing queues.
2. **Apply additive migration 0018 BEFORE any new web receives traffic.** Use the exact reviewed migration bytes/ledger through the verified management execution path, with the deployment sequence agreed by the operator. It only creates three tables and their constraints; it does not alter existing rows/tables. Existing public code can continue while schema is prepared. The old admin migration-status display may temporarily report the additional migration. Do not deploy a new web first to obtain access to the migration command.
3. Read back the three tables, keys/FKs and canonical migration ledger. Then deploy the verified immutable image to **every web cache handler and worker**, keeping general worker execution paused. Verify V1 article and V2 identifier-only payload compatibility. Do not retain or deploy the unrelated PR39 image configuration.
4. Provide the exact reviewed JSON/checksum through the authorized management path. Run locking production dry-run, retain its original backup, and review current public/private identities, publication states, versions, rejects and exact counts. Dry-run uses row/advisory locks and is not strictly read-only. Runtime access does not itself authorize migration/import writes.
5. After the agreed write gate, run the no-notify apply command with explicit worker/email disabled. Read back all versions, official identities, aliases, evidence and audit, verify affected public pages, and compare full queue fingerprints.
6. Drain **only CACHE_REVALIDATION_REQUESTED** using the dedicated command below. Never run the general worker with email disabled: it may permanently suppress queued deliveries.

   ```sh
   WORKER_ENABLED=false EMAIL_SEND_ENABLED=false CACHE_REVALIDATION_ENABLED=true npx tsx --tsconfig scripts/db/tsconfig.json scripts/cache-worker-once.ts
   ```

   Each invocation handles at most 10 cache events with a fixed allowlist for recovery and claiming. Compare full queue fingerprints again, then deliberately restore the prior worker/email state.
7. Do not downgrade to a V1-only handler/worker while V2 events are pending. On an uncertain result, inspect backup/audit and stable-key dry-run before retrying. Do not drop the additive identity tables as a routine code rollback.

## Local evidence and limits

`local-rehearsal-summary.json` records an isolated PostgreSQL rehearsal seeded with the126 public roots. First apply:45 new roots,1 address correction,213 sessions, zero notification/delivery/non-cache outbox additions,213 cache events. Repeating the identical package:80 unchanged campuses,213 unchanged sessions; zero new roots/versions/cache events. Full local original/readback artifacts are retained outside version control. This is **not** production dry-run and cannot reveal private draft/hidden production records.

Related integration tests cover linked captures/audit, active admin, checksum/readiness, hidden-root duplicates, legacy-name/brand search, address replay, stable-key date changes, stale writes, evidence-only rejection, atomic rollback and preservation of an existing pending notification event byte-for-byte.

Mobile browser evidence is in `docs/qa/english-kindergarten-20261018/`. Content widths375/390/412 (desktop inner widths390/405/427 accounting for15px scrollbar) passed list→ECC matching session, official CTA href, closed future session display, zero results/reset, unknown age inclusion/exclusion, preserved detail return filters and native browser back control restoration. Initial probes required stronger navigation-completion checks; the accepted evidence waits for the detail h1/result heading.

The official YBM page was actually visited in an earlier checkpoint. A final fresh-tab re-observation after clicking was denied by browser URL policy (`invalid URL`); no workaround or form submission was attempted. Final responsive checks verify the local CTA's exact official URL. No physical-device, screen-reader or usability study is claimed.

## UX Writing review

Scope: English-kindergarten lists, filters, session cards/details, empty states and published package notes. `정보를 준비하고 있어요` shells become omitted optional sections and one explicit PREPPY-registration scope notice. Unknown deadlines say `신청 마감 시각은 공식 페이지에서 확인해 주세요.` Unknown reservations never become available seats. `예약 마감` does not become `행사 종료`. Consultation, official notice, contact channel and supported application URLs have distinct conservative labels. Exact eligibility, dates, published conditions and uncertainty remain.

**UX Writing: PASS for the reviewed local screens and package copy**, with the external re-observation limitation above. This does not authorize release or assert every existing PREPPY screen complies.

## Independent review safety fixes

Migration 0018 creates durable namespaced official campus identities (database primary key), independent reviewed aliases and per-opportunity occurrence fingerprints. Apply migration via the established authorized migration path before dry-run/import. Existing private roots without a recorded official ID still require explicit identity reconciliation; the registry does not infer IDs from old names or addresses.

Existing DRAFT/HIDDEN/ARCHIVED session slugs are rejected, with current publicationState in backup/readback. They are never automatically published. Dry-run uses row/advisory locks: it performs no domain DML but is **not a strictly read-only transaction** and is not permitted through a read-only-only production approval.

Official session identity is scoped by campus + academic year + official namespace/value, independent of event time, target/booking wording, evidence URL/content and sessionKey. A changed key or rescheduled time for the same official ID requires reconciliation with the existing opportunity, never another row. Without an official ID, campus/time plus explicit normalized ages/birth years and separately reviewed programAsPublished determine occurrence identity; free-form target text, booking notes and evidence are never distinguishing identifiers. Distinct explicit official IDs or normalized audiences/programs support simultaneous rows consistently on first import and replay. Mixing an identified and unidentified row at the same campus/time requires reconciliation; dropping an official ID cannot create a distinct session. Unknown legacy same-time rows without a stored fingerprint require reconciliation. Existing fingerprints from the unreleased 2098936 image are not deployed; if a previous fingerprint format is encountered in a nonproduction rehearsal, rebuild that test fixture rather than treating it as production identity evidence.

The main briefings menu and home extend future visibility only for verified, officially evidenced NATIVE English information sessions. LEGACY_BACKED English sessions keep the previous OPEN/UPCOMING state rule, so unevidenced future CLOSED legacy rows are not newly exposed. They treat future native English information sessions independently of booking OPEN/CLOSED/UNKNOWN, excluding cancelled/nonpublic/unverified rows and requiring official evidence. Existing private-elementary and international-school state rules remain unchanged.

QA-only scripts are excluded from the Docker context; tests are not copied into the production image. Remote build/runtime validation must pass for the final SHA before any release claim.
