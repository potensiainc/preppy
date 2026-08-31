import Link from "next/link";

import { PageContainer } from "@/app/_components/ui-primitives";

export default function PublicNotFound() {
  return (
    <PageContainer>
      <section className="status-surface">
        <p className="eyebrow">404</p>
        <h1>페이지를 찾을 수 없어요</h1>
        <p>주소를 다시 확인하거나 다른 기관의 입학정보를 살펴봐 주세요.</p>
        <Link className="text-link" href="/institutions">
          기관 찾기
        </Link>
      </section>
    </PageContainer>
  );
}
