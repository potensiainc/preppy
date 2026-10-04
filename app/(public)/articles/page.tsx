import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleSection } from "@/app/_components/home-page";
import { PageContainer, Pagination } from "@/app/_components/ui-primitives";
import { getPublicExecutor } from "@/app/_lib/public-page.server";
import { getLatestArticles } from "@/src/modules/public/home-query.server";
import { getSeoAppBaseUrl } from "@/src/modules/public/seo";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 12;

export function generateMetadata(): Metadata {
  return {
    title: "입학 준비 아티클 | PREPPY",
    description: "기관을 비교하고 입학을 준비할 때 참고할 내용을 정리했어요.",
    alternates: { canonical: `${getSeoAppBaseUrl()}/articles` },
  };
}

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const raw = (await searchParams).page;
  const parsed = typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : 1;
  const page = Number.isSafeInteger(parsed)
    ? Math.max(1, Math.min(10000, parsed))
    : 1;
  const articles = await getLatestArticles(
    getPublicExecutor(),
    PAGE_SIZE + 1,
    (page - 1) * PAGE_SIZE,
  );
  if (page > 1 && articles.length === 0) notFound();
  return (
    <div className="home-page">
      <PageContainer>
        <ArticleSection articles={articles.slice(0, PAGE_SIZE)} standalone />
        <Pagination
          pagination={{ page, hasNext: articles.length > PAGE_SIZE }}
          hrefForPage={(value) =>
            value === 1 ? "/articles" : `/articles?page=${value}`
          }
        />
      </PageContainer>
    </div>
  );
}
