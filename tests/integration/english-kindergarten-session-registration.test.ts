import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { TransactionManager } from "@/src/infrastructure/db/runtime.server";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { migrateDatabase } from "@/src/db/migrate";
import { createAdminCommandContext } from "@/src/application/context";
import {
  getRuntimeDatabase,
  closeRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import { registerEnglishKindergartenSessions as register } from "@/src/modules/english-kindergarten/register-sessions.server";
import {
  sessionPackageSchema,
  packageChecksum,
} from "@/src/modules/english-kindergarten/session-package";
import {
  listInstitutions,
  getInstitutionBySlug,
} from "@/src/modules/public/institution-query.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";
const url = process.env.TEST_DATABASE_URL!;
assertDedicatedTestDatabaseUrl(url);
const runtime = getRuntimeDatabase({
  DATABASE_URL: url,
  NODE_ENV: "test",
  DATABASE_MAX_CONNECTIONS: 4,
});
const prefix = `ek-register-${randomUUID()}`;
const admin = randomUUID();
const campus = randomUUID();
const ctx = createAdminCommandContext({
  adminUserId: admin,
  reason: "CORRECTION_CONTENT_NO_NOTIFY",
});
const future = new Date(Date.now() + 86400000 * 30).toISOString();
const data = sessionPackageSchema.parse({
  schemaVersion: 1,
  packageId: prefix,
  sources: [
    {
      key: "official",
      url: `https://official.example.test/${prefix}`,
      name: "캠퍼스 공식 안내",
      checkedAt: new Date(Date.now() - 60000).toISOString(),
      normalizedText:
        "2027학년도 기관 표기 5세 설명회. 사전예약 마감, 행사는 예정대로 개최.",
    },
  ],
  sessions: [
    {
      institutionSlug: prefix,
      expectedCurrentVersionId: null,
      sessionKey: "official-123",
      academicYear: 2027,
      targetAsPublished: "5세 (2023년생), 7세 제외",
      targetAges: [5],
      eventStartsAt: future,
      applicationClosesAt: null,
      reservationState: "CLOSED",
      note: "5세 설명회 예약이 마감됐어요. 대기 문의는 공식 안내를 확인해 주세요.",
      actionUrl: "https://slp.ac.kr/admission/consultation",
      evidenceKeys: ["official"],
    },
  ],
});
const options = {
  apply: true,
  expectedChecksum: packageChecksum(data),
  cacheConsumersV2Ready: true,
};
describe("audited no-notify session registration", () => {
  it("creates an evidenced new root and replays without duplicates inside an atomic transaction", async () => {
    const fresh = structuredClone(data);
    const slug = prefix + "-new";
    fresh.sessions[0]!.institutionSlug = slug;
    fresh.sources[0]!.url = `https://official.example.test/${prefix}/new`;
    fresh.campuses = [
      {
        slug,
        mode: "CREATE",
        updateAddress: false,
        expectedInstitutionId: null,
        expectedName: null,
        expectedAddress: null,
        name: "새 캠퍼스 " + prefix,
        officialAddress: "서울 양천구 새로운길 123",
        officialRegion: "서울특별시 양천구",
        officialCampusId: { namespace: "official.fixture", value: "123" },
        officialCampusUrl: fresh.sources[0]!.url,
        identityEvidenceKeys: ["official"],
      },
    ];
    const manager: Pick<TransactionManager, "run"> = {
      run: (operation) =>
        runtime.transactionManager.run(async (executor) => {
          const result = await operation(executor);
          expect(result).toMatchObject({
            applied: true,
            createdCampuses: 1,
            changed: 1,
          });
          const evidence = await executor.raw(
            sql`select i.publication_state, c.source_snapshot_id from institutions i join institution_section_coverages c on c.institution_id=i.id where i.slug=${slug}`,
          );
          expect(evidence[0]).toMatchObject({ publication_state: "PUBLISHED" });
          expect(evidence[0]?.source_snapshot_id).not.toBeNull();
          const replay = await register(
            ctx,
            fresh,
            { ...options, expectedChecksum: packageChecksum(fresh) },
            { run: (op) => op(executor) },
          );
          expect(replay.createdCampuses).toBe(0);
          expect(replay.changed).toBe(0);
          throw new Error("ROLLBACK_NEW_ROOT_FIXTURE");
        }),
    };
    await expect(
      register(
        ctx,
        fresh,
        { ...options, expectedChecksum: packageChecksum(fresh) },
        manager,
      ),
    ).rejects.toThrow("ROLLBACK_NEW_ROOT_FIXTURE");
    expect(
      (await runtime.client`select id from institutions where slug=${slug}`)
        .length,
    ).toBe(0);
  });
  beforeAll(async () => {
    await migrateDatabase(url);
    await runtime.client`insert into admin_users(id,external_auth_subject,email,display_name,status) values(${admin},${prefix},${prefix + "@example.test"},'Test Admin','ACTIVE')`;
    await runtime.client`insert into institutions(id,slug,display_name,category,publication_state,operational_state,region_code,district) values(${campus},${prefix},${prefix},'ENGLISH_KINDERGARTEN','PUBLISHED','ACTIVE','KR-11','양천구')`;
  });
  afterAll(async () => {
    await runtime.client.begin(async (tx) => {
      await tx.unsafe("set local session_replication_role=replica");
      await tx`delete from outbox_events where payload::text like ${"%" + campus + "%"} or payload::text like ${"%" + prefix + "%"}`;
      await tx`delete from outbox_events where payload->>'targetId' in(select id::text from opportunities where institution_id=${campus})`;
      await tx`delete from audit_logs where admin_user_id=${admin}`;
      await tx`delete from opportunity_changes where opportunity_id in(select id from opportunities where institution_id=${campus})`;
      await tx`delete from opportunity_version_evidence where opportunity_version_id in(select v.id from opportunity_versions v join opportunities o on o.id=v.opportunity_id where o.institution_id=${campus})`;
      await tx`delete from opportunity_versions where opportunity_id in(select id from opportunities where institution_id=${campus})`;
      await tx`delete from opportunity_source_bindings where opportunity_id in(select id from opportunities where institution_id=${campus})`;
      await tx`delete from opportunities where institution_id=${campus}`;
      await tx`delete from source_observations where source_id in(select id from sources where canonical_url=${data.sources[0]!.url})`;
      await tx`delete from source_snapshots where source_id in(select id from sources where canonical_url=${data.sources[0]!.url})`;
      await tx`delete from sources where canonical_url=${data.sources[0]!.url}`;
      await tx`delete from institutions where id=${campus}`;
      await tx`delete from admin_users where id=${admin}`;
    });
    await closeRuntimeDatabase();
  });
  it("backs up dry-run without writing; rejects missing readiness/checksum", async () => {
    const before = await register(
      ctx,
      data,
      { apply: false, cacheConsumersV2Ready: false },
      runtime.transactionManager,
    );
    expect(before.applied).toBe(false);
    expect(before.before[0]?.operation).toBe("CREATE_SESSION");
    expect(
      (
        await runtime.client`select id from opportunities where institution_id=${campus}`
      ).length,
    ).toBe(0);
    await expect(
      register(
        ctx,
        data,
        { ...options, cacheConsumersV2Ready: false },
        runtime.transactionManager,
      ),
    ).rejects.toThrow();
  });
  it("creates official evidence and only cache events; replay writes nothing", async () => {
    const first = await register(
      ctx,
      data,
      options,
      runtime.transactionManager,
    );
    expect(first.changed).toBe(1);
    const second = await register(
      ctx,
      data,
      options,
      runtime.transactionManager,
    );
    expect(second.changed).toBe(0);
    const events =
      await runtime.client`select event_type from outbox_events where payload::text like ${"%" + (await runtime.client`select id from opportunities where institution_id=${campus}`)[0]!.id + "%"}`;
    expect(events.length).toBe(1);
    expect(events[0]!.event_type).toBe("CACHE_REVALIDATION_REQUESTED");
    const evidence =
      await runtime.client`select e.source_observation_id,e.source_snapshot_id from opportunity_version_evidence e join opportunity_versions v on v.id=e.opportunity_version_id join opportunities o on o.id=v.opportunity_id where o.institution_id=${campus}`;
    expect(evidence[0]!.source_observation_id).not.toBeNull();
    expect(evidence[0]!.source_snapshot_id).not.toBeNull();
  });
  it("matches same-row year/age, includes closed future events and counts sessions", async () => {
    const base = {
      category: "ENGLISH_KINDERGARTEN",
      query: prefix,
      region: "KR-11",
      admissionYear: 2027,
      hasUpcomingInfoSession: true,
      page: 1,
      pageSize: 12,
    };
    const yes = await listInstitutions(runtime.executor, {
      ...base,
      minAge: 5,
    });
    expect(yes.pagination.total).toBe(1);
    expect(yes.matchingSessionCount).toBe(1);
    expect(
      yes.items[0]?.englishKindergarten?.nextInformationSession?.businessState,
    ).toBe("CLOSED");
    const excluded = await listInstitutions(runtime.executor, {
      ...base,
      minAge: 7,
    });
    expect(excluded.pagination.total).toBe(0);
    expect(
      (
        await listInstitutions(runtime.executor, {
          ...base,
          admissionYear: 2028,
          minAge: 5,
        })
      ).pagination.total,
    ).toBe(0);
    const detail = await getInstitutionBySlug(runtime.executor, prefix);
    expect(detail.englishKindergarten?.informationSessions).toHaveLength(1);
  });
  it("rejects evidence-only replacement without refreshing verification", async () => {
    const revised = structuredClone(data);
    revised.sources[0]!.normalizedText += " 새 공식 자료의 추가 문구";
    const result = await register(
      ctx,
      revised,
      { ...options, expectedChecksum: packageChecksum(revised) },
      runtime.transactionManager,
    );
    expect(result.applied).toBe(false);
    expect(result.rejects[0]?.code).toBe("EVIDENCE_ONLY_REVIEW_REQUIRED");
  });
  it("rejects hidden-campus address duplicates before any new root is written", async () => {
    await expect(
      runtime.transactionManager.run(async (executor) => {
        const address = "서울 양천구 중복검사길 123";
        await executor.raw(
          sql`insert into institutions(slug,display_name,category,publication_state,address_line) values(${prefix + "-hidden"},'별도 등록명','ENGLISH_KINDERGARTEN','HIDDEN',${address})`,
        );
        const fresh = structuredClone(data);
        const slug = prefix + "-duplicate";
        fresh.sessions[0]!.institutionSlug = slug;
        fresh.campuses = [
          {
            slug,
            mode: "CREATE",
            updateAddress: false,
            expectedInstitutionId: null,
            expectedName: null,
            expectedAddress: null,
            name: "새로운 브랜드",
            officialAddress: address,
            officialRegion: "서울 양천구",
            officialCampusId: { namespace: "fixture", value: "duplicate" },
            officialCampusUrl: null,
            identityEvidenceKeys: ["official"],
          },
        ];
        const result = await register(
          ctx,
          fresh,
          { ...options, expectedChecksum: packageChecksum(fresh) },
          { run: (op) => op(executor) },
        );
        expect(result.applied).toBe(false);
        expect(
          result.rejects.some(
            (r) => r.code === "CAMPUS_DUPLICATE_OR_IDENTITY_REVIEW_REQUIRED",
          ),
        ).toBe(true);
        expect(
          (
            await executor.raw(
              sql`select id from institutions where slug=${slug}`,
            )
          ).length,
        ).toBe(0);
        throw new Error("ROLLBACK_HIDDEN_FIXTURE");
      }),
    ).rejects.toThrow("ROLLBACK_HIDDEN_FIXTURE");
  });
  it("preserves legacy name, searches the verified brand and versions the reviewed address correction", async () => {
    await expect(
      runtime.transactionManager.run(async (executor) => {
        const fresh = structuredClone(data);
        const brand = "ECC 현재브랜드 " + prefix;
        fresh.sessions[0]!.sessionKey = "brand-link";
        fresh.sessions[0]!.eventStartsAt = new Date(
          new Date(future).getTime() + 86400000 * 5,
        ).toISOString();
        fresh.campuses = [
          {
            slug: prefix,
            mode: "EXISTING",
            updateAddress: true,
            expectedInstitutionId: campus,
            expectedName: prefix,
            expectedAddress: null,
            name: brand,
            officialAddress: "서울 양천구 공식주소길 123",
            officialRegion: "서울특별시 양천구",
            officialCampusId: { namespace: "fixture", value: "brand" },
            officialCampusUrl: null,
            identityEvidenceKeys: ["official"],
          },
        ];
        const opts = { ...options, expectedChecksum: packageChecksum(fresh) };
        const first = await register(ctx, fresh, opts, {
          run: (op) => op(executor),
        });
        expect(first.updatedCampuses).toBe(1);
        const found = await listInstitutions(executor, {
          category: "ENGLISH_KINDERGARTEN",
          query: brand,
          minAge: 5,
          admissionYear: 2027,
          hasUpcomingInfoSession: true,
          page: 1,
          pageSize: 12,
        });
        expect(found.items[0]?.name).toBe(prefix);
        expect(found.items[0]?.address).toBe(
          fresh.campuses[0]!.officialAddress,
        );
        const second = await register(ctx, fresh, opts, {
          run: (op) => op(executor),
        });
        expect(second.changed).toBe(0);
        expect(second.updatedCampuses).toBe(0);
        throw new Error("ROLLBACK_BRAND_FIXTURE");
      }),
    ).rejects.toThrow("ROLLBACK_BRAND_FIXTURE");
  });
  it("does not mutate or append notification events while preserving an existing pending queue item", async () => {
    await expect(
      runtime.transactionManager.run(async (executor) => {
        const marker = randomUUID();
        await executor.raw(
          sql`insert into outbox_events(id,event_type,aggregate_type,aggregate_id,payload,status) values(${marker},'NOTIFICATION_REQUESTED','USER',${randomUUID()},${JSON.stringify({ sentinel: prefix })}::jsonb,'PENDING')`,
        );
        const before = await executor.raw(
          sql`select row_to_json(outbox_events) as value from outbox_events where id=${marker}`,
        );
        const countBefore = await executor.raw(
          sql`select count(*)::int as n from outbox_events where event_type<>'CACHE_REVALIDATION_REQUESTED'`,
        );
        const fresh = structuredClone(data);
        fresh.sessions[0]!.sessionKey = "queue-preservation";
        fresh.sessions[0]!.eventStartsAt = new Date(
          new Date(future).getTime() + 86400000 * 6,
        ).toISOString();
        const result = await register(
          ctx,
          fresh,
          { ...options, expectedChecksum: packageChecksum(fresh) },
          { run: (op) => op(executor) },
        );
        expect(result.changed).toBe(1);
        const after = await executor.raw(
          sql`select row_to_json(outbox_events) as value from outbox_events where id=${marker}`,
        );
        expect(after).toEqual(before);
        expect(
          await executor.raw(
            sql`select count(*)::int as n from outbox_events where event_type<>'CACHE_REVALIDATION_REQUESTED'`,
          ),
        ).toEqual(countBefore);
        throw new Error("ROLLBACK_QUEUE_FIXTURE");
      }),
    ).rejects.toThrow("ROLLBACK_QUEUE_FIXTURE");
  });
  it("changes the date as a new version without duplicating the session; rejects stale writes", async () => {
    const [current] =
      await runtime.client`select v.id from opportunity_versions v join opportunities o on o.id=v.opportunity_id where o.institution_id=${campus} and v.is_current=true`;
    const moved = structuredClone(data);
    moved.sessions[0]!.expectedCurrentVersionId = current!.id;
    moved.sessions[0]!.eventStartsAt = new Date(
      new Date(future).getTime() + 86400000,
    ).toISOString();
    expect(
      (
        await register(
          createAdminCommandContext({ adminUserId: admin }),
          moved,
          { ...options, expectedChecksum: packageChecksum(moved) },
          runtime.transactionManager,
        )
      ).changed,
    ).toBe(1);
    expect(
      (
        await runtime.client`select id from opportunities where institution_id=${campus}`
      ).length,
    ).toBe(1);
    await expect(
      register(ctx, data, options, runtime.transactionManager),
    ).rejects.toThrow();
  });
  it("rejects unmapped campuses atomically", async () => {
    const invalid = structuredClone(data);
    invalid.sessions[0]!.institutionSlug = prefix + "-missing";
    const result = await register(
      ctx,
      invalid,
      { ...options, expectedChecksum: packageChecksum(invalid) },
      runtime.transactionManager,
    );
    expect(result.applied).toBe(false);
    expect(result.rejects[0]?.code).toBe(
      "CAMPUS_MAPPING_OR_PUBLICATION_REQUIRED",
    );
  });
});
