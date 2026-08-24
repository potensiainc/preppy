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
        kicker="Catalog / Institutions"
        title="Institution registry"
        description="Canonical identity, lifecycle, publication, Source coverage, and bounded Opportunity context."
      />
      <section aria-labelledby="institution-catalog-heading">
        <div className="admin-section-heading">
          <h2 id="institution-catalog-heading">Registry</h2>
          <AdminStateChip>{data.pagination.total} records</AdminStateChip>
        </div>
        {data.items.length === 0 ? (
          <AdminEmptyState>
            No Institutions match these filters.
          </AdminEmptyState>
        ) : (
          <AdminDataTable caption="Canonical Institution registry">
            <thead>
              <tr>
                <th scope="col">Institution</th>
                <th scope="col">Category</th>
                <th scope="col">Operational</th>
                <th scope="col">Publication</th>
                <th scope="col">Active Sources</th>
                <th scope="col">Opportunities</th>
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
