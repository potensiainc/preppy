import Link from "next/link";

import type { PublicArticleDTO } from "@/src/modules/public/dto";
import { publicProse } from "@/src/modules/public/ux-writing";

import { TrackedFollowCta as FollowCta } from "@/app/_components/tracked-follow-cta";
import { ArticleProse } from "@/app/_components/article-prose";
import { ArticleTagList } from "@/app/_components/article-list-pages";
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

function safeFeaturedImage(value: string | null): string | null {
  if (value === null) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
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

export function ArticleDetailView({ article }: { article: PublicArticleDTO }) {
  const followTarget = uniqueArticleInstitution(article);
  return (
    <PageContainer>
      <article className="article-detail">
        <header className="article-detail__hero">
          <p className="eyebrow">
            <Link href="/articles">입학 가이드</Link>
          </p>
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
            {article.publishedAt &&
            formatPublicDate(article.updatedAt) !==
              formatPublicDate(article.publishedAt) ? (
              <>
                {" · 수정 "}
                <time dateTime={article.updatedAt}>
                  {formatPublicDate(article.updatedAt)}
                </time>
              </>
            ) : null}
          </p>
          {article.excerpt ? (
            <p className="article-detail__excerpt">
              {publicProse(article.excerpt)}
            </p>
          ) : null}
          {safeFeaturedImage(article.featuredImageUrl) ? (
            // eslint-disable-next-line @next/next/no-img-element -- operator-supplied external URL
            <img
              className="article-detail__featured"
              src={safeFeaturedImage(article.featuredImageUrl)!}
              alt={article.featuredImageAlt ?? ""}
              width={1200}
              height={630}
            />
          ) : null}
        </header>

        <section className="article-detail__section" aria-label="본문">
          <ArticleProse sanitizedContentHtml={article.sanitizedContentHtml} />
        </section>

        {article.tags && article.tags.length > 0 ? (
          <ArticleTagList tags={article.tags} label="아티클 주제" />
        ) : null}

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
