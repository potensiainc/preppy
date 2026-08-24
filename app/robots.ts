import type { MetadataRoute } from "next";

import { getSeoAppBaseUrl } from "@/src/modules/public/seo";

export default function robots(
  environment: Record<string, string | undefined> = process.env,
): MetadataRoute.Robots {
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
