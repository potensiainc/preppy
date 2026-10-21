import Link from "next/link";

import { CompareViewAnalytics } from "@/app/_components/campaign-analytics";
import {
  formatAgeRange,
  formatTransport,
  formatTuitionValue,
} from "@/app/_components/english-kindergarten-pages";
import { PageContainer } from "@/app/_components/ui-primitives";
import {
  compareOfficialLink,
  compareSession,
  type compareDistricts,
} from "@/app/_lib/english-kindergarten-compare";
import {
  hasSummaryValue,
  summaryGap,
  type SummarySection,
} from "@/app/_lib/english-kindergarten-summary";
import {
  formatPublicDate,
  formatPublicDateTime,
  safeExternalHref,
} from "@/app/_lib/presentation";
import { sessionBookingLabel } from "@/src/modules/english-kindergarten/session-state";
import type {
  EnglishKindergartenCardSummaryDTO,
  InstitutionListDTO,
} from "@/src/modules/public/dto";

type DistrictConfig = (typeof compareDistricts)[keyof typeof compareDistricts];

function Gap({
  summary,
  section,
}: {
  summary: EnglishKindergartenCardSummaryDTO;
  section: SummarySection;
}) {
  const gap = summaryGap(summary, section);
  return (
    <>
      <span className="ek-compare__gap">{gap.value}</span>
      {gap.note ? <span className="ek-compare__note">{gap.note}</span> : null}
      <CheckedAt value={gap.checkedAt} />
    </>
  );
}

/** Each compared value shows its own check date, never the row's latest. */
function CheckedAt({ value }: { value: string | null }) {
  if (!value) return null;
  return (
    <span className="ek-compare__note">
      내용 확인 <time dateTime={value}>{formatPublicDate(value)}</time>
    </span>
  );
}

function CompareRow({
  institution,
  returnHref,
}: {
  institution: InstitutionListDTO["items"][number];
  returnHref: string;
}) {
  const summary = institution.englishKindergarten;
  if (!summary) return null;
  const session = compareSession(summary);
  const official = compareOfficialLink(summary, session);
  const officialHref = official ? safeExternalHref(official.url) : null;
  const detailHref = `/institutions/${institution.slug}?returnTo=${encodeURIComponent(returnHref)}`;

  return (
    <tr>
      <th scope="row" data-label="기관명">
        <Link href={detailHref}>{institution.name}</Link>
        {institution.address ? (
          <span className="ek-compare__note">{institution.address}</span>
        ) : null}
      </th>
      <td data-label="원비">
        {summary.tuition ? (
          <>
            <span>
              {summary.tuition.displayText ??
                formatTuitionValue(summary.tuition)}
            </span>
            <CheckedAt value={summary.tuition.verifiedAt} />
          </>
        ) : (
          <Gap summary={summary} section="TUITION" />
        )}
      </td>
      <td data-label="운영 연령">
        {summary.ageRange ? (
          <>
            <span>
              {summary.ageRange.displayText ?? formatAgeRange(summary.ageRange)}
            </span>
            <CheckedAt value={summary.ageRange.verifiedAt} />
          </>
        ) : (
          <Gap summary={summary} section="TARGET_AGE_GRADE" />
        )}
      </td>
      <td data-label="셔틀">
        {hasSummaryValue(summary, "TRANSPORT") ? (
          <>
            <span>
              {summary.transport.displayText ??
                formatTransport(summary.transport)}
            </span>
            <CheckedAt value={summary.transport.verifiedAt} />
          </>
        ) : (
          <Gap summary={summary} section="TRANSPORT" />
        )}
      </td>
      <td data-label="다음 설명회">
        {session ? (
          <>
            <span>{formatPublicDateTime(session.eventStartsAt)}</span>
            <span className="ek-compare__note">
              {[session.targetAudience, sessionBookingLabel(session)]
                .filter(Boolean)
                .join(" · ")}
            </span>
            <CheckedAt value={session.verifiedAt} />
          </>
        ) : (
          <Gap summary={summary} section="INFORMATION_SESSION" />
        )}
      </td>
      <td data-label="공식 안내">
        {officialHref ? (
          <>
            <a
              aria-label={`${institution.name} 공식 안내 열기`}
              href={officialHref}
              rel="noopener noreferrer"
              target="_blank"
            >
              공식 안내 열기
            </a>
            {official?.name ? (
              <span className="ek-compare__note">{official.name}</span>
            ) : null}
          </>
        ) : (
          <span className="ek-compare__gap">아직 연결하지 않았어요</span>
        )}
      </td>
    </tr>
  );
}

export function EnglishKindergartenCompareView({
  config,
  data,
  pagePath,
  listHref,
}: {
  config: DistrictConfig;
  data: InstitutionListDTO;
  pagePath: string;
  listHref: string;
}) {
  return (
    <PageContainer>
      <CompareViewAnalytics district={config.analyticsDistrict} />
      <div className="ek-compare">
        <header className="ek-list__intro">
          <p className="eyebrow">영어유치원 비교</p>
          <h1>{config.heading}</h1>
          <p>
            {config.areaLabel} 영어유치원 {data.pagination.total}곳의 원비, 운영
            연령, 셔틀, 다음 설명회를 한 번에 비교해요.
          </p>
        </header>
        {data.items.length < data.pagination.total ? (
          <p className="ek-compare__notice">
            이 표에는 정보가 확인된 순서로 {data.items.length}곳까지 보여드려요.
            나머지 {data.pagination.total - data.items.length}곳은 목록에서
            확인해 주세요.
          </p>
        ) : null}
        <p className="ek-compare__notice">
          각 기관의 공식 안내를 기준으로 정리했어요. 항목마다 내용을 확인한
          날짜를 따로 적었어요. 원비와 일정은 달라질 수 있으니 신청 전에 공식
          안내를 다시 확인해 주세요. 예약 상태와 잔여석은 기관 페이지에서 확인해
          주세요.
        </p>
        <div className="ek-compare__table-wrap">
          <table className="ek-compare__table">
            <caption>
              {config.heading} · 정보가 확인된 기관부터 보여드려요.
            </caption>
            <thead>
              <tr>
                <th scope="col">기관명</th>
                <th scope="col">원비</th>
                <th scope="col">운영 연령</th>
                <th scope="col">셔틀</th>
                <th scope="col">다음 설명회</th>
                <th scope="col">공식 안내</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <CompareRow
                  key={item.id}
                  institution={item}
                  returnHref={pagePath}
                />
              ))}
            </tbody>
          </table>
        </div>
        <p>
          <Link className="button-link button-link--secondary" href={listHref}>
            {config.areaLabel} 영어유치원 목록에서 조건으로 찾기
          </Link>
        </p>
      </div>
    </PageContainer>
  );
}
