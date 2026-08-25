# PREPPY WP-15B Final Owner Decisions

## 1. Owner decisions

### D1. Production platform

- Recommended: Railway.
- Status: `RECOMMENDED`.
- Owner input: approve Railway or record an alternative platform.
- Boundary: approval permits a later provisioning request only; it does not permit deployment, migration, backfill, or cutover.

### D2. Initial topology

- Recommended: one Web instance, one scheduled run-once Worker, Railway Cron every five minutes as the only scheduler authority, one PostgreSQL primary, and horizontal autoscaling off.
- Status: `RECOMMENDED`.
- Owner input: approve or reject the complete initial topology and cadence.
- Boundary: no second Web instance is allowed until distributed OAuth replay, distributed rate limiting, and distributed cache replay are implemented and verified.

### D3. Production domain

- Decision required: provide or select the exact owner-controlled HTTPS domain.
- Status: `UNRESOLVED`.
- Owner input: record the final domain without credentials or DNS secrets.
- Boundary: `https://preppy-web-preview-preview.up.railway.app` is Preview-only. A Railway-generated production URL may support temporary infrastructure smoke, but it is not the final SEO, canonical, Kakao, Resend, GA4, or GSC origin.

### D4. Recovery point objective

- Recommended: RPO `<= 24 hours`.
- Status: `RECOMMENDED`.
- Owner input: approve or reject the target.

### D5. Recovery time objective

- Recommended: RTO `<= 2 hours`.
- Status: `RECOMMENDED`.
- Owner input: approve or reject the target.

### D6. Backup and retention policy

- Recommended PREPPY policy: retain the fresh pre-cutover recovery point for 30 days and until two verified post-cutover backups exist; retain daily backups for 14 days and weekly backups for 8 weeks.
- Status: `RECOMMENDED`.
- Owner input: select one option:
  - A. Railway native recovery plus a fresh cutover logical backup, with an explicit resolution for the shorter native daily/weekly retention;
  - B. Railway native recovery plus supplemental logical/offsite retention that satisfies the PREPPY policy;
  - C. approve a revised PREPPY retention policy.
- Boundary: Railway recovery capability and PREPPY retention compliance are separate claims. Neither PITR nor the WP-16A non-production drill satisfies the fresh cutover backup gate.

### D7. Database role model

- Recommended: separate read-only preflight, migration, Web runtime, and Worker roles.
- Bounded MVP exception: Web and Worker may share one least-privilege application role initially; read-only preflight and migration roles must remain separate.
- Status: `RECOMMENDED`.
- Owner input: approve the fully separated model or explicitly approve the bounded Web/Worker exception.

### D8. Railway production provisioning

- Decision required: authorize a later bounded operation to create/configure Railway production resources.
- Status: `UNRESOLVED`.
- Owner input: approve or reject provisioning after D1–D7 are resolved.
- Boundary: provisioning approval is not deployment approval and is not production-write approval.

### D9. External provider configuration

- Decision required: authorize later configuration of Kakao, Admin OIDC, Resend, GA4, and GSC for the final domain.
- Status: `UNRESOLVED`.
- Owner input: approve the provider configuration scope and accountable operator.
- Boundary: this decision does not authorize a live email, GA event, DNS mutation, login smoke, or provider-side mutation in the current phase.

### D10. Production migration, backfill, and cutover

- Decision required later: grant a separate, time-bounded production-write authorization only after provisioning, provider readiness, the real read-only production preflight, and the fresh-backup gate pass.
- Status: `NOT EXECUTED`.
- Owner input: none in this phase beyond acknowledging that a later explicit approval is mandatory.
- Boundary: no current approval permits production migration, backfill, Worker enablement, Email enablement, Analytics enablement, Cache enablement, or deploy.

Automatically approved decisions: `NONE`.

## 2. Decision status contract

Only these values are valid in this document:

- `RECOMMENDED`: repository-backed candidate awaiting an owner decision.
- `OWNER APPROVED`: explicit owner approval with a non-secret evidence reference, date, and accountable owner.
- `OWNER REJECTED`: explicit owner rejection with a replacement decision or follow-up owner action.
- `UNRESOLVED`: the owner choice or required fact is not available.
- `NOT EXECUTED`: an operational decision or action deliberately has not occurred.
- `BLOCKED`: a prerequisite prevents a safe decision or next action.

No repository capability, Preview result, proposal, example, or non-production rehearsal may be converted automatically into `OWNER APPROVED`.

## 3. Evidence baseline and phase boundary

- Accepted UI baseline: `4e9e36c1dd99de7d78250cc75adb653952b70e5b`.
- Remote `main` includes WP-UI-02 and the pathname scroll-restoration fix at that baseline.
- Railway Preview evidence confirms build, HTTPS Preview runtime, synthetic Preview PostgreSQL, public routes, dynamic sitemap, and the accepted UI baseline.
- Railway production platform: `RECOMMENDED`; production provisioning: `NOT EXECUTED`.
- Actual production WP-15A read-only preflight: `NOT EXECUTED`.
- Fresh production backup: `NOT EXECUTED`; it is an execution-time gate immediately before the first separately authorized production write.
- Production actions performed by this finalization phase: none.

## 4. Required owner record

For every future `OWNER APPROVED` or `OWNER REJECTED` transition, record:

- decision identifier D1–D10;
- decision value;
- accountable owner;
- decision date;
- non-secret evidence reference;
- any expiry, exception, or follow-up condition.

Secrets, DSNs, tokens, provider payloads, PII, and raw production data are forbidden in the decision record.

## 5. Current gate

Final gate: `READY_FOR_OWNER_APPROVAL`.

The repository recommendation pack is complete, but no owner-only decision above is approved automatically. Production provisioning, provider configuration, deployment, production preflight, backup, migration, backfill, cutover, or side-effect enablement requires its own later authorization and evidence gate.
