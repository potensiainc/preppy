import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

// Brand palette shared with the public header (curation.module.css).
const BRAND = {
  background: "#1b2420",
  rule: "#39463d",
  logo: "#bfd5c3",
  dot: "#e4b28e",
  title: "#f4f1e8",
  muted: "#8fa597",
} as const;

const koreanFontData = readFile(
  join(process.cwd(), "public/fonts/IBMPlexSansKR-SemiBold.ttf"),
);
// Georgia-metric serif for the "preppy." wordmark (OFL, latin subset).
const logoFontData = readFile(
  join(process.cwd(), "public/fonts/Gelasio-Bold-latin.woff"),
);

export type SocialImageFormat = "og" | "x" | "square" | "portrait";

const FORMATS: Record<
  SocialImageFormat,
  Readonly<{ width: number; height: number; padding: string; scale: number }>
> = {
  og: { width: 1200, height: 630, padding: "60px 76px 52px", scale: 1 },
  x: { width: 1200, height: 600, padding: "56px 76px 48px", scale: 1 },
  square: { width: 1080, height: 1080, padding: "84px 80px 72px", scale: 1.18 },
  portrait: {
    width: 1080,
    height: 1350,
    padding: "96px 84px 84px",
    scale: 1.45,
  },
};

export function isSocialImageFormat(
  value: unknown,
): value is SocialImageFormat {
  return typeof value === "string" && Object.hasOwn(FORMATS, value);
}

export function articleImageFontSize(title: string): number {
  const length = Array.from(title).length;
  if (length > 160) return 25;
  if (length > 110) return 30;
  if (length > 75) return 37;
  if (length > 48) return 45;
  if (length > 30) return 53;
  return 64;
}

export async function renderSocialImage(
  options: Readonly<{
    title: string;
    eyebrow?: string | null;
    format?: SocialImageFormat;
  }>,
): Promise<ImageResponse> {
  const format = FORMATS[options.format ?? "og"];
  const title = options.title.replace(/\s+/gu, " ").trim();
  const eyebrow = options.eyebrow?.replace(/\s+/gu, " ").trim() || null;
  const fontSize = Math.round(articleImageFontSize(title) * format.scale);
  const [koreanFont, logoFont] = await Promise.all([
    koreanFontData,
    logoFontData,
  ]);

  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: format.width,
        height: format.height,
        padding: format.padding,
        background: BRAND.background,
        color: BRAND.title,
        fontFamily: "IBM Plex Sans KR",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          fontFamily: "Gelasio",
          fontSize: Math.round(62 * format.scale),
          letterSpacing: -3,
          lineHeight: 1,
          color: BRAND.logo,
        }}
      >
        preppy
        <span style={{ color: BRAND.dot }}>.</span>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          flex: 1,
          width: "100%",
        }}
      >
        {eyebrow ? (
          <div
            style={{
              display: "flex",
              color: BRAND.dot,
              fontSize: Math.round(27 * format.scale),
              marginBottom: Math.round(22 * format.scale),
            }}
          >
            {eyebrow}
          </div>
        ) : null}
        <div
          style={{
            display: "flex",
            fontSize,
            lineHeight: 1.28,
            letterSpacing: -1.5,
            wordBreak: "keep-all",
            overflowWrap: "anywhere",
          }}
        >
          {title}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          borderTop: `2px solid ${BRAND.rule}`,
          paddingTop: Math.round(22 * format.scale),
          color: BRAND.muted,
          fontSize: Math.round(24 * format.scale),
        }}
      >
        <div>영유·사립초·국제학교 입학 정보</div>
        <div>preppy.kr</div>
      </div>
    </div>,
    {
      width: format.width,
      height: format.height,
      headers: {
        "cache-control": "public, max-age=600, s-maxage=3600",
      },
      fonts: [
        {
          name: "IBM Plex Sans KR",
          data: koreanFont,
          weight: 600,
          style: "normal",
        },
        { name: "Gelasio", data: logoFont, weight: 700, style: "normal" },
      ],
    },
  );
}

export function renderArticleSocialImage(
  rawTitle: string,
  height: 630 | 600,
  eyebrow?: string | null,
): Promise<ImageResponse> {
  return renderSocialImage({
    title: rawTitle,
    eyebrow: eyebrow ?? null,
    format: height === 600 ? "x" : "og",
  });
}
