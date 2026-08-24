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
            ? "State changed. Refresh and review the latest event before acting."
            : (payload.error?.message ?? "Operation could not be completed."),
        );
      }
      setMessage(`${label} committed.`);
      window.setTimeout(() => window.location.reload(), 400);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Operation could not be completed.",
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
              "Retry",
            )
          }
        >
          {pending === "Retry" ? "Retrying…" : "Retry"}
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
              "Cancel",
            )
          }
        >
          {pending === "Cancel" ? "Cancelling…" : "Cancel"}
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
              "Reconcile Resend Result",
            )
          }
        >
          {pending === "Reconcile Resend Result"
            ? "Reconciling…"
            : "Reconcile Resend Result"}
        </button>
      ) : null}
      {item.actions.canRetry ||
      item.actions.canCancel ||
      item.actions.canReconcileResend ? null : (
        <span className="admin-cell-note">No safe action</span>
      )}
      <span className="admin-cell-note" role="status" aria-live="polite">
        {message}
      </span>
    </div>
  );
}
