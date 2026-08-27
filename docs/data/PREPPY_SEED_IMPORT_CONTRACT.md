# PREPPY Seed Import Contract

**Dataset:** `preppy_seed_institutions_seoul_gyeonggi_v1.json`
**Dataset version:** `1.0.0`
**Dataset verification date:** `2026-08-27`
**Importer command:** `npm run data:import-institution-seed -- --file <json> [--dry-run|--apply]`

## Safety Boundary

- Dry-run is the default. Database writes require the explicit `--apply` flag.
- The JSON and every artifact listed in the adjacent `SHA256SUMS` file are verified before JSON parsing and before runtime database initialization.
- The database inventory is read and the complete plan is rebuilt inside one transaction after acquiring `pg_advisory_xact_lock(hashtext('preppy-institution-seed-import-v1'))`.
- A plan containing any conflict or invalid row is not applied.
- Apply writes Institutions, resolved registry identities, Sources, bindings, and one PII-safe Audit row in one transaction.
- Migration context is always `source=MIGRATION` and `emitProductSignals=false`.
- New Institutions are always `DRAFT`; the importer never publishes or verifies Product truth.
- The importer never creates Facts, Opportunities, Observations, Snapshots, monitor configs, detected/meaningful changes, Outbox events, Notifications, delivery/email records, crawl results, or collector executions.
- The six pending SchoolInfo identities are skipped. The importer never invents a registry ID and never falls back to name-only identity matching.

## Immutable Package Contract

| Measure | Required |
|---|---:|
| Institutions | 63 |
| Private elementary | 41 |
| International school | 22 |
| Seoul | 54 |
| Gyeonggi | 9 |
| Source records | 126 |
| Excluded records | 3 |
| Pending SchoolInfo IDs | 6 |
| Safely resolved Institutions | 57 |
| Empty-database Sources/bindings | 114 / 114 |

Required pending names, in package order:

1. 유석초등학교
2. 상명초등학교
3. 청원초등학교
4. 중앙대학교사범대학부속초등학교
5. 신광초등학교
6. 리라초등학교

The canonical domain validator derives the lowercase URL host, removes one leading `www.`, and preserves other subdomains and non-default ports. `canonical_domain` is a validation/provenance value only and is not stored as another repository identity column.

## Core Institution Mapping

| Dataset field | Repository field or handling |
|---|---|
| `canonical_name_ko` | `institutions.display_name` |
| `slug` | `institutions.slug` |
| `institution_type` | `institutions.category` |
| `legal_category=FOREIGN_SCHOOL` | `institutions.international_subtype=FOREIGN_SCHOOL` |
| `operating_status` | `institutions.operational_state` |
| `publication_status=INTERNAL_ONLY` | new Institution `publication_state=DRAFT` |
| `province` | `institutions.region_code` |
| `city_district` | `institutions.district` |
| `address` | `institutions.address_line` |
| normalized official website | `institutions.website_url` and canonical Source URL |
| `registry_name + registry_external_id` | canonical upsert key in `institution_registry_identities` |
| `registry_record_url` | registry identity column and registry Source URL |
| `registry_locator` | registry identity column |
| full Institution row and its two Source rows | `institution_registry_identities.metadata_json` |
| dataset name/version/date/JSON SHA-256 | `metadata_json.seed_dataset` |
| raw website, group, campus, grade/language, cadence, notes | losslessly retained in `metadata_json` |
| dataset `verified_at` | provenance metadata only; never Product Last Verified |

No raw URL or canonical-domain column is added to `institutions` or `sources`. No canonical Institution alias, group, or campus domain is introduced. KIS Seoul and KIS Pangyo remain separate Institutions; their shared group key and distinct campus names remain in metadata.

## Source and Binding Mapping

| Dataset Source | Repository Source | Institution binding |
|---|---|---|
| `REGISTRY_IDENTITY` / `OFFICIAL_REGISTRY` | `source_type=OFFICIAL_REGISTRY`, `authority_level=PRIMARY`, `lifecycle_status=ACTIVE` | `role=REGISTRY_IDENTITY`, `is_primary=false`, active |
| `OFFICIAL_WEBSITE_ROOT` / `OFFICIAL_WEBSITE` | `source_type=OFFICIAL_SCHOOL_PAGE`, `authority_level=PRIMARY`, `lifecycle_status=ACTIVE` | existing `role=OFFICIAL_MAIN`, `is_primary=true`, active |

`OFFICIAL_WEBSITE_ROOT` is intentionally not added to the repository role vocabulary. Existing compatible Sources are reused by exact canonical URL. A reused Source must already have the expected type, authority, and active lifecycle.

## Identity, Adoption, and Conflict Rules

The primary identity is `registry_name + registry_external_id`. When that identity already exists, its linked Institution must match canonical material fields. When it does not exist, one existing Institution may be adopted only if its exact slug selects one row and name, category/subtype, operating state, province, district, address, and normalized website all match.

| Code | Meaning |
|---|---|
| `CREATED` | A new DRAFT Institution and registry identity are planned. |
| `UPDATED_NON_MATERIAL` | The Institution is retained while missing/stale registry metadata, Source, or binding graph is repaired. |
| `UNCHANGED` | Exact Institution, identity, Source, and binding graph already exists. |
| `SKIPPED_PENDING_ID` | Pending registry identity is deliberately excluded from apply. |
| `CONFLICT_EXISTING_IDENTITY` | Existing registry, deterministic ID, Source semantics, or primary binding graph is incompatible. |
| `CONFLICT_SLUG` | Seed slug is occupied by a materially different Institution. |
| `CONFLICT_DOMAIN` | Existing website host differs from the seed website host. |
| `INVALID_ROW` | A validated resolved row cannot form the required two-Source graph. |
| `SOURCE_CREATED` / `SOURCE_REUSED` | Canonical Source create/reuse decision. |
| `BINDING_CREATED` / `BINDING_REUSED` | Binding create/reactivate/reuse decision. |

Conflicts are report-only and block the entire apply before the first write. Material conflicts are never overwritten.

## Database Change

Migration `0011_preppy_seed_registry` adds:

- `institution_registry_identities` with UUID primary key, restricted Institution FK, unique registry key, Institution index, registry-name check, full JSONB provenance, and timestamps;
- `OFFICIAL_REGISTRY` to `sources_source_type_check`;
- `REGISTRY_IDENTITY` to `institution_source_bindings_role_check`.

The migration is additive. It does not alter publication behavior or create collector/monitoring state.

## CLI Outcomes

- Exit `0`: validation and planning succeeded; apply also completed when requested.
- Exit `1`: argument, checksum, schema, runtime, or transactional failure.
- Exit `2`: planning completed but conflicts/invalid rows blocked apply.
- Standard output is the deterministic JSON report. Validation/runtime failures are JSON on standard error.

## Rollback

No production migration or import is part of this work package. A failed local/test apply rolls back automatically because all domain writes and the Audit row share one transaction. Before a future production use, operational rollback is to stop invoking the importer. If an approved environment later needs data removal, it must use a separately reviewed registry-key-targeted rollback; broad deletes and repository cleanup are outside this contract.
