"use client";

import { useRef, useState, type Ref } from "react";

import { FavoriteHeart } from "@/app/_components/favorite-heart";

type UnfollowState = "idle" | "submitting" | "error";
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
  onRetry,
  triggerRef,
}: {
  state: UnfollowState;
  institutionName: string;
  onRequest: () => void;
  onConfirm?: () => void;
  onCancel?: () => void;
  onRetry: () => void;
  triggerRef?: Ref<HTMLButtonElement>;
  confirmRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <div>
      <FavoriteHeart
        saved
        pending={state === "submitting"}
        label={`${institutionName} 관심기관 해제`}
        onClick={state === "error" ? onRetry : onRequest}
        buttonRef={triggerRef}
      />
      {state === "error" ? (
        <p role="alert">
          해제 결과를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.
        </p>
      ) : null}
    </div>
  );
}

export function UnfollowControl({
  institutionId,
  institutionName,
  onRemove,
  onRestore,
}: {
  institutionId: string;
  institutionName: string;
  onRemove?: () => void;
  onRestore?: () => void;
}) {
  const [state, setState] = useState<UnfollowState>("idle");
  const pending = useRef(false);
  async function remove() {
    if (pending.current) return;
    pending.current = true;
    setState("submitting");
    onRemove?.();
    try {
      await runMyPreppyUnfollow(institutionId, fetch, {
        committed: () => {
          window.dispatchEvent(
            new CustomEvent("preppy:follow-changed", {
              detail: { institutionId, following: false },
            }),
          );
        },
        reauthenticate: () => {
          onRestore?.();
          window.location.replace("/auth/kakao/start");
        },
        reauthorize: () => {
          onRestore?.();
          window.location.reload();
        },
        refresh: () => {
          onRestore?.();
          window.location.reload();
        },
      });
    } catch {
      onRestore?.();
      setState("error");
    } finally {
      pending.current = false;
    }
  }
  return (
    <UnfollowPresentation
      state={state}
      institutionName={institutionName}
      onRequest={() => void remove()}
      onRetry={() => void remove()}
    />
  );
}
