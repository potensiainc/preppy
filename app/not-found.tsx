import Link from "next/link";

import { PageContainer } from "@/app/_components/ui-primitives";

export default function NotFound() {
  return (
    <PageContainer>
      <section className="status-surface">
        <p className="eyebrow">404</p>
        <h1>찾으시는 정보를 확인할 수 없습니다.</h1>
        <p>
          공개된 정보를 다시 확인하고 있습니다. 다른 기관과 입학정보를
          살펴보세요.
        </p>
        <Link className="text-link" href="/institutions">
          기관 찾기로 이동
        </Link>
      </section>
    </PageContainer>
  );
}
