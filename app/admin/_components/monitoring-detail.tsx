import {
  AdminDataTable,
  AdminPageHeader,
  AdminSourceUrl,
  AdminStateChip,
  formatAdminCode,
  formatAdminDate,
} from "@/app/admin/_components/read-ui";
import type { AdminMonitoringDetailDTO } from "@/src/modules/admin/read-model/monitoring-detail-query.server";

import { MonitoringActions } from "./monitoring-actions";

function CurrentTruth({ detail }: { detail: AdminMonitoringDetailDTO }) {
  if (detail.kind === "INSTITUTION") {
    return (
      <>
        <AdminDataTable caption="Current Institution truth">
          <tbody>
            <tr>
              <th scope="row">Operational state</th>
              <td>{formatAdminCode(detail.currentTruth.operationalState)}</td>
            </tr>
            <tr>
              <th scope="row">Publication state</th>
              <td>{formatAdminCode(detail.currentTruth.publicationState)}</td>
            </tr>
          </tbody>
        </AdminDataTable>
        <AdminDataTable caption="Current canonical Institution Facts">
          <thead>
            <tr>
              <th scope="col">Fact</th>
              <th scope="col">Current display</th>
              <th scope="col">Expected-current token</th>
            </tr>
          </thead>
          <tbody>
            {detail.facts.map((fact) => (
              <tr key={fact.factType}>
                <th scope="row">{formatAdminCode(fact.factType)}</th>
                <td>{fact.current?.displayText ?? "No current Fact"}</td>
                <td className="admin-record-id">
                  {fact.expectedCurrentVersionId ?? "Creation allowed (null)"}
                </td>
              </tr>
            ))}
          </tbody>
        </AdminDataTable>
      </>
    );
  }

  if (detail.currentTruth === null) {
    return <p className="admin-empty-state">No current truth version.</p>;
  }
  return (
    <AdminDataTable caption="Current Opportunity truth">
      <tbody>
        <tr>
          <th scope="row">Truth mode</th>
          <td>
            {detail.kind === "OPPORTUNITY_NATIVE" ? "Native" : "Legacy backed"}
          </td>
        </tr>
        <tr>
          <th scope="row">Title</th>
          <td>
            {detail.kind === "OPPORTUNITY_NATIVE"
              ? detail.currentTruth.title
              : detail.currentTruth.displayTitle}
          </td>
        </tr>
        <tr>
          <th scope="row">State</th>
          <td>
            {formatAdminCode(
              detail.kind === "OPPORTUNITY_NATIVE"
                ? detail.currentTruth.businessState
                : detail.currentTruth.eventStatus,
            )}
          </td>
        </tr>
        <tr>
          <th scope="row">Expected-current token</th>
          <td className="admin-record-id">
            {detail.expectedCurrentVersionId ?? "No current version"}
          </td>
        </tr>
      </tbody>
    </AdminDataTable>
  );
}

export function MonitoringDetail({
  detail,
}: {
  detail: AdminMonitoringDetailDTO;
}) {
  const targetName =
    detail.kind === "INSTITUTION"
      ? detail.institution.displayName
      : `${detail.institution.displayName} / ${detail.opportunity.slug}`;
  return (
    <div className="admin-page admin-detail-page admin-monitoring-detail">
      <AdminPageHeader
        kicker="Monitoring / Decision"
        title={targetName}
        description="Review the exact canonical binding and submit candidate facts only. Server commands retain authority over truth and signaling."
      />

      <section aria-labelledby="monitoring-binding-heading">
        <div className="admin-section-heading">
          <h2 id="monitoring-binding-heading">Binding and schedule</h2>
          <AdminStateChip>{detail.schedule.dueState}</AdminStateChip>
        </div>
        <div className="admin-detail-ledger">
          <dl>
            <div>
              <dt>Source</dt>
              <dd>{detail.source.sourceName}</dd>
            </div>
            <div>
              <dt>Official link</dt>
              <dd>
                <AdminSourceUrl
                  displayUrl={detail.source.canonicalUrl}
                  safeUrl={detail.source.safeUrl}
                />
              </dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{formatAdminCode(detail.binding.role)}</dd>
            </div>
            <div>
              <dt>Priority</dt>
              <dd>{formatAdminCode(detail.schedule.priority)}</dd>
            </div>
            <div>
              <dt>Last checked</dt>
              <dd>{formatAdminDate(detail.schedule.lastCheckedAt)}</dd>
            </div>
            <div>
              <dt>Next due</dt>
              <dd>{formatAdminDate(detail.schedule.nextDueAt)}</dd>
            </div>
            <div>
              <dt>Latest outcome</dt>
              <dd>
                {detail.latestObservation === null
                  ? "Not observed"
                  : formatAdminCode(detail.latestObservation.outcome)}
              </dd>
            </div>
            <div>
              <dt>Latest HTTP status</dt>
              <dd>{detail.latestObservation?.httpStatus ?? "Not available"}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section aria-labelledby="current-truth-heading">
        <div className="admin-section-heading">
          <h2 id="current-truth-heading">Current truth</h2>
        </div>
        <CurrentTruth detail={detail} />
      </section>

      <MonitoringActions detail={detail} />
    </div>
  );
}
