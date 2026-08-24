import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { HttpCacheRevalidationClient } from "@/src/modules/cache/revalidation-client.server";

const secret = "cache-secret-with-at-least-32-bytes!";
const payload = {
  version: 1 as const,
  articleId: randomUUID(),
  reason: "ARTICLE_PUBLISHED" as const,
  currentCanonicalPath: "/articles/cache-client" as const,
  relatedInstitutionIds: [],
  relatedOpportunityIds: [],
};

describe("WP-13 cache revalidation HTTP client", () => {
  it("posts exact signed JSON to the fixed endpoint with redirect disabled", async () => {
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void input;
        void init;
        return new Response("{}", { status: 200 });
      },
    );
    const client = new HttpCacheRevalidationClient({
      appBaseUrl: "https://preppy.example",
      secret,
      fetchImpl,
      now: () => new Date("2026-08-25T12:00:00.000Z"),
    });
    await expect(
      client.revalidate({ eventId: randomUUID(), payload }),
    ).resolves.toEqual({ kind: "SUCCEEDED" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(init).toBeDefined();
    if (!init) throw new Error("Expected fetch init");
    expect(url).toBe("https://preppy.example/api/internal/cache/revalidate");
    expect(init).toMatchObject({ method: "POST", redirect: "error" });
    expect(new TextDecoder().decode(init.body as Uint8Array)).toBe(
      JSON.stringify(payload),
    );
    expect(
      (init.headers as Record<string, string>)[
        "x-preppy-revalidation-signature"
      ],
    ).toMatch(/^v1=[a-f0-9]{64}$/);
    expect(JSON.stringify([url, init])).not.toContain(secret);
  });

  it.each([
    [408, "RETRYABLE_FAILURE"],
    [425, "RETRYABLE_FAILURE"],
    [429, "RETRYABLE_FAILURE"],
    [503, "RETRYABLE_FAILURE"],
    [400, "TERMINAL_FAILURE"],
  ] as const)("classifies HTTP %s as %s", async (status, kind) => {
    const client = new HttpCacheRevalidationClient({
      appBaseUrl: "https://preppy.example",
      secret,
      fetchImpl: async () => new Response("rejected", { status }),
      now: () => new Date("2026-08-25T12:00:00.000Z"),
    });
    await expect(
      client.revalidate({ eventId: randomUUID(), payload }),
    ).resolves.toMatchObject({ kind });
  });

  it("keeps the five-second abort active through bounded response-body reading", async () => {
    vi.useFakeTimers();
    let capturedSignal: AbortSignal | undefined;
    let streamController:
      ReadableStreamDefaultController<Uint8Array> | undefined;
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedSignal = init?.signal ?? undefined;
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              streamController = controller;
              capturedSignal?.addEventListener("abort", () => {
                controller.error(new DOMException("Aborted", "AbortError"));
              });
            },
          }),
          { status: 200 },
        );
      },
    );
    try {
      const client = new HttpCacheRevalidationClient({
        appBaseUrl: "https://preppy.example",
        secret,
        fetchImpl,
      });
      const pending = client.revalidate({ eventId: randomUUID(), payload });
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(5_001);
      const abortedAfterBudget = capturedSignal?.aborted ?? false;
      if (!abortedAfterBudget) streamController?.close();
      const result = await pending;
      expect(abortedAfterBudget).toBe(true);
      expect(result).toEqual({
        kind: "RETRYABLE_FAILURE",
        errorCode: "CACHE_REVALIDATION_RETRYABLE",
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
