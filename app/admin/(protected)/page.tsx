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
    ["모니터링", "점검 대상", data.monitoring.due],
    ["모니터링", "점검 기한 초과", data.monitoring.overdue],
    ["출처", "확인 불가", data.unavailableSources],
    ["Outbox", "대기", data.outbox.pending],
    ["Outbox", "최종 실패(Dead letter)", data.outbox.deadLetter],
    ["변경 기록", "최근 7일 내 내용 확인", data.recentVerifiedChanges.count],
  ] as const;
  return (
    <div className="admin-page admin-dashboard">
      <AdminPageHeader
        kicker="운영 / 대시보드"
        title="운영 현황"
        description="PostgreSQL 기준 데이터를 조회해 운영 현황을 보여줘요. 이 화면에서는 데이터를 변경하지 않아요."
      />
      <section aria-labelledby="dashboard-metrics-heading">
        <div className="admin-section-heading">
          <div>
            <p className="admin-kicker">현재 운영 기록</p>
            <h2 id="dashboard-metrics-heading">처리 현황</h2>
          </div>
          <AdminStateChip>현재 조회 결과</AdminStateChip>
        </div>
        <AdminDataTable caption="현재 운영 항목별 건수">
          <thead>
            <tr>
              <th scope="col">영역</th>
              <th scope="col">항목</th>
              <th scope="col">건수</th>
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
            <p className="admin-kicker">기준 정보</p>
            <h2 id="recent-changes-heading">최근 검수한 변경</h2>
          </div>
        </div>
        {data.recentVerifiedChanges.items.length === 0 ? (
          <p className="admin-empty-state" role="status">
            최근 7일 동안 검수한 입학정보 변경이 없어요.
          </p>
        ) : (
          <AdminDataTable caption="최근 검수한 입학정보 변경">
            <thead>
              <tr>
                <th scope="col">변경</th>
                <th scope="col">중요도</th>
                <th scope="col">요약</th>
                <th scope="col">내용 확인</th>
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
