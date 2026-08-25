import {
  AdminDataTable,
  AdminPageHeader,
  AdminStateChip,
  formatAdminCode,
  formatAdminDate,
} from "@/app/admin/_components/read-ui";
import { getAdminExecutor } from "@/app/admin/_lib/admin-page.server";
import type {
  AdminDataQualityDTO,
  AdminHealthDTO,
} from "@/src/modules/admin/read-model/contracts";
import type { DatabaseExecutor } from "@/src/infrastructure/db/runtime.server";
import { getAdminHealthBundle } from "@/src/modules/admin/read-model/health-query.server";
import type { OperationalSnapshot } from "@/src/modules/production-safety/operational-snapshot.server";

export function AdminOperationsHealthView({
  health,
  dataQuality,
  operational,
}: {
  health: AdminHealthDTO;
  dataQuality: AdminDataQualityDTO;
  operational?: OperationalSnapshot | null;
}) {
  return (
    <div className="admin-page admin-operations-page">
      <AdminPageHeader
        kicker="Operations / Health"
        title="Runtime health & data quality"
        description="Inspection only. These readings report real database, queue, and canonical integrity state; this page performs no repair."
      />
      <section aria-labelledby="runtime-health-heading">
        <div className="admin-section-heading">
          <h2 id="runtime-health-heading">Runtime health</h2>
          <AdminStateChip>{health.status}</AdminStateChip>
        </div>
        <div className="admin-metric-grid">
          <article>
            <p>Database</p>
            <strong>{health.database.status}</strong>
          </article>
          <article>
            <p>Pending</p>
            <strong>{health.outbox.pending ?? "Unavailable"}</strong>
          </article>
          <article>
            <p>Processing</p>
            <strong>{health.outbox.processing ?? "Unavailable"}</strong>
          </article>
          <article>
            <p>Failed</p>
            <strong>{health.outbox.failed ?? "Unavailable"}</strong>
          </article>
          <article>
            <p>Dead letter</p>
            <strong>{health.outbox.deadLetter ?? "Unavailable"}</strong>
          </article>
        </div>
        <p className="admin-cell-note">
          Checked {formatAdminDate(health.checkedAt)}
        </p>
      </section>
      <section aria-labelledby="operational-signals-heading">
        <div className="admin-section-heading">
          <h2 id="operational-signals-heading">Operational signals</h2>
          <AdminStateChip>
            {operational === null || operational === undefined
              ? "UNAVAILABLE"
              : operational.migration.status}
          </AdminStateChip>
        </div>
        {operational === null || operational === undefined ? (
          <p className="admin-cell-note">
            The read-only operational snapshot could not be evaluated safely.
          </p>
        ) : (
          <>
            <div className="admin-metric-grid">
              <article>
                <p>Worker lag</p>
                <strong>
                  {operational.outbox.workerLagSeconds === null
                    ? "No due work"
                    : `${operational.outbox.workerLagSeconds}s`}
                </strong>
              </article>
              <article>
                <p>Stale processing</p>
                <strong>{operational.outbox.staleProcessing}</strong>
              </article>
              <article>
                <p>RESULT UNKNOWN</p>
                <strong>{operational.notification.resultUnknown}</strong>
              </article>
              <article>
                <p>Monitoring overdue</p>
                <strong>{operational.monitoring.overdue}</strong>
              </article>
              <article>
                <p>Provider event failures</p>
                <strong>{operational.providerEvents.failed}</strong>
              </article>
              <article>
                <p>Provider event orphans</p>
                <strong>{operational.providerEvents.orphan}</strong>
              </article>
              <article>
                <p>Cache failures</p>
                <strong>{operational.cacheRevalidation.failed}</strong>
              </article>
              <article>
                <p>Cache dead letter</p>
                <strong>{operational.cacheRevalidation.deadLetter}</strong>
              </article>
              <article>
                <p>Unavailable Sources</p>
                <strong>{operational.monitoring.sourceUnavailable}</strong>
              </article>
            </div>
            <p className="admin-cell-note">
              Point-in-time per query · analytics failures are best-effort and
              not persisted.
            </p>
          </>
        )}
      </section>
      <section aria-labelledby="data-quality-heading">
        <div className="admin-section-heading">
          <h2 id="data-quality-heading">Data quality</h2>
          <AdminStateChip>
            {health.dataQuality.affectedRecordCount} confirmed affected ·{" "}
            {health.dataQuality.unavailableCheckCount} unavailable checks
          </AdminStateChip>
        </div>
        <AdminDataTable caption="Read-only canonical integrity warnings">
          <thead>
            <tr>
              <th scope="col">Warning</th>
              <th scope="col">Severity</th>
              <th scope="col">Count</th>
              <th scope="col">Bounded examples</th>
            </tr>
          </thead>
          <tbody>
            {dataQuality.warnings.map((warning) => (
              <tr key={warning.code}>
                <th scope="row">{formatAdminCode(warning.code)}</th>
                <td>{warning.severity}</td>
                <td>
                  {warning.evaluationStatus === "AVAILABLE"
                    ? warning.count
                    : "Evaluation unavailable"}
                </td>
                <td>
                  {warning.evaluationStatus === "UNAVAILABLE"
                    ? "This check could not be evaluated safely."
                    : warning.details.length === 0
                      ? "No affected records"
                      : warning.details
                          .map(
                            (item) =>
                              `${formatAdminCode(item.targetType)} ${item.targetId}${
                                item.relatedId === null
                                  ? ""
                                  : ` / ${item.relatedId}`
                              } (${item.observedCount})`,
                          )
                          .join(" · ")}
                </td>
              </tr>
            ))}
          </tbody>
        </AdminDataTable>
      </section>
    </div>
  );
}

export function loadAdminOperationsHealthPageData(
  executor: DatabaseExecutor,
  now: Date,
) {
  return getAdminHealthBundle(executor, { now });
}

export default async function AdminOperationsHealthPage() {
  const now = new Date();
  const bundle = await loadAdminOperationsHealthPageData(
    getAdminExecutor(),
    now,
  );
  return (
    <AdminOperationsHealthView
      health={bundle.health}
      dataQuality={bundle.dataQuality}
      operational={bundle.operational}
    />
  );
}
