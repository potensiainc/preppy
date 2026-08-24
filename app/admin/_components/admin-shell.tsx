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
        Skip to operational content
      </a>

      <aside className="admin-rail" aria-label="Admin workspace">
        <div className="admin-rail__brand">
          <span>PREPPY</span>
          <strong>OPERATIONS</strong>
        </div>

        <div className="admin-desktop-nav">
          <AdminNav label="Admin sections" />
        </div>
        <details className="admin-mobile-nav">
          <summary>Admin sections</summary>
          <AdminNav label="Compact Admin sections" />
        </details>

        <div className="admin-identity">
          <p>Active operator</p>
          <strong>{adminName}</strong>
          <form action="/api/admin/auth/logout" method="post" onSubmit={logout}>
            <button disabled={logoutState === "pending"} type="submit">
              {logoutState === "pending" ? "Signing out…" : "Sign out"}
            </button>
          </form>
          <p
            className="admin-identity__status"
            role="status"
            aria-live="polite"
          >
            {logoutState === "error"
              ? "Sign-out was not completed. Your session remains active."
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
