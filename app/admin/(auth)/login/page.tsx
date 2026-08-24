import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  title: "Admin sign-in | PREPPY",
  robots: { index: false, follow: false },
};

export default function AdminLoginPage() {
  return (
    <main className="preppy-admin-login" aria-labelledby="admin-login-heading">
      <section className="admin-login-panel">
        <p className="admin-kicker">PREPPY Operations / Restricted</p>
        <h1 id="admin-login-heading">Admin sign-in</h1>
        <p>
          Use the organization identity assigned to an existing PREPPY Admin
          account.
        </p>
        <a className="admin-button" href="/admin/auth/start">
          Continue with secure sign-in
        </a>
      </section>
    </main>
  );
}
