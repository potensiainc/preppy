# PREPPY WP-15B Post-Migration Launch Readiness

Evidence date: 2026-08-26 (KST)

## 1. Current safe state

```text
SCHEMA_READY
CAPABILITIES_DISABLED
HOBBY
FINAL_DOMAIN_UNRESOLVED
PROVIDERS_NOT_CONFIGURED
```

| Control                      | Verified state                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------ |
| Railway project/environment  | `preppy-production` / `production`                                             |
| Railway plan                 | Hobby; Pro/PITR deferred                                                       |
| PostgreSQL                   | one primary; 58 application tables                                             |
| Migration ledger             | 11 entries; latest `0010_colorful_randall_flagg`                               |
| Production preflight         | `BLOCKER=0`; one optional GA4 warning                                          |
| Customer/demo data           | none                                                                           |
| Web                          | one replica; `DATABASE_MAX_CONNECTIONS=1`                                      |
| Worker                       | one scheduled run-once target; `*/5 * * * *` UTC; `DATABASE_MAX_CONNECTIONS=1` |
| Worker execution             | `enabled=false`, `claimed=0`, `processed=0`, `failed=0`                        |
| Worker/Email/Analytics/Cache | all `false` on Web and Worker                                                  |
| Temporary origin             | `https://preppy-web-production.up.railway.app`                                 |
| Final domain                 | `UNRESOLVED` — owner input required                                            |

The Railway-generated URL remains `TEMPORARY_INFRA_ORIGIN`. It is not approved as PREPPY's canonical launch origin.

## 2. Owner decisions still required

| Decision                           | Current status            | Required owner input                                                       |
| ---------------------------------- | ------------------------- | -------------------------------------------------------------------------- |
| Final production HTTPS domain      | `UNRESOLVED`              | exact owner-controlled HTTPS origin                                        |
| Recurring logical-backup execution | `OWNER DECISION REQUIRED` | Option A or B, execution owner, schedule, and failure escalation           |
| Backup object storage/provider     | `UNRESOLVED`              | encrypted off-platform storage and retention mechanism                     |
| D10B Product cutover               | `OWNER APPROVAL REQUIRED` | separate authorization after domain/provider configuration and smoke gates |

Existing decisions remain locked:

- D6 migration recovery: Hobby plus pre/post logical backup and isolated restore fallback is owner-approved; Pro/PITR is deferred.
- D10A migration/backfill: owner-approved and completed.
- D10B cutover/capability enablement: not approved and not executed.

## 3. Canonical launch gates

| Gate | Requirement                                               | Status                                   |
| ---- | --------------------------------------------------------- | ---------------------------------------- |
| L1   | Final owner-controlled HTTPS production domain            | `OWNER INPUT REQUIRED`                   |
| L2   | Recurring logical backup operations for Hobby             | `NOT EXECUTED / OWNER DECISION REQUIRED` |
| L3   | Kakao production configuration and smoke                  | `NOT EXECUTED`                           |
| L4   | Admin OIDC production configuration and smoke             | `NOT EXECUTED`                           |
| L5   | Resend production sending/webhook configuration and smoke | `NOT EXECUTED`                           |
| L6   | GA4 production configuration and smoke                    | `NOT EXECUTED`                           |
| L7   | GSC verification and sitemap submission after L1          | `NOT EXECUTED`                           |
| L8   | Separate D10B Product cutover authorization               | `OWNER APPROVAL REQUIRED`                |
| L9   | Staged capability enablement                              | `NOT EXECUTED`                           |
| L10  | WP-16B post-cutover validation                            | `NOT EXECUTED`                           |

No speculative launch blocker is added beyond L1–L10.

## 4. Final-domain contract

```text
FINAL_DOMAIN = UNRESOLVED
OWNER INPUT REQUIRED
```

After the owner supplies the domain, one exact HTTPS origin must drive every surface:

- `APP_BASE_URL`;
- canonical metadata and public links;
- `/robots.txt` and `/sitemap.xml` origin;
- Kakao Web domain and callback;
- Admin OIDC callback;
- Resend webhook URL and email links;
- GA4 Web stream host;
- GSC property and sitemap submission;
- externally addressed cache revalidation callback, if applicable.

No domain purchase, DNS mutation, custom-domain attachment, or placeholder promotion is authorized by this document.

## 5. Recurring logical-backup decision

The verified pre-write and post-migration dumps prove the bounded migration recovery path. They do not prove recurring backup automation. A Hobby launch requires one separately approved recurring design.

### Option A — dedicated Railway scheduled backup job

```text
Railway scheduled run-to-completion job
→ pg_dump custom/no-owner/no-acl
→ client-side encryption or storage-native encryption
→ off-platform object storage
→ retention enforcement
→ alerting and periodic isolated restore verification
```

| Consideration             | Assessment                                                                                                                                   |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Security                  | private Railway DB access; job receives a dedicated backup credential and narrowly scoped storage credential; no credentials or dumps in Git |
| Cost                      | extra Railway execution plus external storage/egress; exact cost depends on owner-selected storage                                           |
| Operational complexity    | medium; one finite command, Railway schedule, storage lifecycle, and failure alerting                                                        |
| Failure visibility        | Railway job status/logs plus an explicit external alert/operations signal                                                                    |
| Restore usability         | portable custom dump retrievable independently of the production database volume                                                             |
| Required provider/storage | owner-selected encrypted off-platform object storage; no vendor selected here                                                                |

The job must not share the application Worker responsibility, must not run forever, and must not retain its only backup copy on the PostgreSQL volume.

### Option B — external scheduled operator or CI runner

```text
trusted scheduled runner
→ secure bounded production DB access
→ pg_dump custom/no-owner/no-acl
→ encrypted off-platform object storage
→ retention enforcement
→ alerting and periodic isolated restore verification
```

| Consideration             | Assessment                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Security                  | dedicated backup credential, protected runner secret store, bounded network path, and no uncontrolled public DB exposure |
| Cost                      | runner and storage costs; may reuse an approved operator platform if one already exists                                  |
| Operational complexity    | medium-to-high; secure connectivity, secret rotation, scheduler ownership, and runner hardening are external to Railway  |
| Failure visibility        | runner status plus explicit alerting; must not rely on a human noticing missed artifacts                                 |
| Restore usability         | portable and off-platform; remains usable if the Railway application project is unavailable                              |
| Required provider/storage | owner-approved runner and encrypted object storage; neither is selected here                                             |

### Required controls for either option

- dedicated least-privilege backup credential;
- no credential, DSN, dump, or manifest containing secrets in Git;
- no use of `preppy-worker` for backup processing;
- no backup-only copy on the same database volume;
- no uncontrolled public PostgreSQL exposure;
- deterministic UTC artifact naming, SHA-256, and safe manifest;
- encrypted off-platform storage and documented key/rotation owner;
- daily success/failure visibility and missed-backup alerting;
- scheduled isolated restore verification with safe aggregate evidence;
- explicit retention cleanup that never targets an unresolved/broad path.

Recommended architecture boundary: use a dedicated run-to-completion backup capability, separate from Web and the application Worker. Option A is operationally closer to the existing Railway private network; Option B may provide stronger platform independence. Final selection, storage provider, budget, and accountable operator remain owner decisions.

## 6. Backup policy to preserve

| Backup class        | Retention contract                                                           | Current state                           |
| ------------------- | ---------------------------------------------------------------------------- | --------------------------------------- |
| Daily logical       | 14 days                                                                      | target only; automation not implemented |
| Weekly logical      | 8 weeks                                                                      | target only; automation not implemented |
| Pre-write migration | at least 30 days                                                             | artifact/hash/restore evidence PASS     |
| Post-migration      | at least 30 days and until two later production backups are restore-verified | artifact/hash/restore evidence PASS     |

Automated compliance must not be claimed until a selected recurring job has produced monitored artifacts and at least one scheduled restore proof.

## 7. Provider launch checklists

### L3 — Kakao

- register the exact production Web domain;
- register `https://<FINAL_DOMAIN>/auth/kakao/callback`;
- configure production client credentials as Railway secrets;
- keep email separate from canonical identity;
- smoke login/logout and PendingFollowIntent restoration;
- verify failure paths remain fail-closed.

### L4 — Admin OIDC

- confirm one trusted production issuer and client;
- register `https://<FINAL_DOMAIN>/admin/auth/callback`;
- verify trusted discovery/JWKS, RS256, issuer, audience, nonce, and PKCE S256;
- configure domain-separated Admin session/OIDC-flow secrets;
- provision only explicitly allowed Admin subjects; no auto-linking;
- smoke login, logout, session revalidation, inactive Admin, and unknown-subject denial.

### L5 — Resend

- verify the owner-approved sending domain;
- configure `EMAIL_FROM`, `RESEND_API_KEY`, and `RESEND_WEBHOOK_SECRET` securely;
- register `https://<FINAL_DOMAIN>/api/webhooks/resend`;
- keep `EMAIL_SEND_ENABLED=false` until Stage 4 authorization;
- smoke idempotency, webhook signature, delivery reconciliation, RESULT_UNKNOWN handling, and bounce/complaint suppression.

### L6 — GA4

- create or confirm the production property and Web stream for the exact final host;
- configure `GA4_MEASUREMENT_ID` and server-only `GA4_API_SECRET`;
- configure required event-scoped custom dimensions and internal-traffic exclusion;
- re-run PII guard tests;
- keep `ANALYTICS_ENABLED=false` until Stage 5;
- smoke approved client/server events without using analytics as a Product correctness gate.

### L7 — GSC

- verify the final domain property;
- inspect `https://<FINAL_DOMAIN>/robots.txt`;
- inspect and submit `https://<FINAL_DOMAIN>/sitemap.xml`;
- inspect canonical and indexability behavior on public Institution, Opportunity, and Article routes.

No provider-console, live send, live analytics, DNS, GSC, or webhook mutation occurred in this phase.

## 8. Capability launch order — not executed

| Stage | Required action and gate                                                                                                                |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Keep Worker, Email, Analytics, and Cache OFF. This is the current state.                                                                |
| 1     | Configure final domain/providers; run public and Kakao/Admin auth smoke; keep all side-effect capabilities OFF.                         |
| 2     | Set only `CACHE_REVALIDATION_ENABLED=true`; perform bounded cache smoke and observe failures/replay controls.                           |
| 3     | Set `WORKER_ENABLED=true` while Email remains OFF; process only bounded non-email work and observe claims/leases.                       |
| 4     | Set `EMAIL_SEND_ENABLED=true` only with explicit live-email authorization; smoke delivery, reconciliation, bounce, and complaint paths. |
| 5     | Set `ANALYTICS_ENABLED=true`; perform GA4 smoke and verify safe telemetry.                                                              |
| 6     | Perform public-launch validation and hand off to WP-16B.                                                                                |

No stage was executed in this task.

## 9. Stop and rollback conditions

Stop without advancing stages if any of these occurs:

- schema/ledger mismatch or a production preflight blocker;
- unexpected customer/demo rows or unexplained row-count change;
- final origin mismatch across canonical/auth/email/analytics surfaces;
- multiple scheduler authorities or unexpected Web/Worker replica count;
- Worker claim while disabled or capability state different from the approved stage;
- missing/late/invalid recurring backup, checksum failure, or failed restore proof;
- Outbox invariant violation, stale/ambiguous provider result, or RESULT_UNKNOWN;
- auth fail-open, unknown Admin acceptance, webhook signature failure, or PII/secret leak;
- public route, sitemap, robots, or canonical regression;
- live provider side effect outside the explicitly authorized stage.

On stop: keep or return all later capabilities to OFF, preserve evidence, do not run destructive automatic rollback, and use the WP-16A decision tree to choose forward repair versus restore. Database restore cannot undo an already sent email or external provider side effect.

## 10. WP-16B entry criteria

WP-16B may begin only after:

- L1–L8 are explicitly resolved and recorded;
- recurring backup automation has monitored success plus restore evidence;
- final-domain public and Kakao/Admin auth smoke passes with all side effects OFF;
- D10B is explicitly owner-approved;
- Stages 2–5 are executed in order with observation evidence;
- no blocker, unexplained warning, secret/PII leak, or provider ambiguity remains.

## 11. Current gate

Final gate: `READY_FOR_FINAL_DOMAIN_AND_BACKUP_DECISION`.

This gate authorizes no production mutation. The next safe action is an owner decision on the exact final HTTPS domain and recurring logical-backup execution/storage design.
