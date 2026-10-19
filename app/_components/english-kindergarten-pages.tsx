import {
  sessionBookingLabel,
  sessionActionLabel,
  sessionEventLabel,
} from "@/src/modules/english-kindergarten/session-state";
import { EnglishKindergartenFilterForm } from "./english-kindergarten-filter-form";
import { publicRegionLabel } from "@/app/_lib/public-region-label";
import { FollowCta } from "@/app/_components/follow-cta";
import Link from "next/link";
import { CategoryNavigation } from "./page-navigation";

import {
  formatPublicDate,
  formatPublicDateTime,
  safeExternalHref,
} from "@/app/_lib/presentation";
import { EmptyState, PageContainer, Pagination } from "./ui-primitives";

import type {
  EnglishKindergartenCardSummaryDTO,
  EnglishKindergartenDetailDTO,
  EnglishKindergartenFactDTO,
  EnglishKindergartenSectionDTO,
  InstitutionDetailDTO,
  InstitutionListDTO,
  InstitutionListQuery,
  OfficialSourceDTO,
} from "@/src/modules/public/dto";
import { SEOUL_REGION_CODE } from "@/src/modules/public/location";

const detailAnchors = [
  ["tuition", "원비"],
  ["information-session", "입학설명회"],
  ["age-curriculum", "연령·커리큘럼"],
  ["transport", "셔틀"],
  ["meals", "급식"],
  ["review-summary", "후기 요약"],
  ["official-sources", "공식 출처"],
] as const;

const cadenceLabels = {
  MONTHLY: "월",
  QUARTERLY: "분기",
  SEMESTER: "학기",
  ANNUAL: "연",
  ONE_TIME: "1회",
} as const;

const ageBasisLabels = {
  KOREAN_AGE: "한국식 나이 기준",
  INTERNATIONAL_AGE: "만 나이 기준",
  INSTITUTION_DEFINED: "기관 기준",
} as const;

type FactOf<T extends EnglishKindergartenFactDTO["factType"]> = Omit<
  EnglishKindergartenFactDTO,
  "factType" | "value"
> & {
  factType: T;
  value: Extract<EnglishKindergartenFactDTO["value"], { factType: T }>;
};

function coverageFor(
  data:
    | Pick<EnglishKindergartenDetailDTO, "sections">
    | Pick<EnglishKindergartenCardSummaryDTO, "coverage">,
  section: EnglishKindergartenSectionDTO["section"],
) {
  const values = "sections" in data ? data.sections : data.coverage;
  return values.find((item) => item.section === section);
}

function coverageText(
  data:
    | Pick<EnglishKindergartenDetailDTO, "sections">
    | Pick<EnglishKindergartenCardSummaryDTO, "coverage">,
  section: EnglishKindergartenSectionDTO["section"],
  fallback: string,
) {
  return coverageFor(data, section)?.message ?? fallback;
}

function findFact<T extends EnglishKindergartenFactDTO["factType"]>(
  data: EnglishKindergartenDetailDTO,
  factType: T,
): FactOf<T> | undefined {
  return data.facts.find(
    (fact): fact is FactOf<T> => fact.factType === factType,
  );
}

function institutionListHref(filters: InstitutionListQuery, page: number) {
  const params = new URLSearchParams({ category: "ENGLISH_KINDERGARTEN" });
  if (filters.region) params.set("region", filters.region);
  if (filters.district) params.set("district", filters.district);
  if (filters.query) params.set("query", filters.query);
  if (filters.hasConfirmedTuition) params.set("hasConfirmedTuition", "true");
  if (filters.minAge) params.set("minAge", String(filters.minAge));
  if (filters.admissionYear)
    params.set("admissionYear", String(filters.admissionYear));
  if (filters.transport) params.set("transport", filters.transport);
  if (filters.hasUpcomingInfoSession)
    params.set("hasUpcomingInfoSession", "true");
  if (filters.sort) params.set("sort", filters.sort);
  params.set("page", String(page));
  return `/institutions?${params.toString()}`;
}

function districtListHref(
  filters: InstitutionListQuery,
  district: string | null,
) {
  const params = new URLSearchParams({
    category: "ENGLISH_KINDERGARTEN",
    region: filters.region ?? SEOUL_REGION_CODE,
  });
  if (district) params.set("district", district);
  if (filters.query) params.set("query", filters.query);
  if (filters.hasConfirmedTuition) params.set("hasConfirmedTuition", "true");
  if (filters.minAge) params.set("minAge", String(filters.minAge));
  if (filters.admissionYear)
    params.set("admissionYear", String(filters.admissionYear));
  if (filters.transport) params.set("transport", filters.transport);
  if (filters.hasUpcomingInfoSession)
    params.set("hasUpcomingInfoSession", "true");
  if (filters.sort) params.set("sort", filters.sort);
  params.set("page", "1");
  return `/institutions?${params.toString()}`;
}

function resetComparisonHref(filters: InstitutionListQuery) {
  const params = new URLSearchParams({
    category: "ENGLISH_KINDERGARTEN",
    region: filters.region ?? SEOUL_REGION_CODE,
  });
  if (filters.district) params.set("district", filters.district);
  params.set("page", "1");
  return `/institutions?${params.toString()}`;
}

function DistrictPicker({
  data,
  filters,
}: {
  data: InstitutionListDTO;
  filters: InstitutionListQuery;
}) {
  const total = data.districtFacets.reduce(
    (sum, facet) => sum + facet.count,
    0,
  );
  const selectedCount = filters.district
    ? (data.districtFacets.find((facet) => facet.district === filters.district)
        ?.count ?? 0)
    : total;
  const summary = filters.district
    ? `${filters.district} · ${selectedCount}곳`
    : `서울 전체 · ${total}곳`;

  return (
    <section className="ek-district-picker" aria-labelledby="ek-district-title">
      <div className="ek-district-picker__intro">
        <div>
          <p className="eyebrow">통학 범위부터 선택</p>
          <h2 id="ek-district-title">서울 자치구</h2>
        </div>
        <p>집에서 다니기 편한 자치구를 먼저 살펴보세요.</p>
      </div>
      <details aria-label="서울 자치구 선택">
        <summary>{summary}</summary>
        <nav aria-label="서울 자치구" className="ek-district-grid">
          <Link
            aria-current={filters.district ? undefined : "page"}
            href={districtListHref(filters, null)}
          >
            <span>서울 전체</span>
            <span>{total}곳</span>
          </Link>
          {data.districtFacets.map((facet) => (
            <Link
              aria-current={
                filters.district === facet.district ? "page" : undefined
              }
              href={districtListHref(filters, facet.district)}
              key={facet.district}
            >
              <span>{facet.district}</span>
              <span>{facet.count}곳</span>
            </Link>
          ))}
        </nav>
      </details>
    </section>
  );
}

function SummaryValue({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string | null;
}) {
  return (
    <div className="ek-summary-value">
      <dt>{label}</dt>
      <dd>
        <strong>{value}</strong>
        {note ? <span>{note}</span> : null}
      </dd>
    </div>
  );
}

function SummaryGrid({
  summary,
}: {
  summary: EnglishKindergartenCardSummaryDTO;
}) {
  const session = summary.nextInformationSession;
  const knownTransport =
    summary.transport.verifiedAt && summary.transport.state !== "UNKNOWN";
  if (!summary.tuition && !summary.ageRange && !knownTransport && !session) {
    return (
      <p className="ek-card__checked">
        PREPPY에 등록된 원비·운영 연령·셔틀·설명회 정보가 없어요.
      </p>
    );
  }
  return (
    <dl className="ek-summary-grid">
      {session ? (
        <SummaryValue
          label="다음 설명회"
          value={formatPublicDateTime(session.eventStartsAt)}
          note={[session.targetAudience, sessionBookingLabel(session)]
            .filter(Boolean)
            .join(" · ")}
        />
      ) : null}
      {summary.tuition ? (
        <SummaryValue
          label="원비"
          value={
            summary.tuition.displayText ?? formatTuitionValue(summary.tuition)
          }
        />
      ) : null}
      {summary.ageRange ? (
        <SummaryValue
          label="운영 연령"
          value={
            summary.ageRange.displayText ?? formatAgeRange(summary.ageRange)
          }
          note={ageBasisLabels[summary.ageRange.basis]}
        />
      ) : null}
      {knownTransport ? (
        <SummaryValue
          label="셔틀"
          value={
            summary.transport.displayText ?? formatTransport(summary.transport)
          }
        />
      ) : null}
    </dl>
  );
}

function EnglishKindergartenCard({
  institution,
  returnHref,
}: {
  returnHref: string;
  institution: InstitutionListDTO["items"][number];
}) {
  const summary = institution.englishKindergarten;
  if (!summary) return null;
  const detailHref = `/institutions/${institution.slug}?returnTo=${encodeURIComponent(returnHref)}`;

  return (
    <article className="ek-card">
      <header className="ek-card__header">
        <div>
          <p className="ek-card__region">
            {institution.district ??
              (institution.region
                ? publicRegionLabel(institution.region)
                : "지역 확인 중")}
          </p>
          <h2>
            <Link href={detailHref}>{institution.name}</Link>
          </h2>
          {institution.matchedAlias ? (
            <p>기관 별칭: {institution.matchedAlias}</p>
          ) : null}
          {institution.address ? (
            <p className="ek-card__address">{institution.address}</p>
          ) : null}
        </div>
        <FollowCta
          institutionId={institution.id}
          followable={institution.followable}
          context="INSTITUTION"
          returnPath={`/institutions/${institution.slug}`}
        />
      </header>
      <SummaryGrid summary={summary} />
      {summary.nextInformationSession &&
      !summary.nextInformationSession.title.startsWith(institution.name) ? (
        <p>{summary.nextInformationSession.title}</p>
      ) : null}
      {summary.informationSessions?.length ? (
        <div>
          <p>
            예정 설명회 {summary.informationSessions.length}회 · 예약 마감
            회차도 포함해요.
          </p>
          <Link href={detailHref}>기관의 전체 설명회 일정 보기</Link>
        </div>
      ) : null}
      {(summary.tuition ||
        summary.ageRange ||
        summary.transport.verifiedAt ||
        summary.nextInformationSession) &&
      summary.lastContentCheckedAt ? (
        <p className="ek-card__checked">
          내용 확인{" "}
          <time dateTime={summary.lastContentCheckedAt}>
            {formatPublicDate(summary.lastContentCheckedAt)}
          </time>
        </p>
      ) : null}
    </article>
  );
}

export function EnglishKindergartenListView({
  data,
  filters,
}: {
  data: InstitutionListDTO;
  filters: InstitutionListQuery;
}) {
  const hasNarrowingCondition = Boolean(
    filters.admissionYear ||
    filters.query ||
    filters.hasConfirmedTuition ||
    filters.minAge ||
    filters.transport ||
    filters.hasUpcomingInfoSession,
  );
  const hasUncoveredDistrict = Boolean(
    filters.district && !hasNarrowingCondition && data.pagination.total === 0,
  );

  return (
    <PageContainer>
      <div className="ek-list">
        <header className="ek-list__intro">
          <p className="eyebrow">영어유치원 비교</p>
          <h1>영어유치원 비교하기</h1>
          <p>캠퍼스별 입학설명회와 모집 대상을 찾아보세요.</p>
        </header>

        <CategoryNavigation selected="ENGLISH_KINDERGARTEN" />
        {filters.region === SEOUL_REGION_CODE ? (
          <DistrictPicker data={data} filters={filters} />
        ) : null}
        <nav aria-label="설명회 검색 지역">
          {[
            ["KR-11", "서울"],
            ["KR-41", "경기"],
            ["KR-28", "인천"],
          ].map(([region, label]) => (
            <Link
              key={region}
              href={institutionListHref(
                { ...filters, region, district: undefined },
                1,
              )}
              aria-current={filters.region === region ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>

        <p>
          연령은 모집 학년도에 기관이 표기한 나이예요. 회차별 대상을 확인해
          주세요.
        </p>
        <details className="filter-disclosure" open={true}>
          <summary>
            비교 조건 <span>기관명 · 연령 · 셔틀 · 설명회</span>
          </summary>
          <EnglishKindergartenFilterForm
            key={institutionListHref(filters, data.pagination.page)}
            action="/institutions"
            method="get"
            className="ek-filters"
          >
            <input type="hidden" name="category" value="ENGLISH_KINDERGARTEN" />
            <input
              type="hidden"
              name="region"
              value={filters.region ?? "KR-11"}
            />
            {filters.district ? (
              <input type="hidden" name="district" value={filters.district} />
            ) : null}
            <div className="ek-filter ek-filter--search">
              <label htmlFor="ek-query">기관명</label>
              <input
                id="ek-query"
                type="search"
                name="query"
                defaultValue={filters.query ?? ""}
                placeholder="기관명을 입력해 주세요"
              />
            </div>
            <div className="ek-filter">
              <label htmlFor="ek-year">모집 학년도</label>
              <select
                id="ek-year"
                name="admissionYear"
                defaultValue={filters.admissionYear ?? ""}
              >
                <option value="">전체 학년도</option>
                {[2026, 2027, 2028].map((year) => (
                  <option value={year} key={year}>
                    {year}학년도
                  </option>
                ))}
              </select>
            </div>
            <div className="ek-filter">
              <label htmlFor="ek-age">모집 대상 연령</label>
              <select
                id="ek-age"
                name="minAge"
                defaultValue={filters.minAge ?? ""}
              >
                <option value="">전체 연령</option>
                {[3, 4, 5, 6, 7].map((age) => (
                  <option value={age} key={age}>
                    {age}세
                  </option>
                ))}
              </select>
            </div>
            <div className="ek-filter">
              <label htmlFor="ek-sort">정렬</label>
              <select
                id="ek-sort"
                name="sort"
                defaultValue={filters.sort ?? "NAME_ASC"}
              >
                <option value="NAME_ASC">가나다순</option>
                <option value="TUITION_ASC">월 원비 낮은 순</option>
                <option value="INFO_SESSION_ASC">설명회 빠른 순</option>
              </select>
            </div>
            <fieldset className="ek-filter-options">
              <legend>비교 조건</legend>
              <label>
                <input
                  type="checkbox"
                  name="hasConfirmedTuition"
                  value="true"
                  defaultChecked={filters.hasConfirmedTuition}
                />
                확인된 원비
              </label>
              <label>
                <input
                  type="checkbox"
                  name="transport"
                  value="AVAILABLE"
                  defaultChecked={filters.transport === "AVAILABLE"}
                />
                셔틀 운영
              </label>
              <label>
                <input
                  type="checkbox"
                  name="hasUpcomingInfoSession"
                  value="true"
                  defaultChecked={filters.hasUpcomingInfoSession}
                />
                예정 설명회
              </label>
            </fieldset>
            <button type="submit">조건 적용</button>
          </EnglishKindergartenFilterForm>
        </details>

        <section aria-labelledby="ek-result-title">
          <div className="ek-result-heading">
            <div>
              <p className="eyebrow">검색 결과</p>
              <h2 id="ek-result-title">
                {filters.district
                  ? `${filters.district} 영어유치원 ${data.pagination.total}곳`
                  : `${publicRegionLabel(filters.region ?? SEOUL_REGION_CODE)} 영어유치원 ${data.pagination.total}곳`}
              </h2>
            </div>
            <p>예약 상태와 잔여석은 공식 페이지에서 확인해 주세요.</p>
          </div>
          {data.matchingSessionCount !== undefined ? (
            <p>
              조건에 맞는 예정 설명회 {data.matchingSessionCount}회 ·{" "}
              {data.pagination.total}개 캠퍼스
            </p>
          ) : null}
          {data.items.length > 0 ? (
            <div className="ek-card-list">
              {data.items.map((item) => (
                <EnglishKindergartenCard
                  key={item.id}
                  institution={item}
                  returnHref={institutionListHref(
                    filters,
                    data.pagination.page,
                  )}
                />
              ))}
            </div>
          ) : (
            <div className="ek-empty-result">
              <EmptyState
                title={
                  hasUncoveredDistrict
                    ? `현재 ${filters.district}에 공개된 영어유치원이 없어요`
                    : filters.hasUpcomingInfoSession
                      ? "조건에 맞게 등록된 설명회 일정이 없어요"
                      : "조건에 맞게 등록된 영어유치원이 없어요"
                }
                description={
                  hasUncoveredDistrict
                    ? "서울 전체 목록에서 다른 자치구를 살펴보세요."
                    : "설명회가 없다는 뜻은 아니에요. 아직 등록되지 않았거나 확인이 필요한 일정이 있을 수 있어요. 조건을 넓혀 보세요."
                }
              />
              <Link
                className="button-link button-link--secondary"
                href={
                  hasUncoveredDistrict
                    ? districtListHref(filters, null)
                    : resetComparisonHref(filters)
                }
              >
                {hasUncoveredDistrict ? "서울 전체 보기" : "비교 조건 초기화"}
              </Link>
            </div>
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

function FactFreshness({ fact }: { fact: EnglishKindergartenFactDTO }) {
  return (
    <dl className="ek-freshness">
      {fact.lastCollectedAt ? (
        <div>
          <dt>자료 수집</dt>
          <dd>
            <time dateTime={fact.lastCollectedAt}>
              {formatPublicDate(fact.lastCollectedAt)}
            </time>
          </dd>
        </div>
      ) : null}
      <div>
        <dt>내용 확인</dt>
        <dd>
          <time dateTime={fact.verifiedAt}>
            {formatPublicDate(fact.verifiedAt)}
          </time>
        </dd>
      </div>
    </dl>
  );
}

function SectionShell({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="ek-detail__section"
      aria-labelledby={`${id}-title`}
    >
      <header className="ek-section-heading">
        <h2 id={`${id}-title`}>{title}</h2>
        {description ? <p>{description}</p> : null}
      </header>
      {children}
    </section>
  );
}

function SectionMessage({ children }: { children: React.ReactNode }) {
  return <p className="ek-section-message">{children}</p>;
}

function TuitionSection({ data }: { data: EnglishKindergartenDetailDTO }) {
  const fact = findFact(data, "TUITION");
  if (!fact) {
    return (
      <SectionMessage>
        {coverageText(data, "TUITION", "원비 내용을 확인하고 있어요.")}
      </SectionMessage>
    );
  }
  const value = fact.value;
  return (
    <div className="ek-fact-panel">
      <p className="ek-fact-panel__lead">
        {fact.displayText ?? formatTuitionValue(value)}
      </p>
      {value.programFees.length > 0 ? (
        <dl className="ek-detail-list">
          {value.programFees.map((fee) => (
            <div key={fee.label}>
              <dt>{fee.label}</dt>
              <dd>
                {formatMoneyRange(fee.amountMin, fee.amountMax, fee.cadence)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {value.extraCosts.length > 0 ? (
        <div className="ek-fact-block">
          <h3>추가 비용</h3>
          <ul>
            {value.extraCosts.map((cost) => (
              <li key={cost.label}>
                {cost.label} · {formatMoney(cost.amount)}
                {cost.cadence ? ` · ${cadenceLabels[cost.cadence]} 기준` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {value.includedItems.length > 0 ? (
        <p>포함 항목: {value.includedItems.join(", ")}</p>
      ) : null}
      {value.refundTerms ? <p>{value.refundTerms}</p> : null}
      {value.changeNote ? (
        <p className="ek-caution">{value.changeNote}</p>
      ) : null}
      <FactFreshness fact={fact} />
    </div>
  );
}

function formatMoney(value: number | null) {
  return value === null
    ? "금액은 기관에 확인해 주세요."
    : `${value.toLocaleString("ko-KR")}원`;
}

function formatMoneyRange(
  min: number | null,
  max: number | null,
  cadence: keyof typeof cadenceLabels | null,
) {
  const amount =
    min === null
      ? "금액은 기관에 확인해 주세요."
      : max !== null && max !== min
        ? `${min.toLocaleString("ko-KR")}~${max.toLocaleString("ko-KR")}원`
        : `${min.toLocaleString("ko-KR")}원`;
  return cadence ? `${cadenceLabels[cadence]} ${amount}` : amount;
}

function formatTuitionValue(value: {
  academicYearLabel: string | null;
  validityNote?: string | null;
  billingCadence: keyof typeof cadenceLabels | null;
  amountMin: number | null;
  amountMax: number | null;
}) {
  const basis = value.academicYearLabel ?? value.validityNote ?? null;
  const amount = formatMoneyRange(
    value.amountMin,
    value.amountMax,
    value.billingCadence,
  );
  return basis ? `${basis} · ${amount}` : amount;
}

function formatAgeRange(value: {
  min: number;
  max: number;
  basis: keyof typeof ageBasisLabels;
  academicYearLabel: string | null;
}) {
  const prefix =
    value.basis === "INTERNATIONAL_AGE"
      ? "만"
      : value.basis === "KOREAN_AGE"
        ? "한국식 나이"
        : "기관 기준";
  const range =
    value.min === value.max ? `${value.min}` : `${value.min}~${value.max}`;
  const label = `${prefix} ${range}세`;
  return value.academicYearLabel
    ? `${value.academicYearLabel} · ${label}`
    : label;
}

function formatTransport(value: {
  state: "AVAILABLE" | "NOT_AVAILABLE" | "UNKNOWN";
  serviceAreas: string[];
}) {
  if (value.state === "NOT_AVAILABLE") return "운영하지 않아요.";
  if (value.state === "UNKNOWN") return "운영 여부를 확인하고 있어요.";
  return value.serviceAreas.length > 0
    ? `운영 · ${value.serviceAreas.join(", ")}`
    : "운영해요.";
}

function InformationSessionSection({
  data,
}: {
  data: EnglishKindergartenDetailDTO;
}) {
  const sessions =
    data.informationSessions ??
    (data.nextInformationSession ? [data.nextInformationSession] : []);
  if (sessions.length === 0)
    return (
      <SectionMessage>
        {coverageFor(data, "INFORMATION_SESSION")?.status === "ACCESS_FAILED"
          ? "공식 페이지를 불러오지 못해 설명회 일정을 확인할 수 없어요. 캠퍼스에 문의해 주세요."
          : coverageFor(data, "INFORMATION_SESSION")?.status ===
              "CHECKED_NOT_FOUND"
            ? "최근 확인한 공식 안내에는 예정 설명회 일정이 없어요. 이후 일정은 캠퍼스 공식 안내를 확인해 주세요."
            : coverageFor(data, "INFORMATION_SESSION")?.status ===
                "NEEDS_REVIEW"
              ? "설명회 날짜나 대상에 확인이 필요한 내용이 있어요. 정확한 일정은 캠퍼스에 문의해 주세요."
              : "PREPPY에 등록된 예정 설명회 일정이 없어요. 캠퍼스의 설명회 개최 여부는 공식 안내를 확인해 주세요."}
        {coverageFor(data, "INFORMATION_SESSION")?.lastCheckedAt
          ? ` (${formatPublicDate(coverageFor(data, "INFORMATION_SESSION")!.lastCheckedAt!)} 기준)`
          : null}
      </SectionMessage>
    );
  return (
    <div>
      {sessions.map((session) => {
        const actionHref = session.actionUrl
          ? safeExternalHref(session.actionUrl)
          : null;
        const booking = sessionBookingLabel(session);
        return (
          <article
            className="ek-session-card"
            key={session.id}
            id={`session-${session.id}`}
          >
            <h3>{session.title}</h3>
            <p>{sessionEventLabel(session)}</p>
            <dl className="ek-detail-list">
              <div>
                <dt>행사 일시</dt>
                <dd>
                  <time dateTime={session.eventStartsAt}>
                    {formatPublicDateTime(session.eventStartsAt)}
                  </time>{" "}
                  (KST)
                </dd>
              </div>
              {session.targetAudience ? (
                <div>
                  <dt>모집 대상</dt>
                  <dd>{session.targetAudience}</dd>
                </div>
              ) : null}
              <div>
                <dt>예약 상태</dt>
                <dd>{booking}</dd>
              </div>
              <div>
                <dt>신청 마감</dt>
                <dd>
                  {session.applicationClosesAt ? (
                    <time dateTime={session.applicationClosesAt}>
                      {formatPublicDateTime(session.applicationClosesAt)}
                    </time>
                  ) : (
                    "신청 마감 시각은 공식 페이지에서 확인해 주세요."
                  )}
                </dd>
              </div>
            </dl>
            {session.bookingNote ? <p>{session.bookingNote}</p> : null}
            {actionHref ? (
              <a
                className="ek-action-link"
                href={actionHref}
                target="_blank"
                rel="noopener noreferrer"
              >
                {sessionActionLabel(actionHref, booking === "예약 마감")}
              </a>
            ) : null}
            {session.officialSource ? (
              <a
                href={safeExternalHref(session.officialSource.url) ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
              >
                공식 일정 출처
              </a>
            ) : null}
            <p>
              내용 확인{" "}
              <time dateTime={session.verifiedAt}>
                {formatPublicDate(session.verifiedAt)}
              </time>
            </p>
            {session.lastCollectedAt ? (
              <p>자료 수집 {formatPublicDate(session.lastCollectedAt)}</p>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function AgeCurriculumSection({
  data,
}: {
  data: EnglishKindergartenDetailDTO;
}) {
  const age = findFact(data, "TARGET_AGE_GRADE");
  const curriculum = findFact(data, "CURRICULUM");
  if (!age && !curriculum) {
    return (
      <SectionMessage>
        {coverageText(
          data,
          "TARGET_AGE_GRADE",
          "운영 연령과 커리큘럼을 확인하고 있어요.",
        )}
      </SectionMessage>
    );
  }
  return (
    <div className="ek-split-panels">
      {age ? (
        <div className="ek-fact-panel">
          <h3>운영 연령</h3>
          <p className="ek-fact-panel__lead">
            {age.displayText ??
              formatAgeRange({
                min: age.value.minAge,
                max: age.value.maxAge,
                basis: age.value.ageBasis,
                academicYearLabel: age.value.academicYearLabel,
              })}
          </p>
          <p>{ageBasisLabels[age.value.ageBasis]}</p>
          {age.value.classes.length > 0 ? (
            <ul>
              {age.value.classes.map((item) => (
                <li key={item.name}>
                  {item.name} · {item.minAge}~{item.maxAge}세
                </li>
              ))}
            </ul>
          ) : null}
          {age.value.midyearAdmission?.conditions ? (
            <p>{age.value.midyearAdmission.conditions}</p>
          ) : null}
          <FactFreshness fact={age} />
        </div>
      ) : null}
      {curriculum ? (
        <div className="ek-fact-panel">
          <h3>커리큘럼</h3>
          {curriculum.displayText ? (
            <p className="ek-fact-panel__lead">{curriculum.displayText}</p>
          ) : null}
          {curriculum.value.instructionalLanguages.length > 0 ? (
            <p>
              수업 언어:{" "}
              {curriculum.value.instructionalLanguages
                .map((item) =>
                  item.percentage === null
                    ? item.language
                    : `${item.language} ${item.percentage}%`,
                )
                .join(", ")}
            </p>
          ) : null}
          {curriculum.value.components.length > 0 ? (
            <p>주요 수업: {curriculum.value.components.join(", ")}</p>
          ) : null}
          {curriculum.value.specialActivities.length > 0 ? (
            <p>특별활동: {curriculum.value.specialActivities.join(", ")}</p>
          ) : null}
          {curriculum.value.dailySchedule ? (
            <p>{curriculum.value.dailySchedule}</p>
          ) : null}
          {curriculum.value.classVariations ? (
            <p>{curriculum.value.classVariations}</p>
          ) : null}
          <FactFreshness fact={curriculum} />
        </div>
      ) : null}
    </div>
  );
}

function TransportSection({ data }: { data: EnglishKindergartenDetailDTO }) {
  const fact = findFact(data, "TRANSPORT");
  if (!fact) {
    return (
      <SectionMessage>
        {coverageText(data, "TRANSPORT", "셔틀 내용을 확인하고 있어요.")}
      </SectionMessage>
    );
  }
  return (
    <div className="ek-fact-panel">
      <p className="ek-fact-panel__lead">
        {fact.displayText ??
          formatTransport({
            state: fact.value.isAvailable ? "AVAILABLE" : "NOT_AVAILABLE",
            serviceAreas: fact.value.serviceAreas,
          })}
      </p>
      {fact.value.serviceAreas.length > 0 ? (
        <p>운행 지역: {fact.value.serviceAreas.join(", ")}</p>
      ) : null}
      {fact.value.routes.length > 0 ? (
        <dl className="ek-detail-list">
          {fact.value.routes.map((route) => (
            <div key={route.name}>
              <dt>{route.name}</dt>
              <dd>
                {route.areas.join(", ")}
                {route.fee !== null ? ` · ${formatMoney(route.fee)}` : ""}
                {route.note ? ` · ${route.note}` : ""}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {fact.value.restrictions ? <p>{fact.value.restrictions}</p> : null}
      {fact.value.inquiryRequired ? (
        <p className="ek-caution">
          운행 지역, 좌석과 비용은 기관에 다시 확인해 주세요.
        </p>
      ) : null}
      <FactFreshness fact={fact} />
    </div>
  );
}

function MealsSection({ data }: { data: EnglishKindergartenDetailDTO }) {
  const fact = findFact(data, "MEALS");
  if (!fact) {
    return (
      <SectionMessage>
        {coverageText(data, "MEALS", "급식 내용을 확인하고 있어요.")}
      </SectionMessage>
    );
  }
  const value = fact.value;
  return (
    <div className="ek-fact-panel">
      {fact.displayText ? (
        <p className="ek-fact-panel__lead">{fact.displayText}</p>
      ) : null}
      <dl className="ek-detail-list">
        <div>
          <dt>식사</dt>
          <dd>
            {value.mealProvided === null
              ? "제공 여부는 캠퍼스에 문의해 주세요."
              : value.mealProvided
                ? "제공해요."
                : "제공하지 않아요."}
          </dd>
        </div>
        <div>
          <dt>간식</dt>
          <dd>
            {value.snackProvided === null
              ? "제공 여부는 캠퍼스에 문의해 주세요."
              : value.snackProvided
                ? "제공해요."
                : "제공하지 않아요."}
          </dd>
        </div>
        {value.extraCost !== null ? (
          <div>
            <dt>추가 비용</dt>
            <dd>{formatMoney(value.extraCost)}</dd>
          </div>
        ) : null}
      </dl>
      {value.allergyPolicy ? <p>{value.allergyPolicy}</p> : null}
      <FactFreshness fact={fact} />
    </div>
  );
}

function ReviewSection({ data }: { data: EnglishKindergartenDetailDTO }) {
  const review = data.reviewInsight;
  if (!review) {
    return (
      <SectionMessage>
        {coverageText(data, "REVIEWS", "후기 내용을 확인하고 있어요.")}
      </SectionMessage>
    );
  }
  return (
    <div className="ek-review-panel">
      <p className="ek-review-disclaimer">공개 후기 요약 · 공식 정보 아님</p>
      <p>공개 후기 {review.sampleSize}건 기준이에요.</p>
      {review.periodStart && review.periodEnd ? (
        <p>
          검토 기간: {formatPublicDate(review.periodStart)}~
          {formatPublicDate(review.periodEnd)}
        </p>
      ) : null}
      <ul className="ek-review-themes">
        {review.themes.map((theme) => (
          <li key={theme.summary}>
            <strong>{theme.summary}</strong>
            {theme.mentionCount ? (
              <span>{theme.mentionCount}건에서 언급됐어요.</span>
            ) : null}
          </li>
        ))}
      </ul>
      {review.limitations ? (
        <p className="ek-caution">{review.limitations}</p>
      ) : null}
      <dl className="ek-freshness">
        {review.lastCollectedAt ? (
          <div>
            <dt>자료 수집</dt>
            <dd>
              <time dateTime={review.lastCollectedAt}>
                {formatPublicDate(review.lastCollectedAt)}
              </time>
            </dd>
          </div>
        ) : null}
        <div>
          <dt>내용 확인</dt>
          <dd>
            <time dateTime={review.verifiedAt}>
              {formatPublicDate(review.verifiedAt)}
            </time>
          </dd>
        </div>
      </dl>
      {review.sources.length > 0 ? (
        <div className="ek-review-sources">
          {review.sources.map((source) => {
            const href = safeExternalHref(source.url);
            return href ? (
              <a
                key={source.url}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {source.name} 열기
              </a>
            ) : null;
          })}
        </div>
      ) : null}
    </div>
  );
}

function collectOfficialSources(
  data: InstitutionDetailDTO,
): OfficialSourceDTO[] {
  const sources = new Map<string, OfficialSourceDTO>();
  for (const source of data.officialSources) sources.set(source.url, source);
  for (const source of data.englishKindergarten?.facts.flatMap(
    (fact) => fact.officialSources,
  ) ?? []) {
    sources.set(source.url, source);
  }
  for (const session of data.englishKindergarten?.informationSessions ?? []) {
    if (session.officialSource)
      sources.set(session.officialSource.url, session.officialSource);
  }
  return [...sources.values()];
}

function OfficialSourcesSection({ data }: { data: InstitutionDetailDTO }) {
  const sources = collectOfficialSources(data);
  if (sources.length === 0) {
    return <SectionMessage>공식 출처를 정리하고 있어요.</SectionMessage>;
  }
  return (
    <div className="ek-official-sources">
      {sources.map((source) => {
        const href = safeExternalHref(source.url);
        if (!href) return null;
        return (
          <a
            key={source.url}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span>{source.name}</span>
            <strong>공식 안내 보기</strong>
          </a>
        );
      })}
    </div>
  );
}

export function EnglishKindergartenDetailView({
  data,
  returnTo,
}: {
  data: InstitutionDetailDTO;
  returnTo?: string;
}) {
  const profile = data.englishKindergarten;
  if (!profile) return null;
  const institution = data.institution;
  const listHref =
    returnTo?.startsWith("/institutions?") &&
    new URLSearchParams(returnTo.split("?")[1]).get("category") ===
      "ENGLISH_KINDERGARTEN"
      ? returnTo
      : "/institutions?category=ENGLISH_KINDERGARTEN";
  const visibleSection = (id: string) =>
    id === "information-session" ||
    (id === "tuition" && Boolean(findFact(profile, "TUITION"))) ||
    (id === "age-curriculum" &&
      Boolean(
        findFact(profile, "TARGET_AGE_GRADE") ||
        findFact(profile, "CURRICULUM"),
      )) ||
    (id === "transport" && Boolean(findFact(profile, "TRANSPORT"))) ||
    (id === "meals" && Boolean(findFact(profile, "MEALS"))) ||
    (id === "review-summary" && Boolean(profile.reviewInsight)) ||
    (id === "official-sources" && collectOfficialSources(data).length > 0);

  return (
    <PageContainer>
      <article className="ek-detail">
        <Link className="page-back" href={listHref}>
          ← 영어유치원 목록
        </Link>
        <header className="ek-detail__hero">
          <p className="eyebrow">영어유치원 정보</p>
          <h1>{institution.name}</h1>
          <FollowCta
            institutionId={institution.id}
            followable={institution.followable}
            context="INSTITUTION"
            returnPath={`/institutions/${institution.slug}`}
          />
          <p>
            {institution.address ??
              (institution.region
                ? publicRegionLabel(institution.region)
                : "주소는 캠퍼스 공식 안내를 확인해 주세요.")}
          </p>
          <SummaryGrid summary={profile} />
          {profile.lastContentCheckedAt &&
          (profile.facts.length ||
            profile.nextInformationSession ||
            profile.reviewInsight) ? (
            <p className="ek-detail__checked">
              표시된 정보 최근 확인{" "}
              <time dateTime={profile.lastContentCheckedAt}>
                {formatPublicDate(profile.lastContentCheckedAt)}
              </time>
            </p>
          ) : null}
        </header>

        <nav className="ek-anchor-nav" aria-label="영어유치원 상세 정보">
          {detailAnchors
            .filter(([id]) => visibleSection(id))
            .map(([id, label]) => (
              <a key={id} href={`#${id}`}>
                {label}
              </a>
            ))}
        </nav>

        <div className="ek-detail__sections">
          <p>
            표시되지 않은 원비·셔틀·급식 등의 제공 여부는 캠퍼스에 문의해
            주세요.
          </p>
          <SectionShell
            id="information-session"
            title="입학설명회"
            description="행사 시간과 신청 마감은 서로 다른 일정이에요."
          >
            <InformationSessionSection data={profile} />
          </SectionShell>
          {visibleSection("tuition") ? (
            <SectionShell
              id="tuition"
              title="원비"
              description="적용 학년도와 납부 주기를 함께 확인해 주세요."
            >
              <TuitionSection data={profile} />
            </SectionShell>
          ) : null}

          {visibleSection("age-curriculum") ? (
            <SectionShell id="age-curriculum" title="연령·커리큘럼">
              <AgeCurriculumSection data={profile} />
            </SectionShell>
          ) : null}
          {visibleSection("transport") ? (
            <SectionShell id="transport" title="셔틀">
              <TransportSection data={profile} />
            </SectionShell>
          ) : null}
          {visibleSection("meals") ? (
            <SectionShell id="meals" title="급식">
              <MealsSection data={profile} />
            </SectionShell>
          ) : null}
          {visibleSection("review-summary") ? (
            <SectionShell
              id="review-summary"
              title="후기 요약"
              description="공개 후기에서 반복된 내용만 요약해요."
            >
              <ReviewSection data={profile} />
            </SectionShell>
          ) : null}
          {visibleSection("official-sources") ? (
            <SectionShell
              id="official-sources"
              title="공식 출처"
              description="원비와 일정은 기관 안내가 바뀔 수 있어요. 신청 전 다시 확인해 주세요."
            >
              <OfficialSourcesSection data={data} />
            </SectionShell>
          ) : null}
        </div>

        <nav
          className="ek-detail__return"
          aria-label="영어유치원 목록으로 돌아가기"
        >
          <Link href={listHref}>다른 영어유치원 비교하기</Link>
        </nav>
      </article>
    </PageContainer>
  );
}
