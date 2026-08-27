# PREPPY Seed Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development and execute this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Owner instructions prohibit commits, pushes, deploys, and production DB changes.

**Goal:** Build a checksum-verified, dry-run-first, idempotent importer that creates resolved canonical Institutions, registry identities, official Sources, and bindings without publication or Product signals.

**Architecture:** Reuse the existing Institution, Source, SourceBinding, TransactionManager, and AuditWriter. Add one registry identity table, one Source type, and one binding role; keep all seed-only provenance in `metadata_json` and map website roots to existing `OFFICIAL_MAIN`.

**Tech Stack:** TypeScript 5.9, Node.js 22, Zod 4, Drizzle ORM 0.45, PostgreSQL 16, Vitest 4, Next.js 16.3.

**Spec:** `docs/superpowers/specs/2026-08-27-preppy-seed-import-design.md`

## Global Constraints

- Do not commit, push, merge, rebase, cherry-pick, deploy, or modify production.
- Never request or use production credentials for validation.
- Preserve the untracked `data/` dataset.
- Validate exact package counts before database access.
- Skip all six pending SchoolInfo identities; never use name-only upsert.
- Create only DRAFT Institutions and emit no Product signals.
- Do not create Facts, Opportunities, Observations, Snapshots, Outbox rows, Notifications, Email, or monitor configs.
- Tests never call live school websites.

---

### Task 1: Dataset integrity and mapping contract

**Files:**
- Create: `src/modules/institution-seed/contract.ts`
- Create: `tests/unit/preppy-seed-contract.test.ts`

**Interfaces:**
- Produces: `loadAndValidateSeedPackage(filePath: string): Promise<ValidatedSeedPackage>`
- Produces: `canonicalDomain(url: string): string`
- Produces: `mapSeedInstitution(row): InstitutionSeedMapping`

- [ ] Write a failing unit test that loads the canonical package and asserts literal counts `63/41/22/54/9/126/3/6`.
- [ ] Run `npm test -- tests/unit/preppy-seed-contract.test.ts` and confirm failure because the module is missing.
- [ ] Implement strict Zod schemas, SHA256SUMS verification, URL/domain validation, unique `seed_id`/slug checks, two Sources per Institution, and the exact core mapping.
- [ ] Add failing cases for checksum mismatch, duplicate row, missing website, expected-count mismatch, invalid pending semantics, and mismatched deterministic domain.
- [ ] Run the unit test and confirm all contract cases pass.

Expected core mapping excerpt:

```ts
return {
  slug: row.slug,
  displayName: row.canonical_name_ko,
  category: row.institution_type,
  internationalSubtype:
    row.legal_category === "FOREIGN_SCHOOL" ? "FOREIGN_SCHOOL" : null,
  operationalState: row.operating_status,
  publicationState: "DRAFT",
  regionCode: row.province,
  district: row.city_district,
  addressLine: row.address,
  websiteUrl: row.official_website_url_normalized,
};
```

### Task 2: Minimal registry/source schema

**Files:**
- Modify: `src/db/schema/index.ts`
- Modify: `src/modules/admin/read-model/input.ts`
- Create: `src/db/migrations/0011_preppy_seed_registry.sql`
- Create: `src/db/migrations/meta/0011_snapshot.json`
- Modify: `src/db/migrations/meta/_journal.json`
- Create: `tests/unit/preppy-seed-schema-contract.test.ts`
- Create: `tests/integration/preppy-seed-schema.test.ts`

**Interfaces:**
- Produces: `institutionRegistryIdentities`
- Extends: Source type check with `OFFICIAL_REGISTRY`
- Extends: `InstitutionSourceBindingRole` with `REGISTRY_IDENTITY`

- [ ] Write a failing schema-contract unit test importing the new table and role.
- [ ] Run it and confirm the expected missing-export failure.
- [ ] Add the Drizzle table, unique registry key, FK/index, check constraint, Source type, and binding role.
- [ ] Generate the additive Drizzle migration using a non-production local URL value that is not contacted by generation.
- [ ] Write integration assertions for registry uniqueness and FK enforcement.
- [ ] Run unit tests; run integration tests only when a dedicated database is available.

Required table shape:

```ts
export const institutionRegistryIdentities = pgTable(
  "institution_registry_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    institutionId: uuid("institution_id").notNull().references(() => institutions.id, { onDelete: "restrict" }),
    registryName: text("registry_name").notNull(),
    registryExternalId: text("registry_external_id").notNull(),
    registryRecordUrl: text("registry_record_url").notNull(),
    registryLocator: text("registry_locator").notNull(),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("institution_registry_identities_registry_unique").on(table.registryName, table.registryExternalId),
    index("institution_registry_identities_institution_idx").on(table.institutionId),
    check("institution_registry_identities_registry_name_check", sql`${table.registryName} in ('SCHOOLINFO', 'ISI')`),
  ],
);
```

### Task 3: Pure import planner

**Files:**
- Create: `src/modules/institution-seed/planner.ts`
- Create: `tests/unit/preppy-seed-planner.test.ts`

**Interfaces:**
- Consumes: `ValidatedSeedPackage`, `SeedImportInventory`
- Produces: `planInstitutionSeedImport(package, inventory): SeedImportPlan`

- [ ] Write failing tests for empty inventory, exact existing graph, exact existing Institution without registry identity, address conflict, domain conflict, slug conflict, pending rows, existing Source without binding, and KIS separation.
- [ ] Run the planner test and confirm failure because the planner is missing.
- [ ] Implement deterministic registry Institution IDs, exact-match adoption, conflict classification, Source reuse, binding repair, and per-code counts.
- [ ] Confirm empty inventory literals: 57 Institution creates, 6 pending skips, 114 Source creates, 114 binding creates.
- [ ] Confirm the second identical inventory produces Institution `UNCHANGED`, Source `SOURCE_REUSED`, and binding `BINDING_REUSED`.

Planner safety gate:

```ts
if (plan.conflicts.length > 0 || plan.invalidRows.length > 0) {
  return { ...plan, applyAllowed: false };
}
```

### Task 4: Transactional importer and CLI

**Files:**
- Create: `src/modules/institution-seed/importer.server.ts`
- Create: `src/modules/institution-seed/report.ts`
- Create: `scripts/data/import-institution-seed.ts`
- Modify: `package.json`
- Create: `tests/unit/preppy-seed-cli.test.ts`
- Create: `tests/integration/preppy-seed-import.test.ts`

**Interfaces:**
- Produces: `dryRunInstitutionSeedImport(input): Promise<SeedImportReport>`
- Produces: `applyInstitutionSeedImport(input): Promise<SeedImportReport>`
- CLI: `npm run data:import-institution-seed -- --file <json> [--dry-run|--apply]`

- [ ] Write a failing CLI parser test for default dry-run, explicit apply, mutually exclusive modes, and required file.
- [ ] Implement the CLI parser without opening a DB on invalid arguments or failed checksum validation.
- [ ] Write integration tests for empty apply, identical second apply, existing matching Institution, Source without binding, and mid-import rollback.
- [ ] Implement inventory reads and a transaction-scoped `pg_advisory_xact_lock(hashtext('preppy-institution-seed-import-v1'))`.
- [ ] Apply planned rows through the existing TransactionManager and write one PII-safe Audit entry with `emitProductSignals=false` migration context.
- [ ] Return non-zero on validation/conflict and deterministic JSON on success.

Forbidden-row safety assertion:

```ts
expect(after).toEqual({
  facts: before.facts,
  opportunities: before.opportunities,
  observations: before.observations,
  snapshots: before.snapshots,
  outbox: before.outbox,
  notifications: before.notifications,
});
```

### Task 5: Publication and regression safety

**Files:**
- Modify: `tests/integration/preppy-seed-import.test.ts`
- Modify: `tests/integration/wp06a-institution-query.test.ts` only if a focused existing fixture is cleaner than the seed integration test

**Interfaces:**
- Consumes: existing `listInstitutions`, `getInstitutionBySlug`, and sitemap query behavior
- Produces: regression proof that imported DRAFT rows are absent from public projections

- [ ] Write a failing integration assertion that imports a resolved Institution and queries list/detail/sitemap surfaces.
- [ ] Confirm the imported row is DRAFT and absent from each public result.
- [ ] Assert dataset `verified_at` exists only in registry metadata and does not create Fact/version Last Verified data.
- [ ] Run relevant public query and seed import integration tests when a dedicated DB is available.

### Task 6: Documentation and verification

**Files:**
- Create: `docs/data/PREPPY_SEED_IMPORT_CONTRACT.md`
- Create: `docs/data/PREPPY_SEED_IMPORT_REPORT.md`
- Create: `docs/data/PREPPY_SEED_AUTOMATION_HANDOFF.md`

**Interfaces:**
- Documents exact field mapping, executed results, rollback, and the next collector boundary.

- [ ] Run canonical dataset validation and record exact counts/checksums.
- [ ] Run dry-run, local/test apply, and second apply only against a dedicated `_test`/`_verifyN` database.
- [ ] If no test database exists, record each DB gate as `NOT EXECUTED — TEST DATABASE UNAVAILABLE` without substituting production.
- [ ] Run relevant unit/integration tests, `npm run typecheck`, `npm run build`, and `git diff --check`.
- [ ] Run final `git status`, `git diff --stat`, and `git diff --check`.
- [ ] Complete the required final verdict while leaving all changes uncommitted.

## Plan Self-review

- Every canonical requirement maps to a task.
- Source-role duplication is avoided: website root maps to `OFFICIAL_MAIN`.
- Derived canonical domain is not stored.
- Pending identities have no database identity path.
- DB-dependent claims are gated on a dedicated test database.
- No step commits, pushes, deploys, or mutates production.
