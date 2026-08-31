"use client";

export default function AdminError({
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <main className="preppy-admin-fallback">
      <section className="admin-fallback-panel" role="alert">
        <p className="admin-kicker">운영 화면 복구</p>
        <h1>운영 화면을 불러오지 못했어요</h1>
        <p>운영 화면을 불러오지 못했어요. 다시 시도해 주세요.</p>
        <button type="button" onClick={reset}>
          다시 시도
        </button>
      </section>
    </main>
  );
}
