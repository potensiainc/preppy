"use client";

import { useState } from "react";

type FollowContext = "INSTITUTION" | "ARTICLE" | "OPPORTUNITY";

export function FollowCta({
  institutionId,
  returnPath,
  context,
  articleId,
  opportunityId,
  label = "업데이트 받기",
}: {
  institutionId: string;
  returnPath: string;
  context: FollowContext;
  articleId?: string;
  opportunityId?: string;
  label?: string;
}) {
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");

  async function beginAuthentication() {
    if (status === "submitting") return;
    setStatus("submitting");
    try {
      const response = await fetch("/api/auth/follow-intent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          institutionId,
          returnPath,
          context,
          ...(articleId ? { articleId } : {}),
          ...(opportunityId ? { opportunityId } : {}),
        }),
      });
      if (!response.ok) throw new Error("Intent request failed");
      const result = (await response.json()) as { redirectTo?: string };
      if (result.redirectTo !== "/auth/kakao/start") {
        throw new Error("Unexpected auth destination");
      }
      window.location.assign(result.redirectTo);
    } catch {
      setStatus("error");
    }
  }

  return (
    <div
      className="follow-cta"
      data-institution-id={institutionId}
      data-return-path={returnPath}
    >
      <button
        disabled={status === "submitting"}
        type="button"
        onClick={beginAuthentication}
      >
        {status === "submitting" ? "로그인 준비 중…" : label}
      </button>
      <p className="follow-cta__hint">
        카카오 로그인 후 알림 설정을 이어갈 수 있습니다.
      </p>
      {status === "error" ? (
        <p className="follow-cta__error" role="alert">
          요청을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.
        </p>
      ) : null}
    </div>
  );
}
