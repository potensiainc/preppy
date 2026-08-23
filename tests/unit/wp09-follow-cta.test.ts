import { readFile } from "node:fs/promises";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  FollowCta,
  FollowCtaPresentation,
  loadFollowCtaState,
  runFollowCtaAction,
} from "@/app/_components/follow-cta";

const institutionId = "550e8400-e29b-41d4-a716-446655440000";

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

describe("WP-09 authoritative Follow CTA island", () => {
  it("starts neutral and loads private status with no-store same-origin credentials", async () => {
    // Mutation caught: hydrating a guessed auth/follow state or allowing shared/default cache behavior.
    const markup = renderToStaticMarkup(
      createElement(FollowCta, {
        institutionId,
        returnPath: "/institutions/seoul-international-school",
        context: "INSTITUTION",
      }),
    );
    expect(markup).toContain("관심기관 상태 확인 중");
    expect(markup).toContain('aria-live="polite"');
    expect(markup).not.toMatch(/업데이트 받는 중|등록되었습니다/);

    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({
        data: { authenticated: true, following: false },
      }),
    );
    await expect(loadFollowCtaState(institutionId, fetcher)).resolves.toBe(
      "available",
    );
    expect(fetcher).toHaveBeenCalledWith(
      `/api/me/follows/status?institutionId=${institutionId}`,
      { cache: "no-store", credentials: "same-origin" },
    );
  });

  it.each([
    [{ authenticated: false, following: false }, "anonymous"],
    [{ authenticated: true, following: false }, "available"],
    [{ authenticated: true, following: true }, "following"],
  ] as const)("maps authoritative status %# to %s", async (data, expected) => {
    // Mutation caught: conflating anonymous, active-unfollowed, and current followed states.
    await expect(
      loadFollowCtaState(
        institutionId,
        vi.fn().mockResolvedValue(jsonResponse({ data })),
      ),
    ).resolves.toBe(expected);
  });

  it("creates the protected intent before anonymous Kakao navigation", async () => {
    // Mutation caught: anonymous Follow mutation or navigating before protected intent persistence.
    const order: string[] = [];
    const fetcher = vi.fn().mockImplementation(async (url: string) => {
      order.push(`fetch:${url}`);
      return jsonResponse({ redirectTo: "/auth/kakao/start" });
    });
    const navigate = vi.fn().mockImplementation((path: string) => {
      order.push(`navigate:${path}`);
    });

    await expect(
      runFollowCtaAction({
        state: "anonymous",
        institutionId,
        returnPath: "/opportunities/2027-admissions",
        context: "OPPORTUNITY",
        opportunityId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
        fetcher,
        navigate,
        onCommitted: vi.fn(),
      }),
    ).resolves.toBe("anonymous");

    expect(order).toEqual([
      "fetch:/api/auth/follow-intent",
      "navigate:/auth/kakao/start",
    ]);
    expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toEqual({
      institutionId,
      returnPath: "/opportunities/2027-admissions",
      context: "OPPORTUNITY",
      opportunityId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    });
  });

  it("maps anonymous target-resolution 404 to unavailable without navigation", async () => {
    // Mutation caught: routing a terminal render-to-intent target race through generic retry.
    const navigate = vi.fn();
    const onCommitted = vi.fn();

    await expect(
      runFollowCtaAction({
        state: "anonymous",
        institutionId,
        returnPath: "/institutions/seoul-international-school",
        context: "INSTITUTION",
        fetcher: vi
          .fn()
          .mockResolvedValue(
            jsonResponse({ error: "관심기관을 확인할 수 없습니다." }, 404),
          ),
        navigate,
        onCommitted,
      }),
    ).resolves.toBe("unavailable");
    expect(navigate).not.toHaveBeenCalled();
    expect(onCommitted).not.toHaveBeenCalled();
  });

  it.each([
    [403, "요청을 확인할 수 없습니다."],
    [503, "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."],
  ])("keeps anonymous intent %s failures retryable", async (status, error) => {
    // Mutation caught: terminalizing Origin denial or transient infrastructure failure.
    const navigate = vi.fn();
    const onCommitted = vi.fn();

    await expect(
      runFollowCtaAction({
        state: "anonymous",
        institutionId,
        returnPath: "/institutions/seoul-international-school",
        context: "INSTITUTION",
        fetcher: vi.fn().mockResolvedValue(jsonResponse({ error }, status)),
        navigate,
        onCommitted,
      }),
    ).rejects.toThrow("Follow intent request failed");
    expect(navigate).not.toHaveBeenCalled();
    expect(onCommitted).not.toHaveBeenCalled();
  });

  it.each([
    [true, false],
    [false, false],
    [false, true],
  ])(
    "commits ACTIVE created=%s/reactivated=%s before continuing to My Preppy",
    async (created, reactivated) => {
      // Mutation caught: optimistic local completion, rejecting idempotent success, or wrong continuation.
      const order: string[] = [];
      const fetcher = vi.fn().mockImplementation(async (url: string) => {
        order.push(`fetch:${url}`);
        return jsonResponse({
          data: {
            followId: "7ba7b810-9dad-11d1-80b4-00c04fd430c8",
            institutionId,
            state: "ACTIVE",
            activatedAt: "2026-08-23T09:10:11.000Z",
            created,
            reactivated,
            activeFollowCount: 2,
          },
        });
      });

      await expect(
        runFollowCtaAction({
          state: "available",
          institutionId,
          returnPath: "/institutions/seoul-international-school",
          context: "INSTITUTION",
          fetcher,
          navigate: (path) => order.push(`navigate:${path}`),
          onCommitted: () => order.push("committed"),
        }),
      ).resolves.toBe("following");

      expect(order).toEqual([
        "fetch:/api/me/follows",
        "committed",
        "navigate:/my-preppy",
      ]);
      expect(fetcher).toHaveBeenCalledWith("/api/me/follows", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ institutionId }),
      });
    },
  );

  it("does not claim or navigate on a failed/malformed activation", async () => {
    // Mutation caught: fake local following state after a network or contract error.
    const onCommitted = vi.fn();
    const navigate = vi.fn();
    await expect(
      runFollowCtaAction({
        state: "available",
        institutionId,
        returnPath: "/institutions/seoul-international-school",
        context: "INSTITUTION",
        fetcher: vi
          .fn()
          .mockResolvedValue(
            jsonResponse({ error: { code: "FOLLOW_CONFLICT" } }, 409),
          ),
        navigate,
        onCommitted,
      }),
    ).rejects.toThrow();
    expect(onCommitted).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it.each([
    [403, "INSTITUTION_NOT_FOLLOWABLE"],
    [404, "INSTITUTION_NOT_FOUND"],
  ])(
    "maps terminal activation %s/%s to unavailable instead of retry",
    async (status, code) => {
      // Mutation caught: looping terminal Institution eligibility failures through generic retry/status.
      const onCommitted = vi.fn();
      const navigate = vi.fn();
      await expect(
        runFollowCtaAction({
          state: "available",
          institutionId,
          returnPath: "/institutions/seoul-international-school",
          context: "INSTITUTION",
          fetcher: vi
            .fn()
            .mockResolvedValue(jsonResponse({ error: { code } }, status)),
          navigate,
          onCommitted,
        }),
      ).resolves.toBe("unavailable");
      expect(onCommitted).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
    },
  );

  it("renders known public unavailability without fetching or offering retry", () => {
    // Mutation caught: rendering an enabled/loading CTA for a CLOSED or unpublished Institution projection.
    const markup = renderToStaticMarkup(
      createElement(FollowCta, {
        institutionId,
        returnPath: "/institutions/closed-school",
        context: "INSTITUTION",
        followable: false,
      } as never),
    );

    expect(markup).toContain("현재 업데이트를 신청할 수 없습니다");
    expect(markup).not.toContain("다시 시도");
    expect(markup).not.toContain("관심기관 상태 확인 중");
  });

  it("renders truthful anonymous, followed, and retryable error states", () => {
    // Mutation caught: followed-looking local toggle, missing My Preppy affordance, or inaccessible retry.
    const render = (
      state: "anonymous" | "following" | "error" | "unavailable",
    ) =>
      renderToStaticMarkup(
        createElement(FollowCtaPresentation, {
          state,
          label: "업데이트 받기",
          onAction: () => undefined,
          onRetry: () => undefined,
        }),
      );

    expect(render("anonymous")).toContain("카카오 로그인");
    const followed = render("following");
    expect(followed).toContain("업데이트 받는 중");
    expect(followed).toContain('href="/my-preppy"');
    const error = render("error");
    expect(error).toContain('role="alert"');
    expect(error).toContain("다시 시도");
    const unavailable = render("unavailable");
    expect(unavailable).toContain("현재 업데이트를 신청할 수 없습니다");
    expect(unavailable).not.toContain("다시 시도");
  });

  it("keeps personalized Follow state out of globally cacheable public DTOs and queries", async () => {
    // Mutation caught: poisoning public page cache keys/projections with per-user Follow state.
    const sources = await Promise.all(
      [
        "../../src/modules/public/dto.ts",
        "../../src/modules/public/home-query.server.ts",
        "../../src/modules/public/institution-query.server.ts",
        "../../src/modules/public/opportunity-query.server.ts",
        "../../src/modules/public/article-query.server.ts",
      ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
    );
    expect(sources.join("\n")).not.toMatch(/\bisFollowed\b|\bfollowing\b/);
  });
});
