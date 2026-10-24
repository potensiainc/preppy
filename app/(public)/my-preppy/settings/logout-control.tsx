"use client";

import { useState } from "react";

import { runLogout } from "@/app/_components/auth-control";

export function LogoutControl() {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function logout() {
    if (pending) return;
    setPending(true);
    setFailed(false);
    try {
      await runLogout(fetch, (path) =>
        window.location.replace(
          new URL(path, window.location.origin).toString(),
        ),
      );
    } catch {
      setPending(false);
      setFailed(true);
    }
  }

  return (
    <>
      <p>이 기기에서 PREPPY 로그인을 끝내요. 카카오계정 로그인은 그대로예요.</p>
      <button type="button" disabled={pending} onClick={logout}>
        {pending ? "로그아웃 중…" : "로그아웃"}
      </button>
      {failed ? (
        <p role="alert">
          로그아웃 결과를 확인하지 못했어요. 다시 시도해 주세요.
        </p>
      ) : null}
    </>
  );
}
