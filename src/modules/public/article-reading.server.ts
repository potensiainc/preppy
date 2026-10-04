import "server-only";

import { createHash } from "node:crypto";
import { load } from "cheerio";

import { ARTICLE_CANONICAL_SLUG } from "../editorial/article-links.server";

export type ArticleSourceReading = Readonly<{
  id: string;
  href: string;
  label: string;
  hostname: string;
  contextHtml: string;
}>;

/** Presentation only: stored HTML and official URLs remain unchanged.
 * Input must have passed sanitizeArticleHtmlV1. Never fetch or embed remote HTML.
 */
export function buildArticleReadingContent(html: string, slug: string) {
  if (!ARTICLE_CANONICAL_SLUG.test(slug)) {
    throw new TypeError("Expected a canonical article slug.");
  }
  const $ = load(html, null, false);
  const sources = new Map<string, ArticleSourceReading>();
  // The introduction can define the academic/calendar year, verification time,
  // or shared caveats. Keep it with every extracted section, not just the article.
  const introduction: string[] = [];
  for (const node of $.root().contents().toArray()) {
    if ($(node).is("h2")) break;
    introduction.push($.html(node));
  }

  $("a[href]").each((_, element) => {
    const anchor = $(element);
    const href = anchor.attr("href")!;
    // Internal links have already been normalized by the sanitizer.
    if (href.startsWith("/")) return;
    const url = new URL(href);
    const id = createHash("sha256").update(href).digest("hex").slice(0, 24);
    if (!sources.has(id)) {
      // Keep the complete h2 section, including conditions in nested lists/h3s.
      const block = anchor
        .parents()
        .filter((_, node) => node.parent === $.root()[0])
        .first();
      const top = block.length ? block : anchor;
      const heading = top.is("h2") ? top : top.prevAll("h2").first();
      const context = heading.length
        ? heading.add(heading.nextUntil("h2"))
        : $.root()
            .children()
            .first()
            .add($.root().children().first().nextUntil("h2"));
      sources.set(id, {
        id,
        href,
        label: anchor.text().trim() || url.hostname,
        hostname: url.hostname,
        contextHtml:
          (heading.length ? introduction.join("") : "") +
          context
            .toArray()
            .map((node) => $.html(node))
            .join(""),
      });
    }
  });

  function internalize(content: string, currentSourceId?: string) {
    const doc = load(content, null, false);
    doc("a[href]").each((_, element) => {
      const anchor = doc(element);
      const href = anchor.attr("href")!;
      anchor.removeAttr("target").removeAttr("rel");
      if (href.startsWith("/")) return;
      const id = createHash("sha256").update(href).digest("hex").slice(0, 24);
      if (id === currentSourceId) {
        anchor.replaceWith(anchor.contents());
        return;
      }
      anchor.attr("href", `/articles/${slug}/sources/${id}`);
      anchor.append(doc("<span></span>").text(" · 프레피에서 안내 보기"));
    });
    return doc.html();
  }

  return {
    html: internalize(html),
    sources: [...sources.values()].map((source) => ({
      ...source,
      contextHtml: internalize(source.contextHtml, source.id),
    })),
  };
}
