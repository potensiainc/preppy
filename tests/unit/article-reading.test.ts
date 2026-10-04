import { readFileSync } from "node:fs";
import { load } from "cheerio";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { buildArticleReadingContent } from "@/src/modules/public/article-reading.server";
import { sanitizeArticleHtmlV1 } from "@/src/modules/editorial/sanitizer.server";
import { ArticleProse } from "@/app/_components/article-prose";

const slug = "seoul-private-elementary-admissions-briefings-2027";
const original = readFileSync(
  new URL("../fixtures/article-briefings-2027.html", import.meta.url),
  "utf8",
);
const sanitized = sanitizeArticleHtmlV1(original, {
  appBaseUrl: "https://preppy.kr",
}).html;

describe("Article internal reading", () => {
  it("keeps every sentence and condition of the real five-school article", () => {
    const result = buildArticleReadingContent(sanitized, slug);
    const $ = load(result.html);
    $("a span").remove();
    expect($.text()).toBe(load(sanitized).text());
    expect(result.sources).toHaveLength(7);
    expect(result.sources.map((s) => s.href)).toEqual(
      load(sanitized)("a[href^='https:']")
        .map((_, a) => load(sanitized)(a).attr("href"))
        .get(),
    );
    expect($("a[target]")).toHaveLength(0);
    expect($("a[href^='http']")).toHaveLength(0);
    expect($("a[href^='/articles/']")).toHaveLength(12);
  });

  it("preserves an entire school section without mixing the next school's conditions", () => {
    const { sources } = buildArticleReadingContent(sanitized, slug);
    const hwarang = sources.find(
      (s) => s.hostname === "myhwaranges.cafe24.com",
    )!;
    expect(hwarang.contextHtml).toContain("10월 23일 16:00");
    expect(hwarang.contextHtml).toContain("10월 27일 16:00");
    expect(hwarang.contextHtml).toContain("가족당 1명만 참석");
    expect(hwarang.contextHtml).toContain("중복으로 신청할 수 없어요");
    expect(hwarang.contextHtml).toContain("행사 날짜는 모두 2026년이에요");
    expect(hwarang.contextHtml).toContain(
      "설명회 신청과 입학원서 접수는 별개예요",
    );
    expect(hwarang.contextHtml).not.toContain("광운초");
    expect(hwarang.contextHtml).toContain(
      "/articles/hwarang-admissions-briefing-2027",
    );
  });

  it("keeps collection and verification timestamps and uncertainty in source context", () => {
    const notice =
      "자료 수집: 2026년 10월 4일 · 내용 확인: 2026년 10월 4일(한국 시간). 신청 상태는 확인한 시점의 정보예요. 정원과 취소석에 따라 달라질 수 있으니 신청 전 학교 안내를 다시 확인해 주세요.";
    const { sources } = buildArticleReadingContent(
      `<p>${notice}</p>${sanitized}`,
      slug,
    );
    for (const source of sources) expect(source.contextHtml).toContain(notice);
  });

  it("uses stable source IDs, deduplicates URLs, and escapes source labels", () => {
    const html =
      '<p><a href="https://school.example/?a=1&amp;b=2">A &amp; B</a></p>';
    const first = buildArticleReadingContent(html, "guide");
    const second = buildArticleReadingContent(
      `<h2>New heading</h2>${html}${html}`,
      "guide",
    );
    expect(second.sources).toHaveLength(1);
    expect(second.sources[0].id).toBe(first.sources[0].id);
    expect(first.sources[0].label).toBe("A & B");
    expect(first.html).toContain("A &amp; B");
    expect(first.sources[0].href).toBe("https://school.example/?a=1&b=2");
  });

  it("leaves relative internal destinations alone and renders source links in the same tab", () => {
    const markup = renderToStaticMarkup(
      createElement(ArticleProse, {
        articleSlug: slug,
        sanitizedContentHtml: sanitized,
      }),
    );
    expect(markup).toContain(
      'href="/articles/kumsung-admissions-briefing-2027"',
    );
    expect(markup).toContain(`/articles/${slug}/sources/`);
    expect(markup).toContain("프레피에서 안내 보기");
    expect(markup).not.toContain('target="_blank"');
    expect(markup).not.toContain('href="https:');
  });

  it("never turns unsafe input into a reader destination after sanitization", () => {
    const html = sanitizeArticleHtmlV1(
      '<p><a href="javascript:alert(1)">bad</a><a href="https://user:pass@evil.example">bad</a></p>',
      { appBaseUrl: "https://preppy.kr" },
    ).html;
    expect(buildArticleReadingContent(html, "guide").sources).toEqual([]);
  });
});
