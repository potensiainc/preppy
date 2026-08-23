import { OpportunityDetailView } from "@/app/_components/opportunity-article-pages";
import {
  getPublicExecutor,
  loadPublicPage,
} from "@/app/_lib/public-page.server";
import { getOpportunityBySlug } from "@/src/modules/public/opportunity-query.server";

export const dynamic = "force-dynamic";

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const opportunity = await loadPublicPage(() =>
    getOpportunityBySlug(getPublicExecutor(), slug),
  );

  return <OpportunityDetailView opportunity={opportunity} />;
}
