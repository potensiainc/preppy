import { unstable_noStore as noStore } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SignupCancellationControl } from "./signup-cancellation-control";
import { isAccountDeletionEnabled } from "@/src/modules/account-deletion/runtime.server";
import { OnboardingForm } from "@/app/(public)/onboarding/onboarding-form";
import { getAuthRuntime } from "@/src/modules/auth/runtime.server";
import { PENDING_FOLLOW_INTENT_COOKIE_NAME } from "@/src/modules/auth/pending-follow-intent.server";
import { USER_SESSION_COOKIE_NAME } from "@/src/modules/auth/session.server";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  noStore();
  let state;
  try {
    const cookieStore = await cookies();
    const runtime = getAuthRuntime();
    state = await runtime.getOnboardingState(
      cookieStore.get(USER_SESSION_COOKIE_NAME)?.value ?? null,
      cookieStore.get(PENDING_FOLLOW_INTENT_COOKIE_NAME)?.value ?? null,
    );
  } catch {
    redirect("/auth/kakao/start");
  }

  return (
    <div className="page-container onboarding-page">
      <header className="onboarding-page__intro">
        <p className="eyebrow">PREPPY 시작하기</p>
        <h1>프레피 시작하기</h1>
        <p>
          회원 기능은 모두 무료예요. 선택 항목에 동의하지 않아도 가입할 수
          있어요.
        </p>
      </header>
      <OnboardingForm {...state} />
      <SignupCancellationControl enabled={isAccountDeletionEnabled()} />
    </div>
  );
}
