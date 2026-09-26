import type { Metadata } from "next";
import { LegalDocument } from "@/app/_components/legal-document";
import { termsContent } from "@/src/modules/legal/content";
export const metadata: Metadata = {
  title: "서비스 이용약관 | PREPPY",
  robots: { index: false, follow: false },
};
export default function TermsPage() {
  return <LegalDocument title="서비스 이용약관" content={termsContent} />;
}
