import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CurationPage from "@/app/(public)/curation/[topic]/page";
import { getHomePage } from "@/src/modules/public/home-query.server";
import { getCurrentInformationSessionCards } from "@/src/modules/public/institution-query.server";
import type { HomePageDTO } from "@/src/modules/public/dto";

vi.mock("@/app/_lib/public-page.server", () => ({
  getPublicExecutor: () => ({}),
}));
vi.mock("@/src/modules/public/home-query.server", () => ({
  getHomePage: vi.fn(),
}));
vi.mock("@/src/modules/public/institution-query.server", () => ({
  getCurrentInformationSessionCards: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
const data: HomePageDTO = {
  currentOpportunities: [],
  featuredInstitutions: [],
  latestArticles: [],
  categories: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getHomePage).mockResolvedValue(data);
  vi.mocked(getCurrentInformationSessionCards).mockResolvedValue({
    items: [],
    hasNext: false,
  });
});

describe("calendar route filter boundaries", () => {
  it("wires a validated URL filter only into the curated calendar", async () => {
    const $ = load(
      renderToStaticMarkup(
        await CurationPage({
          params: Promise.resolve({ topic: "calendar" }),
          searchParams: Promise.resolve({
            category: "PRIVATE_ELEMENTARY",
            page: "99",
          }),
        }),
      ),
    );
    expect(
      $("nav[aria-label='기관 유형 필터'] a[aria-current='page']").text(),
    ).toContain("사립초");
    expect(getHomePage).toHaveBeenCalledTimes(1);
    expect(getCurrentInformationSessionCards).not.toHaveBeenCalled();
    expect($.text()).toContain("이 목록에는 사립초 일정이 없어요");
  });
  it("does not turn duplicated/invalid URL values into invented categories", async () => {
    const $ = load(
      renderToStaticMarkup(
        await CurationPage({
          params: Promise.resolve({ topic: "calendar" }),
          searchParams: Promise.resolve({
            category: ["PRIVATE_ELEMENTARY", "INTERNATIONAL_SCHOOL"],
          }),
        }),
      ),
    );
    expect(
      $("nav[aria-label='기관 유형 필터'] a[aria-current='page']").attr("href"),
    ).toBe("/curation/calendar");
  });
  it.each(["briefings", "guides"])(
    "keeps %s outside calendar-specific UI and filtering",
    async (topic) => {
      const $ = load(
        renderToStaticMarkup(
          await CurationPage({
            params: Promise.resolve({ topic }),
            searchParams: Promise.resolve({
              category: "PRIVATE_ELEMENTARY",
              page: "2",
            }),
          }),
        ),
      );
      expect($("nav[aria-label='기관 유형 필터']").length).toBe(0);
      if (topic === "briefings")
        expect(getCurrentInformationSessionCards).toHaveBeenCalledWith({}, 2);
    },
  );
});
