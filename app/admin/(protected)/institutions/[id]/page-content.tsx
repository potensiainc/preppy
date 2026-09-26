import {
  AdminDataTable,
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
import type { AdminInstitutionDTO } from "@/src/modules/admin/read-model/contracts";
import { getAdminInstitution } from "@/src/modules/admin/read-model/institution-query.server";

const coverageSectionLabels = {
  TUITION: "원비",
  INFORMATION_SESSION: "입학설명회",
  TARGET_AGE_GRADE: "운영 연령",
  CURRICULUM: "커리큘럼",
  TRANSPORT: "셔틀",
  MEALS: "급식",
  REVIEWS: "후기",
  OPERATING_INFO: "운영 정보",
} as const;

const coverageStatusLabels = {
  NOT_RESEARCHED: "조사 전",
  CONFIRMED: "확인 완료",
  CHECKED_NOT_FOUND: "공식 안내에서 미발견",
  ACCESS_FAILED: "페이지 접근 실패",
  NEEDS_REVIEW: "검수 필요",
} as const;

const reviewVerificationLabels = {
  UNVERIFIED: "검수 필요",
  VERIFIED: "검수 완료",
  SUPERSEDED: "이전 버전",
} as const;

function EnglishKindergartenAdminPanels({
  data,
}: {
  data: NonNullable<AdminInstitutionDTO["englishKindergarten"]>;
}) {
  return (
    <>
      <section aria-labelledby="english-kindergarten-coverage-heading">
        <div className="admin-section-heading">
          <h2 id="english-kindergarten-coverage-heading">정보 확인 상태</h2>
        </div>
        <AdminDataTable caption="영어유치원 정보 확인 상태">
          <thead>
            <tr>
              <th scope="col">항목</th>
              <th scope="col">상태</th>
              <th scope="col">자료 수집</th>
              <th scope="col">내용 확인</th>
              <th scope="col">근거</th>
              <th scope="col">운영자 메모</th>
            </tr>
          </thead>
          <tbody>
            {data.coverages.map((coverage) => (
              <tr key={coverage.section}>
                <th scope="row">
                  {coverageSectionLabels[coverage.section]}
                  {coverage.academicYearLabel
                    ? ` · ${coverage.academicYearLabel}`
                    : ""}
                </th>
                <td>
                  <AdminStateChip>
                    {coverageStatusLabels[coverage.status]}
                  </AdminStateChip>
                </td>
                <td>{formatAdminDate(coverage.lastCollectedAt)}</td>
                <td>{formatAdminDate(coverage.lastCheckedAt)}</td>
                <td>
                  {coverage.sourceUrl && coverage.sourceName ? (
                    <>
                      <AdminSourceUrl
                        displayUrl={coverage.sourceName}
                        safeUrl={coverage.safeSourceUrl}
                      />
                      {coverage.sourceSnapshotId ? (
                        <small>스냅샷 {coverage.sourceSnapshotId}</small>
                      ) : null}
                    </>
                  ) : (
                    "연결된 근거 없음"
                  )}
                </td>
                <td>{coverage.internalNote ?? "메모 없음"}</td>
              </tr>
            ))}
          </tbody>
        </AdminDataTable>
      </section>

      <section aria-labelledby="english-kindergarten-review-heading">
        <div className="admin-section-heading">
          <h2 id="english-kindergarten-review-heading">후기 요약 검수</h2>
          {data.reviewInsight ? (
            <AdminStateChip>
              {reviewVerificationLabels[data.reviewInsight.verificationState]}
            </AdminStateChip>
          ) : null}
        </div>
        {data.reviewInsight ? (
          <AdminDataTable caption="영어유치원 후기 요약 검수">
            <tbody>
              <tr>
                <th scope="row">버전</th>
                <td>{data.reviewInsight.versionNumber}</td>
              </tr>
              <tr>
                <th scope="row">검토 기간</th>
                <td>
                  {data.reviewInsight.periodStart ?? "시작일 미확인"}~
                  {data.reviewInsight.periodEnd ?? "종료일 미확인"}
                </td>
              </tr>
              <tr>
                <th scope="row">검토 후기</th>
                <td>{data.reviewInsight.sampleSize}건</td>
              </tr>
              <tr>
                <th scope="row">요약 주제</th>
                <td>
                  <ul>
                    {data.reviewInsight.themes.map((theme) => (
                      <li key={theme.summary}>
                        {theme.summary}
                        {theme.mentionCount
                          ? ` · ${theme.mentionCount}건 언급`
                          : ""}
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
              <tr>
                <th scope="row">한계</th>
                <td>{data.reviewInsight.limitations ?? "별도 안내 없음"}</td>
              </tr>
              <tr>
                <th scope="row">내용 확인</th>
                <td>{formatAdminDate(data.reviewInsight.verifiedAt)}</td>
              </tr>
              <tr>
                <th scope="row">근거</th>
                <td>
                  {data.reviewInsight.evidence.length > 0 ? (
                    <ul>
                      {data.reviewInsight.evidence.map((evidence) => (
                        <li
                          key={`${evidence.sourceId}:${evidence.sourceSnapshotId ?? "none"}`}
                        >
                          <AdminSourceUrl
                            displayUrl={evidence.sourceName}
                            safeUrl={evidence.safeSourceUrl}
                          />
                          {evidence.sourceSnapshotId
                            ? ` · 스냅샷 ${evidence.sourceSnapshotId}`
                            : ""}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    "연결된 근거 없음"
                  )}
                </td>
              </tr>
            </tbody>
          </AdminDataTable>
        ) : (
          <p className="admin-empty-state" role="status">
            등록된 후기 요약 버전이 없어요.
          </p>
        )}
      </section>
    </>
  );
}

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
      {data.englishKindergarten ? (
        <EnglishKindergartenAdminPanels data={data.englishKindergarten} />
      ) : null}
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
