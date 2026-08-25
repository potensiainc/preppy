import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";

import { ArticleDetailView } from "@/app/_components/opportunity-article-pages";
import { JsonLd } from "@/app/_components/json-ld";
import { PageAnalytics } from "@/app/_components/page-analytics";
import { getPublicArticleAppBaseUrl } from "@/app/_lib/public-article";
import { getPublicExecutor } from "@/app/_lib/public-page.server";
import { resolvePublicArticlePage } from "@/src/modules/public/article-page.server";
import {
  buildArticleBreadcrumbJsonLd,
  buildArticleJsonLd,
  buildArticleMetadata,
  getSeoAppBaseUrl,
} from "@/src/modules/public/seo";

export const dynamic = "force-dynamic";

const loadArticleResolution = cache((slug: string) =>
  resolvePublicArticlePage(
    getPublicExecutor(),
    slug,
    getPublicArticleAppBaseUrl(),
  ),
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const resolution = await loadArticleResolution(slug);
  if (resolution.kind !== "ARTICLE") {
    return { robots: { index: false, follow: false } };
  }
  return buildArticleMetadata(resolution.article, getSeoAppBaseUrl());
}

export default async function ArticleDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const resolution = await loadArticleResolution(slug);
  if (resolution.kind === "REDIRECT") {
    permanentRedirect(resolution.targetPath);
  }
  if (resolution.kind === "NOT_FOUND") notFound();
  const appBaseUrl = getSeoAppBaseUrl();
  const articleJsonLd = buildArticleJsonLd(resolution.article, appBaseUrl);
  const breadcrumbJsonLd = buildArticleBreadcrumbJsonLd(
    resolution.article,
    appBaseUrl,
  );
  return (
    <>
      <PageAnalytics
        events={[
          {
            name: "article_view",
            properties: { articleId: resolution.article.id },
          },
        ]}
        navigationKey={`ARTICLE:${resolution.article.id}`}
      />
      <ArticleDetailView article={resolution.article} />
      {articleJsonLd ? <JsonLd value={articleJsonLd} /> : null}
      {breadcrumbJsonLd ? <JsonLd value={breadcrumbJsonLd} /> : null}
    </>
  );
}
