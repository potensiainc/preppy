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
        kicker="출처 / 조회 전용"
        title={data.sourceName}
        description="출처의 기준 ID와 모니터링 설정을 확인해요. 연결 정보와 허용 범위의 최근 수집 기록도 보여줘요."
      />
      <section aria-labelledby="source-detail-heading">
        <div className="admin-section-heading">
          <h2 id="source-detail-heading">등록 상태</h2>
          <AdminStateChip>
            {formatAdminCode(data.lifecycleStatus)}
          </AdminStateChip>
        </div>
        <AdminDataTable caption="출처 등록 상태">
          <tbody>
            <tr>
              <th scope="row">기준 ID</th>
              <td>{data.id}</td>
            </tr>
            <tr>
              <th scope="row">대표 URL</th>
              <td>
                <AdminSourceUrl
                  displayUrl={data.canonicalUrl}
                  safeUrl={data.safeUrl}
                />
              </td>
            </tr>
            {[
              ["유형", formatAdminCode(data.sourceType)],
              ["출처 권한", formatAdminCode(data.authorityLevel)],
              ["운영 상태", formatAdminCode(data.lifecycleStatus)],
              ["활성 기관 연결", String(data.activeInstitutionBindingCount)],
              [
                "활성 입학정보 연결",
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
          <h2 id="source-monitor-heading">모니터링 정책</h2>
        </div>
        {data.monitorConfig === null ? (
          <AdminEmptyState>등록된 모니터링 설정이 없어요.</AdminEmptyState>
        ) : (
          <AdminDataTable caption="출처 모니터링 설정">
            <tbody>
              {[
                [
                  "수집 방식",
                  formatAdminCode(data.monitorConfig.collectionStrategy),
                ],
                [
                  "모니터링 프로필",
                  formatAdminCode(data.monitorConfig.monitoringProfile),
                ],
                [
                  "사용자 지정 주기",
                  data.monitorConfig.customIntervalMinutes === null
                    ? "기본값"
                    : `${data.monitorConfig.customIntervalMinutes}분`,
                ],
                [
                  "계절별 설정",
                  data.monitorConfig.seasonalEnabled ? "예" : "아니요",
                ],
                [
                  "브라우저 필요 여부",
                  data.monitorConfig.browserRequired ? "예" : "아니요",
                ],
                ["최대 시도 횟수", String(data.monitorConfig.maxAttempts)],
                ["사용 여부", data.monitorConfig.isEnabled ? "예" : "아니요"],
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
          <h2 id="source-observation-heading">최근 수집 기록</h2>
        </div>
        {data.latestObservation === null ? (
          <AdminEmptyState>수집 기록이 없어요.</AdminEmptyState>
        ) : (
          <AdminDataTable caption="최근 출처 수집 기록">
            <tbody>
              {[
                ["수집 결과", formatAdminCode(data.latestObservation.outcome)],
                [
                  "자료 수집",
                  formatAdminDate(data.latestObservation.observedAt),
                ],
                [
                  "HTTP 상태",
                  data.latestObservation.httpStatus === null
                    ? "확인할 수 없음"
                    : String(data.latestObservation.httpStatus),
                ],
                [
                  "소요 시간",
                  data.latestObservation.durationMs === null
                    ? "확인할 수 없음"
                    : `${data.latestObservation.durationMs} ms`,
                ],
                ["오류 코드", data.latestObservation.errorCode ?? "없음"],
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
