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
  AdminNotificationDTO,
  AdminPageDTO,
} from "@/src/modules/admin/read-model/contracts";
import {
  parseNotificationAdminListInput,
  type NotificationAdminListInput,
} from "@/src/modules/admin/read-model/input";
import { listAdminNotifications } from "@/src/modules/admin/read-model/notification-query.server";

export function AdminNotificationListView({
  data,
  query = { page: 1, pageSize: 20 },
}: {
  data: AdminPageDTO<AdminNotificationDTO>;
  query?: NotificationAdminListInput;
}) {
  return (
    <div className="admin-page admin-catalog-page">
      <AdminPageHeader
        kicker="조회 / 알림"
        title="알림 기록"
        description="알림 식별 정보와 발송 집계를 보여줘요. 수신자, 발송 업체, 페이로드, 오류 본문은 노출하지 않아요."
      />
      <section aria-labelledby="notification-catalog-heading">
        <div className="admin-section-heading">
          <h2 id="notification-catalog-heading">알림 이벤트 기록</h2>
          <AdminStateChip>{data.pagination.total} 건</AdminStateChip>
        </div>
        {data.items.length === 0 ? (
          <AdminEmptyState>조건에 맞는 알림이 없어요.</AdminEmptyState>
        ) : (
          <AdminDataTable caption="알림 발송 집계 목록">
            <thead>
              <tr>
                <th scope="col">알림</th>
                <th scope="col">상태</th>
                <th scope="col">알림 이벤트</th>
                <th scope="col">입학정보</th>
                <th scope="col">발행</th>
                <th scope="col">발송 현황</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <th scope="row">{item.id}</th>
                  <td>{formatAdminCode(item.status)}</td>
                  <td>{formatAdminCode(item.signalType)}</td>
                  <td>
                    {item.opportunityId}
                    {item.opportunityChangeId === null ? null : (
                      <span className="admin-cell-note">
                        변경 {item.opportunityChangeId}
                      </span>
                    )}
                  </td>
                  <td>{formatAdminDate(item.signalPublishedAt)}</td>
                  <td>
                    {item.deliveryCount} 건 발송 · {item.attemptCount} 회 시도
                  </td>
                </tr>
              ))}
            </tbody>
          </AdminDataTable>
        )}
        <AdminPagination
          pagination={data.pagination}
          basePath="/admin/notifications"
          query={query}
        />
      </section>
    </div>
  );
}

type NextSearchParams = Record<string, string | string[] | undefined>;

export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<NextSearchParams>;
}) {
  const query = parseNotificationAdminListInput(await searchParams);
  const data = await listAdminNotifications(getAdminExecutor(), query);
  return <AdminNotificationListView data={data} query={query} />;
}
