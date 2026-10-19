import { writeFile } from "node:fs/promises";
import { load } from "cheerio";
const records = [];
const pages = [];
let next = "https://preppy.kr/institutions?category=ENGLISH_KINDERGARTEN";
while (next && pages.length < 30) {
  if (pages.includes(next)) throw new Error("Pagination cycle");
  const response = await fetch(next);
  if (!response.ok) throw new Error(`Public page ${response.status}`);
  const $ = load(await response.text());
  pages.push(next);
  $(".ek-card").each((_, el) => {
    const card = $(el),
      a = card.find("h2 a");
    records.push({
      name: a.text().trim(),
      institutionId:
        card.find("[data-institution-id]").attr("data-institution-id") ?? null,
      slug: a.attr("href")?.split("/").at(-1),
      address: card.find(".ek-card__address").text().trim(),
      region: card.find(".ek-card__region").text().trim(),
    });
  });
  const href = $("nav.pagination a")
    .toArray()
    .find((a) => $(a).text().trim() === "다음 페이지")?.attribs.href;
  next = href ? new URL(href, "https://preppy.kr").href : null;
}
if (new Set(records.map((r) => r.slug)).size !== records.length)
  throw new Error("Duplicate campus");
const result = {
  checkedAt: new Date().toISOString(),
  readOnly: true,
  pages,
  records,
};
await writeFile(
  "data/review/english-kindergarten-20261018/public-directory.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify({ pages: pages.length, campuses: records.length }));
