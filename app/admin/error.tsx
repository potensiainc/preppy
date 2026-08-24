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
        <p className="admin-kicker">Operations recovery</p>
        <h1>Admin view unavailable</h1>
        <p>
          The private view could not be loaded. No operational action was
          submitted.
        </p>
        <button type="button" onClick={reset}>
          Try again
        </button>
      </section>
    </main>
  );
}
