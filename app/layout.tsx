import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SiteFooter } from "@/app/_components/site-footer";
import { SiteHeader } from "@/app/_components/site-header";

import "./globals.css";

export const metadata: Metadata = {
  title: "PREPPY | 입학정보를 더 차분하게",
  description: "공식 출처를 바탕으로 정리한 프리미엄 입학정보 플랫폼",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
