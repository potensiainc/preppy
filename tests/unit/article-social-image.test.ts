import { describe, expect, it } from "vitest";

import {
  articleImageFontSize,
  renderArticleSocialImage,
} from "@/src/modules/public/article-social-image";

describe("article social image", () => {
  it("renders a Korean article title as a 1200x630 PNG", async () => {
    const response = await renderArticleSocialImage(
      "입학 준비에 필요한 서류와 일정 확인하기",
      630,
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    const view = new DataView(bytes.buffer);
    expect(response.headers.get("content-type")).toContain("image/png");
    expect(view.getUint32(16)).toBe(1200);
    expect(view.getUint32(20)).toBe(630);
    expect(bytes.length).toBeLessThan(5_000_000);
  });

  it("renders an X card at 1200x600", async () => {
    const response = await renderArticleSocialImage(
      "2027학년도 입학 준비 안내",
      600,
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(16)).toBe(1200);
    expect(view.getUint32(20)).toBe(600);
    expect(bytes.length).toBeLessThan(5_000_000);
  });

  it("scales the entire title down for long article titles", () => {
    expect(articleImageFontSize("가".repeat(20))).toBe(64);
    expect(articleImageFontSize("가".repeat(200))).toBe(25);
  });
});
