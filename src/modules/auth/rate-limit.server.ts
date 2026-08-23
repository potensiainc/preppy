import "server-only";

export type RateLimitRequest = {
  key: string;
  limit: number;
  windowMs: number;
  nowMs?: number;
};

export type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export interface RateLimiter {
  consume(request: RateLimitRequest): RateLimitDecision;
}

type Bucket = { count: number; resetAt: number };

export const DEFAULT_PROCESS_LOCAL_MAX_BUCKETS = 10_000;

/**
 * Per-process fixed-window protection only. It does not coordinate limits
 * across hosts, workers, restarts, or serverless instances.
 */
export class ProcessLocalRateLimiter implements RateLimiter {
  readonly enforcementScope = "process-local" as const;
  private readonly buckets = new Map<string, Bucket>();
  private readonly maxBuckets: number;

  constructor(options: { maxBuckets?: number } = {}) {
    this.maxBuckets = options.maxBuckets ?? DEFAULT_PROCESS_LOCAL_MAX_BUCKETS;
    if (!Number.isInteger(this.maxBuckets) || this.maxBuckets <= 0) {
      throw new Error("Rate limiter maximum bucket count is invalid");
    }
  }

  private pruneExpired(nowMs: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= nowMs) this.buckets.delete(key);
    }
  }

  private capacityDecision(nowMs: number): RateLimitDecision {
    let earliestResetAt = Number.POSITIVE_INFINITY;
    for (const bucket of this.buckets.values()) {
      earliestResetAt = Math.min(earliestResetAt, bucket.resetAt);
    }
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((earliestResetAt - nowMs) / 1_000),
      ),
    };
  }

  consume(request: RateLimitRequest): RateLimitDecision {
    if (
      request.key.length === 0 ||
      request.key.length > 256 ||
      !Number.isInteger(request.limit) ||
      request.limit <= 0 ||
      !Number.isInteger(request.windowMs) ||
      request.windowMs <= 0
    ) {
      throw new Error("Rate limit request is invalid");
    }

    const nowMs = request.nowMs ?? Date.now();
    if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
      throw new Error("Rate limit timestamp is invalid");
    }
    let previous = this.buckets.get(request.key);
    if (!previous && this.buckets.size >= this.maxBuckets) {
      this.pruneExpired(nowMs);
      previous = this.buckets.get(request.key);
      if (!previous && this.buckets.size >= this.maxBuckets) {
        return this.capacityDecision(nowMs);
      }
    }
    const bucket =
      previous && previous.resetAt > nowMs
        ? previous
        : { count: 0, resetAt: nowMs + request.windowMs };

    if (bucket.count >= request.limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((bucket.resetAt - nowMs) / 1_000),
        ),
      };
    }

    bucket.count += 1;
    this.buckets.set(request.key, bucket);
    return {
      allowed: true,
      remaining: request.limit - bucket.count,
      retryAfterSeconds: 0,
    };
  }
}
