"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import styles from "./curation.module.css";
const navigation = [
  { href: "/", label: "추천" },
  { href: "/institutions", label: "학교·기관" },
  { href: "/curation/calendar", label: "입학 일정" },
  { href: "/commute", label: "통학" },
];
export function PublicNavigation({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname() ?? "";
  return (
    <nav
      className={mobile ? styles.bottomNav : styles.navigation}
      aria-label={mobile ? "모바일 주요 메뉴" : "주요 메뉴"}
    >
      {navigation.map((item, index) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={
            (
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href)
            )
              ? "page"
              : undefined
          }
        >
          {mobile && (
            <svg
              width="21"
              height="21"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path
                d={
                  [
                    "M3 10l9-7 9 7v11h-6v-7H9v7H3z",
                    "M3 21V9h6V5l3-3 3 3v4h6v12H3zm6 0V9m6 0v12M11 6h2M5 12h2m10 0h2M5 16h2m10 0h2M11 18h2",
                    "M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2zm2-2v5m10-5v5M3 10h18M7 14h2m3 0h2m3 0h1M7 17h2m3 0h2",
                    "M6 3h12a2 2 0 0 1 2 2v14H4V5a2 2 0 0 1 2-2zM4 12h16M8 3v9m8-9v9M7 16h1m8 0h1M6 19v3m12-3v3",
                  ][index]
                }
              />
            </svg>
          )}
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
export function SiteMenu() {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);
  function close() {
    dialog.current?.close();
  }
  return (
    <>
      <button
        ref={trigger}
        className={styles.iconButton}
        type="button"
        aria-label="전체 메뉴 열기"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="preppy-all-menu"
        onClick={() => {
          dialog.current?.showModal();
          setOpen(true);
        }}
      >
        <svg
          width="23"
          height="23"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </button>
      <dialog
        ref={dialog}
        id="preppy-all-menu"
        className={styles.menu}
        aria-labelledby="preppy-menu-title"
        onClose={() => {
          setOpen(false);
          trigger.current?.focus();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            const bounds = event.currentTarget.getBoundingClientRect();
            if (
              event.clientX < bounds.left ||
              event.clientX > bounds.right ||
              event.clientY < bounds.top ||
              event.clientY > bounds.bottom
            )
              close();
          }
        }}
      >
        <div className={styles.menuHeading}>
          <h2 id="preppy-menu-title">전체 메뉴</h2>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="전체 메뉴 닫기"
            onClick={close}
          >
            ✕
          </button>
        </div>
        <nav
          aria-label="전체 메뉴"
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("a")) close();
          }}
        >
          <p className={styles.kicker}>입학정보</p>
          <Link href="/">
            추천 큐레이션 <span aria-hidden="true">↗</span>
          </Link>
          <Link href="/curation/calendar">
            입학 일정 <span aria-hidden="true">↗</span>
          </Link>
          <Link href="/curation/briefings">
            학교 설명회 <span aria-hidden="true">↗</span>
          </Link>
          <Link href="/curation/guides">
            입학 준비 아티클 <span aria-hidden="true">↗</span>
          </Link>
          <p className={styles.kicker}>학교·기관</p>
          <Link href="/institutions?category=PRIVATE_ELEMENTARY">
            사립초등학교 <span aria-hidden="true">↗</span>
          </Link>
          <Link href="/institutions?category=INTERNATIONAL_SCHOOL">
            국제학교 <span aria-hidden="true">↗</span>
          </Link>
          <Link href="/institutions?category=ENGLISH_KINDERGARTEN">
            영어유치원 <span aria-hidden="true">↗</span>
          </Link>
          <Link href="/commute">
            통학지도 <span aria-hidden="true">↗</span>
          </Link>
        </nav>
        <p className={styles.menuNote}>
          학교별 지원 조건과 공식 안내를 함께 살펴보세요.
        </p>
      </dialog>
    </>
  );
}
