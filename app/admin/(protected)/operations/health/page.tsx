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
        kicker="운영 / 시스템 상태"
        title="시스템 상태와 데이터 품질"
        description="조회 전용 화면이에요. 실제 데이터베이스와 대기열, 기준 데이터의 무결성 상태를 보여주며 자동 복구 작업은 수행하지 않아요."
      />
      <section aria-labelledby="runtime-health-heading">
        <div className="admin-section-heading">
          <h2 id="runtime-health-heading">시스템 상태</h2>
          <AdminStateChip>{health.status}</AdminStateChip>
        </div>
        <div className="admin-metric-grid">
          <article>
            <p>데이터베이스</p>
            <strong>{health.database.status}</strong>
          </article>
          <article>
            <p>대기</p>
            <strong>{health.outbox.pending ?? "확인 불가"}</strong>
          </article>
          <article>
            <p>처리 중</p>
            <strong>{health.outbox.processing ?? "확인 불가"}</strong>
          </article>
          <article>
            <p>실패</p>
            <strong>{health.outbox.failed ?? "확인 불가"}</strong>
          </article>
          <article>
            <p>최종 실패(Dead letter)</p>
            <strong>{health.outbox.deadLetter ?? "확인 불가"}</strong>
          </article>
        </div>
        <p className="admin-cell-note">
          점검 시각 {formatAdminDate(health.checkedAt)}
        </p>
      </section>
      <section aria-labelledby="operational-signals-heading">
        <div className="admin-section-heading">
          <h2 id="operational-signals-heading">운영 지표</h2>
          <AdminStateChip>
            {operational === null || operational === undefined
              ? "UNAVAILABLE"
              : operational.migration.status}
          </AdminStateChip>
        </div>
        {operational === null || operational === undefined ? (
          <p className="admin-cell-note">
            운영 현황을 평가하지 못했어요. 잠시 후 새로고침해 주세요.
          </p>
        ) : (
          <>
            <div className="admin-metric-grid">
              <article>
                <p>워커 지연</p>
                <strong>
                  {operational.outbox.workerLagSeconds === null
                    ? "처리 예정 작업 없음"
                    : `${operational.outbox.workerLagSeconds}s`}
                </strong>
              </article>
              <article>
                <p>장시간 처리 중</p>
                <strong>{operational.outbox.staleProcessing}</strong>
              </article>
              <article>
                <p>RESULT UNKNOWN</p>
                <strong>{operational.notification.resultUnknown}</strong>
              </article>
              <article>
                <p>점검 기한 초과</p>
                <strong>{operational.monitoring.overdue}</strong>
              </article>
              <article>
                <p>발송 업체 이벤트 실패</p>
                <strong>{operational.providerEvents.failed}</strong>
              </article>
              <article>
                <p>발송 기록과 연결되지 않은 업체 이벤트</p>
                <strong>{operational.providerEvents.orphan}</strong>
              </article>
              <article>
                <p>캐시 실패</p>
                <strong>{operational.cacheRevalidation.failed}</strong>
              </article>
              <article>
                <p>캐시 최종 실패</p>
                <strong>{operational.cacheRevalidation.deadLetter}</strong>
              </article>
              <article>
                <p>확인 불가 출처</p>
                <strong>{operational.monitoring.sourceUnavailable}</strong>
              </article>
            </div>
            <p className="admin-cell-note">
              각 지표는 쿼리 실행 시점의 값이에요. 분석 전송은 성공이 보장되지
              않으며 실패 기록은 저장하지 않아요.
            </p>
          </>
        )}
      </section>
      <section aria-labelledby="data-quality-heading">
        <div className="admin-section-heading">
          <h2 id="data-quality-heading">데이터 품질</h2>
          <AdminStateChip>
            {health.dataQuality.affectedRecordCount} 건 영향 확인 ·{" "}
            {health.dataQuality.unavailableCheckCount} 건 평가 불가
          </AdminStateChip>
        </div>
        <AdminDataTable caption="조회 전용 기준 데이터 무결성 경고">
          <thead>
            <tr>
              <th scope="col">경고</th>
              <th scope="col">심각도</th>
              <th scope="col">건수</th>
              <th scope="col">일부 사례</th>
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
                    : "평가 불가"}
                </td>
                <td>
                  {warning.evaluationStatus === "UNAVAILABLE"
                    ? "이 항목을 평가하지 못했어요."
                    : warning.details.length === 0
                      ? "영향받은 기록 없음"
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
