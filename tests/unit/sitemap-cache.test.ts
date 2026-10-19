import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listPublicSitemapEntries } from "@/src/modules/public/sitemap-query.server";

vi.mock("@/src/infrastructure/db/runtime.server", () => ({
  getRuntimeDatabase: () => ({ executor: {} }),
}));
vi.mock("@/src/modules/public/seo", () => ({
  getSeoAppBaseUrl: () => "https://preppy.kr",
}));
vi.mock("@/src/modules/public/sitemap-query.server", () => ({
  listPublicSitemapEntries: vi.fn(),
}));

const list = vi.mocked(listPublicSitemapEntries);
const HOUR_MS = 60 * 60 * 1000;

async function loadSitemap() {
  vi.resetModules();
  return (await import("@/app/sitemap")).default;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-19T00:00:00.000Z"));
  list.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("sitemap response cache", () => {
  it("builds once and serves the cached entries within the TTL", async () => {
    list.mockResolvedValueOnce([{ url: "https://preppy.kr/" }]);
    const sitemap = await loadSitemap();

    expect(await sitemap()).toEqual([{ url: "https://preppy.kr/" }]);
    vi.setSystemTime(Date.now() + HOUR_MS - 1);
    expect(await sitemap()).toEqual([{ url: "https://preppy.kr/" }]);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("shares one build between concurrent cold requests", async () => {
    list.mockResolvedValueOnce([{ url: "https://preppy.kr/" }]);
    const sitemap = await loadSitemap();

    await Promise.all([sitemap(), sitemap(), sitemap()]);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("serves stale entries while refreshing after the TTL", async () => {
    list
      .mockResolvedValueOnce([{ url: "https://preppy.kr/old" }])
      .mockResolvedValueOnce([{ url: "https://preppy.kr/new" }]);
    const sitemap = await loadSitemap();

    await sitemap();
    vi.setSystemTime(Date.now() + HOUR_MS);
    expect(await sitemap()).toEqual([{ url: "https://preppy.kr/old" }]);
    await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    await Promise.resolve();
    expect(await sitemap()).toEqual([{ url: "https://preppy.kr/new" }]);
  });

  it("keeps stale entries when a background refresh fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    list
      .mockRejectedValue(new Error("database unavailable"))
      .mockResolvedValueOnce([{ url: "https://preppy.kr/old" }]);
    const sitemap = await loadSitemap();

    await sitemap();
    vi.setSystemTime(Date.now() + HOUR_MS);
    await sitemap();
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalled());
    expect(await sitemap()).toEqual([{ url: "https://preppy.kr/old" }]);
    consoleError.mockRestore();
  });

  it("propagates a cold build failure instead of serving an empty sitemap", async () => {
    list.mockRejectedValueOnce(new Error("database unavailable"));
    const sitemap = await loadSitemap();

    await expect(sitemap()).rejects.toThrow("database unavailable");
  });
});
