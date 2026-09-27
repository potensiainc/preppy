import { describe, expect, it } from "vitest";

import {
  buildArticleTagMetadata,
  buildHomeMetadata,
  buildRootMetadata,
} from "@/src/modules/public/seo";

const appBaseUrl = "https://preppy.example";

describe("social and search-console metadata", () => {
  it("keeps absolute URLs out of build-time root metadata", () => {
    const root = buildRootMetadata(appBaseUrl);
    expect(root).not.toHaveProperty("openGraph");
    expect(root).not.toHaveProperty("verification");
    expect(root.twitter).toEqual({ card: "summary_large_image" });
  });

  it("adds the default share card and verification tags on the home page", () => {
    const home = buildHomeMetadata(appBaseUrl, {
      GOOGLE_SITE_VERIFICATION: " g-token ",
      NAVER_SITE_VERIFICATION: "n-token",
    });
    expect(home.verification).toEqual({
      google: "g-token",
      other: { "naver-site-verification": "n-token" },
    });
    expect(home.openGraph).toMatchObject({
      siteName: "PREPPY 프레피",
      locale: "ko_KR",
      images: [
        { url: "https://preppy.example/og/default", width: 1200, height: 630 },
      ],
    });
    expect(buildHomeMetadata(appBaseUrl, {})).not.toHaveProperty(
      "verification",
    );
  });

  it("indexes tag hubs only when they are not thin and encodes the path", () => {
    const thin = buildArticleTagMetadata(appBaseUrl, "강남 영유", 1, false);
    expect(thin.robots).toEqual({ index: false, follow: true });
    expect(thin.alternates?.canonical).toBe(
      "https://preppy.example/articles/tag/%EA%B0%95%EB%82%A8%20%EC%98%81%EC%9C%A0",
    );
    const page2 = buildArticleTagMetadata(appBaseUrl, "영유", 2, true);
    expect(page2.robots).toEqual({ index: true, follow: true });
    expect(page2.alternates?.canonical).toBe(
      "https://preppy.example/articles/tag/%EC%98%81%EC%9C%A0?page=2",
    );
  });
});
