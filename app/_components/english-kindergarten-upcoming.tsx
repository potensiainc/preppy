import Link from "next/link";

import {
  formatPublicDate,
  formatPublicDateTime,
} from "@/app/_lib/presentation";
import { sessionBookingLabel } from "@/src/modules/english-kindergarten/session-state";
import type {
  EnglishKindergartenInformationSessionDTO,
  InstitutionListDTO,
} from "@/src/modules/public/dto";

export type UpcomingSessionRow = Readonly<{
  institutionName: string;
  institutionSlug: string;
  district: string | null;
  session: EnglishKindergartenInformationSessionDTO;
  bookingLabel: string;
}>;

const closedLabels = new Set(["예약 마감", "행사 취소"]);

/**
 * Future sessions only. Sessions a parent can still act on come first;
 * closed ones follow and keep their 마감 label instead of being hidden.
 */
export function upcomingSessionRows(
  data: InstitutionListDTO,
  limit: number,
  now = new Date(),
): UpcomingSessionRow[] {
  const rows = data.items.flatMap((item) =>
    (item.englishKindergarten?.informationSessions ?? [])
      .filter((session) => new Date(session.eventStartsAt) > now)
      .map((session) => ({
        institutionName: item.name,
        institutionSlug: item.slug,
        district: item.district ?? null,
        session,
        bookingLabel: sessionBookingLabel(session, now),
      })),
  );
  return rows
    .sort((a, b) => {
      const closed =
        Number(closedLabels.has(a.bookingLabel)) -
        Number(closedLabels.has(b.bookingLabel));
      return (
        closed ||
        a.session.eventStartsAt.localeCompare(b.session.eventStartsAt) ||
        a.institutionName.localeCompare(b.institutionName, "ko")
      );
    })
    .slice(0, limit);
}

export function EnglishKindergartenUpcomingSessions({
  rows,
  moreHref,
}: {
  rows: readonly UpcomingSessionRow[];
  moreHref: string;
}) {
  if (rows.length === 0) return null;
  return (
    <section
      className="ek-upcoming"
      id="english-kindergarten"
      aria-labelledby="ek-upcoming-title"
    >
      <h2 id="ek-upcoming-title">
        앞으로 열릴 2027학년도 영어유치원 설명회 · 서울
      </h2>
      <p>
        예약이 마감되지 않은 회차를 먼저, 마감된 회차를 뒤에 보여드려요.
        잔여석은 기관 예약 페이지에서 확인해 주세요.
      </p>
      <ul>
        {rows.map((row) => (
          <li key={row.session.id}>
            <p className="ek-upcoming__date">
              <time dateTime={row.session.eventStartsAt}>
                {formatPublicDateTime(row.session.eventStartsAt)}
              </time>
              <span>{row.bookingLabel}</span>
            </p>
            <h3>
              <Link
                href={`/institutions/${row.institutionSlug}#information-session`}
              >
                {row.institutionName}
              </Link>
            </h3>
            <p className="ek-upcoming__meta">
              {[row.district, row.session.targetAudience]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p className="ek-upcoming__meta">
              내용 확인{" "}
              <time dateTime={row.session.verifiedAt}>
                {formatPublicDate(row.session.verifiedAt)}
              </time>
            </p>
          </li>
        ))}
      </ul>
      <Link href={moreHref}>영어유치원 설명회 전체 보기 →</Link>
    </section>
  );
}
