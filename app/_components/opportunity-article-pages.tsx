import Link from "next/link";

import type {
  PublicArticleDTO,
  PublicOpportunityDTO,
} from "@/src/modules/public/dto";

import { FollowCta } from "@/app/_components/follow-cta";
import {
  ArticleCard,
  InstitutionCard,
  OpportunityCard,
  StateBadge,
  TrustSource,
} from "@/app/_components/public-cards";
import { PageContainer, SectionHeader } from "@/app/_components/ui-primitives";
import {
  articleTypeLabel,
  categoryLabel,
  formatPublicDate,
  opportunityKindLabel,
  safeExternalHref,
} from "@/app/_lib/presentation";

const opportunityDateLabels: Record<
  keyof PublicOpportunityDTO["keyDates"],
  string
> = {
  eventStartsAt: "행사 시작",
  eventEndsAt: "행사 종료",
  applicationOpensAt: "지원 시작",
  applicationClosesAt: "지원 마감",
};

function OpportunityDates({
  keyDates,
}: {
  keyDates: PublicOpportunityDTO["keyDates"];
}) {
  const dates = Object.entries(keyDates).filter(
    (entry): entry is [keyof PublicOpportunityDTO["keyDates"], string] =>
      entry[1] !== null,
  );

  if (dates.length === 0) return null;

  return (
    <section className="opportunity-detail__section" aria-label="주요 일정">
      <SectionHeader title="주요 일정" />
      <dl className="opportunity-dates">
        {dates.map(([name, value]) => (
          <div key={name}>
            <dt>{opportunityDateLabels[name]}</dt>
            <dd>
              <time dateTime={value}>{formatPublicDate(value)}</time>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function uniqueArticleInstitution(article: PublicArticleDTO) {
  const targets = new Map<
    string,
    { id: string; name: string; followable: boolean }
  >();
  for (const institution of article.relatedInstitutions) {
    targets.set(institution.id, {
      id: institution.id,
      name: institution.name,
      followable: institution.followable,
    });
  }
  for (const opportunity of article.relatedOpportunities) {
    const existing = targets.get(opportunity.institution.id);
    targets.set(opportunity.institution.id, {
      id: opportunity.institution.id,
      name: opportunity.institution.name,
      followable:
        opportunity.institution.followable && (existing?.followable ?? true),
    });
  }
  return targets.size === 1 ? [...targets.values()][0]! : null;
}

export function OpportunityDetailView({
  opportunity,
}: {
  opportunity: PublicOpportunityDTO;
}) {
  const actionHref = opportunity.actionUrl
    ? safeExternalHref(opportunity.actionUrl)
    : null;
  const officialSourceHref = opportunity.officialSource
    ? safeExternalHref(opportunity.officialSource.url)
    : null;

  return (
    <PageContainer>
      <article className="opportunity-detail">
        <header className="opportunity-detail__hero">
          <p className="eyebrow">Opportunity</p>
          <div className="opportunity-detail__hero-content">
            <div>
              <p className="opportunity-detail__institution">
                <Link href={`/institutions/${opportunity.institution.slug}`}>
                  {opportunity.institution.name}
                </Link>
              </p>
              <h1>{opportunity.title}</h1>
              <div className="opportunity-detail__meta">
                <span>{opportunityKindLabel(opportunity.kind)}</span>
                <StateBadge state={opportunity.businessState} />
              </div>
              {opportunity.keyDate ? (
                <p className="opportunity-detail__key-date">
                  주요 일정{" "}
                  <time dateTime={opportunity.keyDate}>
                    {formatPublicDate(opportunity.keyDate)}
                  </time>
                </p>
              ) : null}
            </div>
            <FollowCta
              context="OPPORTUNITY"
              followable={opportunity.institution.followable}
              institutionId={opportunity.institution.id}
              opportunityId={opportunity.id}
              returnPath={`/opportunities/${opportunity.slug}`}
            />
          </div>
        </header>

        {opportunity.summary || opportunity.targetAudience ? (
          <section
            className="opportunity-detail__section"
            aria-label="모집 안내"
          >
            <SectionHeader title="모집 안내" />
            {opportunity.summary ? <p>{opportunity.summary}</p> : null}
            {opportunity.targetAudience ? (
              <p className="opportunity-detail__audience">
                <strong>대상</strong> {opportunity.targetAudience}
              </p>
            ) : null}
          </section>
        ) : null}

        <OpportunityDates keyDates={opportunity.keyDates} />

        {actionHref || opportunity.officialSource ? (
          <section
            className="opportunity-detail__section"
            aria-label="공식 안내"
          >
            <SectionHeader title="공식 안내" />
            <div className="opportunity-detail__links">
              {actionHref ? (
                <a
                  className="text-link"
                  href={actionHref}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  지원 페이지 확인
                </a>
              ) : null}
              {opportunity.officialSource ? (
                <div>
                  {officialSourceHref ? (
                    <a
                      className="text-link"
                      href={officialSourceHref}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      공식 안내 확인
                    </a>
                  ) : null}
                  <TrustSource source={opportunity.officialSource} />
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {opportunity.lastVerifiedAt ? (
          <p className="verified-at">
            Last Verified{" "}
            <time dateTime={opportunity.lastVerifiedAt}>
              {formatPublicDate(opportunity.lastVerifiedAt)}
            </time>
          </p>
        ) : null}

        {opportunity.recentMeaningfulChanges.length > 0 ? (
          <section
            className="opportunity-detail__section"
            aria-label="최근 변경 사항"
          >
            <SectionHeader title="최근 변경 사항" />
            <ol className="opportunity-changes">
              {opportunity.recentMeaningfulChanges.map((change) => (
                <li key={`${change.occurredAt}-${change.summary}`}>
                  <time dateTime={change.occurredAt}>
                    {formatPublicDate(change.occurredAt)}
                  </time>
                  <p>{change.summary}</p>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {opportunity.relatedArticles.length > 0 ? (
          <section
            className="opportunity-detail__section"
            aria-label="관련 아티클"
          >
            <SectionHeader title="관련 아티클" />
            <div className="detail-card-grid">
              {opportunity.relatedArticles.map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </div>
          </section>
        ) : null}
      </article>
    </PageContainer>
  );
}

export function ArticleDetailView({ article }: { article: PublicArticleDTO }) {
  const followTarget = uniqueArticleInstitution(article);
  return (
    <PageContainer>
      <article className="article-detail">
        <header className="article-detail__hero">
          <p className="eyebrow">Article</p>
          <h1>{article.title}</h1>
          <p className="article-detail__meta">
            {articleTypeLabel(article.articleType)} ·{" "}
            {categoryLabel(article.category)}
            {article.publishedAt ? (
              <>
                {" · "}
                <time dateTime={article.publishedAt}>
                  {formatPublicDate(article.publishedAt)}
                </time>
              </>
            ) : null}
          </p>
          {article.authorDisplayName ? (
            <p className="article-detail__author">
              {article.authorDisplayName}
            </p>
          ) : null}
          {article.excerpt ? (
            <p className="article-detail__excerpt">{article.excerpt}</p>
          ) : null}
        </header>

        <section className="article-detail__section" aria-label="본문 안내">
          <p>이 아티클의 본문은 현재 공개 준비 중입니다.</p>
        </section>

        {article.relatedInstitutions.length > 0 ? (
          <section className="article-detail__section" aria-label="관련 기관">
            <SectionHeader title="관련 기관" />
            <div className="detail-card-grid">
              {article.relatedInstitutions.map((institution) => (
                <InstitutionCard
                  key={institution.id}
                  institution={institution}
                />
              ))}
            </div>
          </section>
        ) : null}

        {article.relatedOpportunities.length > 0 ? (
          <section
            className="article-detail__section"
            aria-label="관련 모집·입학정보"
          >
            <SectionHeader title="관련 모집·입학정보" />
            <div className="detail-card-grid">
              {article.relatedOpportunities.map((opportunity) => (
                <OpportunityCard
                  key={opportunity.id}
                  opportunity={opportunity}
                />
              ))}
            </div>
          </section>
        ) : null}

        {followTarget ? (
          <section
            className="article-detail__section article-follow"
            aria-label="관심기관 알림"
          >
            <FollowCta
              articleId={article.id}
              context="ARTICLE"
              followable={followTarget.followable}
              institutionId={followTarget.id}
              label={`${followTarget.name} 업데이트 받기`}
              returnPath={`/articles/${article.slug}`}
            />
          </section>
        ) : null}
      </article>
    </PageContainer>
  );
}
