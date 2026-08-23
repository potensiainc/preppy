import Link from "next/link";

import {
  formatPublicDate,
  opportunityStateLabel,
} from "@/app/_lib/presentation";
import { UnfollowControl } from "@/app/my-preppy/unfollow-control";
import type {
  MyPreppyData,
  MyPreppyOpportunitySummary,
} from "@/src/modules/my-preppy/query.server";

const categoryLabels = {
  ENGLISH_KINDERGARTEN: "영어유치원",
  PRIVATE_ELEMENTARY: "사립초등학교",
  INTERNATIONAL_SCHOOL: "국제학교",
} as const;

function regionLabel(region: string | null): string {
  if (region === null) return "지역 정보 확인 중";
  if (region === "SEOUL" || region === "KR-11") return "서울";
  return region;
}

function OpportunityList({
  title,
  opportunities,
}: {
  title: string;
  opportunities: readonly MyPreppyOpportunitySummary[];
}) {
  if (opportunities.length === 0) return null;
  return (
    <section className="my-preppy-card__opportunities" aria-label={title}>
      <h3>{title}</h3>
      <ul>
        {opportunities.map((opportunity) => (
          <li key={opportunity.id}>
            <Link href={`/opportunities/${opportunity.slug}`}>
              {opportunity.title}
            </Link>
            <span>{opportunityStateLabel(opportunity.state)}</span>
            {opportunity.keyDate ? (
              <time dateTime={opportunity.keyDate}>
                {formatPublicDate(opportunity.keyDate)}
              </time>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MyPreppyView({ data }: { data: MyPreppyData }) {
  return (
    <div className="page-container my-preppy-page">
      <header className="my-preppy-page__intro">
        <div>
          <p className="eyebrow">My PREPPY</p>
          <h1>내 프레피</h1>
          <p>
            관심기관의 현재 입학정보와 업데이트 준비 상태를 한곳에서 확인하세요.
          </p>
        </div>
        <div
          className={`my-preppy-readiness my-preppy-readiness--${data.readiness.ready ? "ready" : "attention"}`}
        >
          <span>이메일 업데이트 상태</span>
          <strong>{data.readiness.label}</strong>
        </div>
      </header>

      {data.cards.length === 0 ? (
        <section
          className="empty-state"
          aria-labelledby="my-preppy-empty-title"
        >
          <h2 id="my-preppy-empty-title">아직 관심기관이 없어요.</h2>
          <p>기관을 둘러보고 업데이트 받을 곳을 등록해보세요.</p>
          <Link
            className="button-link button-link--primary"
            href="/institutions"
          >
            기관 둘러보기
          </Link>
        </section>
      ) : (
        <section className="my-preppy-list" aria-label="관심기관">
          {data.cards.map((card) => (
            <article className="my-preppy-card" key={card.followId}>
              <div className="my-preppy-card__identity">
                <p className="card-kicker">
                  {categoryLabels[card.institution.category]} ·{" "}
                  {regionLabel(card.institution.region)}
                </p>
                <h2>
                  <Link href={`/institutions/${card.institution.slug}`}>
                    {card.institution.name}
                  </Link>
                </h2>
                <p className="my-preppy-card__state">
                  현재 입학 상태 ·{" "}
                  {card.currentAdmissionsState
                    ? opportunityStateLabel(card.currentAdmissionsState)
                    : "확인 중"}
                </p>
                <p
                  className={`my-preppy-card__readiness my-preppy-card__readiness--${card.readiness.ready ? "ready" : "attention"}`}
                >
                  {card.readiness.label}
                </p>
              </div>

              <div className="my-preppy-card__truth">
                <OpportunityList
                  title="현재 입학정보"
                  opportunities={card.currentOpportunities}
                />
                <OpportunityList
                  title="예정된 입학정보"
                  opportunities={card.upcomingOpportunities}
                />
                {card.recentChanges.length > 0 ? (
                  <section
                    className="my-preppy-card__changes"
                    aria-label="최근 변경"
                  >
                    <h3>최근 확인된 변경</h3>
                    <ul>
                      {card.recentChanges.map((change) => (
                        <li
                          key={`${change.opportunityId}-${change.publishedAt}`}
                        >
                          <span>{change.summary}</span>
                          <time dateTime={change.publishedAt}>
                            {formatPublicDate(change.publishedAt)}
                          </time>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                {card.lastVerifiedAt ? (
                  <p className="verified-at">
                    마지막 확인{" "}
                    <time dateTime={card.lastVerifiedAt}>
                      {formatPublicDate(card.lastVerifiedAt)}
                    </time>
                  </p>
                ) : (
                  <p className="verified-at">
                    공개된 최신 입학정보를 확인 중입니다.
                  </p>
                )}
              </div>

              <footer className="my-preppy-card__actions">
                <UnfollowControl
                  institutionId={card.institution.id}
                  institutionName={card.institution.name}
                />
              </footer>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
