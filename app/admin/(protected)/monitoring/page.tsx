import Link from "next/link";

import { MonitoringFilters } from "@/app/admin/_components/monitoring-filters";
import {
  AdminDataTable,
  AdminEmptyState,
  AdminPageHeader,
  AdminSourceUrl,
  AdminStateChip,
  formatAdminCode,
  formatAdminDate,
} from "@/app/admin/_components/read-ui";
import { getAdminExecutor } from "@/app/admin/_lib/admin-page.server";
import { ValidationError } from "@/src/application/errors";
import {
  listAdminMonitoringQueue,
  parseMonitoringAdminQueueInput,
  type AdminMonitoringQueueDTO,
  type MonitoringAdminQueueInput,
} from "@/src/modules/admin/read-model/monitoring-query.server";

const FILTER_QUERY_KEYS = [
  "dueState",
  "priority",
  "targetType",
  "role",
  "sourceLifecycle",
] as const;

function nextMonitoringPageHref(
  query: MonitoringAdminQueueInput,
  nextCursor: string,
): string {
  const params = new URLSearchParams();
  for (const key of FILTER_QUERY_KEYS) {
    for (const value of query[key] ?? []) params.append(key, value);
  }
  params.set("pageSize", String(query.pageSize));
  params.set("cursor", nextCursor);
  return `/admin/monitoring?${params.toString()}`;
}

export function AdminMonitoringView({
  data,
  query,
  invalidFilter = false,
}: {
  data: AdminMonitoringQueueDTO;
  query: MonitoringAdminQueueInput;
  invalidFilter?: boolean;
}) {
  return (
    <div className="admin-page admin-catalog-page admin-monitoring-page">
      <AdminPageHeader
        kicker="Operations / Monitoring"
        title="Monitoring queue"
        description="A live decision queue derived from canonical bindings, Source observations, and current truth. Its order is owned by WP-10B."
      />
      <section aria-labelledby="monitoring-filters-heading">
        <div className="admin-section-heading">
          <h2 id="monitoring-filters-heading">Queue filters</h2>
          <AdminStateChip>
            {data.items.length} items on this page
          </AdminStateChip>
        </div>
        <MonitoringFilters query={query} />
      </section>
      <section aria-labelledby="monitoring-results-heading">
        <div className="admin-section-heading">
          <h2 id="monitoring-results-heading">Decision order</h2>
        </div>
        {invalidFilter ? (
          <div className="admin-filter-guidance" role="alert">
            <h3>Filters could not be applied</h3>
            <p>Use only the available Monitoring filters and try again.</p>
            <Link href="/admin/monitoring">Reset Monitoring filters</Link>
          </div>
        ) : data.items.length === 0 ? (
          <AdminEmptyState>
            No canonical bindings match these filters.
          </AdminEmptyState>
        ) : (
          <AdminDataTable caption="Canonical Monitoring decision queue">
            <thead>
              <tr>
                <th scope="col">State</th>
                <th scope="col">Target</th>
                <th scope="col">Source</th>
                <th scope="col">Binding</th>
                <th scope="col">Checks</th>
                <th scope="col">Current summary</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.bindingId}>
                  <td>
                    <AdminStateChip>{item.dueState}</AdminStateChip>
                    <span className="admin-cell-note">
                      {formatAdminCode(item.priority)}
                    </span>
                  </td>
                  <th scope="row">
                    <Link href={item.detailHref}>
                      {item.opportunity?.slug ?? item.institution.displayName}
                    </Link>
                    <span className="admin-cell-note">
                      {formatAdminCode(item.targetType)} ·{" "}
                      {item.institution.displayName}
                    </span>
                  </th>
                  <td>
                    {item.source.sourceName}
                    <AdminSourceUrl
                      displayUrl={item.source.canonicalUrl}
                      safeUrl={item.source.safeUrl}
                    />
                    <span className="admin-cell-note">
                      {formatAdminCode(item.source.lifecycleStatus)}
                    </span>
                  </td>
                  <td>
                    {formatAdminCode(item.role)}
                    <span className="admin-cell-note">
                      {item.isPrimary
                        ? "Primary binding"
                        : "Supporting binding"}
                    </span>
                  </td>
                  <td>
                    Last: {formatAdminDate(item.lastCheckedAt)}
                    <span className="admin-cell-note">
                      Next: {formatAdminDate(item.nextDueAt)}
                    </span>
                  </td>
                  <td>
                    {item.currentTruthSummary.kind === "OPPORTUNITY"
                      ? (item.currentTruthSummary.title ?? "No current title")
                      : formatAdminCode(
                          item.currentTruthSummary.operationalState,
                        )}
                    <span className="admin-cell-note">
                      {item.currentTruthSummary.kind === "OPPORTUNITY"
                        ? formatAdminCode(
                            item.currentTruthSummary.businessState ?? "UNKNOWN",
                          )
                        : formatAdminCode(
                            item.currentTruthSummary.publicationState,
                          )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </AdminDataTable>
        )}
        {!invalidFilter && data.hasNext && data.nextCursor !== null ? (
          <nav className="admin-pagination" aria-label="Monitoring queue pages">
            <Link href={nextMonitoringPageHref(query, data.nextCursor)}>
              Next queue page
            </Link>
          </nav>
        ) : null}
      </section>
    </div>
  );
}

type NextSearchParams = Record<string, string | string[] | undefined>;

export default async function AdminMonitoringPage({
  searchParams,
}: {
  searchParams: Promise<NextSearchParams>;
}) {
  const raw = await searchParams;
  let result:
    | Readonly<{
        data: AdminMonitoringQueueDTO;
        query: MonitoringAdminQueueInput;
        invalidFilter: false;
      }>
    | Readonly<{
        data: AdminMonitoringQueueDTO;
        query: MonitoringAdminQueueInput;
        invalidFilter: true;
      }>;
  try {
    const query = parseMonitoringAdminQueueInput(raw);
    const data = await listAdminMonitoringQueue(query, {
      executor: getAdminExecutor(),
      now: new Date(),
    });
    result = { data, query, invalidFilter: false };
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    result = {
      data: {
        items: [],
        pageSize: 25,
        hasNext: false,
        nextCursor: null,
      },
      query: { pageSize: 25, cursor: null },
      invalidFilter: true,
    };
  }
  return <AdminMonitoringView {...result} />;
}
