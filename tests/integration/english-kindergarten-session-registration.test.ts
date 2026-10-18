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
  getCurrentInformationSessionCards,
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
      await tx`delete from english_session_identities where opportunity_id in(select id from opportunities where institution_id=${campus})`;
      await tx`delete from opportunity_versions where opportunity_id in(select id from opportunities where institution_id=${campus})`;
      await tx`delete from opportunity_source_bindings where opportunity_id in(select id from opportunities where institution_id=${campus})`;
      await tx`delete from opportunities where institution_id=${campus}`;
      await tx`delete from source_observations where source_id in(select id from sources where canonical_url=${data.sources[0]!.url})`;
      await tx`delete from source_snapshots where source_id in(select id from sources where canonical_url=${data.sources[0]!.url})`;
      await tx`delete from sources where canonical_url=${data.sources[0]!.url}`;
      await tx`delete from english_campus_aliases where institution_id=${campus}`;
      await tx`delete from english_campus_identities where institution_id=${campus}`;
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
    expect(second.before[0]?.publicationState).toBe("PUBLISHED");
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

  it.each(["DRAFT", "HIDDEN", "ARCHIVED"] as const)(
    "rejects %s sessions with or without a current version",
    async (state) => {
      for (const withVersion of [false, true])
        await expect(
          runtime.transactionManager.run(async (executor) => {
            const fresh = structuredClone(data);
            fresh.sessions[0]!.sessionKey = `publication-${state.toLowerCase()}-${withVersion}`;
            fresh.sessions[0]!.eventStartsAt = new Date(
              new Date(future).getTime() + 86400000 * 12,
            ).toISOString();
            const opts = {
              ...options,
              expectedChecksum: packageChecksum(fresh),
            };
            const manager = {
              run: <T>(
                op: Parameters<typeof runtime.transactionManager.run<T>>[0],
              ) => op(executor),
            };
            if (withVersion) await register(ctx, fresh, opts, manager);
            else
              await executor.raw(
                sql`insert into opportunities(institution_id,slug,kind,truth_mode,publication_state) values(${campus},${`${prefix}-briefing-2027-${fresh.sessions[0]!.sessionKey}`},'INFORMATION_SESSION','NATIVE','PUBLISHED')`,
              );
            await executor.raw(
              sql`update opportunities set publication_state=${state} where slug=${`${prefix}-briefing-2027-${fresh.sessions[0]!.sessionKey}`}`,
            );
            const before = await executor.raw(
              sql`select row_to_json(v) as value from opportunity_versions v join opportunities o on o.id=v.opportunity_id where o.slug=${`${prefix}-briefing-2027-${fresh.sessions[0]!.sessionKey}`}`,
            );
            const result = await register(ctx, fresh, opts, manager);
            expect(result.applied).toBe(false);
            expect(result.rejects[0]?.code).toBe(
              "EXISTING_SESSION_PUBLICATION_RECONCILIATION_REQUIRED",
            );
            expect(result.before[0]?.publicationState).toBe(state);
            expect(
              await executor.raw(
                sql`select row_to_json(v) as value from opportunity_versions v join opportunities o on o.id=v.opportunity_id where o.slug=${`${prefix}-briefing-2027-${fresh.sessions[0]!.sessionKey}`}`,
              ),
            ).toEqual(before);
            throw new Error("ROLLBACK_PUBLICATION");
          }),
        ).rejects.toThrow("ROLLBACK_PUBLICATION");
    },
  );
  it("rejects copied keys before writes and consistently replays distinct simultaneous official sessions", async () => {
    const duplicate = structuredClone(data);
    duplicate.sessions.push({
      ...duplicate.sessions[0]!,
      sessionKey: "copied-key",
    });
    expect(sessionPackageSchema.safeParse(duplicate).success).toBe(false);
    const officialDuplicate = structuredClone(duplicate);
    for (const row of officialDuplicate.sessions)
      row.officialSessionId = { namespace: "fixture", value: "same-event" };
    officialDuplicate.sessions[1]!.eventStartsAt = new Date(
      new Date(future).getTime() + 86400000,
    ).toISOString();
    officialDuplicate.sessions[1]!.note = "Changed booking copy";
    expect(sessionPackageSchema.safeParse(officialDuplicate).success).toBe(
      false,
    );
    await expect(
      runtime.transactionManager.run(async (executor) => {
        const fresh = structuredClone(data);
        fresh.sessions[0]!.sessionKey = "simultaneous-one";
        fresh.sessions[0]!.eventStartsAt = new Date(
          new Date(future).getTime() + 86400000 * 13,
        ).toISOString();
        fresh.sessions[0]!.officialSessionId = {
          namespace: "fixture",
          value: "one",
        };
        fresh.sessions.push({
          ...fresh.sessions[0]!,
          sessionKey: "simultaneous-two",
          officialSessionId: { namespace: "fixture", value: "two" },
        });
        const opts = { ...options, expectedChecksum: packageChecksum(fresh) };
        const manager = {
          run: <T>(
            op: Parameters<typeof runtime.transactionManager.run<T>>[0],
          ) => op(executor),
        };
        expect((await register(ctx, fresh, opts, manager)).changed).toBe(2);
        const replay = await register(ctx, fresh, opts, manager);
        expect(replay.rejects).toEqual([]);
        expect(replay.changed).toBe(0);
        const renamed = structuredClone(fresh);
        renamed.sessions = [
          { ...fresh.sessions[0]!, sessionKey: "copied-after-import" },
        ];
        renamed.sessions[0]!.note += " changed booking copy";
        renamed.sessions[0]!.targetAsPublished += " updated wording";
        renamed.sources[0]!.normalizedText += " revised official booking text";
        renamed.sessions[0]!.eventStartsAt = new Date(
          new Date(future).getTime() + 86400000 * 15,
        ).toISOString();
        const rejected = await register(
          ctx,
          renamed,
          { ...options, expectedChecksum: packageChecksum(renamed) },
          manager,
        );
        expect(rejected.applied).toBe(false);
        expect(rejected.rejects[0]?.code).toBe(
          "EXISTING_SESSION_RECONCILIATION_REQUIRED",
        );
        throw new Error("ROLLBACK_SIMULTANEOUS");
      }),
    ).rejects.toThrow("ROLLBACK_SIMULTANEOUS");
  });

  it("does not distinguish no-ID occurrences by changed booking/target copy or evidence, but permits explicit programs", async () => {
    const duplicate = structuredClone(data);
    const copied = {
      ...duplicate.sessions[0]!,
      sessionKey: "changed-copy",
      note: "Changed booking wording",
      targetAsPublished: "Updated free-form audience wording",
      evidenceKeys: ["revised"],
    };
    duplicate.sources.push({
      ...duplicate.sources[0]!,
      key: "revised",
      normalizedText: "Changed official evidence text remains non-identifying",
    });
    duplicate.sessions.push(copied);
    expect(sessionPackageSchema.safeParse(duplicate).success).toBe(false);
    await expect(
      runtime.transactionManager.run(async (executor) => {
        const fresh = structuredClone(data);
        fresh.sessions[0]!.sessionKey = "program-one";
        fresh.sessions[0]!.programAsPublished = "Reviewed program A";
        fresh.sessions[0]!.eventStartsAt = new Date(
          new Date(future).getTime() + 86400000 * 16,
        ).toISOString();
        fresh.sessions.push({
          ...fresh.sessions[0]!,
          sessionKey: "program-two",
          programAsPublished: "Reviewed program B",
        });
        const manager = {
          run: <T>(
            op: Parameters<typeof runtime.transactionManager.run<T>>[0],
          ) => op(executor),
        };
        const opts = { ...options, expectedChecksum: packageChecksum(fresh) };
        expect((await register(ctx, fresh, opts, manager)).changed).toBe(2);
        expect((await register(ctx, fresh, opts, manager)).changed).toBe(0);
        const changed = structuredClone(fresh);
        changed.sessions = [
          {
            ...fresh.sessions[0]!,
            sessionKey: "another-key",
            note: "Different booking note",
          },
        ];
        changed.sources[0]!.normalizedText += " changed source wording";
        const result = await register(
          ctx,
          changed,
          { ...options, expectedChecksum: packageChecksum(changed) },
          manager,
        );
        expect(result.applied).toBe(false);
        expect(result.rejects[0]?.code).toBe(
          "EXISTING_SESSION_RECONCILIATION_REQUIRED",
        );
        throw new Error("ROLLBACK_PROGRAM_IDENTITY");
      }),
    ).rejects.toThrow("ROLLBACK_PROGRAM_IDENTITY");
  });
  it("lists future UNKNOWN/CLOSED/OPEN sessions in the menu while excluding past/cancelled/nonpublic/unverified English sessions", async () => {
    await expect(
      runtime.transactionManager.run(async (executor) => {
        const fresh = structuredClone(data);
        const states = [
          "UNKNOWN",
          "CLOSED",
          "OPEN_AS_PUBLISHED",
          "OPEN_AS_PUBLISHED",
          "CANCELLED",
          "UNKNOWN",
          "UNKNOWN",
        ] as const;
        fresh.sessions = states.map((reservationState, i) => ({
          ...data.sessions[0]!,
          sessionKey: `menu-${i}`,
          reservationState,
          eventStartsAt: new Date(
            Date.now() + 86400000 * (i === 3 ? -5 : 40 + i),
          ).toISOString(),
        }));
        const manager = {
          run: <T>(
            op: Parameters<typeof runtime.transactionManager.run<T>>[0],
          ) => op(executor),
        };
        await register(
          ctx,
          fresh,
          { ...options, expectedChecksum: packageChecksum(fresh) },
          manager,
        );
        await executor.raw(
          sql`update opportunities set publication_state='HIDDEN' where slug=${`${prefix}-briefing-2027-menu-5`}`,
        );
        await executor.raw(sql`set local session_replication_role=replica`);
        await executor.raw(
          sql`update opportunity_versions set is_current=false,verification_state='UNVERIFIED',verified_at=null,verified_by_admin_id=null where opportunity_id in(select id from opportunities where slug=${`${prefix}-briefing-2027-menu-6`})`,
        );
        const ids = [];
        for (let page = 1; page <= 10; page++) {
          const result = await getCurrentInformationSessionCards(
            executor,
            page,
          );
          ids.push(...result.items.map((i) => i.slug));
          if (!result.hasNext) break;
        }
        expect(
          ids
            .filter((id) => id?.includes(`${prefix}-briefing-2027-menu-`))
            .sort(),
        ).toEqual([0, 1, 2].map((i) => `${prefix}-briefing-2027-menu-${i}`));
        throw new Error("ROLLBACK_MENU");
      }),
    ).rejects.toThrow("ROLLBACK_MENU");
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
        expect(found.items[0]?.matchedAlias).toBe(brand);
        await executor.raw(sql`set local session_replication_role=replica`);
        for (const mode of ["past", "cancelled"]) {
          await executor.raw(
            mode === "past"
              ? sql`update opportunity_versions set event_start_at=now()-interval '1 day' where is_current=true and opportunity_id in(select id from opportunities where institution_id=${campus})`
              : sql`update opportunity_versions set business_state='CANCELLED' where is_current=true and opportunity_id in(select id from opportunities where institution_id=${campus})`,
          );
          const plain = {
            category: "ENGLISH_KINDERGARTEN" as const,
            page: 1,
            pageSize: 12,
          };
          expect(
            (await listInstitutions(executor, { ...plain, query: brand }))
              .items[0]?.id,
          ).toBe(campus);
          expect(
            (await listInstitutions(executor, { ...plain, query: prefix }))
              .items[0]?.id,
          ).toBe(campus);
          expect(
            (
              await listInstitutions(executor, {
                ...plain,
                query: brand,
                hasUpcomingInfoSession: true,
              })
            ).pagination.total,
          ).toBe(0);
        }
        await executor.raw(
          sql`update institutions set publication_state='HIDDEN' where id=${campus}`,
        );
        const duplicate = structuredClone(fresh);
        duplicate.sessions[0]!.institutionSlug = prefix + "-renamed";
        duplicate.campuses[0] = {
          ...fresh.campuses[0]!,
          slug: prefix + "-renamed",
          mode: "CREATE",
          updateAddress: false,
          expectedInstitutionId: null,
          expectedName: null,
          expectedAddress: null,
          name: "Renamed moved campus",
          officialAddress: "서울 강남구 역삼로 999",
          officialCampusUrl: null,
        };
        const blocked = await register(
          ctx,
          duplicate,
          { ...options, expectedChecksum: packageChecksum(duplicate) },
          { run: (op) => op(executor) },
        );
        expect(
          blocked.rejects.some(
            (r) =>
              r.code === "CAMPUS_OFFICIAL_IDENTITY_RECONCILIATION_REQUIRED",
          ),
        ).toBe(true);
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
