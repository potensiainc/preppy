import Link from "next/link";
import {
  isProvisionalAdmissionGuidance,
  PROVISIONAL_ADMISSION_NOTICE,
} from "@/src/modules/live-admissions/guidance";

import type {
  PublicArticleDTO,
  PublicOpportunityDTO,
} from "@/src/modules/public/dto";

import { TrackedFollowCta as FollowCta } from "@/app/_components/tracked-follow-cta";
import { ArticleProse } from "@/app/_components/article-prose";
import {
  ArticleCard,
  InstitutionCard,
  OpportunityCard,
  StateBadge,
  TrustSource,
  VerifiedAt,
} from "@/app/_components/public-cards";
import { PageContainer, SectionHeader } from "@/app/_components/ui-primitives";
import {
  articleTypeLabel,
  categoryLabel,
  formatPublicDate,
  formatPublicDateTime,
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
  provisional = false,
}: {
  keyDates: PublicOpportunityDTO["keyDates"];
  provisional?: boolean;
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
            <dt>
              {opportunityDateLabels[name]}
              {provisional ? " (예정)" : ""}
            </dt>
            <dd>
              <time dateTime={value}>{formatPublicDateTime(value)}</time>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function StructuredGuideText({ summary }: { summary: string }) {
  const blocks = summary
    .split(/\n\s*\n/u)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks.map((block, index) => {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const heading = /^\[([^\]]+)\]$/u.exec(lines[0] ?? "");
    if (!heading) return <p key={index}>{lines.join(" ")}</p>;

    return (
      <div key={index}>
        <h3>{heading[1]}</h3>
        {lines.slice(1).map((line, lineIndex) => (
          <p key={lineIndex}>{line}</p>
        ))}
      </div>
    );
  });
}

function AdmissionGuide({
  guide,
}: {
  guide: NonNullable<PublicOpportunityDTO["admissionGuide"]>;
}) {
  const provisional = isProvisionalAdmissionGuidance(
    `${guide.title} ${guide.summary ?? ""}`,
  );
  return (
    <section className="opportunity-detail__section" aria-label="공식 모집요강">
      <SectionHeader title="공식 모집요강" />
      <h3>
        <Link href={`/opportunities/${guide.slug}`}>{guide.title}</Link>
      </h3>
      {provisional ? (
        <p className="opportunity-detail__audience">
          <strong>{PROVISIONAL_ADMISSION_NOTICE}</strong>
        </p>
      ) : null}
      {guide.summary ? <StructuredGuideText summary={guide.summary} /> : null}
      {guide.officialSources.map((source) => (
        <TrustSource key={source.url} source={source} />
      ))}
      {guide.lastCollectedAt ? (
        <VerifiedAt label="Last Collected" verifiedAt={guide.lastCollectedAt} />
      ) : null}
      <VerifiedAt label="Last Verified" verifiedAt={guide.lastVerifiedAt} />
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
  const provisional = isProvisionalAdmissionGuidance(
    `${opportunity.title} ${opportunity.summary ?? ""}`,
  );
  const actionHref = opportunity.actionUrl
    ? safeExternalHref(opportunity.actionUrl)
    : null;
  return (
    <PageContainer>
      <article className="opportunity-detail">
        <header className="opportunity-detail__hero">
          <p className="eyebrow">모집·입학정보</p>
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
                  주요 일정{provisional ? " (예정)" : ""}{" "}
                  <time dateTime={opportunity.keyDate}>
                    {formatPublicDateTime(opportunity.keyDate)}
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
            {provisional ? (
              <p className="opportunity-detail__audience">
                <strong>{PROVISIONAL_ADMISSION_NOTICE}</strong>
              </p>
            ) : null}
            {opportunity.summary ? (
              <StructuredGuideText
                summary={opportunity.summary
                  .split(/\n\s*\n/u)
                  .filter(
                    (paragraph) => paragraph !== PROVISIONAL_ADMISSION_NOTICE,
                  )
                  .join("\n\n")}
              />
            ) : null}
            {opportunity.targetAudience ? (
              <p className="opportunity-detail__audience">
                <strong>대상</strong> {opportunity.targetAudience}
              </p>
            ) : null}
          </section>
        ) : null}

        <OpportunityDates
          keyDates={opportunity.keyDates}
          provisional={provisional}
        />

        {opportunity.admissionGuide ? (
          <AdmissionGuide guide={opportunity.admissionGuide} />
        ) : null}

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
              {(
                opportunity.officialSources ??
                (opportunity.officialSource ? [opportunity.officialSource] : [])
              ).map((source) => (
                <TrustSource key={source.url} source={source} />
              ))}
            </div>
          </section>
        ) : null}

        {opportunity.lastCollectedAt ? (
          <VerifiedAt
            label="Last Collected"
            verifiedAt={opportunity.lastCollectedAt}
          />
        ) : null}

        {opportunity.lastVerifiedAt ? (
          <VerifiedAt
            label="Last Verified"
            verifiedAt={opportunity.lastVerifiedAt}
          />
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
          <p className="eyebrow">입학 준비 아티클</p>
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
          {article.excerpt ? (
            <p className="article-detail__excerpt">{article.excerpt}</p>
          ) : null}
        </header>

        <section className="article-detail__section" aria-label="본문">
          <ArticleProse sanitizedContentHtml={article.sanitizedContentHtml} />
        </section>

        {article.relatedInstitutions.length > 0 ? (
          <section className="article-detail__section" aria-label="관련 기관">
            <SectionHeader title="관련 기관" />
            <div className="detail-card-grid">
              {article.relatedInstitutions.map((institution) => (
                <InstitutionCard
                  analyticsEvent={{
                    name: "article_to_institution",
                    properties: {
                      articleId: article.id,
                      institutionId: institution.id,
                    },
                  }}
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
