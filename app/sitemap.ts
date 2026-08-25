import type { MetadataRoute } from "next";

import { getRuntimeDatabase } from "@/src/infrastructure/db/runtime.server";
import { getSeoAppBaseUrl } from "@/src/modules/public/seo";
import { listPublicSitemapEntries } from "@/src/modules/public/sitemap-query.server";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return [
    ...(await listPublicSitemapEntries(
      getRuntimeDatabase().executor,
      getSeoAppBaseUrl(),
    )),
  ];
}
