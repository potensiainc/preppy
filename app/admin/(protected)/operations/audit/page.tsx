import {
  AdminDataTable,
  AdminEmptyState,
  AdminPageHeader,
  AdminPagination,
  AdminStateChip,
  formatAdminCode,
  formatAdminDate,
} from "@/app/admin/_components/read-ui";
import { getAdminExecutor } from "@/app/admin/_lib/admin-page.server";
import type {
  AdminAuditDTO,
  AdminPageDTO,
} from "@/src/modules/admin/read-model/contracts";
import {
  listAdminAudit,
  parseAdminAuditInput,
  type AdminAuditInput,
} from "@/src/modules/admin/read-model/operations-query.server";

function metadataSummary(metadata: AdminAuditDTO["metadata"]): string {
  const entries = Object.entries(metadata);
  if (entries.length === 0) return "없음";
  return entries
    .map(
      ([key, value]) =>
        `${formatAdminCode(key)}: ${Array.isArray(value) ? value.join(", ") : value}`,
    )
    .join(" · ");
}

export function AdminAuditView({
  data,
  query = { page: 1, pageSize: 20 },
}: {
  data: AdminPageDTO<AdminAuditDTO>;
  query?: AdminAuditInput;
}) {
  return (
    <div className="admin-page admin-operations-page">
      <AdminPageHeader
        kicker="운영 / 감사"
        title="작업 감사 기록"
        description="조회 전용 화면이에요. 허용된 작업 요약만 보여주며 변경 전후의 저장 문서는 노출하지 않아요."
      />
      <section aria-labelledby="audit-ledger-heading">
        <div className="admin-section-heading">
          <h2 id="audit-ledger-heading">작업</h2>
          <AdminStateChip>{data.pagination.total} 건</AdminStateChip>
        </div>
        {data.items.length === 0 ? (
          <AdminEmptyState>조건에 맞는 감사 기록이 없어요.</AdminEmptyState>
        ) : (
          <AdminDataTable caption="조회 전용 작업 감사 목록">
            <thead>
              <tr>
                <th scope="col">작업</th>
                <th scope="col">작업자</th>
                <th scope="col">대상 데이터</th>
                <th scope="col">사유</th>
                <th scope="col">상관관계 ID</th>
                <th scope="col">허용된 요약 정보</th>
                <th scope="col">발생 시각</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <th scope="row">{formatAdminCode(item.action)}</th>
                  <td>{item.actor.adminUserId ?? "시스템"}</td>
                  <td>
                    {formatAdminCode(item.entityType)}
                    <span className="admin-cell-note">
                      {item.entityId ?? "대상 ID 없음"}
                    </span>
                  </td>
                  <td>
                    {item.reason === null
                      ? "없음"
                      : formatAdminCode(item.reason)}
                  </td>
                  <td>{item.correlationId ?? "확인 불가"}</td>
                  <td>{metadataSummary(item.metadata)}</td>
                  <td>{formatAdminDate(item.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </AdminDataTable>
        )}
        <AdminPagination
          pagination={data.pagination}
          basePath="/admin/operations/audit"
          query={query}
        />
      </section>
    </div>
  );
}

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = parseAdminAuditInput(await searchParams);
  const data = await listAdminAudit(getAdminExecutor(), query);
  return <AdminAuditView data={data} query={query} />;
}
