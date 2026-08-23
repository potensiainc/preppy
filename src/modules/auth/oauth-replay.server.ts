import "server-only";

import { createHash } from "node:crypto";

export interface OAuthReplayStore {
  register(
    state: string,
    options: { expiresAtMs: number; nowMs: number },
  ): boolean;
  consume(state: string, options: { nowMs: number }): OAuthReplayConsumeResult;
}

export type OAuthReplayConsumeResult = "REGISTERED" | "CONSUMED" | "UNKNOWN";

type ReplayEntry = {
  expiresAtMs: number;
  status: "REGISTERED" | "CONSUMED";
};

export class ProcessLocalOAuthReplayStore implements OAuthReplayStore {
  private readonly entries = new Map<string, ReplayEntry>();

  constructor(private readonly options: { maxEntries: number }) {
    if (!Number.isInteger(options.maxEntries) || options.maxEntries <= 0) {
      throw new Error("OAuth replay store capacity is invalid");
    }
  }

  private key(state: string): string {
    return createHash("sha256").update(state, "utf8").digest("base64url");
  }

  private prune(nowMs: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAtMs <= nowMs) this.entries.delete(key);
    }
  }

  register(
    state: string,
    options: { expiresAtMs: number; nowMs: number },
  ): boolean {
    if (
      state.length === 0 ||
      !Number.isSafeInteger(options.nowMs) ||
      !Number.isSafeInteger(options.expiresAtMs) ||
      options.expiresAtMs <= options.nowMs
    ) {
      return false;
    }
    this.prune(options.nowMs);
    const key = this.key(state);
    if (this.entries.has(key) || this.entries.size >= this.options.maxEntries) {
      return false;
    }
    this.entries.set(key, {
      expiresAtMs: options.expiresAtMs,
      status: "REGISTERED",
    });
    return true;
  }

  consume(state: string, options: { nowMs: number }): OAuthReplayConsumeResult {
    if (state.length === 0 || !Number.isSafeInteger(options.nowMs))
      return "UNKNOWN";
    const key = this.key(state);
    const entry = this.entries.get(key);
    if (!entry) return "UNKNOWN";
    if (entry.expiresAtMs <= options.nowMs) {
      this.entries.delete(key);
      return "UNKNOWN";
    }
    if (entry.status === "CONSUMED") return "CONSUMED";
    entry.status = "CONSUMED";
    return "REGISTERED";
  }
}
