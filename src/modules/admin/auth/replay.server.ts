import "server-only";

import { createHash } from "node:crypto";

export type AdminFlowReplayConsumeResult =
  "REGISTERED" | "CONSUMED" | "UNKNOWN";

export interface AdminFlowReplayStore {
  register(
    flowId: string,
    options: { expiresAtMs: number; nowMs: number },
  ): boolean;
  consume(
    flowId: string,
    options: { nowMs: number },
  ): AdminFlowReplayConsumeResult;
}

type ReplayEntry = {
  expiresAtMs: number;
  status: "REGISTERED" | "CONSUMED";
};

export class ProcessLocalAdminFlowReplayStore implements AdminFlowReplayStore {
  readonly enforcementScope = "process-local" as const;
  private readonly entries = new Map<string, ReplayEntry>();
  private readonly maxEntries: number;

  constructor(options: { maxEntries: number }) {
    if (!Number.isInteger(options.maxEntries) || options.maxEntries <= 0) {
      throw new Error("Admin flow replay capacity is invalid");
    }
    this.maxEntries = options.maxEntries;
  }

  private key(flowId: string): string {
    return createHash("sha256").update(flowId, "utf8").digest("base64url");
  }

  private prune(nowMs: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAtMs <= nowMs) this.entries.delete(key);
    }
  }

  register(
    flowId: string,
    options: { expiresAtMs: number; nowMs: number },
  ): boolean {
    if (
      !/^[A-Za-z0-9_-]{43}$/.test(flowId) ||
      !Number.isSafeInteger(options.nowMs) ||
      options.nowMs < 0 ||
      !Number.isSafeInteger(options.expiresAtMs) ||
      options.expiresAtMs <= options.nowMs
    ) {
      return false;
    }

    this.prune(options.nowMs);
    const key = this.key(flowId);
    if (this.entries.has(key) || this.entries.size >= this.maxEntries) {
      return false;
    }
    this.entries.set(key, {
      expiresAtMs: options.expiresAtMs,
      status: "REGISTERED",
    });
    return true;
  }

  consume(
    flowId: string,
    options: { nowMs: number },
  ): AdminFlowReplayConsumeResult {
    if (
      !/^[A-Za-z0-9_-]{43}$/.test(flowId) ||
      !Number.isSafeInteger(options.nowMs) ||
      options.nowMs < 0
    ) {
      return "UNKNOWN";
    }

    this.prune(options.nowMs);
    const entry = this.entries.get(this.key(flowId));
    if (!entry) return "UNKNOWN";
    if (entry.status === "CONSUMED") return "CONSUMED";
    entry.status = "CONSUMED";
    return "REGISTERED";
  }
}

export const adminFlowReplayStore = new ProcessLocalAdminFlowReplayStore({
  maxEntries: 10_000,
});
