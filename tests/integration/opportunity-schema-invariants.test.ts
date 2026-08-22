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
const testPrefix = "wp-02a-opportunity-";

type OpportunityKind =
  | "RECRUITMENT"
  | "ADDITIONAL_RECRUITMENT"
  | "INFORMATION_SESSION"
  | "CONSULTATION"
  | "LEVEL_TEST"
  | "OPEN_HOUSE"
  | "APPLICATION"
  | "DOCUMENT_SUBMISSION"
  | "ASSESSMENT"
  | "INTERVIEW"
  | "LOTTERY"
  | "RESULT_ANNOUNCEMENT"
  | "REGISTRATION"
  | "DEADLINE"
  | "OTHER";

type TruthMode = "NATIVE" | "LEGACY_BACKED";
type PublicationState = "DRAFT" | "PUBLISHED" | "HIDDEN" | "ARCHIVED";

async function createSchool() {
  const id = randomUUID();

  await sql`
    insert into schools (
      id, slug, canonical_name, school_type, lifecycle_status, country_code,
      is_public
    ) values (
      ${id}, ${`${testPrefix}school-${id}`}, 'WP-02A School',
      'PRIVATE_ELEMENTARY', 'ACTIVE', 'KR', false
    )
  `;

  return id;
}

async function createCycle(schoolId: string) {
  const id = randomUUID();

  await sql`
    insert into admission_cycles (
      id, school_id, academic_year, lifecycle_status, admission_mode,
      is_public_focus, internal_notes
    ) values (
      ${id}, ${schoolId}, 2099, 'PLANNED', 'UNKNOWN', false,
      ${`${testPrefix}fixture`}
    )
  `;

  return id;
}

async function createEvent(admissionCycleId: string) {
  const id = randomUUID();

  await sql`
    insert into admission_events (
      id, admission_cycle_id, event_key, event_type, canonical_title,
      importance, actionability, is_public
    ) values (
      ${id}, ${admissionCycleId}, ${`${testPrefix}event-${id}`},
      'APPLICATION', 'WP-02A Event', 'NORMAL', 'ACTION_REQUIRED', false
    )
  `;

  return id;
}

async function createInstitution() {
  const id = randomUUID();

  await sql`
    insert into institutions (id, slug, display_name, category)
    values (
      ${id}, ${`${testPrefix}institution-${id}`}, 'WP-02A Institution',
      'PRIVATE_ELEMENTARY'
    )
  `;

  return id;
}

async function linkInstitutionToSchool(
  institutionId: string,
  schoolId: string,
) {
  await sql`
    insert into institution_school_links (
      institution_id, school_id, link_reason
    ) values (${institutionId}, ${schoolId}, ${`${testPrefix}fixture`})
  `;
}

async function createOpportunity(
  institutionId: string,
  options: {
    slug?: string;
    kind?: OpportunityKind | string;
    truthMode?: TruthMode | string;
    publicationState?: PublicationState | string;
  } = {},
) {
  const id = randomUUID();
  const slug = options.slug ?? `${testPrefix}${id}`;

  await sql`
    insert into opportunities (
      id, institution_id, slug, kind, truth_mode, publication_state
    ) values (
      ${id}, ${institutionId}, ${slug}, ${options.kind ?? "RECRUITMENT"},
      ${options.truthMode ?? "NATIVE"},
      ${options.publicationState ?? "DRAFT"}
    )
  `;

  return { id, slug };
}

async function linkOpportunityToEvent(input: {
  opportunityId: string;
  institutionId: string;
  admissionEventId: string;
  admissionCycleId: string;
  schoolId: string;
}) {
  await sql`
    insert into opportunity_admission_event_links (
      opportunity_id, institution_id, truth_mode, admission_event_id,
      admission_cycle_id, school_id
    ) values (
      ${input.opportunityId}, ${input.institutionId}, 'LEGACY_BACKED',
      ${input.admissionEventId}, ${input.admissionCycleId}, ${input.schoolId}
    )
  `;
}

async function createLegacyAggregate() {
  const schoolId = await createSchool();
  const admissionCycleId = await createCycle(schoolId);
  const admissionEventId = await createEvent(admissionCycleId);
  const institutionId = await createInstitution();
  await linkInstitutionToSchool(institutionId, schoolId);

  return { schoolId, admissionCycleId, admissionEventId, institutionId };
}

async function createLinkedLegacyOpportunity() {
  const aggregate = await createLegacyAggregate();
  const opportunity = await createOpportunity(aggregate.institutionId, {
    truthMode: "LEGACY_BACKED",
  });

  await linkOpportunityToEvent({
    opportunityId: opportunity.id,
    ...aggregate,
  });

  return { ...aggregate, opportunity };
}

async function resetWp02AFixtures() {
  const [{ opportunitiesTable, linksTable }] = await sql<
    { opportunitiesTable: string | null; linksTable: string | null }[]
  >`
    select
      to_regclass('public.opportunities') as "opportunitiesTable",
      to_regclass('public.opportunity_admission_event_links') as "linksTable"
  `;

  if (linksTable && opportunitiesTable) {
    await sql.begin(async (transaction) => {
      await transaction`
        delete from opportunity_admission_event_links
        where opportunity_id in (
          select id from opportunities where slug like ${`${testPrefix}%`}
        )
        or admission_event_id in (
          select id from admission_events where event_key like ${`${testPrefix}%`}
        )
      `;
      await transaction`
        delete from opportunities where slug like ${`${testPrefix}%`}
      `;
    });
  } else if (opportunitiesTable) {
    await sql`delete from opportunities where slug like ${`${testPrefix}%`}`;
  }
  await sql`
    delete from admission_events where event_key like ${`${testPrefix}%`}
  `;
  await sql`
    delete from admission_cycles where internal_notes = ${`${testPrefix}fixture`}
  `;
  await sql`
    delete from institution_school_links
    where link_reason = ${`${testPrefix}fixture`}
  `;
  await sql`delete from institutions where slug like ${`${testPrefix}%`}`;
  await sql`delete from schools where slug like ${`${testPrefix}%`}`;
}

describe("WP-02A Opportunity schema invariants", () => {
  beforeAll(async () => {
    await sql`select pg_advisory_lock(hashtext('admissionradar-schema-tests'))`;
    await migrateDatabase(databaseUrl);
  });

  afterEach(async () => {
    await resetWp02AFixtures();
  });

  afterAll(async () => {
    await sql`select pg_advisory_unlock(hashtext('admissionradar-schema-tests'))`;
    await sql.end({ timeout: 5 });
  });

  it("allows a Native Opportunity without an AdmissionEvent", async () => {
    const institutionId = await createInstitution();
    const opportunity = await createOpportunity(institutionId);

    const [row] = await sql<
      { truth_mode: string; publication_state: string; links: number }[]
    >`
      select
        opportunity.truth_mode,
        opportunity.publication_state,
        count(link.opportunity_id)::int as links
      from opportunities as opportunity
      left join opportunity_admission_event_links as link
        on link.opportunity_id = opportunity.id
      where opportunity.id = ${opportunity.id}
      group by opportunity.id
    `;

    expect(row).toEqual({
      truth_mode: "NATIVE",
      publication_state: "DRAFT",
      links: 0,
    });
  });

  it("allows multiple Opportunities for one Institution", async () => {
    const institutionId = await createInstitution();
    await createOpportunity(institutionId);
    await createOpportunity(institutionId, { kind: "OPEN_HOUSE" });

    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count
      from opportunities
      where institution_id = ${institutionId}
    `;

    expect(count).toBe(2);
  });

  it("rejects bridging one Opportunity to two AdmissionEvents", async () => {
    const aggregate = await createLegacyAggregate();
    const secondEventId = await createEvent(aggregate.admissionCycleId);
    const opportunity = await createOpportunity(aggregate.institutionId, {
      truthMode: "LEGACY_BACKED",
    });

    await linkOpportunityToEvent({
      opportunityId: opportunity.id,
      ...aggregate,
    });

    await expect(
      linkOpportunityToEvent({
        opportunityId: opportunity.id,
        institutionId: aggregate.institutionId,
        admissionEventId: secondEventId,
        admissionCycleId: aggregate.admissionCycleId,
        schoolId: aggregate.schoolId,
      }),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("rejects bridging one AdmissionEvent to two Opportunities", async () => {
    const aggregate = await createLegacyAggregate();
    const firstOpportunity = await createOpportunity(aggregate.institutionId, {
      truthMode: "LEGACY_BACKED",
    });
    const secondOpportunity = await createOpportunity(aggregate.institutionId, {
      truthMode: "LEGACY_BACKED",
    });

    await linkOpportunityToEvent({
      opportunityId: firstOpportunity.id,
      ...aggregate,
    });

    await expect(
      linkOpportunityToEvent({
        opportunityId: secondOpportunity.id,
        ...aggregate,
      }),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("rejects duplicate Opportunity slugs", async () => {
    const institutionId = await createInstitution();
    const first = await createOpportunity(institutionId);

    await expect(
      createOpportunity(institutionId, { slug: first.slug }),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("rejects an Opportunity with a missing Institution", async () => {
    await expect(createOpportunity(randomUUID())).rejects.toMatchObject({
      code: "23503",
    });
  });

  it("rejects an invalid Opportunity kind", async () => {
    const institutionId = await createInstitution();

    await expect(
      createOpportunity(institutionId, { kind: "BRIEFING" }),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("rejects an invalid Opportunity truth mode", async () => {
    const institutionId = await createInstitution();

    await expect(
      createOpportunity(institutionId, { truthMode: "UNKNOWN" }),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("rejects an invalid Opportunity publication state", async () => {
    const institutionId = await createInstitution();

    await expect(
      createOpportunity(institutionId, { publicationState: "REVIEW" }),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("rejects a bridge for a Native Opportunity", async () => {
    const aggregate = await createLegacyAggregate();
    const opportunity = await createOpportunity(aggregate.institutionId);

    await expect(
      linkOpportunityToEvent({
        opportunityId: opportunity.id,
        ...aggregate,
      }),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("rejects publishing a LEGACY_BACKED Opportunity without its bridge", async () => {
    const institutionId = await createInstitution();

    await expect(
      sql.begin(async (transaction) => {
        await transaction`
          insert into opportunities (
            id, institution_id, slug, kind, truth_mode, publication_state
          ) values (
            ${randomUUID()}, ${institutionId},
            ${`${testPrefix}unbridged-published-${randomUUID()}`},
            'APPLICATION', 'LEGACY_BACKED', 'PUBLISHED'
          )
        `;
      }),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("allows an atomic PUBLISHED LEGACY_BACKED Opportunity and bridge", async () => {
    const aggregate = await createLegacyAggregate();
    const opportunityId = randomUUID();

    await sql.begin(async (transaction) => {
      await transaction`
        insert into opportunities (
          id, institution_id, slug, kind, truth_mode, publication_state
        ) values (
          ${opportunityId}, ${aggregate.institutionId},
          ${`${testPrefix}atomic-published-${randomUUID()}`},
          'APPLICATION', 'LEGACY_BACKED', 'PUBLISHED'
        )
      `;
      await transaction`
        insert into opportunity_admission_event_links (
          opportunity_id, institution_id, truth_mode, admission_event_id,
          admission_cycle_id, school_id
        ) values (
          ${opportunityId}, ${aggregate.institutionId}, 'LEGACY_BACKED',
          ${aggregate.admissionEventId}, ${aggregate.admissionCycleId},
          ${aggregate.schoolId}
        )
      `;
    });

    const [{ links }] = await sql<{ links: number }[]>`
      select count(*)::int as links
      from opportunity_admission_event_links
      where opportunity_id = ${opportunityId}
    `;
    expect(links).toBe(1);
  });

  it("accepts a consistent Institution-School-Cycle-Event bridge", async () => {
    const aggregate = await createLegacyAggregate();
    const opportunity = await createOpportunity(aggregate.institutionId, {
      truthMode: "LEGACY_BACKED",
    });

    await linkOpportunityToEvent({
      opportunityId: opportunity.id,
      ...aggregate,
    });

    const [link] = await sql<
      {
        opportunity_id: string;
        institution_id: string;
        truth_mode: string;
        admission_event_id: string;
        admission_cycle_id: string;
        school_id: string;
      }[]
    >`
      select
        opportunity_id, institution_id, truth_mode, admission_event_id,
        admission_cycle_id, school_id
      from opportunity_admission_event_links
      where opportunity_id = ${opportunity.id}
    `;

    expect(link).toEqual({
      opportunity_id: opportunity.id,
      institution_id: aggregate.institutionId,
      truth_mode: "LEGACY_BACKED",
      admission_event_id: aggregate.admissionEventId,
      admission_cycle_id: aggregate.admissionCycleId,
      school_id: aggregate.schoolId,
    });
  });

  it("rejects a redundant Institution that does not match its Opportunity", async () => {
    const firstAggregate = await createLegacyAggregate();
    const secondAggregate = await createLegacyAggregate();
    const opportunity = await createOpportunity(firstAggregate.institutionId, {
      truthMode: "LEGACY_BACKED",
    });

    await expect(
      linkOpportunityToEvent({
        opportunityId: opportunity.id,
        institutionId: secondAggregate.institutionId,
        admissionEventId: secondAggregate.admissionEventId,
        admissionCycleId: secondAggregate.admissionCycleId,
        schoolId: secondAggregate.schoolId,
      }),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("rejects a School that is not mapped to the Opportunity Institution", async () => {
    const firstAggregate = await createLegacyAggregate();
    const secondAggregate = await createLegacyAggregate();
    const opportunity = await createOpportunity(secondAggregate.institutionId, {
      truthMode: "LEGACY_BACKED",
    });

    await expect(
      linkOpportunityToEvent({
        opportunityId: opportunity.id,
        institutionId: secondAggregate.institutionId,
        admissionEventId: firstAggregate.admissionEventId,
        admissionCycleId: firstAggregate.admissionCycleId,
        schoolId: firstAggregate.schoolId,
      }),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("rejects an AdmissionEvent paired with a different AdmissionCycle", async () => {
    const firstAggregate = await createLegacyAggregate();
    const secondAggregate = await createLegacyAggregate();
    const opportunity = await createOpportunity(secondAggregate.institutionId, {
      truthMode: "LEGACY_BACKED",
    });

    await expect(
      linkOpportunityToEvent({
        opportunityId: opportunity.id,
        institutionId: secondAggregate.institutionId,
        admissionEventId: firstAggregate.admissionEventId,
        admissionCycleId: secondAggregate.admissionCycleId,
        schoolId: secondAggregate.schoolId,
      }),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("rejects an AdmissionCycle paired with a different School", async () => {
    const firstAggregate = await createLegacyAggregate();
    const secondAggregate = await createLegacyAggregate();
    const opportunity = await createOpportunity(secondAggregate.institutionId, {
      truthMode: "LEGACY_BACKED",
    });

    await expect(
      linkOpportunityToEvent({
        opportunityId: opportunity.id,
        institutionId: secondAggregate.institutionId,
        admissionEventId: firstAggregate.admissionEventId,
        admissionCycleId: firstAggregate.admissionCycleId,
        schoolId: secondAggregate.schoolId,
      }),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("rejects changing the Institution of a bridged Opportunity", async () => {
    const linked = await createLinkedLegacyOpportunity();
    const otherInstitutionId = await createInstitution();

    await expect(sql`
      update opportunities
      set institution_id = ${otherInstitutionId}
      where id = ${linked.opportunity.id}
    `).rejects.toMatchObject({ code: "23503" });
  });

  it("rejects changing the truth mode of a bridged Opportunity", async () => {
    const linked = await createLinkedLegacyOpportunity();

    await expect(sql`
      update opportunities
      set truth_mode = 'NATIVE'
      where id = ${linked.opportunity.id}
    `).rejects.toMatchObject({ code: "23503" });
  });

  it("rejects changing the School in a referenced Institution mapping", async () => {
    const linked = await createLinkedLegacyOpportunity();
    const otherSchoolId = await createSchool();

    await expect(sql`
      update institution_school_links
      set school_id = ${otherSchoolId}
      where institution_id = ${linked.institutionId}
    `).rejects.toMatchObject({ code: "23503" });
  });

  it("rejects changing the AdmissionCycle of a bridged AdmissionEvent", async () => {
    const linked = await createLinkedLegacyOpportunity();
    const otherSchoolId = await createSchool();
    const otherCycleId = await createCycle(otherSchoolId);

    await expect(sql`
      update admission_events
      set admission_cycle_id = ${otherCycleId}
      where id = ${linked.admissionEventId}
    `).rejects.toMatchObject({ code: "23503" });
  });

  it("rejects changing the School of a bridged AdmissionCycle", async () => {
    const linked = await createLinkedLegacyOpportunity();
    const otherSchoolId = await createSchool();

    await expect(sql`
      update admission_cycles
      set school_id = ${otherSchoolId}
      where id = ${linked.admissionCycleId}
    `).rejects.toMatchObject({ code: "23503" });
  });

  it("RESTRICTS deleting a bridged Opportunity", async () => {
    const linked = await createLinkedLegacyOpportunity();

    await expect(sql`
      delete from opportunities where id = ${linked.opportunity.id}
    `).rejects.toMatchObject({ code: "23503" });
  });

  it("RESTRICTS deleting a bridged AdmissionEvent", async () => {
    const linked = await createLinkedLegacyOpportunity();

    await expect(sql`
      delete from admission_events where id = ${linked.admissionEventId}
    `).rejects.toMatchObject({ code: "23503" });
  });

  it("RESTRICTS deleting a referenced Institution-School mapping", async () => {
    const linked = await createLinkedLegacyOpportunity();

    await expect(sql`
      delete from institution_school_links
      where institution_id = ${linked.institutionId}
        and school_id = ${linked.schoolId}
    `).rejects.toMatchObject({ code: "23503" });
  });

  it("RESTRICTS deleting the Institution of a bridged Opportunity", async () => {
    const linked = await createLinkedLegacyOpportunity();

    await expect(sql`
      delete from institutions where id = ${linked.institutionId}
    `).rejects.toMatchObject({ code: "23503" });
  });

  it("RESTRICTS deleting the AdmissionCycle of a bridged AdmissionEvent", async () => {
    const linked = await createLinkedLegacyOpportunity();

    await expect(sql`
      delete from admission_cycles where id = ${linked.admissionCycleId}
    `).rejects.toMatchObject({ code: "23503" });
  });

  it("rejects deleting the bridge from a PUBLISHED LEGACY_BACKED Opportunity", async () => {
    const linked = await createLinkedLegacyOpportunity();
    await sql`
      update opportunities
      set publication_state = 'PUBLISHED'
      where id = ${linked.opportunity.id}
    `;

    await expect(
      sql.begin(async (transaction) => {
        await transaction`
          delete from opportunity_admission_event_links
          where opportunity_id = ${linked.opportunity.id}
        `;
      }),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("rejects non-canonical Opportunity slugs", async () => {
    const institutionId = await createInstitution();

    await expect(
      createOpportunity(institutionId, { slug: "Not URL Safe" }),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("updates opportunities.updated_at through the direct SQL update trigger", async () => {
    const institutionId = await createInstitution();
    const opportunity = await createOpportunity(institutionId);
    const fixedPast = new Date("2000-01-01T00:00:00.000Z");

    const [updated] = await sql<{ updated_at: Date }[]>`
      update opportunities
      set slug = ${`${testPrefix}updated-${randomUUID()}`},
          updated_at = ${fixedPast}
      where id = ${opportunity.id}
      returning updated_at
    `;

    expect(updated.updated_at.getTime()).toBeGreaterThan(fixedPast.getTime());
  });
});
