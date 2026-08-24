import {
  AdminDataTable,
  AdminPageHeader,
  AdminStateChip,
  formatAdminCode,
  formatAdminDate,
} from "@/app/admin/_components/read-ui";
import { getAdminExecutor } from "@/app/admin/_lib/admin-page.server";
import type { AdminDashboardDTO } from "@/src/modules/admin/read-model/contracts";
import { getAdminDashboard } from "@/src/modules/admin/read-model/dashboard-query.server";

export function AdminDashboardView({ data }: { data: AdminDashboardDTO }) {
  const metrics = [
    ["Monitoring", "Due", data.monitoring.due],
    ["Monitoring", "Overdue", data.monitoring.overdue],
    ["Sources", "Unavailable", data.unavailableSources],
    ["Outbox", "Pending", data.outbox.pending],
    ["Outbox", "Dead letter", data.outbox.deadLetter],
    [
      "Changes",
      "Verified in the last 7 days",
      data.recentVerifiedChanges.count,
    ],
  ] as const;
  return (
    <div className="admin-page admin-dashboard">
      <AdminPageHeader
        kicker="Control room / Dashboard"
        title="Operations overview"
        description="Live, read-only operational projections from canonical PostgreSQL state."
      />
      <section aria-labelledby="dashboard-metrics-heading">
        <div className="admin-section-heading">
          <div>
            <p className="admin-kicker">Today’s ledger</p>
            <h2 id="dashboard-metrics-heading">Operational pressure</h2>
          </div>
          <AdminStateChip>Live projection</AdminStateChip>
        </div>
        <AdminDataTable caption="Current Admin operational counts">
          <thead>
            <tr>
              <th scope="col">Boundary</th>
              <th scope="col">Measure</th>
              <th scope="col">Count</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map(([boundary, measure, value]) => (
              <tr key={`${boundary}-${measure}`}>
                <th scope="row">{boundary}</th>
                <td>{measure}</td>
                <td className="admin-metric-value">{value}</td>
              </tr>
            ))}
          </tbody>
        </AdminDataTable>
      </section>
      <section aria-labelledby="recent-changes-heading">
        <div className="admin-section-heading">
          <div>
            <p className="admin-kicker">Canonical truth</p>
            <h2 id="recent-changes-heading">Recent verified changes</h2>
          </div>
        </div>
        {data.recentVerifiedChanges.items.length === 0 ? (
          <p className="admin-empty-state" role="status">
            No verified Opportunity changes in the last seven days.
          </p>
        ) : (
          <AdminDataTable caption="Recent verified Opportunity changes">
            <thead>
              <tr>
                <th scope="col">Change</th>
                <th scope="col">Materiality</th>
                <th scope="col">Summary</th>
                <th scope="col">Verified</th>
              </tr>
            </thead>
            <tbody>
              {data.recentVerifiedChanges.items.map((change) => (
                <tr key={change.id}>
                  <th scope="row">{formatAdminCode(change.changeType)}</th>
                  <td>{formatAdminCode(change.materiality)}</td>
                  <td>{change.summary}</td>
                  <td>{formatAdminDate(change.verifiedAt)}</td>
                </tr>
              ))}
            </tbody>
          </AdminDataTable>
        )}
      </section>
    </div>
  );
}

export default async function AdminDashboardPage() {
  const data = await getAdminDashboard(getAdminExecutor(), { now: new Date() });
  return <AdminDashboardView data={data} />;
}
