import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { NotFoundError } from "@/src/application/errors";
import { migrateDatabase } from "@/src/db/migrate";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
  type DatabaseExecutor,
} from "@/src/infrastructure/db/runtime.server";
import { getMonitoringQueue } from "@/src/modules/monitoring/queue-query.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL must be set");
assertDedicatedTestDatabaseUrl(databaseUrl);

const runtime = getRuntimeDatabase({
  DATABASE_URL: databaseUrl,
  DATABASE_MAX_CONNECTIONS: 4,
  NODE_ENV: "test",
});
const schemaLockSql = postgres(databaseUrl, { max: 1 });
const prefix = `wp11-monitoring-${randomUUID()}`;
const now = new Date("2026-08-24T12:00:00.000Z");

type MonitoringQueryModule = Readonly<{
  listAdminMonitoringQueue: (
    rawInput: unknown,
    dependencies: Readonly<{ executor: DatabaseExecutor; now: Date }>,
  ) => Promise<{
    items: readonly {
      bindingId: string;
      targetType: string;
      targetId: string;
      detailHref: string;
      source: { id: string };
      dueState: string;
    }[];
    pageSize: number;
    hasNext: boolean;
    nextCursor: string | null;
  }>;
}>;

type MonitoringDetailModule = Readonly<{
  getAdminMonitoringDetail: (
    executor: DatabaseExecutor,
    rawInput: unknown,
    options: Readonly<{ now: Date }>,
  ) => Promise<Record<string, unknown>>;
}>;

async function importMonitoringQuery(): Promise<MonitoringQueryModule | null> {
  try {
    return (await vi.importActual(
      "@/src/modules/admin/read-model/monitoring-query.server",
    )) as MonitoringQueryModule;
  } catch {
    return null;
  }
}

async function importMonitoringDetail(): Promise<MonitoringDetailModule | null> {
  try {
    return (await vi.importActual(
      "@/src/modules/admin/read-model/monitoring-detail-query.server",
    )) as MonitoringDetailModule;
  } catch {
    return null;
  }
}

async function inRolledBackTransaction<T>(
  operation: (executor: DatabaseExecutor) => Promise<T>,
): Promise<T> {
  const rollback = new Error("WP-11 monitoring test rollback");
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
  if (!completed) throw new Error("WP-11 monitoring test did not complete");
  return result as T;
}

async function persistenceFingerprint(
  executor: DatabaseExecutor,
): Promise<string> {
  const rows = (await executor.raw(sql`
    select concat_ws('|',
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from institution_source_bindings item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from opportunity_source_bindings item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from opportunity_versions item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from institution_fact_versions item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from source_observations item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from audit_logs item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from outbox_events item)
    ) as fingerprint
  `)) as unknown as Array<{ fingerprint: string }>;
  return rows[0]!.fingerprint;
}

async function insertInstitution(
  executor: DatabaseExecutor,
  label: string,
): Promise<string> {
  const id = randomUUID();
  await executor.raw(sql`
    insert into institutions (
      id, slug, display_name, category, operational_state, publication_state
    ) values (
      ${id}, ${`${prefix}-${label}-${id}`}, ${`${prefix} ${label}`},
      'INTERNATIONAL_SCHOOL', 'ACTIVE', 'PUBLISHED'
    )
  `);
  return id;
}

async function insertSource(
  executor: DatabaseExecutor,
  label: string,
  canonicalUrl = `https://official.example.test/${prefix}/${label}`,
): Promise<string> {
  const id = randomUUID();
  await executor.raw(sql`
    insert into sources (
      id, canonical_url, source_type, authority_level, lifecycle_status,
      source_name
    ) values (
      ${id}, ${canonicalUrl}, 'OFFICIAL_ADMISSION_PAGE', 'PRIMARY',
      'ACTIVE', ${`${prefix} ${label} source`}
    )
  `);
  await executor.raw(sql`
    insert into source_monitor_configs (
      source_id, collection_strategy, monitoring_profile,
      custom_interval_minutes, is_enabled
    ) values (${id}, 'HTTP', 'CRITICAL_SEASONAL', 60, true)
  `);
  return id;
}

async function insertNativeOpportunity(
  executor: DatabaseExecutor,
  institutionId: string,
  label: string,
): Promise<{ id: string; versionId: string }> {
  const id = randomUUID();
  const versionId = randomUUID();
  await executor.raw(sql`
    insert into opportunities (
      id, institution_id, slug, kind, truth_mode, publication_state
    ) values (
      ${id}, ${institutionId}, ${`${prefix}-${label}-${id}`},
      'APPLICATION', 'NATIVE', 'PUBLISHED'
    )
  `);
  await executor.raw(sql`
    insert into opportunity_versions (
      id, opportunity_id, version_number, verification_state,
      business_state, is_current, title, summary, target_audience, verified_at,
      application_open_at, application_close_at
    ) values (
      ${versionId}, ${id}, 1, 'VERIFIED', 'OPEN', true,
      ${`${prefix} ${label} admissions`}, 'Minimum canonical summary', 'Families',
      '2026-08-20T00:00:00.000Z', '2026-08-01T00:00:00.000Z',
      '2026-09-01T00:00:00.000Z'
    )
  `);
  return { id, versionId };
}

beforeAll(async () => {
  await schemaLockSql`select pg_advisory_lock(77411008)`;
  try {
    await migrateDatabase(databaseUrl);
  } finally {
    await schemaLockSql`select pg_advisory_unlock(77411008)`;
  }
});

afterAll(async () => {
  await closeRuntimeDatabase();
  await schemaLockSql.end();
});

describe("WP-11 Admin Monitoring read projections", () => {
  it("delegates canonical filters and preserves WP-10B order while coordinate-owning links", async () => {
    // Mutation caught: the Admin projection re-sorts rows or trusts the opaque binding display key in its detail URL.
    const query = await importMonitoringQuery();
    expect(query).not.toBeNull();
    if (!query) return;

    await inRolledBackTransaction(async (executor) => {
      const institutionId = await insertInstitution(executor, "queue");
      const institutionSourceId = await insertSource(executor, "institution");
      const opportunitySourceId = await insertSource(executor, "opportunity");
      const opportunity = await insertNativeOpportunity(
        executor,
        institutionId,
        "queue",
      );
      await executor.raw(sql`
        insert into institution_source_bindings (
          institution_id, source_id, role, is_primary, is_active
        ) values (${institutionId}, ${institutionSourceId}, 'OFFICIAL_MAIN', true, true)
      `);
      await executor.raw(sql`
        insert into opportunity_source_bindings (
          opportunity_id, source_id, role, is_primary, is_active
        ) values (${opportunity.id}, ${opportunitySourceId}, 'PRIMARY_NOTICE', true, true)
      `);

      const filter = {
        dueState: ["DUE", "OVERDUE"],
        targetType: ["INSTITUTION", "OPPORTUNITY"],
      };
      const canonical = await getMonitoringQueue(filter, { executor, now });
      const projected = await query.listAdminMonitoringQueue(filter, {
        executor,
        now,
      });
      const canonicalOurs = canonical.filter(
        (row) => row.institution.id === institutionId,
      );
      const projectedOurs = projected.items.filter(
        (row) =>
          row.targetId === institutionId || row.targetId === opportunity.id,
      );

      expect(projectedOurs.map((row) => row.bindingId)).toEqual(
        canonicalOurs.map((row) => row.bindingId),
      );
      expect(projectedOurs.map((row) => row.detailHref)).toEqual(
        projectedOurs.map(
          (row) =>
            `/admin/monitoring/${row.targetType}/${row.targetId}/${row.source.id}/${
              row.targetType === "INSTITUTION"
                ? "OFFICIAL_MAIN"
                : "PRIMARY_NOTICE"
            }`,
        ),
      );
      expect(
        projectedOurs.every((row) => !row.detailHref.includes(row.bindingId)),
      ).toBe(true);
    });
  });

  it("reconstructs an exact active Native binding and exposes only the exact current token", async () => {
    // Mutation caught: route coordinates can be mixed, an inactive binding is accepted, or a stale/version-adjacent ID is returned.
    const detailQuery = await importMonitoringDetail();
    expect(detailQuery).not.toBeNull();
    if (!detailQuery) return;

    await inRolledBackTransaction(async (executor) => {
      const institutionId = await insertInstitution(executor, "native");
      const sourceId = await insertSource(executor, "native");
      const otherSourceId = await insertSource(executor, "other");
      const opportunity = await insertNativeOpportunity(
        executor,
        institutionId,
        "native",
      );
      await executor.raw(sql`
        insert into opportunity_source_bindings (
          opportunity_id, source_id, role, is_primary, is_active, unbound_at
        ) values
          (${opportunity.id}, ${sourceId}, 'PRIMARY_NOTICE', true, true, null),
          (${opportunity.id}, ${otherSourceId}, 'SUPPORTING', false, false, now())
      `);
      await executor.raw(sql`
        insert into source_observations (
          source_id, observed_at, outcome, http_status, error_message
        ) values (
          ${sourceId}, '2026-08-24T10:00:00.000Z', 'CHANGED', 200,
          ${`${prefix}-raw-error-message-must-not-leak`}
        )
      `);

      const before = await persistenceFingerprint(executor);
      const detail = await detailQuery.getAdminMonitoringDetail(
        executor,
        {
          targetType: "OPPORTUNITY",
          targetId: opportunity.id,
          sourceId,
          role: "PRIMARY_NOTICE",
        },
        { now },
      );
      const canonicalSchedule = (
        await getMonitoringQueue(
          { targetType: ["OPPORTUNITY"], role: ["PRIMARY_NOTICE"] },
          { executor, now },
        )
      ).find(
        (row) => row.targetId === opportunity.id && row.source.id === sourceId,
      );
      expect(await persistenceFingerprint(executor)).toBe(before);
      expect(detail).toMatchObject({
        kind: "OPPORTUNITY_NATIVE",
        expectedCurrentVersionId: opportunity.versionId,
        binding: {
          targetType: "OPPORTUNITY",
          targetId: opportunity.id,
          sourceId,
          role: "PRIMARY_NOTICE",
          isPrimary: true,
        },
        currentTruth: {
          versionId: opportunity.versionId,
          businessState: "OPEN",
          title: `${prefix} native admissions`,
          targetAudience: "Families",
        },
        latestObservation: {
          outcome: "CHANGED",
          httpStatus: 200,
        },
      });
      expect(JSON.stringify(detail)).not.toContain(
        "raw-error-message-must-not-leak",
      );
      expect(JSON.stringify(detail)).not.toContain("snapshot");
      expect(JSON.stringify(detail)).not.toContain("evidence");
      expect(detail.schedule).toEqual({
        priority: canonicalSchedule!.priority,
        dueState: canonicalSchedule!.dueState,
        dueReason: canonicalSchedule!.dueReason,
        lastCheckedAt: canonicalSchedule!.lastCheckedAt,
        nextDueAt: canonicalSchedule!.nextDueAt,
      });

      for (const invalid of [
        {
          targetType: "INSTITUTION",
          targetId: institutionId,
          sourceId,
          role: "OFFICIAL_MAIN",
        },
        {
          targetType: "OPPORTUNITY",
          targetId: opportunity.id,
          sourceId: otherSourceId,
          role: "SUPPORTING",
        },
      ]) {
        await expect(
          detailQuery.getAdminMonitoringDetail(executor, invalid, { now }),
        ).rejects.toBeInstanceOf(NotFoundError);
      }
    });
  });

  it("loads bounded Institution facts with a nullable token for every canonical fact type", async () => {
    // Mutation caught: Institution Fact creation loses its null token, current Fact token is guessed, or value_json/raw Source data leaks.
    const detailQuery = await importMonitoringDetail();
    expect(detailQuery).not.toBeNull();
    if (!detailQuery) return;

    await inRolledBackTransaction(async (executor) => {
      const institutionId = await insertInstitution(executor, "facts");
      const sourceId = await insertSource(executor, "facts");
      const factId = randomUUID();
      const factVersionId = randomUUID();
      await executor.raw(sql`
        insert into institution_source_bindings (
          institution_id, source_id, role, is_primary, is_active
        ) values (${institutionId}, ${sourceId}, 'TUITION', false, true)
      `);
      await executor.raw(sql`
        insert into institution_facts (id, institution_id, fact_type)
        values (${factId}, ${institutionId}, 'TUITION')
      `);
      await executor.raw(sql`
        insert into institution_fact_versions (
          id, institution_fact_id, version_number, verification_state,
          is_current, value_json, display_text, verified_at
        ) values (
          ${factVersionId}, ${factId}, 1, 'VERIFIED', true,
          ${JSON.stringify({ privateAmount: 999999 })}::jsonb,
          'Tuition confirmed by official notice', '2026-08-23T00:00:00.000Z'
        )
      `);

      const detail = await detailQuery.getAdminMonitoringDetail(
        executor,
        {
          targetType: "INSTITUTION",
          targetId: institutionId,
          sourceId,
          role: "TUITION",
        },
        { now },
      );
      expect(detail).toMatchObject({
        kind: "INSTITUTION",
        expectedCurrentVersionId: null,
      });
      const facts = detail.facts as Array<Record<string, unknown>>;
      expect(facts).toHaveLength(7);
      expect(facts.find((fact) => fact.factType === "TUITION")).toEqual({
        factType: "TUITION",
        expectedCurrentVersionId: factVersionId,
        current: {
          versionId: factVersionId,
          versionNumber: 1,
          displayText: "Tuition confirmed by official notice",
          verifiedAt: "2026-08-23T00:00:00.000Z",
          validFrom: null,
          validUntil: null,
        },
      });
      expect(
        facts.find((fact) => fact.factType === "CURRICULUM"),
      ).toMatchObject({
        factType: "CURRICULUM",
        expectedCurrentVersionId: null,
        current: null,
      });
      expect(JSON.stringify(detail)).not.toContain("privateAmount");
    });
  });

  it("returns a discriminated Legacy current token and strips an unsafe canonical action URL", async () => {
    // Mutation caught: Legacy truth is read from Native versions, its exact event-version token is lost, or an unsafe action URL is exposed.
    const detailQuery = await importMonitoringDetail();
    expect(detailQuery).not.toBeNull();
    if (!detailQuery) return;

    await inRolledBackTransaction(async (executor) => {
      const institutionId = await insertInstitution(executor, "legacy");
      const sourceId = await insertSource(executor, "legacy");
      const schoolId = randomUUID();
      const cycleId = randomUUID();
      const eventId = randomUUID();
      const eventVersionId = randomUUID();
      const opportunityId = randomUUID();
      await executor.raw(sql`
        insert into schools (
          id, slug, canonical_name, school_type, lifecycle_status
        ) values (
          ${schoolId}, ${`${prefix}-legacy-school-${schoolId}`},
          ${`${prefix} Legacy School`}, 'INTERNATIONAL_SCHOOL', 'ACTIVE'
        )
      `);
      await executor.raw(sql`
        insert into institution_school_links (
          institution_id, school_id, link_reason
        ) values (${institutionId}, ${schoolId}, ${prefix})
      `);
      await executor.raw(sql`
        insert into admission_cycles (
          id, school_id, academic_year, lifecycle_status, admission_mode
        ) values (${cycleId}, ${schoolId}, 2027, 'ACTIVE', 'FIXED_WINDOW')
      `);
      await executor.raw(sql`
        insert into admission_events (
          id, admission_cycle_id, event_key, event_type, canonical_title,
          importance, actionability, is_public
        ) values (
          ${eventId}, ${cycleId}, ${`${prefix}-legacy-event-${eventId}`},
          'APPLICATION', '2027 Application', 'HIGH', 'ACTION_REQUIRED', true
        )
      `);
      await executor.raw(sql`
        insert into admission_event_versions (
          id, admission_event_id, version_no, is_current,
          verification_status, knowledge_state, event_status, display_title,
          event_start_time, event_end_time, registration_open_date,
          registration_open_time, registration_close_date,
          registration_close_time, timezone,
          action_url, official_notes, verified_at
        ) values (
          ${eventVersionId}, ${eventId}, 3, true, 'VERIFIED', 'KNOWN',
          'ACTIVE', '2027 Legacy Application', '09:00:00', '18:00:00',
          '2026-08-01', '09:00:00', '2026-08-31', '18:00:00', 'Asia/Seoul',
          'javascript:alert(1)',
          ${`${prefix}-official-notes-must-not-leak`},
          '2026-08-23T00:00:00.000Z'
        )
      `);
      await executor.raw(sql`
        insert into opportunities (
          id, institution_id, slug, kind, truth_mode, publication_state
        ) values (
          ${opportunityId}, ${institutionId}, ${`${prefix}-legacy-${opportunityId}`},
          'APPLICATION', 'LEGACY_BACKED', 'PUBLISHED'
        )
      `);
      await executor.raw(sql`
        insert into opportunity_admission_event_links (
          opportunity_id, institution_id, truth_mode, admission_event_id,
          admission_cycle_id, school_id
        ) values (
          ${opportunityId}, ${institutionId}, 'LEGACY_BACKED', ${eventId},
          ${cycleId}, ${schoolId}
        )
      `);
      await executor.raw(sql`
        insert into opportunity_source_bindings (
          opportunity_id, source_id, role, is_primary, is_active
        ) values (${opportunityId}, ${sourceId}, 'PRIMARY_NOTICE', true, true)
      `);

      const detail = await detailQuery.getAdminMonitoringDetail(
        executor,
        {
          targetType: "OPPORTUNITY",
          targetId: opportunityId,
          sourceId,
          role: "PRIMARY_NOTICE",
        },
        { now },
      );
      expect(detail).toMatchObject({
        kind: "OPPORTUNITY_LEGACY",
        expectedCurrentVersionId: eventVersionId,
        currentTruth: {
          versionId: eventVersionId,
          versionNumber: 3,
          eventStatus: "ACTIVE",
          displayTitle: "2027 Legacy Application",
          eventStartTime: "09:00:00",
          eventEndTime: "18:00:00",
          registrationOpenTime: "09:00:00",
          registrationCloseTime: "18:00:00",
          actionUrl: null,
        },
      });
      expect(JSON.stringify(detail)).not.toContain(
        "official-notes-must-not-leak",
      );
    });
  });

  it("rejects unsafe official Source URLs instead of rendering an active binding", async () => {
    // Mutation caught: a javascript/data URL stored in Source identity reaches the Monitoring detail official link.
    const detailQuery = await importMonitoringDetail();
    expect(detailQuery).not.toBeNull();
    if (!detailQuery) return;

    await inRolledBackTransaction(async (executor) => {
      const institutionId = await insertInstitution(executor, "unsafe");
      const sourceId = await insertSource(
        executor,
        "unsafe",
        "javascript:alert(1)",
      );
      await executor.raw(sql`
        insert into institution_source_bindings (
          institution_id, source_id, role, is_primary, is_active
        ) values (${institutionId}, ${sourceId}, 'OFFICIAL_MAIN', true, true)
      `);

      await expect(
        detailQuery.getAdminMonitoringDetail(
          executor,
          {
            targetType: "INSTITUTION",
            targetId: institutionId,
            sourceId,
            role: "OFFICIAL_MAIN",
          },
          { now },
        ),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  it("keeps exact detail ownership bounded with many active same-role bindings", async () => {
    // Mutation caught: the exact target/source predicates are removed or support truth expands from one target to the entire same-role queue.
    const detailQuery = await importMonitoringDetail();
    expect(detailQuery).not.toBeNull();
    if (!detailQuery) return;

    await inRolledBackTransaction(async (executor) => {
      const institutionId = await insertInstitution(executor, "bounded-target");
      const sourceId = await insertSource(executor, "bounded-target");
      await executor.raw(sql`
        insert into institution_source_bindings (
          institution_id, source_id, role, is_primary, is_active
        ) values (${institutionId}, ${sourceId}, 'OFFICIAL_MAIN', true, true)
      `);

      for (let index = 0; index < 55; index += 1) {
        const decoyInstitutionId = await insertInstitution(
          executor,
          `bounded-decoy-${index}`,
        );
        const decoySourceId = await insertSource(
          executor,
          `bounded-decoy-${index}`,
        );
        await executor.raw(sql`
          insert into institution_source_bindings (
            institution_id, source_id, role, is_primary, is_active
          ) values (
            ${decoyInstitutionId}, ${decoySourceId}, 'OFFICIAL_MAIN', true, true
          )
        `);
      }

      const before = await persistenceFingerprint(executor);
      const detail = await detailQuery.getAdminMonitoringDetail(
        executor,
        {
          targetType: "INSTITUTION",
          targetId: institutionId,
          sourceId,
          role: "OFFICIAL_MAIN",
        },
        { now },
      );
      expect(await persistenceFingerprint(executor)).toBe(before);
      expect(detail).toMatchObject({
        kind: "INSTITUTION",
        binding: { targetId: institutionId, sourceId, role: "OFFICIAL_MAIN" },
      });
      expect(JSON.stringify(detail)).not.toContain("bounded-decoy");
    });
  });

  it("pages a globally ordered queue through bounded candidate batches without omissions", async () => {
    // Mutation caught: Admin queue paging materializes all rows, sorts only within coordinate batches, or cursor paging duplicates/skips a comparator tie.
    const query = await importMonitoringQuery();
    expect(query).not.toBeNull();
    if (!query) return;
    const queueModule = (await vi.importActual(
      "@/src/modules/monitoring/queue-query.server",
    )) as {
      iterateMonitoringQueueBatches: (
        dependencies: Readonly<{ executor: DatabaseExecutor; now: Date }>,
      ) => AsyncIterable<readonly { bindingId: string }[]>;
    };

    await inRolledBackTransaction(async (executor) => {
      await executor.raw(sql`
        update institution_source_bindings
        set is_active = false, unbound_at = coalesce(unbound_at, now())
        where is_active = true
      `);
      await executor.raw(sql`
        update opportunity_source_bindings
        set is_active = false, unbound_at = coalesce(unbound_at, now())
        where is_active = true
      `);

      for (let index = 0; index < 67; index += 1) {
        const suffix = index.toString(16).padStart(12, "0");
        const institutionId = `10000000-0000-4000-8000-${suffix}`;
        const sourceId = `20000000-0000-4000-8000-${suffix}`;
        const state = index % 4;
        await executor.raw(sql`
          insert into institutions (
            id, slug, display_name, category, operational_state,
            publication_state
          ) values (
            ${institutionId}, ${`${prefix}-page-${index}`},
            ${`${prefix} Page ${index}`}, 'INTERNATIONAL_SCHOOL',
            'ACTIVE', 'PUBLISHED'
          )
        `);
        await executor.raw(sql`
          insert into sources (
            id, canonical_url, source_type, authority_level,
            lifecycle_status, source_name
          ) values (
            ${sourceId}, ${`https://page.example.test/${prefix}/${index}`},
            'OFFICIAL_SCHOOL_PAGE', 'PRIMARY', 'ACTIVE',
            ${`${prefix} Page Source ${index}`}
          )
        `);
        await executor.raw(sql`
          insert into source_monitor_configs (
            source_id, collection_strategy, monitoring_profile,
            custom_interval_minutes, is_enabled
          ) values (
            ${sourceId}, ${state === 3 ? "MANUAL" : "HTTP"},
            ${state === 3 ? "MANUAL" : "LOW_CHANGE"}, 60, true
          )
        `);
        await executor.raw(sql`
          insert into institution_source_bindings (
            institution_id, source_id, role, is_primary, is_active
          ) values (
            ${institutionId}, ${sourceId}, 'CURRICULUM', false, true
          )
        `);
        if (state === 0 || state === 2) {
          await executor.raw(sql`
            insert into source_observations (source_id, observed_at, outcome)
            values (
              ${sourceId},
              ${
                state === 0
                  ? "2026-08-20T00:00:00.000Z"
                  : "2026-08-24T11:30:00.000Z"
              },
              'UNCHANGED'
            )
          `);
        }
      }

      const batchSizes: number[] = [];
      for await (const batch of queueModule.iterateMonitoringQueueBatches({
        executor,
        now,
      })) {
        batchSizes.push(batch.length);
      }
      expect(batchSizes).toEqual([50, 17]);
      expect(Math.max(...batchSizes)).toBeLessThanOrEqual(50);

      const filter = {
        targetType: ["INSTITUTION"],
        role: ["CURRICULUM"],
        sourceLifecycle: ["ACTIVE"],
      };
      const canonical = await getMonitoringQueue(filter, { executor, now });
      expect(canonical).toHaveLength(67);

      const first = await query.listAdminMonitoringQueue(
        { ...filter, pageSize: "50" },
        { executor, now },
      );
      expect(first.items).toHaveLength(50);
      expect(first.hasNext).toBe(true);
      expect(first.nextCursor).toEqual(expect.any(String));
      expect(first.nextCursor).not.toContain(first.items.at(-1)!.targetId);

      const second = await query.listAdminMonitoringQueue(
        { ...filter, pageSize: "50", cursor: first.nextCursor },
        { executor, now },
      );
      expect(second.items).toHaveLength(17);
      expect(second.hasNext).toBe(false);
      expect(second.nextCursor).toBeNull();

      const combined = [...first.items, ...second.items].map(
        (row) => row.bindingId,
      );
      expect(combined).toEqual(canonical.map((row) => row.bindingId));
      expect(new Set(combined).size).toBe(combined.length);
      expect(
        [...first.items, ...second.items].map((row) => row.dueState),
      ).toEqual([
        ...Array(17).fill("OVERDUE"),
        ...Array(17).fill("DUE"),
        ...Array(17).fill("UPCOMING"),
        ...Array(16).fill("MANUAL"),
      ]);
    });
  });
});
