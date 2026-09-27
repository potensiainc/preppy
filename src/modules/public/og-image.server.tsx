import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { ImageResponse } from "next/og";
import sharp from "sharp";

import { resolveVettedAddresses } from "@/src/modules/http-collector/network-safety.server";

/**
 * Open Graph image contract shared by every platform.
 *
 * - Canvas 1200x630 (1.91:1): Facebook, LinkedIn, Naver, KakaoTalk.
 * - Everything important sits inside a centered safe box that survives a
 *   2:1 center crop (X/Twitter, KakaoTalk large preview) with margin.
 * - A featured image is never cropped: it is contained inside the safe box
 *   over a blurred, dimmed copy of itself.
 */
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;
export const OG_SAFE_BOX = { width: 1136, height: 568 } as const;

const BRAND_BACKGROUND = "#315c50";
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 5_000;
const MAX_REDIRECTS = 3;
const FONT_PATH = path.join(
  process.cwd(),
  "public/fonts/og/IBMPlexSansKR-Bold-og.ttf",
);

let fontPromise: Promise<Buffer> | null = null;
function loadFont(): Promise<Buffer> {
  fontPromise ??= readFile(FONT_PATH).catch((error: unknown) => {
    fontPromise = null;
    throw error;
  });
  return fontPromise;
}

async function fetchWithTimeout(url: URL): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      redirect: "manual",
      signal: controller.signal,
      headers: {
        accept: "image/avif,image/webp,image/png,image/jpeg,*/*;q=0.5",
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Downloads an operator-supplied HTTPS image with SSRF and size guards. */
export async function fetchSourceImage(rawUrl: string): Promise<Buffer | null> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (url.protocol !== "https:" || url.username || url.password) return null;
    try {
      await resolveVettedAddresses(url.hostname);
      const response = await fetchWithTimeout(url);
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) return null;
        url = new URL(location, url);
        continue;
      }
      if (!response.ok) return null;
      const type = response.headers.get("content-type") ?? "";
      if (!type.startsWith("image/") || type.includes("svg")) return null;
      const declared = Number(response.headers.get("content-length") ?? "0");
      if (declared > MAX_SOURCE_BYTES) return null;
      const body = Buffer.from(await response.arrayBuffer());
      return body.byteLength > MAX_SOURCE_BYTES ? null : body;
    } catch {
      return null;
    }
  }
  return null;
}

/** Contains the whole source inside the safe box over a blurred backdrop. */
export async function composeFeaturedOgImage(source: Buffer): Promise<Buffer> {
  const input = () =>
    sharp(source, { limitInputPixels: 50_000_000, failOn: "error" }).rotate();
  const background = await input()
    .resize(OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT, { fit: "cover" })
    .blur(36)
    .modulate({ brightness: 0.62, saturation: 0.8 })
    .toBuffer();
  const foreground = await input()
    .resize(OG_SAFE_BOX.width, OG_SAFE_BOX.height, { fit: "inside" })
    .toBuffer({ resolveWithObject: true });
  return sharp(background)
    .composite([
      {
        input: foreground.data,
        left: Math.round((OG_IMAGE_WIDTH - foreground.info.width) / 2),
        top: Math.round((OG_IMAGE_HEIGHT - foreground.info.height) / 2),
      },
    ])
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
}

function titleFontSize(title: string): number {
  const length = [...title].length;
  if (length <= 18) return 76;
  if (length <= 32) return 64;
  if (length <= 52) return 54;
  return 46;
}

function clampTitle(title: string, max = 72): string {
  const characters = [...title.trim()];
  return characters.length <= max
    ? characters.join("")
    : `${characters.slice(0, max - 1).join("")}…`;
}

export type TextOgCard = Readonly<{
  eyebrow: string;
  title: string;
  footer: string;
}>;

/** Brand text card. Padding keeps every glyph inside the 2:1 safe area. */
export async function renderTextOgCard(card: TextOgCard): Promise<Buffer> {
  const title = clampTitle(card.title);
  const font = await loadFont();
  const response = new ImageResponse(
    <div
      style={{
        width: OG_IMAGE_WIDTH,
        height: OG_IMAGE_HEIGHT,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px 96px",
        background: BRAND_BACKGROUND,
        color: "#ffffff",
        fontFamily: "PlexKR",
      }}
    >
      <div style={{ display: "flex", fontSize: 30, opacity: 0.82 }}>
        {card.eyebrow}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: titleFontSize(title),
          lineHeight: 1.28,
          letterSpacing: "-0.01em",
          wordBreak: "keep-all",
        }}
      >
        {title}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 30,
        }}
      >
        <span>PREPPY 프레피</span>
        <span style={{ fontSize: 24, opacity: 0.75 }}>{card.footer}</span>
      </div>
    </div>,
    {
      width: OG_IMAGE_WIDTH,
      height: OG_IMAGE_HEIGHT,
      fonts: [{ name: "PlexKR", data: font, weight: 700, style: "normal" }],
    },
  );
  return Buffer.from(await response.arrayBuffer());
}

/** Square publisher logo for Article structured data (min 112x112). */
export async function renderLogo(): Promise<Buffer> {
  const font = await loadFont();
  const response = new ImageResponse(
    <div
      style={{
        width: 512,
        height: 512,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: BRAND_BACKGROUND,
        color: "#ffffff",
        fontFamily: "PlexKR",
      }}
    >
      <div style={{ display: "flex", fontSize: 104, letterSpacing: "0.02em" }}>
        PREPPY
      </div>
      <div style={{ display: "flex", fontSize: 56, opacity: 0.85 }}>프레피</div>
    </div>,
    {
      width: 512,
      height: 512,
      fonts: [{ name: "PlexKR", data: font, weight: 700, style: "normal" }],
    },
  );
  return Buffer.from(await response.arrayBuffer());
}

export function ogImageResponse(
  body: Buffer,
  contentType: "image/png" | "image/jpeg",
): Response {
  return new Response(new Uint8Array(body), {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control":
        "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
      "x-content-type-options": "nosniff",
    },
  });
}
