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
  AdminPageDTO,
  AdminUserDTO,
} from "@/src/modules/admin/read-model/contracts";
import {
  parseUserAdminListInput,
  type UserAdminListInput,
} from "@/src/modules/admin/read-model/input";
import { listAdminUsers } from "@/src/modules/admin/read-model/user-query.server";

export function AdminUserListView({
  data,
  query = { page: 1, pageSize: 20 },
}: {
  data: AdminPageDTO<AdminUserDTO>;
  query?: UserAdminListInput;
}) {
  return (
    <div className="admin-page admin-catalog-page">
      <AdminPageHeader
        kicker="Inspection / Users"
        title="Support registry"
        description="Canonical support state, Follow coverage, and derived email readiness without exposing identity-provider or family PII."
      />
      <section aria-labelledby="user-catalog-heading">
        <div className="admin-section-heading">
          <h2 id="user-catalog-heading">Support records</h2>
          <AdminStateChip>{data.pagination.total} records</AdminStateChip>
        </div>
        {data.items.length === 0 ? (
          <AdminEmptyState>No Users match these filters.</AdminEmptyState>
        ) : (
          <AdminDataTable caption="PII-minimized User support registry">
            <thead>
              <tr>
                <th scope="col">Canonical user</th>
                <th scope="col">Status</th>
                <th scope="col">Created</th>
                <th scope="col">Follows</th>
                <th scope="col">Email readiness</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <th scope="row">{item.id}</th>
                  <td>{formatAdminCode(item.status)}</td>
                  <td>{formatAdminDate(item.createdAt)}</td>
                  <td>{item.followCount}</td>
                  <td>{formatAdminCode(item.emailReadiness)}</td>
                </tr>
              ))}
            </tbody>
          </AdminDataTable>
        )}
        <AdminPagination
          pagination={data.pagination}
          basePath="/admin/users"
          query={query}
        />
      </section>
    </div>
  );
}

type NextSearchParams = Record<string, string | string[] | undefined>;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<NextSearchParams>;
}) {
  const query = parseUserAdminListInput(await searchParams);
  const data = await listAdminUsers(getAdminExecutor(), query);
  return <AdminUserListView data={data} query={query} />;
}
