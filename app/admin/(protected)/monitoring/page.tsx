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
        kicker="운영 / 모니터링"
        title="모니터링 대기열"
        description="출처 연결, 수집 결과, 현재 기준 정보를 바탕으로 점검 대상을 보여줘요. 정렬 순서는 서버의 모니터링 정책(WP-10B)을 따라요."
      />
      <section aria-labelledby="monitoring-filters-heading">
        <div className="admin-section-heading">
          <h2 id="monitoring-filters-heading">대기열 필터</h2>
          <AdminStateChip>{data.items.length} 건(현재 페이지)</AdminStateChip>
        </div>
        <MonitoringFilters query={query} />
      </section>
      <section aria-labelledby="monitoring-results-heading">
        <div className="admin-section-heading">
          <h2 id="monitoring-results-heading">점검 순서</h2>
        </div>
        {invalidFilter ? (
          <div className="admin-filter-guidance" role="alert">
            <h3>필터를 적용하지 못했어요</h3>
            <p>화면에 제공된 모니터링 필터를 선택한 뒤 다시 시도해 주세요.</p>
            <Link href="/admin/monitoring">모니터링 필터 초기화</Link>
          </div>
        ) : data.items.length === 0 ? (
          <AdminEmptyState>조건에 맞는 출처 연결이 없어요.</AdminEmptyState>
        ) : (
          <AdminDataTable caption="모니터링 점검 대기열">
            <thead>
              <tr>
                <th scope="col">상태</th>
                <th scope="col">대상</th>
                <th scope="col">출처</th>
                <th scope="col">연결</th>
                <th scope="col">점검</th>
                <th scope="col">현재 요약</th>
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
                      {item.isPrimary ? "대표 출처 연결" : "보조 출처 연결"}
                    </span>
                  </td>
                  <td>
                    최근: {formatAdminDate(item.lastCheckedAt)}
                    <span className="admin-cell-note">
                      다음: {formatAdminDate(item.nextDueAt)}
                    </span>
                  </td>
                  <td>
                    {item.currentTruthSummary.kind === "OPPORTUNITY"
                      ? (item.currentTruthSummary.title ?? "현재 제목 없음")
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
          <nav className="admin-pagination" aria-label="모니터링 대기열 페이지">
            <Link href={nextMonitoringPageHref(query, data.nextCursor)}>
              다음 대기열 페이지
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
