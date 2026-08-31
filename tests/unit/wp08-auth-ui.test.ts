import { readFile } from "node:fs/promises";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FollowCta } from "@/app/_components/follow-cta";
import { InstitutionDetailView } from "@/app/_components/institution-pages";
import { ArticleDetailView } from "@/app/_components/opportunity-article-pages";
import { OnboardingForm } from "@/app/(public)/onboarding/onboarding-form";
import type { InstitutionDetailDTO } from "@/src/modules/public/dto";

const institutionId = "550e8400-e29b-41d4-a716-446655440000";

const detail: InstitutionDetailDTO = {
  institution: {
    id: institutionId,
    slug: "seoul-international-school",
    name: "서울국제학교",
    category: "INTERNATIONAL_SCHOOL",
    region: "서울",
    followable: true,
    currentAdmissionsState: "OPEN",
    currentOpportunity: null,
    lastVerifiedAt: null,
  },
  reviewedAdmissions: [],
  currentOpportunities: [],
  upcomingOpportunities: [],
  recentOpportunities: [],
  verifiedFacts: [],
  officialSources: [],
  relatedArticles: [],
  indexability: "INDEX",
};

describe("WP-08 auth-aware public UI", () => {
  it("renders a real Follow CTA with canonical Institution inputs and no fake completion state", () => {
    // Mutation caught: dropping the canonical id/path or restoring the prototype/followed claim.
    const markup = renderToStaticMarkup(
      createElement(FollowCta, {
        institutionId,
        returnPath: "/institutions/seoul-international-school",
        context: "INSTITUTION",
      }),
    );
    expect(markup).toContain("관심기관 상태 확인 중");
    expect(markup).toContain(institutionId);
    expect(markup).toContain("/institutions/seoul-international-school");
    expect(markup).not.toContain("팔로우 완료");
    expect(markup).not.toContain("관심기관으로 등록되었습니다");

    const detailMarkup = renderToStaticMarkup(
      createElement(InstitutionDetailView, { data: detail }),
    );
    expect(detailMarkup).toContain(institutionId);
    expect(detailMarkup).toContain("/institutions/seoul-international-school");

    const labeledMarkup = renderToStaticMarkup(
      createElement(FollowCta, {
        institutionId,
        returnPath: "/articles/admissions-guide",
        context: "ARTICLE",
        label: "서울국제학교 업데이트 받기",
      } as never),
    );
    expect(labeledMarkup).toContain("관심기관 상태 확인 중");

    const closedMarkup = renderToStaticMarkup(
      createElement(InstitutionDetailView, {
        data: {
          ...detail,
          institution: { ...detail.institution, followable: false },
        },
      } as never),
    );
    expect(closedMarkup).not.toContain("현재 업데이트를 신청할 수 없습니다");
    expect(closedMarkup).not.toContain('class="follow-cta"');
    expect(closedMarkup).not.toContain("관심기관 상태 확인 중");
  });

  it("renders an Article CTA only for one unique canonical Institution target", () => {
    // Mutation caught: silently binding a generic Article CTA to the first of multiple Institutions.
    const baseInstitution = detail.institution;
    const article = {
      id: "7ba7b810-9dad-11d1-80b4-00c04fd430c8",
      slug: "admissions-guide",
      title: "입학 가이드",
      excerpt: null,
      articleType: "GUIDE" as const,
      category: "INTERNATIONAL_SCHOOL" as const,
      publishedAt: null,
      featuredImageUrl: null,
      featuredImageAlt: null,
      indexability: "INDEX" as const,
      updatedAt: "2026-08-23T00:00:00.000Z",
      seoTitle: null,
      seoDescription: null,
      canonicalUrl: null,
      robotsIndex: true,
      robotsFollow: true,
      sanitizedContentHtml: "<p>Article body</p>",
      relatedInstitutions: [baseInstitution],
      relatedOpportunities: [],
    };
    const oneTarget = renderToStaticMarkup(
      createElement(ArticleDetailView, { article }),
    );
    expect(oneTarget).toContain(institutionId);
    expect(oneTarget).toContain("관심기관 상태 확인 중");
    const unavailable = renderToStaticMarkup(
      createElement(ArticleDetailView, {
        article: {
          ...article,
          relatedInstitutions: [{ ...baseInstitution, followable: false }],
        },
      }),
    );
    expect(unavailable).not.toContain('aria-label="관심기관 알림"');

    const ambiguous = renderToStaticMarkup(
      createElement(ArticleDetailView, {
        article: {
          ...article,
          relatedInstitutions: [
            baseInstitution,
            {
              ...baseInstitution,
              id: "8ba7b810-9dad-11d1-80b4-00c04fd430c8",
              slug: "busan-international-school",
              name: "부산국제학교",
            },
          ],
        },
      }),
    );
    expect(ambiguous).not.toContain('class="follow-cta"');
  });

  it("posts intent before navigating to exact Kakao start and reports a safe error", async () => {
    // Mutation caught: navigating before intent persistence, posting a slug as identity, or claiming a Follow.
    const source = await readFile(
      new URL("../../app/_components/follow-cta.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain('fetcher("/api/auth/follow-intent"');
    expect(source).toContain("institutionId");
    expect(source).toContain("returnPath");
    expect(source).toContain("window.location.assign(path)");
    expect(source).toMatch(/catch|response\.ok/);
    expect(source).not.toMatch(/팔로우 완료/);
  });

  it("removes the prototype boundary and gives every remaining CTA canonical context", async () => {
    // Mutation caught: leaving a fake/prototype CTA reachable after the real intent flow ships.
    const [homeSource, detailSource] = await Promise.all([
      readFile(
        new URL("../../app/_components/home-page.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../../app/_components/opportunity-article-pages.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
    ]);
    expect(`${homeSource}\n${detailSource}`).not.toContain(
      "follow-cta-prototype",
    );
    expect(homeSource).toContain('href="/institutions"');
    expect(detailSource).toContain("<FollowCta");
    expect(detailSource).toContain("institutionId=");
    expect(detailSource).toContain("returnPath=");
  });

  it("keeps the server header session-independent and delegates private status to a small client control", async () => {
    // Mutation caught: importing cookies/DB into the public header or exposing My Preppy.
    const [headerSource, controlSource] = await Promise.all([
      readFile(
        new URL("../../app/_components/site-header.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../../app/_components/auth-control.tsx", import.meta.url),
        "utf8",
      ),
    ]);
    expect(headerSource).toContain("<AuthControl");
    expect(headerSource.match(/<AuthControl/g)).toHaveLength(1);
    expect(headerSource).not.toMatch(
      /cookies\(|next\/headers|drizzle|getCurrentUser/,
    );
    expect(controlSource).toContain('"use client"');
    expect(controlSource).toContain('fetch("/api/auth/session"');
    expect(controlSource).toContain('cache: "no-store"');
    expect(controlSource).toContain('fetcher("/api/auth/logout"');
    expect(controlSource).toContain('method: "POST"');
    expect(controlSource).toContain("window.location.replace(");
    expect(controlSource).toContain("new URL(path, window.location.origin)");
    expect(controlSource).toContain('href="/my-preppy"');
    expect(controlSource).toContain("내 프레피");
    expect(controlSource).toContain("카카오로 시작하기");
    expect(controlSource).not.toMatch(/userEmail|emailAddress|@example/);
  });

  it("renders optional onboarding fields, current server policy versions, and truthful next-step copy", () => {
    // Mutation caught: hard-coding required profile data, omitting manifest versions, or claiming interest activation.
    const markup = renderToStaticMarkup(
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
        pendingInstitution: {
          id: institutionId,
          slug: "seoul-international-school",
          displayName: "서울국제학교",
          category: "INTERNATIONAL_SCHOOL",
          regionCode: "KR-11",
        },
      }),
    );
    expect(markup).toContain('action="/api/me/onboarding/complete"');
    expect(markup).toContain('name="termsPolicyVersion" value="2026-08-23"');
    expect(markup).toContain('name="privacyPolicyVersion" value="2026-08-23"');
    expect(markup).toContain('name="email"');
    expect(markup).toContain('name="childBirthYear"');
    expect(markup).toContain('name="interestRegions"');
    expect(markup).toMatch(
      /name="interestRegions"[^>]*type="text"|type="text"[^>]*name="interestRegions"/,
    );
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain("선택");
    expect(markup).toContain("서울국제학교");
    expect(markup).toContain(
      "정상적으로 완료되면 이 기관도 함께 관심 등록됩니다",
    );
    expect(markup).toContain(
      "제출이 완료되기 전에는 관심기관 등록과 알림 설정이 확정되지 않습니다",
    );
    expect(markup).not.toMatch(/팔로우 완료|관심기관 등록이 완료/);
  });

  it("keeps expected onboarding failures in the controlled form with accessible Korean recovery guidance", async () => {
    // Mutation caught: native-navigation to raw JSON on 400/401/409 or omitting stale-policy recovery.
    const source = await readFile(
      new URL(
        "../../app/(public)/onboarding/onboarding-form.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    expect(source).toContain('"use client"');
    expect(source).toContain("onSubmit=");
    expect(source).toContain('accept: "application/json"');
    expect(source).toContain('fetch("/api/me/onboarding/complete"');
    expect(source).toContain("response.status === 409");
    expect(source).toContain("페이지를 새로고침한 뒤 다시 동의해 주세요");
    expect(source).toContain('role="status"');
    expect(source).toContain('aria-live="polite"');
  });

  it("marks onboarding and private route sources dynamic/no-store with exact routes and thin runtime wrappers", async () => {
    // Mutation caught: caching private state or moving DB/provider work into Next route modules.
    const files = await Promise.all(
      [
        "../../app/(public)/onboarding/page.tsx",
        "../../app/api/me/onboarding/route.ts",
        "../../app/api/me/onboarding/complete/route.ts",
        "../../app/api/auth/session/route.ts",
        "../../app/api/auth/logout/route.ts",
        "../../app/api/auth/follow-intent/route.ts",
        "../../app/auth/kakao/start/route.ts",
        "../../app/auth/kakao/callback/route.ts",
      ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
    );
    expect(files[0]).toContain('export const dynamic = "force-dynamic"');
    expect(files[0]).toMatch(/noStore\(\)/);
    expect(files[0].indexOf("try {")).toBeLessThan(
      files[0].indexOf("getAuthRuntime()"),
    );
    for (const source of files.slice(1)) {
      expect(source).toMatch(/create[A-Za-z]+Handler/);
      expect(source).toMatch(/get(?:Auth|Logout)Runtime/);
      expect(source).not.toMatch(
        /\.drizzle|\.transaction\(|createKakaoProvider\(/,
      );
    }
    expect(files[7]).toContain("createKakaoCallbackRuntimeRouteHandler");
    expect(files[4]).toContain("createLogoutRuntimeRouteHandler");
    expect(files[4]).toContain("getLogoutRuntime");
    expect(files[4]).not.toContain("getAuthRuntime");
  });
});
