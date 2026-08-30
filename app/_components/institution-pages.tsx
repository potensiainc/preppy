import Link from "next/link";

import type {
  InstitutionDetailDTO,
  InstitutionListDTO,
  InstitutionListQuery,
  OfficialSourceDTO,
  OpportunityCardDTO,
  ReviewedAdmissionDTO,
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
  formatPublicDate,
  opportunityStateLabel,
} from "@/app/_lib/presentation";

function admissionKnowledgeLabel(
  state: ReviewedAdmissionDTO["knowledgeState"],
): string {
  if (state === "SCHEDULE_FOUND") return "공식 일정 확인됨";
  if (state === "NOT_ANNOUNCED") return "일정 미발표";
  return "관련 일정·지원 정보 미발견";
}

function AdmissionDate({
  label,
  start,
  end,
}: {
  label: string;
  start: string | null;
  end?: string | null;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {start ? (
          <>
            <time dateTime={start}>
              {formatPublicDate(start)}{" "}
              {new Intl.DateTimeFormat("ko-KR", {
                timeZone: "Asia/Seoul",
                hour: "2-digit",
                minute: "2-digit",
                hourCycle: "h23",
              }).format(new Date(start))}
            </time>
            {end ? (
              <>
                {" ~ "}
                <time dateTime={end}>
                  {formatPublicDate(end)}{" "}
                  {new Intl.DateTimeFormat("ko-KR", {
                    timeZone: "Asia/Seoul",
                    hour: "2-digit",
                    minute: "2-digit",
                    hourCycle: "h23",
                  }).format(new Date(end))}
                </time>
              </>
            ) : null}
          </>
        ) : (
          "확인된 일정 없음"
        )}
      </dd>
    </div>
  );
}

function ReviewedAdmissions({
  admissions,
}: {
  admissions: ReviewedAdmissionDTO[];
}) {
  if (admissions.length === 0) return null;
  return (
    <section className="institution-detail__section" aria-label="입학정보">
      <SectionHeader
        title="입학정보"
        description="공식 Source evidence와 운영자 검수까지 완료된 정보입니다."
      />
      <div className="institution-detail__cards">
        {admissions.map((admission) => (
          <article className="public-card opportunity-card" key={admission.id}>
            <div className="card-kicker">
              <span>{admission.academicYearLabel ?? "학년도 미확인"}</span>
              <span>{admissionKnowledgeLabel(admission.knowledgeState)}</span>
            </div>
            <h3>{admission.title}</h3>
            {admission.summary ? <p>{admission.summary}</p> : null}
            <dl className="institution-facts">
              {admission.kind === "RECRUITMENT" ? (
                <AdmissionDate
                  label="원서접수"
                  start={admission.keyDates.applicationOpensAt}
                  end={admission.keyDates.applicationClosesAt}
                />
              ) : null}
              {admission.keyDates.eventStartsAt ||
              admission.keyDates.eventEndsAt ? (
                <AdmissionDate
                  label={
                    admission.kind === "LOTTERY"
                      ? "추첨"
                      : admission.kind === "RESULT_ANNOUNCEMENT"
                        ? "결과 발표"
                        : "설명회 / Open House"
                  }
                  start={admission.keyDates.eventStartsAt}
                  end={admission.keyDates.eventEndsAt}
                />
              ) : null}
              <div>
                <dt>지원 대상 / 자격</dt>
                <dd>
                  {admission.targetAudience ?? "공식 Source에서 확인된 값 없음"}
                </dd>
              </div>
            </dl>
            {(admission.officialSources ?? [admission.officialSource]).map(
              (source) => (
                <TrustSource key={source.url} source={source} />
              ),
            )}
            <VerifiedAt
              verifiedAt={admission.lastCollectedAt}
              label="Last Collected"
            />
            <VerifiedAt
              verifiedAt={admission.lastVerifiedAt}
              label="Last Verified"
            />
          </article>
        ))}
      </div>
    </section>
  );
}

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
          <p>공개된 기관 정보와 확인 가능한 모집·입학정보를 찾아보세요.</p>
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
          <button type="submit">검색</button>
        </form>

        <section aria-label="공개 기관">
          <SectionHeader
            eyebrow="검색 결과"
            title="공개 기관"
            description={`${data.pagination.total}개의 기관을 확인할 수 있습니다.`}
          />
          {data.items.length > 0 ? (
            <div className="institution-list__cards">
              {data.items.map((item) => (
                <InstitutionCard key={item.id} institution={item} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="표시할 기관이 없습니다."
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

        <OpportunityGroup
          title="현재 모집·입학정보"
          opportunities={data.currentOpportunities}
          emptyMessage="현재 공개된 모집·입학정보가 없습니다."
        />
        {data.upcomingOpportunities.length > 0 ? (
          <OpportunityGroup
            title="예정된 모집·입학정보"
            opportunities={data.upcomingOpportunities}
            emptyMessage="예정된 모집·입학정보가 없습니다."
          />
        ) : null}
        {data.recentOpportunities.length > 0 ? (
          <OpportunityGroup
            title="최근 모집·입학정보"
            opportunities={data.recentOpportunities}
            emptyMessage="최근 모집·입학정보가 없습니다."
          />
        ) : null}

        <section
          className="institution-detail__section"
          aria-label="확인된 기관 정보"
        >
          <SectionHeader
            title="확인된 기관 정보"
            description="검증된 항목과 확인일을 표시합니다. 근거가 된 공식 자료는 아래에서 한 번에 확인할 수 있습니다."
          />
          {data.verifiedFacts.length > 0 ? (
            <dl className="institution-facts">
              {data.verifiedFacts.map((fact) => (
                <div key={fact.factType}>
                  <dt>{factLabel(fact.factType)}</dt>
                  <dd>
                    {fact.displayValue ?? "표시 가능한 정보가 없습니다."}
                    <VerifiedAt verifiedAt={fact.verifiedAt} label="확인일" />
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="detail-empty">현재 확인된 기관 정보가 없습니다.</p>
          )}
        </section>

        {officialSources.length > 0 ? (
          <section
            className="institution-detail__section"
            aria-label="공식 출처"
          >
            <SectionHeader
              title="공식 출처"
              description="기관 정보와 모집·입학정보 확인에 사용한 자료입니다."
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
