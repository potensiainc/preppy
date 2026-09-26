import Link from "next/link";
import { getCurrentLegalPolicy } from "@/src/application/legal-policies.server";
import styles from "./legal-document.module.css";

export function LegalDocument({
  title,
  content,
}: {
  title: string;
  content: string;
}) {
  const policy = getCurrentLegalPolicy(
    title === "서비스 이용약관" ? "TERMS_OF_SERVICE" : "PRIVACY_POLICY",
  );
  const effectiveDate = policy.effectiveAt?.replace(
    /(\d{4})-(\d{2})-(\d{2})/,
    (_, year, month, day) => `${year}년 ${Number(month)}월 ${Number(day)}일`,
  );
  const blocks = content.trim().split(/\n\s*\n/);
  return (
    <article className={styles.document}>
      <header className={styles.header}>
        <p className="eyebrow">PREPPY · 이용 안내</p>
        <h1>{title}</h1>
        <p className={styles.date}>시행일 {effectiveDate}</p>
      </header>
      <nav className={styles.navigation} aria-label="이용 안내 문서">
        <Link
          href="/terms"
          aria-current={title === "서비스 이용약관" ? "page" : undefined}
        >
          서비스 이용약관
        </Link>
        <Link
          href="/privacy"
          aria-current={title === "개인정보 처리방침" ? "page" : undefined}
        >
          개인정보 처리방침
        </Link>
      </nav>
      <div className={styles.prose}>
        {blocks.map((block, index) => {
          if (block.startsWith("## "))
            return (
              <h2
                key={index}
                id={
                  block.includes("선택 정보와 이메일")
                    ? "email-updates"
                    : `section-${index}`
                }
              >
                {block.slice(3)}
              </h2>
            );
          if (block.startsWith("- "))
            return (
              <ul key={index}>
                {block.split("\n").map((line, i) => (
                  <li key={i}>{line.replace(/^- /, "")}</li>
                ))}
              </ul>
            );
          return <p key={index}>{block}</p>;
        })}
      </div>
      <footer className={styles.contact}>
        <h2>문의</h2>
        <a href="mailto:potensiainc@gmail.com">potensiainc@gmail.com</a>
        <a href="tel:01046854725">010-4685-4725</a>
        <Link href="/">홈으로 이동</Link>
      </footer>
    </article>
  );
}
