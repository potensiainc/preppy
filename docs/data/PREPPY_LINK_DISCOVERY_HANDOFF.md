# PREPPY Link Discovery Handoff

## Resulting Candidate model

Each discovered link is a bounded, immutable report record with:

- `url` and policy-preserving `normalizedUrl`;
- `sourcePageUrl`;
- bounded `anchorText`;
- `discoveryDepth` and actual `discoveredAt`;
- heuristic `classificationHint`;
- `sameDomain` under lowercase + one-leading-www equality;
- `reasonSelectedOrRejected`;
- optional ephemeral fetch outcome.

Candidates are not Sources, SourceBindings, Facts, Opportunities, or verified truth. Candidate page bodies/Snapshots/Observations are not persisted under the root Source. The current operator report is the review handoff boundary.

## Next safe work package: Extraction Candidate review

The next package should begin with an explicit review/promotion state machine, not extraction directly against every discovered URL:

1. accept a bounded collector report artifact;
2. deduplicate Candidates without weakening current URL/domain rules;
3. present requested/final URL, anchor, depth, classification hint, robots/fetch outcome, and originating canonical Source to an Admin reviewer;
4. require an explicit Admin command to promote an approved Candidate to a new canonical Source and binding;
5. collect evidence under the promoted Source ID only;
6. extract typed Candidate facts separately from canonical Fact/Opportunity truth;
7. require provenance, verification, and conflict policy before any Product writer runs.

No heuristic category should assign a binding role or publish Product data automatically.

## Browser fallback decision gate

There is no automatic fallback in this work package. A later Browser Collector may be considered only for an explicit reviewed Source when static evidence shows a bounded reason such as script-rendered content or a deliberate browser-required monitor config.

Approval should require:

- a separate collector type/version and resource/time budgets;
- the same URL, SSRF, redirect, robots, domain, and Product-isolation contracts;
- no login/CAPTCHA/anti-bot bypass or credential storage;
- isolated browser context with downloads, popups, service workers, and cross-origin navigation controlled;
- separate fixtures and disposable persistence acceptance;
- no automatic change to `sources.canonical_url` or public truth.

`ROBOTS_BLOCKED`, `ROBOTS_UNAVAILABLE_REVIEW_REQUIRED`, `SSRF_BLOCKED`, and external redirect outcomes are not browser-fallback permissions.

## PDF collector decision gate

`application/pdf` currently produces `UNSUPPORTED_CONTENT_TYPE`; its body is not parsed or persisted as root HTML evidence. A later PDF package should require explicit MIME/signature validation, compressed/decompressed and page-count limits, safe parser isolation, text/OCR provenance, and distinct hash semantics. OCR should be a separately approved fallback, not automatic.

PDF links may remain Candidate URLs, but promotion and collection must use their own Source identity and evidence contract.

## Admin exception review

An Admin exception flow should be explicit, auditable, and narrow. Review should show:

- canonical root Source and Institution;
- requested/final/redirect URLs with credentials redacted;
- exact robots decision origin and safe error code;
- Candidate anchor/path/category/depth and budget outcome;
- whether static HTTP, Browser, or PDF handling is requested;
- proposed Source type, binding role, and monitor config;
- reviewer identity, rationale, timestamp, and rollback command.

Exceptions must never allow private/reserved network access, external redirects by default, URL credentials, unbounded crawling, robots bypass, automatic Product creation, or publication. Network safety is not overrideable through Admin data.

## Deferred work

- persistent Candidate/review queue and retention policy;
- Admin review UI and promotion command;
- browser and PDF collectors behind their decision gates;
- typed extraction Candidates and provenance model;
- scheduler/retry/backoff and per-origin operational telemetry;
- migration from bounded inline `raw_body` to object storage using existing `raw_storage_key` semantics.
