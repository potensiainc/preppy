# PREPPY Production Topology Manifest

This file contains safe topology metadata only. Unknown values are `UNRESOLVED`; no provider or instance count is guessed.

| Field | Current value |
| --- | --- |
| Web instance count | UNRESOLVED |
| Worker instance count | UNRESOLVED |
| Scheduler source | UNRESOLVED |
| Database topology | UNRESOLVED |
| Email provider | RESEND (integration implemented; production account/action NOT EXECUTED) |
| Analytics mode | GA4-capable; production enablement UNRESOLVED |
| Cache mode | internal HMAC revalidation; production instance topology UNRESOLVED |
| Hosting provider | UNRESOLVED |

## Initial topology gate

The intended initial production topology is `UNRESOLVED`. This is a **BLOCKER FOR WP-15B** because the current OAuth replay guard, Admin/OAuth rate limits, and cache replay guard are process-local. WP-15B may proceed only after one of these is true:

1. the approved initial deployment is explicitly single-instance for every affected capability and the runbook records that constraint; or
2. distributed OAuth replay, distributed rate limiting, and distributed cache replay are implemented and verified.

## Multi-instance worker contract

If more than one Worker is selected, production must preserve:

- PostgreSQL SKIP LOCKED claim coordination;
- durable lease ownership by bounded worker identifier;
- stale lease recovery using the same event-capability filter as claim;
- one recorded scheduler/runner source;
- no claim when `WORKER_ENABLED=false`;
- no cache-event claim when `CACHE_REVALIDATION_ENABLED=false`.

The code supports database-coordinated claims, but the actual worker instance count and scheduler remain `UNRESOLVED` until the deployment owner records them.

## Required safe update fields

Before WP-15B, an operator must replace each applicable `UNRESOLVED` value with a non-secret provider/topology fact, date, owner, and validation status. Credentials, tokens, DSNs, raw provider payloads, and customer data never belong in this manifest.
