import type { Metadata } from "next";

export const revalidate = 0;
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export { default } from "./page-content";
