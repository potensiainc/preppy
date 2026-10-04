import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const marker =
  /\b(?:mock[ -]?up|MVP|TODO|FIXME|lorem ipsum|coming soon|under construction|design preview|demo data|sample data)\b|목업|프로토타입|개발용|테스트용|미구현|구현 예정/iu;
export function inspectHtml(html) {
  const $ = load(html);
  $("script,style,noscript").remove();
  const candidates = [$.root().text()];
  $("[aria-label],[title],[alt],[placeholder],meta[content]").each((_, el) => {
    for (const key of [
      "aria-label",
      "title",
      "alt",
      "placeholder",
      "content",
    ]) {
      const value = $(el).attr(key);
      if (value) candidates.push(value);
    }
  });
  return {
    markers: candidates.flatMap((text) => {
      const match = marker.exec(text);
      return match
        ? [
            text
              .slice(Math.max(0, match.index - 45), match.index + 110)
              .replace(/\s+/g, " "),
          ]
        : [];
    }),
    emptyLinks: $("a[href=''],a[href='#']")
      .map((_, el) => $(el).text().trim())
      .get(),
    $,
  };
}

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries
        .filter((e) => e.name !== "vendor")
        .map((e) => {
          const name = path.join(directory, e.name);
          return e.isDirectory() ? filesIn(name) : [name];
        }),
    )
  ).flat();
}

export async function auditSource() {
  const directories = [
    "app",
    "src/modules/public",
    "src/modules/legal",
    "src/modules/notification",
    "public",
  ];
  const files = (
    await Promise.all(directories.map((d) => filesIn(path.join(root, d))))
  )
    .flat()
    .filter(
      (f) =>
        /\.(tsx?|js|html|json)$/.test(f) &&
        !f.replaceAll("\\", "/").includes("/app/admin/"),
    );
  const findings = [];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    const relative = path.relative(root, file).replaceAll("\\", "/");
    if (file.endsWith(".html")) {
      for (const excerpt of inspectHtml(text).markers)
        findings.push({ file: relative, excerpt });
    } else if (file.endsWith(".json")) {
      const visit = (value, key = "$") => {
        if (typeof value === "string" && marker.test(value))
          findings.push({ file: relative, key, excerpt: value.slice(0, 180) });
        else if (value && typeof value === "object")
          for (const [k, v] of Object.entries(value)) visit(v, `${key}.${k}`);
      };
      visit(JSON.parse(text));
    } else {
      const source = ts.createSourceFile(
        file,
        text,
        ts.ScriptTarget.Latest,
        true,
      );
      const visit = (node) => {
        if (
          (ts.isStringLiteralLike(node) ||
            ts.isJsxText(node) ||
            ts.isTemplateHead(node) ||
            ts.isTemplateMiddle(node) ||
            ts.isTemplateTail(node)) &&
          marker.test(node.text)
        ) {
          findings.push({
            file: relative,
            line:
              source.getLineAndCharacterOfPosition(node.getStart(source)).line +
              1,
            excerpt: node.text.slice(0, 180),
          });
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  }
  return { filesScanned: files.length, findings };
}

async function auditLive(baseUrl) {
  const base = new URL(baseUrl).origin;
  const get = (url) =>
    fetch(url, { redirect: "manual", signal: AbortSignal.timeout(60000) });
  const sitemapResponse = await get(`${base}/sitemap.xml`);
  if (!sitemapResponse.ok)
    throw new Error(`Sitemap HTTP ${sitemapResponse.status}`);
  const sitemap = load(await sitemapResponse.text(), { xml: true });
  const seed = sitemap("loc")
    .map((_, el) => sitemap(el).text())
    .get();
  const extra = [
    "/schoolmap",
    "/articles",
    "/opportunities",
    "/privacy",
    "/terms",
    "/my-preppy",
    "/my-preppy/settings",
    "/onboarding",
  ];
  const queue = [...new Set([...seed, ...extra.map((p) => base + p)])];
  const seen = new Set(queue);
  const pages = [];
  const admissible = (raw) => {
    const url = new URL(raw, base);
    if (
      url.origin !== base ||
      !/^\/(?:articles\/|institutions(?:\/|$)|opportunities\/)/.test(
        url.pathname,
      )
    )
      return null;
    if (
      [...url.searchParams.keys()].some(
        (k) => !["page", "category"].includes(k),
      )
    )
      return null;
    url.hash = "";
    url.searchParams.sort();
    return url.href;
  };
  while (queue.length && pages.length < 2000) {
    const batch = queue.splice(0, 3);
    await Promise.all(
      batch.map(async (url) => {
        try {
          const response = await get(url);
          if (response.status >= 300 && response.status < 400) {
            pages.push({
              url,
              status: response.status,
              redirect: response.headers.get("location"),
            });
            return; // Never follow authentication or other action endpoints.
          }
          const { markers, emptyLinks, $ } = inspectHtml(await response.text());
          pages.push({ url, status: response.status, markers, emptyLinks });
          if (response.ok)
            $("a[href]").each((_, el) => {
              try {
                const next = admissible($(el).attr("href"));
                if (next && !seen.has(next)) {
                  seen.add(next);
                  queue.push(next);
                }
              } catch {
                /* Invalid URLs are not navigation targets. */
              }
            });
        } catch (error) {
          pages.push({ url, error: error.message });
        }
      }),
    );
    if (pages.length % 30 < 3)
      console.log(`Checked ${pages.length}; queued ${queue.length}`);
  }
  return {
    sitemapEntries: seed.length,
    discovered: seen.size,
    remaining: queue.length,
    pages,
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const report = {
    checkedAt: new Date().toISOString(),
    source: await auditSource(),
  };
  const baseIndex = process.argv.indexOf("--base-url");
  if (baseIndex !== -1)
    report.live = await auditLive(process.argv[baseIndex + 1]);
  await mkdir(path.join(root, "test-results"), { recursive: true });
  await writeFile(
    path.join(root, "test-results/public-release-audit.json"),
    JSON.stringify(report, null, 2),
  );
  const issues =
    report.live?.pages.filter(
      (p) =>
        p.error || p.status >= 400 || p.markers?.length || p.emptyLinks?.length,
    ) ?? [];
  console.log(
    JSON.stringify(
      {
        source: report.source,
        live: report.live && {
          pages: report.live.pages.length,
          remaining: report.live.remaining,
          issues,
        },
      },
      null,
      2,
    ),
  );
  if (report.source.findings.length || issues.length || report.live?.remaining)
    process.exitCode = 1;
}
