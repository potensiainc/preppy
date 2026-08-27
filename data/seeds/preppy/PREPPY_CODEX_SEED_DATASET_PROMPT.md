# PREPPY — SEOUL/GYEONGGI INSTITUTION SEED IMPORT & AUTOMATION BOOTSTRAP

You are PREPPY's Principal Data Platform Engineer, Repository Auditor, and Reliability Engineer.

This is a repository-grounded implementation task. Do not assume paths, schemas, commands, packages, or completed capabilities. Inspect the repository first and adapt this instruction to the actual code. The owner does not plan to manually transcribe school data as the normal operating model.

## 0. Owner Decision — Canonical

1. The initial internal coverage is all private elementary schools in Seoul/Gyeonggi plus all officially listed Seoul/Gyeonggi foreign schools that offer an elementary course.
2. English kindergartens are deferred to a later coverage phase.
3. Institution identity and official website roots are seeded now; detailed Facts and Opportunities are not fabricated or manually mass-entered.
4. Normal data acquisition will evolve toward automated official-site collection with verification by exception.
5. Admin must become an exception/review console, not the normal data-entry workforce.
6. Existing downstream contracts for Source, Evidence, Version, Change, Notification, and Audit must be reused rather than bypassed.
7. `UNKNOWN` and `PENDING` are valid states. Never infer unsupported values.
8. Seed import never means public publication.

## 1. Input artifacts

The following files are provided with this prompt:

- `preppy_seed_institutions_seoul_gyeonggi_v1.xlsx`
- `preppy_seed_institutions_seoul_gyeonggi_v1.csv`
- `preppy_seed_institutions_seoul_gyeonggi_v1.json`
- `PREPPY_SEED_DATASET_README.md`
- `SHA256SUMS`

Use JSON as the canonical machine-readable package because it contains Institutions, Sources, exclusions, and metadata. Use CSV only as a compatibility/review artifact. Do not parse XLSX in application runtime.

Expected counts:

```text
Institutions total: 63
PRIVATE_ELEMENTARY: 41
INTERNATIONAL_SCHOOL: 22
Seoul: 54
Gyeonggi: 9
Source rows: 126
Excluded ISI rows: 3
SchoolInfo record IDs pending: 6
```

Any count mismatch is a hard stop.

## 2. Mandatory repository reading

First locate and read the actual current versions of at least:

```text
One Pager
MVP
00_PRODUCT_REQUIREMENTS_BASELINE
02_TARGET_ARCHITECTURE
03_DOMAIN_MODEL
04_DATA_MODEL
05_MONITORING_ARCHITECTURE
09_ADMIN_OPERATIONS_ARCHITECTURE
10_PRD
11_API_CONTRACT
12_IMPLEMENTATION_PLAN
```

Then inspect the actual implementation, including equivalents of:

```text
package.json
src/db/schema/**
src/modules/institution/**
src/modules/admissions/**
src/modules/monitoring/**
src/modules/admin/**
src/application/**
app/api/admin/**
workers/**
scripts/**
migrations/**
tests/**
```

Search for:

```text
Institution
Source
SourceBinding
SourceMonitorConfig
SourceObservation
SourceSnapshot
Evidence
Verification
Opportunity
slug
canonical domain
import
seed
upsert
audit
transaction
```

## 3. Phase A — Reality audit before code changes

Produce a repository reality matrix:

| Capability | Repository evidence | Status | Required change |
|---|---|---|---|
| Institution idempotent upsert | | | |
| Official registry external key | | | |
| Alias/campus/group support | | | |
| Raw + normalized website URL storage | | | |
| Source creation | | | |
| Source binding | | | |
| Internal-only publication state | | | |
| Crawl state | | | |
| Audit trail | | | |
| Transactional bulk import | | | |
| Dry-run | | | |
| Import report | | | |

Classify each as:

```text
IMPLEMENTED_AND_TESTED
IMPLEMENTED_NOT_TESTED
PARTIAL
DOCUMENTED_ONLY
NOT_IMPLEMENTED
NOT_VERIFIABLE
```

Do not claim that a future adapter, interface, or document paragraph is implemented code.

## 4. Phase B — Define the import contract

Implement the smallest additive contract that fits the current repository.

### 4.1 Canonical identity key

Preferred upsert keys:

```text
SCHOOLINFO + registry_external_id
ISI + registry_external_id
```

For the six `registry_record_id_status=PENDING` SchoolInfo rows:

- Do not use a school-name-only upsert.
- Reconcile through official NEIS/SchoolInfo data using exact Korean name + province + district/address.
- If one exact official record is found, add its official external ID and record URL through an explicit dataset repair patch or import-resolution record.
- If zero or multiple records are found, keep it unresolved.
- If the current domain model has a safe pending-candidate entity, import it there as unresolved.
- Otherwise exclude it from `--apply` and report `SKIPPED_PENDING_ID`.
- Never guess a UUID or choose the first same-name school.

The six pending schools expected in this package are:

```text
유석초등학교
상명초등학교
청원초등학교
중앙대학교사범대학부속초등학교
신광초등학교
리라초등학교
```

### 4.2 Data preservation

Preserve separately:

```text
raw website URL
normalized website URL
canonical domain
official registry record URL
registry locator
raw grade/course text
raw teaching-language text
normalized teaching-language text
provisional slug
```

Do not silently rewrite source artifacts. Every correction must appear in the import report with old value, new value, official evidence, and reason.

### 4.3 Allowed side effects

Allowed:

```text
Create/update Institution identity candidate or canonical Institution
Create/update official-registry Source
Create/update official website-root Source
Create/update SourceBinding
Create/update internal crawl/source-monitor configuration if the existing contract supports it
Write Audit/import-run records
```

Forbidden:

```text
Publish Institution pages
Create verified tuition/curriculum/eligibility/admission-process Facts
Create Opportunities
Create Notifications or emails
Treat website-root URLs as successful crawl observations
Mark publication-grade Last Verified from this seed
Bypass canonical verification commands
```

## 5. Required command interface

Adapt naming to repository conventions but preserve behavior. Prefer:

```bash
npm run data:import-institution-seed -- \
  --file data/seeds/preppy/institutions/seoul-gyeonggi/v1/preppy_seed_institutions_seoul_gyeonggi_v1.json \
  --dry-run

npm run data:import-institution-seed -- \
  --file data/seeds/preppy/institutions/seoul-gyeonggi/v1/preppy_seed_institutions_seoul_gyeonggi_v1.json \
  --apply
```

Required behavior:

- `--dry-run` is the default if neither mode is supplied.
- `--apply` requires an explicit flag.
- Validate the complete file before any write.
- Apply in one bounded transaction, or use a documented safe batching strategy if repository constraints require it.
- Rerunning the exact package is idempotent: no duplicate Institution, Source, or SourceBinding.
- A second identical run reports `UNCHANGED`.
- Material conflicts are never overwritten silently; they become conflict/review output.
- Return a non-zero exit code on validation or expected-count failure.
- Never print secrets or raw PII.

## 6. Schema and validation requirements

Use the repository's existing validation stack. If none exists, add the smallest appropriate validator.

Hard validation:

```text
metadata.version present
63 Institution rows
41 PRIVATE_ELEMENTARY rows
22 INTERNATIONAL_SCHOOL rows
54 Seoul rows
9 Gyeonggi rows
126 Source rows
3 excluded rows
unique seed_id
unique slug within the package
non-empty canonical_name_ko
non-empty official_website_url_raw
non-empty official_website_url_normalized
valid normalized http/https URL
registry_name in SCHOOLINFO|ISI
offers_elementary=true for all imported rows
publication_status=INTERNAL_ONLY for all rows
crawl_status=NOT_STARTED for all rows
exactly two Source rows per Institution
```

Semantic validation:

- Registry and website-root Sources bind to the same Institution.
- `registry_external_id` is required for `RESOLVED` rows.
- `PENDING` rows cannot pretend to be resolved.
- International rows retain the official legal category in the package; do not mix unofficial academies into this type.
- Campus/group values are preserved when supplied.
- Domain equality is a QA signal, not automatically a duplicate verdict.
- Seed slugs are provisional and must not create public redirects.

## 7. Database mapping

Map fields to the existing models rather than redesigning the whole domain because names differ.

Report the exact mapping for:

```text
seed_id
canonical_name_ko
canonical_name_en
institution_group_key
campus_name
slug
institution_type
legal_category
province
city_district
address
grade/course raw value
official website raw/normalized/domain
registry identity
operating status
publication status
monitoring priority/cadence
```

If the current schema cannot represent a field:

1. classify it as required now, useful later, or import metadata only;
2. add only the minimal migration needed for lossless identity/source import;
3. do not overload unrelated columns;
4. document rollback.

## 8. Source binding policy

For every safely imported Institution, ensure two separate Sources or equivalent bindings:

```text
REGISTRY_IDENTITY
OFFICIAL_WEBSITE_ROOT
```

Rules:

- Registry identity proves the institution/category/address seed.
- Website root is the bounded crawl-origin candidate.
- Website root is not proof that a specific Fact or Opportunity exists.
- Preserve raw and normalized URL values.
- Initial fetch state remains `NOT_CHECKED` or the repository equivalent.
- Do not create a successful Observation/Snapshot until a collector actually fetches it.

## 9. QA and conflict handling

Create machine-readable and Markdown results for:

```text
CREATED
UPDATED_NON_MATERIAL
UNCHANGED
SKIPPED_PENDING_ID
CONFLICT_EXISTING_IDENTITY
CONFLICT_SLUG
CONFLICT_DOMAIN
INVALID_ROW
SOURCE_CREATED
SOURCE_REUSED
BINDING_CREATED
BINDING_REUSED
```

Explicitly test:

1. empty database dry-run;
2. empty database apply;
3. identical second apply;
4. one existing matching Institution;
5. one existing conflicting address/domain;
6. duplicate input row;
7. missing website;
8. expected-count mismatch;
9. unresolved SchoolInfo ID;
10. existing Source without binding;
11. rollback after a mid-import failure;
12. KIS Seoul/Pangyo group and campus preservation.

Tests must use local fixture JSON and a test database. Do not depend on live external websites.

## 10. Repository placement

Place immutable artifacts under the repository's existing data convention. If none exists, use:

```text
data/seeds/preppy/institutions/seoul-gyeonggi/v1/
```

Include:

```text
preppy_seed_institutions_seoul_gyeonggi_v1.json
preppy_seed_institutions_seoul_gyeonggi_v1.csv
PREPPY_SEED_DATASET_README.md
SHA256SUMS
```

Do not place XLSX in runtime import paths unless repository conventions explicitly preserve review artifacts. JSON is the import source of truth.

## 11. Follow-on automation boundary

After import, do not crawl the entire web. Prepare only the next safe boundary:

```text
Institution
→ official website-root SourceBinding
→ bounded same-domain link discovery candidate
→ collector fetch
→ snapshot/hash
→ extraction candidate
→ verification/review
→ canonical Fact or Opportunity
```

This task must make that next phase possible but does not need to implement every collector unless an existing approved work package already requires it.

Prohibited:

```text
CAPTCHA bypass
login scraping
proxy rotation
anti-bot evasion
parent/community scraping
raw LLM output direct publication
```

## 12. Required documentation

Create or update:

```text
docs/data/PREPPY_SEED_IMPORT_CONTRACT.md
docs/data/PREPPY_SEED_IMPORT_REPORT.md
docs/data/PREPPY_SEED_AUTOMATION_HANDOFF.md
```

### PREPPY_SEED_IMPORT_CONTRACT.md

Include:

- source-of-truth file
- field mapping
- identity/upsert contract
- pending-ID behavior
- transaction/idempotency contract
- allowed/forbidden side effects
- rollback

### PREPPY_SEED_IMPORT_REPORT.md

Include:

- repository reality audit
- files changed
- migrations
- import counts
- created/unchanged/conflict/pending counts
- exact six pending rows and their resolution state
- all deviations from the artifact
- commands, tests, typecheck, and build results

### PREPPY_SEED_AUTOMATION_HANDOFF.md

Include:

- resulting Institution/Source coverage
- modules that can feed collector scheduling
- exact next work package for static HTTP collection and bounded link discovery
- blockers before source discovery
- Admin changes needed to review exceptions instead of entering all data manually

## 13. Acceptance criteria

PASS only when all are true:

```text
Repository reality audit completed before implementation
Canonical JSON package validates
Dry-run produces exact expected counts
Apply is explicit and transactional/safely batched
Second identical apply is idempotent
No Institution is public by default
No Fact or Opportunity is fabricated
Two Source bindings exist per safely imported Institution
Pending IDs are not guessed
Conflicts are reported, not silently overwritten
Unit/integration tests do not call live websites
Typecheck/build/test pass
Import report is reproducible
```

If the repository cannot safely represent pending identities, import 57 resolved rows and report six `SKIPPED_PENDING_ID`. Do not weaken identity guarantees merely to reach 63 database rows.

## 14. Final response format

Return exactly:

```text
PREPPY SEED IMPORT VERDICT

Branch:
Starting Commit:
Ending Commit:
Working Tree Before:
Working Tree After:

Repository Reality:
- Institution Import:
- Source Import:
- Idempotency:
- Dry Run:
- Transaction/Rollback:

Dataset Validation:
- Institutions: expected 63 / actual
- Private Elementary: expected 41 / actual
- International School: expected 22 / actual
- Seoul: expected 54 / actual
- Gyeonggi: expected 9 / actual
- Sources: expected 126 / actual
- Excluded: expected 3 / actual
- Pending SchoolInfo IDs: expected 6 / actual

Apply Result:
- CREATED:
- UPDATED_NON_MATERIAL:
- UNCHANGED:
- SKIPPED_PENDING_ID:
- CONFLICT:
- INVALID:
- SOURCE_CREATED:
- SOURCE_REUSED:
- BINDING_CREATED:
- BINDING_REUSED:

Migrations:
Files Changed:
Commands Run:
Tests:
Build:

Unresolved Items:
1.
2.
or NONE

Next Safe Work Package:

Final Verdict:
PASS / PASS_WITH_PENDING_IDS / FAIL

STOPPED:
YES
```

Do not deploy to live production. Stop after repository implementation, local/test database verification, documentation, and final report.
