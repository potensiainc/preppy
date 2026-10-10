import Link from "next/link";
import { PublicNavigation, SiteMenu } from "./site-menu";
import styles from "./curation.module.css";

export function SiteHeader() {
  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link className={styles.brand} href="/" aria-label="PREPPY 홈">
            preppy<span>.</span>
          </Link>
          <PublicNavigation />
          <div className={styles.tools}>
            <span className={styles.issue}>
              {new Intl.DateTimeFormat("en", {
                month: "long",
                timeZone: "Asia/Seoul",
              })
                .format(new Date())
                .toUpperCase()}{" "}
              EDIT
            </span>
            <Link
              className={styles.iconButton}
              href="/institutions"
              aria-label="학교·기관 검색"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                aria-hidden="true"
              >
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="m16 16 5 5" />
              </svg>
            </Link>
            <SiteMenu />
          </div>
        </div>
      </header>
      <PublicNavigation mobile />
    </>
  );
}
