import {
  AdminDataTable,
  AdminEmptyState,
  AdminPageHeader,
  AdminSourceUrl,
  AdminStateChip,
  formatAdminCode,
  formatAdminDate,
} from "@/app/admin/_components/read-ui";
import {
  getAdminExecutor,
  loadAdminPage,
} from "@/app/admin/_lib/admin-page.server";
import type { AdminSourceDTO } from "@/src/modules/admin/read-model/contracts";
import { getAdminSource } from "@/src/modules/admin/read-model/source-query.server";

export function AdminSourceDetailView({ data }: { data: AdminSourceDTO }) {
  return (
    <div className="admin-page admin-detail-page">
      <AdminPageHeader
        kicker="Source / Read only"
        title={data.sourceName}
        description="Canonical identity, Monitoring configuration, binding coverage, and the latest safe observation projection."
      />
      <section aria-labelledby="source-detail-heading">
        <div className="admin-section-heading">
          <h2 id="source-detail-heading">Registry state</h2>
          <AdminStateChip>
            {formatAdminCode(data.lifecycleStatus)}
          </AdminStateChip>
        </div>
        <AdminDataTable caption="Source registry state">
          <tbody>
            <tr>
              <th scope="row">Canonical ID</th>
              <td>{data.id}</td>
            </tr>
            <tr>
              <th scope="row">Canonical URL</th>
              <td>
                <AdminSourceUrl
                  displayUrl={data.canonicalUrl}
                  safeUrl={data.safeUrl}
                />
              </td>
            </tr>
            {[
              ["Type", formatAdminCode(data.sourceType)],
              ["Authority", formatAdminCode(data.authorityLevel)],
              ["Lifecycle", formatAdminCode(data.lifecycleStatus)],
              [
                "Active Institution bindings",
                String(data.activeInstitutionBindingCount),
              ],
              [
                "Active Opportunity bindings",
                String(data.activeOpportunityBindingCount),
              ],
            ].map(([label, value]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td>{value}</td>
              </tr>
            ))}
          </tbody>
        </AdminDataTable>
      </section>
      <section aria-labelledby="source-monitor-heading">
        <div className="admin-section-heading">
          <h2 id="source-monitor-heading">Monitoring policy</h2>
        </div>
        {data.monitorConfig === null ? (
          <AdminEmptyState>
            No Monitoring configuration is registered.
          </AdminEmptyState>
        ) : (
          <AdminDataTable caption="Source Monitoring configuration">
            <tbody>
              {[
                [
                  "Collection strategy",
                  formatAdminCode(data.monitorConfig.collectionStrategy),
                ],
                [
                  "Monitoring profile",
                  formatAdminCode(data.monitorConfig.monitoringProfile),
                ],
                [
                  "Custom interval",
                  data.monitorConfig.customIntervalMinutes === null
                    ? "Default"
                    : `${data.monitorConfig.customIntervalMinutes} minutes`,
                ],
                ["Seasonal", data.monitorConfig.seasonalEnabled ? "Yes" : "No"],
                [
                  "Browser required",
                  data.monitorConfig.browserRequired ? "Yes" : "No",
                ],
                ["Maximum attempts", String(data.monitorConfig.maxAttempts)],
                ["Enabled", data.monitorConfig.isEnabled ? "Yes" : "No"],
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
      <section aria-labelledby="source-observation-heading">
        <div className="admin-section-heading">
          <h2 id="source-observation-heading">Latest observation</h2>
        </div>
        {data.latestObservation === null ? (
          <AdminEmptyState>No observation is available.</AdminEmptyState>
        ) : (
          <AdminDataTable caption="Latest safe Source observation">
            <tbody>
              {[
                ["Outcome", formatAdminCode(data.latestObservation.outcome)],
                [
                  "Observed",
                  formatAdminDate(data.latestObservation.observedAt),
                ],
                [
                  "HTTP status",
                  data.latestObservation.httpStatus === null
                    ? "Not available"
                    : String(data.latestObservation.httpStatus),
                ],
                [
                  "Duration",
                  data.latestObservation.durationMs === null
                    ? "Not available"
                    : `${data.latestObservation.durationMs} ms`,
                ],
                ["Error code", data.latestObservation.errorCode ?? "None"],
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

export default async function AdminSourceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await loadAdminPage(() =>
    getAdminSource(getAdminExecutor(), { id }),
  );
  return <AdminSourceDetailView data={data} />;
}
