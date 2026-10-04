import "server-only";
import { load } from "cheerio";
import { publicProse } from "./ux-writing";

export type ArticleReadingContent = {
  bodyHtml: string;
  collectedAt: string | null;
  checkedAt: string | null;
};

const reviewDate = String.raw`\d{4}년\s*\d{1,2}월\s*\d{1,2}일(?:\s*\(한국 시간\))?`;
const reviewLine = new RegExp(
  `^자료 수집:\\s*(${reviewDate})\\s*·\\s*내용 확인:\\s*(${reviewDate})\\.\\s*`,
  "u",
);
const repeatedApplicationNote =
  /^신청 상태는 확인한 시점의 정보예요\.\s*정원과 취소석에 따라 달라질 수 있으니 신청 전 학교 안내를 다시 확인해 주세요\.\s*/u;

/** Move only a recognized editorial review line out of the reading flow.
 * Other dates, status qualifications, and source links remain in the article.
 */
export function prepareArticleReadingContent(
  sanitizedHtml: string,
): ArticleReadingContent {
  const $ = load(sanitizedHtml, null, false);
  let collectedAt: string | null = null;
  let checkedAt: string | null = null;

  $("p").each((_, paragraph) => {
    if (collectedAt || checkedAt) return;
    const $paragraph = $(paragraph);
    if (
      !$paragraph
        .contents()
        .toArray()
        .every((node) => node.type === "text")
    )
      return;
    const match = reviewLine.exec($paragraph.text().trim());
    if (!match) return;

    collectedAt = match[1];
    checkedAt = match[2];
    const remaining = $paragraph
      .text()
      .trim()
      .slice(match[0].length)
      .replace(repeatedApplicationNote, "")
      .trim();
    if (remaining) $paragraph.text(remaining);
    else $paragraph.remove();
  });

  return {
    bodyHtml: publicArticleProse(collectedAt ? $.html() : sanitizedHtml),
    collectedAt,
    checkedAt,
  };
}

/** Accept only the already-sanitized editorial HTML. Change prose text nodes,
 * never attributes, source quotations, code, link labels or document headings.
 * The stored article and the sanitizer/security boundary remain unchanged.
 */
export function publicArticleProse(html: string): string {
  const $ = load(html, null, false);
  let changed = false;
  $.root()
    .find("*")
    .addBack()
    .contents()
    .each((_, node) => {
      if (node.type !== "text") return;
      if (
        $(node).parents(
          "blockquote,q,code,pre,a,abbr,cite,h1,h2,h3,h4,h5,h6,script,style,textarea",
        ).length
      )
        return;
      // Quotation marks may span several inline text nodes. Keep the entire
      // containing paragraph/list item verbatim instead of guessing which
      // isolated node belongs to an official quotation.
      const block = $(node)
        .parents("p,li,td,th,figcaption,div,section,article")
        .first();
      if (/[“”‘’"']/u.test(block.length ? block.text() : $.root().text()))
        return;
      const next = publicProse(node.data);
      if (next !== node.data) {
        node.data = next;
        changed = true;
      }
    });
  return changed ? $.html() : html;
}
