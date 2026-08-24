import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./admin.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: {
    default: "Operations | PREPPY Admin",
    template: "%s | PREPPY Admin",
  },
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <div className="preppy-admin-root" lang="en">
      {children}
    </div>
  );
}
