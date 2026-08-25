import { describe, expect, it, vi } from "vitest";

import { Ga4ServerAnalyticsTracker } from "@/src/analytics/ga4-server.server";

const ARTICLE_ID = "00000000-0000-4000-8000-000000000001";

describe("WP-14 server GA4 transport", () => {
  it("posts one validated minimal Measurement Protocol request", async () => {
    const fetcher = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        void input;
        void init;
        return new Response(null, { status: 204 });
      },
    );
    const tracker = new Ga4ServerAnalyticsTracker({
      measurementId: "G-ABC12345",
      apiSecret: "private-secret",
      fetcher,
      randomId: () => "00000000-0000-4000-8000-000000000099",
    });

    await tracker.track("article_view", { articleId: ARTICLE_ID });

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://www.google-analytics.com/mp/collect?measurement_id=G-ABC12345&api_secret=private-secret",
    );
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      client_id: "00000000-0000-4000-8000-000000000099",
      events: [
        {
          name: "article_view",
          params: { article_id: ARTICLE_ID, engagement_time_msec: 1 },
        },
      ],
    });
    expect(String(init?.body)).not.toMatch(/user_id|user_data|api_secret/i);
  });

  it("swallows network and non-2xx failures with bounded safe logging and no retry", async () => {
    const warnings: unknown[][] = [];
    const fetcher = vi
      .fn<
        (input: string | URL | Request, init?: RequestInit) => Promise<Response>
      >()
      .mockRejectedValueOnce(new Error("payload with person@example.com"))
      .mockResolvedValueOnce(new Response(null, { status: 500 }));
    const tracker = new Ga4ServerAnalyticsTracker({
      measurementId: "G-ABC12345",
      apiSecret: "private-secret",
      fetcher,
      warn: (...values) => warnings.push(values),
    });

    await expect(
      tracker.track("article_view", { articleId: ARTICLE_ID }),
    ).resolves.toBeUndefined();
    await expect(
      tracker.track("article_view", { articleId: ARTICLE_ID }),
    ).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(warnings)).not.toMatch(
      /@|private-secret|article_id/i,
    );
  });

  it("aborts a stalled request within the configured short timeout", async () => {
    const fetcher = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          );
        }),
    );
    const tracker = new Ga4ServerAnalyticsTracker({
      measurementId: "G-ABC12345",
      apiSecret: "private-secret",
      fetcher,
      timeoutMs: 5,
    });
    await expect(
      tracker.track("article_view", { articleId: ARTICLE_ID }),
    ).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid payloads before transport", () => {
    const fetcher = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        void input;
        void init;
        return new Response(null, { status: 204 });
      },
    );
    const tracker = new Ga4ServerAnalyticsTracker({
      measurementId: "G-ABC12345",
      apiSecret: "private-secret",
      fetcher,
    });
    expect(() =>
      (tracker.track as (name: string, payload: unknown) => unknown)(
        "article_view",
        { articleId: "legacy-guide-1", email: "person@example.com" },
      ),
    ).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
