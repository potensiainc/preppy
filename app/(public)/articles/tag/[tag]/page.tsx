import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";

import { ArticleListView } from "@/app/_components/article-list-pages";
import { parsePageParam } from "@/app/_lib/page-param";
import { getPublicExecutor } from "@/app/_lib/public-page.server";
import {
  articleTagPath,
  normalizeArticleTag,
} from "@/src/modules/editorial/tags";
import {
  ARTICLE_TAG_INDEX_MIN_ARTICLES,
  listPublishedArticleTags,
  listPublishedArticles,
} from "@/src/modules/public/article-list-query.server";
import {
  buildArticleTagMetadata,
  getSeoAppBaseUrl,
} from "@/src/modules/public/seo";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function decodeTag(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

const loadTagList = cache((tag: string, page: number) =>
  listPublishedArticles(getPublicExecutor(), { page, tag }),
);

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ tag: string }>;
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const decoded = decodeTag((await params).tag);
  const tag = decoded === null ? null : normalizeArticleTag(decoded);
  const page = parsePageParam((await searchParams).page);
  if (tag === null || page === null) {
    return { robots: { index: false, follow: false } };
  }
  const data = await loadTagList(tag, page);
  return buildArticleTagMetadata(
    getSeoAppBaseUrl(),
    tag,
    page,
    data.total >= ARTICLE_TAG_INDEX_MIN_ARTICLES,
  );
}

export default async function ArticleTagPage({
  params,
  searchParams,
}: {
  params: Promise<{ tag: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const decoded = decodeTag((await params).tag);
  const tag = decoded === null ? null : normalizeArticleTag(decoded);
  const page = parsePageParam((await searchParams).page);
  if (tag === null || page === null) notFound();
  if (tag !== decoded) permanentRedirect(articleTagPath(tag));
  const [data, tags] = await Promise.all([
    loadTagList(tag, page),
    listPublishedArticleTags(getPublicExecutor()),
  ]);
  if (data.total === 0 || page > data.pageCount) notFound();
  const base = articleTagPath(tag);
  return (
    <ArticleListView
      data={data}
      tags={tags}
      activeTag={tag}
      heading={`#${tag}`}
      description={`‘${tag}’ 관련 입학 일정과 준비 방법을 모아봤어요.`}
      hrefForPage={(next) => (next > 1 ? `${base}?page=${next}` : base)}
    />
  );
}
