import Link from "next/link";

export default function NotFound() {
  return (
    <section lang="ko" aria-labelledby="root-not-found-heading">
      <h1 id="root-not-found-heading">페이지를 찾을 수 없어요</h1>
      <p>주소를 다시 확인하거나 홈에서 필요한 정보를 찾아 주세요.</p>
      <Link href="/">홈으로 이동</Link>
    </section>
  );
}
