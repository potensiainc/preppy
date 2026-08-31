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
        kicker="입학정보 / 조회 전용"
        title={data.currentVersion?.title ?? data.slug}
        description="입학정보의 기준 ID와 현재 내용을 확인해요. 연결된 출처와 최근 검수한 변경도 보여줘요."
      />
      <section aria-labelledby="opportunity-detail-heading">
        <div className="admin-section-heading">
          <h2 id="opportunity-detail-heading">현재 기준 정보</h2>
          <AdminStateChip>{formatAdminCode(data.truthMode)}</AdminStateChip>
        </div>
        <AdminDataTable caption="현재 입학정보 기준">
          <tbody>
            {[
              ["기준 ID", data.id],
              ["기관", data.institution.displayName],
              ["종류", formatAdminCode(data.kind)],
              ["기준 정보 방식", formatAdminCode(data.truthMode)],
              ["공개 상태", formatAdminCode(data.publicationState)],
              [
                "진행 상태",
                data.currentVersion === null
                  ? "현재 버전 없음"
                  : formatAdminCode(data.currentVersion.businessState),
              ],
              [
                "버전",
                data.currentVersion === null
                  ? "확인할 수 없음"
                  : String(data.currentVersion.versionNumber),
              ],
              [
                "내용 확인",
                formatAdminDate(data.currentVersion?.verifiedAt ?? null),
              ],
              ["활성 출처 연결", String(data.activeSourceBindingCount)],
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
          <h2 id="opportunity-change-heading">최근 기준 정보 변경</h2>
        </div>
        {data.recentChange === null ? (
          <p className="admin-empty-state" role="status">
            발행된 기준 정보 변경이 없어요.
          </p>
        ) : (
          <AdminDataTable caption="최근 입학정보 기준 변경">
            <tbody>
              {[
                ["유형", formatAdminCode(data.recentChange.changeType)],
                ["중요도", formatAdminCode(data.recentChange.materiality)],
                ["요약", data.recentChange.summary],
                ["내용 확인", formatAdminDate(data.recentChange.verifiedAt)],
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
