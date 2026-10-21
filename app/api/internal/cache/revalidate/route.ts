import { revalidatePath, revalidateTag } from "next/cache";

import { getSideEffectEnv } from "@/src/config/runtime-env";
import { handleCacheRevalidationRequest } from "@/src/modules/cache/revalidation-handler.server";

export const dynamic = "force-dynamic";

function cacheRevalidationEnabled(): boolean {
  try {
    return getSideEffectEnv().CACHE_REVALIDATION_ENABLED;
  } catch {
    return false;
  }
}

// The receiver follows the same switch as the worker that sends requests, so
// enabling cache revalidation is one decision applied to web and worker.
export function POST(request: Request): Promise<Response> {
  if (!cacheRevalidationEnabled()) {
    return Promise.resolve(
      Response.json(
        { error: { code: "CACHE_REVALIDATION_DISABLED" } },
        { status: 503, headers: { "cache-control": "private, no-store" } },
      ),
    );
  }
  return handleCacheRevalidationRequest(request, {
    revalidatePath,
    revalidateTag: (tag, profile) => revalidateTag(tag, profile),
  });
}
