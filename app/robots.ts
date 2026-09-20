import type { MetadataRoute } from "next";

import { getSeoAppBaseUrl } from "@/src/modules/public/seo";

export const dynamic = "force-dynamic";

export default function robots(
  environment: Record<string, string | undefined> = process.env,
): MetadataRoute.Robots {
  if (environment.PREPPY_ENVIRONMENT === "STAGING") {
    return { rules: { userAgent: "*", disallow: "/" } };
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
