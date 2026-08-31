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
  AdminDeliveryDTO,
  AdminPageDTO,
} from "@/src/modules/admin/read-model/contracts";
import {
  listAdminDeliveries,
  parseAdminDeliveryInput,
  type AdminDeliveryInput,
} from "@/src/modules/admin/read-model/operations-query.server";

export function AdminDeliveriesView({
  data,
  query = { page: 1, pageSize: 20 },
}: {
  data: AdminPageDTO<AdminDeliveryDTO>;
  query?: AdminDeliveryInput;
}) {
  return (
    <div className="admin-page admin-operations-page">
      <AdminPageHeader
        kicker="운영 / 발송"
        title="발송 집계 기록"
        description="조회 전용 화면이에요. 수신자 식별 정보와 발송 업체별 세부 정보는 이 화면에 포함하지 않아요."
      />
      <section aria-labelledby="delivery-ledger-heading">
        <div className="admin-section-heading">
          <h2 id="delivery-ledger-heading">발송</h2>
          <AdminStateChip>{data.pagination.total} 건</AdminStateChip>
        </div>
        {data.items.length === 0 ? (
          <AdminEmptyState>조건에 맞는 발송 기록이 없어요.</AdminEmptyState>
        ) : (
          <AdminDataTable caption="조회 전용 발송 집계 목록">
            <thead>
              <tr>
                <th scope="col">발송</th>
                <th scope="col">알림</th>
                <th scope="col">채널 / 상태</th>
                <th scope="col">시도 횟수</th>
                <th scope="col">최근 오류 코드</th>
                <th scope="col">시각</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.deliveryId}>
                  <th scope="row">{item.deliveryId}</th>
                  <td>{item.notificationId}</td>
                  <td>
                    {item.channel} · {formatAdminCode(item.status)}
                    {item.suppressReason === null ? null : (
                      <span className="admin-cell-note">
                        {formatAdminCode(item.suppressReason)}
                      </span>
                    )}
                  </td>
                  <td>{item.attemptCount}</td>
                  <td>
                    {item.latestAttempt === null
                      ? "없음"
                      : `${formatAdminCode(item.latestAttempt.errorCategory)} · ${
                          item.latestAttempt.errorCode ?? "코드 없음"
                        }`}
                  </td>
                  <td>
                    생성 {formatAdminDate(item.createdAt)}
                    <span className="admin-cell-note">
                      처리 종료 {formatAdminDate(item.terminalAt)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </AdminDataTable>
        )}
        <AdminPagination
          pagination={data.pagination}
          basePath="/admin/operations/deliveries"
          query={query}
        />
      </section>
    </div>
  );
}

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AdminDeliveriesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = parseAdminDeliveryInput(await searchParams);
  const data = await listAdminDeliveries(getAdminExecutor(), query);
  return <AdminDeliveriesView data={data} query={query} />;
}
