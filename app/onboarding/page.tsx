import { unstable_noStore as noStore } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { OnboardingForm } from "@/app/onboarding/onboarding-form";
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
        <p className="eyebrow">Welcome to PREPPY</p>
        <h1>알림을 위한 기본 설정</h1>
        <p>
          필수 동의를 확인하고, 필요한 정보만 선택해 주세요. 선택 정보는 나중에
          비워 둔 채 계속할 수 있습니다.
        </p>
      </header>
      <OnboardingForm {...state} />
    </div>
  );
}
