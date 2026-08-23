import Link from "next/link";

import type { ReactNode } from "react";

import type { PaginationDTO } from "@/src/modules/public/dto";

export function PageContainer({ children }: { children: ReactNode }) {
  return <div className="page-container">{children}</div>;
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="section-header">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2>{title}</h2>
        {description ? (
          <p className="section-description">{description}</p>
        ) : null}
      </div>
      {action ? <div className="section-action">{action}</div> : null}
    </header>
  );
}

export function EmptyState({
  title = "아직 공개된 정보가 없습니다.",
  description = "공식 정보를 확인해 차분히 정리하고 있습니다.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <section className="empty-state" aria-live="polite">
      <p className="eyebrow">PREPPY</p>
      <h2>{title}</h2>
      <p>{description}</p>
    </section>
  );
}

export function Pagination({
  pagination,
  hrefForPage,
}: {
  pagination: PaginationDTO;
  hrefForPage: (page: number) => string;
}) {
  if (pagination.page <= 1 && !pagination.hasNext) return null;

  return (
    <nav className="pagination" aria-label="페이지 이동">
      {pagination.page > 1 ? (
        <Link href={hrefForPage(pagination.page - 1)}>이전</Link>
      ) : (
        <span aria-disabled="true">이전</span>
      )}
      <span aria-current="page">{pagination.page}페이지</span>
      {pagination.hasNext ? (
        <Link href={hrefForPage(pagination.page + 1)}>다음</Link>
      ) : (
        <span aria-disabled="true">다음</span>
      )}
    </nav>
  );
}
