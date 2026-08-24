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
import type { AdminOpportunityDTO } from "@/src/modules/admin/read-model/contracts";
import { getAdminOpportunity } from "@/src/modules/admin/read-model/opportunity-query.server";

export function AdminOpportunityDetailView({
  data,
}: {
  data: AdminOpportunityDTO;
}) {
  return (
    <div className="admin-page admin-detail-page">
      <AdminPageHeader
        kicker="Opportunity / Read only"
        title={data.currentVersion?.title ?? data.slug}
        description="Canonical root, current truth, Source coverage, and most recent verified change."
      />
      <section aria-labelledby="opportunity-detail-heading">
        <div className="admin-section-heading">
          <h2 id="opportunity-detail-heading">Current truth</h2>
          <AdminStateChip>{formatAdminCode(data.truthMode)}</AdminStateChip>
        </div>
        <AdminDataTable caption="Opportunity current truth">
          <tbody>
            {[
              ["Canonical ID", data.id],
              ["Institution", data.institution.displayName],
              ["Kind", formatAdminCode(data.kind)],
              ["Truth mode", formatAdminCode(data.truthMode)],
              ["Publication state", formatAdminCode(data.publicationState)],
              [
                "Business state",
                data.currentVersion === null
                  ? "No current version"
                  : formatAdminCode(data.currentVersion.businessState),
              ],
              [
                "Version",
                data.currentVersion === null
                  ? "Not available"
                  : String(data.currentVersion.versionNumber),
              ],
              [
                "Verified",
                formatAdminDate(data.currentVersion?.verifiedAt ?? null),
              ],
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
      <section aria-labelledby="opportunity-change-heading">
        <div className="admin-section-heading">
          <h2 id="opportunity-change-heading">Recent canonical change</h2>
        </div>
        {data.recentChange === null ? (
          <p className="admin-empty-state" role="status">
            No canonical change has been published.
          </p>
        ) : (
          <AdminDataTable caption="Latest canonical Opportunity change">
            <tbody>
              {[
                ["Type", formatAdminCode(data.recentChange.changeType)],
                ["Materiality", formatAdminCode(data.recentChange.materiality)],
                ["Summary", data.recentChange.summary],
                ["Verified", formatAdminDate(data.recentChange.verifiedAt)],
              ].map(([label, value]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  <td>{value}</td>
                </tr>
              ))}
            </tbody>
          </AdminDataTable>
        )}
      </section>
    </div>
  );
}

export default async function AdminOpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await loadAdminPage(() =>
    getAdminOpportunity(getAdminExecutor(), { id }),
  );
  return <AdminOpportunityDetailView data={data} />;
}
