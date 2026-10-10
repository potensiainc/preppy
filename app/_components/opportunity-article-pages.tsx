import type { PublicArticleDTO } from "@/src/modules/public/dto";
import Link from "next/link";
import { PageNavigation } from "./page-navigation";
import { publicProse } from "@/src/modules/public/ux-writing";
import {
  explicitAcademicYear,
  isEarlierAcademicYear,
} from "@/src/modules/public/article-academic-year";

import { TrackedFollowCta as FollowCta } from "@/app/_components/tracked-follow-cta";
import { ArticleProse } from "@/app/_components/article-prose";
import {
  InstitutionCard,
  OpportunityCard,
} from "@/app/_components/public-cards";
import { PageContainer, SectionHeader } from "@/app/_components/ui-primitives";
import {
  articleTypeLabel,
  categoryLabel,
  formatPublicDate,
} from "@/app/_lib/presentation";

export { OpportunityDetailView } from "./admissions-detail";

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

export function ArticleDetailView({ article }: { article: PublicArticleDTO }) {
  const followTarget = uniqueArticleInstitution(article);
  const academicYear = explicitAcademicYear(article.title);
  const historical = article.relatedOpportunities.filter((item) =>
    isEarlierAcademicYear(item.title, academicYear),
  );
  const current = article.relatedOpportunities.filter(
    (item) => !isEarlierAcademicYear(item.title, academicYear),
  );
  return (
    <PageContainer>
      <article className="article-detail">
        <Link className="page-back" href="/curation/guides">
          ← 입학 준비 아티클
        </Link>
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
            <p className="article-detail__excerpt">
              {publicProse(article.excerpt)}
            </p>
          ) : null}
        </header>

        <PageNavigation
          items={[
            { id: "article-body", label: "본문" },
            ...(article.relatedInstitutions.length
              ? [{ id: "article-schools", label: "관련 기관" }]
              : []),
            ...(current.length
              ? [{ id: "article-admissions", label: "관련 입학정보" }]
              : []),
            ...(historical.length
              ? [{ id: "article-history", label: "이전 학년도 자료" }]
              : []),
          ]}
        />
        <section
          id="article-body"
          className="article-detail__section"
          aria-label="본문"
        >
          <ArticleProse
            articleSlug={article.slug}
            sanitizedContentHtml={article.sanitizedContentHtml}
          />
        </section>

        {article.relatedInstitutions.length > 0 ? (
          <section
            id="article-schools"
            className="article-detail__section"
            aria-label="관련 기관"
          >
            <SectionHeader title="관련 기관" />
            <div className="detail-card-grid">
              {article.relatedInstitutions.map((institution) => (
                <InstitutionCard
                  admissionContextYear={academicYear}
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

        {current.length > 0 ? (
          <section
            id="article-admissions"
            className="article-detail__section"
            aria-label="관련 모집·입학정보"
          >
            <SectionHeader title="관련 모집·입학정보" />
            <div className="detail-card-grid">
              {current.map((opportunity) => (
                <OpportunityCard
                  key={opportunity.id}
                  opportunity={opportunity}
                />
              ))}
            </div>
          </section>
        ) : null}

        {historical.length > 0 ? (
          <section
            id="article-history"
            className="article-detail__section"
            aria-label="이전 학년도 자료"
          >
            <SectionHeader title="이전 학년도 자료" />
            <p>
              이 글에서 안내하는 학년도와 달라요. 해당 학년도의 기록으로 확인해
              주세요.
            </p>
            <div className="detail-card-grid">
              {historical.map((opportunity) => (
                <OpportunityCard
                  key={opportunity.id}
                  opportunity={opportunity}
                />
              ))}
            </div>
          </section>
        ) : null}

        {followTarget?.followable ? (
          <section
            className="article-detail__section article-follow"
            aria-label="관심기관 등록"
          >
            <FollowCta
              articleId={article.id}
              context="ARTICLE"
              followable={followTarget.followable}
              institutionId={followTarget.id}
              label={`${followTarget.name} 관심기관으로 등록`}
              returnPath={`/articles/${article.slug}`}
            />
          </section>
        ) : null}
      </article>
    </PageContainer>
  );
}
