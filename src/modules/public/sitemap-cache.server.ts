import "server-only";

import { getRuntimeDatabase } from "@/src/infrastructure/db/runtime.server";
import {
  listPublicSitemapEntries,
  type PublicSitemapEntryDTO,
} from "@/src/modules/public/sitemap-query.server";

// Building the sitemap evaluates every public detail page's indexability, which
// is too slow for crawler timeouts. Serve the last result and refresh it in the
// background once it is older than the TTL or a publication change invalidates it.
const SITEMAP_TTL_MS = 60 * 60 * 1000;

type CachedSitemap = {
  baseUrl: string;
  builtAt: number;
  entries: readonly PublicSitemapEntryDTO[];
};

let cached: CachedSitemap | undefined;
let pending: Promise<CachedSitemap> | undefined;
let generation = 0;

function rebuild(baseUrl: string): Promise<CachedSitemap> {
  if (pending) return pending;
  const startedGeneration = generation;
  pending = listPublicSitemapEntries(getRuntimeDatabase().executor, baseUrl)
    .then((entries) => {
      cached = {
        baseUrl,
        // A build that overlapped an invalidation may predate the change.
        builtAt: startedGeneration === generation ? Date.now() : 0,
        entries,
      };
      return cached;
    })
    .finally(() => {
      pending = undefined;
      if (startedGeneration !== generation) refreshInBackground(baseUrl);
    });
  return pending;
}

function refreshInBackground(baseUrl: string): void {
  rebuild(baseUrl).catch((error: unknown) => {
    console.error("Sitemap background refresh failed", error);
  });
}

export async function getCachedPublicSitemapEntries(
  baseUrl: string,
): Promise<readonly PublicSitemapEntryDTO[]> {
  const current = cached?.baseUrl === baseUrl ? cached : undefined;
  if (current === undefined) return (await rebuild(baseUrl)).entries;
  if (Date.now() - current.builtAt >= SITEMAP_TTL_MS) {
    refreshInBackground(baseUrl);
  }
  return current.entries;
}

/**
 * Marks the cached sitemap stale after a publication change and starts a
 * rebuild, so crawlers keep a fast response while the new truth is computed.
 */
export function invalidatePublicSitemapCache(): void {
  generation += 1;
  if (cached === undefined) return;
  cached = { ...cached, builtAt: 0 };
  refreshInBackground(cached.baseUrl);
}
