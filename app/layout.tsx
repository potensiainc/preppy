import type { Metadata } from "next";
import type { ReactNode } from "react";

import { getSeoAppBaseUrl } from "@/src/modules/public/seo";

import "./globals.css";

export function generateMetadata(): Metadata {
  return { metadataBase: new URL(getSeoAppBaseUrl()) };
}

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
