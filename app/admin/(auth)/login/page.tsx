import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  title: "관리자 로그인 | PREPPY",
  robots: { index: false, follow: false },
};

export default function AdminLoginPage() {
  return (
    <main className="preppy-admin-login" aria-labelledby="admin-login-heading">
      <section className="admin-login-panel">
        <p className="admin-kicker">PREPPY 운영 / 접근 제한</p>
        <h1 id="admin-login-heading">관리자 로그인</h1>
        <p>PREPPY 운영 권한이 있는 Google 계정으로 로그인해 주세요.</p>
        <a className="admin-button" href="/admin/auth/start">
          Google 계정으로 로그인
        </a>
      </section>
    </main>
  );
}
