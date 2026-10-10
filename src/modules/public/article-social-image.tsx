import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

const fontData = readFile(
  join(process.cwd(), "public/fonts/IBMPlexSansKR-SemiBold.ttf"),
);

export function articleImageFontSize(title: string): number {
  const length = Array.from(title).length;
  if (length > 160) return 25;
  if (length > 110) return 30;
  if (length > 75) return 37;
  if (length > 48) return 45;
  if (length > 30) return 53;
  return 64;
}

export async function renderArticleSocialImage(
  rawTitle: string,
  height: 630 | 600,
): Promise<ImageResponse> {
  const title = rawTitle.replace(/\s+/gu, " ").trim();
  const fontSize = articleImageFontSize(title);
  const font = await fontData;

  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: 1200,
        height,
        padding: "65px 80px 60px",
        borderLeft: "16px solid #315C50",
        background: "#F7F8F4",
        color: "#17251F",
        fontFamily: "IBM Plex Sans KR",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 68,
            height: 68,
            borderRadius: 12,
            background: "#244A40",
            color: "white",
            fontSize: 47,
          }}
        >
          P
        </div>
        <div style={{ color: "#244A40", fontSize: 35, letterSpacing: 3 }}>
          PREPPY
        </div>
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
        <div style={{ color: "#315C50", fontSize: 25, marginBottom: 22 }}>
          입학 준비 아티클
        </div>
        <div
          style={{
            display: "flex",
            fontSize,
            lineHeight: 1.25,
            letterSpacing: -1.5,
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
          borderTop: "2px solid #D8E3DA",
          paddingTop: 23,
          color: "#51635A",
          fontSize: 24,
        }}
      >
        <div>입학 준비에 필요한 정보, 한곳에서</div>
        <div>preppy.kr</div>
      </div>
    </div>,
    {
      width: 1200,
      height,
      fonts: [
        {
          name: "IBM Plex Sans KR",
          data: font,
          weight: 600,
          style: "normal",
        },
      ],
    },
  );
}
