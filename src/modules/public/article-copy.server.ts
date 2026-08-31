import "server-only";
import { load } from "cheerio";
import { publicProse } from "./ux-writing";

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
