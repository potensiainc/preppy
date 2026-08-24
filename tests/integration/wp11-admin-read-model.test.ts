import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import postgres from "postgres";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { migrateDatabase } from "@/src/db/migrate";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
  type DatabaseExecutor,
} from "@/src/infrastructure/db/runtime.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL must be set");
assertDedicatedTestDatabaseUrl(databaseUrl);

const prefix = `wp11-read-${randomUUID()}`;
const runtime = getRuntimeDatabase({
  DATABASE_URL: databaseUrl,
  DATABASE_MAX_CONNECTIONS: 4,
  NODE_ENV: "test",
});
const schemaLockSql = postgres(databaseUrl, { max: 1 });
const institutionIds = new Set<string>();
const opportunityIds = new Set<string>();
const sourceIds = new Set<string>();
const articleIds = new Set<string>();
const notificationIds = new Set<string>();
const userIds = new Set<string>();
const outboxIds = new Set<string>();

async function importInstitutionQuery() {
  try {
    return await vi.importActual<
      typeof import("@/src/modules/admin/read-model/institution-query.server")
    >("@/src/modules/admin/read-model/institution-query.server");
  } catch {
    return null;
  }
}

async function importOpportunityQuery() {
  try {
    return await vi.importActual<
      typeof import("@/src/modules/admin/read-model/opportunity-query.server")
    >("@/src/modules/admin/read-model/opportunity-query.server");
  } catch {
    return null;
  }
}

async function importSourceQuery() {
  try {
    return await vi.importActual<
      typeof import("@/src/modules/admin/read-model/source-query.server")
    >("@/src/modules/admin/read-model/source-query.server");
  } catch {
    return null;
  }
}

async function importArticleQuery() {
  try {
    return await vi.importActual<
      typeof import("@/src/modules/admin/read-model/article-query.server")
    >("@/src/modules/admin/read-model/article-query.server");
  } catch {
    return null;
  }
}

async function importNotificationQuery() {
  try {
    return await vi.importActual<
      typeof import("@/src/modules/admin/read-model/notification-query.server")
    >("@/src/modules/admin/read-model/notification-query.server");
  } catch {
    return null;
  }
}

async function importUserQuery() {
  try {
    return await vi.importActual<
      typeof import("@/src/modules/admin/read-model/user-query.server")
    >("@/src/modules/admin/read-model/user-query.server");
  } catch {
    return null;
  }
}

async function importDashboardQuery() {
  try {
    return await vi.importActual<
      typeof import("@/src/modules/admin/read-model/dashboard-query.server")
    >("@/src/modules/admin/read-model/dashboard-query.server");
  } catch {
    return null;
  }
}

async function importMonitoringCountProjection() {
  const loaded = await vi.importActual<Record<string, unknown>>(
    "@/src/modules/monitoring/queue-query.server",
  );
  return loaded as {
    countMonitoringDueStates?: (
      dependencies: Readonly<{
        executor: typeof runtime.executor;
        now: Date;
      }>,
    ) => Promise<Readonly<{ due: number; overdue: number }>>;
    iterateMonitoringDueStateBatches?: (
      dependencies: Readonly<{
        executor: typeof runtime.executor;
        now: Date;
      }>,
    ) => AsyncIterable<readonly string[]>;
    getMonitoringQueue?: (
      rawFilter: unknown,
      dependencies: Readonly<{
        executor: typeof runtime.executor;
        now: Date;
      }>,
    ) => Promise<
      Array<{
        targetType: string;
        targetId: string;
        source: { id: string };
        dueState: string;
        priority: string;
      }>
    >;
  };
}

async function importMonitoringSupportProjection() {
  const loaded = await vi.importActual<Record<string, unknown>>(
    "@/src/modules/monitoring/repository.server",
  );
  return loaded as {
    listMonitoringRelevantTruth?: (
      executor: typeof runtime.executor,
      input: Readonly<{
        opportunityIds: readonly string[];
        institutionIds: readonly string[];
        now: Date;
      }>,
    ) => Promise<
      Array<{
        targetType: "INSTITUTION" | "OPPORTUNITY";
        targetId: string;
        opportunityId: string;
        institutionId: string;
        businessState: string;
        title: string;
        upcomingAt: Date | null;
      }>
    >;
  };
}

async function projectionPersistenceFingerprint(
  executor: DatabaseExecutor,
): Promise<string> {
  const rows = (await executor.raw(sql`
    select concat_ws('|',
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from institutions item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from institution_source_bindings item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from opportunities item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from opportunity_versions item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from opportunity_admission_event_links item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from admission_events item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from admission_event_versions item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from opportunity_source_bindings item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from opportunity_changes item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from sources item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from source_monitor_configs item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from source_observations item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from source_snapshots item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from articles item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from article_institutions item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from article_opportunities item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from notifications item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from notification_deliveries item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from notification_delivery_attempts item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from users item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from auth_identities item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from user_emails item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from user_profiles item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from notification_preferences item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from consent_decisions item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from follows item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from follow_episodes item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from audit_logs item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from outbox_events item)
    ) as fingerprint
  `)) as unknown as Array<{ fingerprint: string }>;
  return rows[0]!.fingerprint;
}

async function expectReadOnlyProjection<T>(
  executor: DatabaseExecutor,
  operation: () => Promise<T>,
): Promise<T> {
  const before = await projectionPersistenceFingerprint(executor);
  const result = await operation();
  expect(await projectionPersistenceFingerprint(executor)).toBe(before);
  return result;
}

async function inRolledBackTransaction<T>(
  operation: (executor: DatabaseExecutor) => Promise<T>,
): Promise<T> {
  const rollback = new Error("WP-11 test transaction rollback");
  let completed = false;
  let result: T | undefined;
  try {
    await runtime.transactionManager.run(async (executor) => {
      result = await operation(executor);
      completed = true;
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  if (!completed) throw new Error("WP-11 test transaction did not complete");
  return result as T;
}

async function pageContainingArticle(
  articleId: string,
  pageSize: number,
): Promise<number> {
  const rows = await runtime.client<{ preceding: number }[]>`
    select count(*)::int as preceding
    from articles candidate
    inner join articles fixture on fixture.id = ${articleId}
    where candidate.type = 'GUIDE' and candidate.status = 'PUBLISHED'
      and (candidate.updated_at, candidate.id) > (fixture.updated_at, fixture.id)
  `;
  return Math.floor((rows[0]?.preceding ?? 0) / pageSize) + 1;
}

async function pageContainingNotification(
  notificationId: string,
  pageSize: number,
): Promise<number> {
  const rows = await runtime.client<{ preceding: number }[]>`
    select count(*)::int as preceding
    from notifications candidate
    inner join notifications fixture on fixture.id = ${notificationId}
    where candidate.status = 'READY'
      and candidate.signal_type = 'OPPORTUNITY_PUBLISHED'
      and (candidate.signal_published_at, candidate.id) >
        (fixture.signal_published_at, fixture.id)
  `;
  return Math.floor((rows[0]?.preceding ?? 0) / pageSize) + 1;
}

async function pageContainingUser(
  userId: string,
  pageSize: number,
): Promise<number> {
  const rows = await runtime.client<{ preceding: number }[]>`
    select count(*)::int as preceding
    from users candidate
    inner join users fixture on fixture.id = ${userId}
    where candidate.status = 'ACTIVE'
      and (candidate.created_at, candidate.id) >
        (fixture.created_at, fixture.id)
  `;
  return Math.floor((rows[0]?.preceding ?? 0) / pageSize) + 1;
}

async function insertInstitution(
  displayName: string,
  executor: DatabaseExecutor = runtime.executor,
): Promise<string> {
  const id = randomUUID();
  institutionIds.add(id);
  await executor.raw(sql`
    insert into institutions (
      id, slug, display_name, category, operational_state, publication_state,
      created_at, updated_at
    ) values (
      ${id}, ${`${prefix}-${id}`}, ${displayName}, 'INTERNATIONAL_SCHOOL',
      'ACTIVE', 'PUBLISHED', '2099-01-01T00:00:00.000Z',
      '2099-01-01T00:00:00.000Z'
    )
  `);
  return id;
}

async function insertSource(
  institutionId: string,
  executor: DatabaseExecutor = runtime.executor,
): Promise<string> {
  const id = randomUUID();
  sourceIds.add(id);
  await executor.raw(sql`
    insert into sources (
      id, canonical_url, source_type, authority_level, lifecycle_status,
      source_name
    ) values (
      ${id}, ${`https://official.example.test/${prefix}/${id}`},
      'OFFICIAL_SCHOOL_PAGE', 'PRIMARY', 'ACTIVE', ${`${prefix} source`}
    )
  `);
  await executor.raw(sql`
    insert into institution_source_bindings (
      institution_id, source_id, role, is_primary, is_active
    ) values (${institutionId}, ${id}, 'OFFICIAL_MAIN', true, true)
  `);
  return id;
}

async function insertNativeOpportunity(
  institutionId: string,
  ordinal: number,
  executor: DatabaseExecutor = runtime.executor,
): Promise<{ id: string; versionId: string }> {
  const id = randomUUID();
  opportunityIds.add(id);
  const versionId = randomUUID();
  await executor.raw(sql`
    insert into opportunities (
      id, institution_id, slug, kind, truth_mode, publication_state,
      created_at, updated_at, published_at
    ) values (
      ${id}, ${institutionId}, ${`${prefix}-opportunity-${ordinal}-${id}`},
      'APPLICATION', 'NATIVE', 'DRAFT',
      '2099-01-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z',
      '2099-01-01T00:00:00.000Z'
    )
  `);
  await executor.raw(sql`
    insert into opportunity_versions (
      id, opportunity_id, version_number, verification_state, business_state,
      is_current, title, verified_at, created_at
    ) values (
      ${versionId}, ${id}, 1, 'VERIFIED', 'OPEN', true,
      ${`${prefix} opportunity ${ordinal}`}, '2099-01-02T00:00:00.000Z',
      '2099-01-02T00:00:00.000Z'
    )
  `);
  return { id, versionId };
}

async function cleanup(): Promise<void> {
  const opportunities = [...opportunityIds];
  const sources = [...sourceIds];
  const institutions = [...institutionIds];
  const articles = [...articleIds];
  const notifications = [...notificationIds];
  const users = [...userIds];
  const outbox = [...outboxIds];
  await runtime.client.begin(async (transaction) => {
    await transaction.unsafe("set local session_replication_role = replica");
    if (outbox.length > 0) {
      await transaction`delete from outbox_events where id in ${transaction(outbox)}`;
    }
    if (notifications.length > 0) {
      await transaction`delete from notification_delivery_attempts where notification_delivery_id in (select id from notification_deliveries where notification_id in ${transaction(notifications)})`;
      await transaction`delete from notification_deliveries where notification_id in ${transaction(notifications)}`;
      await transaction`delete from notifications where id in ${transaction(notifications)}`;
    }
    if (articles.length > 0) {
      await transaction`delete from article_institutions where article_id in ${transaction(articles)}`;
      await transaction`delete from article_opportunities where article_id in ${transaction(articles)}`;
      await transaction`delete from articles where id in ${transaction(articles)}`;
    }
    if (users.length > 0) {
      await transaction`delete from follow_episodes where follow_id in (select id from follows where user_id in ${transaction(users)})`;
      await transaction`delete from follows where user_id in ${transaction(users)}`;
      await transaction`delete from notification_preferences where user_id in ${transaction(users)}`;
      await transaction`delete from consent_decisions where user_id in ${transaction(users)}`;
      await transaction`delete from user_profiles where user_id in ${transaction(users)}`;
      await transaction`delete from user_emails where user_id in ${transaction(users)}`;
      await transaction`delete from auth_identities where user_id in ${transaction(users)}`;
      await transaction`delete from users where id in ${transaction(users)}`;
    }
    if (opportunities.length > 0) {
      await transaction`delete from opportunity_changes where opportunity_id in ${transaction(opportunities)}`;
      await transaction`delete from opportunity_source_bindings where opportunity_id in ${transaction(opportunities)}`;
      await transaction`delete from opportunity_version_evidence where opportunity_version_id in (select id from opportunity_versions where opportunity_id in ${transaction(opportunities)})`;
      await transaction`delete from opportunity_versions where opportunity_id in ${transaction(opportunities)}`;
      await transaction`delete from opportunities where id in ${transaction(opportunities)}`;
    }
    if (sources.length > 0) {
      await transaction`delete from source_observations where source_id in ${transaction(sources)}`;
      await transaction`delete from source_snapshots where source_id in ${transaction(sources)}`;
      await transaction`delete from source_monitor_configs where source_id in ${transaction(sources)}`;
      await transaction`delete from institution_source_bindings where source_id in ${transaction(sources)}`;
      await transaction`delete from sources where id in ${transaction(sources)}`;
    }
    if (institutions.length > 0) {
      await transaction`delete from institutions where id in ${transaction(institutions)}`;
    }
  });
  opportunityIds.clear();
  sourceIds.clear();
  institutionIds.clear();
  articleIds.clear();
  notificationIds.clear();
  userIds.clear();
  outboxIds.clear();
}

beforeAll(async () => {
  await schemaLockSql`select pg_advisory_lock(hashtext('admissionradar-schema-tests'))`;
  await migrateDatabase(databaseUrl);
});

afterEach(cleanup);

afterAll(async () => {
  await cleanup();
  await schemaLockSql`select pg_advisory_unlock(hashtext('admissionradar-schema-tests'))`;
  await schemaLockSql.end({ timeout: 5 });
  await closeRuntimeDatabase();
});

describe("WP-11 Admin Institution read projection", () => {
  it("returns explicit stable pages with bounded current Opportunity summaries and no writes", async () => {
    // Mutation caught: select-all leakage, unstable tie ordering, unbounded nested rows, or a read writing Audit/Outbox.
    const query = await importInstitutionQuery();
    expect(query).not.toBeNull();
    if (!query) return;

    const displayName = `${prefix} Academy`;
    const ids = [
      await insertInstitution(displayName),
      await insertInstitution(displayName),
    ].sort();
    await insertSource(ids[0]!);
    for (let ordinal = 1; ordinal <= 4; ordinal += 1) {
      await insertNativeOpportunity(ids[0]!, ordinal);
    }
    const [fixtureCount] = await runtime.client<{ count: number }[]>`
      select count(*)::int as count from opportunities
      where institution_id = ${ids[0]!}
    `;
    expect(fixtureCount?.count).toBe(4);
    const [first, second] = await expectReadOnlyProjection(
      runtime.executor,
      () =>
        Promise.all([
          query.listAdminInstitutions(runtime.executor, {
            query: displayName,
            page: 1,
            pageSize: 1,
          }),
          query.listAdminInstitutions(runtime.executor, {
            query: displayName,
            page: 2,
            pageSize: 1,
          }),
        ]),
    );

    expect(first.pagination).toEqual({
      page: 1,
      pageSize: 1,
      total: 2,
      hasNext: true,
    });
    expect(first.items[0]?.id).toBe(ids[0]);
    expect(second.items[0]?.id).toBe(ids[1]);
    expect(Object.keys(first.items[0]!).sort()).toEqual(
      [
        "activeSourceBindingCount",
        "category",
        "displayName",
        "id",
        "operationalState",
        "opportunitySummary",
        "publicationState",
        "slug",
      ].sort(),
    );
    expect(first.items[0]).toMatchObject({
      activeSourceBindingCount: 1,
      opportunitySummary: { total: 4 },
    });
    expect(first.items[0]!.opportunitySummary.items).toHaveLength(3);
    expect(
      first.items[0]!.opportunitySummary.items.map((item) =>
        Object.keys(item).sort(),
      ),
    ).toEqual(
      Array.from({ length: 3 }, () =>
        [
          "businessState",
          "id",
          "kind",
          "publicationState",
          "slug",
          "title",
          "truthMode",
          "verifiedAt",
        ].sort(),
      ),
    );
  });

  it("loads a bounded detail or raises the generic not-found error", async () => {
    // Mutation caught: detail leaks the raw row, silently returns undefined, or truncates below its documented bound.
    const query = await importInstitutionQuery();
    expect(query).not.toBeNull();
    if (!query) return;

    const institutionId = await insertInstitution(`${prefix} Detail`);
    for (let ordinal = 1; ordinal <= 4; ordinal += 1) {
      await insertNativeOpportunity(institutionId, ordinal);
    }
    const detail = await query.getAdminInstitution(runtime.executor, {
      id: institutionId,
    });
    expect(detail.id).toBe(institutionId);
    expect(detail.opportunitySummary).toMatchObject({ total: 4 });
    expect(detail.opportunitySummary.items).toHaveLength(4);

    await expect(
      query.getAdminInstitution(runtime.executor, { id: randomUUID() }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
  });
});

describe("WP-11 Admin Opportunity read projection", () => {
  it("projects current truth, bindings, and only the latest canonical change in stable pages", async () => {
    // Mutation caught: truth mode is client-invented, a stale change wins, binding rows multiply roots, or ordering loses its ID tie-break.
    const query = await importOpportunityQuery();
    expect(query).not.toBeNull();
    if (!query) return;

    const institutionId = await insertInstitution(`${prefix} Opportunity Host`);
    const sourceId = await insertSource(institutionId);
    const opportunities = [
      await insertNativeOpportunity(institutionId, 1),
      await insertNativeOpportunity(institutionId, 2),
    ];
    const descending = [...opportunities].sort((left, right) =>
      right.id.localeCompare(left.id),
    );
    await runtime.client`
      insert into opportunity_source_bindings (
        opportunity_id, source_id, role, is_primary, is_active
      ) values (${descending[0]!.id}, ${sourceId}, 'PRIMARY_NOTICE', true, true)
    `;
    const previousVersionId = randomUUID();
    await runtime.client`
      insert into opportunity_versions (
        id, opportunity_id, version_number, verification_state, business_state,
        is_current, title, verified_at, created_at
      ) values (
        ${previousVersionId}, ${descending[0]!.id}, 2, 'SUPERSEDED', 'UPCOMING',
        false, ${`${prefix} previous truth`}, null,
        '2098-12-31T00:00:00.000Z'
      )
    `;
    for (const [ordinal, publishedAt] of [
      [1, "2099-01-03T00:00:00.000Z"],
      [2, "2099-01-04T00:00:00.000Z"],
    ] as const) {
      await runtime.client`
        insert into opportunity_changes (
          opportunity_id, truth_mode, change_type, materiality,
          from_native_version_id, to_native_version_id, summary,
          verified_at, published_at, dedupe_key
        ) values (
          ${descending[0]!.id}, 'NATIVE',
          ${ordinal === 1 ? "NEW_OPPORTUNITY" : "STATUS_CHANGED"},
          'NOTIFIABLE',
          ${ordinal === 1 ? null : previousVersionId},
          ${descending[0]!.versionId}, ${`${prefix} change ${ordinal}`},
          ${publishedAt}, ${publishedAt}, ${`${prefix}-change-${ordinal}`}
        )
      `;
    }

    const [first, second] = await expectReadOnlyProjection(
      runtime.executor,
      () =>
        Promise.all([
          query.listAdminOpportunities(runtime.executor, {
            institutionId,
            truthMode: "NATIVE",
            publicationState: "DRAFT",
            businessState: "OPEN",
            page: 1,
            pageSize: 1,
          }),
          query.listAdminOpportunities(runtime.executor, {
            institutionId,
            truthMode: "NATIVE",
            publicationState: "DRAFT",
            businessState: "OPEN",
            page: 2,
            pageSize: 1,
          }),
        ]),
    );

    expect(first.pagination).toEqual({
      page: 1,
      pageSize: 1,
      total: 2,
      hasNext: true,
    });
    expect(first.items[0]?.id).toBe(descending[0]!.id);
    expect(second.items[0]?.id).toBe(descending[1]!.id);
    expect(Object.keys(first.items[0]!).sort()).toEqual(
      [
        "activeSourceBindingCount",
        "currentVersion",
        "id",
        "institution",
        "kind",
        "publicationState",
        "recentChange",
        "slug",
        "truthMode",
      ].sort(),
    );
    expect(first.items[0]).toMatchObject({
      truthMode: "NATIVE",
      publicationState: "DRAFT",
      activeSourceBindingCount: 1,
      institution: {
        id: institutionId,
        displayName: `${prefix} Opportunity Host`,
      },
      currentVersion: {
        versionNumber: 1,
        verificationState: "VERIFIED",
        businessState: "OPEN",
      },
      recentChange: {
        changeType: "STATUS_CHANGED",
        summary: `${prefix} change 2`,
      },
    });
    expect(Object.keys(first.items[0]!.currentVersion!).sort()).toEqual(
      [
        "businessState",
        "id",
        "title",
        "verificationState",
        "verifiedAt",
        "versionNumber",
      ].sort(),
    );
    expect(Object.keys(first.items[0]!.recentChange!).sort()).toEqual(
      [
        "changeType",
        "id",
        "materiality",
        "publishedAt",
        "summary",
        "verifiedAt",
      ].sort(),
    );
  });

  it("returns one bounded Opportunity detail and rejects malformed or absent IDs", async () => {
    // Mutation caught: detail accepts a loose identifier, returns a raw root, or turns absence into an empty DTO.
    const query = await importOpportunityQuery();
    expect(query).not.toBeNull();
    if (!query) return;
    const institutionId = await insertInstitution(
      `${prefix} Opportunity Detail`,
    );
    const opportunity = await insertNativeOpportunity(institutionId, 1);

    await expect(
      query.getAdminOpportunity(runtime.executor, { id: opportunity.id }),
    ).resolves.toMatchObject({ id: opportunity.id, truthMode: "NATIVE" });
    await expect(
      query.getAdminOpportunity(runtime.executor, { id: randomUUID() }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    await expect(
      query.getAdminOpportunity(runtime.executor, { id: "loose" }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
  });
});

describe("WP-11 Admin Source read projection", () => {
  it("keeps Source pages bounded and strips unsafe links and stored extraction traps", async () => {
    // Mutation caught: a stored non-HTTP scheme becomes clickable or raw extraction/response context enters the DTO.
    const query = await importSourceQuery();
    expect(query).not.toBeNull();
    if (!query) return;

    const institutionId = await insertInstitution(`${prefix} Source Host`);
    const safeSourceId = await insertSource(institutionId);
    const unsafeSourceId = randomUUID();
    sourceIds.add(unsafeSourceId);
    await runtime.client`
      insert into sources (
        id, canonical_url, source_type, authority_level, lifecycle_status,
        source_name, created_at, updated_at
      ) values (
        ${unsafeSourceId}, ${`javascript:${prefix}`},
        'OFFICIAL_NOTICE_BOARD', 'SECONDARY_OFFICIAL', 'PAUSED',
        ${`${prefix} unsafe source`}, '2099-02-01T00:00:00.000Z',
        '2099-02-01T00:00:00.000Z'
      )
    `;
    await runtime.client`
      insert into source_monitor_configs (
        source_id, collection_strategy, monitoring_profile,
        custom_interval_minutes, seasonal_enabled, browser_required,
        max_attempts, is_enabled
      ) values (
        ${unsafeSourceId}, 'BROWSER', 'CRITICAL_SEASONAL', 15,
        true, true, 4, false
      )
    `;
    const snapshotId = randomUUID();
    await runtime.client`
      insert into source_snapshots (
        id, source_id, captured_at, content_hash, normalized_text,
        raw_storage_key, metadata
      ) values (
        ${snapshotId}, ${unsafeSourceId}, '2099-02-02T00:00:00.000Z',
        ${`${prefix}-hash`}, ${`${prefix}-private-normalized-trap`},
        ${`${prefix}-private-storage-trap`},
        ${JSON.stringify({ secret: `${prefix}-private-metadata-trap` })}::jsonb
      )
    `;
    await runtime.client`
      insert into source_observations (
        source_id, observed_at, outcome, http_status, duration_ms,
        error_code, error_message, final_url, snapshot_id
      ) values (
        ${unsafeSourceId}, '2099-02-03T00:00:00.000Z', 'ACCESS_ERROR',
        403, 821, 'ACCESS_DENIED', ${`${prefix}-private-error-body-trap`},
        ${`https://redirect.example.test/${prefix}-private-response-trap`},
        ${snapshotId}
      )
    `;

    const page = await expectReadOnlyProjection(runtime.executor, () =>
      query.listAdminSources(runtime.executor, {
        query: prefix,
        page: 1,
        pageSize: 50,
      }),
    );
    const unsafe = page.items.find((item) => item.id === unsafeSourceId);
    const safe = page.items.find((item) => item.id === safeSourceId);
    expect(unsafe).toBeDefined();
    expect(safe).toBeDefined();
    expect(safe?.safeUrl).toMatch(/^https:\/\//);
    expect(unsafe?.canonicalUrl).toBe(`javascript:${prefix}`);
    expect(unsafe?.safeUrl).toBeNull();
    expect(Object.keys(unsafe!).sort()).toEqual(
      [
        "activeInstitutionBindingCount",
        "activeOpportunityBindingCount",
        "authorityLevel",
        "canonicalUrl",
        "id",
        "latestObservation",
        "lifecycleStatus",
        "monitorConfig",
        "safeUrl",
        "sourceName",
        "sourceType",
      ].sort(),
    );
    expect(unsafe).toMatchObject({
      activeInstitutionBindingCount: 0,
      activeOpportunityBindingCount: 0,
      monitorConfig: {
        collectionStrategy: "BROWSER",
        monitoringProfile: "CRITICAL_SEASONAL",
        customIntervalMinutes: 15,
        maxAttempts: 4,
        isEnabled: false,
      },
      latestObservation: {
        outcome: "ACCESS_ERROR",
        httpStatus: 403,
        durationMs: 821,
        errorCode: "ACCESS_DENIED",
      },
    });
    expect(Object.keys(unsafe!.latestObservation!).sort()).toEqual(
      [
        "durationMs",
        "errorCode",
        "httpStatus",
        "id",
        "observedAt",
        "outcome",
      ].sort(),
    );
    expect(JSON.stringify(page)).not.toContain(`${prefix}-private-`);
  });

  it("uses updated-time/ID ordering and generic not-found for Source detail", async () => {
    // Mutation caught: equal timestamps reorder between requests or Source detail returns absence/unsafe URL as a link.
    const query = await importSourceQuery();
    expect(query).not.toBeNull();
    if (!query) return;
    const ids: string[] = [];
    for (let ordinal = 0; ordinal < 2; ordinal += 1) {
      const id = randomUUID();
      ids.push(id);
      sourceIds.add(id);
      await runtime.client`
        insert into sources (
          id, canonical_url, source_type, authority_level, lifecycle_status,
          source_name, created_at, updated_at
        ) values (
          ${id}, ${`https://stable.example.test/${prefix}/${id}`},
          'OTHER', 'DISCOVERY_ONLY', 'DISCOVERED', ${`${prefix} stable`},
          '2099-03-01T00:00:00.000Z', '2099-03-01T00:00:00.000Z'
        )
      `;
    }
    ids.sort((left, right) => right.localeCompare(left));
    const first = await query.listAdminSources(runtime.executor, {
      query: `${prefix} stable`,
      page: 1,
      pageSize: 1,
    });
    const second = await query.listAdminSources(runtime.executor, {
      query: `${prefix} stable`,
      page: 2,
      pageSize: 1,
    });
    expect(first.items[0]?.id).toBe(ids[0]);
    expect(second.items[0]?.id).toBe(ids[1]);
    await expect(
      query.getAdminSource(runtime.executor, { id: ids[0] }),
    ).resolves.toMatchObject({ id: ids[0], safeUrl: expect.any(String) });
    await expect(
      query.getAdminSource(runtime.executor, { id: randomUUID() }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
  });
});

describe("WP-11 inspection-only Article, Notification, and User projections", () => {
  it("lists Article metadata and relation counts without stored body content", async () => {
    // Mutation caught: the inspection projection starts behaving like a CMS or selects the stored article body.
    const query = await importArticleQuery();
    expect(query).not.toBeNull();
    if (!query) return;
    const institutionId = await insertInstitution(`${prefix} Article Host`);
    const opportunity = await insertNativeOpportunity(institutionId, 1);
    const articleId = randomUUID();
    articleIds.add(articleId);
    await runtime.client`
      insert into articles (
        id, slug, type, category, status, title, content_html,
        robots_index, robots_follow, published_at, created_at, updated_at
      ) values (
        ${articleId}, ${`${prefix}-article-${articleId}`}, 'GUIDE',
        'ADMISSIONS_GENERAL', 'PUBLISHED', ${`${prefix} Article`},
        ${`<p>${prefix}-private-article-body-trap</p>`}, true, true,
        '2099-04-01T00:00:00.000Z', '2099-04-01T00:00:00.000Z',
        '2099-04-01T00:00:00.000Z'
      )
    `;
    await runtime.client`
      insert into article_institutions (article_id, institution_id)
      values (${articleId}, ${institutionId})
    `;
    await runtime.client`
      insert into article_opportunities (article_id, opportunity_id)
      values (${articleId}, ${opportunity.id})
    `;
    const pollutionIds = Array.from({ length: 51 }, () => randomUUID());
    for (const id of pollutionIds) articleIds.add(id);
    await runtime.client`
      insert into articles ${runtime.client(
        pollutionIds.map((id) => ({
          id,
          slug: `${prefix}-pollution-${id}`,
          type: "GUIDE",
          category: "ADMISSIONS_GENERAL",
          status: "PUBLISHED",
          title: `${prefix} pollution ${id}`,
          content_html: "<p>pollution</p>",
          robots_index: false,
          robots_follow: false,
          published_at: "2100-01-01T00:00:00.000Z",
          created_at: "2100-01-01T00:00:00.000Z",
          updated_at: "2100-01-01T00:00:00.000Z",
        })),
        "id",
        "slug",
        "type",
        "category",
        "status",
        "title",
        "content_html",
        "robots_index",
        "robots_follow",
        "published_at",
        "created_at",
        "updated_at",
      )}
    `;

    const articlePage = await pageContainingArticle(articleId, 50);
    const page = await expectReadOnlyProjection(runtime.executor, () =>
      query.listAdminArticles(runtime.executor, {
        type: "GUIDE",
        status: "PUBLISHED",
        page: articlePage,
        pageSize: 50,
      }),
    );
    const article = page.items.find((item) => item.id === articleId);
    expect(article).toEqual({
      id: articleId,
      slug: `${prefix}-article-${articleId}`,
      title: `${prefix} Article`,
      type: "GUIDE",
      category: "ADMISSIONS_GENERAL",
      status: "PUBLISHED",
      publishedAt: "2099-04-01T00:00:00.000Z",
      institutionRelationCount: 1,
      opportunityRelationCount: 1,
    });
    expect(JSON.stringify(page)).not.toContain(`${prefix}-private-article`);
  });

  it("returns Notification signal identity and aggregates without recipient/provider context", async () => {
    // Mutation caught: a recipient hash, message identifier, provider error text, or body context enters Admin list DTOs.
    const query = await importNotificationQuery();
    expect(query).not.toBeNull();
    if (!query) return;
    const institutionId = await insertInstitution(
      `${prefix} Notification Host`,
    );
    const opportunity = await insertNativeOpportunity(institutionId, 1);
    const userId = randomUUID();
    userIds.add(userId);
    await runtime.client`
      insert into users (id, status, created_at, updated_at)
      values (${userId}, 'ACTIVE', '2099-04-02T00:00:00.000Z', '2099-04-02T00:00:00.000Z')
    `;
    const notificationId = randomUUID();
    notificationIds.add(notificationId);
    await runtime.client`
      insert into notifications (
        id, opportunity_id, signal_type, policy_version, status,
        signal_published_at, title_snapshot, body_context_json,
        deep_link_path, dedupe_key, created_at
      ) values (
        ${notificationId}, ${opportunity.id}, 'OPPORTUNITY_PUBLISHED',
        'v1', 'READY', '2099-04-03T00:00:00.000Z',
        ${`${prefix}-private-title-trap`},
        ${JSON.stringify({ secret: `${prefix}-private-provider-payload-trap` })}::jsonb,
        '/opportunities/private', ${`${prefix}-notification`},
        '2099-04-03T00:00:00.000Z'
      )
    `;
    const deliveryId = randomUUID();
    await runtime.client`
      insert into notification_deliveries (
        id, notification_id, user_id, channel, status, recipient_hash
      ) values (
        ${deliveryId}, ${notificationId}, ${userId}, 'EMAIL', 'FAILED',
        ${`${prefix}-private-recipient-trap`}
      )
    `;
    await runtime.client`
      insert into notification_delivery_attempts (
        notification_delivery_id, attempt_number, provider,
        provider_message_id, attempt_status, error_code, error_message_safe,
        attempted_at, completed_at
      ) values (
        ${deliveryId}, 1, 'TEST_PROVIDER',
        ${`${prefix}-private-message-id-trap`}, 'FAILED_TERMINAL',
        'BOUNCE', ${`${prefix}-private-error-body-trap`},
        '2099-04-03T00:01:00.000Z', '2099-04-03T00:02:00.000Z'
      )
    `;

    const notificationPage = await pageContainingNotification(
      notificationId,
      50,
    );
    const page = await expectReadOnlyProjection(runtime.executor, () =>
      query.listAdminNotifications(runtime.executor, {
        status: "READY",
        signalType: "OPPORTUNITY_PUBLISHED",
        page: notificationPage,
        pageSize: 50,
      }),
    );
    const notification = page.items.find((item) => item.id === notificationId);
    expect(notification).toEqual({
      id: notificationId,
      status: "READY",
      signalType: "OPPORTUNITY_PUBLISHED",
      opportunityId: opportunity.id,
      opportunityChangeId: null,
      signalPublishedAt: "2099-04-03T00:00:00.000Z",
      deliveryCount: 1,
      attemptCount: 1,
    });
    expect(JSON.stringify(page)).not.toContain(`${prefix}-private-`);
  });

  it("derives User email readiness while returning only opaque support fields", async () => {
    // Mutation caught: User lists expose identity/email/child PII or infer readiness without consent/preference/delivery state.
    const query = await importUserQuery();
    expect(query).not.toBeNull();
    if (!query) return;
    const readyBaseline = await expectReadOnlyProjection(runtime.executor, () =>
      query.listAdminUsers(runtime.executor, {
        status: "ACTIVE",
        emailReadiness: "READY",
        page: 1,
        pageSize: 1,
      }),
    );
    const institutionId = await insertInstitution(`${prefix} User Follow Host`);
    const readyUserId = randomUUID();
    const blockedUserId = randomUUID();
    const revokedUserId = randomUUID();
    const tiedUserId = randomUUID();
    const fixtureUserIds = [
      readyUserId,
      blockedUserId,
      revokedUserId,
      tiedUserId,
    ];
    for (const id of fixtureUserIds) userIds.add(id);
    for (const id of fixtureUserIds) {
      await runtime.client`
        insert into users (id, status, created_at, updated_at)
        values (${id}, 'ACTIVE', '2099-05-01T00:00:00.000Z', '2099-05-01T00:00:00.000Z')
      `;
      await runtime.client`
        insert into auth_identities (user_id, provider, provider_subject, status)
        values (${id}, 'KAKAO', ${`${prefix}-private-subject-${id}`}, 'ACTIVE')
      `;
      await runtime.client`
        insert into user_profiles (user_id, child_birth_year)
        values (${id}, 2021)
      `;
    }
    await runtime.client`
      insert into user_emails (
        user_id, email, email_normalized, source, verification_state,
        delivery_state
      ) values (
        ${readyUserId}, ${`${prefix}-private-ready@example.test`},
        ${`${prefix}-private-ready@example.test`}, 'USER_INPUT', 'VERIFIED',
        'USABLE'
      ), (
        ${blockedUserId}, ${`${prefix}-private-blocked@example.test`},
        ${`${prefix}-private-blocked@example.test`}, 'KAKAO', 'VERIFIED',
        'BOUNCED'
      ), (
        ${revokedUserId}, ${`${prefix}-private-revoked@example.test`},
        ${`${prefix}-private-revoked@example.test`}, 'USER_INPUT', 'VERIFIED',
        'USABLE'
      ), (
        ${tiedUserId}, ${`${prefix}-private-tied@example.test`},
        ${`${prefix}-private-tied@example.test`}, 'USER_INPUT', 'VERIFIED',
        'USABLE'
      )
    `;
    await runtime.client`
      insert into notification_preferences (user_id, channel, state)
      values (${readyUserId}, 'EMAIL', 'ENABLED'),
        (${revokedUserId}, 'EMAIL', 'ENABLED'),
        (${tiedUserId}, 'EMAIL', 'ENABLED')
    `;
    const [lowerConsentId, higherConsentId] = [
      randomUUID(),
      randomUUID(),
    ].sort();
    await runtime.client`
      insert into consent_decisions (
        id, user_id, consent_type, policy_version, decision, decided_at
      ) values (
        ${randomUUID()}, ${readyUserId}, 'SERVICE_EMAIL_UPDATES', 'v1', 'GRANTED',
        '2099-05-01T00:01:00.000Z'
      ), (
        ${randomUUID()}, ${revokedUserId}, 'SERVICE_EMAIL_UPDATES', 'v1', 'GRANTED',
        '2099-05-01T00:01:00.000Z'
      ), (
        ${randomUUID()}, ${revokedUserId}, 'SERVICE_EMAIL_UPDATES', 'v2', 'REVOKED',
        '2099-05-01T00:02:00.000Z'
      ), (
        ${lowerConsentId}, ${tiedUserId}, 'SERVICE_EMAIL_UPDATES', 'v1', 'GRANTED',
        '2099-05-01T00:03:00.000Z'
      ), (
        ${higherConsentId}, ${tiedUserId}, 'SERVICE_EMAIL_UPDATES', 'v2', 'REVOKED',
        '2099-05-01T00:03:00.000Z'
      )
    `;
    await runtime.client`
      insert into follows (
        user_id, institution_id, status, first_activated_at,
        current_activated_at
      ) values (
        ${readyUserId}, ${institutionId}, 'ACTIVE',
        '2099-05-01T00:00:00.000Z', '2099-05-01T00:00:00.000Z'
      )
    `;

    const userPositions = await Promise.all(
      fixtureUserIds.map(async (id) => ({
        id,
        page: await pageContainingUser(id, 50),
      })),
    );
    const userPages = await expectReadOnlyProjection(runtime.executor, () =>
      Promise.all(
        userPositions.map(({ page }) =>
          query.listAdminUsers(runtime.executor, {
            status: "ACTIVE",
            page,
            pageSize: 50,
          }),
        ),
      ),
    );
    const projectedUsers = userPages.flatMap((page) => page.items);
    const ready = projectedUsers.find((item) => item.id === readyUserId);
    const blocked = projectedUsers.find((item) => item.id === blockedUserId);
    const revoked = projectedUsers.find((item) => item.id === revokedUserId);
    const tied = projectedUsers.find((item) => item.id === tiedUserId);
    expect(ready).toEqual({
      id: readyUserId,
      status: "ACTIVE",
      createdAt: "2099-05-01T00:00:00.000Z",
      followCount: 1,
      emailReadiness: "READY",
    });
    expect(blocked).toMatchObject({
      id: blockedUserId,
      followCount: 0,
      emailReadiness: "EMAIL_BLOCKED",
    });
    expect(revoked).toMatchObject({
      id: revokedUserId,
      emailReadiness: "CONSENT_NOT_GRANTED",
    });
    expect(tied).toMatchObject({
      id: tiedUserId,
      emailReadiness: "CONSENT_NOT_GRANTED",
    });
    expect(JSON.stringify(userPages)).not.toContain(`${prefix}-private-`);

    const readyOnly = await expectReadOnlyProjection(runtime.executor, () =>
      query.listAdminUsers(runtime.executor, {
        status: "ACTIVE",
        emailReadiness: "READY",
        page: 1,
        pageSize: 1,
      }),
    );
    expect(readyOnly.pagination.total - readyBaseline.pagination.total).toBe(1);
  });
});

describe("WP-11 real Admin Dashboard projection", () => {
  it("bounds Institution truth support to one deterministic row despite adversarial truth fanout", async () => {
    // Mutation caught: a <=50 candidate batch fetches/materializes every published truth for an Institution, or fails to prefer OPEN truth canonically.
    const monitoring = await importMonitoringCountProjection();
    const support = await importMonitoringSupportProjection();
    expect(monitoring.countMonitoringDueStates).toBeTypeOf("function");
    expect(monitoring.getMonitoringQueue).toBeTypeOf("function");
    expect(support.listMonitoringRelevantTruth).toBeTypeOf("function");
    if (
      !monitoring.countMonitoringDueStates ||
      !monitoring.getMonitoringQueue ||
      !support.listMonitoringRelevantTruth
    ) {
      return;
    }

    const now = new Date("2099-06-20T00:00:00.000Z");
    const baseline = await monitoring.countMonitoringDueStates({
      executor: runtime.executor,
      now,
    });
    const institutionId = await insertInstitution(
      `${prefix} Adversarial Truth Fanout Host`,
    );
    const sourceId = await insertSource(institutionId);
    await runtime.client`
      insert into source_monitor_configs (
        source_id, collection_strategy, monitoring_profile,
        custom_interval_minutes, is_enabled
      ) values (${sourceId}, 'HTTP', 'STANDARD_SEASONAL', null, true)
    `;
    await runtime.client`
      insert into source_observations (source_id, observed_at, outcome)
      values (${sourceId}, '2099-06-18T12:00:00.000Z', 'UNCHANGED')
    `;

    const truthCount = 75;
    const truthRows = Array.from({ length: truthCount }, (_, ordinal) => ({
      id: randomUUID(),
      versionId: randomUUID(),
      ordinal,
    }));
    for (const row of truthRows) opportunityIds.add(row.id);
    const openTruth = truthRows.at(-1)!;
    await runtime.client`
      insert into opportunities ${runtime.client(
        truthRows.map((row) => ({
          id: row.id,
          institution_id: institutionId,
          slug: `${prefix}-fanout-${row.ordinal}-${row.id}`,
          kind: "APPLICATION",
          truth_mode: "NATIVE",
          publication_state: "DRAFT",
          created_at: "2099-01-01T00:00:00.000Z",
          updated_at: "2099-01-01T00:00:00.000Z",
          published_at: "2099-01-02T00:00:00.000Z",
        })),
        "id",
        "institution_id",
        "slug",
        "kind",
        "truth_mode",
        "publication_state",
        "created_at",
        "updated_at",
        "published_at",
      )}
    `;
    await runtime.client`
      insert into opportunity_versions ${runtime.client(
        truthRows.map((row) => ({
          id: row.versionId,
          opportunity_id: row.id,
          version_number: 1,
          verification_state: "VERIFIED",
          business_state: row.id === openTruth.id ? "OPEN" : "UPCOMING",
          is_current: true,
          title:
            row.id === openTruth.id
              ? `${prefix} selected open truth`
              : `${prefix} fanout truth ${row.ordinal}`,
          application_open_at:
            row.id === openTruth.id
              ? null
              : new Date(Date.UTC(2099, 5, 21 + row.ordinal)).toISOString(),
          verified_at: "2099-01-02T00:00:00.000Z",
          created_at: "2099-01-02T00:00:00.000Z",
        })),
        "id",
        "opportunity_id",
        "version_number",
        "verification_state",
        "business_state",
        "is_current",
        "title",
        "application_open_at",
        "verified_at",
        "created_at",
      )}
    `;
    await runtime.client`
      insert into opportunity_version_evidence ${runtime.client(
        truthRows.map((row) => ({
          opportunity_version_id: row.versionId,
          source_id: sourceId,
          evidence_role: "PRIMARY",
        })),
        "opportunity_version_id",
        "source_id",
        "evidence_role",
      )}
    `;
    await runtime.client`
      update opportunities
      set publication_state = 'PUBLISHED',
        published_at = '2099-01-02T00:00:00.000Z'
      where id in ${runtime.client(truthRows.map((row) => row.id))}
    `;

    const relevantTruth = await support.listMonitoringRelevantTruth(
      runtime.executor,
      { opportunityIds: [], institutionIds: [institutionId], now },
    );
    expect(truthRows).toHaveLength(truthCount);
    expect(relevantTruth).toHaveLength(1);
    expect(relevantTruth[0]).toMatchObject({
      targetType: "INSTITUTION",
      targetId: institutionId,
      opportunityId: openTruth.id,
      institutionId,
      businessState: "OPEN",
      title: `${prefix} selected open truth`,
    });

    const queue = await monitoring.getMonitoringQueue(
      { targetType: ["INSTITUTION"] },
      { executor: runtime.executor, now },
    );
    expect(
      queue.find(
        (row) => row.targetId === institutionId && row.source.id === sourceId,
      ),
    ).toMatchObject({ priority: "P0_ACTIVE", dueState: "OVERDUE" });
    const counts = await monitoring.countMonitoringDueStates({
      executor: runtime.executor,
      now,
    });
    expect(counts.overdue - baseline.overdue).toBe(1);
    expect(counts.due - baseline.due).toBe(0);
  });

  it("counts exact Monitoring pressure through fixed-size cursor batches", async () => {
    // Mutation caught: Dashboard counting materializes the unbounded, fully sorted WP-10B queue or stops after its first fixed-size batch.
    const monitoring = await importMonitoringCountProjection();
    expect(monitoring.countMonitoringDueStates).toBeTypeOf("function");
    expect(monitoring.iterateMonitoringDueStateBatches).toBeTypeOf("function");
    if (
      !monitoring.countMonitoringDueStates ||
      !monitoring.iterateMonitoringDueStateBatches
    ) {
      return;
    }

    const dashboardQuery = await importDashboardQuery();
    expect(dashboardQuery).not.toBeNull();
    if (!dashboardQuery) return;
    const now = new Date("2099-06-20T00:00:00.000Z");
    const baseline = await monitoring.countMonitoringDueStates({
      executor: runtime.executor,
      now,
    });
    const institutionId = await insertInstitution(
      `${prefix} Batched Monitoring Host`,
    );
    const batchCandidateCount = 53;
    const overdueCount = 27;
    const candidateSourceIds = Array.from({ length: batchCandidateCount }, () =>
      randomUUID(),
    );
    for (const sourceId of candidateSourceIds) sourceIds.add(sourceId);
    await runtime.client`
      insert into sources ${runtime.client(
        candidateSourceIds.map((id) => ({
          id,
          canonical_url: `https://batch.example.test/${prefix}/${id}`,
          source_type: "OTHER",
          authority_level: "DISCOVERY_ONLY",
          lifecycle_status: "ACTIVE",
          source_name: `${prefix} batch source ${id}`,
        })),
        "id",
        "canonical_url",
        "source_type",
        "authority_level",
        "lifecycle_status",
        "source_name",
      )}
    `;
    await runtime.client`
      insert into institution_source_bindings ${runtime.client(
        candidateSourceIds.map((sourceId) => ({
          institution_id: institutionId,
          source_id: sourceId,
          role: "OTHER",
          is_primary: false,
          is_active: true,
        })),
        "institution_id",
        "source_id",
        "role",
        "is_primary",
        "is_active",
      )}
    `;
    await runtime.client`
      insert into source_monitor_configs ${runtime.client(
        candidateSourceIds.map((sourceId) => ({
          source_id: sourceId,
          collection_strategy: "HTTP",
          monitoring_profile: "LOW_CHANGE",
          custom_interval_minutes: 60,
          is_enabled: true,
        })),
        "source_id",
        "collection_strategy",
        "monitoring_profile",
        "custom_interval_minutes",
        "is_enabled",
      )}
    `;
    await runtime.client`
      insert into source_observations (source_id, observed_at, outcome)
      select source_id, '2099-06-19T22:00:00.000Z', 'UNCHANGED'
      from unnest(${candidateSourceIds.slice(0, overdueCount)}::uuid[]) as source_id
    `;

    const batches: number[] = [];
    for await (const batch of monitoring.iterateMonitoringDueStateBatches({
      executor: runtime.executor,
      now,
    })) {
      batches.push(batch.length);
      expect(batch.length).toBeLessThanOrEqual(50);
    }
    expect(batches.length).toBeGreaterThan(1);

    const counts = await monitoring.countMonitoringDueStates({
      executor: runtime.executor,
      now,
    });
    expect(counts.overdue - baseline.overdue).toBe(27);
    expect(counts.due - baseline.due).toBe(26);

    const dashboard = await dashboardQuery.getAdminDashboard(runtime.executor, {
      now,
    });
    expect(dashboard.monitoring).toEqual(counts);
  });

  it("counts only canonical due/overdue, recent verified changes, paused Sources, and real Outbox states", async () => {
    // Mutation caught: Dashboard values are constants/client-array estimates, dead letters use a fictional table, or old changes count as recent.
    const query = await importDashboardQuery();
    expect(query).not.toBeNull();
    if (!query) return;
    await inRolledBackTransaction(async (executor) => {
      const now = new Date("2099-06-10T00:00:00.000Z");
      const pollutionInstitutionId = await insertInstitution(
        `${prefix} Dashboard Recent Pollution Host`,
        executor,
      );
      const pollutionOpportunity = await insertNativeOpportunity(
        pollutionInstitutionId,
        99,
        executor,
      );
      for (let ordinal = 0; ordinal < 9; ordinal += 1) {
        await executor.raw(sql`
          insert into opportunity_changes (
            opportunity_id, truth_mode, change_type, materiality,
            to_native_version_id, summary, verified_at, published_at,
            dedupe_key
          ) values (
            ${pollutionOpportunity.id}, 'NATIVE', 'NEW_OPPORTUNITY',
            'NON_NOTIFIABLE', ${pollutionOpportunity.versionId},
            ${`${prefix} recent pollution ${ordinal}`},
            '2099-06-09T12:00:00.000Z', '2099-06-09T12:00:00.000Z',
            ${`${prefix}-recent-pollution-${ordinal}`}
          )
        `);
      }
      await executor.raw(sql`set local session_replication_role = replica`);
      await executor.raw(sql`
        update opportunity_changes
        set verified_at = '2000-01-01T00:00:00.000Z',
          published_at = '2000-01-01T00:00:00.000Z'
        where verified_at >= '2099-06-03T00:00:00.000Z'
      `);
      const baseline = await expectReadOnlyProjection(executor, () =>
        query.getAdminDashboard(executor, { now }),
      );
      const institutionId = await insertInstitution(
        `${prefix} Dashboard Host`,
        executor,
      );

      for (const [ordinal, observedAt] of [
        [1, "2099-06-09T23:00:00.000Z"],
        [2, "2099-06-09T22:59:59.000Z"],
      ] as const) {
        const monitoredInstitutionId = await insertInstitution(
          `${prefix} Dashboard Monitored ${ordinal}`,
          executor,
        );
        const sourceId = await insertSource(monitoredInstitutionId, executor);
        await executor.raw(sql`
          insert into source_monitor_configs (
            source_id, collection_strategy, monitoring_profile,
            custom_interval_minutes, is_enabled
          ) values (${sourceId}, 'HTTP', 'STANDARD_SEASONAL', 60, true)
        `);
        await executor.raw(sql`
          insert into source_observations (source_id, observed_at, outcome)
          values (${sourceId}, ${observedAt}, 'UNCHANGED')
        `);
        expect(ordinal).toBeGreaterThan(0);
      }
      const unavailableId = randomUUID();
      sourceIds.add(unavailableId);
      await executor.raw(sql`
        insert into sources (
          id, canonical_url, source_type, authority_level, lifecycle_status,
          source_name
        ) values (
          ${unavailableId}, ${`https://paused.example.test/${prefix}`},
          'OTHER', 'DISCOVERY_ONLY', 'PAUSED', ${`${prefix} paused`}
        )
      `);

      const recentOpportunity = await insertNativeOpportunity(
        institutionId,
        9,
        executor,
      );
      await executor.raw(sql`
        insert into opportunity_changes (
          opportunity_id, truth_mode, change_type, materiality,
          to_native_version_id, summary, verified_at, published_at, dedupe_key
        ) values (
          ${recentOpportunity.id}, 'NATIVE', 'NEW_OPPORTUNITY', 'NOTIFIABLE',
          ${recentOpportunity.versionId}, ${`${prefix} recent verified change`},
          '2099-06-09T00:00:00.000Z', '2099-06-09T00:00:00.000Z',
          ${`${prefix}-dashboard-change`}
        )
      `);

      for (const [status, deadLetteredAt] of [
        ["PENDING", null],
        ["DEAD_LETTER", "2099-06-09T00:00:00.000Z"],
      ] as const) {
        const id = randomUUID();
        outboxIds.add(id);
        await executor.raw(sql`
          insert into outbox_events (
            id, event_type, aggregate_type, aggregate_id, payload, status,
            dead_lettered_at, dedupe_key
          ) values (
            ${id}, 'WP11_TEST', 'Opportunity', ${recentOpportunity.id},
            ${JSON.stringify({ secret: `${prefix}-private-outbox-trap` })}::jsonb,
            ${status}, ${deadLetteredAt}, ${`${prefix}-outbox-${status}`}
          )
        `);
      }

      const dashboard = await expectReadOnlyProjection(executor, () =>
        query.getAdminDashboard(executor, { now }),
      );
      expect(dashboard.monitoring.due - baseline.monitoring.due).toBe(1);
      expect(dashboard.monitoring.overdue - baseline.monitoring.overdue).toBe(
        1,
      );
      expect(
        dashboard.recentVerifiedChanges.count -
          baseline.recentVerifiedChanges.count,
      ).toBe(1);
      expect(dashboard.unavailableSources - baseline.unavailableSources).toBe(
        1,
      );
      expect(dashboard.outbox.pending - baseline.outbox.pending).toBe(1);
      expect(dashboard.outbox.deadLetter - baseline.outbox.deadLetter).toBe(1);
      expect(
        dashboard.recentVerifiedChanges.items.some(
          (item) => item.summary === `${prefix} recent verified change`,
        ),
      ).toBe(true);
      expect(Object.keys(dashboard).sort()).toEqual(
        [
          "monitoring",
          "outbox",
          "recentVerifiedChanges",
          "unavailableSources",
        ].sort(),
      );
      expect(JSON.stringify(dashboard)).not.toContain(`${prefix}-private-`);
    });
  });
});
