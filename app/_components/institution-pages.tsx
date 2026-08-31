import Link from "next/link";
import { publicAdmissionText } from "@/src/modules/public/admission-copy";
import { publicProse } from "@/src/modules/public/ux-writing";
import { admissionReadingItems } from "@/app/_lib/admissions-readability";
import { ReviewedAdmissions } from "./admissions-content";

import type {
  InstitutionDetailDTO,
  InstitutionListDTO,
  InstitutionListQuery,
  OfficialSourceDTO,
  OpportunityCardDTO,
} from "@/src/modules/public/dto";

import { TrackedFollowCta as FollowCta } from "@/app/_components/tracked-follow-cta";
import {
  ArticleCard,
  InstitutionCard,
  OpportunityCard,
  StateBadge,
  TrustSource,
  VerifiedAt,
} from "@/app/_components/public-cards";
import {
  EmptyState,
  PageContainer,
  Pagination,
  SectionHeader,
} from "@/app/_components/ui-primitives";
import {
  categoryLabel,
  factLabel,
  opportunityStateLabel,
} from "@/app/_lib/presentation";

const categories = [
  { value: "ENGLISH_KINDERGARTEN", label: "영어유치원" },
  { value: "PRIVATE_ELEMENTARY", label: "사립초등학교" },
  { value: "INTERNATIONAL_SCHOOL", label: "국제학교" },
] as const;

const states: OpportunityCardDTO["businessState"][] = [
  "OPEN",
  "UPCOMING",
  "CLOSED",
  "COMPLETED",
  "CANCELLED",
  "UNKNOWN",
];

function collectOfficialSources(data: InstitutionDetailDTO) {
  const sources = new Map<string, OfficialSourceDTO>();

  for (const fact of data.verifiedFacts) {
    if (fact.officialSource) {
      sources.set(fact.officialSource.url, fact.officialSource);
    }
  }

  for (const source of data.officialSources) {
    sources.set(source.url, source);
  }

  return [...sources.values()];
}

function institutionListHref(
  filters: InstitutionListQuery,
  page: number,
): string {
  const params = new URLSearchParams();
  if (filters.category) params.set("category", filters.category);
  if (filters.region) params.set("region", filters.region);
  if (filters.recruitmentState)
    params.set("recruitmentState", filters.recruitmentState);
  if (filters.query) params.set("query", filters.query);
  params.set("page", String(page));
  return `/institutions?${params.toString()}`;
}

function OpportunityGroup({
  title,
  opportunities,
  emptyMessage,
}: {
  title: string;
  opportunities: OpportunityCardDTO[];
  emptyMessage: string;
}) {
  return (
    <section className="institution-detail__section" aria-label={title}>
      <SectionHeader title={title} />
      {opportunities.length > 0 ? (
        <div className="institution-detail__cards">
          {opportunities.map((opportunity) => (
            <OpportunityCard key={opportunity.id} opportunity={opportunity} />
          ))}
        </div>
      ) : (
        <p className="detail-empty">{emptyMessage}</p>
      )}
    </section>
  );
}

export function InstitutionListView({
  data,
  filters,
}: {
  data: InstitutionListDTO;
  filters: InstitutionListQuery;
}) {
  return (
    <PageContainer>
      <div className="institution-list">
        <header className="institution-list__intro">
          <p className="eyebrow">기관 탐색</p>
          <h1>기관 찾기</h1>
          <p>학교와 기관을 찾고, 입학 일정과 지원 조건을 살펴보세요.</p>
        </header>

        <form
          action="/institutions"
          method="get"
          className="institution-filters"
        >
          <div>
            <label htmlFor="institution-category">기관 유형</label>
            <select
              id="institution-category"
              name="category"
              defaultValue={filters.category ?? ""}
            >
              <option value="">전체 유형</option>
              {categories.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="institution-region">지역</label>
            <input
              id="institution-region"
              name="region"
              defaultValue={filters.region ?? ""}
            />
          </div>
          <div>
            <label htmlFor="institution-recruitment-state">모집 상태</label>
            <select
              id="institution-recruitment-state"
              name="recruitmentState"
              defaultValue={filters.recruitmentState ?? ""}
            >
              <option value="">전체 상태</option>
              {states.map((state) => (
                <option key={state} value={state}>
                  {opportunityStateLabel(state)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="institution-query">기관명 검색</label>
            <input
              id="institution-query"
              name="query"
              defaultValue={filters.query ?? ""}
              type="search"
            />
          </div>
          <button type="submit">기관 검색</button>
        </form>

        <section aria-label="공개 기관">
          <SectionHeader
            eyebrow="검색 결과"
            title={`기관 ${data.pagination.total}곳`}
          />
          {data.items.length > 0 ? (
            <div className="institution-list__cards">
              {data.items.map((item) => (
                <InstitutionCard key={item.id} institution={item} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="조건에 맞는 기관을 찾지 못했어요"
              description="검색 조건을 조정하거나 다른 기관 유형을 살펴보세요."
            />
          )}
          <Pagination
            pagination={data.pagination}
            hrefForPage={(page) => institutionListHref(filters, page)}
          />
        </section>
      </div>
    </PageContainer>
  );
}

export function InstitutionDetailView({
  data,
}: {
  data: InstitutionDetailDTO;
}) {
  const { institution } = data;
  const officialSources = collectOfficialSources(data);
  const reviewedIds = new Set(
    data.reviewedAdmissions.map((admission) => admission.id),
  );
  const current = data.currentOpportunities.filter(
    (item) => !reviewedIds.has(item.id),
  );
  const upcoming = data.upcomingOpportunities.filter(
    (item) => !reviewedIds.has(item.id),
  );
  const recent = data.recentOpportunities.filter(
    (item) => !reviewedIds.has(item.id),
  );
  return (
    <PageContainer>
      <article className="institution-detail">
        <header className="institution-detail__hero">
          <p className="eyebrow">기관 정보</p>
          <div className="institution-detail__hero-content">
            <div>
              <h1>{institution.name}</h1>
              <p className="institution-detail__meta">
                {categoryLabel(institution.category)}
                {institution.region ? ` · ${institution.region}` : ""}
              </p>
              {institution.currentAdmissionsState ? (
                <StateBadge state={institution.currentAdmissionsState} />
              ) : null}
            </div>
            <FollowCta
              context="INSTITUTION"
              followable={institution.followable}
              institutionId={institution.id}
              returnPath={`/institutions/${institution.slug}`}
            />
          </div>
        </header>

        <ReviewedAdmissions admissions={data.reviewedAdmissions} />

        {current.length || !reviewedIds.size ? (
          <OpportunityGroup
            title="현재 모집·입학정보"
            opportunities={current}
            emptyMessage="프레피에 공개된 모집·입학정보가 아직 없어요. 학교 공식 안내도 함께 확인해 주세요."
          />
        ) : null}
        {upcoming.length > 0 ? (
          <OpportunityGroup
            title="예정된 모집·입학정보"
            opportunities={upcoming}
            emptyMessage="프레피에 공개된 예정 일정이 아직 없어요."
          />
        ) : null}
        {recent.length > 0 ? (
          <OpportunityGroup
            title="최근 모집·입학정보"
            opportunities={recent}
            emptyMessage="프레피에 공개된 최근 입학정보가 없어요."
          />
        ) : null}

        <section
          className="institution-detail__section"
          aria-label="확인된 기관 정보"
        >
          <SectionHeader
            title="확인된 기관 정보"
            description="공식 자료를 바탕으로 확인한 정보예요. 각 항목의 확인일과 아래 공식 출처를 함께 살펴보세요."
          />
          {data.verifiedFacts.length > 0 ? (
            <dl className="institution-facts">
              {data.verifiedFacts.map((fact) => (
                <div key={fact.factType}>
                  <dt>{factLabel(fact.factType)}</dt>
                  <dd>
                    <InstitutionFactText value={fact.displayValue} />
                    <VerifiedAt verifiedAt={fact.verifiedAt} label="확인일" />
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="detail-empty">
              프레피에서 확인한 기관 정보가 아직 없어요. 기관의 공식
              홈페이지에서 확인해 주세요.
            </p>
          )}
        </section>

        {officialSources.length > 0 ? (
          <section
            className="institution-detail__section"
            aria-label="공식 출처"
          >
            <SectionHeader
              title="공식 출처"
              description="기관 정보와 입학 안내를 확인할 때 참고한 공식 자료예요."
            />
            <div className="institution-sources">
              {officialSources.map((source) => (
                <TrustSource key={source.url} source={source} />
              ))}
            </div>
          </section>
        ) : null}

        {data.relatedArticles.length > 0 ? (
          <section
            className="institution-detail__section"
            aria-label="관련 아티클"
          >
            <SectionHeader title="관련 아티클" />
            <div className="institution-detail__cards">
              {data.relatedArticles.map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </div>
          </section>
        ) : null}
        <nav className="detail-return" aria-label="기관 탐색으로 돌아가기">
          <Link className="text-link" href="/institutions">
            다른 기관 찾아보기
          </Link>
        </nav>
      </article>
    </PageContainer>
  );
}

function InstitutionFactText({ value }: { value: string | null }) {
  const text = publicAdmissionText(value);
  if (!text) return "학교에 문의해 주세요.";
  const items = admissionReadingItems(text);
  return items.length > 1 ? (
    <ul className="institution-fact-items">
      {items.map((item, index) => (
        <li key={index}>{publicProse(item)}</li>
      ))}
    </ul>
  ) : (
    publicProse(text)
  );
}
