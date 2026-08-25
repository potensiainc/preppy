# PREPPY WP-15B Production Migration Result

Evidence date: 2026-08-26 (KST)

Final gate: `PRODUCTION_MIGRATION_COMPLETE_CAPABILITIES_DISABLED`

## 1. Decision boundary

- Railway remains on Hobby. No billing-plan change occurred.
- D10A schema migration and deterministic backfill was owner-approved for this bounded phase and is complete.
- D10B Product cutover and capability enablement remains `NOT APPROVED` / `NOT EXECUTED`.
- Railway Pro and native PITR are deferred. The owner-approved MVP recovery gate was a fresh logical backup, SHA-256, isolated restore proof, controlled migration/backfill, and a verified post-migration logical backup.
- No Product/demo/customer seed, import, custom-domain/DNS action, provider-console action, deploy, or live provider call occurred.

## 2. Production identity and resource boundary

| Property | Verified value |
| --- | --- |
| Workspace | Potensia Inc project workspace |
| Railway project | `preppy-production` |
| Environment | `production` |
| PostgreSQL | one primary, PostgreSQL 18.6 |
| Web | `preppy-web`, one replica |
| Worker | `preppy-worker`, one scheduled run-once target |
| Scheduler | Railway Cron `*/5 * * * *` UTC; no second authority |
| Preview isolation | `preppy-ui-preview` was not targeted or modified |
| Temporary infrastructure origin | `https://preppy-web-production.up.railway.app` |

The temporary Railway origin is not the final canonical, SEO, OAuth, email, GA4, webhook, or GSC origin.

## 3. Pre-write safety gates

Both Web and Worker were verified with these values before the first application write and again afterward:

```text
WORKER_ENABLED=false
EMAIL_SEND_ENABLED=false
ANALYTICS_ENABLED=false
CACHE_REVALIDATION_ENABLED=false
```

The scheduled Worker reported `enabled=false`, `claimed=0`, `processed=0`, and `failed=0`.

The production database classification immediately before backup/migration was `FRESH_EMPTY_PRODUCTION_BASELINE`:

- public application tables: `0`;
- migration-ledger tables/entries: `0`;
- customer/user rows: `0`;
- Preview/demo data: absent.

Role verification passed:

- `preppy_preflight_ro`: transaction read-only, SELECT/introspection only, no schema CREATE;
- `preppy_migration`: distinct operator role, no superuser/createdb/createrole/bypass-RLS attributes;
- `preppy_runtime`: Web/Worker DML role, no schema CREATE;
- migration credential excluded from Web and Worker runtime configuration.

## 4. Pre-write logical backup and restore

| Evidence | Result |
| --- | --- |
| UTC timestamp | `2026-08-25T17:21:21Z` |
| Method | in-network PostgreSQL 18 `pg_dump` through the migration/operator capability |
| Format | custom, `--no-owner`, `--no-acl` |
| Size | `1,197` bytes |
| SHA-256 | `c77ad786627c0eeef5454fd88a99fa871be07d478d80e32c7251f7471036f6c7` |
| Storage | `OPERATOR_LOCAL_OUTSIDE_GIT` |
| Safe role manifest | generated; no password/hash/DSN |
| Restore target | dedicated local isolated PostgreSQL 18 container/database |
| Restore duration | `171 ms` |
| Restored public tables | `0` |
| Restored migration entries | `0` |
| Result | `PASS` |

No production dump or manifest is tracked by Git.

## 5. Migration and least-privilege grants

The canonical `npm run db:migrate` command ran once through a bounded Railway private-network operator execution with `preppy_migration` and `DATABASE_MAX_CONNECTIONS=1`.

- duration: `2,979 ms`;
- applied ledger entries: `11`;
- range: repository migrations `0000` through `0010_colorful_randall_flagg`;
- latest: `0010_colorful_randall_flagg`;
- missing, unexpected, duplicate, or failed migration entries: `0`.

Two narrow grant corrections were necessary and stayed within the approved role policy:

1. database-level CREATE for `preppy_migration`, required for the Drizzle ledger schema;
2. `drizzle` schema USAGE plus migration-ledger SELECT for `preppy_preflight_ro`.

Post-migration grants verified:

- preflight role: SELECT on 58 public tables; no public write or schema CREATE;
- runtime role: bounded SELECT/INSERT/UPDATE/DELETE on 58 public tables; no schema CREATE;
- migration role: not configured on Web or Worker.

## 6. Backfill and idempotency

The canonical sequence ran twice: Institution, Opportunity, then Source Bindings.

| Domain | Pass 1 | Pass 2 |
| --- | --- | --- |
| Institution | scanned/created/linked/skipped/blockers: all `0` | all `0` |
| Opportunity | scanned/created/linked/skipped/blockers: all `0` | all `0` |
| Source Bindings | legacy/canonical/planned/skipped/blockers/warnings/not-imported: all `0` | all `0` |

Unexpected legacy rows, conflicts, duplicates, force operations, and second-pass mutations: `0`.

The zero-row result is the expected deterministic behavior for the verified fresh database.

## 7. Side-effect guard

After both backfill passes:

- `opportunity_changes`: `0`;
- `notifications`: `0`;
- `notification_deliveries`: `0`;
- `notification_delivery_attempts`: `0`;
- `outbox_events`: `0`;
- Worker claims/provider email calls/GA requests/cache requests: `0`.

All four capability switches remained false.

## 8. Full WP-15A production preflight

The full canonical application-schema preflight ran with `preppy_preflight_ro` in a bounded `REPEATABLE_READ_READ_ONLY` transaction. It did not fall back to the runtime or migration credential.

| Result | Value |
| --- | --- |
| Exit code | `0` |
| Migration ledger | `MATCH`, 11 entries, latest `0010` |
| Missing tables/columns/indexes/constraints | `0 / 0 / 0 / 0` |
| BLOCKER | `0` |
| WARNING | `1` |
| INFO | `4` |

The warning was `OPTIONAL_GA4_CONFIG_MISSING`; Analytics remains intentionally disabled and this is not a Product-correctness blocker.

During verification, the preflight constraint query produced a false negative because `information_schema.table_constraints` hides constraints from a SELECT-only role. The bounded, test-covered safety fix in this checkpoint changes that read to `pg_catalog.pg_constraint`. The production preflight used that exact patch only for the operator command, then restored the running container's source file to its verified original hash. No deployed Web bundle or persistent production artifact was modified.

## 9. Public read and disabled Worker smoke

The runtime needed the documented bounded connection budget `DATABASE_MAX_CONNECTIONS=1` on both Web and Worker. Both services were redeployed from the unchanged application baseline with every capability still false.

| Route | Result |
| --- | --- |
| `GET /api/health` | HTTP 200 |
| `GET /` | HTTP 200 |
| `GET /institutions` | HTTP 200, empty state permitted |
| `GET /sitemap.xml` | HTTP 200 |
| `GET /robots.txt` | HTTP 200 |

The scheduled Worker continued to report `enabled=false`, `claimed=0`, `processed=0`, and `failed=0` after migration and redeployment. No real Kakao/Admin OIDC login or provider live smoke was attempted.

## 10. Post-migration logical backup and restore

| Evidence | Result |
| --- | --- |
| UTC timestamp | `2026-08-25T17:44:57Z` |
| Method/format | PostgreSQL 18 custom dump, `--no-owner`, `--no-acl` |
| Size | `253,373` bytes |
| SHA-256 | `e92f5cfd33bd9e97cb92d50a3b411a976ec355ddc5ab328f85540e0e7fcdee33` |
| Storage | `OPERATOR_LOCAL_OUTSIDE_GIT` |
| Restore target | clean dedicated local isolated PostgreSQL 18 database |
| Restore duration | `307 ms` |
| Migration ledger | 11 entries; hash sequence exactly matches production; latest `0010` |
| Application tables | 58; all aggregate row counts exactly match production |
| Catalog comparison | 249 relations, 919 columns, 189 indexes, 752 constraints; all exact |
| Canonical bridge/invariant read queries | `PASS` |
| Result | `PASS` |

The operator evidence manifest contains only safe metadata and is stored outside Git. The restore comparison used the production ledger directly; local Windows CRLF checkout hashes were not substituted for the Linux production ledger.

## 11. Backup retention and future PITR trigger

- pre-write backup: retain at least 30 days;
- post-migration backup: retain at least 30 days and until two later production backups are restore-verified;
- after launch daily logical backup target: 14 days;
- weekly logical backup target: 8 weeks;
- daily/weekly automation: deferred to a separately designed launch/immediate-post-launch operations task; no extra Worker/Cron service was created;
- Railway Pro/PITR: deferred, not enabled, and not represented as passing.

Re-evaluate Pro/PITR when any owner-approved trigger in `docs/15B_FINAL_OWNER_DECISIONS.md` becomes true.

## 12. Remaining launch gates

1. Select the exact owner-controlled production HTTPS domain and align every canonical/provider callback URL.
2. Configure Kakao, Admin OIDC, Resend, GA4, and GSC under that final origin; retain safe disabled defaults.
3. Design and operationalize recurring logical-backup automation and verify subsequent restore evidence.
4. Obtain separate explicit D10B Product cutover/capability-enable authorization.
5. Follow the runbook enable sequence and complete WP-16B post-cutover validation.

No secret, DSN, credential, token, raw payload, Article HTML, email address, OAuth subject, or other PII is included in this document.
