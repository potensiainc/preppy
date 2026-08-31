import Link from "next/link";

import {
  AdminPageHeader,
  AdminStateChip,
} from "@/app/admin/_components/read-ui";
import { getAdminExecutor } from "@/app/admin/_lib/admin-page.server";
import type { AdminHealthDTO } from "@/src/modules/admin/read-model/contracts";
import { getAdminHealth } from "@/src/modules/admin/read-model/health-query.server";

const operationsLinks = [
  {
    href: "/admin/operations/outbox",
    label: "Outbox 기록",
    description: "이벤트 상태, 시도 횟수, 공개가 허용된 오류 코드를 확인해요.",
  },
  {
    href: "/admin/operations/deliveries",
    label: "발송 집계",
    description: "채널 상태와 허용 범위의 시도 요약을 확인해요.",
  },
  {
    href: "/admin/operations/audit",
    label: "감사 기록",
    description: "운영자 작업과 허용된 메타데이터 요약을 확인해요.",
  },
  {
    href: "/admin/operations/health",
    label: "시스템 상태와 데이터 품질",
    description: "데이터베이스, 대기열 처리 현황, 무결성 경고를 확인해요.",
  },
] as const;

export function AdminOperationsView({ health }: { health: AdminHealthDTO }) {
  return (
    <div className="admin-page admin-operations-page">
      <AdminPageHeader
        kicker="조회 / 운영"
        title="운영 관리"
        description="현재 운영 상태를 확인하고 서버가 해당 이벤트에 허용한 작업만 실행해 주세요. 발송 업체의 처리 결과가 불명확하면 별도로 결과를 대조해야 해요."
      />
      <section aria-labelledby="operations-status-heading">
        <div className="admin-section-heading">
          <h2 id="operations-status-heading">현재 상태</h2>
          <AdminStateChip>{health.status}</AdminStateChip>
        </div>
        <div className="admin-metric-grid">
          <article>
            <p>데이터베이스</p>
            <strong>{health.database.status}</strong>
          </article>
          <article>
            <p>대기 이벤트</p>
            <strong>{health.outbox.pending ?? "확인 불가"}</strong>
          </article>
          <article>
            <p>최종 실패 이벤트</p>
            <strong>{health.outbox.deadLetter ?? "확인 불가"}</strong>
          </article>
          <article>
            <p>무결성 경고</p>
            <strong>
              {health.dataQuality.unavailableCheckCount > 0
                ? "확인 불가"
                : health.dataQuality.warningCount}
            </strong>
          </article>
        </div>
      </section>
      <section aria-labelledby="operations-ledgers-heading">
        <div className="admin-section-heading">
          <h2 id="operations-ledgers-heading">운영 기록 조회</h2>
          <AdminStateChip>서버 승인 작업만 허용</AdminStateChip>
        </div>
        <div className="admin-action-grid">
          {operationsLinks.map((item) => (
            <article className="admin-action-card" key={item.href}>
              <h3>{item.label}</h3>
              <p>{item.description}</p>
              <Link href={item.href}>기록 열기</Link>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export default async function AdminOperationsPage() {
  const now = new Date();
  const health = await getAdminHealth(getAdminExecutor(), { now });
  return <AdminOperationsView health={health} />;
}
