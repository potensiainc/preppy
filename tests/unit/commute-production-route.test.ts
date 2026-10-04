import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  getRedirectUrl,
  getRewrittenUrl,
  unstable_getResponseFromNextConfig,
} from "next/experimental/testing/server";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SiteHeader } from "@/app/_components/site-header";
import nextConfig from "@/next.config";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const commuteRoot = resolve(repositoryRoot, "public/commute");

describe("commute production route", () => {
  it("offers the commute map from both desktop and mobile public navigation", () => {
    const markup = renderToStaticMarkup(createElement(SiteHeader));

    expect(markup.match(/href="\/schoolmap"/g)).toHaveLength(2);
    expect(markup.match(/>통학지도<\/a>/g)).toHaveLength(2);
  });

  it("uses the public PREPPY wordmark as a real home link", async () => {
    const html = await readFile(resolve(commuteRoot, "index.html"), "utf8");

    expect(html).toMatch(
      /<a\s+class="wordmark"\s+href="\/"\s+aria-label="PREPPY 홈"\s*>\s*<span\s+class="brand-icon"\s+aria-hidden="true"><\/span>PREPPY<\/a\s*>/u,
    );
    expect(html).not.toMatch(/class="wordmark"[^>]*data-action="home"/u);
  });

  it("does not ship design-preview copy or a fabricated initial result count", async () => {
    const html = await readFile(resolve(commuteRoot, "index.html"), "utf8");
    expect(html).not.toMatch(
      /mock[ -]?up|목업|PUBLIC DESIGN PREVIEW|\bMVP\b|preview-badge/iu,
    );
    expect(html).toContain('aria-label="통학 자료와 이용 안내"');
    expect(html).toContain('id="result-count"></em>');
    expect(html).toContain("통학 자료를 불러오고 있어요.");
  });

  it("keeps data provenance, uncertainty, time meaning, and actual storage limits", async () => {
    const html = await readFile(resolve(commuteRoot, "index.html"), "utf8");
    for (const fact of [
      "2026년 8월 31일",
      "제3자",
      "실제 운행 여부",
      "적용 학년도",
      "정류장 연결선",
      "상대시간",
      "시간 미제공",
      "중복될 수 있어요",
      "새로고침하면 초기화돼요",
      "관심기관과는 연동되지 않아요",
      "https://deatemom-saripcho-map.vercel.app/",
    ])
      expect(html.replace(/\s+/g, " ")).toContain(fact);
  });

  it.each(["/commute", "/commute/index.html", "/schoolmap/index.html"])(
    "redirects legacy %s to schoolmap and preserves filters",
    async (path) => {
      const response = await unstable_getResponseFromNextConfig({
        url: `https://preppy-web-production.up.railway.app${path}?area=서초구&school=test-school`,
        nextConfig,
      });

      expect(response.status).toBe(308);
      expect(getRedirectUrl(response)).toBe(
        "https://preppy-web-production.up.railway.app/schoolmap?area=%EC%84%9C%EC%B4%88%EA%B5%AC&school=test-school",
      );
    },
  );

  it("serves the static map without exposing index.html in the address bar", async () => {
    const response = await unstable_getResponseFromNextConfig({
      url: "https://preppy.kr/schoolmap",
      nextConfig,
    });
    expect(getRedirectUrl(response)).toBeNull();
    expect(getRewrittenUrl(response)).toBe(
      "https://preppy.kr/commute/index.html",
    );
  });

  it("ships a self-contained entry point with its required local assets", async () => {
    const html = await readFile(resolve(commuteRoot, "index.html"), "utf8");
    const app = await readFile(resolve(commuteRoot, "app.js"), "utf8");
    const map = await readFile(resolve(commuteRoot, "map.js"), "utf8");
    const styles = await readFile(resolve(commuteRoot, "styles.css"), "utf8");

    expect(html).toContain('href="/commute/styles.css"');
    expect(html).toContain('src="/commute/app.js"');
    expect(html).toContain("2026년 8월 31일");
    expect(html).toContain("실제 운행 여부");
    expect(html).not.toContain("LOCAL ONLY");
    expect(html).not.toContain("운영 서비스와 연결되어 있지 않습니다");
    expect(app).toContain("fetch(new URL('./data.json', import.meta.url))");
    expect(app).not.toContain("이 컴퓨터에서만 열 수 있습니다");
    expect(`${html}\n${app}\n${map}`).not.toMatch(/[가-힣]+니다/u);
    expect(styles).toContain("url('./vendor/SUIT-Variable.woff2')");

    await Promise.all(
      [
        "app.js",
        "data.json",
        "icons.js",
        "map.js",
        "model.js",
        "route-view.js",
        "styles.css",
        "vendor/DM-Sans-Latin.woff2",
        "vendor/maplibre-gl.css",
        "vendor/maplibre-gl.js",
        "vendor/SUIT-Variable.woff2",
      ].map((path) => access(resolve(commuteRoot, path))),
    );
  });
});
