# PREPPY 41 Private Elementary Production Detail Bootstrap Design

## Goal and fixed boundaries

Populate the existing 41 published `PRIVATE_ELEMENTARY` Institution detail pages with current, official, source-backed facts and admission knowledge. The bootstrap reuses the current public read model and existing canonical tables. It creates no migration, schema, UI, scheduler, notification, follow, article, or authentication architecture.

The exact 41-school allowlist comes from the checksum-bound PREPPY seed dataset and is matched to Production by deterministic Institution id, slug, name, category, and `PUBLISHED` state. The runner does not use `institution_registry_identities` and does not inspect or require the migration ledger.

## Execution boundary

The default mode is dry-run. Network collection, bounded discovery, document decoding, extraction, proposal ranking, and validation all finish before a database write transaction begins.

Apply uses one atomic transaction per school. That transaction may write only that school's Sources and bindings, Observations and Snapshots needed by the public read model, Facts and Fact Versions/Evidence, and Native Opportunity/Version/Evidence/binding. A constraint, invariant, or database error rolls back only that school. Remaining schools continue. The final report is always emitted; any school persistence failure produces a non-zero process exit after all selected schools have been attempted.

`NOT_FOUND` and `NOT_ANNOUNCED` are successful admission knowledge results. Candidate-level failures are warnings when another official page supplies sufficient evidence. `SCHOOL_FETCH_FAILED` means the official root could not be meaningfully collected; it does not cancel independently validated registry baseline Facts. The report separates registry bootstrap, website collection, and admission knowledge. Web failures retain a non-zero final exit while successful per-school baseline transactions remain committed.

## Collection and discovery

The existing static HTTP transport, URL policy, SSRF protection, robots policy, byte budgets, redirects, timeouts, and HTML analysis are reused. A narrow optional page-observation callback is added to the crawler so the bootstrap can retain bounded in-memory candidate-page evidence without changing existing collector persistence.

The bootstrap policy is fixed at depth 2, at most 30 pages per school, global concurrency 3, and per-host concurrency 1. A shared polite transport enforces global and per-host limits across concurrent school crawls. Candidate scoring includes admissions and Institution Fact keywords in URL, anchor text, page title/text, and attachment filename. External-domain URLs cannot become evidence, except a school-linked official application endpoint which is recorded only when it passes the explicit official redirect/source validation policy.

HTML is normalized with the current Cheerio-based utilities. Official PDFs are bounded candidates and decoded with a small production runtime PDF text dependency; unsupported HWP or unreadable documents remain Source candidates/warnings and never yield fabricated values.

## Extraction and current-cycle selection

The current live-admissions extractor remains intact and is called through an adapter for each validated page. Page proposals are ranked first by explicit academic year, then deterministic knowledge/actionability. Explicit 2027 evidence takes precedence over explicit 2026 evidence. No year is inferred from dates, current time, or another school, and no historical date is shifted.

For this bounded 2026 bootstrap, an explicit admission year below 2026 is reported with `STALE_ADMISSION_CYCLE_NOT_PUBLISHED` and cannot create a current Opportunity/Version. Its selected source year remains in the report. Historical Institution Facts such as tuition retain their source year and any source-provided future-change wording in the display value.

`SCHEDULE_FOUND` requires an extracted application or event date. `NOT_ANNOUNCED` requires explicit official wording. Otherwise a successfully bounded official search produces `NOT_FOUND`. The selected proposal keeps the official URL, collected timestamp, bounded evidence excerpt, warnings, and exact extracted fields.

The fact extractor recognizes only bounded sentences containing configured evidence keywords for `TUITION`, `TARGET_AGE_GRADE`, `CURRICULUM`, `ELIGIBILITY`, `TRANSPORT`, and `ADMISSION_PROCESS`. It emits a readable display value, structured `valueJson`, source URL, and bounded excerpt. It does not complete missing amounts, dates, grades, or procedures.

`OPERATING_INFO` is deterministically constructed from the official registry-backed seed fields (name, private elementary type, address, grade range, official website), providing the required minimum official fact coverage even when a school site lacks descriptive pages. Its Evidence uses an official registry Source. When Production does not allow the post-0011 `OFFICIAL_REGISTRY` source type, the compatibility-safe pre-0011 `OFFICIAL_DOCUMENT` type is used with `SECONDARY_OFFICIAL` authority and an explicit SchoolInfo source name; no new enum is introduced.

Registry baseline preparation is independent of all website outcomes, including robots refusal and response-size rejection. `TARGET_AGE_GRADE` uses explicit seed grade coverage plus `offers_elementary`, and labels this as school grade coverage rather than an admission-specific target. Seed registry verification date and regional provenance remain in `valueJson`. Registry-only persistence creates no fictitious website Snapshot or Observation. The baseline Fact types are merged once per school; admission-specific audience remains attached to admission evidence.

## Production schema compatibility

Before collection, a read-only capability preflight queries `information_schema`/`pg_catalog` for only the required tables, columns, constraints, and allowed role/source values. It never reads the migration ledger. Missing required canonical capabilities block the runner before writes with a redacted report.

Snapshot persistence uses only the original stable columns: id, source id, captured time, content hash, optional text hash/normalized text/mime type when present. Observation persistence uses only stable columns such as source id, observed time, outcome, status/final URL/hashes/size/duration/snapshot id when present. The bootstrap never requires or writes `source_snapshots.raw_body` or `source_observations.metadata`.

Observation plus Snapshot are retained because the existing public reviewed-admissions query requires both to render Last Collected and official provenance. Facts can use the same provenance chain.

## Idempotent persistence

Sources are keyed by normalized canonical URL and must remain official, active, and compatibly bound to the selected Institution. Bindings use existing uniqueness rules and are inserted or reused only when their role is compatible.

Fact identity is `(institution_id, fact_type)`. Canonicalized `valueJson` and display text determine equality. Equal current VERIFIED content is reused. Changed content creates the next version, supersedes the prior current version, and adds Evidence inside the same transaction.

Admission identity uses the current repository convention `live-admissions-<institution-id>-<explicit-year-or-current>`. Equal current VERIFIED fingerprints are reused. Changed content creates a new current VERIFIED version and supersedes the previous current version. The Opportunity remains Native and PUBLISHED. `verified_at` is the bootstrap validation time; `observed_at` is the actual fetch time.

Each school transaction takes a school-specific PostgreSQL advisory transaction lock, rechecks Institution identity/publication and Source ownership, captures Product-side-effect counts before and after, and aborts if Outbox, Notification, Delivery/Attempt, MeaningfulChange, or OpportunityChange changes.

## CLI and report

`npm run data:bootstrap-private-elementary:2026` defaults to dry-run and supports `--dry-run`, `--apply`, `--slug=<slug>`, `--facts-only`, and `--admissions-only`.

Production apply additionally requires all of:

- `NODE_ENV=production`
- `--production`
- `--acknowledge-production-write=PREPPY-41-SCHOOL-2026-BOOTSTRAP`

Dry-run performs no writes, including no Source, Snapshot, or Observation writes. The report includes total/attempted/collected/persisted/failed counts; `SCHOOL_FETCH_FAILED` and `PARTIAL_FETCH_WARNING`; fact/admission/year counts; created/reused/superseded counts; zero side-effect deltas; and per-school pages, candidates, selected evidence, facts, warnings, and errors. A single-school retry uses the same allowlist and persistence path.

## Verification and first Production execution

Unit tests cover exact scope, CLI guards, official-domain filtering, candidate classification, 2026/2027 precedence, dates, all fact types, unknown values, and failure classification. Integration tests prove per-school atomic rollback, cross-school continuation, idempotency, provenance joins, publication safety, and zero Product side effects.

After full tests, typecheck, build, and `git diff --check`, only the 41-school Production dry-run is permitted. The result report, one best-school extraction preview, and the exact guarded apply command are presented to the owner. Production apply remains blocked until separate owner approval.
