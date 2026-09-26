import Link from "next/link";

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
  AdminOpportunityDTO,
  AdminPageDTO,
} from "@/src/modules/admin/read-model/contracts";
import {
  parseOpportunityAdminListInput,
  type OpportunityAdminListInput,
} from "@/src/modules/admin/read-model/input";
import { listAdminOpportunities } from "@/src/modules/admin/read-model/opportunity-query.server";

export function AdminOpportunityListView({
  data,
  query = { page: 1, pageSize: 20 },
}: {
  data: AdminPageDTO<AdminOpportunityDTO>;
  query?: OpportunityAdminListInput;
}) {
  return (
    <div className="admin-page admin-catalog-page">
      <AdminPageHeader
        kicker="목록 / 입학정보"
        title="입학정보 기준 목록"
        description="서버가 관리하는 기준 정보 방식과 현재 버전을 확인해요. 연결된 출처와 최근 검수한 변경도 보여줘요."
      />
      <section aria-labelledby="opportunity-catalog-heading">
        <div className="admin-section-heading">
          <h2 id="opportunity-catalog-heading">기준 정보 목록</h2>
          <AdminStateChip>{data.pagination.total} 건</AdminStateChip>
        </div>
        {data.items.length === 0 ? (
          <AdminEmptyState>조건에 맞는 입학정보가 없어요.</AdminEmptyState>
        ) : (
          <AdminDataTable caption="입학정보 기준 목록">
            <thead>
              <tr>
                <th scope="col">입학정보</th>
                <th scope="col">기관</th>
                <th scope="col">기준 정보 방식</th>
                <th scope="col">공개 / 진행 상태</th>
                <th scope="col">연결</th>
                <th scope="col">최근 변경</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <th scope="row">
                    <Link href={`/admin/opportunities/${item.id}`}>
                      {item.currentVersion?.title ?? item.slug}
                    </Link>
                    <span className="admin-record-id">{item.id}</span>
                  </th>
                  <td>{item.institution.displayName}</td>
                  <td>{formatAdminCode(item.truthMode)}</td>
                  <td>
                    {formatAdminCode(item.publicationState)}
                    <span className="admin-cell-note">
                      {item.currentVersion === null
                        ? "현재 버전 없음"
                        : formatAdminCode(item.currentVersion.businessState)}
                    </span>
                  </td>
                  <td>{item.activeSourceBindingCount}</td>
                  <td>
                    {item.recentChange === null ? (
                      "없음"
                    ) : (
                      <>
                        {formatAdminCode(item.recentChange.changeType)}
                        <span className="admin-cell-note">
                          {formatAdminDate(item.recentChange.verifiedAt)}
                        </span>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </AdminDataTable>
        )}
        <AdminPagination
          pagination={data.pagination}
          basePath="/admin/opportunities"
          query={query}
        />
      </section>
    </div>
  );
}

type NextSearchParams = Record<string, string | string[] | undefined>;

export default async function AdminOpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<NextSearchParams>;
}) {
  const query = parseOpportunityAdminListInput(await searchParams);
  const data = await listAdminOpportunities(getAdminExecutor(), query);
  return <AdminOpportunityListView data={data} query={query} />;
}
