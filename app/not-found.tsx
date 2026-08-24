import Link from "next/link";

export default function NotFound() {
  return (
    <section lang="en" aria-labelledby="root-not-found-heading">
      <h1 id="root-not-found-heading">Page not found</h1>
      <p>The requested page is not available.</p>
      <Link href="/">Return to start</Link>
    </section>
  );
}
