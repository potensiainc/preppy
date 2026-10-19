import type { MetadataRoute } from "next";

import { getSeoAppBaseUrl } from "@/src/modules/public/seo";
import { getCachedPublicSitemapEntries } from "@/src/modules/public/sitemap-cache.server";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return [...(await getCachedPublicSitemapEntries(getSeoAppBaseUrl()))];
}
