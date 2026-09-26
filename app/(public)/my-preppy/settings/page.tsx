import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { getAuthRuntime } from "@/src/modules/auth/runtime.server";
import { USER_SESSION_COOKIE_NAME } from "@/src/modules/auth/session.server";
import { isAccountDeletionEnabled } from "@/src/modules/account-deletion/runtime.server";
import { DeletionControl } from "./deletion-control";
import styles from "./settings.module.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "계정 설정 | PREPPY",
  robots: { index: false, follow: false },
};
export default async function AccountSettingsPage() {
  let authenticated = false;
  const cookieStore = await cookies();
  const session = cookieStore.get(USER_SESSION_COOKIE_NAME)?.value;
  if (session)
    try {
      authenticated = !!(await getAuthRuntime().getCurrentUser(session));
    } catch {
      /* Client request remains authoritative; no account data disclosed. */
    }
  return (
    <div className={styles.page}>
      <header>
        <p className="eyebrow">내 프레피</p>
        <h1>계정 설정</h1>
        <Link href="/my-preppy">내 프레피로 이동</Link>
      </header>
      <section>
        <h2>이메일 알림과 개인정보</h2>
        <p>
          선택 알림을 그만 받거나 저장한 정보를 삭제하고 싶으면 문의처로 요청해
          주세요. 광고 수신 여부는 회원 기능 이용에 영향을 주지 않아요.
        </p>
        <a href="mailto:potensiainc@gmail.com">potensiainc@gmail.com</a>
        <br />
        <a href="tel:01046854725">010-4685-4725</a>
      </section>
      <section>
        <h2>회원 탈퇴</h2>
        <DeletionControl
          enabled={isAccountDeletionEnabled()}
          authenticated={authenticated}
        />
      </section>
    </div>
  );
}
