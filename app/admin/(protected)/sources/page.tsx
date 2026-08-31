import Link from "next/link";

import {
  AdminDataTable,
  AdminEmptyState,
  AdminPageHeader,
  AdminPagination,
  AdminSourceUrl,
  AdminStateChip,
  formatAdminCode,
  formatAdminDate,
} from "@/app/admin/_components/read-ui";
import { getAdminExecutor } from "@/app/admin/_lib/admin-page.server";
import type {
  AdminPageDTO,
  AdminSourceDTO,
} from "@/src/modules/admin/read-model/contracts";
import {
  parseSourceAdminListInput,
  type SourceAdminListInput,
} from "@/src/modules/admin/read-model/input";
import { listAdminSources } from "@/src/modules/admin/read-model/source-query.server";

export function AdminSourceListView({
  data,
  query = { page: 1, pageSize: 20 },
}: {
  data: AdminPageDTO<AdminSourceDTO>;
  query?: SourceAdminListInput;
}) {
  return (
    <div className="admin-page admin-catalog-page">
      <AdminPageHeader
        kicker="목록 / 출처"
        title="출처 목록"
        description="등록 URL과 출처 권한, 운영 상태를 확인해요. 모니터링 정책과 연결 정보, 최근 수집 결과도 보여줘요."
      />
      <section aria-labelledby="source-catalog-heading">
        <div className="admin-section-heading">
          <h2 id="source-catalog-heading">등록 목록</h2>
          <AdminStateChip>{data.pagination.total} 건</AdminStateChip>
        </div>
        {data.items.length === 0 ? (
          <AdminEmptyState>조건에 맞는 출처가 없어요.</AdminEmptyState>
        ) : (
          <AdminDataTable caption="기준 출처 목록">
            <thead>
              <tr>
                <th scope="col">출처</th>
                <th scope="col">유형</th>
                <th scope="col">출처 권한</th>
                <th scope="col">운영 상태</th>
                <th scope="col">연결</th>
                <th scope="col">최근 수집 기록</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <th scope="row">
                    <Link href={`/admin/sources/${item.id}`}>
                      {item.sourceName}
                    </Link>
                    <AdminSourceUrl
                      displayUrl={item.canonicalUrl}
                      safeUrl={item.safeUrl}
                    />
                  </th>
                  <td>{formatAdminCode(item.sourceType)}</td>
                  <td>{formatAdminCode(item.authorityLevel)}</td>
                  <td>{formatAdminCode(item.lifecycleStatus)}</td>
                  <td>
                    {item.activeInstitutionBindingCount} 기관 ·{" "}
                    {item.activeOpportunityBindingCount} 입학정보
                  </td>
                  <td>
                    {item.latestObservation === null ? (
                      "수집 기록 없음"
                    ) : (
                      <>
                        {formatAdminCode(item.latestObservation.outcome)}
                        <span className="admin-cell-note">
                          {formatAdminDate(item.latestObservation.observedAt)}
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
          basePath="/admin/sources"
          query={query}
        />
      </section>
    </div>
  );
}

type NextSearchParams = Record<string, string | string[] | undefined>;

export default async function AdminSourcesPage({
  searchParams,
}: {
  searchParams: Promise<NextSearchParams>;
}) {
  const query = parseSourceAdminListInput(await searchParams);
  const data = await listAdminSources(getAdminExecutor(), query);
  return <AdminSourceListView data={data} query={query} />;
}
