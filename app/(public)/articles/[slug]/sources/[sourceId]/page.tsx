import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { ArticleSourceView } from "@/app/_components/article-source-view";
import { getPublicArticleAppBaseUrl } from "@/app/_lib/public-article";
import { getPublicExecutor } from "@/app/_lib/public-page.server";
import { resolvePublicArticlePage } from "@/src/modules/public/article-page.server";
import { buildArticleReadingContent } from "@/src/modules/public/article-reading.server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "출처 안내 | 프레피",
  robots: { index: false, follow: true },
};

export default async function ArticleSourcePage({
  params,
}: {
  params: Promise<{ slug: string; sourceId: string }>;
}) {
  const { slug, sourceId } = await params;
  if (!/^[a-f0-9]{24}$/.test(sourceId)) notFound();
  const resolution = await resolvePublicArticlePage(
    getPublicExecutor(),
    slug,
    getPublicArticleAppBaseUrl(),
  );
  if (resolution.kind === "REDIRECT") {
    permanentRedirect(`${resolution.targetPath}/sources/${sourceId}`);
  }
  if (resolution.kind === "NOT_FOUND") notFound();
  const { article } = resolution;
  const source = buildArticleReadingContent(
    article.sanitizedContentHtml,
    article.slug,
  ).sources.find((entry) => entry.id === sourceId);
  if (!source) notFound();
  return <ArticleSourceView article={article} source={source} />;
}
