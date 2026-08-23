import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { migrateDatabase } from "@/src/db/migrate";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL must be set");
assertDedicatedTestDatabaseUrl(databaseUrl);

const sql = postgres(databaseUrl, { max: 4 });
const schemaLockSql = postgres(databaseUrl, { max: 1 });
const prefix = "wp10a-schema-";

async function createInstitution(category = "ENGLISH_KINDERGARTEN") {
  const id = randomUUID();
  await sql`
    insert into institutions (id, slug, display_name, category)
    values (${id}, ${`${prefix}${id}`}, 'WP-10A Institution', ${category})
  `;
  return id;
}

async function createSource() {
  const id = randomUUID();
  await sql`
    insert into sources (
      id, canonical_url, source_type, authority_level, lifecycle_status,
      source_name
    ) values (
      ${id}, ${`https://official.example.test/${prefix}${id}`},
      'OFFICIAL_SCHOOL_PAGE', 'PRIMARY', 'ACTIVE', 'WP-10A Source'
    )
  `;
  return id;
}

async function createOpportunity(
  institutionId: string,
  truthMode: "NATIVE" | "LEGACY_BACKED" = "NATIVE",
) {
  const id = randomUUID();
  await sql`
    insert into opportunities (
      id, institution_id, slug, kind, truth_mode, publication_state
    ) values (
      ${id}, ${institutionId}, ${`${prefix}${id}`}, 'APPLICATION',
      ${truthMode}, 'DRAFT'
    )
  `;
  return id;
}

async function createLegacyBackedOpportunity() {
  const schoolId = randomUUID();
  const cycleId = randomUUID();
  const eventId = randomUUID();
  const institutionId = await createInstitution("PRIVATE_ELEMENTARY");
  const opportunityId = await createOpportunity(institutionId, "LEGACY_BACKED");

  await sql`
    insert into schools (id, slug, canonical_name, school_type, lifecycle_status)
    values (
      ${schoolId}, ${`${prefix}school-${schoolId}`}, 'WP-10A School',
      'PRIVATE_ELEMENTARY', 'ACTIVE'
    )
  `;
  await sql`
    insert into admission_cycles (
      id, school_id, academic_year, lifecycle_status, admission_mode,
      internal_notes
    ) values (
      ${cycleId}, ${schoolId}, 2099, 'PLANNED', 'UNKNOWN', ${prefix}
    )
  `;
  await sql`
    insert into admission_events (
      id, admission_cycle_id, event_key, event_type, canonical_title,
      importance, actionability, is_public
    ) values (
      ${eventId}, ${cycleId}, ${`${prefix}${eventId}`}, 'APPLICATION',
      'WP-10A Event', 'NORMAL', 'ACTION_REQUIRED', false
    )
  `;
  await sql`
    insert into institution_school_links (
      institution_id, school_id, link_reason
    ) values (${institutionId}, ${schoolId}, ${prefix})
  `;
  await sql`
    insert into opportunity_admission_event_links (
      opportunity_id, institution_id, truth_mode, admission_event_id,
      admission_cycle_id, school_id
    ) values (
      ${opportunityId}, ${institutionId}, 'LEGACY_BACKED', ${eventId},
      ${cycleId}, ${schoolId}
    )
  `;

  return { institutionId, opportunityId };
}

async function insertInstitutionBinding(input: {
  institutionId: string;
  sourceId: string;
  role?: string;
  isPrimary?: boolean;
  isActive?: boolean;
  unboundAt?: Date | null;
}) {
  await sql`
    insert into institution_source_bindings (
      institution_id, source_id, role, is_primary, is_active, bound_at,
      unbound_at
    ) values (
      ${input.institutionId}, ${input.sourceId}, ${input.role ?? "OFFICIAL_MAIN"},
      ${input.isPrimary ?? false}, ${input.isActive ?? true},
      '2026-08-23T00:00:00Z', ${input.unboundAt ?? null}
    )
  `;
}

async function insertOpportunityBinding(input: {
  opportunityId: string;
  sourceId: string;
  role?: string;
  isPrimary?: boolean;
  isActive?: boolean;
  unboundAt?: Date | null;
}) {
  await sql`
    insert into opportunity_source_bindings (
      opportunity_id, source_id, role, is_primary, is_active, bound_at,
      unbound_at
    ) values (
      ${input.opportunityId}, ${input.sourceId},
      ${input.role ?? "PRIMARY_NOTICE"}, ${input.isPrimary ?? false},
      ${input.isActive ?? true}, '2026-08-23T00:00:00Z',
      ${input.unboundAt ?? null}
    )
  `;
}

async function cleanup(input: {
  institutionBindings: boolean;
  opportunityBindings: boolean;
}) {
  await sql.begin(async (transaction) => {
    await transaction.unsafe("set local session_replication_role = replica");
    if (input.opportunityBindings) {
      await transaction.unsafe(
        "delete from opportunity_source_bindings where opportunity_id in (select id from opportunities where slug like 'wp10a-schema-%')",
      );
    }
    if (input.institutionBindings) {
      await transaction.unsafe(
        "delete from institution_source_bindings where institution_id in (select id from institutions where slug like 'wp10a-schema-%')",
      );
    }
    await transaction`
      delete from opportunity_admission_event_links
      where opportunity_id in (
        select id from opportunities where slug like ${`${prefix}%`}
      )
    `;
    await transaction`delete from opportunities where slug like ${`${prefix}%`}`;
    await transaction`delete from admission_events where event_key like ${`${prefix}%`}`;
    await transaction`delete from admission_cycles where internal_notes = ${prefix}`;
    await transaction`delete from institution_school_links where link_reason = ${prefix}`;
    await transaction`delete from schools where slug like ${`${prefix}%`}`;
    await transaction`delete from institutions where slug like ${`${prefix}%`}`;
    await transaction`
      delete from sources where canonical_url like ${`https://official.example.test/${prefix}%`}
    `;
  });
}

describe("WP-10A canonical Source binding schema", () => {
  beforeAll(async () => {
    await schemaLockSql`
      select pg_advisory_lock(hashtext('admissionradar-schema-tests'))
    `;
    await migrateDatabase(databaseUrl);
  });

  afterEach(async () => {
    const [{ institutionBindings, opportunityBindings }] = await sql<
      {
        institutionBindings: string | null;
        opportunityBindings: string | null;
      }[]
    >`
      select
        to_regclass('public.institution_source_bindings')::text as "institutionBindings",
        to_regclass('public.opportunity_source_bindings')::text as "opportunityBindings"
    `;
    await cleanup({
      institutionBindings: Boolean(institutionBindings),
      opportunityBindings: Boolean(opportunityBindings),
    });
  });

  afterAll(async () => {
    await schemaLockSql`
      select pg_advisory_unlock(hashtext('admissionradar-schema-tests'))
    `;
    await schemaLockSql.end({ timeout: 5 });
    await sql.end({ timeout: 5 });
  });

  it("binds a native ENGLISH_KINDERGARTEN Institution without a fake School", async () => {
    const institutionId = await createInstitution();
    const sourceId = await createSource();

    await insertInstitutionBinding({
      institutionId,
      sourceId,
      isPrimary: true,
    });

    const [row] = await sql`
      select institution_id, source_id, role, is_primary, is_active, unbound_at
      from institution_source_bindings
      where institution_id = ${institutionId}
    `;
    expect(row).toMatchObject({
      institution_id: institutionId,
      source_id: sourceId,
      role: "OFFICIAL_MAIN",
      is_primary: true,
      is_active: true,
      unbound_at: null,
    });
  });

  it("binds a Source to a legacy-backed Institution", async () => {
    const legacy = await createLegacyBackedOpportunity();
    const sourceId = await createSource();
    await insertInstitutionBinding({
      institutionId: legacy.institutionId,
      sourceId,
      role: "ADMISSIONS",
    });
    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count from institution_source_bindings
      where institution_id = ${legacy.institutionId}
    `;
    expect(count).toBe(1);
  });

  it("rejects duplicate Institution target/source/role and invalid roles", async () => {
    const institutionId = await createInstitution();
    const sourceId = await createSource();
    await insertInstitutionBinding({
      institutionId,
      sourceId,
      role: "ADMISSIONS",
    });
    await expect(
      insertInstitutionBinding({ institutionId, sourceId, role: "ADMISSIONS" }),
    ).rejects.toMatchObject({ code: "23505" });
    await expect(
      insertInstitutionBinding({
        institutionId,
        sourceId,
        role: "ELIGIBILITY",
      }),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("allows one Source to bind multiple Institutions", async () => {
    const first = await createInstitution();
    const second = await createInstitution();
    const sourceId = await createSource();
    await insertInstitutionBinding({ institutionId: first, sourceId });
    await insertInstitutionBinding({ institutionId: second, sourceId });
    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count from institution_source_bindings
      where source_id = ${sourceId}
    `;
    expect(count).toBe(2);
  });

  it("enforces Institution and Source foreign keys", async () => {
    const institutionId = await createInstitution();
    const sourceId = await createSource();
    await expect(
      insertInstitutionBinding({ institutionId: randomUUID(), sourceId }),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      insertInstitutionBinding({ institutionId, sourceId: randomUUID() }),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("enforces Institution binding lifecycle consistency", async () => {
    const institutionId = await createInstitution();
    const sourceId = await createSource();
    await expect(
      insertInstitutionBinding({
        institutionId,
        sourceId,
        isActive: true,
        unboundAt: new Date("2026-08-24T00:00:00Z"),
      }),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      insertInstitutionBinding({
        institutionId,
        sourceId,
        isActive: false,
        unboundAt: null,
      }),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("allows at most one active primary OFFICIAL_MAIN per Institution", async () => {
    const institutionId = await createInstitution();
    await insertInstitutionBinding({
      institutionId,
      sourceId: await createSource(),
      isPrimary: true,
    });
    await expect(
      insertInstitutionBinding({
        institutionId,
        sourceId: await createSource(),
        isPrimary: true,
      }),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("allows one winner for concurrent identical Institution bindings", async () => {
    const institutionId = await createInstitution();
    const sourceId = await createSource();
    const first = postgres(databaseUrl, { max: 1 });
    const second = postgres(databaseUrl, { max: 1 });
    const insert = (client: typeof first) => client`
      insert into institution_source_bindings (
        institution_id, source_id, role, is_primary, is_active, bound_at
      ) values (
        ${institutionId}, ${sourceId}, 'ADMISSIONS', false, true,
        '2026-08-23T00:00:00Z'
      )
    `;
    try {
      const outcomes = await Promise.allSettled([
        insert(first),
        insert(second),
      ]);
      expect(
        outcomes.filter((outcome) => outcome.status === "fulfilled"),
      ).toHaveLength(1);
      const [rejected] = outcomes.filter(
        (outcome) => outcome.status === "rejected",
      );
      expect(rejected).toMatchObject({ reason: { code: "23505" } });
    } finally {
      await first.end({ timeout: 5 });
      await second.end({ timeout: 5 });
    }
  });

  it("RESTRICTS deleting a Source or Institution with canonical provenance", async () => {
    const institutionId = await createInstitution();
    const sourceId = await createSource();
    await insertInstitutionBinding({ institutionId, sourceId });
    await expect(
      sql`delete from sources where id = ${sourceId}`,
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      sql`delete from institutions where id = ${institutionId}`,
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("binds Sources directly to Native and LEGACY_BACKED Opportunities", async () => {
    const institutionId = await createInstitution();
    const native = await createOpportunity(institutionId);
    const legacy = await createLegacyBackedOpportunity();
    const sourceId = await createSource();
    await insertOpportunityBinding({ opportunityId: native, sourceId });
    await insertOpportunityBinding({
      opportunityId: legacy.opportunityId,
      sourceId,
      role: "SUPPORTING",
    });
    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count from opportunity_source_bindings
      where source_id = ${sourceId}
    `;
    expect(count).toBe(2);
  });

  it("rejects duplicate Opportunity target/source/role and invalid roles", async () => {
    const opportunityId = await createOpportunity(await createInstitution());
    const sourceId = await createSource();
    await insertOpportunityBinding({ opportunityId, sourceId });
    await expect(
      insertOpportunityBinding({ opportunityId, sourceId }),
    ).rejects.toMatchObject({ code: "23505" });
    await expect(
      insertOpportunityBinding({
        opportunityId,
        sourceId,
        role: "NOTICE_BOARD",
      }),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("allows the same Source on Institution and multiple Opportunity targets", async () => {
    const institutionId = await createInstitution();
    const first = await createOpportunity(institutionId);
    const second = await createOpportunity(institutionId);
    const sourceId = await createSource();
    await insertInstitutionBinding({ institutionId, sourceId });
    await insertOpportunityBinding({ opportunityId: first, sourceId });
    await insertOpportunityBinding({ opportunityId: second, sourceId });
    const [row] = await sql<{ institutions: number; opportunities: number }[]>`
      select
        (select count(*)::int from institution_source_bindings where source_id=${sourceId}) as institutions,
        (select count(*)::int from opportunity_source_bindings where source_id=${sourceId}) as opportunities
    `;
    expect(row).toEqual({ institutions: 1, opportunities: 2 });
  });

  it("enforces Opportunity and Source foreign keys", async () => {
    const opportunityId = await createOpportunity(await createInstitution());
    const sourceId = await createSource();
    await expect(
      insertOpportunityBinding({ opportunityId: randomUUID(), sourceId }),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      insertOpportunityBinding({ opportunityId, sourceId: randomUUID() }),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("enforces Opportunity binding lifecycle consistency", async () => {
    const opportunityId = await createOpportunity(await createInstitution());
    const sourceId = await createSource();
    await expect(
      insertOpportunityBinding({
        opportunityId,
        sourceId,
        isActive: true,
        unboundAt: new Date("2026-08-24T00:00:00Z"),
      }),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      insertOpportunityBinding({
        opportunityId,
        sourceId,
        isActive: false,
        unboundAt: null,
      }),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("allows only one active primary binding per Opportunity role", async () => {
    const opportunityId = await createOpportunity(await createInstitution());
    await insertOpportunityBinding({
      opportunityId,
      sourceId: await createSource(),
      isPrimary: true,
    });
    await expect(
      insertOpportunityBinding({
        opportunityId,
        sourceId: await createSource(),
        isPrimary: true,
      }),
    ).rejects.toMatchObject({ code: "23505" });
    await insertOpportunityBinding({
      opportunityId,
      sourceId: await createSource(),
      role: "DETAILS",
      isPrimary: true,
    });
  });

  it("allows one winner for concurrent identical Opportunity bindings", async () => {
    const opportunityId = await createOpportunity(await createInstitution());
    const sourceId = await createSource();
    const first = postgres(databaseUrl, { max: 1 });
    const second = postgres(databaseUrl, { max: 1 });
    const insert = (client: typeof first) => client`
      insert into opportunity_source_bindings (
        opportunity_id, source_id, role, is_primary, is_active, bound_at
      ) values (
        ${opportunityId}, ${sourceId}, 'DETAILS', false, true,
        '2026-08-23T00:00:00Z'
      )
    `;
    try {
      const outcomes = await Promise.allSettled([
        insert(first),
        insert(second),
      ]);
      expect(
        outcomes.filter((outcome) => outcome.status === "fulfilled"),
      ).toHaveLength(1);
      const [rejected] = outcomes.filter(
        (outcome) => outcome.status === "rejected",
      );
      expect(rejected).toMatchObject({ reason: { code: "23505" } });
    } finally {
      await first.end({ timeout: 5 });
      await second.end({ timeout: 5 });
    }
  });

  it("RESTRICTS deleting an Opportunity with canonical provenance", async () => {
    const opportunityId = await createOpportunity(await createInstitution());
    const sourceId = await createSource();
    await insertOpportunityBinding({ opportunityId, sourceId });
    await expect(
      sql`delete from opportunities where id = ${opportunityId}`,
    ).rejects.toMatchObject({ code: "23503" });
  });
});
