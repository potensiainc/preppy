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
  if (entries.length === 0) return "None";
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
        kicker="Operations / Audit"
        title="Audit action ledger"
        description="Inspection only. The view exposes a closed operational summary, never stored before/after documents."
      />
      <section aria-labelledby="audit-ledger-heading">
        <div className="admin-section-heading">
          <h2 id="audit-ledger-heading">Actions</h2>
          <AdminStateChip>{data.pagination.total} records</AdminStateChip>
        </div>
        {data.items.length === 0 ? (
          <AdminEmptyState>
            No Audit actions match these filters.
          </AdminEmptyState>
        ) : (
          <AdminDataTable caption="Read-only Audit action registry">
            <thead>
              <tr>
                <th scope="col">Action</th>
                <th scope="col">Actor</th>
                <th scope="col">Entity</th>
                <th scope="col">Reason</th>
                <th scope="col">Correlation</th>
                <th scope="col">Allowlisted summary</th>
                <th scope="col">Occurred</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <th scope="row">{formatAdminCode(item.action)}</th>
                  <td>{item.actor.adminUserId ?? "System"}</td>
                  <td>
                    {formatAdminCode(item.entityType)}
                    <span className="admin-cell-note">
                      {item.entityId ?? "No entity ID"}
                    </span>
                  </td>
                  <td>
                    {item.reason === null
                      ? "None"
                      : formatAdminCode(item.reason)}
                  </td>
                  <td>{item.correlationId ?? "Unavailable"}</td>
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
