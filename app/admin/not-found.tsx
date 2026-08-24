import Link from "next/link";

export default function AdminNotFound() {
  return (
    <main className="preppy-admin-fallback">
      <section className="admin-fallback-panel">
        <p className="admin-kicker">Private route / 404</p>
        <h1>Admin page not found</h1>
        <p>This route is not part of the PREPPY operations console.</p>
        <Link className="admin-button" href="/admin">
          Return to Dashboard
        </Link>
      </section>
    </main>
  );
}
