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
        kicker="Inspection / Notifications"
        title="Notification ledger"
        description="Signal identity and aggregate delivery pressure without recipient, provider, payload, or error-body disclosure."
      />
      <section aria-labelledby="notification-catalog-heading">
        <div className="admin-section-heading">
          <h2 id="notification-catalog-heading">Signal records</h2>
          <AdminStateChip>{data.pagination.total} records</AdminStateChip>
        </div>
        {data.items.length === 0 ? (
          <AdminEmptyState>
            No Notifications match these filters.
          </AdminEmptyState>
        ) : (
          <AdminDataTable caption="Notification aggregate registry">
            <thead>
              <tr>
                <th scope="col">Notification</th>
                <th scope="col">Status</th>
                <th scope="col">Signal</th>
                <th scope="col">Opportunity</th>
                <th scope="col">Published</th>
                <th scope="col">Delivery pressure</th>
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
                        Change {item.opportunityChangeId}
                      </span>
                    )}
                  </td>
                  <td>{formatAdminDate(item.signalPublishedAt)}</td>
                  <td>
                    {item.deliveryCount} deliveries · {item.attemptCount}{" "}
                    attempts
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
