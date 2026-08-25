import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { TestAnalyticsTracker } from "@/src/analytics/tracker";
import { migrateDatabase } from "@/src/db/migrate";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import { createUserSessionCookie } from "@/src/modules/auth/session.server";
import { loadMyPreppy } from "@/src/modules/my-preppy/query.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl)
  throw new Error("TEST_DATABASE_URL must be set for integration tests");
assertDedicatedTestDatabaseUrl(databaseUrl);

const runtime = getRuntimeDatabase({
  DATABASE_URL: databaseUrl,
  DATABASE_MAX_CONNECTIONS: 4,
  NODE_ENV: "test",
});
const schemaLockSql = postgres(databaseUrl, { max: 1 });
const prefix = `wp09-my-preppy-${randomUUID()}`;
const sessionSecret = "wp09-my-preppy-integration-secret-long-enough";
const now = new Date("2026-08-23T12:00:00.000Z");
const tracked = {
  users: new Set<string>(),
  institutions: new Set<string>(),
  opportunities: new Set<string>(),
  sources: new Set<string>(),
};

async function createUser(
  status: "PENDING" | "ACTIVE" | "SUSPENDED" | "DELETED" = "ACTIVE",
) {
  const id = randomUUID();
  tracked.users.add(id);
  await runtime.client`
    insert into users (id, status, activated_at, suspended_at, deleted_at)
    values (
      ${id}, ${status},
      ${status === "ACTIVE" ? "2026-08-01T00:00:00.000Z" : null},
      ${status === "SUSPENDED" ? "2026-08-02T00:00:00.000Z" : null},
      ${status === "DELETED" ? "2026-08-03T00:00:00.000Z" : null}
    )
  `;
  return id;
}

function session(userId: string) {
  return createUserSessionCookie(userId, {
    secret: sessionSecret,
    now,
  }).value;
}

async function createInstitution(
  overrides: {
    name?: string;
    category?: string;
    publicationState?: string;
    operationalState?: string;
  } = {},
) {
  const id = randomUUID();
  tracked.institutions.add(id);
  const slug = `${prefix}-institution-${id}`;
  await runtime.client`
    insert into institutions (
      id, slug, display_name, category, region_code,
      publication_state, operational_state, published_at
    ) values (
      ${id}, ${slug}, ${overrides.name ?? "WP-09 My Preppy Institution"},
      ${overrides.category ?? "INTERNATIONAL_SCHOOL"}, 'SEOUL',
      ${overrides.publicationState ?? "PUBLISHED"},
      ${overrides.operationalState ?? "ACTIVE"},
      ${overrides.publicationState === "HIDDEN" ? null : "2026-08-01T00:00:00.000Z"}
    )
  `;
  return { id, slug };
}

async function createFollow(
  userId: string,
  institutionId: string,
  status: "ACTIVE" | "INACTIVE" = "ACTIVE",
) {
  const id = randomUUID();
  await runtime.client`
    insert into follows (
      id, user_id, institution_id, status, first_activated_at,
      current_activated_at, deactivated_at
    ) values (
      ${id}, ${userId}, ${institutionId}, ${status},
      '2026-08-10T00:00:00.000Z',
      ${status === "ACTIVE" ? "2026-08-10T00:00:00.000Z" : null},
      ${status === "INACTIVE" ? "2026-08-11T00:00:00.000Z" : null}
    )
  `;
  return id;
}

async function createNativeOpportunity(
  institutionId: string,
  state: "OPEN" | "UPCOMING" | "CLOSED",
  options: {
    publishedAt?: string;
    verifiedAt?: string;
  } = {},
) {
  const id = randomUUID();
  const versionId = randomUUID();
  const sourceId = randomUUID();
  tracked.opportunities.add(id);
  tracked.sources.add(sourceId);
  const slug = `${prefix}-opportunity-${state.toLowerCase()}-${id}`;
  await runtime.client.begin(async (transaction) => {
    await transaction`
      insert into sources (
        id, canonical_url, source_type, authority_level, lifecycle_status, source_name
      ) values (
        ${sourceId}, ${`https://official.example.test/${prefix}/${id}`},
        'OFFICIAL_ADMISSION_PAGE', 'PRIMARY', 'ACTIVE', 'WP-09 official source'
      )
    `;
    await transaction`
      insert into source_monitor_configs (
        source_id, collection_strategy, monitoring_profile, is_enabled
      ) values (${sourceId}, 'HTTP', 'STANDARD_SEASONAL', true)
    `;
    await transaction`
      insert into opportunities (
        id, institution_id, slug, kind, truth_mode, publication_state, published_at
      ) values (
        ${id}, ${institutionId}, ${slug}, 'APPLICATION', 'NATIVE',
        'PUBLISHED', ${options.publishedAt ?? "2026-08-01T00:00:00.000Z"}
      )
    `;
    await transaction`
      insert into opportunity_versions (
        id, opportunity_id, truth_mode, version_number, verification_state,
        business_state, is_current, title, summary, application_close_at, verified_at
      ) values (
        ${versionId}, ${id}, 'NATIVE', 1, 'VERIFIED', ${state}, true,
        ${`Native ${state} 영유 모집`}, ${`${state} summary`},
        ${state === "UPCOMING" ? "2026-10-01T00:00:00.000Z" : "2026-09-01T00:00:00.000Z"},
        ${options.verifiedAt ?? "2026-08-22T00:00:00.000Z"}
      )
    `;
    await transaction`
      insert into opportunity_version_evidence (
        opportunity_version_id, source_id, evidence_role
      ) values (${versionId}, ${sourceId}, 'PRIMARY')
    `;
  });
  return { id, slug, versionId };
}

async function createChange(
  opportunity: { id: string; versionId: string },
  options: { publishedAt?: string; summary?: string } = {},
) {
  const publishedAt = options.publishedAt ?? "2026-08-22T01:00:00.000Z";
  await runtime.client`
    insert into opportunity_changes (
      id, opportunity_id, truth_mode, change_type, materiality,
      to_native_version_id, summary, verified_at, published_at, dedupe_key
    ) values (
      ${randomUUID()}, ${opportunity.id}, 'NATIVE', 'NEW_OPPORTUNITY',
      'NOTIFIABLE', ${opportunity.versionId}, ${options.summary ?? "영유 접수 마감일 변경"},
      ${publishedAt}, ${publishedAt},
      ${`${prefix}-change-${opportunity.id}`}
    )
  `;
}

async function setEmail(
  userId: string,
  deliveryState: "USABLE" | "SUPPRESSED" | "BOUNCED" | "REMOVED",
  removed = false,
) {
  await runtime.client`
    insert into user_emails (
      user_id, email, email_normalized, source, verification_state,
      delivery_state, removed_at
    ) values (
      ${userId}, ${`${userId}@example.test`}, ${`${userId}@example.test`},
      'USER_INPUT', 'VERIFIED', ${deliveryState},
      ${removed ? "2026-08-20T00:00:00.000Z" : null}
    )
  `;
}

async function addConsent(
  userId: string,
  decision: "GRANTED" | "REVOKED",
  decidedAt: string,
  id = randomUUID(),
) {
  await runtime.client`
    insert into consent_decisions (
      id, user_id, consent_type, policy_version, decision, source, decided_at
    ) values (
      ${id}, ${userId}, 'SERVICE_EMAIL_UPDATES', '2026-08-23',
      ${decision}, 'ONBOARDING', ${decidedAt}
    )
  `;
}

async function setPreference(userId: string, state: "ENABLED" | "DISABLED") {
  await runtime.client`
    insert into notification_preferences (user_id, channel, state)
    values (${userId}, 'EMAIL', ${state})
  `;
}

async function load(userId: string, tracker = new TestAnalyticsTracker()) {
  return loadMyPreppy(session(userId), {
    sessionSecret,
    now,
    transactionManager: runtime.transactionManager,
    tracker,
  });
}

async function clearFixtures() {
  const users = [...tracked.users];
  const institutions = [...tracked.institutions];
  const opportunities = [...tracked.opportunities];
  const sources = [...tracked.sources];
  await runtime.client.begin(async (transaction) => {
    await transaction.unsafe("set local session_replication_role = replica");
    if (opportunities.length > 0) {
      await transaction`delete from opportunity_changes where opportunity_id in ${transaction(opportunities)}`;
      await transaction`delete from opportunity_version_evidence where opportunity_version_id in (select id from opportunity_versions where opportunity_id in ${transaction(opportunities)})`;
      await transaction`delete from opportunity_versions where opportunity_id in ${transaction(opportunities)}`;
      await transaction`delete from opportunities where id in ${transaction(opportunities)}`;
    }
    if (users.length > 0) {
      await transaction`delete from follow_episodes where follow_id in (select id from follows where user_id in ${transaction(users)})`;
      await transaction`delete from follows where user_id in ${transaction(users)}`;
      await transaction`delete from notification_preferences where user_id in ${transaction(users)}`;
      await transaction`delete from consent_decisions where user_id in ${transaction(users)}`;
      await transaction`delete from user_emails where user_id in ${transaction(users)}`;
      await transaction`delete from users where id in ${transaction(users)}`;
    }
    if (institutions.length > 0) {
      await transaction`delete from institutions where id in ${transaction(institutions)}`;
    }
    if (sources.length > 0) {
      await transaction`
        delete from source_monitor_configs
        where source_id in ${transaction(sources)}
      `;
      await transaction`delete from sources where id in ${transaction(sources)}`;
    }
  });
  tracked.users.clear();
  tracked.institutions.clear();
  tracked.opportunities.clear();
  tracked.sources.clear();
}

beforeAll(async () => {
  await schemaLockSql`select pg_advisory_lock(90009009)`;
  try {
    await migrateDatabase(databaseUrl);
  } finally {
    await schemaLockSql`select pg_advisory_unlock(90009009)`;
  }
});

afterEach(clearFixtures);

afterAll(async () => {
  await clearFixtures();
  await schemaLockSql.end({ timeout: 5 });
  await closeRuntimeDatabase();
});

describe("WP-09 My Preppy database projection", () => {
  it("returns only active, published, non-closed follows with native 영유 current/upcoming truth", async () => {
    const userId = await createUser();
    const native = await createInstitution({
      name: "데이터베이스 네이티브 영유",
      category: "ENGLISH_KINDERGARTEN",
    });
    const inactive = await createInstitution({ name: "해제 기관" });
    const hidden = await createInstitution({
      name: "비공개 기관",
      publicationState: "HIDDEN",
    });
    const closed = await createInstitution({
      name: "폐원 기관",
      operationalState: "CLOSED",
    });
    await createFollow(userId, native.id);
    await createFollow(userId, inactive.id, "INACTIVE");
    await createFollow(userId, hidden.id);
    await createFollow(userId, closed.id);
    const open = await createNativeOpportunity(native.id, "OPEN");
    const upcoming = await createNativeOpportunity(native.id, "UPCOMING");
    await createNativeOpportunity(native.id, "CLOSED");
    await createChange(open);

    const result = await load(userId);
    expect(result.access).toBe("ACTIVE");
    if (result.access !== "ACTIVE") throw new Error("expected ACTIVE");
    expect(result.data.cards).toHaveLength(1);
    expect(result.data.cards[0]).toMatchObject({
      institution: {
        id: native.id,
        name: "데이터베이스 네이티브 영유",
        category: "ENGLISH_KINDERGARTEN",
      },
      currentAdmissionsState: "OPEN",
      currentOpportunities: [{ id: open.id, state: "OPEN" }],
      upcomingOpportunities: [{ id: upcoming.id, state: "UPCOMING" }],
      recentChanges: [{ summary: "영유 접수 마감일 변경" }],
      lastVerifiedAt: "2026-08-22T00:00:00.000Z",
    });
    expect(JSON.stringify(result)).not.toMatch(
      /legacy|admissionEventId|admissionCycleId|schoolId/i,
    );
  });

  it("returns the canonical empty snapshot for an ACTIVE user with no active Follow", async () => {
    const userId = await createUser();
    const result = await load(userId);
    expect(result).toMatchObject({
      access: "ACTIVE",
      data: {
        cards: [],
        readiness: { ready: false, label: "이메일 미등록" },
      },
    });
  });

  it("orders latest consent by decided_at then id and projects readiness from all three stores", async () => {
    const userId = await createUser();
    const institution = await createInstitution();
    await createFollow(userId, institution.id);
    await setEmail(userId, "USABLE");
    await setPreference(userId, "ENABLED");
    await addConsent(
      userId,
      "GRANTED",
      "2026-08-20T00:00:00.000Z",
      "00000000-0000-4000-8000-000000000001",
    );
    await addConsent(
      userId,
      "REVOKED",
      "2026-08-20T00:00:00.000Z",
      "ffffffff-ffff-4fff-bfff-ffffffffffff",
    );
    let result = await load(userId);
    expect(result).toMatchObject({
      access: "ACTIVE",
      data: {
        readiness: {
          ready: false,
          label: "서비스 이메일 동의 필요",
        },
      },
    });

    await addConsent(userId, "GRANTED", "2026-08-21T00:00:00.000Z");
    result = await load(userId);
    expect(result).toMatchObject({
      access: "ACTIVE",
      data: {
        readiness: {
          ready: true,
          label: "이메일 업데이트 준비됨",
          analyticsState: "ENABLED",
        },
      },
    });
  });

  it.each([
    ["missing email", null, "GRANTED", "ENABLED", "이메일 미등록"],
    [
      "suppressed email",
      "SUPPRESSED",
      "GRANTED",
      "ENABLED",
      "이메일 사용 불가",
    ],
    [
      "revoked consent",
      "USABLE",
      "REVOKED",
      "ENABLED",
      "서비스 이메일 동의 필요",
    ],
    ["missing consent", "USABLE", null, "ENABLED", "서비스 이메일 동의 필요"],
    [
      "disabled preference",
      "USABLE",
      "GRANTED",
      "DISABLED",
      "이메일 업데이트 꺼짐",
    ],
    ["missing preference", "USABLE", "GRANTED", null, "이메일 업데이트 꺼짐"],
  ] as const)(
    "projects %s truthfully",
    async (_label, delivery, consent, preference, expected) => {
      const userId = await createUser();
      const institution = await createInstitution();
      await createFollow(userId, institution.id);
      if (delivery) await setEmail(userId, delivery);
      if (consent)
        await addConsent(userId, consent, "2026-08-20T00:00:00.000Z");
      if (preference) await setPreference(userId, preference);

      const result = await load(userId);
      expect(result).toMatchObject({
        access: "ACTIVE",
        data: { readiness: { ready: false, label: expected } },
      });
    },
  );

  it("returns client analytics inputs without a server duplicate or product side effects", async () => {
    const userId = await createUser();
    const institution = await createInstitution();
    await createFollow(userId, institution.id);
    const tracker = new TestAnalyticsTracker();
    const [before] = await runtime.client<
      {
        notifications: number;
        deliveries: number;
        outbox: number;
        alerts: number;
        subscribers: number;
        subscriptions: number;
      }[]
    >`
      select
        (select count(*)::int from notifications) notifications,
        (select count(*)::int from notification_deliveries) deliveries,
        (select count(*)::int from outbox_events) outbox,
        (select count(*)::int from alerts) alerts,
        (select count(*)::int from subscribers) subscribers,
        (select count(*)::int from subscriptions) subscriptions
    `;
    const result = await load(userId, tracker);
    const [after] = await runtime.client<
      {
        notifications: number;
        deliveries: number;
        outbox: number;
        alerts: number;
        subscribers: number;
        subscriptions: number;
      }[]
    >`
      select
        (select count(*)::int from notifications) notifications,
        (select count(*)::int from notification_deliveries) deliveries,
        (select count(*)::int from outbox_events) outbox,
        (select count(*)::int from alerts) alerts,
        (select count(*)::int from subscribers) subscribers,
        (select count(*)::int from subscriptions) subscriptions
    `;
    expect(after).toEqual(before);
    expect(result).toMatchObject({
      access: "ACTIVE",
      data: {
        activeFollowCount: 1,
        readiness: { analyticsState: "UNAVAILABLE" },
      },
    });
    expect(tracker.snapshot()).toEqual([]);
  });

  it("applies canonical current/upcoming and recent-change bounds fairly per followed Institution", async () => {
    const userId = await createUser();
    const noisy = await createInstitution({ name: "노이즈 기관" });
    const quiet = await createInstitution({
      name: "오래됐지만 유효한 영유",
      category: "ENGLISH_KINDERGARTEN",
    });
    await createFollow(userId, noisy.id);
    await createFollow(userId, quiet.id);

    for (let index = 0; index < 51; index += 1) {
      const closed = await createNativeOpportunity(noisy.id, "CLOSED", {
        publishedAt: `2026-08-22T${String(index % 23).padStart(2, "0")}:00:00.000Z`,
        verifiedAt: "2026-08-22T00:00:00.000Z",
      });
      await createChange(closed, {
        publishedAt: `2026-08-22T${String(index % 23).padStart(2, "0")}:30:00.000Z`,
        summary: `노이즈 변경 ${index}`,
      });
    }
    const valid = await createNativeOpportunity(quiet.id, "OPEN", {
      publishedAt: "2026-08-01T00:00:00.000Z",
      verifiedAt: "2026-08-01T00:00:00.000Z",
    });
    await createChange(valid, {
      publishedAt: "2026-08-01T01:00:00.000Z",
      summary: "조용한 기관의 유효한 최근 변경",
    });

    const result = await load(userId);
    expect(result.access).toBe("ACTIVE");
    if (result.access !== "ACTIVE") throw new Error("expected ACTIVE");
    const quietCard = result.data.cards.find(
      (card) => card.institution.id === quiet.id,
    );
    expect(quietCard).toMatchObject({
      currentAdmissionsState: "OPEN",
      currentOpportunities: [{ id: valid.id, state: "OPEN" }],
      recentChanges: [{ summary: "조용한 기관의 유효한 최근 변경" }],
    });
  });

  it("returns the full eligible Follow count beyond the 24-card snapshot bound", async () => {
    const userId = await createUser();
    for (let index = 0; index < 26; index += 1) {
      const institution = await createInstitution({
        name: `전체 수 기관 ${index}`,
      });
      await createFollow(userId, institution.id);
    }
    const tracker = new TestAnalyticsTracker();
    const result = await load(userId, tracker);
    expect(result.access).toBe("ACTIVE");
    if (result.access !== "ACTIVE") throw new Error("expected ACTIVE");
    expect(result.data.cards).toHaveLength(24);
    expect(result.data.activeFollowCount).toBe(26);
    expect(tracker.snapshot()).toEqual([]);
  });
});
