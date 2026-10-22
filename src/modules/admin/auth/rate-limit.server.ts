import "server-only";

import { ProcessLocalRateLimiter } from "@/src/modules/auth/rate-limit.server";

const ADMIN_LOGIN_MAX_BUCKETS = 10_000;

// Process-local by design: correct only while web runs a single replica
// (pinned in .railway/railway.ts and tests/unit/wp15b-railway-production).
// Scaling web out needs a shared store behind the same interface.
export class ProcessLocalAdminLoginRateLimiter extends ProcessLocalRateLimiter {
  constructor(options: { maxBuckets?: number } = {}) {
    super({
      maxBuckets: options.maxBuckets ?? ADMIN_LOGIN_MAX_BUCKETS,
    });
  }
}

export const adminLoginRateLimiter = new ProcessLocalAdminLoginRateLimiter();
