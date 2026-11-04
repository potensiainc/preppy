import "server-only";

import { notFound } from "next/navigation";

import { getPublicArticleAppBaseUrl } from "@/app/_lib/public-article";
import { getPublicExecutor } from "@/app/_lib/public-page.server";
import { NotFoundError } from "@/src/application/errors";
import { resolvePublicArticlePage } from "./article-page.server";
import {
  renderArticleSocialImage,
  renderSocialImage,
  type SocialImageFormat,
} from "./article-social-image";
import { getInstitutionBySlug } from "./institution-query.server";
import { getOpportunityBySlug } from "./opportunity-query.server";
import {
  institutionSearchTitle,
  institutionSocialEyebrow,
  socialCategoryLabel,
} from "./social-labels";

async function loadArticle(slug: string) {
  const resolution = await resolvePublicArticlePage(
    getPublicExecutor(),
    slug,
    getPublicArticleAppBaseUrl(),
  );
  if (resolution.kind !== "ARTICLE") notFound();
  return resolution.article;
}

export async function renderPublishedArticleSocialImage(
  slug: string,
  height: 630 | 600,
) {
  const article = await loadArticle(slug);
  return renderArticleSocialImage(
    article.title,
    height,
    socialCategoryLabel(article.category),
  );
}

/** Instagram/KakaoTalk card variants generated on demand from the same data. */
export async function renderPublishedArticleCard(
  slug: string,
  format: SocialImageFormat,
) {
  const article = await loadArticle(slug);
  return renderSocialImage({
    title: article.title,
    eyebrow: socialCategoryLabel(article.category),
    format,
  });
}

async function orNotFound<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

export async function renderInstitutionSocialImage(slug: string) {
  const dto = await orNotFound(() =>
    getInstitutionBySlug(getPublicExecutor(), slug),
  );
  return renderSocialImage({
    title: institutionSearchTitle(dto.institution),
    eyebrow: institutionSocialEyebrow(dto.institution),
  });
}

export async function renderOpportunitySocialImage(slug: string) {
  const dto = await orNotFound(() =>
    getOpportunityBySlug(getPublicExecutor(), slug),
  );
  return renderSocialImage({
    title: dto.title,
    eyebrow: `${dto.institution.name} · ${socialCategoryLabel(dto.institution.category)}`,
  });
}
