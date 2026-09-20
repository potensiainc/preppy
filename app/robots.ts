import type { MetadataRoute } from "next";

import { isStagingEnvironment } from "@/src/config/deployment-environment";
import { getSeoAppBaseUrl } from "@/src/modules/public/seo";

export const dynamic = "force-dynamic";

export default function robots(
  environment: Record<string, string | undefined> = process.env,
): MetadataRoute.Robots {
  if (isStagingEnvironment(environment)) {
    // Crawlers must reach the page to read its X-Robots-Tag: noindex header.
    return { rules: { userAgent: "*", allow: "/" } };
  }
  const origin = getSeoAppBaseUrl(environment);
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/auth/", "/api/", "/onboarding", "/my-preppy"],
    },
    sitemap: `${origin}/sitemap.xml`,
  };
}
