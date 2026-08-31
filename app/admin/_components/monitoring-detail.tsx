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
        <AdminDataTable caption="기관 기준 정보">
          <tbody>
            <tr>
              <th scope="row">운영 상태</th>
              <td>{formatAdminCode(detail.currentTruth.operationalState)}</td>
            </tr>
            <tr>
              <th scope="row">공개 상태</th>
              <td>{formatAdminCode(detail.currentTruth.publicationState)}</td>
            </tr>
          </tbody>
        </AdminDataTable>
        <AdminDataTable caption="현재 기관 기본 정보">
          <thead>
            <tr>
              <th scope="col">기본 정보</th>
              <th scope="col">현재 표시 문구</th>
              <th scope="col">현재 버전 확인 토큰</th>
            </tr>
          </thead>
          <tbody>
            {detail.facts.map((fact) => (
              <tr key={fact.factType}>
                <th scope="row">{formatAdminCode(fact.factType)}</th>
                <td>
                  {fact.current?.displayText ?? "등록된 현재 기본 정보 없음"}
                </td>
                <td className="admin-record-id">
                  {fact.expectedCurrentVersionId ?? "신규 등록 가능(null)"}
                </td>
              </tr>
            ))}
          </tbody>
        </AdminDataTable>
      </>
    );
  }

  if (detail.currentTruth === null) {
    return <p className="admin-empty-state">등록된 현재 기준 정보가 없어요.</p>;
  }
  return (
    <AdminDataTable caption="현재 입학정보">
      <tbody>
        <tr>
          <th scope="row">기준 정보 방식</th>
          <td>
            {detail.kind === "OPPORTUNITY_NATIVE" ? "Native" : "Legacy backed"}
          </td>
        </tr>
        <tr>
          <th scope="row">제목</th>
          <td>
            {detail.kind === "OPPORTUNITY_NATIVE"
              ? detail.currentTruth.title
              : detail.currentTruth.displayTitle}
          </td>
        </tr>
        <tr>
          <th scope="row">상태</th>
          <td>
            {formatAdminCode(
              detail.kind === "OPPORTUNITY_NATIVE"
                ? detail.currentTruth.businessState
                : detail.currentTruth.eventStatus,
            )}
          </td>
        </tr>
        <tr>
          <th scope="row">현재 버전 확인 토큰</th>
          <td className="admin-record-id">
            {detail.expectedCurrentVersionId ?? "현재 버전 없음"}
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
        kicker="모니터링 / 검수"
        title={targetName}
        description="출처 연결을 확인하고 변경할 정보만 입력해 주세요. 기준 정보 반영과 알림 여부는 서버가 결정해요."
      />

      <section aria-labelledby="monitoring-binding-heading">
        <div className="admin-section-heading">
          <h2 id="monitoring-binding-heading">출처 연결과 점검 일정</h2>
          <AdminStateChip>{detail.schedule.dueState}</AdminStateChip>
        </div>
        <div className="admin-detail-ledger">
          <dl>
            <div>
              <dt>출처</dt>
              <dd>{detail.source.sourceName}</dd>
            </div>
            <div>
              <dt>공식 안내 링크</dt>
              <dd>
                <AdminSourceUrl
                  displayUrl={detail.source.canonicalUrl}
                  safeUrl={detail.source.safeUrl}
                />
              </dd>
            </div>
            <div>
              <dt>역할</dt>
              <dd>{formatAdminCode(detail.binding.role)}</dd>
            </div>
            <div>
              <dt>우선순위</dt>
              <dd>{formatAdminCode(detail.schedule.priority)}</dd>
            </div>
            <div>
              <dt>최근 점검</dt>
              <dd>{formatAdminDate(detail.schedule.lastCheckedAt)}</dd>
            </div>
            <div>
              <dt>다음 점검 예정</dt>
              <dd>{formatAdminDate(detail.schedule.nextDueAt)}</dd>
            </div>
            <div>
              <dt>최근 수집 결과</dt>
              <dd>
                {detail.latestObservation === null
                  ? "수집 기록 없음"
                  : formatAdminCode(detail.latestObservation.outcome)}
              </dd>
            </div>
            <div>
              <dt>최근 HTTP 상태</dt>
              <dd>
                {detail.latestObservation?.httpStatus ?? "확인할 수 없음"}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section aria-labelledby="current-truth-heading">
        <div className="admin-section-heading">
          <h2 id="current-truth-heading">현재 기준 정보</h2>
        </div>
        <CurrentTruth detail={detail} />
      </section>

      <MonitoringActions detail={detail} />
    </div>
  );
}
