import Link from "next/link";

import {
  AdminDataTable,
  AdminEmptyState,
  AdminPageHeader,
  AdminPagination,
  AdminStateChip,
  formatAdminCode,
} from "@/app/admin/_components/read-ui";
import { getAdminExecutor } from "@/app/admin/_lib/admin-page.server";
import type {
  AdminInstitutionDTO,
  AdminPageDTO,
} from "@/src/modules/admin/read-model/contracts";
import {
  parseInstitutionAdminListInput,
  type InstitutionAdminListInput,
} from "@/src/modules/admin/read-model/input";
import { listAdminInstitutions } from "@/src/modules/admin/read-model/institution-query.server";

export function AdminInstitutionListView({
  data,
  query = { page: 1, pageSize: 20 },
}: {
  data: AdminPageDTO<AdminInstitutionDTO>;
  query?: InstitutionAdminListInput;
}) {
  return (
    <div className="admin-page admin-catalog-page">
      <AdminPageHeader
        kicker="목록 / 기관"
        title="기관 목록"
        description="기관의 기준 정보와 운영·공개 상태를 확인해요. 연결된 출처와 입학정보도 함께 보여줘요."
      />
      <section aria-labelledby="institution-catalog-heading">
        <div className="admin-section-heading">
          <h2 id="institution-catalog-heading">등록 목록</h2>
          <AdminStateChip>{data.pagination.total} 건</AdminStateChip>
        </div>
        {data.items.length === 0 ? (
          <AdminEmptyState>조건에 맞는 기관이 없어요.</AdminEmptyState>
        ) : (
          <AdminDataTable caption="기준 기관 목록">
            <thead>
              <tr>
                <th scope="col">기관</th>
                <th scope="col">분류</th>
                <th scope="col">운영</th>
                <th scope="col">공개</th>
                <th scope="col">활성 출처</th>
                <th scope="col">입학정보</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <th scope="row">
                    <Link href={`/admin/institutions/${item.id}`}>
                      {item.displayName}
                    </Link>
                    <span className="admin-record-id">{item.id}</span>
                  </th>
                  <td>{formatAdminCode(item.category)}</td>
                  <td>{formatAdminCode(item.operationalState)}</td>
                  <td>{formatAdminCode(item.publicationState)}</td>
                  <td>{item.activeSourceBindingCount}</td>
                  <td>
                    <strong>{item.opportunitySummary.total}</strong>
                    {item.opportunitySummary.items.length > 0 ? (
                      <span className="admin-cell-note">
                        {item.opportunitySummary.items
                          .map(
                            (opportunity) =>
                              opportunity.title ?? opportunity.slug,
                          )
                          .join(" · ")}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </AdminDataTable>
        )}
        <AdminPagination
          pagination={data.pagination}
          basePath="/admin/institutions"
          query={query}
        />
      </section>
    </div>
  );
}

type NextSearchParams = Record<string, string | string[] | undefined>;

export default async function AdminInstitutionsPage({
  searchParams,
}: {
  searchParams: Promise<NextSearchParams>;
}) {
  const query = parseInstitutionAdminListInput(await searchParams);
  const data = await listAdminInstitutions(getAdminExecutor(), query);
  return <AdminInstitutionListView data={data} query={query} />;
}
