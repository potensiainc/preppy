import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./admin.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: {
    default: "운영 | PREPPY 관리자",
    template: "%s | PREPPY 관리자",
  },
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <div className="preppy-admin-root" lang="ko">
      {children}
    </div>
  );
}
