"use client";

export default function GlobalError({
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <section className="status-surface" role="alert">
      <p className="eyebrow">PREPPY</p>
      <h1>정보를 불러오는 중 잠시 문제가 생겼습니다.</h1>
      <p>잠시 후 다시 시도해 주세요.</p>
      <button type="button" onClick={reset}>
        다시 시도
      </button>
    </section>
  );
}
