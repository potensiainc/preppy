# PREPPY WP-16A Production Readiness Checklist

Allowed values: `PASS`, `FAIL`, `NOT EXECUTED`, `NOT APPLICABLE`.

## Owner decisions

| Decision | Proposal | Status |
| --- | --- | --- |
| Recovery point objective | RPO <= 24h — PROPOSED — OWNER APPROVAL REQUIRED | NOT EXECUTED |
| Recovery time objective | RTO <= 2h — PROPOSED — OWNER APPROVAL REQUIRED | NOT EXECUTED |
| Backup retention | Retention — PROPOSED — OWNER APPROVAL REQUIRED | NOT EXECUTED |
| Hosting provider/snapshot/PITR | UNRESOLVED | NOT EXECUTED |
| Initial production topology | UNRESOLVED | FAIL |

## WP-16A tooling and drill

| Check | Status | Evidence rule |
| --- | --- | --- |
| Dedicated backup source guard | PASS | safe database label only |
| Dedicated restore target guard | PASS | target differs from source/production |
| Shell-free fixed PostgreSQL arguments | PASS | unit/source review |
| Artifact bounded path/no overwrite | PASS | OS temp class only |
| Artifact SHA-256 | PASS | hash only, no contents |
| Real non-production backup/restore | PASS | local PostgreSQL 16 custom-format drill |
| Migration ledger restored | PASS | exact identifier/hash order through 0010 |
| Critical counts restored | PASS | exact comparison |
| Canonical invariants/read smoke | PASS | WP-15A policies reused |
| Live providers called | NOT APPLICABLE | prohibited in WP-16A |

## Observability and kill switches

| Check | Status |
| --- | --- |
| Admin-only operational snapshot | PASS |
| Public `/api/health` remains liveness-only | PASS |
| Worker off causes no claim/recovery/dispatch | PASS |
| Email off causes no provider call | PASS |
| Analytics off selects Noop/no GA request | PASS |
| Cache off excludes claim/recovery and false processing | PASS |
| `RESULT_UNKNOWN` is first-class | PASS |
| Monitoring overdue reuses canonical policy | PASS |

## Production prerequisites

| Check | Status |
| --- | --- |
| Actual production WP-15A read-only preflight | NOT EXECUTED |
| Fresh production backup immediately before writes | NOT EXECUTED |
| Production restore capability confirmed | NOT EXECUTED |
| Production DB roles provisioned/tested | NOT EXECUTED |
| Topology and distributed hardening gate resolved | FAIL |
| Explicit user authorization for WP-15B | NOT EXECUTED |

## Final gate

- `READY_FOR_WP15B`: all required items PASS; this still does not authorize production writes.
- `BLOCKED`: any required item FAIL or correctness/security-critical item remains UNRESOLVED.

Current tracked-document gate: `BLOCKED` until production topology is resolved and all production prerequisites are re-evaluated.
