import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
  OG_SAFE_BOX,
  composeFeaturedOgImage,
  renderTextOgCard,
} from "@/src/modules/public/og-image.server";

async function solid(width: number, height: number) {
  return sharp({
    create: { width, height, channels: 3, background: { r: 255, g: 0, b: 0 } },
  })
    .png()
    .toBuffer();
}

async function pixel(image: Buffer, x: number, y: number) {
  const { data, info } = await sharp(image)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const offset = (y * info.width + x) * info.channels;
  return [data[offset], data[offset + 1], data[offset + 2]] as const;
}

const isSource = ([r, g, b]: readonly [number, number, number]) =>
  r > 235 && g < 25 && b < 25;

describe("Open Graph image composition", () => {
  it.each([
    ["tall portrait", 600, 1800],
    ["square", 1000, 1000],
    ["wide banner", 3000, 600],
    ["exact 1.91:1", 1200, 630],
  ])(
    "contains a %s source inside the 2:1-safe box without cropping",
    async (_label, width, height) => {
      const output = await composeFeaturedOgImage(await solid(width, height));
      const meta = await sharp(output).metadata();
      expect([meta.width, meta.height, meta.format]).toEqual([
        OG_IMAGE_WIDTH,
        OG_IMAGE_HEIGHT,
        "jpeg",
      ]);
      const scale = Math.min(
        OG_SAFE_BOX.width / width,
        OG_SAFE_BOX.height / height,
      );
      const drawnWidth = Math.round(width * scale);
      const drawnHeight = Math.round(height * scale);
      const left = Math.round((OG_IMAGE_WIDTH - drawnWidth) / 2);
      const top = Math.round((OG_IMAGE_HEIGHT - drawnHeight) / 2);
      // All four inner corners of the source survive (nothing was cropped)…
      for (const [x, y] of [
        [left + 3, top + 3],
        [left + drawnWidth - 4, top + 3],
        [left + 3, top + drawnHeight - 4],
        [left + drawnWidth - 4, top + drawnHeight - 4],
      ])
        expect(isSource(await pixel(output, x, y))).toBe(true);
      // …and the source stays inside the centered 2:1 crop (1200x600).
      expect(top).toBeGreaterThanOrEqual(15);
      expect(top + drawnHeight).toBeLessThanOrEqual(OG_IMAGE_HEIGHT - 15);
    },
  );

  it("renders the Korean text card at the shared canvas size", async () => {
    const output = await renderTextOgCard({
      eyebrow: "사립초등학교 · 입학 가이드",
      title: "2027학년도 서울 사립초 원서접수 일정 총정리",
      footer: "preppy.example",
    });
    const meta = await sharp(output).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([
      OG_IMAGE_WIDTH,
      OG_IMAGE_HEIGHT,
      "png",
    ]);
  });
});
