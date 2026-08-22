import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { migrateDatabase } from "@/src/db/migrate";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import {
  applyInstitutionBackfill,
  institutionIdForSchool,
  mapLegacySchoolToInstitution,
  preflightInstitutionBackfill,
} from "@/src/infrastructure/db/institution-backfill.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL must be set for database integration tests",
  );
}

assertDedicatedTestDatabaseUrl(databaseUrl);

const rawSql = postgres(databaseUrl, { max: 1 });
const testPrefix = "phase-0b-backfill-";
const runtime = getRuntimeDatabase({
  DATABASE_URL: databaseUrl,
  DATABASE_MAX_CONNECTIONS: 3,
  NODE_ENV: "test",
});

type SchoolType =
  "PRIVATE_ELEMENTARY" | "INTERNATIONAL_SCHOOL" | "FOREIGN_SCHOOL";

async function createSchool(
  schoolType: SchoolType | string,
  overrides: Partial<{
    id: string;
    slug: string;
    canonicalName: string;
    lifecycleStatus: "ACTIVE" | "PAUSED" | "ARCHIVED";
    region1: string | null;
    region2: string | null;
    address: string | null;
    officialWebsiteUrl: string | null;
    shortDescription: string | null;
  }> = {},
) {
  const id = overrides.id ?? randomUUID();
  const slug = overrides.slug ?? `${testPrefix}school-${id}`;
  const canonicalName = overrides.canonicalName ?? "Phase 0B Backfill School";

  await rawSql`
    insert into schools (
      id, slug, canonical_name, school_type, lifecycle_status, country_code,
      region1, region2, address, official_website_url, short_description, is_public
    ) values (
      ${id}, ${slug}, ${canonicalName}, ${schoolType},
      ${overrides.lifecycleStatus ?? "ACTIVE"}, 'KR',
      ${overrides.region1 ?? "Seoul"}, ${overrides.region2 ?? "Jongno"},
      ${overrides.address ?? "1 Backfill Road"},
      ${overrides.officialWebsiteUrl ?? "https://example.test"},
      ${overrides.shortDescription ?? "Backfill fixture"}, false
    )
  `;

  return { id, slug, canonicalName };
}

async function resetFixtures() {
  await rawSql`
    delete from institution_school_links
    where link_reason = 'MIGRATION_BACKFILL'
       or school_id in (select id from schools where slug like ${`${testPrefix}%`})
  `;
  await rawSql`
    delete from institutions
    where slug like ${`${testPrefix}%`}
       or id in (
         select link.institution_id
         from institution_school_links as link
         join schools as school on school.id = link.school_id
         where school.slug like ${`${testPrefix}%`}
       )
  `;
  await rawSql`delete from schools where slug like ${`${testPrefix}%`}`;
}

async function silentSideEffectCounts() {
  const [row] = await rawSql<{ outboxEvents: number; alerts: number }[]>`
    select
      (select count(*)::int from outbox_events) as "outboxEvents",
      (select count(*)::int from alerts) as alerts
  `;
  return row ?? { outboxEvents: 0, alerts: 0 };
}

describe("Institution backfill", () => {
  beforeAll(async () => {
    await rawSql`select pg_advisory_lock(hashtext('admissionradar-schema-tests'))`;
    await migrateDatabase(databaseUrl);
  });

  afterEach(async () => {
    await resetFixtures();
  });

  afterAll(async () => {
    await rawSql`select pg_advisory_unlock(hashtext('admissionradar-schema-tests'))`;
    await rawSql.end({ timeout: 5 });
    await closeRuntimeDatabase();
  });

  it("blocks an unknown School type during read-only preflight", async () => {
    await rawSql`alter table schools drop constraint schools_school_type_check`;
    try {
      const school = await createSchool("UNSUPPORTED_TYPE");
      const report = await preflightInstitutionBackfill(runtime.executor);

      expect(report.blockingIssues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "UNKNOWN_SCHOOL_TYPE",
            schoolId: school.id,
          }),
        ]),
      );
    } finally {
      await rawSql`delete from schools where school_type = 'UNSUPPORTED_TYPE'`;
      await rawSql`
        alter table schools add constraint schools_school_type_check
        check (school_type in ('PRIVATE_ELEMENTARY', 'INTERNATIONAL_SCHOOL', 'FOREIGN_SCHOOL'))
      `;
    }
  });

  it("blocks duplicate source slugs during preflight", async () => {
    await rawSql`drop index schools_slug_unique`;
    try {
      const slug = `${testPrefix}duplicate-source-slug`;
      await createSchool("PRIVATE_ELEMENTARY", { slug });
      await createSchool("INTERNATIONAL_SCHOOL", { slug });

      const report = await preflightInstitutionBackfill(runtime.executor);

      expect(report.blockingIssues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "DUPLICATE_SOURCE_SLUG", slug }),
        ]),
      );
    } finally {
      await rawSql`delete from schools where slug = ${`${testPrefix}duplicate-source-slug`}`;
      await rawSql`create unique index schools_slug_unique on schools using btree (slug)`;
    }
  });

  it("applies all legacy taxonomy and state mappings without Product side effects", async () => {
    const privateSchool = await createSchool("PRIVATE_ELEMENTARY", {
      lifecycleStatus: "ACTIVE",
    });
    const internationalSchool = await createSchool("INTERNATIONAL_SCHOOL", {
      lifecycleStatus: "PAUSED",
    });
    const foreignSchool = await createSchool("FOREIGN_SCHOOL", {
      lifecycleStatus: "ARCHIVED",
    });
    const before = await silentSideEffectCounts();

    const result = await applyInstitutionBackfill({
      transactionManager: runtime.transactionManager,
    });

    expect(result).toMatchObject({
      context: { source: "MIGRATION", emitProductSignals: false },
      created: 3,
      linked: 3,
      skipped: 0,
    });
    await expect(silentSideEffectCounts()).resolves.toEqual(before);

    const rows = await rawSql<
      {
        school_slug: string;
        category: string;
        international_subtype: string | null;
        publication_state: string;
        operational_state: string;
      }[]
    >`
      select school.slug as school_slug, institution.category,
        institution.international_subtype, institution.publication_state,
        institution.operational_state
      from institution_school_links as link
      join schools as school on school.id = link.school_id
      join institutions as institution on institution.id = link.institution_id
      where school.id in (${privateSchool.id}, ${internationalSchool.id}, ${foreignSchool.id})
      order by school.school_type
    `;

    expect(rows).toEqual([
      {
        school_slug: foreignSchool.slug,
        category: "INTERNATIONAL_SCHOOL",
        international_subtype: "FOREIGN_SCHOOL",
        publication_state: "DRAFT",
        operational_state: "UNKNOWN",
      },
      {
        school_slug: internationalSchool.slug,
        category: "INTERNATIONAL_SCHOOL",
        international_subtype: "INTERNATIONAL_SCHOOL",
        publication_state: "DRAFT",
        operational_state: "INACTIVE",
      },
      {
        school_slug: privateSchool.slug,
        category: "PRIVATE_ELEMENTARY",
        international_subtype: null,
        publication_state: "DRAFT",
        operational_state: "ACTIVE",
      },
    ]);
  });

  it("is idempotent on a second apply with the same deterministic IDs", async () => {
    const school = await createSchool("PRIVATE_ELEMENTARY");

    const first = await applyInstitutionBackfill({
      transactionManager: runtime.transactionManager,
    });
    const second = await applyInstitutionBackfill({
      transactionManager: runtime.transactionManager,
    });

    expect(first).toMatchObject({ created: 1, linked: 1, skipped: 0 });
    expect(second).toMatchObject({ created: 0, linked: 0, skipped: 1 });
    await expect(rawSql<{ id: string }[]>`
      select id from institutions where id = ${institutionIdForSchool(school.id)}
    `).resolves.toEqual([{ id: institutionIdForSchool(school.id) }]);
  });

  it("treats an expected Institution without its bridge as a safe link-only partial state", async () => {
    const school = await createSchool("FOREIGN_SCHOOL");
    const mapping = mapLegacySchoolToInstitution({
      id: school.id,
      slug: school.slug,
      canonicalName: school.canonicalName,
      schoolType: "FOREIGN_SCHOOL",
      lifecycleStatus: "ACTIVE",
      region1: "Seoul",
      region2: "Jongno",
      address: "1 Backfill Road",
      officialWebsiteUrl: "https://example.test",
      shortDescription: "Backfill fixture",
    });

    await rawSql`
      insert into institutions (
        id, slug, display_name, category, international_subtype,
        operational_state, publication_state, city, district, address_line,
        website_url, short_description
      ) values (
        ${mapping.id}, ${mapping.slug}, ${mapping.displayName}, ${mapping.category},
        ${mapping.internationalSubtype}, ${mapping.operationalState},
        ${mapping.publicationState}, ${mapping.city}, ${mapping.district},
        ${mapping.addressLine}, ${mapping.websiteUrl}, ${mapping.shortDescription}
      )
    `;

    const result = await applyInstitutionBackfill({
      transactionManager: runtime.transactionManager,
    });

    expect(result).toMatchObject({ created: 0, linked: 1, skipped: 0 });
  });

  it("blocks a conflicting existing School mapping", async () => {
    const school = await createSchool("PRIVATE_ELEMENTARY");
    const unexpectedInstitutionId = randomUUID();
    await rawSql`
      insert into institutions (id, slug, display_name, category)
      values (
        ${unexpectedInstitutionId}, ${`${testPrefix}unexpected-${randomUUID()}`},
        'Unexpected Institution', 'PRIVATE_ELEMENTARY'
      )
    `;
    await rawSql`
      insert into institution_school_links (institution_id, school_id, link_reason)
      values (${unexpectedInstitutionId}, ${school.id}, 'phase-0b-test-conflict')
    `;

    const report = await preflightInstitutionBackfill(runtime.executor);

    expect(report.blockingIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "SCHOOL_LINKED_TO_UNEXPECTED_INSTITUTION",
        }),
      ]),
    );
  });

  it("blocks a target slug collision and performs no writes", async () => {
    const school = await createSchool("PRIVATE_ELEMENTARY");
    await rawSql`
      insert into institutions (id, slug, display_name, category)
      values (${randomUUID()}, ${school.slug}, 'Occupied Slug', 'PRIVATE_ELEMENTARY')
    `;
    const before = await rawSql<{ institutions: number; links: number }[]>`
      select
        (select count(*)::int from institutions where slug like ${`${testPrefix}%`}) as institutions,
        (select count(*)::int from institution_school_links) as links
    `;

    await expect(
      applyInstitutionBackfill({
        transactionManager: runtime.transactionManager,
      }),
    ).rejects.toThrow("Institution backfill preflight failed");

    await expect(rawSql<{ institutions: number; links: number }[]>`
      select
        (select count(*)::int from institutions where slug like ${`${testPrefix}%`}) as institutions,
        (select count(*)::int from institution_school_links) as links
    `).resolves.toEqual(before);
  });

  it("rolls back all inserts when a database trigger forces a mid-apply failure", async () => {
    const ids = [randomUUID(), randomUUID()].sort();
    const first = await createSchool("PRIVATE_ELEMENTARY", {
      id: ids[0],
      canonicalName: "Rollback First",
    });
    const second = await createSchool("PRIVATE_ELEMENTARY", {
      id: ids[1],
      canonicalName: "Rollback Failure",
    });
    await rawSql`
      create function phase_0b_backfill_test_failure() returns trigger
      language plpgsql as $$
      begin
        if new.display_name = 'Rollback Failure' then
          raise exception 'PHASE_0B_FORCED_FAILURE';
        end if;
        return new;
      end;
      $$
    `;
    await rawSql`
      create trigger phase_0b_backfill_test_failure
      before insert on institutions
      for each row execute function phase_0b_backfill_test_failure()
    `;

    try {
      await expect(
        applyInstitutionBackfill({
          transactionManager: runtime.transactionManager,
        }),
      ).rejects.toThrow();
      await expect(rawSql<{ count: number }[]>`
        select count(*)::int as count
        from institutions where id in (${institutionIdForSchool(first.id)}, ${institutionIdForSchool(second.id)})
      `).resolves.toEqual([{ count: 0 }]);
      await expect(rawSql<{ count: number }[]>`
        select count(*)::int as count
        from institution_school_links where school_id in (${first.id}, ${second.id})
      `).resolves.toEqual([{ count: 0 }]);
    } finally {
      await rawSql`drop trigger if exists phase_0b_backfill_test_failure on institutions`;
      await rawSql`drop function if exists phase_0b_backfill_test_failure()`;
    }
  });
});
