"use client";

export default function GlobalError({
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <section lang="en" role="alert" aria-labelledby="root-error-heading">
      <h1 id="root-error-heading">Unable to display this page</h1>
      <p>Try again, or return to the previous page.</p>
      <button type="button" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
