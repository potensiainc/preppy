"use client";

import Link from "next/link";
import { type FormEvent, useRef, useState } from "react";

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

// Required items in screen order. The CTA agrees to all of them at once.
const requiredItems = [
  { name: "adultConfirmed", label: "만 19세 이상이에요. (필수)" },
  { name: "termsConsent", label: "서비스 이용약관에 동의해요. (필수)" },
  { name: "privacyConsent", label: "개인정보 수집·이용에 동의해요. (필수)" },
] as const;

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
  // Optional items start from what is already stored and are never pre-agreed.
  const [emailProvided, setEmailProvided] = useState(defaults.email !== null);
  const [email, setEmail] = useState(defaults.email ?? "");
  const [emailUpdates, setEmailUpdates] = useState(
    defaults.serviceEmailUpdatesConsent,
  );
  // Interest categories are preferences, not consents, so they do not count.
  const allOptionalAgreed = emailProvided && emailUpdates;
  const [requiredChecked, setRequiredChecked] = useState([false, false, false]);
  const requiredRefs = useRef<Array<HTMLInputElement | null>>([]);
  const submitRef = useRef<HTMLButtonElement | null>(null);

  // After a box is checked, move to the topmost box still unchecked, or to
  // the CTA once every required item is agreed.
  function toggleRequired(index: number, checked: boolean) {
    const next = requiredChecked.map((value, i) =>
      i === index ? checked : value,
    );
    setRequiredChecked(next);
    if (!checked) return;
    const target =
      requiredRefs.current[next.indexOf(false)] ?? submitRef.current;
    target?.focus();
    target?.scrollIntoView({ block: "nearest" });
  }
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
    // The CTA reads "필수 동의하고 가입하기", so pressing it agrees to every
    // required item; optional items keep the visitor's own choice.
    setRequiredChecked([true, true, true]);
    const body = new URLSearchParams();
    new FormData(event.currentTarget).forEach((value, key) => {
      if (typeof value === "string") body.append(key, value);
    });
    for (const item of requiredItems) body.set(item.name, "on");

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
          <Link href={`/institutions/${pendingInstitution.slug}`}>
            {pendingInstitution.displayName}
          </Link>
          <span>가입하면 이 기관도 관심기관으로 등록돼요.</span>
        </aside>
      ) : null}

      {!legalPublicationReady ? (
        <p role="status">
          약관과 개인정보 안내를 확인하고 있어요. 확인이 끝나면 가입할 수
          있어요.
        </p>
      ) : null}
      <fieldset>
        <legend>필수 동의</legend>
        {requiredItems.map((item, index) => (
          <div className="onboarding-row" key={item.name}>
            <label className="onboarding-check">
              <input
                aria-required="true"
                checked={requiredChecked[index]}
                name={item.name}
                onChange={(event) =>
                  toggleRequired(index, event.target.checked)
                }
                ref={(element) => {
                  requiredRefs.current[index] = element;
                }}
                type="checkbox"
                {...(item.name === "privacyConsent"
                  ? { "aria-describedby": "required-privacy-notice" }
                  : {})}
              />
              <span>{item.label}</span>
            </label>
            {item.name === "termsConsent" ? (
              <Link
                aria-label="서비스 이용약관 보기 (새 창)"
                href="/terms"
                rel="noopener noreferrer"
                target="_blank"
              >
                보기
              </Link>
            ) : item.name === "privacyConsent" ? (
              <Link
                aria-label="개인정보 처리방침 보기 (새 창)"
                href="/privacy"
                rel="noopener noreferrer"
                target="_blank"
              >
                보기
              </Link>
            ) : null}
          </div>
        ))}
        <details className="onboarding-details">
          <summary>수집 항목·이용 목적·보유 기간</summary>
          <dl id="required-privacy-notice" className="onboarding-notice">
            <div>
              <dt>수집 항목</dt>
              <dd>
                카카오 앱별 회원번호, 카카오에서 제공한 이메일, 가입·동의 기록
              </dd>
            </div>
            <div>
              <dt>이용 목적</dt>
              <dd>회원 식별, 로그인, 가입 처리</dd>
            </div>
            <div>
              <dt>보유 기간</dt>
              <dd>
                탈퇴 시까지 보유해요. 가입을 마치지 않으면 최초 수집 후 24시간
                뒤 파기 대상이 돼요.
              </dd>
            </div>
            <p>필수 수집·이용에 동의하지 않으면 가입할 수 없어요.</p>
          </dl>
        </details>
      </fieldset>

      <fieldset>
        <legend className="visually-hidden">선택 정보</legend>
        <label className="onboarding-toggle">
          <span>알림 이메일 제공 (선택)</span>
          <input
            checked={emailProvided}
            onChange={(event) => setEmailProvided(event.target.checked)}
            role="switch"
            type="checkbox"
          />
        </label>
        {emailProvided ? (
          <input
            aria-label="알림 이메일"
            className="onboarding-email"
            id="onboarding-email"
            name="email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="알림 받을 이메일"
            type="email"
            value={email}
          />
        ) : (
          <input name="emailOptOut" type="hidden" value="on" />
        )}
        <label className="onboarding-toggle">
          <span>남들보다 빠르게 입학정보 받아볼래요 (선택)</span>
          <input
            aria-describedby="email-consent-details"
            checked={emailUpdates}
            name="serviceEmailUpdatesConsent"
            onChange={(event) => setEmailUpdates(event.target.checked)}
            role="switch"
            type="checkbox"
          />
        </label>
        <details className="onboarding-details">
          <summary>수신 동의 내용</summary>
          <ul id="email-consent-details" className="onboarding-hint">
            <li>이메일로 입학정보를 받는 데 동의하는 항목이에요.</li>
            <li>
              요청한 입학정보 알림을 보내기 위해 이메일·관심기관·수신 설정을
              이용해요.
            </li>
            <li>동의 철회·이메일 삭제·탈퇴 중 먼저 도래한 때까지 이용해요.</li>
            <li>광고성 정보 수신 동의는 받지 않아요.</li>
          </ul>
        </details>
        {emailUpdates && !emailProvided ? (
          <p className="onboarding-hint" role="status">
            알림을 받으려면 알림 이메일 제공을 켜 주세요.
          </p>
        ) : null}
      </fieldset>

      <fieldset>
        <legend>관심 기관 유형 (선택)</legend>
        <div className="onboarding-categories">
          {categories.map((category) => (
            <label className="onboarding-chip" key={category.value}>
              <input
                defaultChecked={defaults.interestCategories.includes(
                  category.value,
                )}
                name="interestCategories"
                type="checkbox"
                value={category.value}
              />
              <span>{category.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div aria-live="polite" className="onboarding-form__status" role="status">
        {submission.error ? <p>{submission.error}</p> : null}
        {submission.stalePolicy ? (
          <button type="button" onClick={() => window.location.reload()}>
            페이지 새로고침
          </button>
        ) : null}
      </div>
      <div className="onboarding-cta">
        <button
          className="onboarding-form__submit"
          disabled={submission.pending}
          ref={submitRef}
          type="submit"
        >
          {submission.pending
            ? "가입 중…"
            : allOptionalAgreed
              ? "모두 동의하고 가입하기"
              : "필수 동의하고 가입하기"}
        </button>
      </div>
    </form>
  );
}
