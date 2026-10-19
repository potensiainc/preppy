import { revalidatePath, revalidateTag } from "next/cache";

import { handleCacheRevalidationRequest } from "@/src/modules/cache/revalidation-handler.server";
import { invalidatePublicSitemapCache } from "@/src/modules/public/sitemap-cache.server";

export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return handleCacheRevalidationRequest(request, {
    revalidatePath: (path) => {
      revalidatePath(path);
      // The sitemap keeps its own in-memory cache that Next does not manage.
      if (path === "/sitemap.xml") invalidatePublicSitemapCache();
    },
    revalidateTag: (tag, profile) => revalidateTag(tag, profile),
  });
}
