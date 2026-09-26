import Link from "next/link";
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <p className="wordmark">PREPPY</p>
        <p>입학 준비에 필요한 정보를 공식 출처와 함께 정리해요.</p>
        <nav
          aria-label="약관과 개인정보 안내"
          style={{ display: "flex", flexWrap: "wrap", gap: "12px 24px" }}
        >
          <Link
            href="/terms"
            style={{
              minHeight: 44,
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            이용약관
          </Link>
          <Link
            href="/privacy"
            style={{
              minHeight: 44,
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            개인정보 처리방침
          </Link>
        </nav>
        <p className="site-footer__copyright">© 2026 PREPPY</p>
      </div>
    </footer>
  );
}
