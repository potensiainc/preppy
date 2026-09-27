import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { ArticleListView } from "@/app/_components/article-list-pages";
import { parsePageParam } from "@/app/_lib/page-param";
import { getPublicExecutor } from "@/app/_lib/public-page.server";
import {
  listPublishedArticleTags,
  listPublishedArticles,
} from "@/src/modules/public/article-list-query.server";
import {
  buildArticleListMetadata,
  getSeoAppBaseUrl,
} from "@/src/modules/public/seo";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

const loadList = cache((page: number) =>
  listPublishedArticles(getPublicExecutor(), { page }),
);

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const page = parsePageParam((await searchParams).page);
  if (page === null) return { robots: { index: false, follow: true } };
  const data = await loadList(page);
  return buildArticleListMetadata(getSeoAppBaseUrl(), page, data.total > 0);
}

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const page = parsePageParam((await searchParams).page);
  if (page === null) notFound();
  const [data, tags] = await Promise.all([
    loadList(page),
    listPublishedArticleTags(getPublicExecutor()),
  ]);
  if (page > data.pageCount) notFound();
  return (
    <ArticleListView
      data={data}
      tags={tags}
      heading="입학 가이드"
      description="영어유치원·사립초·국제학교 입학 일정과 준비 방법을 공식 안내를 바탕으로 정리했어요."
      hrefForPage={(next) =>
        next > 1 ? `/articles?page=${next}` : "/articles"
      }
    />
  );
}
