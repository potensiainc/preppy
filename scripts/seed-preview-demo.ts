import { fileURLToPath } from "node:url";

import postgres from "postgres";

type PreviewInstitutionType =
  "ENGLISH_KINDERGARTEN" | "PRIVATE_ELEMENTARY" | "INTERNATIONAL_SCHOOL";

type PreviewOpportunityType =
  | "INFORMATION_SESSION"
  | "OPEN_HOUSE"
  | "APPLICATION"
  | "ASSESSMENT"
  | "DEADLINE";

export const PREVIEW_DEMO_FIXTURE = {
  institutions: [
    {
      id: "51000000-0000-4000-8000-000000000001",
      slug: "preppy-demo-forest-kindergarten",
      name: "프레피 데모 숲속영유",
      type: "ENGLISH_KINDERGARTEN",
    },
    {
      id: "51000000-0000-4000-8000-000000000002",
      slug: "preppy-demo-river-kindergarten",
      name: "프레피 데모 리버영유",
      type: "ENGLISH_KINDERGARTEN",
    },
    {
      id: "51000000-0000-4000-8000-000000000003",
      slug: "preppy-demo-hanbit-elementary",
      name: "프레피 데모 한빛사립초",
      type: "PRIVATE_ELEMENTARY",
    },
    {
      id: "51000000-0000-4000-8000-000000000004",
      slug: "preppy-demo-saebom-elementary",
      name: "프레피 데모 새봄사립초",
      type: "PRIVATE_ELEMENTARY",
    },
    {
      id: "51000000-0000-4000-8000-000000000005",
      slug: "preppy-demo-global-school",
      name: "프레피 데모 글로벌스쿨",
      type: "INTERNATIONAL_SCHOOL",
    },
    {
      id: "51000000-0000-4000-8000-000000000006",
      slug: "preppy-demo-bridge-school",
      name: "프레피 데모 브릿지국제학교",
      type: "INTERNATIONAL_SCHOOL",
    },
  ] satisfies ReadonlyArray<{
    id: string;
    slug: string;
    name: string;
    type: PreviewInstitutionType;
  }>,
  opportunities: [
    {
      id: "52000000-0000-4000-8000-000000000001",
      institutionId: "51000000-0000-4000-8000-000000000001",
      slug: "preppy-demo-forest-kindergarten-session",
      title: "숲속영유 2027 입학 설명회",
      type: "INFORMATION_SESSION",
      summary: "프레피 Preview 전용 합성 설명회 일정입니다.",
      closesAt: "2026-09-05T09:00:00.000Z",
    },
    {
      id: "52000000-0000-4000-8000-000000000002",
      institutionId: "51000000-0000-4000-8000-000000000002",
      slug: "preppy-demo-river-kindergarten-open-house",
      title: "리버영유 가을 오픈하우스",
      type: "OPEN_HOUSE",
      summary: "교실과 교육 과정을 살펴보는 합성 Preview 행사입니다.",
      closesAt: "2026-09-12T09:00:00.000Z",
    },
    {
      id: "52000000-0000-4000-8000-000000000003",
      institutionId: "51000000-0000-4000-8000-000000000003",
      slug: "preppy-demo-hanbit-elementary-application",
      title: "한빛사립초 2027 신입생 지원",
      type: "APPLICATION",
      summary: "사립초 지원 흐름을 검토하기 위한 합성 Preview 모집입니다.",
      closesAt: "2026-09-19T09:00:00.000Z",
    },
    {
      id: "52000000-0000-4000-8000-000000000004",
      institutionId: "51000000-0000-4000-8000-000000000004",
      slug: "preppy-demo-saebom-elementary-assessment",
      title: "새봄사립초 입학 평가 안내",
      type: "ASSESSMENT",
      summary: "평가 일정 UI 확인을 위한 합성 Preview 정보입니다.",
      closesAt: "2026-10-03T09:00:00.000Z",
    },
    {
      id: "52000000-0000-4000-8000-000000000005",
      institutionId: "51000000-0000-4000-8000-000000000005",
      slug: "preppy-demo-global-school-deadline",
      title: "글로벌스쿨 우선 지원 마감",
      type: "DEADLINE",
      summary: "국제학교 마감 카드 검토를 위한 합성 Preview 정보입니다.",
      closesAt: "2026-10-17T09:00:00.000Z",
    },
    {
      id: "52000000-0000-4000-8000-000000000006",
      institutionId: "51000000-0000-4000-8000-000000000006",
      slug: "preppy-demo-bridge-school-application",
      title: "브릿지국제학교 2027 지원",
      type: "APPLICATION",
      summary: "국제학교 지원 상세 화면을 위한 합성 Preview 모집입니다.",
      closesAt: "2026-10-31T09:00:00.000Z",
    },
  ] satisfies ReadonlyArray<{
    id: string;
    institutionId: string;
    slug: string;
    title: string;
    type: PreviewOpportunityType;
    summary: string;
    closesAt: string;
  }>,
  articles: [
    {
      id: "53000000-0000-4000-8000-000000000001",
      slug: "preppy-demo-kindergarten-guide",
      title: "영유 입학 준비, 무엇부터 확인할까요?",
    },
    {
      id: "53000000-0000-4000-8000-000000000002",
      slug: "preppy-demo-elementary-guide",
      title: "사립초 설명회 전에 살펴볼 다섯 가지",
    },
    {
      id: "53000000-0000-4000-8000-000000000003",
      slug: "preppy-demo-international-guide",
      title: "국제학교 지원 일정을 한눈에 정리하는 법",
    },
  ],
} as const;

type PreviewSql = postgres.Sql | postgres.TransactionSql;

export type PreviewDemoReport = Readonly<{
  institutions: number;
  sources: number;
  institutionSourceBindings: number;
  opportunities: number;
  opportunitySourceBindings: number;
  opportunityVersions: number;
  opportunityEvidence: number;
  institutionFacts: number;
  institutionFactEvidence: number;
  articles: number;
  articleInstitutionRelations: number;
  articleOpportunityRelations: number;
  outboxEvents: number;
  notifications: number;
  institutionSlugs: string[];
  opportunitySlugs: string[];
  articleSlugs: string[];
}>;

const PREVIEW_SOURCE_IDS = PREVIEW_DEMO_FIXTURE.institutions.map(
  (_, index) =>
    `54000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
);
const PREVIEW_OPPORTUNITY_VERSION_IDS = PREVIEW_DEMO_FIXTURE.opportunities.map(
  (_, index) =>
    `55000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
);
const PREVIEW_FACT_IDS = PREVIEW_DEMO_FIXTURE.institutions.map(
  (_, index) =>
    `56000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
);
const PREVIEW_FACT_VERSION_IDS = PREVIEW_DEMO_FIXTURE.institutions.map(
  (_, index) =>
    `57000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
);
const PREVIEW_FACT_EVIDENCE_IDS = PREVIEW_DEMO_FIXTURE.institutions.map(
  (_, index) =>
    `58000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
);
const PREVIEW_OPPORTUNITY_EVIDENCE_IDS = PREVIEW_DEMO_FIXTURE.opportunities.map(
  (_, index) =>
    `59000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
);

const ALL_AGGREGATE_IDS = [
  ...PREVIEW_DEMO_FIXTURE.institutions.map(({ id }) => id),
  ...PREVIEW_DEMO_FIXTURE.opportunities.map(({ id }) => id),
  ...PREVIEW_DEMO_FIXTURE.articles.map(({ id }) => id),
];

function normalizeAppBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Preview APP_BASE_URL must be a credential-free HTTPS URL");
  }
  return url.origin;
}

async function assertNoIdentityConflicts(
  sql: PreviewSql,
  table: "institutions" | "opportunities" | "articles",
  expected: ReadonlyArray<Readonly<{ id: string; slug: string }>>,
): Promise<void> {
  const ids = expected.map(({ id }) => id);
  const slugs = expected.map(({ slug }) => slug);
  const rows = await sql<{ id: string; slug: string }[]>`
    select id, slug from ${sql(table)}
    where id in ${sql(ids)} or slug in ${sql(slugs)}
  `;
  const byId = new Map(expected.map((row) => [row.id, row.slug]));
  const bySlug = new Map(expected.map((row) => [row.slug, row.id]));
  if (
    rows.some(
      (row) => byId.get(row.id) !== row.slug || bySlug.get(row.slug) !== row.id,
    )
  ) {
    throw new Error(`Preview seed identity conflict in ${table}`);
  }
}

export async function inspectPreviewDemo(
  sql: PreviewSql,
): Promise<PreviewDemoReport> {
  const institutionIds = PREVIEW_DEMO_FIXTURE.institutions.map(({ id }) => id);
  const opportunityIds = PREVIEW_DEMO_FIXTURE.opportunities.map(({ id }) => id);
  const articleIds = PREVIEW_DEMO_FIXTURE.articles.map(({ id }) => id);
  const [counts] = await sql<
    Array<
      Omit<
        PreviewDemoReport,
        "institutionSlugs" | "opportunitySlugs" | "articleSlugs"
      >
    >
  >`
    select
      (select count(*)::int from institutions where id in ${sql(institutionIds)}) as institutions,
      (select count(*)::int from sources where id in ${sql(PREVIEW_SOURCE_IDS)}) as sources,
      (select count(*)::int from institution_source_bindings where institution_id in ${sql(institutionIds)}) as "institutionSourceBindings",
      (select count(*)::int from opportunities where id in ${sql(opportunityIds)}) as opportunities,
      (select count(*)::int from opportunity_source_bindings where opportunity_id in ${sql(opportunityIds)}) as "opportunitySourceBindings",
      (select count(*)::int from opportunity_versions where opportunity_id in ${sql(opportunityIds)}) as "opportunityVersions",
      (select count(*)::int from opportunity_version_evidence where opportunity_version_id in ${sql(PREVIEW_OPPORTUNITY_VERSION_IDS)}) as "opportunityEvidence",
      (select count(*)::int from institution_facts where institution_id in ${sql(institutionIds)}) as "institutionFacts",
      (select count(*)::int from institution_fact_version_evidence where institution_fact_version_id in ${sql(PREVIEW_FACT_VERSION_IDS)}) as "institutionFactEvidence",
      (select count(*)::int from articles where id in ${sql(articleIds)}) as articles,
      (select count(*)::int from article_institutions where article_id in ${sql(articleIds)}) as "articleInstitutionRelations",
      (select count(*)::int from article_opportunities where article_id in ${sql(articleIds)}) as "articleOpportunityRelations",
      (select count(*)::int from outbox_events where aggregate_id in ${sql(ALL_AGGREGATE_IDS)}) as "outboxEvents",
      (select count(*)::int from notifications where opportunity_id in ${sql(opportunityIds)}) as notifications
  `;
  if (!counts) throw new Error("Preview seed inspection returned no row");
  const [institutionRows, opportunityRows, articleRows] = await Promise.all([
    sql<
      { slug: string }[]
    >`select slug from institutions where id in ${sql(institutionIds)} order by slug`,
    sql<
      { slug: string }[]
    >`select slug from opportunities where id in ${sql(opportunityIds)} order by slug`,
    sql<
      { slug: string }[]
    >`select slug from articles where id in ${sql(articleIds)} order by slug`,
  ]);
  return {
    ...counts,
    institutionSlugs: institutionRows.map(({ slug }) => slug),
    opportunitySlugs: opportunityRows.map(({ slug }) => slug),
    articleSlugs: articleRows.map(({ slug }) => slug),
  };
}

export async function seedPreviewDemo(
  sql: postgres.Sql,
  input: Readonly<{ appBaseUrl: string }>,
): Promise<PreviewDemoReport> {
  const appBaseUrl = normalizeAppBaseUrl(input.appBaseUrl);
  return sql.begin(async (transaction) => {
    await transaction`select pg_advisory_xact_lock(hashtext('preppy-ui-preview-demo-seed-v1'))`;
    await assertNoIdentityConflicts(
      transaction,
      "institutions",
      PREVIEW_DEMO_FIXTURE.institutions,
    );
    await assertNoIdentityConflicts(
      transaction,
      "opportunities",
      PREVIEW_DEMO_FIXTURE.opportunities,
    );
    await assertNoIdentityConflicts(
      transaction,
      "articles",
      PREVIEW_DEMO_FIXTURE.articles,
    );

    for (const [
      index,
      institution,
    ] of PREVIEW_DEMO_FIXTURE.institutions.entries()) {
      const sourceId = PREVIEW_SOURCE_IDS[index];
      const factId = PREVIEW_FACT_IDS[index];
      const factVersionId = PREVIEW_FACT_VERSION_IDS[index];
      await transaction`
        insert into sources (
          id, canonical_url, source_type, authority_level, lifecycle_status,
          source_name, requires_js
        ) values (
          ${sourceId}, ${`https://official-demo.preppy.example/${institution.slug}`},
          'OFFICIAL_ADMISSION_PAGE', 'PRIMARY', 'ACTIVE',
          ${`${institution.name} 공식 데모 출처`}, false
        ) on conflict (id) do update set
          canonical_url=excluded.canonical_url,
          source_type=excluded.source_type,
          authority_level=excluded.authority_level,
          lifecycle_status=excluded.lifecycle_status,
          source_name=excluded.source_name,
          requires_js=excluded.requires_js
      `;
      await transaction`
        insert into source_monitor_configs (
          source_id, collection_strategy, monitoring_profile, is_enabled
        ) values (${sourceId}, 'HTTP', 'STANDARD_SEASONAL', true)
        on conflict (source_id) do update set
          collection_strategy=excluded.collection_strategy,
          monitoring_profile=excluded.monitoring_profile,
          is_enabled=excluded.is_enabled
      `;
      await transaction`
        insert into institutions (
          id, slug, display_name, category, international_subtype,
          operational_state, publication_state, region_code, city, district,
          address_line, website_url, short_description, published_at
        ) values (
          ${institution.id}, ${institution.slug}, ${institution.name}, ${institution.type},
          ${institution.type === "INTERNATIONAL_SCHOOL" ? "INTERNATIONAL_SCHOOL" : null},
          'ACTIVE', 'PUBLISHED', 'SEOUL', '서울',
          ${index % 2 === 0 ? "강남구" : "서초구"},
          ${`서울 데모로 ${index + 1}`},
          ${`https://official-demo.preppy.example/${institution.slug}`},
          ${`${institution.name}의 공개 화면 검토를 위한 합성 기관 프로필입니다.`},
          '2026-08-25T00:00:00.000Z'
        ) on conflict (id) do update set
          slug=excluded.slug,
          display_name=excluded.display_name,
          category=excluded.category,
          international_subtype=excluded.international_subtype,
          operational_state=excluded.operational_state,
          publication_state=excluded.publication_state,
          region_code=excluded.region_code,
          city=excluded.city,
          district=excluded.district,
          address_line=excluded.address_line,
          website_url=excluded.website_url,
          short_description=excluded.short_description,
          published_at=excluded.published_at
      `;
      await transaction`
        insert into institution_source_bindings (
          institution_id, source_id, role, is_primary, is_active
        ) values (${institution.id}, ${sourceId}, 'OFFICIAL_MAIN', true, true)
        on conflict (institution_id, source_id, role) do update set
          is_primary=excluded.is_primary, is_active=true, unbound_at=null
      `;
      await transaction`
        insert into institution_facts (id, institution_id, fact_type)
        values (${factId}, ${institution.id}, 'ADMISSION_PROCESS')
        on conflict (id) do nothing
      `;
      await transaction`
        insert into institution_fact_versions (
          id, institution_fact_id, version_number, verification_state,
          is_current, value_json, display_text, verified_at
        ) values (
          ${factVersionId}, ${factId}, 1, 'VERIFIED', true,
          jsonb_build_object('steps', jsonb_build_array('상담', '지원', '확인')),
          '상담 → 지원 → 결과 확인', '2026-08-25T01:00:00.000Z'
        ) on conflict (id) do update set
          verification_state=excluded.verification_state,
          is_current=excluded.is_current,
          value_json=excluded.value_json,
          display_text=excluded.display_text,
          verified_at=excluded.verified_at
      `;
      await transaction`
        insert into institution_fact_version_evidence (
          id, institution_fact_version_id, source_id, evidence_role
        ) values (${PREVIEW_FACT_EVIDENCE_IDS[index]}, ${factVersionId}, ${sourceId}, 'PRIMARY')
        on conflict (id) do nothing
      `;
    }

    for (const [
      index,
      opportunity,
    ] of PREVIEW_DEMO_FIXTURE.opportunities.entries()) {
      const sourceId = PREVIEW_SOURCE_IDS[index];
      const versionId = PREVIEW_OPPORTUNITY_VERSION_IDS[index];
      await transaction`
        insert into opportunities (
          id, institution_id, slug, kind, truth_mode, publication_state,
          published_at
        ) values (
          ${opportunity.id}, ${opportunity.institutionId}, ${opportunity.slug},
          ${opportunity.type}, 'NATIVE', 'PUBLISHED', '2026-08-25T00:00:00.000Z'
        ) on conflict (id) do update set
          institution_id=excluded.institution_id,
          slug=excluded.slug,
          kind=excluded.kind,
          truth_mode=excluded.truth_mode,
          publication_state=excluded.publication_state,
          published_at=excluded.published_at
      `;
      await transaction`
        insert into opportunity_source_bindings (
          opportunity_id, source_id, role, is_primary, is_active
        ) values (${opportunity.id}, ${sourceId}, 'PRIMARY_NOTICE', true, true)
        on conflict (opportunity_id, source_id, role) do update set
          is_primary=excluded.is_primary, is_active=true, unbound_at=null
      `;
      await transaction`
        insert into opportunity_versions (
          id, opportunity_id, truth_mode, version_number, verification_state,
          business_state, is_current, title, summary, target_audience,
          event_start_at, application_open_at, application_close_at,
          action_url, location_text, verified_at, valid_from
        ) values (
          ${versionId}, ${opportunity.id}, 'NATIVE', 1, 'VERIFIED', 'OPEN', true,
          ${opportunity.title}, ${opportunity.summary}, '2027학년도 지원 가정',
          ${opportunity.closesAt}, '2026-08-25T00:00:00.000Z',
          ${opportunity.closesAt},
          ${`${appBaseUrl}/institutions/${PREVIEW_DEMO_FIXTURE.institutions[index].slug}`},
          '서울 · 온라인 병행', '2026-08-25T02:00:00.000Z',
          '2026-08-25T00:00:00.000Z'
        ) on conflict (id) do update set
          verification_state=excluded.verification_state,
          business_state=excluded.business_state,
          is_current=excluded.is_current,
          title=excluded.title,
          summary=excluded.summary,
          target_audience=excluded.target_audience,
          event_start_at=excluded.event_start_at,
          application_open_at=excluded.application_open_at,
          application_close_at=excluded.application_close_at,
          action_url=excluded.action_url,
          location_text=excluded.location_text,
          verified_at=excluded.verified_at,
          valid_from=excluded.valid_from
      `;
      await transaction`
        insert into opportunity_version_evidence (
          id, opportunity_version_id, source_id, evidence_role
        ) values (${PREVIEW_OPPORTUNITY_EVIDENCE_IDS[index]}, ${versionId}, ${sourceId}, 'PRIMARY')
        on conflict (id) do nothing
      `;
    }

    for (const [index, article] of PREVIEW_DEMO_FIXTURE.articles.entries()) {
      const category = [
        "ENGLISH_KINDERGARTEN",
        "PRIVATE_ELEMENTARY",
        "INTERNATIONAL_SCHOOL",
      ][index];
      const relatedInstitutions = PREVIEW_DEMO_FIXTURE.institutions.slice(
        index * 2,
        index * 2 + 2,
      );
      const relatedOpportunities = PREVIEW_DEMO_FIXTURE.opportunities.slice(
        index * 2,
        index * 2 + 2,
      );
      await transaction`
        insert into articles (
          id, slug, type, category, status, title, excerpt, content_html,
          seo_title, seo_description, canonical_url, robots_index,
          robots_follow, published_at, updated_at
        ) values (
          ${article.id}, ${article.slug}, 'GUIDE', ${category}, 'PUBLISHED',
          ${article.title},
          '입학 준비 흐름과 공식 정보 확인 포인트를 정리한 Preview 전용 합성 가이드입니다.',
          ${`<p>이 글은 PREPPY Preview 화면 검토를 위한 합성 콘텐츠입니다.</p><h2>공식 정보부터 확인하기</h2><p>기관 상세와 모집 일정에서 출처와 검증 시각을 함께 확인하세요.</p><h2>가족의 기준 정리하기</h2><ul><li>지원 일정</li><li>교육 과정</li><li>통학 동선</li></ul><p><a href="/institutions/${relatedInstitutions[0]?.slug}">관련 데모 기관 보기</a></p>`},
          ${article.title},
          'PREPPY Preview에서 입학 준비 정보 구조를 확인하는 합성 가이드입니다.',
          ${`${appBaseUrl}/articles/${article.slug}`}, true, true,
          ${`2026-08-${String(25 - index).padStart(2, "0")}T03:00:00.000Z`},
          ${`2026-08-${String(25 - index).padStart(2, "0")}T04:00:00.000Z`}
        ) on conflict (id) do update set
          slug=excluded.slug,
          type=excluded.type,
          category=excluded.category,
          status=excluded.status,
          title=excluded.title,
          excerpt=excluded.excerpt,
          content_html=excluded.content_html,
          seo_title=excluded.seo_title,
          seo_description=excluded.seo_description,
          canonical_url=excluded.canonical_url,
          robots_index=excluded.robots_index,
          robots_follow=excluded.robots_follow,
          published_at=excluded.published_at,
          updated_at=excluded.updated_at
      `;
      for (const [sortOrder, institution] of relatedInstitutions.entries()) {
        await transaction`
          insert into article_institutions (article_id, institution_id, relation_type, sort_order)
          values (${article.id}, ${institution.id}, 'RELATED', ${sortOrder + 1})
          on conflict (article_id, institution_id, relation_type) do update set sort_order=excluded.sort_order
        `;
      }
      for (const [sortOrder, opportunity] of relatedOpportunities.entries()) {
        await transaction`
          insert into article_opportunities (article_id, opportunity_id, relation_type, sort_order)
          values (${article.id}, ${opportunity.id}, 'RELATED', ${sortOrder + 1})
          on conflict (article_id, opportunity_id, relation_type) do update set sort_order=excluded.sort_order
        `;
      }
    }

    return inspectPreviewDemo(transaction);
  });
}

export function assertPreviewSeedTarget(
  input: Readonly<{
    databaseUrl: string;
    projectName?: string;
    environmentName?: string;
    serviceName?: string;
  }>,
) {
  let databaseUrl: URL;
  try {
    databaseUrl = new URL(input.databaseUrl);
  } catch {
    throw new Error("Preview seed target was not proven");
  }
  if (
    !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
    input.projectName !== "preppy-ui-preview" ||
    input.environmentName !== "preview" ||
    input.serviceName !== "preppy-web-preview" ||
    !databaseUrl.hostname.endsWith(".railway.internal")
  ) {
    throw new Error("Preview seed target was not proven");
  }
  return {
    projectName: input.projectName,
    environmentName: input.environmentName,
    serviceName: input.serviceName,
    databaseHost: databaseUrl.hostname,
  };
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (mode !== "--seed" && mode !== "--inspect") {
    throw new Error("Usage: seed-preview-demo.ts --seed|--inspect");
  }
  const databaseUrl = process.env.DATABASE_URL ?? "";
  assertPreviewSeedTarget({
    databaseUrl,
    projectName: process.env.RAILWAY_PROJECT_NAME,
    environmentName: process.env.RAILWAY_ENVIRONMENT_NAME,
    serviceName: process.env.RAILWAY_SERVICE_NAME,
  });
  const expectedBaseUrl = `https://${process.env.RAILWAY_PUBLIC_DOMAIN ?? ""}`;
  const appBaseUrl = normalizeAppBaseUrl(process.env.APP_BASE_URL ?? "");
  if (appBaseUrl !== normalizeAppBaseUrl(expectedBaseUrl)) {
    throw new Error(
      "Preview APP_BASE_URL does not match the Railway public domain",
    );
  }
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const report =
      mode === "--seed"
        ? await seedPreviewDemo(sql, { appBaseUrl })
        : await inspectPreviewDemo(sql);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
