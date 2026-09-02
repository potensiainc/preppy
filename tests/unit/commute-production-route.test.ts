import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  getRedirectUrl,
  unstable_getResponseFromNextConfig,
} from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";

import nextConfig from "@/next.config";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const commuteRoot = resolve(repositoryRoot, "public/commute");

describe("commute production route", () => {
  it("redirects the clean public URL to the static entry point and preserves filters", async () => {
    const response = await unstable_getResponseFromNextConfig({
      url: "https://preppy-web-production.up.railway.app/commute?area=서초구",
      nextConfig,
    });

    expect(response.status).toBe(307);
    expect(getRedirectUrl(response)).toBe(
      "https://preppy-web-production.up.railway.app/commute/index.html?area=%EC%84%9C%EC%B4%88%EA%B5%AC",
    );
  });

  it("ships a self-contained entry point with its required local assets", async () => {
    const html = await readFile(resolve(commuteRoot, "index.html"), "utf8");
    const app = await readFile(resolve(commuteRoot, "app.js"), "utf8");
    const styles = await readFile(resolve(commuteRoot, "styles.css"), "utf8");

    expect(html).toContain('href="./styles.css"');
    expect(html).toContain('src="./app.js"');
    expect(html).toContain("2026년 8월 31일");
    expect(html).toContain("실제 운행 여부");
    expect(html).not.toContain("LOCAL ONLY");
    expect(html).not.toContain("운영 서비스와 연결되어 있지 않습니다");
    expect(app).toContain("fetch('./data.json')");
    expect(app).not.toContain("이 컴퓨터에서만 열 수 있습니다");
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
        "vendor/maplibre-gl.css",
        "vendor/maplibre-gl.js",
        "vendor/SUIT-Variable.woff2",
      ].map((path) => access(resolve(commuteRoot, path))),
    );
  });
});
