import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ArticlesPage, {
  generateMetadata as articleMetadata,
} from "@/app/(public)/articles/page";
import OpportunitiesPage, {
  generateMetadata as opportunityMetadata,
} from "@/app/(public)/opportunities/page";
import { getLatestArticles } from "@/src/modules/public/home-query.server";
import { getHomeCurrentOpportunityCards } from "@/src/modules/public/institution-query.server";

vi.mock("@/app/_lib/public-page.server", () => ({
  getPublicExecutor: () => ({}),
}));
vi.mock("@/src/modules/public/home-query.server", () => ({
  getLatestArticles: vi.fn(),
}));
vi.mock("@/src/modules/public/institution-query.server", () => ({
  getHomeCurrentOpportunityCards: vi.fn(),
}));
vi.mock("@/src/modules/public/seo", () => ({
  getSeoAppBaseUrl: () => "https://preppy.kr",
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getLatestArticles).mockResolvedValue([]);
  vi.mocked(getHomeCurrentOpportunityCards).mockResolvedValue([]);
});

describe("standalone public list routes", () => {
  it("uses clean canonical addresses", () => {
    expect(articleMetadata().alternates?.canonical).toBe(
      "https://preppy.kr/articles",
    );
    expect(opportunityMetadata().alternates?.canonical).toBe(
      "https://preppy.kr/opportunities",
    );
  });

  it("renders truthful empty first pages", async () => {
    expect(
      renderToStaticMarkup(
        await ArticlesPage({ searchParams: Promise.resolve({}) }),
      ),
    ).toContain("PREPPY에 공개된 아티클이 없어요");
    expect(renderToStaticMarkup(await OpportunitiesPage())).toContain(
      "기관별 공식 안내에서 모집 일정을 확인해 주세요.",
    );
    expect(getLatestArticles).toHaveBeenCalledWith({}, 13, 0);
  });

  it.each(["invalid", "-1", "999999999999999999999"])(
    "handles invalid page input %s",
    async (page) => {
      await ArticlesPage({ searchParams: Promise.resolve({ page }) });
      expect(getLatestArticles).toHaveBeenCalledWith({}, 13, 0);
    },
  );

  it("returns not-found for an empty later page instead of claiming no articles exist", async () => {
    await expect(
      ArticlesPage({ searchParams: Promise.resolve({ page: "2" }) }),
    ).rejects.toThrow("NOT_FOUND");
    expect(getLatestArticles).toHaveBeenCalledWith({}, 13, 12);
  });

  it("keeps all cards reachable beyond the home preview limit", async () => {
    vi.mocked(getLatestArticles).mockResolvedValue(
      Array.from({ length: 13 }, (_, index) => ({
        id: `article-${index}`,
        slug: `guide-${index}`,
        title: `입학 준비 ${index}`,
        excerpt: "확인된 입학 안내예요.",
        articleType: "GUIDE",
        category: "ADMISSIONS_GENERAL",
        publishedAt: "2026-10-04T00:00:00.000Z",
        featuredImageUrl: null,
        featuredImageAlt: null,
        indexability: "INDEX",
      })),
    );
    const markup = renderToStaticMarkup(
      await ArticlesPage({ searchParams: Promise.resolve({}) }),
    );
    expect(markup).toContain('href="/articles?page=2"');
    expect(markup).toContain('href="/articles/guide-11"');
    expect(markup).not.toContain('href="/articles/guide-12"');
  });
});
