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
        kicker="Operations / Deliveries"
        title="Delivery aggregate ledger"
        description="Inspection only. Recipient resolution and provider-specific detail remain outside this read projection."
      />
      <section aria-labelledby="delivery-ledger-heading">
        <div className="admin-section-heading">
          <h2 id="delivery-ledger-heading">Deliveries</h2>
          <AdminStateChip>{data.pagination.total} records</AdminStateChip>
        </div>
        {data.items.length === 0 ? (
          <AdminEmptyState>No Deliveries match these filters.</AdminEmptyState>
        ) : (
          <AdminDataTable caption="Read-only Delivery aggregate registry">
            <thead>
              <tr>
                <th scope="col">Delivery</th>
                <th scope="col">Notification</th>
                <th scope="col">Channel / status</th>
                <th scope="col">Attempts</th>
                <th scope="col">Latest safe failure</th>
                <th scope="col">Timing</th>
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
                      ? "None"
                      : `${formatAdminCode(item.latestAttempt.errorCategory)} · ${
                          item.latestAttempt.errorCode ?? "No code"
                        }`}
                  </td>
                  <td>
                    Created {formatAdminDate(item.createdAt)}
                    <span className="admin-cell-note">
                      Terminal {formatAdminDate(item.terminalAt)}
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
