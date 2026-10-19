import type { MetadataRoute } from "next";

import { getRuntimeDatabase } from "@/src/infrastructure/db/runtime.server";
import { getSeoAppBaseUrl } from "@/src/modules/public/seo";
import {
  listPublicSitemapEntries,
  type PublicSitemapEntryDTO,
} from "@/src/modules/public/sitemap-query.server";

export const dynamic = "force-dynamic";

// Building the sitemap evaluates every public detail page's indexability, which
// is too slow for crawler timeouts. Serve the last result and refresh it in the
// background once it is older than the TTL.
const SITEMAP_TTL_MS = 60 * 60 * 1000;

type CachedSitemap = {
  baseUrl: string;
  builtAt: number;
  entries: readonly PublicSitemapEntryDTO[];
};

let cached: CachedSitemap | undefined;
let pending: Promise<CachedSitemap> | undefined;

function rebuild(baseUrl: string): Promise<CachedSitemap> {
  pending ??= listPublicSitemapEntries(getRuntimeDatabase().executor, baseUrl)
    .then((entries) => {
      cached = { baseUrl, builtAt: Date.now(), entries };
      return cached;
    })
    .finally(() => {
      pending = undefined;
    });
  return pending;
}

async function getSitemapEntries(
  baseUrl: string,
): Promise<readonly PublicSitemapEntryDTO[]> {
  const current = cached?.baseUrl === baseUrl ? cached : undefined;
  if (current === undefined) return (await rebuild(baseUrl)).entries;
  if (Date.now() - current.builtAt >= SITEMAP_TTL_MS) {
    rebuild(baseUrl).catch((error: unknown) => {
      console.error("Sitemap background refresh failed", error);
    });
  }
  return current.entries;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return [...(await getSitemapEntries(getSeoAppBaseUrl()))];
}
