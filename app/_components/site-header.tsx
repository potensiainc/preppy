import Link from "next/link";

import { AuthControl } from "@/app/_components/auth-control";

const navigation = [
  { href: "/institutions", label: "기관 찾기" },
  { href: "/#current-opportunities", label: "입학정보" },
  { href: "/#articles", label: "아티클" },
];

function NavigationLinks() {
  return (
    <>
      {navigation.map((item) => (
        <Link href={item.href} key={item.href}>
          {item.label}
        </Link>
      ))}
    </>
  );
}

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link className="wordmark" href="/" aria-label="PREPPY 홈">
          PREPPY
        </Link>
        <nav className="site-navigation" aria-label="주요 메뉴">
          <NavigationLinks />
        </nav>
        <div className="site-header__actions">
          <AuthControl />
          <details className="mobile-navigation">
            <summary aria-label="메뉴 열고 닫기">메뉴</summary>
            <nav aria-label="모바일 주요 메뉴">
              <NavigationLinks />
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
