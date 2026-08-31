import { readFile } from "node:fs/promises";

import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NotFoundError } from "@/src/application/errors";
import type {
  ArticleCardDTO,
  InstitutionCardDTO,
  OpportunityCardDTO,
} from "@/src/modules/public/dto";

import { FollowCta } from "@/app/_components/follow-cta";
import {
  ArticleCard,
  InstitutionCard,
  OpportunityCard,
  TrustSource,
} from "@/app/_components/public-cards";
import { loadPublicPage } from "@/app/_lib/public-page.server";
import {
  articleTypeLabel,
  categoryLabel,
  factLabel,
  formatPublicDate,
  opportunityKindLabel,
  opportunityStateLabel,
  safeExternalHref,
} from "@/app/_lib/presentation";
import GlobalError from "@/app/error";

const institution: InstitutionCardDTO = {
  id: "institution-1",
  slug: "seoul-international-school",
  name: "Seoul International School",
  category: "INTERNATIONAL_SCHOOL",
  region: "서울",
  followable: true,
  currentAdmissionsState: "OPEN",
  currentOpportunity: {
    id: "opportunity-1",
    slug: "2027-admissions",
    title: "2027학년도 입학 전형",
    kind: "RECRUITMENT",
    state: "OPEN",
    keyDate: "2026-09-01T00:00:00.000Z",
  },
  lastVerifiedAt: "2026-08-23T03:30:00.000Z",
};

const opportunity: OpportunityCardDTO = {
  id: "opportunity-1",
  slug: "2027-admissions",
  title: "2027학년도 입학 전형",
  kind: "RECRUITMENT",
  businessState: "OPEN",
  keyDate: "2026-09-01T00:00:00.000Z",
  institution: {
    id: "institution-1",
    slug: "seoul-international-school",
    name: "Seoul International School",
    category: "INTERNATIONAL_SCHOOL",
    region: "서울",
    followable: true,
  },
  lastVerifiedAt: "2026-08-23T03:30:00.000Z",
  indexability: "INDEX",
};

const article: ArticleCardDTO = {
  id: "article-1",
  slug: "school-visit-guide",
  title: "국제학교 방문 전 확인할 점",
  excerpt: "방문 전 확인할 핵심 정보를 정리했습니다.",
  articleType: "GUIDE",
  category: "INTERNATIONAL_SCHOOL",
  publishedAt: "2026-08-23T03:30:00.000Z",
  featuredImageUrl: null,
  featuredImageAlt: null,
  indexability: "NOINDEX",
};

describe("WP-07 public UI foundation", () => {
  it("maps canonical public vocabulary to clear Korean labels and Seoul dates", () => {
    // Mutation caught: showing database enum values or dates in a non-public format.
    expect(categoryLabel("INTERNATIONAL_SCHOOL")).toBe("국제학교");
    expect(opportunityKindLabel("RECRUITMENT")).toBe("모집");
    expect(opportunityStateLabel("OPEN")).toBe("모집 중");
    expect(factLabel("TARGET_AGE_GRADE")).toBe("대상 연령과 학년");
    expect(articleTypeLabel("GUIDE")).toBe("가이드");
    expect(formatPublicDate("2026-08-23T03:30:00.000Z")).toBe(
      "2026년 8월 23일",
    );
  });

  it("preserves offset-less legacy calendar dates while converting offset-bearing instants to Seoul", () => {
    // Mutation caught: interpreting a canonical local legacy date as a server-timezone instant.
    expect(formatPublicDate("2026-08-31T20:00:00")).toBe("2026년 8월 31일");
    expect(formatPublicDate("2026-08-31")).toBe("2026년 8월 31일");
    expect(formatPublicDate("2026-08-31T20:00:00+09:00")).toBe(
      "2026년 8월 31일",
    );
    expect(formatPublicDate("2026-08-31T20:00:00Z")).toBe("2026년 9월 1일");
  });

  it("renders cards as canonical semantic links and keeps official sources safe", () => {
    // Mutation caught: cards losing their canonical routes or an external source opening unsafely.
    const markup = renderToStaticMarkup(
      createElement(
        Fragment,
        null,
        createElement(InstitutionCard, { institution }),
        createElement(OpportunityCard, { opportunity }),
        createElement(ArticleCard, { article }),
        createElement(TrustSource, {
          source: {
            name: "학교 공식 입학처",
            url: "https://admissions.example.test/guide",
            authorityLevel: "PRIMARY",
          },
        }),
      ),
    );

    expect(markup).toContain('href="/institutions/seoul-international-school"');
    expect(markup).toContain('href="/opportunities/2027-admissions"');
    expect(markup).toContain('href="/articles/school-visit-guide"');
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noopener noreferrer"');
    expect(markup).toContain("모집 중");
    expect(markup).toContain("학교 공식 입학처");
  });

  it("allows only absolute HTTP(S) official source destinations", () => {
    // Mutation caught: treating a stored non-web URL as a trusted official destination.
    expect(safeExternalHref("https://admissions.example.test/guide")).toBe(
      "https://admissions.example.test/guide",
    );
    expect(safeExternalHref("http://admissions.example.test/guide")).toBe(
      "http://admissions.example.test/guide",
    );
    for (const unsafeUrl of [
      "data:text/html,unsafe",
      "javascript:alert(1)",
      "mailto:admissions@example.test",
      "/relative-guide",
      "https://",
    ]) {
      expect(safeExternalHref(unsafeUrl)).toBeNull();
    }

    const markup = renderToStaticMarkup(
      createElement(
        Fragment,
        null,
        createElement(TrustSource, {
          source: {
            name: "안전한 공식 출처",
            url: "https://admissions.example.test/guide",
            authorityLevel: "PRIMARY",
          },
        }),
        createElement(TrustSource, {
          source: {
            name: "검증할 수 없는 출처",
            url: "data:text/html,unsafe",
            authorityLevel: "PRIMARY",
          },
        }),
      ),
    );

    expect(markup).toContain('href="https://admissions.example.test/guide"');
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noopener noreferrer"');
    expect(markup).toContain("검증할 수 없는 출처");
    expect(markup).not.toContain('href="data:text/html,unsafe"');
  });

  it("keeps the Follow island neutral until authoritative private status resolves", () => {
    // Mutation caught: dropping the canonical target or hydrating a guessed completion/auth state.
    const markup = renderToStaticMarkup(
      createElement(FollowCta, {
        institutionId: "550e8400-e29b-41d4-a716-446655440000",
        context: "INSTITUTION",
        returnPath: "/institutions/seoul-international-school",
      }),
    );

    expect(markup).toContain("관심기관 상태 확인 중");
    expect(markup).toContain("관심기관 등록 여부를 확인하고 있어요.");
    expect(markup).toContain("550e8400-e29b-41d4-a716-446655440000");
    expect(markup).not.toMatch(/팔로우 완료|등록되었습니다/);
  });

  it("persists intent before navigating to Kakao auth and reports errors locally", async () => {
    // Mutation caught: navigating before intent persistence or omitting safe failure feedback.
    const source = await readFile(
      new URL("../../app/_components/follow-cta.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain('fetcher("/api/auth/follow-intent"');
    expect(source).toContain("window.location.assign(path)");
    expect(source).toContain('role="alert"');
  });

  it("limits Follow client imports to React and public navigation", async () => {
    // Mutation caught: adding any server, data, REST, or application dependency to the interactive client island.
    const source = await readFile(
      new URL("../../app/_components/follow-cta.tsx", import.meta.url),
      "utf8",
    );
    const imports = Array.from(
      source.matchAll(/import(?:\s+type)?[\s\S]*?from\s+["']([^"']+)["'];?/g),
      (match) => match[1],
    );

    expect(source).toContain('"use client"');
    expect(
      imports.filter(
        (specifier) => specifier !== "react" && specifier !== "next/link",
      ),
    ).toEqual([]);
  });

  it("keeps the segment error surface inside the document supplied by RootLayout", () => {
    // Mutation caught: returning a second document or main landmark from app/error.tsx.
    const markup = renderToStaticMarkup(
      createElement(GlobalError, {
        error: new Error("safe failure"),
        reset: () => {},
      }),
    );

    expect(markup).toContain('role="alert"');
    expect(markup).not.toContain("<html");
    expect(markup).not.toContain("<body");
    expect(markup).not.toContain("<main");
  });

  it("turns only canonical not-found errors into Next's 404 control-flow digest", async () => {
    // Mutation caught: leaking a missing public record as a server error or swallowing unexpected failures.
    await expect(
      loadPublicPage(async () => {
        throw new NotFoundError();
      }),
    ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });

    await expect(
      loadPublicPage(async () => {
        throw new Error("database connection failed");
      }),
    ).rejects.toThrow("database connection failed");
  });
});
