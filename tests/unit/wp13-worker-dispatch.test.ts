import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { dispatchClaimedOutboxEvent } from "@/src/modules/worker/dispatcher.server";
import type { ClaimedOutboxEvent } from "@/src/modules/outbox/transitions.server";

function event(
  overrides: Partial<ClaimedOutboxEvent> = {},
): ClaimedOutboxEvent {
  const articleId = randomUUID();
  return {
    id: randomUUID(),
    eventType: "CACHE_REVALIDATION_REQUESTED",
    aggregateType: "ARTICLE",
    aggregateId: articleId,
    payload: {
      version: 1,
      articleId,
      reason: "ARTICLE_PUBLISHED",
      currentCanonicalPath: "/articles/cache",
      relatedInstitutionIds: [],
      relatedOpportunityIds: [],
    },
    attemptCount: 1,
    maxAttempts: 3,
    availableAt: new Date(),
    createdAt: new Date(),
    lockedAt: new Date(),
    lockedBy: "worker-cache",
    ...overrides,
  };
}

function transactionManager() {
  const raw = vi.fn(async () => [{ id: randomUUID() }]);
  return {
    raw,
    manager: {
      run: vi.fn(async (operation) =>
        operation({ scope: "transaction", drizzle: {} as never, raw }),
      ),
    },
  };
}

describe("WP-13 Worker cache dispatch", () => {
  it("calls only the cache processor and completes a valid event", async () => {
    const tx = transactionManager();
    const cacheRevalidator = {
      revalidate: vi.fn(async () => ({ kind: "SUCCEEDED" as const })),
    };
    const result = await dispatchClaimedOutboxEvent(
      event(),
      { workerId: "worker-cache", now: new Date("2026-08-25T12:00:00.000Z") },
      {
        transactionManager: tx.manager as never,
        sender: { provider: "FAKE", send: vi.fn() },
        tracker: { track: vi.fn() },
        emailSendEnabled: false,
        cacheRevalidator,
      },
    );
    expect(result).toEqual({ kind: "PROCESSED" });
    expect(cacheRevalidator.revalidate).toHaveBeenCalledTimes(1);
    expect(tx.manager.run).toHaveBeenCalledTimes(1);
  });

  it("fails malformed aggregate identity without calling the cache client", async () => {
    const tx = transactionManager();
    const cacheRevalidator = { revalidate: vi.fn() };
    const result = await dispatchClaimedOutboxEvent(
      event({ aggregateId: randomUUID() }),
      { workerId: "worker-cache", now: new Date("2026-08-25T12:00:00.000Z") },
      {
        transactionManager: tx.manager as never,
        sender: { provider: "FAKE", send: vi.fn() },
        tracker: { track: vi.fn() },
        emailSendEnabled: false,
        cacheRevalidator,
      },
    );
    expect(result).toEqual({ kind: "INVALID_OUTBOX_PAYLOAD" });
    expect(cacheRevalidator.revalidate).not.toHaveBeenCalled();
  });
});
