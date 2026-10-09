import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { NextRequest } from "next/server";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { describe, expect, it } from "vitest";
import { SiteHeader } from "@/app/_components/site-header";
import {
  ArticleSection,
  OpportunitySection,
} from "@/app/_components/home-page";
import { legacyMenuDestination } from "@/app/_components/legacy-menu-url";
import { proxy } from "@/proxy";

describe("clean public menu routes", () => {
  it("uses the same clean paths in desktop and mobile navigation", () => {
    const markup = renderToStaticMarkup(createElement(SiteHeader));
    const $ = load(markup);
    const paths = ["/", "/institutions", "/curation/calendar", "/commute"];
    for (const label of ["주요 메뉴", "모바일 주요 메뉴"]) {
      expect(
        $(`nav[aria-label="${label}"] a`)
          .map((_, link) => $(link).attr("href"))
          .get(),
      ).toEqual(paths);
    }
    expect(markup).not.toMatch(/href="[^"]*(?:#|index\.html)/);
  });

  it("maps only the two legacy home menu fragments", () => {
    expect(legacyMenuDestination("/", "#articles")).toBe("/articles");
    expect(legacyMenuDestination("/", "#current-opportunities")).toBe(
      "/opportunities",
    );
    expect(legacyMenuDestination("/articles/story", "#articles")).toBeNull();
    expect(legacyMenuDestination("/", "#home-private-elementary")).toBeNull();
  });

  it("removes an empty area without losing other shared selection parameters", () => {
    const response = proxy(
      new NextRequest(
        "https://preppy.kr/schoolmap?area=&school=school-1&route=route-1",
      ),
    );
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://preppy.kr/schoolmap?school=school-1&route=route-1",
    );
    expect(
      proxy(new NextRequest("https://preppy.kr/schoolmap?area=서초구")).status,
    ).toBe(200);
  });

  it("gives standalone lists a page heading and preserves truthful empty states", () => {
    const articles = renderToStaticMarkup(
      createElement(ArticleSection, { articles: [], standalone: true }),
    );
    const opportunities = renderToStaticMarkup(
      createElement(OpportunitySection, {
        opportunities: [],
        standalone: true,
      }),
    );
    expect(articles).toContain("<h1>입학 준비 아티클</h1>");
    expect(articles).toContain("PREPPY에 공개된 아티클이 없어요");
    expect(opportunities).toContain("<h1>현재 모집·입학정보</h1>");
    expect(opportunities).toContain(
      "기관별 공식 안내에서 모집 일정을 확인해 주세요.",
    );
  });

  it("treats a clean map URL as all areas and preserves explicit shared filters", async () => {
    const source = await readFile(
      new URL("../../public/commute/model.js", import.meta.url),
      "utf8",
    );
    const exports: Record<
      string,
      (...args: unknown[]) => Record<string, string>
    > = {};
    runInNewContext(
      ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS },
      }).outputText,
      { exports, URL, Intl },
    );
    const data = {
      regions: [{ name: "서초구" }],
      neighborhoods: [],
      schools: [
        {
          id: "school-1",
          routes: [{ id: "route-1", stops: [{ direction: "하교" }] }],
        },
      ],
    };
    expect(exports.readUrl(data, "https://preppy.kr/schoolmap").region).toBe(
      "",
    );
    expect(
      exports.readUrl(data, "https://preppy.kr/schoolmap?area=").region,
    ).toBe("");
    expect(
      exports.readUrl(
        data,
        "https://preppy.kr/schoolmap?area=서초구&school=school-1&route=route-1&way=하교",
      ),
    ).toMatchObject({
      region: "서초구",
      schoolId: "school-1",
      routeId: "route-1",
      way: "하교",
    });
  });
});
