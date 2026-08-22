import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { migrateDatabase } from "@/src/db/migrate";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL must be set for database integration tests",
  );
}

assertDedicatedTestDatabaseUrl(databaseUrl);

const sql = postgres(databaseUrl, { max: 1 });
const testPrefix = "phase-0b-institution-";

type InstitutionCategory =
  "ENGLISH_KINDERGARTEN" | "PRIVATE_ELEMENTARY" | "INTERNATIONAL_SCHOOL";
type InternationalSubtype =
  "INTERNATIONAL_SCHOOL" | "FOREIGN_SCHOOL" | "OTHER_INTERNATIONAL";

async function createLegacySchool(
  schoolType: "PRIVATE_ELEMENTARY" | "INTERNATIONAL_SCHOOL" | "FOREIGN_SCHOOL",
) {
  const id = randomUUID();
  const slug = `${testPrefix}school-${id}`;

  await sql`
    insert into schools (
      id, slug, canonical_name, school_type, lifecycle_status, country_code,
      is_public
    ) values (
      ${id}, ${slug}, 'Phase 0B School', ${schoolType}, 'ACTIVE', 'KR', false
    )
  `;

  return id;
}

async function createInstitution(
  category: InstitutionCategory,
  subtype: InternationalSubtype | null = null,
) {
  const id = randomUUID();
  const slug = `${testPrefix}institution-${id}`;

  await sql`
    insert into institutions (id, slug, display_name, category, international_subtype)
    values (${id}, ${slug}, 'Phase 0B Institution', ${category}, ${subtype})
  `;

  return { id, slug };
}

async function linkInstitutionToSchool(
  institutionId: string,
  schoolId: string,
) {
  await sql`
    insert into institution_school_links (institution_id, school_id, link_reason)
    values (${institutionId}, ${schoolId}, 'phase-0b-test')
  `;
}

async function resetPhase0BFixtures() {
  const [{ linksTable }] = await sql<{ linksTable: string | null }[]>`
    select to_regclass('public.institution_school_links') as "linksTable"
  `;
  const [{ institutionsTable }] = await sql<
    { institutionsTable: string | null }[]
  >`
    select to_regclass('public.institutions') as "institutionsTable"
  `;

  if (linksTable) {
    await sql`
      delete from institution_school_links
      where link_reason = 'phase-0b-test'
    `;
  }
  if (institutionsTable) {
    await sql`
      delete from institutions where slug like ${`${testPrefix}%`}
    `;
  }
  await sql`delete from schools where slug like ${`${testPrefix}%`}`;
}

describe("Phase 0B Institution schema invariants", () => {
  beforeAll(async () => {
    await sql`select pg_advisory_lock(hashtext('admissionradar-schema-tests'))`;
    await migrateDatabase(databaseUrl);
  });

  afterEach(async () => {
    await resetPhase0BFixtures();
  });

  afterAll(async () => {
    await sql`select pg_advisory_unlock(hashtext('admissionradar-schema-tests'))`;
    await sql.end({ timeout: 5 });
  });

  it("allows a native ENGLISH_KINDERGARTEN Institution without a legacy School link", async () => {
    const institution = await createInstitution("ENGLISH_KINDERGARTEN");

    const [row] = await sql<
      {
        category: string;
        operational_state: string;
        publication_state: string;
        links: number;
      }[]
    >`
      select
        institution.category,
        institution.operational_state,
        institution.publication_state,
        count(link.institution_id)::int as links
      from institutions as institution
      left join institution_school_links as link on link.institution_id = institution.id
      where institution.id = ${institution.id}
      group by institution.id
    `;

    expect(row).toMatchObject({
      category: "ENGLISH_KINDERGARTEN",
      operational_state: "UNKNOWN",
      publication_state: "DRAFT",
      links: 0,
    });
  });

  it("stores the required legacy School category and subtype mappings", async () => {
    const privateElementarySchoolId =
      await createLegacySchool("PRIVATE_ELEMENTARY");
    const internationalSchoolId = await createLegacySchool(
      "INTERNATIONAL_SCHOOL",
    );
    const foreignSchoolId = await createLegacySchool("FOREIGN_SCHOOL");
    const privateElementary = await createInstitution("PRIVATE_ELEMENTARY");
    const international = await createInstitution(
      "INTERNATIONAL_SCHOOL",
      "INTERNATIONAL_SCHOOL",
    );
    const foreign = await createInstitution(
      "INTERNATIONAL_SCHOOL",
      "FOREIGN_SCHOOL",
    );

    await linkInstitutionToSchool(
      privateElementary.id,
      privateElementarySchoolId,
    );
    await linkInstitutionToSchool(international.id, internationalSchoolId);
    await linkInstitutionToSchool(foreign.id, foreignSchoolId);

    const rows = await sql<
      {
        school_type: string;
        category: string;
        international_subtype: string | null;
      }[]
    >`
      select school.school_type, institution.category, institution.international_subtype
      from institution_school_links as link
      join schools as school on school.id = link.school_id
      join institutions as institution on institution.id = link.institution_id
      where school.id in (
        ${privateElementarySchoolId}, ${internationalSchoolId}, ${foreignSchoolId}
      )
      order by school.school_type
    `;

    expect(rows).toEqual([
      {
        school_type: "FOREIGN_SCHOOL",
        category: "INTERNATIONAL_SCHOOL",
        international_subtype: "FOREIGN_SCHOOL",
      },
      {
        school_type: "INTERNATIONAL_SCHOOL",
        category: "INTERNATIONAL_SCHOOL",
        international_subtype: "INTERNATIONAL_SCHOOL",
      },
      {
        school_type: "PRIVATE_ELEMENTARY",
        category: "PRIVATE_ELEMENTARY",
        international_subtype: null,
      },
    ]);
  });

  it("rejects linking one School to two Institutions", async () => {
    const schoolId = await createLegacySchool("PRIVATE_ELEMENTARY");
    const firstInstitution = await createInstitution("PRIVATE_ELEMENTARY");
    const secondInstitution = await createInstitution("PRIVATE_ELEMENTARY");

    await linkInstitutionToSchool(firstInstitution.id, schoolId);

    await expect(
      linkInstitutionToSchool(secondInstitution.id, schoolId),
    ).rejects.toMatchObject({
      code: "23505",
    });
  });

  it("rejects linking one Institution to two Schools", async () => {
    const institution = await createInstitution("PRIVATE_ELEMENTARY");
    const firstSchoolId = await createLegacySchool("PRIVATE_ELEMENTARY");
    const secondSchoolId = await createLegacySchool("PRIVATE_ELEMENTARY");

    await linkInstitutionToSchool(institution.id, firstSchoolId);

    await expect(
      linkInstitutionToSchool(institution.id, secondSchoolId),
    ).rejects.toMatchObject({
      code: "23505",
    });
  });

  it("rejects duplicate Institution slugs", async () => {
    const institution = await createInstitution("ENGLISH_KINDERGARTEN");

    await expect(sql`
      insert into institutions (id, slug, display_name, category)
      values (${randomUUID()}, ${institution.slug}, 'Duplicate Institution', 'ENGLISH_KINDERGARTEN')
    `).rejects.toMatchObject({ code: "23505" });
  });

  it("rejects invalid Institution categories and subtype/category pairings", async () => {
    await expect(sql`
      insert into institutions (id, slug, display_name, category)
      values (
        ${randomUUID()}, ${`${testPrefix}invalid-category-${randomUUID()}`},
        'Invalid Institution', 'FOREIGN_SCHOOL'
      )
    `).rejects.toMatchObject({ code: "23514" });

    await expect(sql`
      insert into institutions (
        id, slug, display_name, category, international_subtype
      ) values (
        ${randomUUID()}, ${`${testPrefix}invalid-subtype-${randomUUID()}`},
        'Invalid Institution', 'PRIVATE_ELEMENTARY', 'FOREIGN_SCHOOL'
      )
    `).rejects.toMatchObject({ code: "23514" });
  });

  it("enforces bridge foreign-key integrity", async () => {
    const institution = await createInstitution("PRIVATE_ELEMENTARY");
    const schoolId = await createLegacySchool("PRIVATE_ELEMENTARY");

    await expect(
      linkInstitutionToSchool(randomUUID(), schoolId),
    ).rejects.toMatchObject({
      code: "23503",
    });
    await expect(
      linkInstitutionToSchool(institution.id, randomUUID()),
    ).rejects.toMatchObject({
      code: "23503",
    });
  });
  it("rejects invalid International School subtype values", async () => {
    await expect(sql`
      insert into institutions (
        id, slug, display_name, category, international_subtype
      ) values (
        ${randomUUID()}, ${`${testPrefix}invalid-international-subtype-${randomUUID()}`},
        'Invalid International Institution', 'INTERNATIONAL_SCHOOL', 'INVALID'
      )
    `).rejects.toMatchObject({ code: "23514" });
  });

  it("updates institutions.updated_at through the direct SQL update trigger", async () => {
    const institution = await createInstitution("ENGLISH_KINDERGARTEN");
    const fixedPast = new Date("2000-01-01T00:00:00.000Z");

    const [updated] = await sql<{ updated_at: Date }[]>`
      update institutions
      set display_name = 'Updated Institution', updated_at = ${fixedPast}
      where id = ${institution.id}
      returning updated_at
    `;

    expect(updated?.updated_at.getTime()).toBeGreaterThan(fixedPast.getTime());
  });
});
