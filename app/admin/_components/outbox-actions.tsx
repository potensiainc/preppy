"use client";

import { useState } from "react";

import type { AdminOutboxDTO } from "@/src/modules/admin/read-model/contracts";

export function AdminOutboxActions({ item }: { item: AdminOutboxDTO }) {
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function submit(
    endpoint: string,
    body: Record<string, unknown>,
    label: string,
  ) {
    setPending(label);
    setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as {
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(
          response.status === 409
            ? "상태가 바뀌었어요. 새로고침한 뒤 최신 이벤트를 확인해 주세요."
            : (payload.error?.message ??
                "작업을 완료하지 못했어요. 최신 상태를 확인한 뒤 다시 시도해 주세요."),
        );
      }
      setMessage(`${label} 요청을 반영했어요.`);
      window.setTimeout(() => window.location.reload(), 400);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "작업을 완료하지 못했어요. 최신 상태를 확인한 뒤 다시 시도해 주세요.",
      );
    } finally {
      setPending(null);
    }
  }

  const expected = {
    expectedStatus: item.status,
    expectedAttemptCount: item.attemptCount,
  };
  return (
    <div className="admin-outbox-actions">
      {item.actions.canRetry ? (
        <button
          className="admin-button"
          type="button"
          disabled={pending !== null}
          onClick={() =>
            void submit(
              `/api/admin/operations/outbox/${encodeURIComponent(item.id)}/retry`,
              expected,
              "재시도",
            )
          }
        >
          {pending === "재시도" ? "재시도 중…" : "재시도"}
        </button>
      ) : null}
      {item.actions.canCancel ? (
        <button
          className="admin-button"
          type="button"
          disabled={pending !== null}
          onClick={() =>
            void submit(
              `/api/admin/operations/outbox/${encodeURIComponent(item.id)}/cancel`,
              expected,
              "취소",
            )
          }
        >
          {pending === "취소" ? "취소 중…" : "취소"}
        </button>
      ) : null}
      {item.actions.canReconcileResend &&
      item.deliveryId !== null &&
      item.latestAttempt !== null ? (
        <button
          className="admin-button"
          type="button"
          disabled={pending !== null}
          onClick={() =>
            void submit(
              `/api/admin/operations/deliveries/${encodeURIComponent(item.deliveryId!)}/reconcile-resend`,
              { expectedAttemptId: item.latestAttempt!.id },
              "Resend 결과 대조",
            )
          }
        >
          {pending === "Resend 결과 대조"
            ? "결과 대조 중…"
            : "Resend 결과 대조"}
        </button>
      ) : null}
      {item.actions.canRetry ||
      item.actions.canCancel ||
      item.actions.canReconcileResend ? null : (
        <span className="admin-cell-note">
          현재 상태에서 실행 가능한 작업 없음
        </span>
      )}
      <span className="admin-cell-note" role="status" aria-live="polite">
        {message}
      </span>
    </div>
  );
}
