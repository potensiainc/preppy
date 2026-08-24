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
        kicker="Catalog / Sources"
        title="Source registry"
        description="Canonical endpoints, authority, lifecycle, Monitoring policy, bindings, and the latest bounded observation."
      />
      <section aria-labelledby="source-catalog-heading">
        <div className="admin-section-heading">
          <h2 id="source-catalog-heading">Registry</h2>
          <AdminStateChip>{data.pagination.total} records</AdminStateChip>
        </div>
        {data.items.length === 0 ? (
          <AdminEmptyState>No Sources match these filters.</AdminEmptyState>
        ) : (
          <AdminDataTable caption="Canonical Source registry">
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col">Type</th>
                <th scope="col">Authority</th>
                <th scope="col">Lifecycle</th>
                <th scope="col">Bindings</th>
                <th scope="col">Latest observation</th>
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
                    {item.activeInstitutionBindingCount} institutions ·{" "}
                    {item.activeOpportunityBindingCount} opportunities
                  </td>
                  <td>
                    {item.latestObservation === null ? (
                      "Not observed"
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
