"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { requestSignupCancellation } from "./signup-cancellation";

export function SignupCancellationControl({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function cancel() {
    if (pending) return;
    setPending(true);
    setFailed(false);
    if (await requestSignupCancellation()) {
      router.push("/my-preppy/settings");
      router.refresh();
      return;
    }
    setPending(false);
    setFailed(true);
  }

  return (
    <section
      aria-labelledby="signup-cancellation-title"
      className="onboarding-form"
    >
      <h2 id="signup-cancellation-title">가입 취소</h2>
      {!enabled ? (
        <p>
          가입을 취소하려면{" "}
          <a href="mailto:potensiainc@gmail.com">
            potensiainc@gmail.com으로 요청해 주세요.
          </a>
        </p>
      ) : (
        <>
          <p>
            가입을 취소하면 가입 대기 정보 삭제와 카카오 연결 해제를 요청해요.
            카카오계정 자체는 삭제되지 않아요.
          </p>
          {confirming ? (
            <div>
              <p>가입을 취소할까요?</p>
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirming(false)}
              >
                가입 계속하기
              </button>
              <button type="button" disabled={pending} onClick={cancel}>
                {pending ? "취소 요청 중…" : "가입 취소하기"}
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirming(true)}>
              가입 취소
            </button>
          )}
          {failed ? (
            <p role="alert">
              가입 취소 결과를 확인하지 못했어요. 다시 시도하거나{" "}
              <a href="/my-preppy/settings">처리 상태를 확인해 주세요.</a>
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
