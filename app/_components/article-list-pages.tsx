import Link from "next/link";

import { ArticleCard } from "@/app/_components/public-cards";
import {
  EmptyState,
  PageContainer,
  Pagination,
  SectionHeader,
} from "@/app/_components/ui-primitives";
import { articleTagPath } from "@/src/modules/editorial/tags";
import type {
  PublicArticleListDTO,
  PublicArticleTagDTO,
} from "@/src/modules/public/article-list-query.server";

export function ArticleTagList({
  tags,
  activeTag,
  label = "주제별로 보기",
}: Readonly<{
  tags: readonly (PublicArticleTagDTO | string)[];
  activeTag?: string;
  label?: string;
}>) {
  if (tags.length === 0) return null;
  return (
    <nav className="article-tags" aria-label={label}>
      <ul>
        {tags.map((entry) => {
          const tag = typeof entry === "string" ? entry : entry.tag;
          return (
            <li key={tag}>
              <Link
                href={articleTagPath(tag)}
                aria-current={tag === activeTag ? "page" : undefined}
              >
                #{tag}
                {typeof entry === "string" ? null : (
                  <span className="article-tags__count">{entry.count}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function ArticleListView({
  data,
  tags,
  heading,
  description,
  activeTag,
  hrefForPage,
}: Readonly<{
  data: PublicArticleListDTO;
  tags: readonly PublicArticleTagDTO[];
  heading: string;
  description: string;
  activeTag?: string;
  hrefForPage: (page: number) => string;
}>) {
  return (
    <PageContainer>
      <div className="article-list-page">
        <header className="article-list-page__hero">
          <p className="eyebrow">
            {activeTag ? (
              <>
                <Link href="/articles">입학 가이드</Link> / 주제
              </>
            ) : (
              "입학 가이드"
            )}
          </p>
          <h1>{heading}</h1>
          <p>{description}</p>
        </header>
        <ArticleTagList tags={tags} activeTag={activeTag} />
        <section aria-label="아티클 목록">
          <SectionHeader title={`아티클 ${data.total}개`} />
          {data.items.length > 0 ? (
            <div className="detail-card-grid">
              {data.items.map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="아직 공개된 아티클이 없어요"
              description="입학 일정과 준비 방법을 정리하는 대로 이곳에 올려 드릴게요."
            />
          )}
          <Pagination
            pagination={{
              page: data.page,
              pageSize: data.items.length,
              total: data.total,
              hasNext: data.page < data.pageCount,
            }}
            hrefForPage={hrefForPage}
          />
        </section>
      </div>
    </PageContainer>
  );
}
