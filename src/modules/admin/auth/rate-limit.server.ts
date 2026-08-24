import "server-only";

import { ProcessLocalRateLimiter } from "@/src/modules/auth/rate-limit.server";

const ADMIN_LOGIN_MAX_BUCKETS = 10_000;

export class ProcessLocalAdminLoginRateLimiter extends ProcessLocalRateLimiter {
  constructor(options: { maxBuckets?: number } = {}) {
    super({
      maxBuckets: options.maxBuckets ?? ADMIN_LOGIN_MAX_BUCKETS,
    });
  }
}

export const adminLoginRateLimiter = new ProcessLocalAdminLoginRateLimiter();
