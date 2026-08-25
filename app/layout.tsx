import type { Metadata } from "next";
import { DM_Sans, IBM_Plex_Sans_KR } from "next/font/google";
import type { ReactNode } from "react";

import { getSeoAppBaseUrl } from "@/src/modules/public/seo";

import "./globals.css";

const latinFont = DM_Sans({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-preppy-latin",
  weight: ["400", "500", "600"],
});

const koreanFont = IBM_Plex_Sans_KR({
  display: "swap",
  preload: false,
  variable: "--font-preppy-korean",
  weight: ["400", "500", "600"],
});

export function generateMetadata(): Metadata {
  return { metadataBase: new URL(getSeoAppBaseUrl()) };
}

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko" className={`${latinFont.variable} ${koreanFont.variable}`}>
      <body>{children}</body>
    </html>
  );
}
