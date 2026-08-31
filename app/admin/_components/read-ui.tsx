import Link from "next/link";
import type { ReactNode } from "react";

import type { AdminPaginationDTO } from "@/src/modules/admin/read-model/contracts";

export type AdminQueryValues = Readonly<
  Record<string, string | number | undefined>
>;

export function AdminPageHeader({
  kicker,
  title,
  description,
}: {
  kicker: string;
  title: string;
  description: string;
}) {
  return (
    <header className="admin-page-header">
      <p className="admin-kicker">{kicker}</p>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}

export function AdminStateChip({ children }: { children: ReactNode }) {
  return <span className="admin-state-chip">{children}</span>;
}

export function AdminDataTable({
  caption,
  children,
}: {
  caption: string;
  children: ReactNode;
}) {
  return (
    <div className="admin-table-scroll" tabIndex={0}>
      <table>
        <caption>{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export function AdminEmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="admin-empty-state" role="status">
      {children}
    </p>
  );
}

function pageHref(
  basePath: string,
  page: number,
  values: AdminQueryValues,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (key !== "page" && value !== undefined) params.set(key, String(value));
  }
  params.set("page", String(page));
  return `${basePath}?${params.toString()}`;
}

export function AdminPagination({
  pagination,
  basePath,
  query = {},
}: {
  pagination: AdminPaginationDTO;
  basePath: string;
  query?: AdminQueryValues;
}) {
  if (pagination.total === 0) return null;
  return (
    <nav className="admin-pagination" aria-label="목록 페이지">
      <p>
        {pagination.page}페이지 · 전체 {pagination.total}건
      </p>
      <div>
        {pagination.page > 1 ? (
          <Link href={pageHref(basePath, pagination.page - 1, query)}>
            이전
          </Link>
        ) : (
          <span aria-disabled="true">이전</span>
        )}
        {pagination.hasNext ? (
          <Link href={pageHref(basePath, pagination.page + 1, query)}>
            다음
          </Link>
        ) : (
          <span aria-disabled="true">다음</span>
        )}
      </div>
    </nav>
  );
}

export function AdminSourceUrl({
  displayUrl,
  safeUrl,
}: {
  displayUrl: string;
  safeUrl: string | null;
}) {
  return safeUrl === null ? (
    <span className="admin-url admin-url--invalid">{displayUrl}</span>
  ) : (
    <a
      className="admin-url"
      href={safeUrl}
      target="_blank"
      rel="noopener noreferrer"
    >
      {displayUrl}
    </a>
  );
}

export function formatAdminDate(value: string | null): string {
  if (value === null) return "확인할 수 없음";
  return `${new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value))} UTC`;
}

export function formatAdminCode(value: string): string {
  return value.replaceAll("_", " ");
}
