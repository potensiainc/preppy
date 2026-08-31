import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { describe, expect, it, vi } from "vitest";

import {
  AuthControlPresentation,
  loadAuthStatus,
} from "@/app/_components/auth-control";
import { FollowCta, FollowCtaPresentation } from "@/app/_components/follow-cta";
import { OnboardingForm } from "@/app/(public)/onboarding/onboarding-form";
import { UnfollowPresentation } from "@/app/(public)/my-preppy/unfollow-control";
import { MyPreppyView } from "@/app/(public)/my-preppy/my-preppy-view";
import type { MyPreppyData } from "@/src/modules/my-preppy/query.server";
import PublicError from "@/app/(public)/error";
import PublicNotFound from "@/app/(public)/not-found";

describe("public/member UX state and action truth", () => {
  it.each([true, false])(
    "preserves whole change conditions and source data when email readiness is %s",
    (ready) => {
      // Catches sentence filtering/rewriting that removes money, dates, negation or official quotes.
      const summary =
        "접수 마감일이 변경되었습니다. 수업료는 2025학년도 기준 분기 2,520,000원입니다. 2026학년도에는 달라질 수 있습니다. 2026년 11월 11일 오후 4시 30분까지 등록하지 않으면 입학이 취소됩니다. 학교는 “원본만 제출해야 한다”고 안내했습니다. 공식 안내: https://school.example/notice";
      const data: MyPreppyData = {
        activeFollowCount: 1,
        readiness: {
          ready,
          label: ready ? "이메일 업데이트 준비됨" : "이메일 미등록",
          analyticsState: ready ? "ENABLED" : "UNAVAILABLE",
        },
        cards: [
          {
            followId: "follow",
            followedAt: "2026-08-20T00:00:00.000Z",
            institution: {
              id: "school",
              slug: "school",
              name: "서울학교",
              category: "PRIVATE_ELEMENTARY",
              region: null,
            },
            currentAdmissionsState: null,
            currentOpportunities: [],
            upcomingOpportunities: [
              {
                id: "next",
                slug: "next",
                title: "2027학년도 등록 안내입니다",
                state: "UPCOMING",
                keyDate: "2026-11-11",
                lastVerifiedAt: null,
              },
            ],
            recentChanges: [
              {
                opportunityId: "next",
                summary,
                publishedAt: "2026-09-01T00:00:00.000Z",
              },
            ],
            lastVerifiedAt: null,
            readiness: {
              ready,
              label: ready ? "이메일 업데이트 준비됨" : "이메일 미등록",
              analyticsState: ready ? "ENABLED" : "UNAVAILABLE",
            },
          },
        ],
      };
      const $ = load(
        renderToStaticMarkup(createElement(MyPreppyView, { data })),
      );
      expect($(".my-preppy-card__changes span").text()).toBe(
        "접수 마감일이 변경됐어요. 수업료는 2025학년도 기준 분기 2,520,000원이에요. 2026학년도에는 달라질 수 있어요. 2026년 11월 11일 오후 4시 30분까지 등록하지 않으면 입학이 취소돼요. 학교는 “원본만 제출해야 한다”고 안내했어요. 공식 안내: https://school.example/notice",
      );
      expect(data.cards[0]!.recentChanges[0]!.summary).toBe(summary);
      expect($("a[href='/opportunities/next']").text()).toBe(
        "2027학년도 등록 안내입니다",
      );
      expect($("time[datetime='2026-11-11']").text()).toBe("2026년 11월 11일");
      expect($(".my-preppy-card__state").text()).toContain("미확인");
      expect($(".verified-at time").length).toBe(0);
      expect($(".my-preppy-readiness strong").text()).toBe(
        ready ? "이메일 업데이트 준비됨" : "이메일 미등록",
      );
    },
  );
  it("names the login prerequisite only for the anonymous follow action", () => {
    // Catches showing a direct registration button when the next action is login.
    const render = (state: "anonymous" | "available") =>
      load(
        renderToStaticMarkup(
          createElement(FollowCtaPresentation, {
            state,
            label: "관심기관 등록",
            onAction: vi.fn(),
            onRetry: vi.fn(),
          }),
        ),
      );
    expect(render("anonymous")("button").text()).toMatch(/로그인/);
    expect(render("available")("button").text()).not.toMatch(/로그인/);
  });

  it("does not infer email delivery from a committed institution follow", () => {
    // Catches conflating persisted follow state with email eligibility or delivery.
    const $ = load(
      renderToStaticMarkup(
        createElement(FollowCtaPresentation, {
          state: "following",
          label: "관심기관 등록",
          onAction: vi.fn(),
          onRetry: vi.fn(),
        }),
      ),
    );
    expect($("[role=status]").text()).toContain("관심기관");
    expect($("body").text()).not.toMatch(/업데이트 받는 중|알림을 받는 중/);
    expect($("a[href='/my-preppy']").text()).toContain("내 프레피");
  });

  it("keeps unsupported follow UI hidden but explains a request that became unavailable", () => {
    // Catches hiding a real failed user action, or displaying an unused function.
    expect(
      renderToStaticMarkup(
        createElement(FollowCta, {
          institutionId: "school",
          returnPath: "/institutions/school",
          context: "INSTITUTION",
          followable: false,
        }),
      ),
    ).toBe("");
    const $ = load(
      renderToStaticMarkup(
        createElement(FollowCtaPresentation, {
          state: "unavailable",
          label: "관심기관 등록",
          onAction: vi.fn(),
          onRetry: vi.fn(),
        }),
      ),
    );
    expect($("[role=alert]").text()).toMatch(/등록할 수 없/);
    expect($("a[href='/institutions']").length).toBe(1);
    expect($("button").length).toBe(0);
  });

  it("keeps logout failure visible without replacing authenticated navigation", () => {
    // Catches silently swallowing an attempted logout or pretending it succeeded.
    const $ = load(
      renderToStaticMarkup(
        createElement(AuthControlPresentation, {
          authenticated: true,
          onLogout: vi.fn(),
          logoutError: true,
        }),
      ),
    );
    expect($("[role=alert]").text()).toMatch(/로그아웃.*다시/);
    expect($("a[href='/my-preppy']").length).toBe(1);
    expect($("button").text()).toContain("로그아웃");
    expect($("a[href='/auth/kakao/start']").length).toBe(0);
  });

  it("does not turn failed or malformed session checks into signed-out state", async () => {
    // Catches treating unavailable authentication evidence as an anonymous session.
    const $ = load(
      renderToStaticMarkup(
        createElement(AuthControlPresentation, {
          authenticated: false,
          onLogout: vi.fn(),
          sessionError: true,
          onRetrySession: vi.fn(),
        }),
      ),
    );
    expect($("[role=alert]").text()).toMatch(/로그인 상태.*확인하지 못/);
    expect($("button").length).toBe(1);
    expect($("a[href='/auth/kakao/start']").length).toBe(0);
    for (const response of [
      new Response(null, { status: 503 }),
      Response.json({}),
    ]) {
      await expect(loadAuthStatus(async () => response)).rejects.toThrow();
    }
    await expect(
      loadAuthStatus(async () => Response.json({ authenticated: false })),
    ).resolves.toBe(false);
    await expect(
      loadAuthStatus(async () => Response.json({ authenticated: true })),
    ).resolves.toBe(true);
  });

  it("preserves required consent, optional profile input and pending institution destination", () => {
    // Catches wording work accidentally changing consent requirements or canonical values.
    const $ = load(
      renderToStaticMarkup(
        createElement(OnboardingForm, {
          defaults: {
            email: null,
            childBirthYear: null,
            interestRegions: ["KR-11"],
            interestCategories: [],
            serviceEmailUpdatesConsent: false,
          },
          policyVersions: {
            TERMS_OF_SERVICE: "2026-08-23",
            PRIVACY_POLICY: "2026-08-23",
            SERVICE_EMAIL_UPDATES: "2026-08-23",
          },
          pendingInstitution: {
            id: "school",
            slug: "school",
            displayName: "서울학교",
            category: "PRIVATE_ELEMENTARY",
            regionCode: "KR-11",
          },
        }),
      ),
    );
    expect($("form").attr("action")).toBe("/api/me/onboarding/complete");
    expect(
      $("input[required]")
        .map((_, el) => $(el).attr("name"))
        .get(),
    ).toEqual(["termsConsent", "privacyConsent"]);
    expect($("input[name=privacyPolicyVersion]").val()).toBe("2026-08-23");
    expect($("input[name=termsPolicyVersion]").val()).toBe("2026-08-23");
    expect($("input[name=interestRegions]").val()).toBe("KR-11");
    expect($("input[name=serviceEmailUpdatesConsent]").is(":checked")).toBe(
      false,
    );
    expect($("a[href='/institutions/school']").length).toBe(1);
  });

  it("does not claim server state is unchanged after an ambiguous unfollow failure", () => {
    // Network failure may occur after commit; UI must not promise a preserved follow.
    const $ = load(
      renderToStaticMarkup(
        createElement(UnfollowPresentation, {
          state: "error",
          institutionName: "서울학교",
          onRequest: vi.fn(),
          onConfirm: vi.fn(),
          onCancel: vi.fn(),
          onRetry: vi.fn(),
        }),
      ),
    );
    expect($("[role=alert]").text()).not.toMatch(/그대로 유지|보존/);
    expect($("[role=alert]").text()).toMatch(/결과.*확인하지 못/);
    expect($("button").length).toBe(1);
  });

  it("does not promise institution registration when onboarding has no pending target", () => {
    // Catches reusing follow-intent completion copy for generic account onboarding.
    const $ = load(
      renderToStaticMarkup(
        createElement(OnboardingForm, {
          defaults: {
            email: null,
            childBirthYear: null,
            interestRegions: [],
            interestCategories: [],
            serviceEmailUpdatesConsent: false,
          },
          policyVersions: {
            TERMS_OF_SERVICE: "2026-08-23",
            PRIVACY_POLICY: "2026-08-23",
            SERVICE_EMAIL_UPDATES: "2026-08-23",
          },
          pendingInstitution: null,
        }),
      ),
    );
    expect($(".onboarding-form__notice").text()).not.toMatch(/관심기관 등록/);
    expect($(".onboarding-intent").length).toBe(0);
    expect($("input[name=termsConsent]").attr("required")).toBeDefined();
  });

  it("distinguishes retryable load failure from an unavailable page", () => {
    const error = load(
      renderToStaticMarkup(
        createElement(PublicError, {
          error: new Error("private details"),
          reset: vi.fn(),
        }),
      ),
    );
    expect(error("[role=alert]").length).toBe(1);
    expect(error("button").length).toBe(1);
    expect(error("body").text()).not.toContain("private details");
    const missing = load(renderToStaticMarkup(createElement(PublicNotFound)));
    expect(missing("a[href='/institutions']").length).toBe(1);
    expect(missing("button").length).toBe(0);
    expect(missing("body").text()).not.toMatch(/다시 확인하고 있/);
  });
});
