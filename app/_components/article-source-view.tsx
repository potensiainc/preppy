import Link from "next/link";

import type { PublicArticleDTO } from "@/src/modules/public/dto";
import type { ArticleSourceReading } from "@/src/modules/public/article-reading.server";
import { ArticleProse } from "./article-prose";
import { PageContainer } from "./ui-primitives";
import { formatPublicDate } from "../_lib/presentation";

export function ArticleSourceView({
  article,
  source,
}: {
  article: PublicArticleDTO;
  source: ArticleSourceReading;
}) {
  return (
    <PageContainer>
      <article className="article-detail">
        <header className="article-detail__hero">
          <p className="eyebrow">프레피 출처 안내</p>
          <h1>{source.label}</h1>
          <p className="article-detail__excerpt">
            프레피가 이 출처와 함께 정리한 내용을 보여드려요. 외부 페이지의
            실시간 화면은 아니에요.
          </p>
          <p className="article-detail__meta">
            아티클 수정{" "}
            <time dateTime={article.updatedAt}>
              {formatPublicDate(article.updatedAt)}
            </time>
          </p>
          <Link href={`/articles/${article.slug}`}>아티클 전체 보기</Link>
        </header>
        <section className="article-detail__section" aria-label="프레피 안내">
          <ArticleProse sanitizedContentHtml={source.contextHtml} />
        </section>
        <section
          className="article-detail__section"
          aria-labelledby="source-original-title"
        >
          <h2 id="source-original-title">외부 출처</h2>
          <p>
            원문 확인과 실제 신청은 외부 사이트에서 진행해 주세요. 최신 공지와
            신청 가능 여부는 해당 사이트에서 확인해 주세요.
          </p>
          <p>
            <a href={source.href} rel="noopener noreferrer">
              {source.hostname}로 이동 (외부 사이트)
            </a>
          </p>
          <p>
            <Link href={`/articles/${article.slug}`}>
              프레피 아티클로 돌아가기
            </Link>
          </p>
        </section>
      </article>
    </PageContainer>
  );
}
