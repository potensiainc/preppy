import type { Metadata } from "next";
import { LegalDocument } from "@/app/_components/legal-document";
import { privacyContent } from "@/src/modules/legal/content";
export const metadata: Metadata = {
  title: "개인정보 처리방침 | PREPPY",
  robots: { index: false, follow: false },
};
export default function PrivacyPage() {
  return <LegalDocument title="개인정보 처리방침" content={privacyContent} />;
}
