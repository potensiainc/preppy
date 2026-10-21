import "server-only";

import { sql } from "drizzle-orm";

import type { DatabaseExecutor } from "@/src/infrastructure/db/runtime.server";

const READINESS_CACHE_MS = 5 * 60_000;

let cached: { ready: boolean; checkedAt: number } | undefined;

// Account deletion depends on migration 0017. The feature flag alone must not
// expose it on a database where that migration has not been applied.
export async function isAccountDeletionSchemaReady(
  executor: Pick<DatabaseExecutor, "raw">,
  now: number = Date.now(),
): Promise<boolean> {
  if (cached && now - cached.checkedAt < READINESS_CACHE_MS) {
    return cached.ready;
  }
  try {
    const [row] = (await executor.raw(sql`
      select
        to_regclass('public.account_deletion_jobs') is not null
        and to_regclass('public.kakao_unlink_inbox') is not null
        and exists (
          select 1 from pg_constraint
          where conrelid = 'public.users'::regclass
            and conname = 'users_status_check'
            and pg_get_constraintdef(oid) like '%DELETION_PENDING%'
        )
        and exists (
          select 1 from pg_trigger
          where tgrelid = 'public.auth_identities'::regclass
            and tgname = 'block_deleting_kakao_identity_before_insert'
            and tgenabled = 'O'
            and not tgisinternal
        ) as ready
    `)) as unknown as Array<{ ready: boolean }>;
    const ready = row?.ready === true;
    cached = { ready, checkedAt: now };
    return ready;
  } catch {
    // Fail closed and re-check on the next request.
    return false;
  }
}

export function resetAccountDeletionReadinessCache(): void {
  cached = undefined;
}
