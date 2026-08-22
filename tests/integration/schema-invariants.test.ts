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

const applicationTables = [
  "admin_users",
  "admission_cycles",
  "admission_event_versions",
  "admission_events",
  "admission_fact_versions",
  "admission_facts",
  "alert_deliveries",
  "alerts",
  "audit_logs",
  "detected_changes",
  "event_version_evidence",
  "expected_windows",
  "fact_version_evidence",
  "guides",
  "meaningful_changes",
  "outbox_events",
  "school_aliases",
  "schools",
  "source_bindings",
  "source_monitor_configs",
  "source_observations",
  "source_snapshots",
  "sources",
  "subscribers",
  "subscription_action_tokens",
  "subscriptions",
  "update_changes",
  "updates",
] as const;

async function resetApplicationTables() {
  await sql.unsafe(
    `truncate table ${applicationTables.join(", ")} restart identity cascade`,
  );
}

async function createSchoolAndCycle(options?: { publicFocus?: boolean }) {
  const schoolId = randomUUID();
  const cycleId = randomUUID();
  const slug = `school-${schoolId}`;

  await sql`
    insert into schools (
      id, slug, canonical_name, school_type, lifecycle_status, country_code,
      is_public
    ) values (
      ${schoolId}, ${slug}, 'Test School', 'PRIVATE_ELEMENTARY', 'ACTIVE', 'KR',
      false
    )
  `;

  await sql`
    insert into admission_cycles (
      id, school_id, academic_year, lifecycle_status, admission_mode,
      is_public_focus
    ) values (
      ${cycleId}, ${schoolId}, 2027, 'MONITORING', 'FIXED_WINDOW',
      ${options?.publicFocus ?? false}
    )
  `;

  return { schoolId, cycleId };
}

async function createEvent(cycleId: string) {
  const eventId = randomUUID();
  await sql`
    insert into admission_events (
      id, admission_cycle_id, event_key, event_type, occurrence_no,
      canonical_title, importance, actionability, is_public
    ) values (
      ${eventId}, ${cycleId}, 'application-main', 'APPLICATION', 1,
      'Main application', 'CRITICAL', 'ACTION_REQUIRED', true
    )
  `;
  return eventId;
}

async function createFact(cycleId: string) {
  const factId = randomUUID();
  await sql`
    insert into admission_facts (
      id, admission_cycle_id, fact_key, fact_type, scope, is_critical,
      is_public
    ) values (
      ${factId}, ${cycleId}, 'eligibility-general', 'ELIGIBILITY', 'CYCLE',
      true, true
    )
  `;
  return factId;
}

async function createSubscriberAndSubscription(cycleId: string) {
  const subscriberId = randomUUID();
  const subscriptionId = randomUUID();
  const email = `${subscriberId}@example.com`;

  await sql`
    insert into subscribers (
      id, email, email_normalized, status
    ) values (
      ${subscriberId}, ${email}, ${email}, 'ACTIVE'
    )
  `;

  await sql`
    insert into subscriptions (
      id, subscriber_id, admission_cycle_id, status, consent_version,
      consent_source, requested_at
    ) values (
      ${subscriptionId}, ${subscriberId}, ${cycleId}, 'VERIFIED', 'v1',
      'integration-test', now()
    )
  `;

  return { subscriberId, subscriptionId };
}

async function createSource() {
  const sourceId = randomUUID();

  await sql`
    insert into sources (
      id, canonical_url, source_type, authority_level, lifecycle_status,
      source_name, requires_js
    ) values (
      ${sourceId}, ${`https://source.example.com/${sourceId}`},
      'OFFICIAL_ADMISSION_PAGE', 'PRIMARY', 'ACTIVE', 'Admissions', false
    )
  `;

  return sourceId;
}

async function createMeaningfulChange(
  cycleId: string,
  options?: { eventId?: string; factId?: string },
) {
  const meaningfulChangeId = randomUUID();

  await sql`
    insert into meaningful_changes (
      id, admission_cycle_id, admission_event_id, admission_fact_id,
      change_type, significance, review_status
    ) values (
      ${meaningfulChangeId}, ${cycleId}, ${options?.eventId ?? null},
      ${options?.factId ?? null}, 'OTHER', 'NORMAL', 'REVIEW_REQUIRED'
    )
  `;

  return meaningfulChangeId;
}

describe("STEP 2 PostgreSQL invariants", () => {
  beforeAll(async () => {
    await sql`select pg_advisory_lock(hashtext('admissionradar-schema-tests'))`;
    await migrateDatabase(databaseUrl);
  });

  afterEach(async () => {
    await resetApplicationTables();
  });

  afterAll(async () => {
    await sql`select pg_advisory_unlock(hashtext('admissionradar-schema-tests'))`;
    await sql.end({ timeout: 5 });
  });

  it("rejects duplicate School and academic-year cycles", async () => {
    const { schoolId } = await createSchoolAndCycle();

    await expect(
      sql`
        insert into admission_cycles (
          id, school_id, academic_year, lifecycle_status, admission_mode,
          is_public_focus
        ) values (
          ${randomUUID()}, ${schoolId}, 2027, 'MONITORING', 'FIXED_WINDOW', false
        )
      `,
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("rejects two public-focus cycles for one School", async () => {
    const { schoolId } = await createSchoolAndCycle({ publicFocus: true });

    await expect(
      sql`
        insert into admission_cycles (
          id, school_id, academic_year, lifecycle_status, admission_mode,
          is_public_focus
        ) values (
          ${randomUUID()}, ${schoolId}, 2028, 'PLANNED', 'UNKNOWN', true
        )
      `,
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("rejects duplicate Event keys inside one Cycle", async () => {
    const { cycleId } = await createSchoolAndCycle();
    await createEvent(cycleId);

    await expect(
      sql`
        insert into admission_events (
          id, admission_cycle_id, event_key, event_type, occurrence_no,
          canonical_title, importance, actionability, is_public
        ) values (
          ${randomUUID()}, ${cycleId}, 'application-main', 'APPLICATION', 1,
          'Duplicate application', 'CRITICAL', 'ACTION_REQUIRED', true
        )
      `,
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("rejects two current EventVersions for one Event", async () => {
    const { cycleId } = await createSchoolAndCycle();
    const eventId = await createEvent(cycleId);

    await sql`
      insert into admission_event_versions (
        id, admission_event_id, version_no, is_current, verification_status,
        knowledge_state, event_status, display_title, timezone
      ) values (
        ${randomUUID()}, ${eventId}, 1, true, 'VERIFIED', 'KNOWN', 'SCHEDULED',
        'Application', 'Asia/Seoul'
      )
    `;

    await expect(
      sql`
        insert into admission_event_versions (
          id, admission_event_id, version_no, is_current, verification_status,
          knowledge_state, event_status, display_title, timezone
        ) values (
          ${randomUUID()}, ${eventId}, 2, true, 'UNVERIFIED', 'KNOWN',
          'SCHEDULED', 'Application changed', 'Asia/Seoul'
        )
      `,
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("rejects two current FactVersions for one Fact", async () => {
    const { cycleId } = await createSchoolAndCycle();
    const factId = await createFact(cycleId);

    await sql`
      insert into admission_fact_versions (
        id, admission_fact_id, version_no, is_current, verification_status,
        knowledge_state, value_kind, value_text, display_value
      ) values (
        ${randomUUID()}, ${factId}, 1, true, 'VERIFIED', 'KNOWN', 'TEXT',
        'Grade 1', 'Grade 1'
      )
    `;

    await expect(
      sql`
        insert into admission_fact_versions (
          id, admission_fact_id, version_no, is_current, verification_status,
          knowledge_state, value_kind, value_text, display_value
        ) values (
          ${randomUUID()}, ${factId}, 2, true, 'UNVERIFIED', 'KNOWN', 'TEXT',
          'Grade 1 applicants', 'Grade 1 applicants'
        )
      `,
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("rejects duplicate Cycle Subscriptions for one Subscriber", async () => {
    const { cycleId } = await createSchoolAndCycle();
    const { subscriberId } = await createSubscriberAndSubscription(cycleId);

    await expect(
      sql`
        insert into subscriptions (
          id, subscriber_id, admission_cycle_id, status, consent_version,
          consent_source, requested_at
        ) values (
          ${randomUUID()}, ${subscriberId}, ${cycleId}, 'PENDING', 'v1',
          'integration-test', now()
        )
      `,
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("rejects duplicate Alert dedupe keys", async () => {
    const { cycleId } = await createSchoolAndCycle();
    const dedupeKey = `change:${randomUUID()}:DEADLINE_CHANGED`;

    await sql`
      insert into alerts (
        id, admission_cycle_id, alert_type, dedupe_key, status, generated_at
      ) values (
        ${randomUUID()}, ${cycleId}, 'DEADLINE_CHANGED', ${dedupeKey}, 'DRAFT',
        now()
      )
    `;

    await expect(
      sql`
        insert into alerts (
          id, admission_cycle_id, alert_type, dedupe_key, status, generated_at
        ) values (
          ${randomUUID()}, ${cycleId}, 'DEADLINE_CHANGED', ${dedupeKey},
          'DRAFT', now()
        )
      `,
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("rejects duplicate Email Deliveries for one Alert and Subscription", async () => {
    const { cycleId } = await createSchoolAndCycle();
    const { subscriberId, subscriptionId } =
      await createSubscriberAndSubscription(cycleId);
    const alertId = randomUUID();

    await sql`
      insert into alerts (
        id, admission_cycle_id, alert_type, dedupe_key, status, generated_at
      ) values (
        ${alertId}, ${cycleId}, 'NEW_ANNOUNCEMENT', ${`change:${randomUUID()}`},
        'READY', now()
      )
    `;

    await sql`
      insert into alert_deliveries (
        id, alert_id, subscription_id, subscriber_id, channel, status,
        attempt_count
      ) values (
        ${randomUUID()}, ${alertId}, ${subscriptionId}, ${subscriberId}, 'EMAIL',
        'PENDING', 0
      )
    `;

    await expect(
      sql`
        insert into alert_deliveries (
          id, alert_id, subscription_id, subscriber_id, channel, status,
          attempt_count
        ) values (
          ${randomUUID()}, ${alertId}, ${subscriptionId}, ${subscriberId},
          'EMAIL', 'PENDING', 0
        )
      `,
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("deduplicates canonical Sources and null-scoped Source bindings", async () => {
    const { schoolId } = await createSchoolAndCycle();
    const sourceId = randomUUID();
    const canonicalUrl = `https://school.example.com/${sourceId}`;

    await sql`
      insert into sources (
        id, canonical_url, source_type, authority_level, lifecycle_status,
        source_name, requires_js
      ) values (
        ${sourceId}, ${canonicalUrl}, 'OFFICIAL_ADMISSION_PAGE', 'PRIMARY',
        'ACTIVE', 'Admissions', false
      )
    `;

    await expect(
      sql`
        insert into sources (
          id, canonical_url, source_type, authority_level, lifecycle_status,
          source_name, requires_js
        ) values (
          ${randomUUID()}, ${canonicalUrl}, 'OFFICIAL_ADMISSION_PAGE', 'PRIMARY',
          'ACTIVE', 'Duplicate admissions', false
        )
      `,
    ).rejects.toMatchObject({ code: "23505" });

    await sql`
      insert into source_bindings (
        id, source_id, school_id, admission_cycle_id, source_role, priority,
        is_active
      ) values (
        ${randomUUID()}, ${sourceId}, ${schoolId}, null, 'PRIMARY_ADMISSIONS', 1,
        true
      )
    `;

    await expect(
      sql`
        insert into source_bindings (
          id, source_id, school_id, admission_cycle_id, source_role, priority,
          is_active
        ) values (
          ${randomUUID()}, ${sourceId}, ${schoolId}, null, 'PRIMARY_ADMISSIONS',
          2, true
        )
      `,
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("supports all required P0 collection and Alert amendments", async () => {
    const { cycleId } = await createSchoolAndCycle();
    const sourceId = randomUUID();
    const snapshotId = randomUUID();
    const alertId = randomUUID();
    const outboxId = randomUUID();

    await sql`
      insert into sources (
        id, canonical_url, source_type, authority_level, lifecycle_status,
        source_name, requires_js
      ) values (
        ${sourceId}, ${`https://source.example.com/${sourceId}`},
        'OFFICIAL_NOTICE_BOARD', 'PRIMARY', 'ACTIVE', 'Notice board', false
      )
    `;

    await sql`
      insert into source_monitor_configs (
        id, source_id, collection_strategy, monitoring_profile,
        custom_interval_minutes, seasonal_enabled, browser_required,
        max_attempts, is_enabled
      ) values (
        ${randomUUID()}, ${sourceId}, 'HTTP', 'CRITICAL_SEASONAL', 180, true,
        false, 3, true
      )
    `;

    await sql`
      insert into source_snapshots (
        id, source_id, captured_at, content_hash, text_hash, normalized_text
      ) values (
        ${snapshotId}, ${sourceId}, now(), ${`content-${snapshotId}`},
        ${`text-${snapshotId}`}, 'admission schedule'
      )
    `;

    const [observation] = await sql<{ etag: string; last_modified: string }[]>`
      insert into source_observations (
        source_id, observed_at, outcome, http_status, snapshot_id, etag,
        last_modified
      ) values (
        ${sourceId}, now(), 'CHANGED', 200, ${snapshotId}, '"etag-v1"',
        'Wed, 14 Aug 2026 00:00:00 GMT'
      ) returning etag, last_modified
    `;

    await sql`
      insert into alerts (
        id, admission_cycle_id, alert_type, dedupe_key, status, generated_at
      ) values (
        ${alertId}, ${cycleId}, 'CORRECTION', ${`correction:${alertId}`}, 'DRAFT',
        now()
      )
    `;

    const [outbox] = await sql<{ id: string }[]>`
      insert into outbox_events (
        id, event_type, aggregate_type, aggregate_id, payload, status,
        available_at, attempt_count
      ) values (
        ${outboxId}, 'ALERT_READY', 'Alert', ${alertId}, ${sql.json({ alertId })},
        'PENDING', now(), 0
      ) returning id
    `;

    expect(observation).toEqual({
      etag: '"etag-v1"',
      last_modified: "Wed, 14 Aug 2026 00:00:00 GMT",
    });
    expect(outbox?.id).toBe(outboxId);
  });

  it("rejects an Event-scoped Fact linked to an Event in another Cycle", async () => {
    const { cycleId: firstCycleId } = await createSchoolAndCycle();
    const { cycleId: secondCycleId } = await createSchoolAndCycle();
    const eventId = await createEvent(secondCycleId);

    await expect(
      sql`
        insert into admission_facts (
          id, admission_cycle_id, admission_event_id, fact_key, fact_type,
          scope, is_critical, is_public
        ) values (
          ${randomUUID()}, ${firstCycleId}, ${eventId}, 'event-eligibility',
          'ELIGIBILITY', 'EVENT', true, true
        )
      `,
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("rejects a Source binding whose Cycle belongs to another School", async () => {
    const { cycleId } = await createSchoolAndCycle();
    const { schoolId: otherSchoolId } = await createSchoolAndCycle();
    const sourceId = await createSource();

    await expect(
      sql`
        insert into source_bindings (
          id, source_id, school_id, admission_cycle_id, source_role, priority,
          is_active
        ) values (
          ${randomUUID()}, ${sourceId}, ${otherSchoolId}, ${cycleId},
          'PRIMARY_ADMISSIONS', 1, true
        )
      `,
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("rejects a MeaningfulChange linked to an Event in another Cycle", async () => {
    const { cycleId: firstCycleId } = await createSchoolAndCycle();
    const { cycleId: secondCycleId } = await createSchoolAndCycle();
    const eventId = await createEvent(secondCycleId);

    await expect(
      createMeaningfulChange(firstCycleId, { eventId }),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("rejects a MeaningfulChange linked to a Fact in another Cycle", async () => {
    const { cycleId: firstCycleId } = await createSchoolAndCycle();
    const { cycleId: secondCycleId } = await createSchoolAndCycle();
    const factId = await createFact(secondCycleId);

    await expect(
      createMeaningfulChange(firstCycleId, { factId }),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("rejects an Alert linked to a MeaningfulChange in another Cycle", async () => {
    const { cycleId: firstCycleId } = await createSchoolAndCycle();
    const { cycleId: secondCycleId } = await createSchoolAndCycle();
    const meaningfulChangeId = await createMeaningfulChange(firstCycleId);

    await expect(
      sql`
        insert into alerts (
          id, admission_cycle_id, meaningful_change_id, alert_type, dedupe_key,
          status, generated_at
        ) values (
          ${randomUUID()}, ${secondCycleId}, ${meaningfulChangeId},
          'NEW_ANNOUNCEMENT', ${`change:${randomUUID()}`}, 'DRAFT', now()
        )
      `,
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("rejects an AlertDelivery whose Subscription targets another Cycle", async () => {
    const { cycleId: alertCycleId } = await createSchoolAndCycle();
    const { cycleId: subscriptionCycleId } = await createSchoolAndCycle();
    const { subscriberId, subscriptionId } =
      await createSubscriberAndSubscription(subscriptionCycleId);
    const alertId = randomUUID();

    await sql`
      insert into alerts (
        id, admission_cycle_id, alert_type, dedupe_key, status, generated_at
      ) values (
        ${alertId}, ${alertCycleId}, 'NEW_ANNOUNCEMENT',
        ${`change:${randomUUID()}`}, 'READY', now()
      )
    `;

    await expect(
      sql`
        insert into alert_deliveries (
          id, alert_id, subscription_id, subscriber_id, channel, status,
          attempt_count
        ) values (
          ${randomUUID()}, ${alertId}, ${subscriptionId}, ${subscriberId},
          'EMAIL', 'PENDING', 0
        )
      `,
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("rejects an AlertDelivery with a Subscriber outside its Subscription", async () => {
    const { cycleId } = await createSchoolAndCycle();
    const { subscriptionId } = await createSubscriberAndSubscription(cycleId);
    const otherSubscriberId = randomUUID();
    const alertId = randomUUID();

    await sql`
      insert into subscribers (id, email, email_normalized, status)
      values (
        ${otherSubscriberId}, ${`${otherSubscriberId}@example.com`},
        ${`${otherSubscriberId}@example.com`}, 'ACTIVE'
      )
    `;
    await sql`
      insert into alerts (
        id, admission_cycle_id, alert_type, dedupe_key, status, generated_at
      ) values (
        ${alertId}, ${cycleId}, 'NEW_ANNOUNCEMENT',
        ${`change:${randomUUID()}`}, 'READY', now()
      )
    `;

    await expect(
      sql`
        insert into alert_deliveries (
          id, alert_id, subscription_id, subscriber_id, channel, status,
          attempt_count
        ) values (
          ${randomUUID()}, ${alertId}, ${subscriptionId}, ${otherSubscriberId},
          'EMAIL', 'PENDING', 0
        )
      `,
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("rejects parent updates that would invalidate an AlertDelivery", async () => {
    const { cycleId } = await createSchoolAndCycle();
    const { cycleId: otherCycleId } = await createSchoolAndCycle();
    const { subscriberId, subscriptionId } =
      await createSubscriberAndSubscription(cycleId);
    const alertId = randomUUID();

    await sql`
      insert into alerts (
        id, admission_cycle_id, alert_type, dedupe_key, status, generated_at
      ) values (
        ${alertId}, ${cycleId}, 'NEW_ANNOUNCEMENT',
        ${`change:${randomUUID()}`}, 'READY', now()
      )
    `;
    await sql`
      insert into alert_deliveries (
        id, alert_id, subscription_id, subscriber_id, channel, status,
        attempt_count
      ) values (
        ${randomUUID()}, ${alertId}, ${subscriptionId}, ${subscriberId},
        'EMAIL', 'PENDING', 0
      )
    `;

    await expect(
      sql`
        update subscriptions
        set admission_cycle_id = ${otherCycleId}
        where id = ${subscriptionId}
      `,
    ).rejects.toMatchObject({ code: "23514" });

    await expect(
      sql`
        update alerts
        set admission_cycle_id = ${otherCycleId}
        where id = ${alertId}
      `,
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("serializes a Delivery insert against a concurrent Alert cycle update", async () => {
    const { cycleId } = await createSchoolAndCycle();
    const { cycleId: otherCycleId } = await createSchoolAndCycle();
    const { subscriberId, subscriptionId } =
      await createSubscriberAndSubscription(cycleId);
    const alertId = randomUUID();
    const insertClient = postgres(databaseUrl, { max: 1 });
    const updateClient = postgres(databaseUrl, { max: 1 });

    await sql`
      insert into alerts (
        id, admission_cycle_id, alert_type, dedupe_key, status, generated_at
      ) values (
        ${alertId}, ${cycleId}, 'NEW_ANNOUNCEMENT',
        ${`change:${randomUUID()}`}, 'READY', now()
      )
    `;

    let releaseInsert!: () => void;
    const holdInsert = new Promise<void>((resolve) => {
      releaseInsert = resolve;
    });
    let inserted!: () => void;
    const insertReady = new Promise<void>((resolve) => {
      inserted = resolve;
    });

    try {
      const insertTransaction = insertClient.begin(async (transaction) => {
        await transaction`
          insert into alert_deliveries (
            id, alert_id, subscription_id, subscriber_id, channel, status,
            attempt_count
          ) values (
            ${randomUUID()}, ${alertId}, ${subscriptionId}, ${subscriberId},
            'EMAIL', 'PENDING', 0
          )
        `;
        inserted();
        await holdInsert;
      });

      await insertReady;
      const [{ pid }] = await updateClient<{ pid: number }[]>`
        select pg_backend_pid() as pid
      `;
      const updateResult = Promise.resolve(
        updateClient`
          update alerts
          set admission_cycle_id = ${otherCycleId}
          where id = ${alertId}
        `,
      ).then(
        () => undefined,
        (error: unknown) => error,
      );

      const lockDeadline = Date.now() + 2_000;
      let isBlocked = false;
      while (Date.now() < lockDeadline) {
        const [{ blockers }] = await sql<{ blockers: number[] }[]>`
          select pg_blocking_pids(${pid}) as blockers
        `;
        if ((blockers?.length ?? 0) > 0) {
          isBlocked = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      releaseInsert();
      await insertTransaction;
      expect(isBlocked).toBe(true);
      await expect(updateResult).resolves.toMatchObject({ code: "23514" });
    } finally {
      releaseInsert();
      await insertClient.end({ timeout: 5 });
      await updateClient.end({ timeout: 5 });
    }
  });

  it("rejects EventVersion lineage across different Events", async () => {
    const { cycleId } = await createSchoolAndCycle();
    const firstEventId = await createEvent(cycleId);
    const secondEventId = randomUUID();
    const firstVersionId = randomUUID();

    await sql`
      insert into admission_events (
        id, admission_cycle_id, event_key, event_type, occurrence_no,
        canonical_title, importance, actionability, is_public
      ) values (
        ${secondEventId}, ${cycleId}, 'application-extra',
        'ADDITIONAL_RECRUITMENT', 1, 'Additional recruitment', 'HIGH',
        'ACTION_REQUIRED', true
      )
    `;
    await sql`
      insert into admission_event_versions (
        id, admission_event_id, version_no, is_current, verification_status,
        knowledge_state, event_status, display_title, timezone
      ) values (
        ${firstVersionId}, ${firstEventId}, 1, false, 'VERIFIED', 'KNOWN',
        'SCHEDULED', 'Main application', 'Asia/Seoul'
      )
    `;

    await expect(
      sql`
        insert into admission_event_versions (
          id, admission_event_id, version_no, supersedes_version_id,
          is_current, verification_status, knowledge_state, event_status,
          display_title, timezone
        ) values (
          ${randomUUID()}, ${secondEventId}, 1, ${firstVersionId}, false,
          'VERIFIED', 'KNOWN', 'SCHEDULED', 'Additional recruitment',
          'Asia/Seoul'
        )
      `,
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("rejects FactVersion lineage across different Facts", async () => {
    const { cycleId } = await createSchoolAndCycle();
    const firstFactId = await createFact(cycleId);
    const secondFactId = randomUUID();
    const firstVersionId = randomUUID();

    await sql`
      insert into admission_facts (
        id, admission_cycle_id, fact_key, fact_type, scope, is_critical,
        is_public
      ) values (
        ${secondFactId}, ${cycleId}, 'eligibility-extra', 'ELIGIBILITY',
        'CYCLE', true, true
      )
    `;
    await sql`
      insert into admission_fact_versions (
        id, admission_fact_id, version_no, is_current, verification_status,
        knowledge_state, value_kind, value_text, display_value
      ) values (
        ${firstVersionId}, ${firstFactId}, 1, false, 'VERIFIED', 'KNOWN',
        'TEXT', 'Grade 1', 'Grade 1'
      )
    `;

    await expect(
      sql`
        insert into admission_fact_versions (
          id, admission_fact_id, version_no, supersedes_version_id, is_current,
          verification_status, knowledge_state, value_kind, value_text,
          display_value
        ) values (
          ${randomUUID()}, ${secondFactId}, 1, ${firstVersionId}, false,
          'VERIFIED', 'KNOWN', 'TEXT', 'Grade 2', 'Grade 2'
        )
      `,
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("requires monotonic, non-branching EventVersion lineage", async () => {
    const { cycleId } = await createSchoolAndCycle();
    const eventId = await createEvent(cycleId);
    const firstVersionId = randomUUID();
    const secondVersionId = randomUUID();

    await sql`
      insert into admission_event_versions (
        id, admission_event_id, version_no, is_current, verification_status,
        knowledge_state, event_status, display_title, timezone
      ) values (
        ${firstVersionId}, ${eventId}, 5, false, 'SUPERSEDED', 'KNOWN',
        'SCHEDULED', 'Application v5', 'Asia/Seoul'
      )
    `;
    await sql`
      insert into admission_event_versions (
        id, admission_event_id, version_no, supersedes_version_id, is_current,
        verification_status, knowledge_state, event_status, display_title,
        timezone
      ) values (
        ${secondVersionId}, ${eventId}, 6, ${firstVersionId}, true, 'VERIFIED',
        'KNOWN', 'SCHEDULED', 'Application v6', 'Asia/Seoul'
      )
    `;

    await expect(
      sql`
        insert into admission_event_versions (
          id, admission_event_id, version_no, supersedes_version_id,
          is_current, verification_status, knowledge_state, event_status,
          display_title, timezone
        ) values (
          ${randomUUID()}, ${eventId}, 7, ${firstVersionId}, false,
          'VERIFIED', 'KNOWN', 'SCHEDULED', 'Branched application', 'Asia/Seoul'
        )
      `,
    ).rejects.toMatchObject({ code: "23505" });

    await expect(
      sql`
        insert into admission_event_versions (
          id, admission_event_id, version_no, supersedes_version_id,
          is_current, verification_status, knowledge_state, event_status,
          display_title, timezone
        ) values (
          ${randomUUID()}, ${eventId}, 4, ${secondVersionId}, false, 'VERIFIED',
          'KNOWN', 'SCHEDULED', 'Reverse application', 'Asia/Seoul'
        )
      `,
    ).rejects.toMatchObject({ code: "23514" });

    await expect(
      sql`
        update admission_event_versions
        set version_no = 8
        where id = ${firstVersionId}
      `,
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("requires monotonic, non-branching FactVersion lineage", async () => {
    const { cycleId } = await createSchoolAndCycle();
    const factId = await createFact(cycleId);
    const firstVersionId = randomUUID();
    const secondVersionId = randomUUID();

    await sql`
      insert into admission_fact_versions (
        id, admission_fact_id, version_no, is_current, verification_status,
        knowledge_state, value_kind, value_text, display_value
      ) values (
        ${firstVersionId}, ${factId}, 5, false, 'SUPERSEDED', 'KNOWN', 'TEXT',
        'Grade 5', 'Grade 5'
      )
    `;
    await sql`
      insert into admission_fact_versions (
        id, admission_fact_id, version_no, supersedes_version_id, is_current,
        verification_status, knowledge_state, value_kind, value_text,
        display_value
      ) values (
        ${secondVersionId}, ${factId}, 6, ${firstVersionId}, true, 'VERIFIED',
        'KNOWN', 'TEXT', 'Grade 6', 'Grade 6'
      )
    `;

    await expect(
      sql`
        insert into admission_fact_versions (
          id, admission_fact_id, version_no, supersedes_version_id, is_current,
          verification_status, knowledge_state, value_kind, value_text,
          display_value
        ) values (
          ${randomUUID()}, ${factId}, 7, ${firstVersionId}, false, 'VERIFIED',
          'KNOWN', 'TEXT', 'Branched grade', 'Branched grade'
        )
      `,
    ).rejects.toMatchObject({ code: "23505" });

    await expect(
      sql`
        insert into admission_fact_versions (
          id, admission_fact_id, version_no, supersedes_version_id, is_current,
          verification_status, knowledge_state, value_kind, value_text,
          display_value
        ) values (
          ${randomUUID()}, ${factId}, 4, ${secondVersionId}, false, 'VERIFIED',
          'KNOWN', 'TEXT', 'Reverse grade', 'Reverse grade'
        )
      `,
    ).rejects.toMatchObject({ code: "23514" });

    await expect(
      sql`
        update admission_fact_versions
        set version_no = 8
        where id = ${firstVersionId}
      `,
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("rejects self-superseding EventVersions and FactVersions", async () => {
    const { cycleId } = await createSchoolAndCycle();
    const eventId = await createEvent(cycleId);
    const factId = await createFact(cycleId);
    const eventVersionId = randomUUID();
    const factVersionId = randomUUID();

    await expect(
      sql`
        insert into admission_event_versions (
          id, admission_event_id, version_no, supersedes_version_id,
          is_current, verification_status, knowledge_state, event_status,
          display_title, timezone
        ) values (
          ${eventVersionId}, ${eventId}, 1, ${eventVersionId}, false,
          'VERIFIED', 'KNOWN', 'SCHEDULED', 'Application', 'Asia/Seoul'
        )
      `,
    ).rejects.toMatchObject({ code: "23514" });

    await expect(
      sql`
        insert into admission_fact_versions (
          id, admission_fact_id, version_no, supersedes_version_id, is_current,
          verification_status, knowledge_state, value_kind, value_text,
          display_value
        ) values (
          ${factVersionId}, ${factId}, 1, ${factVersionId}, false, 'VERIFIED',
          'KNOWN', 'TEXT', 'Grade 1', 'Grade 1'
        )
      `,
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("rejects current versions marked SUPERSEDED", async () => {
    const { cycleId } = await createSchoolAndCycle();
    const eventId = await createEvent(cycleId);
    const factId = await createFact(cycleId);

    await expect(
      sql`
        insert into admission_event_versions (
          id, admission_event_id, version_no, is_current, verification_status,
          knowledge_state, event_status, display_title, timezone
        ) values (
          ${randomUUID()}, ${eventId}, 1, true, 'SUPERSEDED', 'KNOWN',
          'SCHEDULED', 'Application', 'Asia/Seoul'
        )
      `,
    ).rejects.toMatchObject({ code: "23514" });

    await expect(
      sql`
        insert into admission_fact_versions (
          id, admission_fact_id, version_no, is_current, verification_status,
          knowledge_state, value_kind, value_text, display_value
        ) values (
          ${randomUUID()}, ${factId}, 1, true, 'SUPERSEDED', 'KNOWN', 'TEXT',
          'Grade 1', 'Grade 1'
        )
      `,
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("updates updated_at on direct SQL updates", async () => {
    const { schoolId } = await createSchoolAndCycle();
    const [before] = await sql<{ updated_at: Date }[]>`
      select updated_at from schools where id = ${schoolId}
    `;

    await sql`select pg_sleep(0.01)`;
    const [after] = await sql<{ updated_at: Date }[]>`
      update schools set canonical_name = 'Updated School' where id = ${schoolId}
      returning updated_at
    `;

    expect(after?.updated_at.getTime()).toBeGreaterThan(
      before?.updated_at.getTime() ?? 0,
    );
  });

  it("rejects duplicate monitor configurations for one Source", async () => {
    const sourceId = await createSource();

    await sql`
      insert into source_monitor_configs (
        id, source_id, collection_strategy, monitoring_profile,
        browser_required, max_attempts, is_enabled
      ) values (
        ${randomUUID()}, ${sourceId}, 'HTTP', 'LOW_CHANGE', false, 3, true
      )
    `;

    await expect(
      sql`
        insert into source_monitor_configs (
          id, source_id, collection_strategy, monitoring_profile,
          browser_required, max_attempts, is_enabled
        ) values (
          ${randomUUID()}, ${sourceId}, 'HTTP', 'LOW_CHANGE', false, 3, true
        )
      `,
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("rejects invalid typed Fact values and reversed Event dates", async () => {
    const { cycleId } = await createSchoolAndCycle();
    const factId = await createFact(cycleId);
    const eventId = await createEvent(cycleId);

    await expect(
      sql`
        insert into admission_fact_versions (
          id, admission_fact_id, version_no, is_current, verification_status,
          knowledge_state, value_kind, value_text, value_number, display_value
        ) values (
          ${randomUUID()}, ${factId}, 1, false, 'VERIFIED', 'KNOWN', 'TEXT',
          'Grade 1', 1, 'Grade 1'
        )
      `,
    ).rejects.toMatchObject({ code: "23514" });

    await expect(
      sql`
        insert into admission_event_versions (
          id, admission_event_id, version_no, is_current, verification_status,
          knowledge_state, event_status, display_title, event_start_date,
          event_end_date, timezone
        ) values (
          ${randomUUID()}, ${eventId}, 1, false, 'VERIFIED', 'KNOWN',
          'SCHEDULED', 'Application', '2027-03-02', '2027-03-01', 'Asia/Seoul'
        )
      `,
    ).rejects.toMatchObject({ code: "23514" });
  });
});
