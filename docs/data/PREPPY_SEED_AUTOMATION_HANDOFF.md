# PREPPY Seed Automation Handoff

## Boundary

This handoff starts only after the seed importer has been reviewed and its dedicated-database gates pass. The present work stops at canonical Institution identity, official registry/website Sources, and active bindings. It deliberately performs no collection, crawling, snapshotting, extraction, verification, monitoring configuration, or Product signal generation.

The next bounded pipeline is:

```text
Institution
  -> Official Website Root
  -> Static HTTP Collector
  -> bounded same-domain link discovery
  -> Snapshot
  -> Hash
  -> Extraction Candidate
  -> Verification / Exception Review
```

## Inputs Available After Import

For each of 57 resolved Institutions:

- one DRAFT canonical Institution;
- one `OFFICIAL_MAIN` website binding to an `OFFICIAL_SCHOOL_PAGE` Source;
- one non-primary `REGISTRY_IDENTITY` binding to an `OFFICIAL_REGISTRY` Source;
- lossless seed provenance in `institution_registry_identities.metadata_json`, including raw and normalized URLs, canonical-domain QA value, registry locator, group/campus fields, monitoring hints, both seed Source rows, dataset version, verification date, and JSON checksum.

The six pending SchoolInfo rows are not collector inputs. They require registry-ID resolution and a separately reviewed seed package update before import.

## Collector Entry Rules

1. Select only active `OFFICIAL_MAIN` bindings whose Institution is explicitly eligible for the new collector rollout. DRAFT status alone is not collector authorization.
2. Treat the bound Source URL as the starting root. Do not derive a new root from `canonical_domain`; that value is provenance/QA only.
3. Start with ordinary static HTTP. Record redirects, final URL, status, content type, response size, elapsed time, and fetch outcome.
4. Do not enable a browser merely because the seed mentions cadence or because static HTML is sparse. Browser escalation needs an observed, reviewed failure mode.
5. Same-domain discovery uses the importer domain rule: lowercase host, one leading `www.` removed. Keep every other subdomain distinct unless a later policy explicitly approves it.
6. Bound link discovery by depth, page count, response bytes, content types, timeout, and path/query normalization. Reject external hosts, credentials, forms, mutations, and unbounded calendars/search spaces.
7. Respect robots and repository request-rate policy. Tests use fixtures and never call live school websites.

## Snapshot and Hash Contract

- Store the original response body and request/final URL evidence through the existing Source Snapshot domain.
- Compute the repository-standard content and normalized-text hashes.
- An unchanged hash may produce an Observation only after collector execution is in scope; the seed importer itself must never create one.
- A changed hash is an extraction candidate, not verified Product truth.
- Dataset `verified_at` must never populate Snapshot observation time, Fact/Opportunity `verified_at`, or public Last Verified UI.

## Extraction Candidate Boundary

Extraction may propose bounded candidate values such as admissions notice URLs, dates, tuition, curriculum, transport, or contact details. Candidates must retain Source/Snapshot evidence and remain unverified. Do not create or publish canonical Fact/Opportunity truth directly from a raw hash change.

## Verification and Exception Review

Human or separately approved verification logic must decide whether a candidate becomes canonical truth. Route at least these cases to exception review:

- website redirects to a different canonical host;
- authentication, CAPTCHA, browser-only rendering, downloads, or unsupported content types;
- multiple campuses/groups sharing branding or ambiguous paths;
- material conflict with existing canonical Institution data;
- registry record URL no longer resolving to the seeded identity;
- collector scope exceeding configured limits;
- extraction lacking official Source evidence.

Only verification may create current VERIFIED Fact/Opportunity versions or public Last Verified values. Publication remains a separate explicit command.

## Recommended Next Tests

- Static HTML fixture collection with redirect and content-type cases.
- `www.` equivalence and non-`www` subdomain isolation.
- Same-domain link normalization, deduplication, and hard budget enforcement.
- Snapshot/hash idempotency and atomic failure behavior.
- Changed content creating only an unverified candidate.
- Dataset provenance never leaking into Product verification timestamps.
- Exception routing for KIS Seoul/Pangyo and other grouped campuses without collapsing Institution identity.
- Zero Outbox/Notification side effects until a verified meaningful change explicitly enters the existing Product pipeline.

## Required Gate Before Starting Automation

Run the seed migration/import integration suite against a disposable database ending in `_test` or `_verifyN`, review the JSON reports, confirm second-apply convergence, confirm all forbidden Product deltas are zero, and obtain Owner approval. Do not use production as the missing test environment.
