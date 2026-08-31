"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

type FollowContext = "INSTITUTION" | "ARTICLE" | "OPPORTUNITY";
type FollowCtaState =
  | "loading"
  | "anonymous"
  | "available"
  | "submitting"
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
  navigate("/my-preppy");
  return "following";
}

export function FollowCtaPresentation({
  state,
  label,
  onAction,
  onRetry,
}: {
  state: FollowCtaState;
  label: string;
  onAction: () => void;
  onRetry: () => void;
}) {
  if (state === "following") {
    return (
      <>
        <p className="follow-cta__committed" role="status">
          업데이트 받는 중
        </p>
        <p className="follow-cta__hint">
          이 기관이 관심기관으로 등록되어 있습니다.
        </p>
        <a href="/my-preppy">My Preppy에서 관리하기</a>
      </>
    );
  }

  if (state === "unavailable") {
    return null;
  }

  if (state === "error") {
    return (
      <>
        <p className="follow-cta__error" role="alert">
          관심기관 상태를 확인하거나 요청을 완료하지 못했습니다.
        </p>
        <button type="button" onClick={onRetry}>
          다시 시도
        </button>
      </>
    );
  }

  const pending = state === "loading" || state === "submitting";
  return (
    <>
      <button disabled={pending} type="button" onClick={onAction}>
        {state === "loading"
          ? "관심기관 상태 확인 중…"
          : state === "submitting"
            ? "처리 중…"
            : label}
      </button>
      <p className="follow-cta__hint" aria-live="polite">
        {state === "loading"
          ? "현재 관심기관 상태를 안전하게 확인하고 있습니다."
          : state === "anonymous"
            ? "카카오 로그인 후 알림 설정을 이어갈 수 있습니다."
            : state === "available"
              ? "관심기관으로 등록한 뒤 My Preppy에서 관리할 수 있습니다."
              : "요청 결과를 확인하고 있습니다."}
      </p>
    </>
  );
}

export function FollowCta({
  institutionId,
  returnPath,
  context,
  articleId,
  opportunityId,
  followable = true,
  label = "업데이트 받기",
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
    loadFollowCtaState(institutionId)
      .then((resolved) => {
        if (current) setTargetState(requestedTargetKey, resolved);
      })
      .catch(() => {
        if (current) setTargetState(requestedTargetKey, "error");
      });
    return () => {
      current = false;
    };
  }, [followable, institutionId, reloadKey, targetKey]);

  async function performAction() {
    if (state !== "anonymous" && state !== "available") return;
    onAnalyticsAction?.();
    const actionTargetKey = targetKey;
    const actionState = state;
    setTargetState(actionTargetKey, "submitting");
    try {
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
        onCommitted: () => setTargetState(actionTargetKey, "following"),
      });
      if (resolved === "unavailable") {
        setTargetState(actionTargetKey, "unavailable");
      }
    } catch {
      setTargetState(actionTargetKey, "error");
    }
  }

  function retry() {
    setTargetState(targetKey, "loading");
    setReloadKey((key) => key + 1);
  }

  if (state === "unavailable") return null;

  return (
    <div
      className="follow-cta"
      data-institution-id={institutionId}
      data-return-path={returnPath}
    >
      <FollowCtaPresentation
        state={state}
        label={label}
        onAction={performAction}
        onRetry={retry}
      />
    </div>
  );
}
