import {
  AdminDataTable,
  AdminEmptyState,
  AdminPageHeader,
  AdminPagination,
  AdminStateChip,
  formatAdminCode,
  formatAdminDate,
} from "@/app/admin/_components/read-ui";
import { AdminOutboxActions } from "@/app/admin/_components/outbox-actions";
import { getAdminExecutor } from "@/app/admin/_lib/admin-page.server";
import type {
  AdminOutboxDTO,
  AdminPageDTO,
} from "@/src/modules/admin/read-model/contracts";
import {
  listAdminOutbox,
  parseAdminOutboxInput,
  type AdminOutboxInput,
} from "@/src/modules/admin/read-model/operations-query.server";

export function AdminOutboxView({
  data,
  query = { page: 1, pageSize: 20 },
}: {
  data: AdminPageDTO<AdminOutboxDTO>;
  query?: AdminOutboxInput;
}) {
  return (
    <div className="admin-page admin-operations-page">
      <AdminPageHeader
        kicker="Operations / Outbox"
        title="Outbox event ledger"
        description="Inspect safe operational fields. Retry, Cancel, and Resend reconciliation appear only when the server projection proves that exact action eligible."
      />
      <section aria-labelledby="outbox-ledger-heading">
        <div className="admin-section-heading">
          <h2 id="outbox-ledger-heading">Events</h2>
          <AdminStateChip>{data.pagination.total} records</AdminStateChip>
        </div>
        {data.items.length === 0 ? (
          <AdminEmptyState>
            No Outbox events match these filters.
          </AdminEmptyState>
        ) : (
          <AdminDataTable caption="Read-only Outbox event registry">
            <thead>
              <tr>
                <th scope="col">Event</th>
                <th scope="col">Aggregate</th>
                <th scope="col">Status</th>
                <th scope="col">Attempts</th>
                <th scope="col">Provider attempt</th>
                <th scope="col">Safe failure</th>
                <th scope="col">Timing</th>
                <th scope="col">Safe actions</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <th scope="row">
                    {formatAdminCode(item.eventType)}
                    <span className="admin-cell-note">{item.id}</span>
                  </th>
                  <td>
                    {formatAdminCode(item.aggregateType)}
                    <span className="admin-cell-note">{item.aggregateId}</span>
                  </td>
                  <td>{formatAdminCode(item.status)}</td>
                  <td>
                    {item.attemptCount} / {item.maxAttempts ?? "unbounded"}
                  </td>
                  <td>
                    {item.latestAttempt === null ? (
                      "None"
                    ) : (
                      <>
                        {formatAdminCode(item.latestAttempt.provider)} ·{" "}
                        {formatAdminCode(item.latestAttempt.status)}
                        <span className="admin-cell-note">
                          Attempt {item.latestAttempt.id}
                        </span>
                        <span className="admin-cell-note">
                          Provider message{" "}
                          {item.latestAttempt.providerMessageId ?? "None"}
                        </span>
                      </>
                    )}
                  </td>
                  <td>{item.errorCode ?? "None"}</td>
                  <td>
                    Available {formatAdminDate(item.availableAt)}
                    <span className="admin-cell-note">
                      Dead letter {formatAdminDate(item.deadLetteredAt)}
                    </span>
                  </td>
                  <td>
                    <AdminOutboxActions item={item} />
                  </td>
                </tr>
              ))}
            </tbody>
          </AdminDataTable>
        )}
        <AdminPagination
          pagination={data.pagination}
          basePath="/admin/operations/outbox"
          query={query}
        />
      </section>
    </div>
  );
}

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AdminOutboxPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = parseAdminOutboxInput(await searchParams);
  const data = await listAdminOutbox(getAdminExecutor(), query);
  return <AdminOutboxView data={data} query={query} />;
}
