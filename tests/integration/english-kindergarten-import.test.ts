import postgres from "postgres";
import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { migrateDatabase } from "@/src/db/migrate";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import {
  applyEnglishKindergartenImport,
  dryRunEnglishKindergartenImport,
} from "@/src/modules/english-kindergarten-import/importer.server";
import {
  canonicalJsonSha256,
  loadEnglishKindergartenPackage,
  validateEnglishKindergartenPackage,
} from "@/src/modules/english-kindergarten-import/validator";
import type { EnglishKindergartenImportPackage } from "@/src/modules/english-kindergarten-import/artifact-schema";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL must be set");
assertDedicatedTestDatabaseUrl(databaseUrl);

const runtime = getRuntimeDatabase({
  DATABASE_URL: databaseUrl,
  DATABASE_MAX_CONNECTIONS: 4,
  NODE_ENV: "test",
});
const lock = postgres(databaseUrl, { max: 1 });
const packageDirectory =
  "data/snapshots/preppy/english-kindergarten/sg-ek-20260901-r01";
const packageValue = await loadEnglishKindergartenPackage(packageDirectory);
const validation = validateEnglishKindergartenPackage(packageValue);
const slugs = packageValue.campuses.map((campus) => campus.slug);
const urls = [...new Set(packageValue.evidence.map((item) => item.sourceUrl))];

async function targetCounts() {
  const [row] = await runtime.client<
    {
      institutions: number;
      sources: number;
      snapshots: number;
      observations: number;
      coverages: number;
      facts: number;
      opportunities: number;
      reviewInsights: number;
      reviewInsightVersions: number;
      reviewInsightEvidence: number;
      registryIdentities: number;
    }[]
  >`
    select
      (select count(*)::int from institutions where slug in ${runtime.client(slugs)}) as institutions,
      (select count(*)::int from sources where canonical_url in ${runtime.client(urls)}) as sources,
      (select count(*)::int from source_snapshots where source_id in
        (select id from sources where canonical_url in ${runtime.client(urls)})) as snapshots,
      (select count(*)::int from source_observations where source_id in
        (select id from sources where canonical_url in ${runtime.client(urls)})) as observations,
      (select count(*)::int from institution_section_coverages where institution_id in
        (select id from institutions where slug in ${runtime.client(slugs)})) as coverages,
      (select count(*)::int from institution_facts where institution_id in
        (select id from institutions where slug in ${runtime.client(slugs)})) as facts,
      (select count(*)::int from opportunities where institution_id in
        (select id from institutions where slug in ${runtime.client(slugs)})) as opportunities,
      (select count(*)::int from institution_review_insights where institution_id in
        (select id from institutions where slug in ${runtime.client(slugs)})) as "reviewInsights",
      (select count(*)::int from institution_review_insight_versions where institution_review_insight_id in
        (select id from institution_review_insights where institution_id in
          (select id from institutions where slug in ${runtime.client(slugs)}))) as "reviewInsightVersions",
      (select count(*)::int from institution_review_insight_version_evidence where institution_review_insight_version_id in
        (select id from institution_review_insight_versions where institution_review_insight_id in
          (select id from institution_review_insights where institution_id in
            (select id from institutions where slug in ${runtime.client(slugs)})))) as "reviewInsightEvidence",
      (select count(*)::int from institution_registry_identities where institution_id in
        (select id from institutions where slug in ${runtime.client(slugs)})) as "registryIdentities"
  `;
  return row!;
}

async function cleanup() {
  await runtime.client.begin(async (transaction) => {
    const institutionRows = await transaction<{ id: string }[]>`
      select id from institutions where slug in ${transaction(slugs)}
    `;
    const institutionIds = institutionRows.map((row) => row.id);
    const sourceRows = await transaction<{ id: string }[]>`
      select id from sources where canonical_url in ${transaction(urls)}
    `;
    const sourceIds = sourceRows.map((row) => row.id);
    if (institutionIds.length > 0) {
      await transaction`delete from opportunity_changes where opportunity_id in (select id from opportunities where institution_id in ${transaction(institutionIds)})`;
      await transaction`delete from opportunity_version_evidence where opportunity_version_id in (select id from opportunity_versions where opportunity_id in (select id from opportunities where institution_id in ${transaction(institutionIds)}))`;
      await transaction`delete from opportunity_versions where opportunity_id in (select id from opportunities where institution_id in ${transaction(institutionIds)})`;
      await transaction`delete from opportunities where institution_id in ${transaction(institutionIds)}`;
      await transaction`delete from institution_fact_version_evidence where institution_fact_version_id in (select id from institution_fact_versions where institution_fact_id in (select id from institution_facts where institution_id in ${transaction(institutionIds)}))`;
      await transaction`delete from institution_fact_versions where institution_fact_id in (select id from institution_facts where institution_id in ${transaction(institutionIds)})`;
      await transaction`delete from institution_facts where institution_id in ${transaction(institutionIds)}`;
      await transaction`delete from institution_review_insight_version_evidence where institution_review_insight_version_id in (select id from institution_review_insight_versions where institution_review_insight_id in (select id from institution_review_insights where institution_id in ${transaction(institutionIds)}))`;
      await transaction`delete from institution_review_insight_versions where institution_review_insight_id in (select id from institution_review_insights where institution_id in ${transaction(institutionIds)})`;
      await transaction`delete from institution_review_insights where institution_id in ${transaction(institutionIds)}`;
      await transaction`delete from institution_section_coverages where institution_id in ${transaction(institutionIds)}`;
      await transaction`delete from institution_source_bindings where institution_id in ${transaction(institutionIds)}`;
      await transaction`delete from institution_registry_identities where institution_id in ${transaction(institutionIds)}`;
      await transaction`delete from institutions where id in ${transaction(institutionIds)}`;
    }
    if (sourceIds.length > 0) {
      await transaction`delete from source_observations where source_id in ${transaction(sourceIds)}`;
      await transaction`delete from source_snapshots where source_id in ${transaction(sourceIds)}`;
      await transaction`delete from sources where id in ${transaction(sourceIds)}`;
    }
  });
}

function withReviewInsight(): EnglishKindergartenImportPackage {
  const snapshot = {
    ...packageValue.snapshot,
    institutions: packageValue.snapshot.institutions.map((item, index) => ({
      ...item,
      reviewInsight:
        index === 0
          ? {
              periodStart: "2026-01-01",
              periodEnd: "2026-08-31",
              sampleSize: 12,
              themes: [
                { summary: "놀이 활동 언급이 반복돼요.", mentionCount: 5 },
              ],
              limitations: "공개적으로 접근 가능한 후기만 확인했어요.",
              evidenceIds: [`${item.campusId}-classification`],
              verifiedAt: "2026-09-07T03:00:00.000Z",
            }
          : item.reviewInsight,
    })),
  };
  return {
    ...packageValue,
    snapshot,
    manifest: {
      ...packageValue.manifest,
      preppyImportChecksum: canonicalJsonSha256(snapshot),
    },
  } as EnglishKindergartenImportPackage;
}

function withVersionedDetails(
  amount: number,
  eventStartsAt: string,
): EnglishKindergartenImportPackage {
  const snapshot = {
    ...packageValue.snapshot,
    institutions: packageValue.snapshot.institutions.map((item) =>
      item.campusId === "sg-ek-012"
        ? {
            ...item,
            facts: [
              {
                factType: "TUITION" as const,
                value: {
                  factType: "TUITION" as const,
                  academicYearLabel: "2027학년도",
                  validityNote: null,
                  billingCadence: "MONTHLY" as const,
                  currency: "KRW" as const,
                  amountMin: amount,
                  amountMax: amount,
                  programFees: [],
                  extraCosts: [],
                  includedItems: [],
                  refundTerms: null,
                  changeNote: null,
                },
                displayText: null,
                evidenceIds: ["sg-ek-012-classification"],
                verifiedAt: "2026-09-07T04:00:00.000Z",
              },
            ],
            opportunities: [
              {
                slug: "psa-2027-information-session",
                title: "PSA 2027학년도 입학설명회",
                kind: "INFORMATION_SESSION" as const,
                businessState: "UPCOMING" as const,
                eventStartsAt,
                applicationClosesAt: null,
                actionUrl: "https://www.ybmpine.com/psa-apply",
                evidenceIds: ["sg-ek-012-classification"],
                verifiedAt: "2026-09-07T04:00:00.000Z",
              },
            ],
          }
        : item,
    ),
  };
  return {
    ...packageValue,
    snapshot,
    manifest: {
      ...packageValue.manifest,
      preppyImportChecksum: canonicalJsonSha256(snapshot),
    },
  } as EnglishKindergartenImportPackage;
}

beforeAll(async () => {
  await lock`select pg_advisory_lock(hashtext('english-kindergarten-import-tests'))`;
  await migrateDatabase(databaseUrl);
  expect(validation.status).toBe("PASS");
});

afterEach(cleanup);

afterAll(async () => {
  await lock`select pg_advisory_unlock(hashtext('english-kindergarten-import-tests'))`;
  await lock.end({ timeout: 5 });
  await closeRuntimeDatabase();
});

describe("English-kindergarten snapshot import", () => {
  it("plans 25 DRAFT roots, applies once without signals, and converges to no-op", async () => {
    const first = await dryRunEnglishKindergartenImport(
      { packageValue },
      { transactionManager: runtime.transactionManager },
    );
    expect(first.plan.created.institutions).toBe(25);
    expect(first.plan.created.outboxEvents).toBe(0);
    expect(await targetCounts()).toEqual({
      institutions: 0,
      sources: 0,
      snapshots: 0,
      observations: 0,
      coverages: 0,
      facts: 0,
      opportunities: 0,
      reviewInsights: 0,
      reviewInsightVersions: 0,
      reviewInsightEvidence: 0,
      registryIdentities: 0,
    });
    const applied = await applyEnglishKindergartenImport(
      {
        packageValue,
        expectedChecksum: validation.packageChecksum,
        occurredAt: new Date("2026-09-07T02:00:00.000Z"),
      },
      { transactionManager: runtime.transactionManager },
    );
    expect(applied).toMatchObject({ mode: "apply", applied: true });
    expect(applied.sideEffects).toEqual({
      outboxEvents: 0,
      notifications: 0,
      deliveries: 0,
      meaningfulChanges: 0,
      opportunityChanges: 0,
    });
    expect(await targetCounts()).toEqual({
      institutions: 25,
      sources: 25,
      snapshots: 25,
      observations: 25,
      coverages: 200,
      facts: 0,
      opportunities: 0,
      reviewInsights: 0,
      reviewInsightVersions: 0,
      reviewInsightEvidence: 0,
      registryIdentities: 0,
    });
    const [captured] = await runtime.client<
      { normalizedText: string; textHash: string }[]
    >`
      select ss.normalized_text as "normalizedText", ss.text_hash as "textHash"
      from source_snapshots ss
      join sources s on s.id=ss.source_id
      where s.canonical_url=${packageValue.evidence[0]!.sourceUrl}
    `;
    expect(captured?.normalizedText).toBe(
      packageValue.evidence[0]!.sourceTextExcerpt,
    );
    expect(captured?.textHash).toBe(
      packageValue.evidence[0]!.sourceContentSha256,
    );

    const second = await dryRunEnglishKindergartenImport(
      { packageValue },
      { transactionManager: runtime.transactionManager },
    );
    expect(second.plan.created.total).toBe(0);
    expect(second.plan.updated.total).toBe(0);
    expect(second.plan.unchanged.institutions).toBe(25);
    expect(second.plan.rejects).toEqual([]);
  });

  it("preserves exact published roots so later detail snapshots remain importable", async () => {
    await applyEnglishKindergartenImport(
      {
        packageValue,
        expectedChecksum: validation.packageChecksum,
        occurredAt: new Date("2026-09-07T02:00:00.000Z"),
      },
      { transactionManager: runtime.transactionManager },
    );
    await runtime.client`
      update institutions
      set publication_state='PUBLISHED',
        published_at='2026-09-07T03:00:00.000Z'
      where slug in ${runtime.client(slugs)}
    `;

    const replay = await dryRunEnglishKindergartenImport(
      { packageValue },
      { transactionManager: runtime.transactionManager },
    );

    expect(replay.plan.rejects).toEqual([]);
    expect(replay.plan.unchanged.institutions).toBe(25);
    expect(replay.plan.created.total).toBe(0);
    expect(replay.plan.updated.total).toBe(0);
  });

  it("imports a future review insight with evidence and remains idempotent", async () => {
    const reviewPackage = withReviewInsight();
    const reviewValidation = validateEnglishKindergartenPackage(reviewPackage);
    expect(reviewValidation.status).toBe("PASS");

    const applied = await applyEnglishKindergartenImport(
      {
        packageValue: reviewPackage,
        expectedChecksum: reviewValidation.packageChecksum,
        occurredAt: new Date("2026-09-07T03:00:00.000Z"),
      },
      { transactionManager: runtime.transactionManager },
    );
    expect(applied.plan.created.reviewInsights).toBe(1);
    expect(applied.plan.created.reviewInsightVersions).toBe(1);
    expect(applied.plan.created.reviewInsightEvidence).toBe(1);
    expect(await targetCounts()).toMatchObject({
      reviewInsights: 1,
      reviewInsightVersions: 1,
      reviewInsightEvidence: 1,
    });

    const second = await dryRunEnglishKindergartenImport(
      { packageValue: reviewPackage },
      { transactionManager: runtime.transactionManager },
    );
    expect(second.plan.created.total).toBe(0);
    expect(second.plan.updated.total).toBe(0);
    expect(second.plan.unchanged.reviewInsightVersions).toBe(1);
  });

  it("does not reactivate historical fact or opportunity versions on replay", async () => {
    const firstPackage = withVersionedDetails(
      1_800_000,
      "2026-10-15T01:00:00.000Z",
    );
    const secondPackage = withVersionedDetails(
      1_900_000,
      "2026-10-22T01:00:00.000Z",
    );
    for (const currentPackage of [firstPackage, secondPackage]) {
      const currentValidation =
        validateEnglishKindergartenPackage(currentPackage);
      expect(currentValidation.status).toBe("PASS");
      await applyEnglishKindergartenImport(
        {
          packageValue: currentPackage,
          expectedChecksum: currentValidation.packageChecksum,
        },
        { transactionManager: runtime.transactionManager },
      );
    }

    const replay = await dryRunEnglishKindergartenImport(
      { packageValue: firstPackage },
      { transactionManager: runtime.transactionManager },
    );
    expect(replay.plan.created.factVersions).toBe(0);
    expect(replay.plan.created.opportunityVersions).toBe(0);
    expect(replay.plan.updated.total).toBe(0);

    const [current] = await runtime.client<
      { amount: number; hasFactType: boolean; eventStartsAt: Date | string }[]
    >`
      select
        (fv.value_json->>'amountMin')::int as amount,
        fv.value_json ? 'factType' as "hasFactType",
        ov.event_start_at as "eventStartsAt"
      from institutions i
      join institution_facts f on f.institution_id=i.id and f.fact_type='TUITION'
      join institution_fact_versions fv on fv.institution_fact_id=f.id and fv.is_current=true
      join opportunities o on o.institution_id=i.id and o.slug='psa-2027-information-session'
      join opportunity_versions ov on ov.opportunity_id=o.id and ov.is_current=true
      where i.slug='psa-apgujeong'
    `;
    expect(current).toMatchObject({ amount: 1_900_000, hasFactType: false });
    expect(new Date(current!.eventStartsAt).toISOString()).toBe(
      "2026-10-22T01:00:00.000Z",
    );
  });

  it("rejects a wrong-category slug collision and checksum mismatch", async () => {
    const target = packageValue.campuses[0]!;
    await runtime.client`
      insert into institutions
        (slug, display_name, category, operational_state, publication_state, city, district, address_line)
      values
        (${target.slug}, ${target.displayName}, 'PRIVATE_ELEMENTARY', 'ACTIVE', 'DRAFT', '서울특별시', ${target.district}, ${target.addressLine})
    `;
    const rejected = await dryRunEnglishKindergartenImport(
      { packageValue },
      { transactionManager: runtime.transactionManager },
    );
    expect(rejected.plan.applyAllowed).toBe(false);
    expect(rejected.plan.rejects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "CATEGORY_COLLISION" }),
      ]),
    );

    await expect(
      applyEnglishKindergartenImport(
        { packageValue, expectedChecksum: "0".repeat(64) },
        { transactionManager: runtime.transactionManager },
      ),
    ).rejects.toThrow(/checksum/i);
  });

  it("rolls back every target row when a failure is injected", async () => {
    await expect(
      applyEnglishKindergartenImport(
        { packageValue, expectedChecksum: validation.packageChecksum },
        {
          transactionManager: runtime.transactionManager,
          afterDomainWrites: async () => {
            throw new Error("injected evidence failure");
          },
        },
      ),
    ).rejects.toThrow("injected evidence failure");
    expect(await targetCounts()).toEqual({
      institutions: 0,
      sources: 0,
      snapshots: 0,
      observations: 0,
      coverages: 0,
      facts: 0,
      opportunities: 0,
      reviewInsights: 0,
      reviewInsightVersions: 0,
      reviewInsightEvidence: 0,
      registryIdentities: 0,
    });
  });

  it("rolls back when an opportunity change is produced", async () => {
    const opportunityId = "00000000-0000-5000-8000-000000000101";
    const versionId = "00000000-0000-5000-8000-000000000102";
    await expect(
      applyEnglishKindergartenImport(
        { packageValue, expectedChecksum: validation.packageChecksum },
        {
          transactionManager: runtime.transactionManager,
          afterDomainWrites: async (executor) => {
            await executor.raw(sql`
              insert into opportunities
                (id, institution_id, slug, kind, truth_mode,
                 publication_state, created_at, updated_at)
              select ${opportunityId}::uuid, id,
                'english-kindergarten-side-effect-guard',
                'INFORMATION_SESSION', 'NATIVE', 'DRAFT', now(), now()
              from institutions where slug = ${packageValue.campuses[0]!.slug}
            `);
            await executor.raw(sql`
              insert into opportunity_versions
                (id, opportunity_id, truth_mode, version_number,
                 verification_state, business_state, is_current, title,
                 verified_at, content_fingerprint, created_at)
              values
                (${versionId}::uuid, ${opportunityId}::uuid, 'NATIVE', 1,
                 'VERIFIED', 'UPCOMING', true, '부수 효과 검증 일정',
                 now(), 'side-effect-guard', now())
            `);
            await executor.raw(sql`
              insert into opportunity_changes
                (opportunity_id, truth_mode, change_type, materiality,
                 to_native_version_id, summary, verified_at, published_at,
                 dedupe_key, created_at)
              values
                (${opportunityId}::uuid, 'NATIVE', 'NEW_OPPORTUNITY',
                 'NON_NOTIFIABLE', ${versionId}::uuid, '부수 효과 검증',
                 now(), now(), 'english-kindergarten-side-effect-guard', now())
            `);
          },
        },
      ),
    ).rejects.toThrow("produced product signals");
    expect(await targetCounts()).toMatchObject({ institutions: 0 });
    const [changeCount] = await runtime.client<{ count: number }[]>`
      select count(*)::int as count from opportunity_changes
      where dedupe_key = 'english-kindergarten-side-effect-guard'
    `;
    expect(changeCount?.count).toBe(0);
  });
});
