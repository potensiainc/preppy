"use client";

export default function GlobalError({
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <section lang="ko" role="alert" aria-labelledby="root-error-heading">
      <h1 id="root-error-heading">페이지 불러오기 오류</h1>
      <p>페이지를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>
      <button type="button" onClick={reset}>
        페이지 다시 불러오기
      </button>
    </section>
  );
}
