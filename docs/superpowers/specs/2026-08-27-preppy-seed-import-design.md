# PREPPY Seed Import Design

**Status:** Owner approved with constraints on 2026-08-27
**Canonical dataset contract:** `data/seeds/preppy/PREPPY_CODEX_SEED_DATASET_PROMPT.md`
**Owner override:** approval attachment dated 2026-08-27
**Repository baseline:** `bea26170bfa2e8a8ea635e32cc2069b6e36b9cd0`

## Goal

Import the resolved Seoul/Gyeonggi institution seed identities into the existing canonical Institution, Source, and Institution SourceBinding model without publishing content, inventing pending registry IDs, or emitting Product signals.

## Reality Audit Corrections

The initial audit classified alias/campus/group support as `DOCUMENTED_ONLY`. The precise repository reality is:

- `school_aliases` is implemented and tested for legacy `schools`.
- No canonical `institution_aliases`, Institution Group, or Campus domain exists.
- Legacy School aliases must not be reused for native canonical Institutions without a School bridge.
- This work package adds none of those domains. KIS Seoul and Pangyo remain separate Institutions, while group/campus values remain in lossless registry metadata.

The remaining audit findings stand:

| Capability | Status before this work | Required change |
|---|---|---|
| Institution seed upsert | PARTIAL | Add registry-key seed planner/importer |
| Official registry external key | NOT_IMPLEMENTED | Add a dedicated identity table |
| Raw and normalized website preservation | PARTIAL | Keep normalized URL in existing core fields and raw values in metadata |
| Source creation | PARTIAL | Add seed-specific idempotent create/reuse behavior |
| Institution SourceBinding | IMPLEMENTED_AND_TESTED | Reuse `OFFICIAL_MAIN`; add only `REGISTRY_IDENTITY` |
| Non-public Institution state | IMPLEMENTED_AND_TESTED | Create every Institution as `DRAFT` |
| Transaction, dry-run, audit patterns | PARTIAL | Reuse existing runtime and migration context |

## Schema

Add `institution_registry_identities`:

```text
id                    UUID PK DEFAULT gen_random_uuid()
institution_id        UUID NOT NULL FK institutions(id) ON DELETE RESTRICT
registry_name         TEXT NOT NULL CHECK SCHOOLINFO|ISI
registry_external_id  TEXT NOT NULL
registry_record_url   TEXT NOT NULL
registry_locator      TEXT NOT NULL
metadata_json         JSONB NOT NULL
created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()

UNIQUE(registry_name, registry_external_id)
INDEX(institution_id)
```

Only resolved identities enter this table, so `registry_external_id` is non-null. The six pending SchoolInfo rows are not represented with fake identifiers.

Extend existing checks minimally:

- `sources.source_type`: add `OFFICIAL_REGISTRY` because no existing value has the exact registry-identity meaning.
- `institution_source_bindings.role`: add `REGISTRY_IDENTITY`.
- Do not add `OFFICIAL_WEBSITE_ROOT`; map it to existing `OFFICIAL_MAIN`.
- Do not add raw URL or canonical-domain columns.

## Exact Mapping

| Seed field | Repository mapping |
|---|---|
| `seed_id` | `institution_registry_identities.metadata_json` |
| `canonical_name_ko` | `institutions.display_name` |
| `canonical_name_en` | registry `metadata_json` |
| `institution_group_key` | registry `metadata_json` |
| `campus_name` | registry `metadata_json` |
| `slug` | `institutions.slug`; remains provisional because Institution is DRAFT |
| `institution_type` | `institutions.category` |
| `legal_category` | registry `metadata_json`; for INTERNATIONAL_SCHOOL also maps to `institutions.international_subtype=FOREIGN_SCHOOL` |
| `province` | `institutions.region_code` |
| `city_district` | `institutions.district` |
| `address` | `institutions.address_line` |
| grade/course raw values | registry `metadata_json` |
| website raw | registry `metadata_json` |
| website normalized | `institutions.website_url` and website `sources.canonical_url` |
| `canonical_domain` | validated against the normalized URL, then preserved only in metadata; never persisted as a derived column |
| registry identity | dedicated identity columns plus registry Source |
| operating status | `institutions.operational_state` |
| publication status | `INTERNAL_ONLY` maps to `institutions.publication_state=DRAFT` |
| monitoring priority/cadence | registry `metadata_json`; no monitor config is created |
| full Institution and two Source rows | `metadata_json` for lossless artifact provenance |

## Source and Binding Mapping

For each safely resolved Institution:

```text
Dataset REGISTRY_IDENTITY
  -> Source(source_type=OFFICIAL_REGISTRY, authority=PRIMARY, lifecycle=ACTIVE)
  -> InstitutionSourceBinding(role=REGISTRY_IDENTITY, is_primary=false)

Dataset OFFICIAL_WEBSITE_ROOT
  -> Source(source_type=OFFICIAL_SCHOOL_PAGE, authority=PRIMARY, lifecycle=ACTIVE)
  -> InstitutionSourceBinding(role=OFFICIAL_MAIN, is_primary=true)
```

The full package still validates 126 Source records. An empty database apply creates 114 Source rows and 114 bindings because all rows belonging to the six pending identities are skipped. Existing canonical URLs may reduce Source creation through safe reuse; reports therefore separate dataset, repository Source, and binding counts.

## Identity and Conflict Policy

Primary upsert key:

```text
registry_name + registry_external_id
```

Pending identities never use name-only matching. For a resolved registry identity not yet linked, an existing Institution may be adopted only when its slug selects one row and its canonical name, category, province, district, address, and normalized website all match exactly. This supports the required existing-matching-Institution case without weakening identity integrity.

Conflicts never overwrite:

- occupied slug by a different Institution: `CONFLICT_SLUG`
- registry identity linked to materially different core data: `CONFLICT_EXISTING_IDENTITY`
- existing website host differs: `CONFLICT_DOMAIN`
- incompatible existing Source type/authority/lifecycle: conflict
- any conflict blocks the whole apply before writes

Missing registry identity, Source, or binding on an otherwise exact existing graph is repairable and reported as `UPDATED_NON_MATERIAL`, `SOURCE_CREATED|SOURCE_REUSED`, and `BINDING_CREATED|BINDING_REUSED`.

## Validation and Checksums

Before opening a database connection:

1. Locate `SHA256SUMS` beside the requested JSON.
2. Verify every listed immutable artifact that exists, including the JSON and README.
3. Require the JSON and README entries and files.
4. Reject any mismatch as a hard validation failure.
5. Parse with Zod and validate the exact 63/41/22/54/9/126/3/6 counts and all canonical semantic rules.

Dataset validation counts and apply counts remain separate.

## Transaction and Side-effect Boundary

- Default command mode is dry-run; `--apply` is explicit.
- Reuse `TransactionManager` and take a transaction-scoped advisory lock.
- Re-read inventory and build the complete plan inside the transaction.
- Apply all Institutions, registry identities, Sources, bindings, and one PII-safe Audit row atomically.
- Use migration semantics: `source=MIGRATION`, `emitProductSignals=false`, and identify the action as a seed bootstrap import.
- A second identical apply reports `UNCHANGED`, `SOURCE_REUSED`, and `BINDING_REUSED` without duplicate domain rows.

Never create Fact, Opportunity, Observation, Snapshot, Outbox, Notification, Email, monitor config, verified Product truth, or a public page.

## Reporting

The importer returns deterministic JSON containing:

- checksum and dataset validation results
- dataset total/resolved/pending counts
- per-Institution result codes
- Source and binding result codes
- conflicts and invalid rows
- Product-side-effect counts observed for safety verification

`docs/data/PREPPY_SEED_IMPORT_REPORT.md` records the reproducible executed commands and actual verification status. If a dedicated test database remains unavailable, DB gates are recorded as `NOT EXECUTED — TEST DATABASE UNAVAILABLE` and the final verdict cannot be PASS.

## Tests

Pure unit tests cover checksum, full validation, URL/domain derivation, mapping, duplicates, missing website, expected-count mismatch, pending handling, and KIS separation. Database integration tests use only a dedicated `_test`/`_verifyN` database and cover empty apply, second apply, existing match, conflicts, Source reuse, binding repair, uniqueness, rollback, publication exclusion, and zero forbidden side effects. No test calls a live school website.

## Rollback

The migration is additive. Before production use, application rollback means stop invoking the importer and leave the unused table/check values in place. This work package never applies the migration to production. If local/test apply fails, the single transaction rolls back all new domain rows and Audit data.
