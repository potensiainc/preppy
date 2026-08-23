"use client";

import { useEffect, useState } from "react";

type Fetcher = typeof fetch;
type Navigate = (path: string) => void;

export async function runLogout(
  fetcher: Fetcher,
  navigate: Navigate,
): Promise<void> {
  const response = await fetcher("/api/auth/logout", {
    method: "POST",
    credentials: "same-origin",
  });
  if (response.status !== 204) throw new Error("Authoritative logout failed");
  navigate("/");
}

export function AuthControlPresentation({
  authenticated,
  onLogout,
}: {
  authenticated: boolean;
  onLogout: () => void;
}) {
  if (!authenticated) {
    return (
      <a className="auth-control" href="/auth/kakao/start">
        카카오로 시작하기
      </a>
    );
  }

  return (
    <div className="auth-control__active">
      <a className="auth-control" href="/my-preppy">
        내 프레피
      </a>
      <button className="auth-control" type="button" onClick={onLogout}>
        로그아웃
      </button>
    </div>
  );
}

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
    try {
      await runLogout(fetch, (path) =>
        window.location.replace(
          new URL(path, window.location.origin).toString(),
        ),
      );
    } catch {
      // Keep the authenticated presentation when logout was not authoritative.
    }
  }

  if (authenticated === null) {
    return <span className="auth-control auth-control--pending">확인 중</span>;
  }
  if (!authenticated) {
    return <AuthControlPresentation authenticated={false} onLogout={logout} />;
  }
  return <AuthControlPresentation authenticated onLogout={logout} />;
}
