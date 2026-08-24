import {
  AdminDataTable,
  AdminPageHeader,
  AdminStateChip,
  formatAdminCode,
  formatAdminDate,
} from "@/app/admin/_components/read-ui";
import {
  getAdminExecutor,
  loadAdminPage,
} from "@/app/admin/_lib/admin-page.server";
import type { AdminInstitutionDTO } from "@/src/modules/admin/read-model/contracts";
import { getAdminInstitution } from "@/src/modules/admin/read-model/institution-query.server";

export function AdminInstitutionDetailView({
  data,
}: {
  data: AdminInstitutionDTO;
}) {
  return (
    <div className="admin-page admin-detail-page">
      <AdminPageHeader
        kicker="Institution / Read only"
        title={data.displayName}
        description="Canonical operating context. Stable profile changes remain outside this WP-11 inspection surface."
      />
      <section aria-labelledby="institution-detail-heading">
        <div className="admin-section-heading">
          <h2 id="institution-detail-heading">Registry state</h2>
          <AdminStateChip>
            {formatAdminCode(data.publicationState)}
          </AdminStateChip>
        </div>
        <AdminDataTable caption="Institution registry state">
          <tbody>
            {[
              ["Canonical ID", data.id],
              ["Slug", data.slug],
              ["Category", formatAdminCode(data.category)],
              ["Operational state", formatAdminCode(data.operationalState)],
              ["Publication state", formatAdminCode(data.publicationState)],
              ["Active Source bindings", String(data.activeSourceBindingCount)],
            ].map(([label, value]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td>{value}</td>
              </tr>
            ))}
          </tbody>
        </AdminDataTable>
      </section>
      <section aria-labelledby="institution-opportunities-heading">
        <div className="admin-section-heading">
          <h2 id="institution-opportunities-heading">
            Current Opportunity summary
          </h2>
        </div>
        {data.opportunitySummary.items.length === 0 ? (
          <p className="admin-empty-state" role="status">
            No current Opportunity truth is available.
          </p>
        ) : (
          <AdminDataTable caption="Bounded Institution Opportunity summary">
            <thead>
              <tr>
                <th scope="col">Opportunity</th>
                <th scope="col">Truth</th>
                <th scope="col">State</th>
                <th scope="col">Verified</th>
              </tr>
            </thead>
            <tbody>
              {data.opportunitySummary.items.map((item) => (
                <tr key={item.id}>
                  <th scope="row">{item.title ?? item.slug}</th>
                  <td>{formatAdminCode(item.truthMode)}</td>
                  <td>
                    {item.businessState === null
                      ? "No current truth"
                      : formatAdminCode(item.businessState)}
                  </td>
                  <td>{formatAdminDate(item.verifiedAt)}</td>
                </tr>
              ))}
            </tbody>
          </AdminDataTable>
        )}
      </section>
    </div>
  );
}

export default async function AdminInstitutionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await loadAdminPage(() =>
    getAdminInstitution(getAdminExecutor(), { id }),
  );
  return <AdminInstitutionDetailView data={data} />;
}
