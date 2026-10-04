import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock("@/src/modules/public/article-page.server", () => ({
  resolvePublicArticlePage: mocks.resolve,
}));
vi.mock("@/app/_lib/public-page.server", () => ({
  getPublicExecutor: () => ({}),
}));
vi.mock("@/app/_lib/public-article", () => ({
  getPublicArticleAppBaseUrl: () => "https://preppy.kr",
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  permanentRedirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

import Page, {
  metadata,
} from "@/app/(public)/articles/[slug]/sources/[sourceId]/page";
import { ArticleSourceView } from "@/app/_components/article-source-view";
import { buildArticleReadingContent } from "@/src/modules/public/article-reading.server";
import type { PublicArticleDTO } from "@/src/modules/public/dto";

const article: PublicArticleDTO = {
  id: "article-id",
  slug: "guide",
  title: "2027학년도 입학 안내",
  excerpt: null,
  articleType: "GUIDE",
  category: "ADMISSIONS_GENERAL",
  publishedAt: null,
  featuredImageUrl: null,
  featuredImageAlt: null,
  indexability: "NOINDEX",
  updatedAt: "2026-10-04T00:00:00.000Z",
  seoTitle: null,
  seoDescription: null,
  canonicalUrl: null,
  robotsIndex: false,
  robotsFollow: true,
  relatedInstitutions: [],
  relatedOpportunities: [],
  sanitizedContentHtml:
    '<h2>신청 조건</h2><p>가족당 1명만 참석할 수 있어요.</p><p><a href="https://school.example/booking?round=2">학교 신청 페이지 열기</a></p>',
};
const source = buildArticleReadingContent(
  article.sanitizedContentHtml,
  article.slug,
).sources[0];
const params = (sourceId = source.id) =>
  Promise.resolve({ slug: article.slug, sourceId });

describe("Article source page", () => {
  beforeEach(() => {
    mocks.resolve.mockReset();
  });
  it("renders preserved context, truthful source copy, a return path, and an explicit same-tab external action", async () => {
    mocks.resolve.mockResolvedValue({ kind: "ARTICLE", article });
    const markup = renderToStaticMarkup(await Page({ params: params() }));
    expect(markup).toContain("가족당 1명만 참석할 수 있어요.");
    expect(markup).toContain("실시간 화면은 아니에요.");
    expect(markup).toContain("외부 사이트");
    expect(markup).toContain('href="/articles/guide"');
    expect(markup).toContain('href="https://school.example/booking?round=2"');
    expect(markup).not.toContain("target=");
    expect(markup).not.toContain(`/sources/${source.id}`);
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });
  it("rejects unknown source IDs instead of accepting arbitrary redirect destinations", async () => {
    await expect(
      Page({ params: params("https://evil.example") }),
    ).rejects.toThrow("NOT_FOUND");
    expect(mocks.resolve).not.toHaveBeenCalled();
    mocks.resolve.mockResolvedValue({ kind: "ARTICLE", article });
    await expect(Page({ params: params("a".repeat(24)) })).rejects.toThrow(
      "NOT_FOUND",
    );
  });
  it("does not expose sources of unpublished or removed articles", async () => {
    mocks.resolve.mockResolvedValue({ kind: "NOT_FOUND" });
    await expect(Page({ params: params() })).rejects.toThrow("NOT_FOUND");
  });
  it("preserves canonical article redirects and source identity", async () => {
    mocks.resolve.mockResolvedValue({
      kind: "REDIRECT",
      targetPath: "/articles/new-guide",
    });
    await expect(Page({ params: params() })).rejects.toThrow(
      `REDIRECT:/articles/new-guide/sources/${source.id}`,
    );
  });
  it("escapes labels rather than treating them as markup", () => {
    const markup = renderToStaticMarkup(
      createElement(ArticleSourceView, {
        article,
        source: { ...source, label: "<img src=x onerror=bad()>" },
      }),
    );
    expect(markup).toContain("&lt;img");
    expect(markup).not.toContain("<img");
  });
});
