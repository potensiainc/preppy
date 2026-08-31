"use client";

import { useEffect, useRef, useState, type Ref } from "react";

type UnfollowState = "idle" | "confirming" | "submitting" | "error";
type Fetcher = typeof fetch;

export type UnfollowTransitions = {
  committed: () => void;
  reauthenticate: () => void;
  reauthorize: () => void;
  refresh: () => void;
};

type UnfollowOutcome =
  "committed" | "reauthenticate" | "reauthorize" | "refresh";

export async function runMyPreppyUnfollow(
  institutionId: string,
  fetcher: Fetcher,
  transitions: UnfollowTransitions,
): Promise<UnfollowOutcome> {
  const response = await fetcher(`/api/me/follows/${institutionId}`, {
    method: "DELETE",
    credentials: "same-origin",
    cache: "no-store",
  });
  if (response.status === 204) {
    transitions.committed();
    return "committed";
  }
  if (response.status === 401) {
    transitions.reauthenticate();
    return "reauthenticate";
  }
  if (response.status === 403) {
    transitions.reauthorize();
    return "reauthorize";
  }
  if (response.status === 400 || response.status === 404) {
    transitions.refresh();
    return "refresh";
  }
  throw new Error(`Unfollow retryable response: ${response.status}`);
}

export function UnfollowPresentation({
  state,
  institutionName,
  onRequest,
  onConfirm,
  onCancel,
  onRetry,
  triggerRef,
  confirmRef,
}: {
  state: UnfollowState;
  institutionName: string;
  onRequest: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  onRetry: () => void;
  triggerRef?: Ref<HTMLButtonElement>;
  confirmRef?: Ref<HTMLButtonElement>;
}) {
  if (state === "confirming") {
    return (
      <div
        className="unfollow-confirmation"
        role="group"
        aria-live="polite"
        aria-label={`${institutionName} 관심기관 해제 확인`}
      >
        <p>
          이 기관을 관심기관에서 해제할까요? 해제하면 내 프레피 목록에서 빠져요.
        </p>
        <div className="unfollow-confirmation__actions">
          <button ref={confirmRef} type="button" onClick={onConfirm}>
            관심기관 해제
          </button>
          <button
            type="button"
            className="unfollow-button--quiet"
            onClick={onCancel}
          >
            관심기관 유지
          </button>
        </div>
      </div>
    );
  }
  if (state === "submitting") {
    return (
      <p className="unfollow-status" role="status">
        해제하는 중…
      </p>
    );
  }
  if (state === "error") {
    return (
      <div className="unfollow-confirmation">
        <p role="alert">
          해제 결과를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.
        </p>
        <button type="button" onClick={onRetry}>
          해제 다시 시도
        </button>
      </div>
    );
  }
  return (
    <button
      ref={triggerRef}
      className="unfollow-button"
      type="button"
      onClick={onRequest}
    >
      관심기관 해제
    </button>
  );
}

export function UnfollowControl({
  institutionId,
  institutionName,
}: {
  institutionId: string;
  institutionName: string;
}) {
  const [state, setState] = useState<UnfollowState>("idle");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const restoreTriggerFocus = useRef(false);

  useEffect(() => {
    if (state === "confirming") confirmRef.current?.focus();
    if (state === "idle" && restoreTriggerFocus.current) {
      restoreTriggerFocus.current = false;
      triggerRef.current?.focus();
    }
  }, [state]);

  async function confirm() {
    setState("submitting");
    try {
      await runMyPreppyUnfollow(institutionId, fetch, {
        committed: () => window.location.reload(),
        reauthenticate: () =>
          window.location.replace(
            new URL("/auth/kakao/start", window.location.origin).toString(),
          ),
        reauthorize: () => window.location.reload(),
        refresh: () => window.location.reload(),
      });
    } catch {
      setState("error");
    }
  }

  return (
    <UnfollowPresentation
      state={state}
      institutionName={institutionName}
      triggerRef={triggerRef}
      confirmRef={confirmRef}
      onRequest={() => {
        restoreTriggerFocus.current = true;
        setState("confirming");
      }}
      onConfirm={() => void confirm()}
      onCancel={() => setState("idle")}
      onRetry={() => setState("confirming")}
    />
  );
}
