import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  findCurrentNativeVersion,
  findCurrentNativeVersionForUpdate,
  findOpportunityById,
  findOpportunityForUpdate,
  getLegacyAdmissionEventLink,
} from "@/src/modules/admissions/repository.server";
import {
  findArticleById,
  findArticleForUpdate,
} from "@/src/modules/editorial/repository.server";
import {
  closeEpisode,
  countActiveFollows,
  createLogicalFollow,
  findFollow,
  findFollowForUpdate,
  findOpenEpisode,
  openEpisode,
} from "@/src/modules/follow/repository.server";
import {
  createAuthIdentity,
  createPendingUser,
  findAuthIdentity,
  findUserById,
  findUserForUpdate,
} from "@/src/modules/identity/repository.server";
import {
  findInstitutionById,
  findInstitutionForUpdate,
} from "@/src/modules/institution/repository.server";
import {
  findDeliveryById,
  findNotificationById,
} from "@/src/modules/notification/repository.server";
import { migrateDatabase } from "@/src/db/migrate";
import { notificationDeliveries, notifications } from "@/src/db/schema";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL must be set for database integration tests",
  );
}

assertDedicatedTestDatabaseUrl(databaseUrl);

const prefix = `wp-05-repository-${randomUUID()}-`;
const runtime = getRuntimeDatabase({
  DATABASE_URL: databaseUrl,
  DATABASE_MAX_CONNECTIONS: 4,
  NODE_ENV: "test",
});
const schemaLockSql = postgres(databaseUrl, { max: 1 });

const fixtureIds = {
  articles: new Set<string>(),
  institutions: new Set<string>(),
  opportunities: new Set<string>(),
  schools: new Set<string>(),
  users: new Set<string>(),
  follows: new Set<string>(),
};

function tracked(values: Set<string>, id = randomUUID()): string {
  values.add(id);
  return id;
}

async function createInstitutionFixture() {
  const id = tracked(fixtureIds.institutions);
  await runtime.client`
    insert into institutions (id, slug, display_name, category)
    values (${id}, ${`${prefix}institution-${id}`}, 'WP-05 Institution', 'ENGLISH_KINDERGARTEN')
  `;
  return id;
}

async function createNativeOpportunityFixture() {
  const institutionId = await createInstitutionFixture();
  const id = tracked(fixtureIds.opportunities);
  await runtime.client`
    insert into opportunities (id, institution_id, slug, kind, truth_mode)
    values (${id}, ${institutionId}, ${`${prefix}native-${id}`}, 'APPLICATION', 'NATIVE')
  `;
  const versionId = randomUUID();
  const verifiedAt = new Date("2026-08-23T00:00:00.000Z");
  await runtime.client`
    insert into opportunity_versions (
      id, opportunity_id, truth_mode, version_number, verification_state,
      business_state, is_current, title, verified_at
    ) values (
      ${versionId}, ${id}, 'NATIVE', 1, 'VERIFIED', 'UPCOMING', true,
      'WP-05 Native Version', ${verifiedAt.toISOString()}
    )
  `;
  return { id, institutionId, versionId, verifiedAt };
}

async function createLegacyOpportunityFixture() {
  const institutionId = await createInstitutionFixture();
  const schoolId = tracked(fixtureIds.schools);
  const cycleId = randomUUID();
  const eventId = randomUUID();
  const opportunityId = tracked(fixtureIds.opportunities);

  await runtime.client`
    insert into schools (
      id, slug, canonical_name, school_type, lifecycle_status, country_code, is_public
    ) values (
      ${schoolId}, ${`${prefix}school-${schoolId}`}, 'WP-05 Legacy School',
      'PRIVATE_ELEMENTARY', 'ACTIVE', 'KR', false
    )
  `;
  await runtime.client`
    insert into institution_school_links (institution_id, school_id, link_reason)
    values (${institutionId}, ${schoolId}, 'WP-05_TEST')
  `;
  await runtime.client`
    insert into admission_cycles (
      id, school_id, academic_year, lifecycle_status, admission_mode, is_public_focus
    ) values (${cycleId}, ${schoolId}, 2099, 'ACTIVE', 'FIXED_WINDOW', false)
  `;
  await runtime.client`
    insert into admission_events (
      id, admission_cycle_id, event_key, event_type, canonical_title,
      occurrence_no, importance, actionability, is_public
    ) values (
      ${eventId}, ${cycleId}, ${`${prefix}event-${eventId}`}, 'BRIEFING',
      'WP-05 Legacy Event', 1, 'NORMAL', 'INFORMATIONAL', false
    )
  `;
  await runtime.client`
    insert into opportunities (id, institution_id, slug, kind, truth_mode)
    values (
      ${opportunityId}, ${institutionId}, ${`${prefix}legacy-${opportunityId}`},
      'INFORMATION_SESSION', 'LEGACY_BACKED'
    )
  `;
  await runtime.client`
    insert into opportunity_admission_event_links (
      opportunity_id, institution_id, truth_mode, admission_event_id,
      admission_cycle_id, school_id
    ) values (
      ${opportunityId}, ${institutionId}, 'LEGACY_BACKED', ${eventId},
      ${cycleId}, ${schoolId}
    )
  `;

  return { opportunityId, institutionId, schoolId, cycleId, eventId };
}

async function createArticleFixture() {
  const id = tracked(fixtureIds.articles);
  await runtime.client`
    insert into articles (
      id, slug, type, category, status, title, content_html, robots_index, robots_follow
    ) values (
      ${id}, ${`${prefix}article-${id}`}, 'GUIDE', 'ENGLISH_KINDERGARTEN',
      'DRAFT', 'WP-05 Article', '<p>WP-05 body</p>', true, true
    )
  `;
  return id;
}

async function clearFixtures() {
  const ids = {
    articles: [...fixtureIds.articles],
    institutions: [...fixtureIds.institutions],
    opportunities: [...fixtureIds.opportunities],
    schools: [...fixtureIds.schools],
    users: [...fixtureIds.users],
    follows: [...fixtureIds.follows],
  };

  try {
    await runtime.client.begin(async (transaction) => {
      await transaction`delete from notification_delivery_attempts as attempt
        using notification_deliveries as delivery, notifications as notification
        where attempt.notification_delivery_id = delivery.id
          and delivery.notification_id = notification.id
          and notification.dedupe_key like ${`${prefix}%`}`;
      await transaction`delete from notification_deliveries as delivery
        using notifications as notification
        where delivery.notification_id = notification.id
          and notification.dedupe_key like ${`${prefix}%`}`;
      await transaction`delete from notifications where dedupe_key like ${`${prefix}%`}`;
      if (ids.follows.length > 0) {
        await transaction`delete from follow_episodes where follow_id in ${transaction(ids.follows)}`;
        await transaction`delete from follows where id in ${transaction(ids.follows)}`;
      }
      if (ids.users.length > 0) {
        await transaction`delete from auth_identities where user_id in ${transaction(ids.users)}`;
        await transaction`delete from users where id in ${transaction(ids.users)}`;
      }
      if (ids.articles.length > 0) {
        await transaction`delete from articles where id in ${transaction(ids.articles)}`;
      }
      await transaction.unsafe("set local session_replication_role = replica");
      if (ids.opportunities.length > 0) {
        await transaction`delete from opportunity_admission_event_links
          where opportunity_id in ${transaction(ids.opportunities)}`;
        await transaction`delete from opportunity_versions
          where opportunity_id in ${transaction(ids.opportunities)}`;
        await transaction`delete from opportunities where id in ${transaction(ids.opportunities)}`;
      }
      if (ids.institutions.length > 0) {
        await transaction`delete from institution_school_links
          where institution_id in ${transaction(ids.institutions)}`;
        await transaction`delete from institutions where id in ${transaction(ids.institutions)}`;
      }
      if (ids.schools.length > 0) {
        await transaction`delete from admission_events
          where admission_cycle_id in (
            select id from admission_cycles where school_id in ${transaction(ids.schools)}
          )`;
        await transaction`delete from admission_cycles where school_id in ${transaction(ids.schools)}`;
        await transaction`delete from schools where id in ${transaction(ids.schools)}`;
      }
    });
  } finally {
    Object.values(fixtureIds).forEach((values) => values.clear());
  }
}

describe("WP-05 repository foundation", () => {
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

  it("creates and fetches pending Users and active Kakao identities with the runtime executor", async () => {
    const userId = tracked(fixtureIds.users);
    const identityId = randomUUID();
    const linkedAt = new Date("2026-08-23T01:02:03.000Z");

    const user = await createPendingUser(runtime.executor, { id: userId });
    const identity = await createAuthIdentity(runtime.executor, {
      id: identityId,
      userId,
      provider: "KAKAO",
      providerSubject: `${prefix}runtime-subject`,
      linkedAt,
    });

    expect(user).toMatchObject({ id: userId, status: "PENDING" });
    expect(identity).toMatchObject({
      id: identityId,
      userId,
      provider: "KAKAO",
      providerSubject: `${prefix}runtime-subject`,
      status: "ACTIVE",
      linkedAt,
    });
    await expect(findUserById(runtime.executor, userId)).resolves.toMatchObject(
      {
        id: userId,
        status: "PENDING",
      },
    );
    await expect(
      findAuthIdentity(runtime.executor, "KAKAO", `${prefix}runtime-subject`),
    ).resolves.toMatchObject({ id: identityId, userId, status: "ACTIVE" });
    await expect(
      findUserById(runtime.executor, randomUUID()),
    ).resolves.toBeNull();
  });

  it("uses the provided transaction executor for identity writes and rolls both writes back", async () => {
    const committedUserId = tracked(fixtureIds.users);
    const committedIdentityId = randomUUID();
    const rolledBackUserId = randomUUID();
    const rolledBackIdentityId = randomUUID();

    await runtime.transactionManager.run(async (executor) => {
      expect(executor.scope).toBe("transaction");
      await createPendingUser(executor, { id: committedUserId });
      await createAuthIdentity(executor, {
        id: committedIdentityId,
        userId: committedUserId,
        provider: "KAKAO",
        providerSubject: `${prefix}transaction-subject`,
      });
      await expect(
        findUserForUpdate(executor, committedUserId),
      ).resolves.toMatchObject({
        id: committedUserId,
        status: "PENDING",
      });
    });

    await expect(
      runtime.transactionManager.run(async (executor) => {
        await createPendingUser(executor, { id: rolledBackUserId });
        await createAuthIdentity(executor, {
          id: rolledBackIdentityId,
          userId: rolledBackUserId,
          provider: "KAKAO",
          providerSubject: `${prefix}rollback-subject`,
        });
        throw new Error("WP_05_REPOSITORY_ROLLBACK");
      }),
    ).rejects.toThrow("WP_05_REPOSITORY_ROLLBACK");

    await expect(
      findUserById(runtime.executor, committedUserId),
    ).resolves.toMatchObject({
      id: committedUserId,
      status: "PENDING",
    });
    await expect(
      findAuthIdentity(
        runtime.executor,
        "KAKAO",
        `${prefix}transaction-subject`,
      ),
    ).resolves.toMatchObject({
      id: committedIdentityId,
      userId: committedUserId,
    });
    await expect(
      findUserById(runtime.executor, rolledBackUserId),
    ).resolves.toBeNull();
    await expect(
      findAuthIdentity(runtime.executor, "KAKAO", `${prefix}rollback-subject`),
    ).resolves.toBeNull();
  });

  it("fetches and narrowly locks exact Institution and Article rows in one transaction", async () => {
    const institutionId = await createInstitutionFixture();
    const articleId = await createArticleFixture();

    await expect(
      findInstitutionById(runtime.executor, institutionId),
    ).resolves.toMatchObject({
      id: institutionId,
      displayName: "WP-05 Institution",
      category: "ENGLISH_KINDERGARTEN",
    });
    await expect(
      findArticleById(runtime.executor, articleId),
    ).resolves.toMatchObject({
      id: articleId,
      slug: `${prefix}article-${articleId}`,
      title: "WP-05 Article",
    });

    await runtime.transactionManager.run(async (executor) => {
      await expect(
        findInstitutionForUpdate(executor, institutionId),
      ).resolves.toMatchObject({
        id: institutionId,
        displayName: "WP-05 Institution",
      });
      await expect(
        findArticleForUpdate(executor, articleId),
      ).resolves.toMatchObject({
        id: articleId,
        title: "WP-05 Article",
      });
    });
  });

  it("holds an Institution repository lock against a distinct PostgreSQL connection until commit", async () => {
    const institutionId = await createInstitutionFixture();
    const contender = postgres(databaseUrl, { max: 1 });

    try {
      await runtime.transactionManager.run(async (executor) => {
        await expect(
          findInstitutionForUpdate(executor, institutionId),
        ).resolves.toMatchObject({
          id: institutionId,
        });
        await expect(
          contender`select id from institutions where id = ${institutionId} for update nowait`,
        ).rejects.toMatchObject({ code: "55P03" });
      });

      await expect(
        contender`select id from institutions where id = ${institutionId} for update nowait`,
      ).resolves.toEqual([{ id: institutionId }]);
    } finally {
      await contender.end({ timeout: 5 });
    }
  });

  it("fetches and narrowly locks a Native Opportunity current Version without reading Legacy state", async () => {
    const native = await createNativeOpportunityFixture();
    const legacy = await createLegacyOpportunityFixture();

    await expect(
      findOpportunityById(runtime.executor, native.id),
    ).resolves.toMatchObject({
      id: native.id,
      institutionId: native.institutionId,
      truthMode: "NATIVE",
    });
    await expect(
      findCurrentNativeVersion(runtime.executor, native.id),
    ).resolves.toMatchObject({
      id: native.versionId,
      opportunityId: native.id,
      truthMode: "NATIVE",
      isCurrent: true,
      verifiedAt: native.verifiedAt,
    });
    await expect(
      findCurrentNativeVersion(runtime.executor, legacy.opportunityId),
    ).resolves.toBeNull();

    await runtime.transactionManager.run(async (executor) => {
      await expect(
        findOpportunityForUpdate(executor, native.id),
      ).resolves.toMatchObject({
        id: native.id,
        truthMode: "NATIVE",
      });
      await expect(
        findCurrentNativeVersionForUpdate(executor, native.id),
      ).resolves.toMatchObject({
        id: native.versionId,
        opportunityId: native.id,
        isCurrent: true,
      });
    });
  });

  it("returns an exact legacy admission Event bridge and null for a Native Opportunity", async () => {
    const legacy = await createLegacyOpportunityFixture();
    const native = await createNativeOpportunityFixture();

    await expect(
      getLegacyAdmissionEventLink(runtime.executor, legacy.opportunityId),
    ).resolves.toMatchObject({
      opportunityId: legacy.opportunityId,
      institutionId: legacy.institutionId,
      truthMode: "LEGACY_BACKED",
      admissionEventId: legacy.eventId,
      admissionCycleId: legacy.cycleId,
      schoolId: legacy.schoolId,
    });
    await expect(
      getLegacyAdmissionEventLink(runtime.executor, native.id),
    ).resolves.toBeNull();
  });

  it("creates one logical active Follow, manages its open Episode, and counts active follows", async () => {
    const userId = tracked(fixtureIds.users);
    const institutionId = await createInstitutionFixture();
    const followId = tracked(fixtureIds.follows);
    const episodeId = randomUUID();
    const activatedAt = new Date("2026-08-23T04:05:06.000Z");
    const deactivatedAt = new Date("2026-08-23T07:08:09.000Z");

    await createPendingUser(runtime.executor, { id: userId });
    const follow = await createLogicalFollow(runtime.executor, {
      id: followId,
      userId,
      institutionId,
      activatedAt,
    });
    const episode = await openEpisode(runtime.executor, {
      id: episodeId,
      followId,
      activatedAt,
      reason: "WP-05 initial follow",
    });

    expect(follow).toMatchObject({
      id: followId,
      userId,
      institutionId,
      status: "ACTIVE",
      firstActivatedAt: activatedAt,
      currentActivatedAt: activatedAt,
      deactivatedAt: null,
    });
    expect(episode).toMatchObject({
      id: episodeId,
      followId,
      activatedAt,
      deactivatedAt: null,
      reason: "WP-05 initial follow",
    });
    await expect(
      findFollow(runtime.executor, userId, institutionId),
    ).resolves.toMatchObject({
      id: followId,
      status: "ACTIVE",
    });
    await runtime.transactionManager.run(async (executor) => {
      await expect(
        findFollowForUpdate(executor, userId, institutionId),
      ).resolves.toMatchObject({
        id: followId,
        status: "ACTIVE",
      });
    });
    await expect(countActiveFollows(runtime.executor, userId)).resolves.toBe(1);
    await expect(
      findOpenEpisode(runtime.executor, followId),
    ).resolves.toMatchObject({
      id: episodeId,
      deactivatedAt: null,
    });
    await expect(
      closeEpisode(runtime.executor, followId, deactivatedAt),
    ).resolves.toMatchObject({
      id: episodeId,
      deactivatedAt,
    });
    await expect(
      findOpenEpisode(runtime.executor, followId),
    ).resolves.toBeNull();
    await expect(
      closeEpisode(runtime.executor, followId, deactivatedAt),
    ).resolves.toBeNull();
  });

  it("fetches Notification and Delivery rows without mutating status or creating side effects", async () => {
    const native = await createNativeOpportunityFixture();
    const userId = tracked(fixtureIds.users);
    const notificationId = randomUUID();
    const deliveryId = randomUUID();
    const signalPublishedAt = new Date("2026-08-23T09:10:11.000Z");

    await createPendingUser(runtime.executor, { id: userId });
    await runtime.client`
      insert into notifications (
        id, opportunity_id, signal_type, policy_version, status, signal_published_at,
        title_snapshot, body_context_json, deep_link_path, dedupe_key
      ) values (
        ${notificationId}, ${native.id}, 'OPPORTUNITY_PUBLISHED', 'wp-05-v1', 'PENDING',
        ${signalPublishedAt.toISOString()}, 'WP-05 Notification', '{"kind":"repository"}'::jsonb,
        '/opportunities/wp-05', ${`${prefix}notification-${notificationId}`}
      )
    `;
    await runtime.client`
      insert into notification_deliveries (id, notification_id, user_id, channel, status)
      values (${deliveryId}, ${notificationId}, ${userId}, 'EMAIL', 'PENDING')
    `;

    const before = await runtime.executor.drizzle
      .select({
        notificationStatus: notifications.status,
        deliveryStatus: notificationDeliveries.status,
        attemptCount: sql<number>`(
          select count(*)::int from notification_delivery_attempts
          where notification_delivery_id = ${deliveryId}
        )`,
      })
      .from(notifications)
      .innerJoin(
        notificationDeliveries,
        eq(notificationDeliveries.notificationId, notifications.id),
      )
      .where(eq(notifications.id, notificationId));
    const outboxBefore = await runtime.client<
      { row: Record<string, unknown> }[]
    >`
      select to_jsonb(outbox_event) as row
      from outbox_events as outbox_event
      order by outbox_event.id
    `;

    await expect(
      findNotificationById(runtime.executor, notificationId),
    ).resolves.toMatchObject({
      id: notificationId,
      opportunityId: native.id,
      signalType: "OPPORTUNITY_PUBLISHED",
      status: "PENDING",
      signalPublishedAt,
    });
    await expect(
      findDeliveryById(runtime.executor, deliveryId),
    ).resolves.toMatchObject({
      id: deliveryId,
      notificationId,
      userId,
      channel: "EMAIL",
      status: "PENDING",
    });
    await expect(
      findNotificationById(runtime.executor, randomUUID()),
    ).resolves.toBeNull();
    await expect(
      findDeliveryById(runtime.executor, randomUUID()),
    ).resolves.toBeNull();

    const after = await runtime.executor.drizzle
      .select({
        notificationStatus: notifications.status,
        deliveryStatus: notificationDeliveries.status,
        attemptCount: sql<number>`(
          select count(*)::int from notification_delivery_attempts
          where notification_delivery_id = ${deliveryId}
        )`,
      })
      .from(notifications)
      .innerJoin(
        notificationDeliveries,
        eq(notificationDeliveries.notificationId, notifications.id),
      )
      .where(eq(notifications.id, notificationId));
    const outboxAfter = await runtime.client<
      { row: Record<string, unknown> }[]
    >`
      select to_jsonb(outbox_event) as row
      from outbox_events as outbox_event
      order by outbox_event.id
    `;

    expect(after).toEqual(before);
    expect(outboxAfter).toEqual(outboxBefore);
  });
});
