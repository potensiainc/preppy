import postgres from "postgres";

import { loadEnglishKindergartenPackage } from "../../src/modules/english-kindergarten-import/validator";

const packageDirectory =
  process.argv[2] ??
  "data/snapshots/preppy/english-kindergarten/sg-ek-20260901-r01";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const packageValue = await loadEnglishKindergartenPackage(packageDirectory);
const slugs = packageValue.campuses.map((campus) => campus.slug);
const urls = [...new Set(packageValue.evidence.map((item) => item.sourceUrl))];
const sql = postgres(databaseUrl, { max: 1 });

try {
  await sql.begin("read only", async (transaction) => {
    const institutionGroups = await transaction<
      {
        category: string;
        publicationState: string;
        operationalState: string;
        count: number;
      }[]
    >`
      select category,
        publication_state as "publicationState",
        operational_state as "operationalState",
        count(*)::int as count
      from institutions
      group by category, publication_state, operational_state
      order by category, publication_state, operational_state
    `;
    const targets = await transaction<
      {
        slug: string;
        category: string;
        publicationState: string;
        operationalState: string;
        publishedAt: Date | null;
      }[]
    >`
      select slug, category, publication_state as "publicationState",
        operational_state as "operationalState", published_at as "publishedAt"
      from institutions
      where slug in ${transaction(slugs)}
      order by slug
    `;
    const [counts] = await transaction<
      {
        privateElementary: number;
        targetInstitutions: number;
        targetSources: number;
        targetSnapshots: number;
        targetObservations: number;
        targetFacts: number;
        targetOpportunities: number;
        registryIdentities: number;
        outboxEvents: number;
        notifications: number;
        deliveries: number;
        meaningfulChanges: number;
        opportunityChanges: number;
        coverageTablePresent: boolean;
      }[]
    >`
      select
        (select count(*)::int from institutions where category='PRIVATE_ELEMENTARY') as "privateElementary",
        (select count(*)::int from institutions where slug in ${transaction(slugs)}) as "targetInstitutions",
        (select count(*)::int from sources where canonical_url in ${transaction(urls)}) as "targetSources",
        (select count(*)::int from source_snapshots where source_id in
          (select id from sources where canonical_url in ${transaction(urls)})) as "targetSnapshots",
        (select count(*)::int from source_observations where source_id in
          (select id from sources where canonical_url in ${transaction(urls)})) as "targetObservations",
        (select count(*)::int from institution_facts where institution_id in
          (select id from institutions where slug in ${transaction(slugs)})) as "targetFacts",
        (select count(*)::int from opportunities where institution_id in
          (select id from institutions where slug in ${transaction(slugs)})) as "targetOpportunities",
        (select count(*)::int from institution_registry_identities where institution_id in
          (select id from institutions where slug in ${transaction(slugs)})) as "registryIdentities",
        (select count(*)::int from outbox_events) as "outboxEvents",
        (select count(*)::int from notifications) as "notifications",
        (select count(*)::int from notification_deliveries) as "deliveries",
        (select count(*)::int from meaningful_changes) as "meaningfulChanges",
        (select count(*)::int from opportunity_changes) as "opportunityChanges",
        to_regclass('public.institution_section_coverages') is not null as "coverageTablePresent"
    `;
    let targetCoverages: number | null = null;
    if (counts?.coverageTablePresent) {
      const [coverage] = await transaction<{ count: number }[]>`
        select count(*)::int as count
        from institution_section_coverages
        where institution_id in
          (select id from institutions where slug in ${transaction(slugs)})
      `;
      targetCoverages = coverage?.count ?? 0;
    }
    process.stdout.write(
      `${JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          railway: {
            project: process.env.RAILWAY_PROJECT_NAME ?? null,
            environment: process.env.RAILWAY_ENVIRONMENT_NAME ?? null,
            service: process.env.RAILWAY_SERVICE_NAME ?? null,
          },
          packageId: packageValue.snapshot.packageId,
          institutionGroups,
          targets,
          counts: { ...counts, targetCoverages },
        },
        null,
        2,
      )}\n`,
    );
  });
} finally {
  await sql.end({ timeout: 5 });
}
