import { revalidatePath, revalidateTag } from "next/cache";

import { handleCacheRevalidationRequest } from "@/src/modules/cache/revalidation-handler.server";

export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return handleCacheRevalidationRequest(request, {
    revalidatePath,
    revalidateTag: (tag, profile) => revalidateTag(tag, profile),
  });
}
