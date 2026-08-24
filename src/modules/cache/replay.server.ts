import "server-only";

export type CacheReplayConsumeResult =
  "ACCEPTED" | "REPLAY" | "CAPACITY_EXCEEDED";

export interface CacheReplayRegistry {
  consume(
    input: Readonly<{
      key: string;
      now: Date;
      expiresAt: Date;
    }>,
  ): CacheReplayConsumeResult;
}

export class BoundedCacheReplayRegistry implements CacheReplayRegistry {
  private readonly entries = new Map<string, number>();

  constructor(private readonly capacity = 10_000) {
    if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 10_000) {
      throw new RangeError(
        "Cache replay capacity must be between 1 and 10,000",
      );
    }
  }

  consume(
    input: Readonly<{ key: string; now: Date; expiresAt: Date }>,
  ): CacheReplayConsumeResult {
    const nowMs = input.now.getTime();
    const expiresAtMs = input.expiresAt.getTime();
    if (
      !Number.isFinite(nowMs) ||
      !Number.isFinite(expiresAtMs) ||
      expiresAtMs < nowMs
    ) {
      return "REPLAY";
    }
    for (const [key, expiry] of this.entries) {
      if (expiry <= nowMs) this.entries.delete(key);
    }
    if (this.entries.has(input.key)) return "REPLAY";
    if (this.entries.size >= this.capacity) return "CAPACITY_EXCEEDED";
    this.entries.set(input.key, expiresAtMs);
    return "ACCEPTED";
  }
}

export const cacheReplayRegistry = new BoundedCacheReplayRegistry();
