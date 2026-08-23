import { describe, expect, it } from "vitest";

import { ProcessLocalOAuthReplayStore } from "@/src/modules/auth/oauth-replay.server";

describe("WP-08 process-local OAuth replay store", () => {
  it("registers only a hash and atomically consumes a live state once", () => {
    // Mutation caught: storing raw state or allowing a second callback to consume it.
    const store = new ProcessLocalOAuthReplayStore({ maxEntries: 4 });
    const state = "browser-secret-oauth-state";

    expect(store.register(state, { expiresAtMs: 11_000, nowMs: 1_000 })).toBe(
      true,
    );
    expect(JSON.stringify(store)).not.toContain(state);
    expect(store.consume(state, { nowMs: 2_000 })).toBe("REGISTERED");
    expect(store.consume(state, { nowMs: 2_000 })).toBe("CONSUMED");
  });

  it("rejects expired state and reclaims expired capacity without evicting live entries", () => {
    // Mutation caught: accepting expired state or evicting a live state to admit attacker-controlled cardinality.
    const store = new ProcessLocalOAuthReplayStore({ maxEntries: 2 });
    expect(
      store.register("state-a", { expiresAtMs: 2_000, nowMs: 1_000 }),
    ).toBe(true);
    expect(
      store.register("state-b", { expiresAtMs: 5_000, nowMs: 1_000 }),
    ).toBe(true);
    expect(
      store.register("state-c", { expiresAtMs: 5_000, nowMs: 1_500 }),
    ).toBe(false);
    expect(store.consume("state-a", { nowMs: 2_000 })).toBe("UNKNOWN");
    expect(
      store.register("state-c", { expiresAtMs: 5_000, nowMs: 2_000 }),
    ).toBe(true);
    expect(store.consume("state-b", { nowMs: 2_001 })).toBe("REGISTERED");
    expect(store.consume("state-c", { nowMs: 2_001 })).toBe("REGISTERED");
  });

  it("reports an unregistered state as unknown for a valid callback handled by another runtime", () => {
    // Mutation caught: making callback correctness depend on start and callback sharing a process-local store.
    const callbackRuntimeStore = new ProcessLocalOAuthReplayStore({
      maxEntries: 4,
    });

    expect(
      callbackRuntimeStore.consume("state-issued-elsewhere", { nowMs: 2_000 }),
    ).toBe("UNKNOWN");
  });
});
