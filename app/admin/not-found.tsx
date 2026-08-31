import Link from "next/link";

export default function AdminNotFound() {
  return (
    <main className="preppy-admin-fallback">
      <section className="admin-fallback-panel">
        <p className="admin-kicker">관리자 화면 / 404</p>
        <h1>관리자 페이지를 찾지 못했어요</h1>
        <p>이 주소에 해당하는 PREPPY 관리자 페이지가 없어요.</p>
        <Link className="admin-button" href="/admin">
          대시보드로 이동
        </Link>
      </section>
    </main>
  );
}
