"use client";

import { useEffect, useState } from "react";

export function AuthControl() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/auth/session", {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return { authenticated: false };
        return (await response.json()) as { authenticated: boolean };
      })
      .then((result) => setAuthenticated(result.authenticated))
      .catch(() => {
        if (!controller.signal.aborted) setAuthenticated(false);
      });
    return () => controller.abort();
  }, []);

  async function logout() {
    const response = await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
    });
    if (response.ok) setAuthenticated(false);
  }

  if (authenticated === null) {
    return <span className="auth-control auth-control--pending">확인 중</span>;
  }
  if (!authenticated) {
    return (
      <a className="auth-control" href="/auth/kakao/start">
        로그인
      </a>
    );
  }
  return (
    <button className="auth-control" type="button" onClick={logout}>
      로그아웃
    </button>
  );
}
