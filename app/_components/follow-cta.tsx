"use client";

import Link from "next/link";
import { FavoriteHeart } from "@/app/_components/favorite-heart";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

type FollowContext = "INSTITUTION" | "ARTICLE" | "OPPORTUNITY";
type FollowCtaState =
  | "loading"
  | "anonymous"
  | "available"
  | "submitting"
  | "removing"
  | "following"
  | "unavailable"
  | "error";
type FollowActionState = Extract<FollowCtaState, "anonymous" | "available">;
type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type FollowCtaTarget = {
  institutionId: string;
  returnPath: string;
  context: FollowContext;
  articleId?: string;
  opportunityId?: string;
  followable?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function loadFollowCtaState(
  institutionId: string,
  fetcher: Fetcher = fetch,
): Promise<Extract<FollowCtaState, "anonymous" | "available" | "following">> {
  const response = await fetcher(
    `/api/me/follows/status?institutionId=${encodeURIComponent(institutionId)}`,
    { cache: "no-store", credentials: "same-origin" },
  );
  if (!response.ok) throw new Error("Follow status request failed");

  const body: unknown = await response.json();
  const data = isRecord(body) && isRecord(body.data) ? body.data : null;
  if (
    !data ||
    typeof data.authenticated !== "boolean" ||
    typeof data.following !== "boolean"
  ) {
    throw new Error("Follow status response was invalid");
  }
  if (!data.authenticated) return "anonymous";
  return data.following ? "following" : "available";
}

function isCommittedActivation(body: unknown, institutionId: string): boolean {
  const data = isRecord(body) && isRecord(body.data) ? body.data : null;
  return Boolean(
    data &&
    data.state === "ACTIVE" &&
    data.institutionId === institutionId &&
    typeof data.followId === "string" &&
    typeof data.activatedAt === "string" &&
    typeof data.created === "boolean" &&
    typeof data.reactivated === "boolean" &&
    typeof data.activeFollowCount === "number",
  );
}

export async function runFollowCtaAction(
  options: FollowCtaTarget & {
    state: FollowActionState;
    fetcher?: Fetcher;
    navigate?: (path: string) => void;
    onCommitted: () => void;
  },
): Promise<FollowActionState | "following" | "unavailable"> {
  const fetcher = options.fetcher ?? fetch;
  const navigate =
    options.navigate ?? ((path: string) => window.location.assign(path));

  if (options.state === "anonymous") {
    const response = await fetcher("/api/auth/follow-intent", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        institutionId: options.institutionId,
        returnPath: options.returnPath,
        context: options.context,
        ...(options.articleId ? { articleId: options.articleId } : {}),
        ...(options.opportunityId
          ? { opportunityId: options.opportunityId }
          : {}),
      }),
    });
    if (!response.ok) {
      if (response.status === 404) return "unavailable";
      throw new Error("Follow intent request failed");
    }
    const body: unknown = await response.json();
    if (!isRecord(body) || body.redirectTo !== "/auth/kakao/start") {
      throw new Error("Follow intent response was invalid");
    }
    navigate(body.redirectTo);
    return "anonymous";
  }

  const response = await fetcher("/api/me/follows", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ institutionId: options.institutionId }),
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = isRecord(body) && isRecord(body.error) ? body.error : null;
    if (
      (response.status === 403 || response.status === 404) &&
      (error?.code === "INSTITUTION_NOT_FOLLOWABLE" ||
        error?.code === "INSTITUTION_NOT_FOUND")
    ) {
      return "unavailable";
    }
    throw new Error("Follow activation request failed");
  }
  if (!isCommittedActivation(body, options.institutionId)) {
    throw new Error("Follow activation response was invalid");
  }

  options.onCommitted();
  return "following";
}

export function FollowCtaPresentation({
  state,
  onAction,
  onRetry,
}: {
  state: FollowCtaState;
  label: string;
  onAction: () => void;
  onRetry: () => void;
}) {
  if (state === "unavailable") {
    return (
      <>
        <p className="follow-cta__error" role="alert">
          지금은 이 기관을 관심기관으로 등록할 수 없어요.
        </p>
        <Link href="/institutions">다른 기관 찾기</Link>
      </>
    );
  }

  if (state === "error") {
    return (
      <>
        <p className="follow-cta__error" role="alert">
          관심기관 상태나 등록 결과를 확인하지 못했어요. 다시 확인해 주세요.
        </p>
        <button type="button" onClick={onRetry}>
          관심기관 상태 다시 확인
        </button>
      </>
    );
  }

  const pending =
    state === "loading" || state === "submitting" || state === "removing";
  const saved = state === "following" || state === "removing";
  const accessibleLabel =
    state === "loading"
      ? "관심기관 상태 확인 중"
      : pending
        ? "관심기관 저장 중"
        : state === "anonymous"
          ? "카카오 로그인 후 관심기관 등록"
          : saved
            ? "관심기관 해제"
            : "관심기관 등록";
  return (
    <span className="favorite-heart-wrap" aria-live="polite">
      <FavoriteHeart
        saved={saved}
        pending={pending}
        label={accessibleLabel}
        onClick={onAction}
      />
    </span>
  );
}

export function FollowCta({
  institutionId,
  returnPath,
  context,
  articleId,
  opportunityId,
  followable = true,
  label = "관심기관 등록",
  onAnalyticsAction,
}: FollowCtaTarget & { label?: string; onAnalyticsAction?: () => void }) {
  const targetKey = JSON.stringify([
    institutionId,
    returnPath,
    context,
    articleId ?? null,
    opportunityId ?? null,
    followable,
  ]);
  const neutralState: FollowCtaState = followable ? "loading" : "unavailable";
  const currentTargetKey = useRef(targetKey);
  const [snapshot, setSnapshot] = useState<{
    targetKey: string;
    state: FollowCtaState;
  }>(() => ({ targetKey, state: neutralState }));
  const [reloadKey, setReloadKey] = useState(0);
  const [actionError, setActionError] = useState(false);
  const actionPending = useRef(false);
  const statusRevision = useRef(0);
  const state =
    snapshot.targetKey === targetKey ? snapshot.state : neutralState;

  useLayoutEffect(() => {
    currentTargetKey.current = targetKey;
  }, [targetKey]);

  function setTargetState(capturedTargetKey: string, next: FollowCtaState) {
    if (currentTargetKey.current !== capturedTargetKey) return;
    setSnapshot({ targetKey: capturedTargetKey, state: next });
  }

  useEffect(() => {
    const requestedTargetKey = targetKey;
    if (!followable) return;
    let current = true;
    const revision = ++statusRevision.current;
    loadFollowCtaState(institutionId)
      .then((resolved) => {
        if (current && revision === statusRevision.current)
          setTargetState(requestedTargetKey, resolved);
      })
      .catch(() => {
        if (current && revision === statusRevision.current)
          setTargetState(requestedTargetKey, "error");
      });
    return () => {
      current = false;
    };
  }, [followable, institutionId, reloadKey, targetKey]);

  useEffect(() => {
    function synchronize(event: Event) {
      const detail = (
        event as CustomEvent<{ institutionId: string; following: boolean }>
      ).detail;
      if (detail?.institutionId === institutionId) {
        statusRevision.current++;
        setTargetState(targetKey, detail.following ? "following" : "available");
      }
    }
    function refreshStatus() {
      setReloadKey((key) => key + 1);
    }
    window.addEventListener("preppy:follow-changed", synchronize);
    window.addEventListener("pageshow", refreshStatus);
    return () => {
      window.removeEventListener("preppy:follow-changed", synchronize);
      window.removeEventListener("pageshow", refreshStatus);
    };
  }, [institutionId, targetKey]);

  async function performAction() {
    if (
      actionPending.current ||
      (state !== "anonymous" && state !== "available" && state !== "following")
    )
      return;
    actionPending.current = true;
    statusRevision.current++;
    setActionError(false);
    onAnalyticsAction?.();
    const actionTargetKey = targetKey;
    const actionState = state;
    setTargetState(
      actionTargetKey,
      state === "following" ? "removing" : "submitting",
    );
    try {
      if (actionState === "following") {
        const response = await fetch(`/api/me/follows/${institutionId}`, {
          method: "DELETE",
          credentials: "same-origin",
          cache: "no-store",
        });
        if (response.status === 401) {
          window.location.assign("/auth/kakao/start");
          return;
        }
        if (response.status !== 204) throw new Error("Favorite removal failed");
        setTargetState(actionTargetKey, "available");
        window.dispatchEvent(
          new CustomEvent("preppy:follow-changed", {
            detail: { institutionId, following: false },
          }),
        );
        return;
      }
      const resolved = await runFollowCtaAction({
        state: actionState,
        institutionId,
        returnPath,
        context,
        ...(articleId ? { articleId } : {}),
        ...(opportunityId ? { opportunityId } : {}),
        navigate: (path) => {
          if (currentTargetKey.current === actionTargetKey) {
            window.location.assign(path);
          }
        },
        onCommitted: () => {
          setTargetState(actionTargetKey, "following");
          window.dispatchEvent(
            new CustomEvent("preppy:follow-changed", {
              detail: { institutionId, following: true },
            }),
          );
        },
      });
      if (resolved === "unavailable") {
        setTargetState(actionTargetKey, "unavailable");
      }
    } catch {
      setTargetState(actionTargetKey, actionState);
      setActionError(true);
    } finally {
      actionPending.current = false;
    }
  }

  function retry() {
    setTargetState(targetKey, "loading");
    setReloadKey((key) => key + 1);
  }

  if (!followable) return null;

  return (
    <div
      className="follow-cta"
      data-institution-id={institutionId}
      data-return-path={returnPath}
    >
      {actionError ? (
        <p className="follow-cta__error" role="alert">
          저장 결과를 확인하지 못했어요. 다시 시도해 주세요.
        </p>
      ) : null}
      <FollowCtaPresentation
        state={state}
        label={label}
        onAction={performAction}
        onRetry={retry}
      />
    </div>
  );
}
