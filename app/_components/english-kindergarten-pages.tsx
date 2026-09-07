import Link from "next/link";

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
  if (filters.query) params.set("query", filters.query);
  if (filters.hasConfirmedTuition) params.set("hasConfirmedTuition", "true");
  if (filters.minAge) params.set("minAge", String(filters.minAge));
  if (filters.transport) params.set("transport", filters.transport);
  if (filters.hasUpcomingInfoSession)
    params.set("hasUpcomingInfoSession", "true");
  if (filters.sort) params.set("sort", filters.sort);
  params.set("page", String(page));
  return `/institutions?${params.toString()}`;
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
  const tuition =
    summary.tuition?.displayText ??
    coverageText(summary, "TUITION", "원비 내용을 확인하고 있어요.");
  const age =
    summary.ageRange?.displayText ??
    coverageText(summary, "TARGET_AGE_GRADE", "운영 연령을 확인하고 있어요.");
  const transport =
    summary.transport.displayText ??
    coverageText(summary, "TRANSPORT", "셔틀 내용을 확인하고 있어요.");
  const session = summary.nextInformationSession;

  return (
    <dl className="ek-summary-grid">
      <SummaryValue
        label="월 원비"
        value={tuition}
        note={
          summary.tuition?.billingCadence &&
          summary.tuition.billingCadence !== "MONTHLY"
            ? `${cadenceLabels[summary.tuition.billingCadence]} 기준 금액이에요.`
            : null
        }
      />
      <SummaryValue
        label="운영 연령"
        value={age}
        note={
          summary.ageRange ? ageBasisLabels[summary.ageRange.basis] : undefined
        }
      />
      <SummaryValue
        label="셔틀"
        value={transport}
        note={
          summary.transport.inquiryRequired
            ? "운행 지역과 좌석은 기관에 확인해 주세요."
            : null
        }
      />
      <SummaryValue
        label="다음 설명회"
        value={
          session
            ? formatPublicDateTime(session.eventStartsAt)
            : coverageText(
                summary,
                "INFORMATION_SESSION",
                "설명회 일정을 확인하고 있어요.",
              )
        }
        note={
          session?.applicationClosesAt
            ? `신청 마감 ${formatPublicDateTime(session.applicationClosesAt)}`
            : null
        }
      />
    </dl>
  );
}

function EnglishKindergartenCard({
  institution,
}: {
  institution: InstitutionListDTO["items"][number];
}) {
  const summary = institution.englishKindergarten;
  if (!summary) return null;

  return (
    <article className="ek-card">
      <header className="ek-card__header">
        <div>
          <p className="ek-card__region">
            {institution.region ?? "지역 확인 중"}
          </p>
          <h2>
            <Link href={`/institutions/${institution.slug}`}>
              {institution.name}
            </Link>
          </h2>
          {institution.address ? (
            <p className="ek-card__address">{institution.address}</p>
          ) : null}
        </div>
        <span aria-hidden="true" className="ek-card__arrow">
          ↗
        </span>
      </header>
      <SummaryGrid summary={summary} />
      {summary.lastContentCheckedAt ? (
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
  return (
    <PageContainer>
      <main className="ek-list">
        <header className="ek-list__intro">
          <p className="eyebrow">영어유치원 비교</p>
          <h1>조건에 맞는 곳을 바로 비교해 보세요</h1>
          <p>
            원비, 운영 연령, 셔틀과 입학설명회 일정을 한 화면에서 살펴볼 수
            있어요.
          </p>
        </header>

        <form action="/institutions" method="get" className="ek-filters">
          <input type="hidden" name="category" value="ENGLISH_KINDERGARTEN" />
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
            <label htmlFor="ek-region">지역</label>
            <input
              id="ek-region"
              name="region"
              defaultValue={filters.region ?? ""}
              placeholder="예: 서울"
            />
          </div>
          <div className="ek-filter">
            <label htmlFor="ek-age">자녀 나이</label>
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
        </form>

        <section aria-labelledby="ek-result-title">
          <div className="ek-result-heading">
            <div>
              <p className="eyebrow">검색 결과</p>
              <h2 id="ek-result-title">영어유치원 {data.pagination.total}곳</h2>
            </div>
            <p>확인된 정보만 비교 항목에 표시해요.</p>
          </div>
          {data.items.length > 0 ? (
            <div className="ek-card-list">
              {data.items.map((item) => (
                <EnglishKindergartenCard key={item.id} institution={item} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="조건에 맞는 영어유치원을 찾지 못했어요"
              description="검색 조건을 줄이거나 지역 범위를 넓혀 보세요."
            />
          )}
          <Pagination
            pagination={data.pagination}
            hrefForPage={(page) => institutionListHref(filters, page)}
          />
        </section>
      </main>
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
      <p className="ek-fact-panel__lead">{fact.displayText}</p>
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

function InformationSessionSection({
  data,
}: {
  data: EnglishKindergartenDetailDTO;
}) {
  const session = data.nextInformationSession;
  if (!session) {
    return (
      <SectionMessage>
        {coverageText(
          data,
          "INFORMATION_SESSION",
          "입학설명회 일정을 확인하고 있어요.",
        )}
      </SectionMessage>
    );
  }
  const actionHref = session.actionUrl
    ? safeExternalHref(session.actionUrl)
    : null;
  return (
    <article className="ek-session-card">
      <p className="eyebrow">다음 일정</p>
      <h3>{session.title}</h3>
      <dl className="ek-detail-list">
        <div>
          <dt>설명회</dt>
          <dd>
            <time dateTime={session.eventStartsAt}>
              {formatPublicDateTime(session.eventStartsAt)}
            </time>
          </dd>
        </div>
        {session.applicationClosesAt ? (
          <div>
            <dt>신청 마감</dt>
            <dd>
              <time dateTime={session.applicationClosesAt}>
                {formatPublicDateTime(session.applicationClosesAt)}
              </time>
            </dd>
          </div>
        ) : null}
      </dl>
      {actionHref ? (
        <a
          className="ek-action-link"
          href={actionHref}
          target="_blank"
          rel="noopener noreferrer"
        >
          설명회 신청 페이지 열기
        </a>
      ) : null}
      <dl className="ek-freshness">
        {session.lastCollectedAt ? (
          <div>
            <dt>자료 수집</dt>
            <dd>
              <time dateTime={session.lastCollectedAt}>
                {formatPublicDate(session.lastCollectedAt)}
              </time>
            </dd>
          </div>
        ) : null}
        <div>
          <dt>내용 확인</dt>
          <dd>
            <time dateTime={session.verifiedAt}>
              {formatPublicDate(session.verifiedAt)}
            </time>
          </dd>
        </div>
      </dl>
    </article>
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
          <p className="ek-fact-panel__lead">{age.displayText}</p>
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
      ) : (
        <SectionMessage>
          {coverageText(
            data,
            "TARGET_AGE_GRADE",
            "운영 연령을 확인하고 있어요.",
          )}
        </SectionMessage>
      )}
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
      ) : (
        <SectionMessage>
          {coverageText(data, "CURRICULUM", "커리큘럼을 확인하고 있어요.")}
        </SectionMessage>
      )}
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
      <p className="ek-fact-panel__lead">{fact.displayText}</p>
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
              ? "제공 여부를 확인하고 있어요."
              : value.mealProvided
                ? "제공해요."
                : "제공하지 않아요."}
          </dd>
        </div>
        <div>
          <dt>간식</dt>
          <dd>
            {value.snackProvided === null
              ? "제공 여부를 확인하고 있어요."
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
      <p>후기 {review.sampleSize}건을 검토했어요.</p>
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
  const sessionSource =
    data.englishKindergarten?.nextInformationSession?.officialSource;
  if (sessionSource) sources.set(sessionSource.url, sessionSource);
  return [...sources.values()];
}

function OfficialSourcesSection({ data }: { data: InstitutionDetailDTO }) {
  const sources = collectOfficialSources(data);
  if (sources.length === 0) {
    return <SectionMessage>공식 출처를 정리하고 있어요.</SectionMessage>;
  }
  return (
    <div className="ek-official-sources">
      {sources.map((source, index) => {
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
            <strong>
              {index === 0 ? "기관 공식 홈페이지 열기" : "공식 안내 열기"}
            </strong>
          </a>
        );
      })}
    </div>
  );
}

export function EnglishKindergartenDetailView({
  data,
}: {
  data: InstitutionDetailDTO;
}) {
  const profile = data.englishKindergarten;
  if (!profile) return null;
  const institution = data.institution;

  return (
    <PageContainer>
      <main className="ek-detail">
        <header className="ek-detail__hero">
          <p className="eyebrow">영어유치원 정보</p>
          <h1>{institution.name}</h1>
          <p>
            {institution.address ??
              institution.region ??
              "기관 위치를 확인하고 있어요."}
          </p>
          <SummaryGrid summary={profile} />
          {profile.lastContentCheckedAt ? (
            <p className="ek-detail__checked">
              전체 항목 최근 확인{" "}
              <time dateTime={profile.lastContentCheckedAt}>
                {formatPublicDate(profile.lastContentCheckedAt)}
              </time>
            </p>
          ) : null}
        </header>

        <nav className="ek-anchor-nav" aria-label="영어유치원 상세 정보">
          {detailAnchors.map(([id, label]) => (
            <a key={id} href={`#${id}`}>
              {label}
            </a>
          ))}
        </nav>

        <div className="ek-detail__sections">
          <SectionShell
            id="tuition"
            title="원비"
            description="적용 학년도와 납부 주기를 함께 확인해 주세요."
          >
            <TuitionSection data={profile} />
          </SectionShell>
          <SectionShell
            id="information-session"
            title="입학설명회"
            description="행사 시간과 신청 마감은 서로 다른 일정이에요."
          >
            <InformationSessionSection data={profile} />
          </SectionShell>
          <SectionShell id="age-curriculum" title="연령·커리큘럼">
            <AgeCurriculumSection data={profile} />
          </SectionShell>
          <SectionShell id="transport" title="셔틀">
            <TransportSection data={profile} />
          </SectionShell>
          <SectionShell id="meals" title="급식">
            <MealsSection data={profile} />
          </SectionShell>
          <SectionShell
            id="review-summary"
            title="후기 요약"
            description="공개 후기에서 반복된 내용만 요약해요."
          >
            <ReviewSection data={profile} />
          </SectionShell>
          <SectionShell
            id="official-sources"
            title="공식 출처"
            description="원비와 일정은 기관 안내가 바뀔 수 있어요. 신청 전 다시 확인해 주세요."
          >
            <OfficialSourcesSection data={data} />
          </SectionShell>
        </div>

        <nav
          className="ek-detail__return"
          aria-label="영어유치원 목록으로 돌아가기"
        >
          <Link href="/institutions?category=ENGLISH_KINDERGARTEN">
            다른 영어유치원 비교하기
          </Link>
        </nav>
      </main>
    </PageContainer>
  );
}
