import "server-only";
import { inArray } from "drizzle-orm";
import { sources } from "@/src/db/schema";
import type { TransactionExecutor } from "@/src/infrastructure/db/runtime.server";
import type { SessionPackage } from "./session-package";
import { reviewedSourceEligibility } from "./reviewed-source-policy";
/** Same predicate as capture; locks existing rows for both dry-run and apply.
 * Accepts reviewed DISCOVERED without activation; no source ownership/type changes or monitoring enablement. */
export async function planReviewedSources(
  executor: TransactionExecutor,
  data: SessionPackage,
) {
  const urls = [...new Set(data.sources.map((source) => source.url))];
  const existing = await executor.drizzle
    .select()
    .from(sources)
    .where(inArray(sources.canonicalUrl, urls))
    .for("update");
  const before = urls.map((url) => {
    const current = existing.find((source) => source.canonicalUrl === url);
    const reject = current ? reviewedSourceEligibility(current) : null;
    return {
      url,
      operation: reject
        ? "RECONCILIATION_REQUIRED"
        : current
          ? "USE_REVIEWED_SOURCE"
          : "CREATE_ACTIVE_SOURCE",
      current: current ?? null,
      reject,
    };
  });
  return {
    before,
    rejects: before
      .filter((row) => row.reject)
      .map((row) => ({
        code: row.reject!,
        sourceUrl: row.url,
        sourceId: row.current!.id,
        lifecycleStatus: row.current!.lifecycleStatus,
        sourceType: row.current!.sourceType,
        authorityLevel: row.current!.authorityLevel,
      })),
  };
}
