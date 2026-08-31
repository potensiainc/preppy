import { readFile } from "node:fs/promises";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AuthControlPresentation } from "@/app/_components/auth-control";
import { MyPreppyView } from "@/app/(public)/my-preppy/my-preppy-view";
import {
  runMyPreppyUnfollow,
  UnfollowPresentation,
} from "@/app/(public)/my-preppy/unfollow-control";

const institutionId = "550e8400-e29b-41d4-a716-446655440000";

function emptyData() {
  return {
    activeFollowCount: 0,
    cards: [],
    readiness: {
      ready: false,
      label: "이메일 미등록" as const,
      analyticsState: "UNAVAILABLE" as const,
    },
  };
}

describe("WP-09 My Preppy UI and private route", () => {
  it("locks private dynamic/no-store/noindex/nofollow route metadata and auth routing", async () => {
    const source = await readFile(
      new URL("../../app/(public)/my-preppy/page.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain('export const dynamic = "force-dynamic"');
    expect(source).toContain('export const fetchCache = "force-no-store"');
    expect(source).toMatch(/noStore\(\)/);
    expect(source).toMatch(/robots:\s*\{\s*index:\s*false,\s*follow:\s*false/);
    expect(source).toContain('redirect("/auth/kakao/start")');
    expect(source).toContain('redirect("/onboarding")');
    expect(source).toMatch(/notFound\(\)|access === "DENIED"/);
    expect(source).not.toMatch(/searchParams|userId=/);
  });

  it("renders the no-follow state and accessible institution browse CTA", () => {
    const markup = renderToStaticMarkup(
      createElement(MyPreppyView, { data: emptyData() }),
    );
    expect(markup).toContain("아직 관심기관이 없어요");
    expect(markup).toContain("입학정보를 모아 보고 싶은 기관을 등록해 주세요.");
    expect(markup).toContain('href="/institutions"');
    expect(markup).toContain("기관 둘러보기");
  });

  it("shows an editorial card with canonical truth, freshness, change context, and no delivery claim", () => {
    const markup = renderToStaticMarkup(
      createElement(MyPreppyView, {
        data: {
          ...emptyData(),
          readiness: {
            ready: true,
            label: "이메일 업데이트 준비됨",
            analyticsState: "ENABLED",
          },
          cards: [
            {
              followId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
              followedAt: "2026-08-20T00:00:00.000Z",
              institution: {
                id: institutionId,
                slug: "native-kindergarten",
                name: "네이티브 영유",
                category: "ENGLISH_KINDERGARTEN",
                region: "SEOUL",
              },
              currentAdmissionsState: "OPEN",
              currentOpportunities: [
                {
                  id: "7ba7b810-9dad-11d1-80b4-00c04fd430c8",
                  slug: "native-kindergarten-open",
                  title: "2027 원아 모집",
                  state: "OPEN",
                  keyDate: "2026-09-01T00:00:00.000Z",
                  lastVerifiedAt: "2026-08-22T00:00:00.000Z",
                },
              ],
              upcomingOpportunities: [
                {
                  id: "8ba7b810-9dad-11d1-80b4-00c04fd430c8",
                  slug: "native-kindergarten-upcoming",
                  title: "입학 설명회",
                  state: "UPCOMING",
                  keyDate: "2026-10-01T00:00:00.000Z",
                  lastVerifiedAt: "2026-08-21T00:00:00.000Z",
                },
              ],
              recentChanges: [
                {
                  opportunityId: "7ba7b810-9dad-11d1-80b4-00c04fd430c8",
                  summary: "접수 마감일이 변경되었습니다.",
                  publishedAt: "2026-08-22T01:00:00.000Z",
                },
              ],
              lastVerifiedAt: "2026-08-22T00:00:00.000Z",
              readiness: {
                ready: true,
                label: "이메일 업데이트 준비됨",
                analyticsState: "ENABLED",
              },
            },
          ],
        },
      }),
    );
    expect(markup).toContain("네이티브 영유");
    expect(markup).toContain("영어유치원");
    expect(markup).toContain("서울");
    expect(markup).toContain("모집 중");
    expect(markup).toContain("2027 원아 모집");
    expect(markup).toContain("입학 설명회");
    expect(markup).toContain("접수 마감일이 변경됐어요.");
    expect(markup).toContain("내용 확인");
    expect(markup).toContain("이메일 업데이트 준비됨");
    expect(markup).not.toMatch(/실시간|발송 중|전송 완료/);
  });

  it("shows ACTIVE header access plus logout, exact anonymous copy, and never renders email", () => {
    const active = renderToStaticMarkup(
      createElement(AuthControlPresentation, {
        authenticated: true,
        onLogout: () => undefined,
      }),
    );
    expect(active).toContain('href="/my-preppy"');
    expect(active).toContain("내 프레피");
    expect(active).toContain("로그아웃");
    expect(active).not.toMatch(/@|email/i);

    const anonymous = renderToStaticMarkup(
      createElement(AuthControlPresentation, {
        authenticated: false,
        onLogout: () => undefined,
      }),
    );
    expect(anonymous).toContain("카카오로 로그인");
    expect(anonymous).toContain('href="/auth/kakao/start"');
  });

  it("requires confirmation and removes only after authoritative 204", async () => {
    const initial = renderToStaticMarkup(
      createElement(UnfollowPresentation, {
        state: "idle",
        institutionName: "네이티브 영유",
        onRequest: () => undefined,
        onConfirm: () => undefined,
        onCancel: () => undefined,
        onRetry: () => undefined,
      }),
    );
    expect(initial).toContain("관심기관 해제");
    const confirming = renderToStaticMarkup(
      createElement(UnfollowPresentation, {
        state: "confirming",
        institutionName: "네이티브 영유",
        onRequest: () => undefined,
        onConfirm: () => undefined,
        onCancel: () => undefined,
        onRetry: () => undefined,
      }),
    );
    expect(confirming).toContain("관심기관에서 해제할까요?");
    expect(confirming).toContain("관심기관 해제");
    expect(confirming).toContain("관심기관 유지");

    const committed = vi.fn();
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    await runMyPreppyUnfollow(institutionId, fetcher, {
      committed,
      reauthenticate: vi.fn(),
      reauthorize: vi.fn(),
      refresh: vi.fn(),
    });
    expect(fetcher).toHaveBeenCalledWith(`/api/me/follows/${institutionId}`, {
      method: "DELETE",
      credentials: "same-origin",
      cache: "no-store",
    });
    expect(committed).toHaveBeenCalledTimes(1);

    const failedCommit = vi.fn();
    await expect(
      runMyPreppyUnfollow(
        institutionId,
        vi.fn().mockResolvedValue(Response.json({}, { status: 503 })),
        {
          committed: failedCommit,
          reauthenticate: vi.fn(),
          reauthorize: vi.fn(),
          refresh: vi.fn(),
        },
      ),
    ).rejects.toThrow();
    expect(failedCommit).not.toHaveBeenCalled();
  });

  it("keeps the implementation free of client user identity and forbidden product writes", async () => {
    const sources = await Promise.all(
      [
        "../../src/modules/my-preppy/query.server.ts",
        "../../src/modules/my-preppy/runtime.server.ts",
        "../../app/(public)/my-preppy/page.tsx",
        "../../app/(public)/my-preppy/my-preppy-view.tsx",
        "../../app/(public)/my-preppy/unfollow-control.tsx",
      ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
    );
    const joined = sources.join("\n");
    expect(joined).not.toMatch(
      /searchParams.*userId|body.*userId|clientUserId/,
    );
    expect(joined).not.toMatch(
      /insert\(notifications|insert\(notificationDeliveries|insert\(outbox|insert\(alerts|insert\(subscribers|insert\(subscriptions/,
    );
  });
});
