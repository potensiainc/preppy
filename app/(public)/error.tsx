"use client";

export default function PublicError({
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <section className="status-surface" role="alert">
      <p className="eyebrow">PREPPY</p>
      <h1>정보 불러오기 오류</h1>
      <p>정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>
      <button type="button" onClick={reset}>
        정보 다시 불러오기
      </button>
    </section>
  );
}
