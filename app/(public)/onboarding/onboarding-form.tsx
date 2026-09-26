"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";

type OnboardingDefaults = {
  email: string | null;
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
  legalPublicationReady,
}: {
  defaults: OnboardingDefaults;
  legalPublicationReady: boolean;
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
    if (!legalPublicationReady) {
      setSubmission({
        pending: false,
        stalePolicy: false,
        error:
          "가입 안내가 변경됐어요. 페이지를 새로고침한 뒤 다시 시도해 주세요.",
      });
      return;
    }
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
        error?: { code?: string };
      };
      if (!response.ok) {
        if (result.error?.code === "CONSENT_POLICY_UPDATED") {
          setSubmission({
            pending: false,
            error:
              "약관이 변경됐어요. 페이지를 새로고침한 뒤 내용을 확인하고 다시 동의해 주세요.",
            stalePolicy: true,
          });
          return;
        }
        const error =
          result.error?.code === "SIGNUP_EXPIRED"
            ? "가입 대기 시간이 지났어요. 가입 대기 정보가 정리된 뒤 다시 로그인해 주세요."
            : response.status === 401
              ? "로그인 상태를 확인할 수 없어요. 페이지를 새로고침해 다시 로그인해 주세요."
              : response.status === 400
                ? "입력 내용을 확인해 주세요. 필수 동의와 입력 형식이 올바른지 확인해 주세요."
                : response.status === 503
                  ? "가입을 진행할 수 없어요. 잠시 후 다시 시도해 주세요."
                  : "가입 결과를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.";
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
        error: "가입 결과를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.",
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

      <input
        name="serviceEmailUpdatesPolicyVersion"
        type="hidden"
        value={policyVersions.SERVICE_EMAIL_UPDATES}
      />
      {pendingInstitution ? (
        <aside className="onboarding-intent" aria-label="이어갈 관심기관">
          <p className="eyebrow">등록할 관심기관</p>
          <h2>{pendingInstitution.displayName}</h2>
          <p>기본 설정을 완료하면 이 기관도 관심기관으로 등록돼요.</p>
          <Link href={`/institutions/${pendingInstitution.slug}`}>
            기관 정보 다시 보기
          </Link>
        </aside>
      ) : null}

      {!legalPublicationReady ? (
        <p role="status">
          약관과 개인정보 안내를 확인하고 있어요. 확인이 끝나면 가입할 수
          있어요.
        </p>
      ) : null}
      <fieldset>
        <legend>가입 조건과 필수 동의</legend>
        <label>
          <input name="adultConfirmed" required type="checkbox" /> 만 19세
          이상이에요. (필수)
        </label>
        <label>
          <input name="termsConsent" required type="checkbox" /> 서비스
          이용약관에 동의해요. (필수)
        </label>
        <Link href="/terms" target="_blank" rel="noopener noreferrer">
          약관 보기 (새 창)
        </Link>
        <div id="required-privacy-notice">
          <p>
            카카오 로그인으로 받은 회원번호와 제공에 동의한 이메일은 가입 대기
            정보예요. 가입 절차는 최초 수집 후 24시간 동안 이어갈 수 있어요.
            가입 취소나 기한 만료 후에는 가입 대기 정보를 파기 대상으로
            처리해요. 삭제 요청은 potensiainc@gmail.com으로 보내 주세요.
          </p>
          <p>
            회원 식별·로그인·가입 처리와 동의 확인을 위해 카카오 앱별 회원번호,
            내부 회원번호, 계정 상태·가입 시각과 문서 버전·동의 이력을 처리해요.
          </p>
          <p>
            가입을 완료한 정보는 회원 탈퇴 시까지 보유해요. 법령에 따른 보존이
            필요한 경우에는 개인정보 처리방침에 안내한 범위에서 별도로 보관해요.
            필수 수집·이용에 동의하지 않으면 가입할 수 없어요.
          </p>
        </div>
        <label>
          <input
            aria-describedby="required-privacy-notice"
            name="privacyConsent"
            required
            type="checkbox"
          />{" "}
          개인정보 수집·이용에 동의해요. (필수)
        </label>
        <Link href="/privacy" target="_blank" rel="noopener noreferrer">
          개인정보 처리방침 보기 (새 창)
        </Link>
      </fieldset>

      <fieldset>
        <legend>선택 정보</legend>
        <p>이메일과 관심 설정은 입력하지 않아도 가입할 수 있어요.</p>
        <label htmlFor="onboarding-email">알림 이메일 (선택)</label>
        <input
          defaultValue={defaults.email ?? ""}
          id="onboarding-email"
          name="email"
          type="email"
        />
        <p>
          카카오에서 동의해 제공한 이메일이 있으면 저장된 주소를 보여드려요. 이
          입력란을 비워도 이미 저장된 이메일은 삭제되지 않아요. 삭제는
          potensiainc@gmail.com으로 요청할 수 있어요.
        </p>
      </fieldset>

      <fieldset>
        <legend>관심 기관 유형 (선택)</legend>
        <p>
          관심 기관 유형은 관심 정보 표시에 사용해요. 항목 삭제 또는 탈퇴 시까지
          저장해요. 삭제는 potensiainc@gmail.com으로 요청할 수 있어요.
        </p>
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
          name="serviceEmailUpdatesConsent"
          type="checkbox"
          aria-describedby="email-consent-details"
        />{" "}
        남들보다 빠르게 입학정보 받아볼래요 (선택)
      </label>

      <p id="email-consent-details">
        이메일로 입학정보를 받는 데 동의하는 항목이에요. 다른 이용자보다 먼저
        받는 것을 보장하지 않아요. 현재는 수신 설정만 저장하며 이메일은 발송하지
        않아요. 요청한 입학정보 알림을 보내기 위해 이메일·관심기관·수신 설정을
        이용해요. 동의 철회·이메일 삭제·탈퇴 중 먼저 도래한 때까지 이용해요.
        동의하지 않으면 이메일 알림만 제공하지 않아요. 광고성 정보 수신 동의는
        받지 않아요.
      </p>
      <p>
        알림을 받으려면 이메일이 필요해요. 수신 동의 철회는
        potensiainc@gmail.com으로 요청할 수 있어요.
      </p>
      <p className="onboarding-form__notice">
        {pendingInstitution
          ? "가입을 완료해야 관심기관 등록과 이메일 수신 설정이 반영돼요."
          : "가입을 완료해야 기본 설정과 이메일 수신 설정이 반영돼요."}
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
        {submission.pending ? "가입 중…" : "동의하고 가입하기"}
      </button>
    </form>
  );
}
