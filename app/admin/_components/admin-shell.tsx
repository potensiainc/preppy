"use client";

import { type FormEvent, type ReactNode, useState } from "react";

import { AdminNav } from "@/app/admin/_components/admin-nav";

type Fetcher = typeof fetch;

export async function runAdminLogout(
  fetcher: Fetcher,
  navigate: (path: string) => void,
): Promise<void> {
  const response = await fetcher("/api/admin/auth/logout", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
  });
  if (response.status !== 204) throw new Error("Admin logout failed");
  await response.arrayBuffer();
  navigate("/admin/login");
}

export function AdminShell({
  adminName,
  children,
}: {
  adminName: string;
  children: ReactNode;
}) {
  const [logoutState, setLogoutState] = useState<"idle" | "pending" | "error">(
    "idle",
  );

  async function logout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (logoutState === "pending") return;
    setLogoutState("pending");
    try {
      await runAdminLogout(fetch, (path) => window.location.replace(path));
    } catch {
      setLogoutState("error");
    }
  }

  return (
    <div className="preppy-admin">
      <a className="admin-skip-link" href="#admin-main">
        운영 본문으로 이동
      </a>

      <aside className="admin-rail" aria-label="관리자 작업 공간">
        <div className="admin-rail__brand">
          <span>PREPPY</span>
          <strong>운영</strong>
        </div>

        <div className="admin-desktop-nav">
          <AdminNav label="관리자 메뉴" />
        </div>
        <details className="admin-mobile-nav">
          <summary>관리자 메뉴</summary>
          <AdminNav label="모바일 관리자 메뉴" />
        </details>

        <div className="admin-identity">
          <p>로그인한 운영자</p>
          <strong>{adminName}</strong>
          <form action="/api/admin/auth/logout" method="post" onSubmit={logout}>
            <button disabled={logoutState === "pending"} type="submit">
              {logoutState === "pending" ? "로그아웃 중…" : "로그아웃"}
            </button>
          </form>
          <p
            className="admin-identity__status"
            role="status"
            aria-live="polite"
          >
            {logoutState === "error"
              ? "로그아웃 완료 여부를 확인하지 못했어요. 다시 시도해 주세요."
              : ""}
          </p>
        </div>
      </aside>

      <main className="admin-main" id="admin-main" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
