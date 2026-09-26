import {
  AdminDataTable,
  AdminEmptyState,
  AdminPageHeader,
  AdminPagination,
  AdminStateChip,
  formatAdminCode,
  formatAdminDate,
} from "@/app/admin/_components/read-ui";
import { AdminOutboxActions } from "@/app/admin/_components/outbox-actions";
import { getAdminExecutor } from "@/app/admin/_lib/admin-page.server";
import type {
  AdminOutboxDTO,
  AdminPageDTO,
} from "@/src/modules/admin/read-model/contracts";
import {
  listAdminOutbox,
  parseAdminOutboxInput,
  type AdminOutboxInput,
} from "@/src/modules/admin/read-model/operations-query.server";

export function AdminOutboxView({
  data,
  query = { page: 1, pageSize: 20 },
}: {
  data: AdminPageDTO<AdminOutboxDTO>;
  query?: AdminOutboxInput;
}) {
  return (
    <div className="admin-page admin-operations-page">
      <AdminPageHeader
        kicker="운영 / Outbox"
        title="Outbox 이벤트 기록"
        description="허용된 운영 정보를 확인해요. 재시도, 취소, Resend 결과 대조는 서버가 해당 작업을 허용한 상태에서만 표시돼요."
      />
      <section aria-labelledby="outbox-ledger-heading">
        <div className="admin-section-heading">
          <h2 id="outbox-ledger-heading">이벤트</h2>
          <AdminStateChip>{data.pagination.total} 건</AdminStateChip>
        </div>
        {data.items.length === 0 ? (
          <AdminEmptyState>조건에 맞는 Outbox 이벤트가 없어요.</AdminEmptyState>
        ) : (
          <AdminDataTable caption="조회 전용 Outbox 이벤트 목록">
            <thead>
              <tr>
                <th scope="col">이벤트</th>
                <th scope="col">집계 대상</th>
                <th scope="col">상태</th>
                <th scope="col">시도 횟수</th>
                <th scope="col">발송 업체 처리 시도</th>
                <th scope="col">오류 코드</th>
                <th scope="col">시각</th>
                <th scope="col">실행 가능한 작업</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <th scope="row">
                    {formatAdminCode(item.eventType)}
                    <span className="admin-cell-note">{item.id}</span>
                  </th>
                  <td>
                    {formatAdminCode(item.aggregateType)}
                    <span className="admin-cell-note">{item.aggregateId}</span>
                  </td>
                  <td>{formatAdminCode(item.status)}</td>
                  <td>
                    {item.attemptCount} / {item.maxAttempts ?? "unbounded"}
                  </td>
                  <td>
                    {item.latestAttempt === null ? (
                      "없음"
                    ) : (
                      <>
                        {formatAdminCode(item.latestAttempt.provider)} ·{" "}
                        {formatAdminCode(item.latestAttempt.status)}
                        <span className="admin-cell-note">
                          시도 {item.latestAttempt.id}
                        </span>
                        <span className="admin-cell-note">
                          발송 업체 메시지{" "}
                          {item.latestAttempt.providerMessageId ?? "없음"}
                        </span>
                      </>
                    )}
                  </td>
                  <td>{item.errorCode ?? "없음"}</td>
                  <td>
                    처리 가능 {formatAdminDate(item.availableAt)}
                    <span className="admin-cell-note">
                      최종 실패(Dead letter){" "}
                      {formatAdminDate(item.deadLetteredAt)}
                    </span>
                  </td>
                  <td>
                    <AdminOutboxActions item={item} />
                  </td>
                </tr>
              ))}
            </tbody>
          </AdminDataTable>
        )}
        <AdminPagination
          pagination={data.pagination}
          basePath="/admin/operations/outbox"
          query={query}
        />
      </section>
    </div>
  );
}

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AdminOutboxPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = parseAdminOutboxInput(await searchParams);
  const data = await listAdminOutbox(getAdminExecutor(), query);
  return <AdminOutboxView data={data} query={query} />;
}
