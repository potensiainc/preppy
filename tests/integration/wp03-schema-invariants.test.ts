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
const prefix = "wp-03-";

async function user(status?: "PENDING" | "ACTIVE" | "SUSPENDED" | "DELETED") {
  const id = randomUUID();
  if (status) await sql`insert into users(id,status) values (${id},${status})`;
  else await sql`insert into users(id) values (${id})`;
  return id;
}

async function institution() {
  const id = randomUUID();
  await sql`insert into institutions(id,slug,display_name,category)
    values (${id},${`${prefix}institution-${id}`},'WP-03 Institution','ENGLISH_KINDERGARTEN')`;
  return id;
}

async function activeFollow(userId: string, institutionId: string) {
  const id = randomUUID();
  const activatedAt = new Date("2026-08-22T00:00:00.000Z");
  await sql`insert into follows(id,user_id,institution_id,status,first_activated_at,current_activated_at)
    values (${id},${userId},${institutionId},'ACTIVE',${activatedAt},${activatedAt})`;
  return id;
}

async function clearWp03Fixtures() {
  await sql`truncate table notification_delivery_attempts, notification_deliveries,
    notifications, follow_episodes, follows, notification_preferences,
    consent_decisions, user_interest_categories, user_interest_regions,
    user_profiles, user_emails, auth_identities, users`;
  await sql`delete from institutions where slug like ${`${prefix}%`}`;
  await sql`delete from subscribers where email_normalized like ${`${prefix}%`}`;
}

describe("WP-03 canonical identity and Follow persistence invariants", () => {
  beforeAll(async () => {
    await schemaLockSql`select pg_advisory_lock(hashtext('admissionradar-schema-tests'))`;
    await migrateDatabase(databaseUrl);
  });

  afterEach(clearWp03Fixtures);

  afterAll(async () => {
    await schemaLockSql`select pg_advisory_unlock(hashtext('admissionradar-schema-tests'))`;
    await schemaLockSql.end({ timeout: 5 });
    await sql.end({ timeout: 5 });
  });

  it("creates independent PENDING Users without email or profile and permits ACTIVE without email", async () => {
    const [{ id: first, status: firstStatus }] = await sql<
      { id: string; status: string }[]
    >`insert into users default values returning id,status`;
    const [{ id: second }] = await sql<{ id: string }[]>`
      insert into users default values returning id
    `;
    const active = await user("ACTIVE");
    const rows = await sql<{ id: string; status: string }[]>`
      select id,status from users where id in (${first},${second},${active}) order by id
    `;
    expect(new Set(rows.map((row) => row.id))).toEqual(
      new Set([first, second, active]),
    );
    expect(firstStatus).toBe("PENDING");
    expect(rows.find((row) => row.id === first)?.status).toBe("PENDING");
    expect(rows.find((row) => row.id === active)?.status).toBe("ACTIVE");
    await expect(
      sql`insert into users(id,status) values (${randomUUID()},'INVALID')`,
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("enforces Kakao identity ownership, validation, uniqueness, and foreign keys", async () => {
    const userId = await user();
    await sql`insert into auth_identities(id,user_id,provider,provider_subject)
      values (${randomUUID()},${userId},'KAKAO','subject-a')`;
    await expect(sql`insert into auth_identities(id,user_id,provider,provider_subject)
      values (${randomUUID()},${userId},'KAKAO','subject-a')`).rejects.toMatchObject(
      { code: "23505" },
    );
    await expect(sql`insert into auth_identities(id,user_id,provider,provider_subject)
      values (${randomUUID()},${userId},'GOOGLE','subject-b')`).rejects.toMatchObject(
      { code: "23514" },
    );
    await expect(sql`insert into auth_identities(id,user_id,provider,provider_subject)
      values (${randomUUID()},${userId},'KAKAO',' ')`).rejects.toMatchObject({
      code: "23514",
    });
    await expect(sql`insert into auth_identities(id,user_id,provider,provider_subject)
      values (${randomUUID()},${randomUUID()},'KAKAO','subject-c')`).rejects.toMatchObject(
      { code: "23503" },
    );
  });

  it("uses the unique identity index as a deterministic two-client concurrency guard", async () => {
    const userId = await user();
    const a = postgres(databaseUrl, { max: 1 });
    const b = postgres(databaseUrl, { max: 1 });
    try {
      await a`begin`;
      await b`begin`;
      await a`insert into auth_identities(id,user_id,provider,provider_subject)
        values (${randomUUID()},${userId},'KAKAO','concurrent-subject')`;
      const blocked =
        b`insert into auth_identities(id,user_id,provider,provider_subject)
        values (${randomUUID()},${userId},'KAKAO','concurrent-subject')`.catch(
          (error: unknown) => error,
        );
      await a`commit`;
      expect(await blocked).toMatchObject({ code: "23505" });
      await b`rollback`;
    } finally {
      await a.end({ timeout: 5 });
      await b.end({ timeout: 5 });
    }
  });

  it("permits the same normalized email on separate Users while enforcing one email per User and email states", async () => {
    const first = await user();
    const second = await user();
    const normalized = `${prefix}same@example.test`;
    await sql`insert into user_emails(id,user_id,email,email_normalized,source,verification_state,delivery_state)
      values (${randomUUID()},${first},'Same@example.test',${normalized},'KAKAO','UNVERIFIED','USABLE')`;
    await sql`insert into user_emails(id,user_id,email,email_normalized,source,verification_state,delivery_state)
      values (${randomUUID()},${second},'same@example.test',${normalized},'USER_INPUT','VERIFIED','USABLE')`;
    await expect(sql`insert into user_emails(id,user_id,email,email_normalized,source,verification_state,delivery_state)
      values (${randomUUID()},${first},'other@example.test','other@example.test','USER_INPUT','VERIFIED','USABLE')`).rejects.toMatchObject(
      { code: "23505" },
    );
    await expect(sql`insert into user_emails(id,user_id,email,email_normalized,source,verification_state,delivery_state)
      values (${randomUUID()},${await user()},'bad@example.test','bad@example.test','IMPORT','VERIFIED','USABLE')`).rejects.toMatchObject(
      { code: "23514" },
    );
    await expect(sql`insert into user_emails(id,user_id,email,email_normalized,source,verification_state,delivery_state)
      values (${randomUUID()},${await user()},'bad2@example.test','bad2@example.test','KAKAO','PENDING','USABLE')`).rejects.toMatchObject(
      { code: "23514" },
    );
    await expect(sql`insert into user_emails(id,user_id,email,email_normalized,source,verification_state,delivery_state)
      values (${randomUUID()},${await user()},'bad3@example.test','bad3@example.test','KAKAO','VERIFIED','PENDING')`).rejects.toMatchObject(
      { code: "23514" },
    );
  });

  it("keeps profiles optional and validates broad profile and interest constraints", async () => {
    const userId = await user();
    await sql`insert into user_profiles(user_id,child_birth_year) values (${userId},1900)`;
    await sql`update user_profiles set child_birth_year=2100 where user_id=${userId}`;
    await expect(
      sql`update user_profiles set child_birth_year=1899 where user_id=${userId}`,
    ).rejects.toMatchObject({ code: "23514" });
    await sql`insert into user_interest_regions(user_id,region_code) values (${userId},'SEOUL')`;
    await expect(
      sql`insert into user_interest_regions(user_id,region_code) values (${userId},'SEOUL')`,
    ).rejects.toMatchObject({ code: "23505" });
    await expect(
      sql`insert into user_interest_regions(user_id,region_code) values (${userId},' ')`,
    ).rejects.toMatchObject({ code: "23514" });
    await sql`insert into user_interest_categories(user_id,category) values (${userId},'ENGLISH_KINDERGARTEN')`;
    await expect(
      sql`insert into user_interest_categories(user_id,category) values (${userId},'ENGLISH_KINDERGARTEN')`,
    ).rejects.toMatchObject({ code: "23505" });
    await expect(
      sql`insert into user_interest_categories(user_id,category) values (${userId},'OTHER')`,
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("keeps consent decisions append-only and selects the deterministic latest decision", async () => {
    const userId = await user();
    const decidedAt = new Date("2026-08-22T00:00:00.000Z");
    const first = "00000000-0000-0000-0000-000000000001";
    const latest = "00000000-0000-0000-0000-000000000002";
    await sql`insert into consent_decisions(id,user_id,consent_type,policy_version,decision,decided_at)
      values (${first},${userId},'SERVICE_EMAIL_UPDATES','v1','GRANTED',${decidedAt}),
      (${latest},${userId},'SERVICE_EMAIL_UPDATES','v2','REVOKED',${decidedAt})`;
    const [row] = await sql<{ id: string; decision: string }[]>`
      select id,decision from consent_decisions where user_id=${userId}
        and consent_type='SERVICE_EMAIL_UPDATES' order by decided_at desc,id desc limit 1
    `;
    expect(row).toEqual({ id: latest, decision: "REVOKED" });
    await expect(sql`insert into consent_decisions(id,user_id,consent_type,policy_version,decision,decided_at)
      values (${randomUUID()},${userId},'MARKETING','v1','GRANTED',now())`).rejects.toMatchObject(
      { code: "23514" },
    );
    await expect(sql`insert into consent_decisions(id,user_id,consent_type,policy_version,decision,decided_at)
      values (${randomUUID()},${userId},'TERMS_OF_SERVICE',' ','YES',now())`).rejects.toMatchObject(
      { code: "23514" },
    );
    await expect(sql`insert into consent_decisions(id,user_id,consent_type,policy_version,decision,decided_at)
      values (${randomUUID()},${userId},'TERMS_OF_SERVICE','v1','YES',now())`).rejects.toMatchObject(
      { code: "23514" },
    );
    await expect(
      sql`update consent_decisions set decision='GRANTED' where id=${first}`,
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      sql`delete from consent_decisions where id=${first}`,
    ).rejects.toMatchObject({ code: "23514" });
    const [{ count }] = await sql<
      { count: number }[]
    >`select count(*)::int as count from consent_decisions where id=${first}`;
    expect(count).toBe(1);
  });

  it("stores an independent EMAIL preference that neither needs consent nor follows its follow state", async () => {
    const userId = await user();
    const followId = await activeFollow(userId, await institution());
    await sql`insert into notification_preferences(user_id,channel,state) values (${userId},'EMAIL','DISABLED')`;
    await expect(
      sql`insert into notification_preferences(user_id,channel,state) values (${userId},'EMAIL','ENABLED')`,
    ).rejects.toMatchObject({ code: "23505" });
    await expect(
      sql`insert into notification_preferences(user_id,channel,state) values (${await user()},'SMS','ENABLED')`,
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      sql`insert into notification_preferences(user_id,channel,state) values (${await user()},'EMAIL','PAUSED')`,
    ).rejects.toMatchObject({ code: "23514" });
    const [{ status, state }] = await sql<{ status: string; state: string }[]>`
      select follow.status,preference.state from follows as follow
      join notification_preferences as preference on preference.user_id=follow.user_id where follow.id=${followId}
    `;
    expect({ status, state }).toEqual({ status: "ACTIVE", state: "DISABLED" });
  });

  it("enforces Institution-only active Follows, pair uniqueness, fan-in/fan-out, foreign keys and state timing", async () => {
    const firstUser = await user();
    const secondUser = await user();
    const firstInstitution = await institution();
    const secondInstitution = await institution();
    const [{ legacyLinks }] = await sql<{ legacyLinks: number }[]>`
      select count(*)::int as "legacyLinks" from institution_school_links where institution_id=${firstInstitution}
    `;
    expect(legacyLinks).toBe(0);
    await activeFollow(firstUser, firstInstitution);
    await activeFollow(firstUser, secondInstitution);
    await activeFollow(secondUser, firstInstitution);
    await expect(
      activeFollow(firstUser, firstInstitution),
    ).rejects.toMatchObject({ code: "23505" });
    await expect(sql`insert into follows(id,user_id,institution_id,status,first_activated_at,current_activated_at)
      values (${randomUUID()},${randomUUID()},${firstInstitution},'ACTIVE',now(),now())`).rejects.toMatchObject(
      { code: "23503" },
    );
    await expect(sql`insert into follows(id,user_id,institution_id,status,first_activated_at,current_activated_at)
      values (${randomUUID()},${firstUser},${randomUUID()},'ACTIVE',now(),now())`).rejects.toMatchObject(
      { code: "23503" },
    );
    await expect(sql`insert into follows(id,user_id,institution_id,status,first_activated_at,current_activated_at)
      values (${randomUUID()},${secondUser},${secondInstitution},'UNKNOWN',now(),now())`).rejects.toMatchObject(
      { code: "23514" },
    );
    await expect(sql`insert into follows(id,user_id,institution_id,status,first_activated_at,current_activated_at,deactivated_at)
      values (${randomUUID()},${secondUser},${secondInstitution},'ACTIVE',now(),now(),now())`).rejects.toMatchObject(
      { code: "23514" },
    );
    await expect(sql`insert into follows(id,user_id,institution_id,status,first_activated_at,current_activated_at,deactivated_at)
      values (${randomUUID()},${secondUser},${secondInstitution},'INACTIVE','2026-08-22T00:00:00Z','2026-08-22T00:00:00Z','2026-08-21T00:00:00Z')`).rejects.toMatchObject(
      { code: "23514" },
    );
  });

  it("uses the unique Follow pair index as a deterministic two-client concurrency guard", async () => {
    const userId = await user();
    const institutionId = await institution();
    const a = postgres(databaseUrl, { max: 1 });
    const b = postgres(databaseUrl, { max: 1 });
    try {
      await a`begin`;
      await b`begin`;
      await a`insert into follows(id,user_id,institution_id,status,first_activated_at,current_activated_at)
        values (${randomUUID()},${userId},${institutionId},'ACTIVE',now(),now())`;
      const blocked =
        b`insert into follows(id,user_id,institution_id,status,first_activated_at,current_activated_at)
        values (${randomUUID()},${userId},${institutionId},'ACTIVE',now(),now())`.catch(
          (error: unknown) => error,
        );
      await a`commit`;
      expect(await blocked).toMatchObject({ code: "23505" });
      await b`rollback`;
    } finally {
      await a.end({ timeout: 5 });
      await b.end({ timeout: 5 });
    }
  });

  it("preserves Follow episode intervals, closed/reopened history, and independent open episodes", async () => {
    const userId = await user();
    const firstFollow = await activeFollow(userId, await institution());
    const secondFollow = await activeFollow(userId, await institution());
    const start = new Date("2026-08-20T00:00:00.000Z");
    const close = new Date("2026-08-21T00:00:00.000Z");
    await sql`insert into follow_episodes(id,follow_id,activated_at,deactivated_at) values (${randomUUID()},${firstFollow},${start},${close})`;
    await sql`insert into follow_episodes(id,follow_id,activated_at) values (${randomUUID()},${firstFollow},${new Date("2026-08-22T00:00:00.000Z")})`;
    await sql`insert into follow_episodes(id,follow_id,activated_at) values (${randomUUID()},${secondFollow},${start})`;
    await expect(
      sql`insert into follow_episodes(id,follow_id,activated_at) values (${randomUUID()},${firstFollow},${new Date("2026-08-23T00:00:00.000Z")})`,
    ).rejects.toMatchObject({ code: "23505" });
    await expect(
      sql`insert into follow_episodes(id,follow_id,activated_at,deactivated_at) values (${randomUUID()},${secondFollow},${close},${start})`,
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("uses the partial open-episode index as a deterministic two-client concurrency guard", async () => {
    const followId = await activeFollow(await user(), await institution());
    const a = postgres(databaseUrl, { max: 1 });
    const b = postgres(databaseUrl, { max: 1 });
    try {
      await a`begin`;
      await b`begin`;
      await a`insert into follow_episodes(id,follow_id,activated_at) values (${randomUUID()},${followId},now())`;
      const blocked =
        b`insert into follow_episodes(id,follow_id,activated_at) values (${randomUUID()},${followId},now())`.catch(
          (error: unknown) => error,
        );
      await a`commit`;
      expect(await blocked).toMatchObject({ code: "23505" });
      await b`rollback`;
    } finally {
      await a.end({ timeout: 5 });
      await b.end({ timeout: 5 });
    }
  });

  it("queries episodes at signal time with an exclusive deactivation endpoint", async () => {
    const followId = await activeFollow(await user(), await institution());
    await sql`insert into follow_episodes(id,follow_id,activated_at,deactivated_at)
      values (${randomUUID()},${followId},'2026-08-20T00:00:00Z','2026-08-21T00:00:00Z')`;
    const [{ start }] = await sql<{ start: number }[]>`
      select count(*)::int as start from follow_episodes where follow_id=${followId}
        and activated_at <= '2026-08-20T00:00:00Z' and (deactivated_at is null or '2026-08-20T00:00:00Z' < deactivated_at)
    `;
    const [{ before }] = await sql<{ before: number }[]>`
      select count(*)::int as before from follow_episodes where follow_id=${followId}
        and activated_at <= '2026-08-20T12:00:00Z' and (deactivated_at is null or '2026-08-20T12:00:00Z' < deactivated_at)
    `;
    const [{ exact }] = await sql<{ exact: number }[]>`
      select count(*)::int as exact from follow_episodes where follow_id=${followId}
        and activated_at <= '2026-08-21T00:00:00Z' and (deactivated_at is null or '2026-08-21T00:00:00Z' < deactivated_at)
    `;
    expect({ start, before, exact }).toEqual({ start: 1, before: 1, exact: 0 });
  });

  it("supports the explicit PII deletion transaction while retaining opaque User, Consent, Follow and Episode history", async () => {
    const userId = await user("ACTIVE");
    const followId = await activeFollow(userId, await institution());
    await sql`insert into auth_identities(id,user_id,provider,provider_subject) values (${randomUUID()},${userId},'KAKAO','pii-subject')`;
    await sql`insert into user_emails(id,user_id,email,email_normalized,source,verification_state,delivery_state) values (${randomUUID()},${userId},'pii@example.test','pii@example.test','KAKAO','VERIFIED','USABLE')`;
    await sql`insert into user_profiles(user_id) values (${userId})`;
    await sql`insert into user_interest_regions(user_id,region_code) values (${userId},'SEOUL')`;
    await sql`insert into user_interest_categories(user_id,category) values (${userId},'PRIVATE_ELEMENTARY')`;
    await sql`insert into consent_decisions(id,user_id,consent_type,policy_version,decision,decided_at) values (${randomUUID()},${userId},'PRIVACY_POLICY','v1','GRANTED',now())`;
    await sql`insert into notification_preferences(user_id,channel,state) values (${userId},'EMAIL','ENABLED')`;
    await sql`insert into follow_episodes(id,follow_id,activated_at) values (${randomUUID()},${followId},now())`;
    await sql.begin(async (tx) => {
      await tx`update users set status='DELETED',deleted_at=now(),pii_anonymized_at=now() where id=${userId}`;
      await tx`delete from auth_identities where user_id=${userId}`;
      await tx`delete from user_emails where user_id=${userId}`;
      await tx`delete from user_profiles where user_id=${userId}`;
      await tx`delete from user_interest_regions where user_id=${userId}`;
      await tx`delete from user_interest_categories where user_id=${userId}`;
    });
    const [row] = await sql<
      {
        status: string;
        identities: number;
        emails: number;
        profiles: number;
        regions: number;
        categories: number;
        consents: number;
        follows: number;
        episodes: number;
        preferences: number;
      }[]
    >`
      select u.status,
        (select count(*)::int from auth_identities where user_id=u.id) as identities,
        (select count(*)::int from user_emails where user_id=u.id) as emails,
        (select count(*)::int from user_profiles where user_id=u.id) as profiles,
        (select count(*)::int from user_interest_regions where user_id=u.id) as regions,
        (select count(*)::int from user_interest_categories where user_id=u.id) as categories,
        (select count(*)::int from consent_decisions where user_id=u.id) as consents,
        (select count(*)::int from follows where user_id=u.id) as follows,
        (select count(*)::int from follow_episodes where follow_id=${followId}) as episodes,
        (select count(*)::int from notification_preferences where user_id=u.id) as preferences
      from users as u where u.id=${userId}
    `;
    expect(row).toEqual({
      status: "DELETED",
      identities: 0,
      emails: 0,
      profiles: 0,
      regions: 0,
      categories: 0,
      consents: 1,
      follows: 1,
      episodes: 1,
      preferences: 1,
    });
  });

  it("keeps legacy Subscribers isolated from canonical UserEmail and selects only AMP-feasible recipients", async () => {
    const userId = await user("ACTIVE");
    const normalized = `${prefix}legacy-isolated@example.test`;
    await sql`insert into subscribers(id,email,email_normalized,status) values (${randomUUID()},'legacy@example.test',${normalized},'ACTIVE')`;
    await sql`insert into user_emails(id,user_id,email,email_normalized,source,verification_state,delivery_state) values (${randomUUID()},${userId},'canonical@example.test',${normalized},'USER_INPUT','VERIFIED','USABLE')`;
    await activeFollow(userId, await institution());
    await sql`insert into consent_decisions(id,user_id,consent_type,policy_version,decision,decided_at) values (${randomUUID()},${userId},'SERVICE_EMAIL_UPDATES','v1','GRANTED',now())`;
    await sql`insert into notification_preferences(user_id,channel,state) values (${userId},'EMAIL','ENABLED')`;
    const eligible = async () => sql<{ count: number }[]>`
      select count(distinct u.id)::int as count from users as u
      join user_emails as email on email.user_id=u.id and email.verification_state='VERIFIED' and email.delivery_state='USABLE'
      join follows as follow on follow.user_id=u.id and follow.status='ACTIVE'
      join notification_preferences as preference on preference.user_id=u.id and preference.channel='EMAIL' and preference.state='ENABLED'
      join lateral (select decision from consent_decisions where user_id=u.id and consent_type='SERVICE_EMAIL_UPDATES' order by decided_at desc,id desc limit 1) as latest on latest.decision='GRANTED'
      where u.status='ACTIVE'
    `;
    expect((await eligible())[0]?.count).toBe(1);
    await sql`update notification_preferences set state='DISABLED' where user_id=${userId}`;
    expect((await eligible())[0]?.count).toBe(0);
    await sql`update notification_preferences set state='ENABLED' where user_id=${userId}`;
    await sql`insert into consent_decisions(id,user_id,consent_type,policy_version,decision,decided_at) values (${randomUUID()},${userId},'SERVICE_EMAIL_UPDATES','v2','REVOKED',now() + interval '1 second')`;
    expect((await eligible())[0]?.count).toBe(0);
  });
});
