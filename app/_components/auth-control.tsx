"use client";

// Public header login (Owner decision 2026-10-24, see AGENTS.md): signed-out
// visitors get a Kakao login link, signed-in members get 내 프레피 and logout.

import { useEffect, useId, useRef, useState } from "react";

type Fetcher = typeof fetch;

export const HEADER_LOGIN_PATH = "/auth/kakao/start?returnTo=%2Fmy-preppy";
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

function AccountIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9.25" />
      <circle cx="12" cy="10" r="3.25" />
      <path d="M6.2 18.4a7 7 0 0 1 11.6 0" />
    </svg>
  );
}

// Signed-in header: one account button with a small menu, like most product
// headers. 내 프레피 stays visible as a text link on wide screens; logout lives
// in the menu so the header does not lead with a rarely used action.
function AccountMenu({
  onLogout,
  logoutError,
}: {
  onLogout: () => void;
  logoutError: boolean;
}) {
  const [open, setOpen] = useState(logoutError);
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="account-menu" ref={root}>
      <a className="auth-control account-menu__shortcut" href="/my-preppy">
        내 프레피
      </a>
      <button
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="내 계정 메뉴"
        className="account-menu__trigger"
        onClick={() => setOpen((value) => !value)}
        ref={trigger}
        type="button"
      >
        <AccountIcon />
      </button>
      <div
        className="account-menu__panel"
        hidden={!open}
        id={menuId}
        role="menu"
      >
        <a className="account-menu__item" href="/my-preppy" role="menuitem">
          내 프레피
        </a>
        <a
          className="account-menu__item"
          href="/my-preppy/settings"
          role="menuitem"
        >
          계정 설정
        </a>
        <hr className="account-menu__divider" />
        <button
          className="account-menu__item"
          onClick={onLogout}
          role="menuitem"
          type="button"
        >
          로그아웃
        </button>
        {logoutError ? (
          <p className="account-menu__error" role="alert">
            로그아웃 결과를 확인하지 못했어요. 다시 시도해 주세요.
          </p>
        ) : null}
      </div>
    </div>
  );
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
    // Kept to one short control so a failed status check does not break the
    // header layout; the full sentence is announced to screen readers.
    return (
      <div className="auth-control__active">
        <p className="visually-hidden" role="alert">
          로그인 상태를 확인하지 못했어요.
        </p>
        <button
          aria-label="로그인 상태 다시 확인"
          className="auth-control"
          type="button"
          onClick={onRetrySession}
        >
          다시 확인
        </button>
      </div>
    );
  }
  if (!authenticated) {
    // Header login lands on 내 프레피; members who are still signing up go to
    // onboarding first, as every Kakao callback does.
    return (
      <a
        className="auth-control"
        href={HEADER_LOGIN_PATH}
        aria-label="카카오 로그인"
      >
        로그인
      </a>
    );
  }

  return <AccountMenu onLogout={onLogout} logoutError={logoutError} />;
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
    return null;
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
