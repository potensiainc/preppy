import type { Metadata } from "next";
import { cache } from "react";

import { OpportunityDetailView } from "@/app/_components/opportunity-article-pages";
import {
  getPublicExecutor,
  loadPublicPage,
} from "@/app/_lib/public-page.server";
import { getOpportunityBySlug } from "@/src/modules/public/opportunity-query.server";
import {
  buildOpportunityMetadata,
  getSeoAppBaseUrl,
} from "@/src/modules/public/seo";

export const dynamic = "force-dynamic";

const loadOpportunity = cache(async (slug: string) =>
  await loadPublicPage(() =>
    getOpportunityBySlug(getPublicExecutor(), slug),
  ),
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return buildOpportunityMetadata(
    await loadOpportunity(slug),
    getSeoAppBaseUrl(),
  );
}

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const opportunity = await loadOpportunity(slug);

  return <OpportunityDetailView opportunity={opportunity} />;
}
