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
        kicker="Catalog / Opportunities"
        title="Opportunity truth index"
        description="Server-owned truth mode, current canonical version, Source coverage, and latest verified change."
      />
      <section aria-labelledby="opportunity-catalog-heading">
        <div className="admin-section-heading">
          <h2 id="opportunity-catalog-heading">Truth index</h2>
          <AdminStateChip>{data.pagination.total} records</AdminStateChip>
        </div>
        {data.items.length === 0 ? (
          <AdminEmptyState>
            No Opportunities match these filters.
          </AdminEmptyState>
        ) : (
          <AdminDataTable caption="Canonical Opportunity truth index">
            <thead>
              <tr>
                <th scope="col">Opportunity</th>
                <th scope="col">Institution</th>
                <th scope="col">Truth mode</th>
                <th scope="col">Publication / business</th>
                <th scope="col">Bindings</th>
                <th scope="col">Recent change</th>
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
                        ? "No current version"
                        : formatAdminCode(item.currentVersion.businessState)}
                    </span>
                  </td>
                  <td>{item.activeSourceBindingCount}</td>
                  <td>
                    {item.recentChange === null ? (
                      "None"
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
