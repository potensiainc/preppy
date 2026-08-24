"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";

type OnboardingDefaults = {
  email: string | null;
  childBirthYear: number | null;
  interestRegions: string[];
  interestCategories: Array<
    "ENGLISH_KINDERGARTEN" | "PRIVATE_ELEMENTARY" | "INTERNATIONAL_SCHOOL"
  >;
  serviceEmailUpdatesConsent: boolean;
};

type PendingInstitution = {
  id: string;
  slug: string;
  displayName: string;
  category: string;
  regionCode: string | null;
} | null;

const categories = [
  { value: "ENGLISH_KINDERGARTEN", label: "영어유치원" },
  { value: "PRIVATE_ELEMENTARY", label: "사립초등학교" },
  { value: "INTERNATIONAL_SCHOOL", label: "국제학교" },
] as const;

export function OnboardingForm({
  defaults,
  policyVersions,
  pendingInstitution,
}: {
  defaults: OnboardingDefaults;
  policyVersions: {
    TERMS_OF_SERVICE: string;
    PRIVACY_POLICY: string;
    SERVICE_EMAIL_UPDATES: string;
  };
  pendingInstitution: PendingInstitution;
}) {
  const [submission, setSubmission] = useState<{
    pending: boolean;
    error: string | null;
    stalePolicy: boolean;
  }>({ pending: false, error: null, stalePolicy: false });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submission.pending) return;
    setSubmission({ pending: true, error: null, stalePolicy: false });
    const body = new URLSearchParams();
    new FormData(event.currentTarget).forEach((value, key) => {
      if (typeof value === "string") body.append(key, value);
    });

    try {
      const response = await fetch("/api/me/onboarding/complete", {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded",
        },
        body,
      });
      const result = (await response.json()) as {
        redirectTo?: string;
      };
      if (!response.ok) {
        if (response.status === 409) {
          setSubmission({
            pending: false,
            error:
              "약관이 변경되었습니다. 페이지를 새로고침한 뒤 다시 동의해 주세요.",
            stalePolicy: true,
          });
          return;
        }
        const error =
          response.status === 401
            ? "로그인 세션이 만료되었습니다. 페이지를 새로고침해 다시 로그인해 주세요."
            : response.status === 400
              ? "입력 내용을 확인해 주세요. 필수 동의와 입력 형식이 올바른지 살펴보세요."
              : "설정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";
        setSubmission({ pending: false, error, stalePolicy: false });
        return;
      }
      if (result.redirectTo !== "/" && result.redirectTo !== "/my-preppy") {
        throw new Error("Unexpected completion destination");
      }
      window.location.assign(result.redirectTo);
    } catch {
      setSubmission({
        pending: false,
        error: "설정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        stalePolicy: false,
      });
    }
  }

  return (
    <form
      action="/api/me/onboarding/complete"
      className="onboarding-form"
      method="post"
      onSubmit={submit}
    >
      <input
        name="termsPolicyVersion"
        type="hidden"
        value={policyVersions.TERMS_OF_SERVICE}
      />
      <input
        name="privacyPolicyVersion"
        type="hidden"
        value={policyVersions.PRIVACY_POLICY}
      />

      {pendingInstitution ? (
        <aside className="onboarding-intent" aria-label="이어갈 관심기관">
          <p className="eyebrow">Your interest</p>
          <h2>{pendingInstitution.displayName}</h2>
          <p>기본 설정이 정상적으로 완료되면 이 기관도 함께 관심 등록됩니다.</p>
          <Link href={`/institutions/${pendingInstitution.slug}`}>
            기관 정보 다시 보기
          </Link>
        </aside>
      ) : null}

      <fieldset>
        <legend>필수 동의</legend>
        <label>
          <input name="termsConsent" required type="checkbox" /> 서비스 이용약관
          동의 (필수)
        </label>
        <label>
          <input name="privacyConsent" required type="checkbox" /> 개인정보 처리
          동의 (필수)
        </label>
      </fieldset>

      <fieldset>
        <legend>선택 정보</legend>
        <label htmlFor="onboarding-email">알림 이메일 (선택)</label>
        <input
          defaultValue={defaults.email ?? ""}
          id="onboarding-email"
          name="email"
          type="email"
        />
        <label htmlFor="onboarding-child-year">자녀 출생연도 (선택)</label>
        <input
          defaultValue={defaults.childBirthYear ?? ""}
          id="onboarding-child-year"
          inputMode="numeric"
          max={new Date().getUTCFullYear()}
          min={new Date().getUTCFullYear() - 18}
          name="childBirthYear"
          type="number"
        />
        <label htmlFor="onboarding-region">관심 지역 코드 (선택)</label>
        <input
          defaultValue={defaults.interestRegions[0] ?? ""}
          id="onboarding-region"
          name="interestRegions"
          placeholder="예: KR-11"
          type="text"
        />
      </fieldset>

      <fieldset>
        <legend>관심 기관 유형 (선택)</legend>
        {categories.map((category) => (
          <label key={category.value}>
            <input
              defaultChecked={defaults.interestCategories.includes(
                category.value,
              )}
              name="interestCategories"
              type="checkbox"
              value={category.value}
            />{" "}
            {category.label}
          </label>
        ))}
      </fieldset>

      <label className="onboarding-form__email-consent">
        <input
          defaultChecked={defaults.serviceEmailUpdatesConsent}
          name="serviceEmailUpdatesConsent"
          type="checkbox"
        />{" "}
        서비스 이메일 업데이트 수신 (선택)
      </label>

      <p className="onboarding-form__notice">
        제출이 완료되기 전에는 관심기관 등록과 알림 설정이 확정되지 않습니다.
      </p>
      <div aria-live="polite" className="onboarding-form__status" role="status">
        {submission.error ? <p>{submission.error}</p> : null}
        {submission.stalePolicy ? (
          <button type="button" onClick={() => window.location.reload()}>
            페이지 새로고침
          </button>
        ) : null}
      </div>
      <button disabled={submission.pending} type="submit">
        {submission.pending ? "저장 중…" : "동의하고 완료"}
      </button>
    </form>
  );
}
