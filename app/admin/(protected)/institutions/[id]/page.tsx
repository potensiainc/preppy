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
import type { AdminInstitutionDTO } from "@/src/modules/admin/read-model/contracts";
import { getAdminInstitution } from "@/src/modules/admin/read-model/institution-query.server";

export function AdminInstitutionDetailView({
  data,
}: {
  data: AdminInstitutionDTO;
}) {
  return (
    <div className="admin-page admin-detail-page">
      <AdminPageHeader
        kicker="기관 / 조회 전용"
        title={data.displayName}
        description="기관의 운영 기준 정보를 확인해요. 이 조회 화면에서는 기관 프로필을 변경할 수 없어요."
      />
      <section aria-labelledby="institution-detail-heading">
        <div className="admin-section-heading">
          <h2 id="institution-detail-heading">등록 상태</h2>
          <AdminStateChip>
            {formatAdminCode(data.publicationState)}
          </AdminStateChip>
        </div>
        <AdminDataTable caption="기관 등록 상태">
          <tbody>
            {[
              ["기준 ID", data.id],
              ["주소 이름(slug)", data.slug],
              ["분류", formatAdminCode(data.category)],
              ["운영 상태", formatAdminCode(data.operationalState)],
              ["공개 상태", formatAdminCode(data.publicationState)],
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
      <section aria-labelledby="institution-opportunities-heading">
        <div className="admin-section-heading">
          <h2 id="institution-opportunities-heading">현재 입학정보 요약</h2>
        </div>
        {data.opportunitySummary.items.length === 0 ? (
          <p className="admin-empty-state" role="status">
            등록된 현재 입학정보가 없어요.
          </p>
        ) : (
          <AdminDataTable caption="기관 입학정보 요약">
            <thead>
              <tr>
                <th scope="col">입학정보</th>
                <th scope="col">기준 정보</th>
                <th scope="col">상태</th>
                <th scope="col">내용 확인</th>
              </tr>
            </thead>
            <tbody>
              {data.opportunitySummary.items.map((item) => (
                <tr key={item.id}>
                  <th scope="row">{item.title ?? item.slug}</th>
                  <td>{formatAdminCode(item.truthMode)}</td>
                  <td>
                    {item.businessState === null
                      ? "현재 기준 정보 없음"
                      : formatAdminCode(item.businessState)}
                  </td>
                  <td>{formatAdminDate(item.verifiedAt)}</td>
                </tr>
              ))}
            </tbody>
          </AdminDataTable>
        )}
      </section>
    </div>
  );
}

export default async function AdminInstitutionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await loadAdminPage(() =>
    getAdminInstitution(getAdminExecutor(), { id }),
  );
  return <AdminInstitutionDetailView data={data} />;
}
