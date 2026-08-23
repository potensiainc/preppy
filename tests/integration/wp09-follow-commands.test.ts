import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { TestAnalyticsTracker } from "@/src/analytics/tracker";
import { createUserCommandContext } from "@/src/application/context";
import { migrateDatabase } from "@/src/db/migrate";
import {
  activateFollow,
  type ActivateFollowDependencies,
  defaultActivateFollowPersistence,
} from "@/src/modules/follow/activate-follow.server";
import { deactivateFollow } from "@/src/modules/follow/deactivate-follow.server";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
  type TransactionManager,
} from "@/src/infrastructure/db/runtime.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL must be set for database integration tests",
  );
}

assertDedicatedTestDatabaseUrl(databaseUrl);

const prefix = `wp-09-follow-${randomUUID()}-`;
const runtime = getRuntimeDatabase({
  DATABASE_URL: databaseUrl,
  DATABASE_MAX_CONNECTIONS: 6,
  NODE_ENV: "test",
});
const schemaLockSql = postgres(databaseUrl, { max: 1 });
const userIds = new Set<string>();
const institutionIds = new Set<string>();
const opportunityIds = new Set<string>();
const sourceIds = new Set<string>();
const schoolIds = new Set<string>();

const firstActivationAt = new Date("2026-08-23T01:02:03.000Z");
const secondActivationAt = new Date("2026-08-23T03:04:05.000Z");
const deactivationAt = new Date("2026-08-23T02:03:04.000Z");
const laterDeactivationAt = new Date("2026-08-23T04:05:06.000Z");
const outOfOrderAt = new Date("2026-08-23T00:01:02.000Z");
const firstActivationDb = "2026-08-23 01:02:03+00";
const secondActivationDb = "2026-08-23 03:04:05+00";
const deactivationDb = "2026-08-23 02:03:04+00";

function context(userId: string, occurredAt = firstActivationAt) {
  return createUserCommandContext({ userId, occurredAt });
}

async function createUser(status = "ACTIVE") {
  const id = randomUUID();
  userIds.add(id);
  const activatedAt =
    status === "ACTIVE" ? firstActivationAt.toISOString() : null;
  await runtime.client`
    insert into users (id, status, activated_at)
    values (${id}, ${status}, ${activatedAt})
  `;
  return id;
}

async function createInstitution(
  overrides: {
    publicationState?: string;
    operationalState?: string;
    coverage?:
      | "NATIVE"
      | "LEGACY"
      | "FACT"
      | "NONE"
      | "DISCOVERY_ONLY"
      | "PAUSED"
      | "MONITOR_DISABLED";
  } = {},
) {
  const id = randomUUID();
  institutionIds.add(id);
  await runtime.client`
    insert into institutions (
      id, slug, display_name, category, publication_state, operational_state
    ) values (
      ${id}, ${`${prefix}${id}`}, 'WP-09 Institution',
      'ENGLISH_KINDERGARTEN', ${overrides.publicationState ?? "PUBLISHED"},
      ${overrides.operationalState ?? "ACTIVE"}
    )
  `;
  const coverage = overrides.coverage ?? "NATIVE";
  if (coverage !== "NONE") await addMonitorableCoverage(id, coverage);
  return id;
}

async function addMonitorableCoverage(
  institutionId: string,
  coverage:
    | "NATIVE"
    | "LEGACY"
    | "FACT"
    | "DISCOVERY_ONLY"
    | "PAUSED"
    | "MONITOR_DISABLED",
) {
  const sourceId = randomUUID();
  sourceIds.add(sourceId);
  const authority =
    coverage === "DISCOVERY_ONLY" ? "DISCOVERY_ONLY" : "PRIMARY";
  const lifecycle = coverage === "PAUSED" ? "PAUSED" : "ACTIVE";
  const monitorEnabled = coverage !== "MONITOR_DISABLED";
  await runtime.client.begin(async (transaction) => {
    await transaction`
      insert into sources (
        id, canonical_url, source_type, authority_level, lifecycle_status, source_name
      ) values (
        ${sourceId}, ${`https://follow-source.example.test/${prefix}${sourceId}`},
        'OFFICIAL_ADMISSION_PAGE', ${authority}, ${lifecycle}, 'WP-09 official source'
      )
    `;
    await transaction`
      insert into source_monitor_configs (
        source_id, collection_strategy, monitoring_profile, is_enabled
      ) values (${sourceId}, 'HTTP', 'STANDARD_SEASONAL', ${monitorEnabled})
    `;

    if (coverage === "LEGACY") {
      const schoolId = randomUUID();
      schoolIds.add(schoolId);
      await transaction`
        insert into schools (
          id, slug, canonical_name, school_type, lifecycle_status, is_public
        ) values (
          ${schoolId}, ${`${prefix}school-${schoolId}`}, 'WP-09 Legacy School',
          'INTERNATIONAL_SCHOOL', 'ACTIVE', true
        )
      `;
      await transaction`
        insert into institution_school_links (institution_id, school_id, link_reason)
        values (${institutionId}, ${schoolId}, 'WP-09 coverage fixture')
      `;
      await transaction`
        insert into source_bindings (source_id, school_id, source_role, is_active)
        values (${sourceId}, ${schoolId}, 'PRIMARY_ADMISSIONS', true)
      `;
      return;
    }

    if (coverage === "FACT" || coverage === "DISCOVERY_ONLY") {
      const factId = randomUUID();
      const versionId = randomUUID();
      await transaction`
        insert into institution_facts (id, institution_id, fact_type)
        values (${factId}, ${institutionId}, 'CURRICULUM')
      `;
      await transaction`
        insert into institution_fact_versions (
          id, institution_fact_id, version_number, verification_state,
          is_current, value_json, verified_at
        ) values (
          ${versionId}, ${factId}, 1, 'VERIFIED', true,
          ${JSON.stringify({ curriculum: "verified" })}::jsonb,
          ${firstActivationAt.toISOString()}
        )
      `;
      await transaction`
        insert into institution_fact_version_evidence (
          institution_fact_version_id, source_id, evidence_role
        ) values (${versionId}, ${sourceId}, 'PRIMARY')
      `;
      return;
    }

    const opportunityId = randomUUID();
    const versionId = randomUUID();
    opportunityIds.add(opportunityId);
    await transaction`
      insert into opportunities (
        id, institution_id, slug, kind, truth_mode, publication_state, published_at
      ) values (
        ${opportunityId}, ${institutionId}, ${`${prefix}coverage-${opportunityId}`},
        'APPLICATION', 'NATIVE', 'PUBLISHED', ${firstActivationAt.toISOString()}
      )
    `;
    await transaction`
      insert into opportunity_versions (
        id, opportunity_id, truth_mode, version_number, verification_state,
        business_state, is_current, title, verified_at
      ) values (
        ${versionId}, ${opportunityId}, 'NATIVE', 1, 'VERIFIED', 'OPEN', true,
        'Native 영유 monitored opportunity', ${firstActivationAt.toISOString()}
      )
    `;
    await transaction`
      insert into opportunity_version_evidence (
        opportunity_version_id, source_id, evidence_role
      ) values (${versionId}, ${sourceId}, 'PRIMARY')
    `;
  });
}

async function seedOldOpportunityChange(institutionId: string) {
  const opportunityId = randomUUID();
  const versionId = randomUUID();
  opportunityIds.add(opportunityId);
  const publishedAt = new Date("2026-08-01T00:00:00.000Z");
  await runtime.client`
    insert into opportunities (
      id, institution_id, slug, kind, truth_mode
    ) values (
      ${opportunityId}, ${institutionId}, ${`${prefix}opportunity-${opportunityId}`},
      'APPLICATION', 'NATIVE'
    )
  `;
  await runtime.client`
    insert into opportunity_versions (
      id, opportunity_id, truth_mode, version_number, verification_state,
      business_state, is_current, title, verified_at
    ) values (
      ${versionId}, ${opportunityId}, 'NATIVE', 1, 'VERIFIED', 'UPCOMING',
      true, 'WP-09 historical opportunity version', ${publishedAt.toISOString()}
    )
  `;
  await runtime.client`
    insert into opportunity_changes (
      id, opportunity_id, truth_mode, change_type, materiality,
      to_native_version_id, summary, verified_at, published_at, dedupe_key
    ) values (
      ${randomUUID()}, ${opportunityId}, 'NATIVE', 'NEW_OPPORTUNITY',
      'NOTIFIABLE', ${versionId},
      'Old change must not be replayed by Follow activation',
      ${publishedAt.toISOString()}, ${publishedAt.toISOString()},
      ${`${prefix}change-${opportunityId}`}
    )
  `;
}

async function productSideEffectCounts() {
  const [counts] = await runtime.client<
    {
      notifications: number;
      deliveries: number;
      customerOutbox: number;
      alerts: number;
      subscribers: number;
      subscriptions: number;
    }[]
  >`
    select
      (select count(*)::int from notifications) as notifications,
      (select count(*)::int from notification_deliveries) as deliveries,
      (select count(*)::int from outbox_events) as "customerOutbox",
      (select count(*)::int from alerts) as alerts,
      (select count(*)::int from subscribers) as subscribers,
      (select count(*)::int from subscriptions) as subscriptions
  `;
  return counts;
}

function dependencies(tracker = new TestAnalyticsTracker()) {
  return {
    transactionManager: runtime.transactionManager,
    tracker,
  } satisfies ActivateFollowDependencies;
}

async function clearFixtures() {
  const users = [...userIds];
  const institutions = [...institutionIds];
  const opportunities = [...opportunityIds];
  const sources = [...sourceIds];
  const schools = [...schoolIds];
  try {
    await runtime.client.begin(async (transaction) => {
      if (users.length > 0) {
        await transaction`delete from follow_episodes where follow_id in (
          select id from follows where user_id in ${transaction(users)}
        )`;
        await transaction`delete from follows where user_id in ${transaction(users)}`;
        await transaction`delete from users where id in ${transaction(users)}`;
      }
      await transaction.unsafe("set local session_replication_role = replica");
      if (opportunities.length > 0) {
        await transaction`delete from opportunity_changes
          where opportunity_id in ${transaction(opportunities)}`;
        await transaction`delete from opportunity_version_evidence
          where opportunity_version_id in (
            select id from opportunity_versions where opportunity_id in ${transaction(opportunities)}
          )`;
        await transaction`delete from opportunity_versions
          where opportunity_id in ${transaction(opportunities)}`;
        await transaction`delete from opportunities where id in ${transaction(opportunities)}`;
      }
      if (institutions.length > 0) {
        await transaction`delete from institution_fact_version_evidence
          where institution_fact_version_id in (
            select version.id from institution_fact_versions version
            join institution_facts fact on fact.id = version.institution_fact_id
            where fact.institution_id in ${transaction(institutions)}
          )`;
        await transaction`delete from institution_fact_versions
          where institution_fact_id in (
            select id from institution_facts where institution_id in ${transaction(institutions)}
          )`;
        await transaction`delete from institution_facts
          where institution_id in ${transaction(institutions)}`;
        await transaction`delete from source_bindings
          where school_id in (
            select school_id from institution_school_links
            where institution_id in ${transaction(institutions)}
          )`;
        await transaction`delete from institution_school_links
          where institution_id in ${transaction(institutions)}`;
        await transaction`delete from institutions where id in ${transaction(institutions)}`;
      }
      if (schools.length > 0) {
        await transaction`delete from schools where id in ${transaction(schools)}`;
      }
      if (sources.length > 0) {
        await transaction`delete from source_monitor_configs where source_id in ${transaction(sources)}`;
        await transaction`delete from sources where id in ${transaction(sources)}`;
      }
    });
  } finally {
    userIds.clear();
    institutionIds.clear();
    opportunityIds.clear();
    sourceIds.clear();
    schoolIds.clear();
  }
}

describe("WP-09 Follow commands", () => {
  beforeAll(async () => {
    await schemaLockSql`
      select pg_advisory_lock(hashtext('admissionradar-schema-tests'))
    `;
    await migrateDatabase(databaseUrl);
  });

  afterEach(clearFixtures);

  afterAll(async () => {
    await schemaLockSql`
      select pg_advisory_unlock(hashtext('admissionradar-schema-tests'))
    `;
    await schemaLockSql.end({ timeout: 5 });
    await closeRuntimeDatabase();
  });

  it.each(["NONE", "DISCOVERY_ONLY", "PAUSED", "MONITOR_DISABLED"] as const)(
    "rejects an otherwise public Institution with %s source coverage",
    async (coverage) => {
      const userId = await createUser();
      const institutionId = await createInstitution({ coverage });
      const tracker = new TestAnalyticsTracker();

      await expect(
        activateFollow(
          context(userId),
          { institutionId },
          dependencies(tracker),
        ),
      ).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
      await expect(
        runtime.client`
        select id from follows
        where user_id = ${userId} and institution_id = ${institutionId}
      `,
      ).resolves.toHaveLength(0);
      await expect(
        runtime.client`
        select episode.id from follow_episodes episode
        join follows follow on follow.id = episode.follow_id
        where follow.user_id = ${userId}
      `,
      ).resolves.toHaveLength(0);
      expect(tracker.snapshot()).toEqual([]);
    },
  );

  it.each(["NATIVE", "LEGACY", "FACT"] as const)(
    "accepts %s monitorable coverage through the existing schema",
    async (coverage) => {
      const userId = await createUser();
      const institutionId = await createInstitution({ coverage });

      await expect(
        activateFollow(context(userId), { institutionId }, dependencies()),
      ).resolves.toMatchObject({
        institutionId,
        state: "ACTIVE",
        created: true,
      });
    },
  );

  it("creates one logical Follow and Episode without replaying old changes or legacy side effects", async () => {
    // Mutations caught: missing occurrence-time boundaries, missing Episode,
    // wrong result flags/count, pre-commit conversion, or legacy fan-out writes.
    const userId = await createUser();
    const institutionId = await createInstitution();
    await seedOldOpportunityChange(institutionId);
    const before = await productSideEffectCounts();
    const tracker = new TestAnalyticsTracker();

    const result = await activateFollow(
      context(userId),
      { institutionId },
      dependencies(tracker),
    );

    expect(result).toEqual({
      followId: expect.any(String),
      institutionId,
      state: "ACTIVE",
      activatedAt: firstActivationAt.toISOString(),
      created: true,
      reactivated: false,
      activeFollowCount: 1,
    });
    await expect(
      runtime.client`
        select id, status, first_activated_at, current_activated_at, deactivated_at
        from follows where user_id = ${userId} and institution_id = ${institutionId}
      `,
    ).resolves.toEqual([
      {
        id: result.followId,
        status: "ACTIVE",
        first_activated_at: firstActivationDb,
        current_activated_at: firstActivationDb,
        deactivated_at: null,
      },
    ]);
    await expect(
      runtime.client`
        select follow_id, activated_at, deactivated_at from follow_episodes
        where follow_id = ${result.followId}
      `,
    ).resolves.toEqual([
      {
        follow_id: result.followId,
        activated_at: firstActivationDb,
        deactivated_at: null,
      },
    ]);
    expect(tracker.snapshot()).toEqual([
      {
        name: "follow_created",
        properties: { institutionId, followCount: 1 },
      },
    ]);
    expect(await productSideEffectCounts()).toEqual(before);
  });

  it("requires an ACTIVE User and a published, non-closed Institution", async () => {
    // Mutations caught: accepting inactive Users, draft Institutions, closed
    // Institutions, or converting an absent Institution into a Follow FK error.
    const pendingUserId = await createUser("PENDING");
    const activeUserId = await createUser();
    const publishedInstitutionId = await createInstitution();
    const draftInstitutionId = await createInstitution({
      publicationState: "DRAFT",
    });
    const closedInstitutionId = await createInstitution({
      operationalState: "CLOSED",
    });
    const deps = dependencies();

    await expect(
      activateFollow(
        context(pendingUserId),
        { institutionId: publishedInstitutionId },
        deps,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      activateFollow(
        context(activeUserId),
        { institutionId: draftInstitutionId },
        deps,
      ),
    ).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
    await expect(
      activateFollow(
        context(activeUserId),
        { institutionId: closedInstitutionId },
        deps,
      ),
    ).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
    await expect(
      activateFollow(
        context(activeUserId),
        { institutionId: randomUUID() },
        deps,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      runtime.client`select id from follows where user_id in (${pendingUserId}, ${activeUserId})`,
    ).resolves.toHaveLength(0);
  });

  it("converges concurrent first activation and retry to one Follow, one Episode, and one event", async () => {
    // Mutations caught: no User lock, duplicate Episode insert, raw unique error,
    // or emitting analytics from the idempotent branch.
    const userId = await createUser();
    const institutionId = await createInstitution();
    const tracker = new TestAnalyticsTracker();
    const deps = dependencies(tracker);

    const concurrent = await Promise.all([
      activateFollow(context(userId), { institutionId }, deps),
      activateFollow(context(userId), { institutionId }, deps),
    ]);
    const retry = await activateFollow(
      context(userId, secondActivationAt),
      { institutionId },
      deps,
    );

    expect(new Set(concurrent.map((result) => result.followId)).size).toBe(1);
    expect(concurrent.filter((result) => result.created)).toHaveLength(1);
    expect(concurrent.filter((result) => !result.created)).toHaveLength(1);
    expect(retry).toMatchObject({
      followId: concurrent[0]!.followId,
      activatedAt: firstActivationAt.toISOString(),
      created: false,
      reactivated: false,
      activeFollowCount: 1,
    });
    await expect(
      runtime.client`select id from follows where user_id = ${userId}`,
    ).resolves.toHaveLength(1);
    await expect(
      runtime.client`
        select id from follow_episodes where follow_id = ${concurrent[0]!.followId}
      `,
    ).resolves.toHaveLength(1);
    expect(tracker.snapshot()).toEqual([
      {
        name: "follow_created",
        properties: { institutionId, followCount: 1 },
      },
    ]);
  });

  it("uses one root transaction and maps a residual unique collision to typed conflict", async () => {
    // Mutation caught: replaying the entire command in a second root
    // transaction after a residual pair/open-Episode unique violation.
    const userId = await createUser();
    const institutionId = await createInstitution();
    let rootTransactions = 0;
    const transactionManager = {
      run<T>(operation: Parameters<TransactionManager["run"]>[0]) {
        rootTransactions += 1;
        return runtime.transactionManager.run(operation) as Promise<T>;
      },
    } as TransactionManager;
    const uniqueViolation = Object.assign(new Error("raw unique details"), {
      code: "23505",
    });

    await expect(
      activateFollow(
        context(userId),
        { institutionId },
        {
          transactionManager,
          tracker: new TestAnalyticsTracker(),
          persistence: {
            ...defaultActivateFollowPersistence,
            createLogicalFollowIfAbsent: async () => {
              throw uniqueViolation;
            },
          },
        },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT", status: 409 });
    expect(rootTransactions).toBe(1);
    await expect(
      runtime.client`select id from follows where user_id = ${userId}`,
    ).resolves.toHaveLength(0);
  });

  it("converges a conflict-aware first-insert collision through select-lock in one root transaction", async () => {
    // Mutation caught: treating ON CONFLICT DO NOTHING as success without
    // selecting/locking the winning logical Follow in the same root transaction.
    const userId = await createUser();
    const institutionId = await createInstitution();
    let rootTransactions = 0;
    let findCalls = 0;
    const transactionManager = {
      run<T>(operation: Parameters<TransactionManager["run"]>[0]) {
        rootTransactions += 1;
        return runtime.transactionManager.run(operation) as Promise<T>;
      },
    } as TransactionManager;
    const persistence = {
      ...defaultActivateFollowPersistence,
      findFollowForUpdate: async (
        ...args: Parameters<
          typeof defaultActivateFollowPersistence.findFollowForUpdate
        >
      ) => {
        findCalls += 1;
        if (findCalls === 1) return null;
        return defaultActivateFollowPersistence.findFollowForUpdate(...args);
      },
      createLogicalFollowIfAbsent: async (
        ...args: Parameters<
          typeof defaultActivateFollowPersistence.createLogicalFollowIfAbsent
        >
      ) => {
        const inserted =
          await defaultActivateFollowPersistence.createLogicalFollowIfAbsent(
            ...args,
          );
        if (!inserted) throw new Error("fixture insert unexpectedly lost");
        await defaultActivateFollowPersistence.openEpisode(args[0], {
          followId: inserted.id,
          activatedAt: args[1].activatedAt,
        });
        return null;
      },
    };

    const result = await activateFollow(
      context(userId),
      { institutionId },
      {
        transactionManager,
        tracker: new TestAnalyticsTracker(),
        persistence,
      },
    );

    expect(result).toMatchObject({
      followId: expect.any(String),
      institutionId,
      state: "ACTIVE",
      activatedAt: firstActivationAt.toISOString(),
      created: false,
      reactivated: false,
      activeFollowCount: 1,
    });
    expect(rootTransactions).toBe(1);
    expect(findCalls).toBe(2);
    await expect(
      runtime.client`select id from follows where user_id = ${userId}`,
    ).resolves.toHaveLength(1);
    await expect(
      runtime.client`select id from follow_episodes where follow_id = ${result.followId}`,
    ).resolves.toHaveLength(1);
  });

  it("maps a residual Follow check violation to typed conflict and rolls back", async () => {
    const userId = await createUser();
    const institutionId = await createInstitution();
    const checkViolation = Object.assign(new Error("drizzle query failed"), {
      cause: Object.assign(new Error("raw constraint details"), {
        code: "23514",
      }),
    });

    await expect(
      activateFollow(
        context(userId),
        { institutionId },
        {
          transactionManager: runtime.transactionManager,
          tracker: new TestAnalyticsTracker(),
          persistence: {
            ...defaultActivateFollowPersistence,
            openEpisode: async () => {
              throw checkViolation;
            },
          },
        },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT", status: 409 });
    await expect(
      runtime.client`select id from follows where user_id = ${userId}`,
    ).resolves.toHaveLength(0);
  });

  it("reactivates the same Follow concurrently with one new open Episode", async () => {
    // Mutations caught: replacing the logical Follow, overwriting history,
    // duplicating the open Episode, or reporting both calls as transitions.
    const userId = await createUser();
    const institutionId = await createInstitution();
    const initial = await activateFollow(
      context(userId),
      { institutionId },
      dependencies(),
    );
    await deactivateFollow(
      context(userId, deactivationAt),
      { institutionId },
      { transactionManager: runtime.transactionManager },
    );
    const tracker = new TestAnalyticsTracker();
    const deps = dependencies(tracker);

    const results = await Promise.all([
      activateFollow(
        context(userId, secondActivationAt),
        { institutionId },
        deps,
      ),
      activateFollow(
        context(userId, secondActivationAt),
        { institutionId },
        deps,
      ),
    ]);

    expect(
      results.every((result) => result.followId === initial.followId),
    ).toBe(true);
    expect(results.filter((result) => result.reactivated)).toHaveLength(1);
    expect(results.filter((result) => !result.reactivated)).toHaveLength(1);
    await expect(
      runtime.client`
        select activated_at, deactivated_at from follow_episodes
        where follow_id = ${initial.followId} order by activated_at
      `,
    ).resolves.toEqual([
      {
        activated_at: firstActivationDb,
        deactivated_at: deactivationDb,
      },
      { activated_at: secondActivationDb, deactivated_at: null },
    ]);
    await expect(
      runtime.client`
        select id, status, first_activated_at, current_activated_at, deactivated_at
        from follows where id = ${initial.followId}
      `,
    ).resolves.toEqual([
      {
        id: initial.followId,
        status: "ACTIVE",
        first_activated_at: firstActivationDb,
        current_activated_at: secondActivationDb,
        deactivated_at: null,
      },
    ]);
    expect(tracker.snapshot()).toEqual([
      {
        name: "follow_created",
        properties: { institutionId, followCount: 1 },
      },
    ]);
  });

  it("serializes cross-Institution activation and emits exactly one classified event per transition", async () => {
    // Mutations caught: count-before-commit classification, no User lock across
    // Institution pairs, or emitting follow_created plus additional_follow.
    const userId = await createUser();
    const firstInstitutionId = await createInstitution();
    const secondInstitutionId = await createInstitution();
    const tracker = new TestAnalyticsTracker();
    const deps = dependencies(tracker);

    const results = await Promise.all([
      activateFollow(
        context(userId),
        { institutionId: firstInstitutionId },
        deps,
      ),
      activateFollow(
        context(userId),
        { institutionId: secondInstitutionId },
        deps,
      ),
    ]);

    expect(results.map((result) => result.activeFollowCount).sort()).toEqual([
      1, 2,
    ]);
    expect(
      tracker
        .snapshot()
        .map((event) => event.name)
        .sort(),
    ).toEqual(["additional_follow", "follow_created"]);
    expect(tracker.snapshot()).toHaveLength(2);
  });

  it("emits mutually exclusive conversion analytics only after commit and never for retry or rollback", async () => {
    const userId = await createUser();
    const firstInstitutionId = await createInstitution();
    const secondInstitutionId = await createInstitution();
    const rollbackInstitutionId = await createInstitution();
    const eventNames: string[] = [];
    let transactionResolved = false;
    const transactionManager = {
      async run<T>(operation: Parameters<TransactionManager["run"]>[0]) {
        transactionResolved = false;
        const result = (await runtime.transactionManager.run(operation)) as T;
        transactionResolved = true;
        return result;
      },
    } as TransactionManager;
    const tracker = {
      track(name: "follow_created" | "additional_follow") {
        expect(transactionResolved).toBe(true);
        eventNames.push(name);
      },
    } as ActivateFollowDependencies["tracker"];
    const deps = { transactionManager, tracker };

    await activateFollow(
      context(userId),
      { institutionId: firstInstitutionId },
      deps,
    );
    await activateFollow(
      context(userId),
      { institutionId: secondInstitutionId },
      deps,
    );
    await activateFollow(
      context(userId, secondActivationAt),
      { institutionId: firstInstitutionId },
      deps,
    );
    await expect(
      activateFollow(
        context(userId, secondActivationAt),
        { institutionId: rollbackInstitutionId },
        {
          transactionManager,
          tracker,
          persistence: {
            ...defaultActivateFollowPersistence,
            openEpisode: async () => {
              throw new Error("forced rollback before analytics");
            },
          },
        },
      ),
    ).rejects.toThrow("forced rollback before analytics");

    expect(eventNames).toEqual(["follow_created", "additional_follow"]);
    await expect(
      runtime.client`
        select id from follows
        where user_id = ${userId} and institution_id = ${rollbackInstitutionId}
      `,
    ).resolves.toHaveLength(0);
  });

  it("commits activation even when best-effort analytics fails", async () => {
    const userId = await createUser();
    const institutionId = await createInstitution();

    await expect(
      activateFollow(
        context(userId),
        { institutionId },
        {
          transactionManager: runtime.transactionManager,
          tracker: {
            track() {
              throw new Error("analytics unavailable");
            },
          },
        },
      ),
    ).resolves.toMatchObject({ created: true, state: "ACTIVE" });
    await expect(
      runtime.client`
        select status from follows where user_id = ${userId} and institution_id = ${institutionId}
      `,
    ).resolves.toEqual([{ status: "ACTIVE" }]);
  });

  it("rejects an ACTIVE Follow whose open Episode boundary mismatches its current activation", async () => {
    const userId = await createUser();
    const institutionId = await createInstitution();
    const activation = await activateFollow(
      context(userId),
      { institutionId },
      dependencies(),
    );
    await runtime.client`
      update follows set current_activated_at = ${deactivationAt.toISOString()}
      where id = ${activation.followId}
    `;

    await expect(
      activateFollow(
        context(userId, secondActivationAt),
        { institutionId },
        dependencies(),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      deactivateFollow(
        context(userId, secondActivationAt),
        { institutionId },
        { transactionManager: runtime.transactionManager },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      runtime.client`
        select status, current_activated_at from follows where id = ${activation.followId}
      `,
    ).resolves.toEqual([
      { status: "ACTIVE", current_activated_at: deactivationDb },
    ]);
  });

  it("rejects an INACTIVE Follow that still has an open Episode", async () => {
    const userId = await createUser();
    const institutionId = await createInstitution();
    const activation = await activateFollow(
      context(userId),
      { institutionId },
      dependencies(),
    );
    await runtime.client`
      update follows set status = 'INACTIVE', deactivated_at = ${deactivationAt.toISOString()}
      where id = ${activation.followId}
    `;

    await expect(
      deactivateFollow(
        context(userId, secondActivationAt),
        { institutionId },
        { transactionManager: runtime.transactionManager },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      runtime.client`
        select deactivated_at from follow_episodes where follow_id = ${activation.followId}
      `,
    ).resolves.toEqual([{ deactivated_at: null }]);
  });

  it("rejects deactivation before the current activation without writing", async () => {
    const userId = await createUser();
    const institutionId = await createInstitution();
    const activation = await activateFollow(
      context(userId),
      { institutionId },
      dependencies(),
    );

    await expect(
      deactivateFollow(
        context(userId, outOfOrderAt),
        { institutionId },
        { transactionManager: runtime.transactionManager },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT", status: 409 });
    await expect(
      runtime.client`
        select status, deactivated_at from follows where id = ${activation.followId}
      `,
    ).resolves.toEqual([{ status: "ACTIVE", deactivated_at: null }]);
    await expect(
      runtime.client`
        select deactivated_at from follow_episodes where follow_id = ${activation.followId}
      `,
    ).resolves.toEqual([{ deactivated_at: null }]);
  });

  it("rejects reactivation before stored deactivation/current boundaries without writing", async () => {
    const userId = await createUser();
    const institutionId = await createInstitution();
    const activation = await activateFollow(
      context(userId, secondActivationAt),
      { institutionId },
      dependencies(),
    );
    await deactivateFollow(
      context(userId, laterDeactivationAt),
      { institutionId },
      { transactionManager: runtime.transactionManager },
    );

    await expect(
      activateFollow(
        context(userId, deactivationAt),
        { institutionId },
        dependencies(),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT", status: 409 });
    await expect(
      runtime.client`
        select status, current_activated_at, deactivated_at
        from follows where id = ${activation.followId}
      `,
    ).resolves.toEqual([
      {
        status: "INACTIVE",
        current_activated_at: secondActivationDb,
        deactivated_at: "2026-08-23 04:05:06+00",
      },
    ]);
    await expect(
      runtime.client`
        select count(*)::int as count from follow_episodes
        where follow_id = ${activation.followId}
      `,
    ).resolves.toEqual([{ count: 1 }]);
  });

  it("deactivates without deleting history and treats repeated or missing deactivation as no-op", async () => {
    // Mutations caught: deleting the Follow/Episode, using separate timestamps,
    // changing IDs, or treating missing/already inactive as errors.
    const userId = await createUser();
    const institutionId = await createInstitution();
    const missingInstitutionId = randomUUID();
    const activation = await activateFollow(
      context(userId),
      { institutionId },
      dependencies(),
    );
    const deps = { transactionManager: runtime.transactionManager };

    const first = await deactivateFollow(
      context(userId, deactivationAt),
      { institutionId },
      deps,
    );
    const repeated = await deactivateFollow(
      context(userId, secondActivationAt),
      { institutionId },
      deps,
    );
    const missing = await deactivateFollow(
      context(userId, secondActivationAt),
      { institutionId: missingInstitutionId },
      deps,
    );

    expect(first).toEqual({
      followId: activation.followId,
      institutionId,
      state: "INACTIVE",
      deactivatedAt: deactivationAt.toISOString(),
      deactivated: true,
    });
    expect(repeated).toEqual({
      followId: activation.followId,
      institutionId,
      state: "INACTIVE",
      deactivatedAt: deactivationAt.toISOString(),
      deactivated: false,
    });
    expect(missing).toEqual({
      followId: null,
      institutionId: missingInstitutionId,
      state: "INACTIVE",
      deactivatedAt: null,
      deactivated: false,
    });
    await expect(
      runtime.client`
        select id, status, deactivated_at from follows where id = ${activation.followId}
      `,
    ).resolves.toEqual([
      {
        id: activation.followId,
        status: "INACTIVE",
        deactivated_at: deactivationDb,
      },
    ]);
    await expect(
      runtime.client`
        select follow_id, activated_at, deactivated_at from follow_episodes
        where follow_id = ${activation.followId}
      `,
    ).resolves.toEqual([
      {
        follow_id: activation.followId,
        activated_at: firstActivationDb,
        deactivated_at: deactivationDb,
      },
    ]);
  });
});
