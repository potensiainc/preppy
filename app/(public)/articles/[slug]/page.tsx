import { ArticleDetailView } from "@/app/_components/opportunity-article-pages";
import { toPublicArticleDTO } from "@/app/_lib/public-article";
import {
  getPublicExecutor,
  loadPublicPage,
} from "@/app/_lib/public-page.server";
import { getArticleBySlug } from "@/src/modules/public/article-query.server";

export const dynamic = "force-dynamic";

export default async function ArticleDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const storedArticle = await loadPublicPage(() =>
    getArticleBySlug(getPublicExecutor(), slug),
  );
  const article = toPublicArticleDTO(storedArticle);

  return <ArticleDetailView article={article} />;
}
