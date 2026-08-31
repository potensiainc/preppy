"use client";

import { useEffect, useState } from "react";

type Fetcher = typeof fetch;
type Navigate = (path: string) => void;

export async function loadAuthStatus(
  fetcher: Fetcher,
  signal?: AbortSignal,
): Promise<boolean> {
  const response = await fetcher("/api/auth/session", {
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) throw new Error("Session status request failed");
  const result: unknown = await response.json();
  if (
    typeof result !== "object" ||
    result === null ||
    !("authenticated" in result) ||
    typeof result.authenticated !== "boolean"
  )
    throw new Error("Session status response was invalid");
  return result.authenticated;
}

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
  logoutError = false,
  sessionError = false,
  onRetrySession,
}: {
  authenticated: boolean;
  onLogout: () => void;
  logoutError?: boolean;
  sessionError?: boolean;
  onRetrySession?: () => void;
}) {
  if (sessionError) {
    return (
      <div className="auth-control__active">
        <p role="alert">로그인 상태를 확인하지 못했어요.</p>
        <button className="auth-control" type="button" onClick={onRetrySession}>
          로그인 상태 다시 확인
        </button>
      </div>
    );
  }
  if (!authenticated) {
    return (
      <a className="auth-control" href="/auth/kakao/start">
        카카오로 로그인
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
      {logoutError ? (
        <p role="alert">
          로그아웃 결과를 확인하지 못했어요. 다시 시도해 주세요.
        </p>
      ) : null}
    </div>
  );
}

export function AuthControl() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [logoutError, setLogoutError] = useState(false);
  const [sessionError, setSessionError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void loadAuthStatus(fetch, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setAuthenticated(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setSessionError(true);
      });
    return () => controller.abort();
  }, [reloadKey]);

  async function logout() {
    setLogoutError(false);
    try {
      await runLogout(fetch, (path) =>
        window.location.replace(
          new URL(path, window.location.origin).toString(),
        ),
      );
    } catch {
      // Keep the authenticated presentation when logout was not authoritative.
      setLogoutError(true);
    }
  }

  if (sessionError) {
    return (
      <AuthControlPresentation
        authenticated={false}
        onLogout={logout}
        sessionError
        onRetrySession={() => {
          setSessionError(false);
          setReloadKey((key) => key + 1);
        }}
      />
    );
  }
  if (authenticated === null) {
    return (
      <span className="auth-control auth-control--pending">로그인 확인 중</span>
    );
  }
  if (!authenticated) {
    return <AuthControlPresentation authenticated={false} onLogout={logout} />;
  }
  return (
    <AuthControlPresentation
      authenticated
      onLogout={logout}
      logoutError={logoutError}
    />
  );
}
