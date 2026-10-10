import "server-only";

import { notFound } from "next/navigation";

import { getPublicArticleAppBaseUrl } from "@/app/_lib/public-article";
import { getPublicExecutor } from "@/app/_lib/public-page.server";
import { resolvePublicArticlePage } from "./article-page.server";
import { renderArticleSocialImage } from "./article-social-image";

export async function renderPublishedArticleSocialImage(
  slug: string,
  height: 630 | 600,
) {
  const resolution = await resolvePublicArticlePage(
    getPublicExecutor(),
    slug,
    getPublicArticleAppBaseUrl(),
  );
  if (resolution.kind !== "ARTICLE") notFound();
  return renderArticleSocialImage(resolution.article.title, height);
}
