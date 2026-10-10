import type { Metadata } from "next";
import { OpportunitySection } from "@/app/_components/home-page";
import { PageContainer } from "@/app/_components/ui-primitives";
import { getPublicExecutor } from "@/app/_lib/public-page.server";
import { getHomeCurrentOpportunityCards } from "@/src/modules/public/institution-query.server";
import {
  buildSocialMetadata,
  getSeoAppBaseUrl,
} from "@/src/modules/public/seo";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  const appBaseUrl = getSeoAppBaseUrl();
  const title = "현재 모집·입학정보 | PREPPY";
  const description = "공식 안내에서 확인한 모집과 입학 일정을 모았어요.";
  return {
    title,
    description,
    alternates: { canonical: `${appBaseUrl}/opportunities` },
    ...buildSocialMetadata(appBaseUrl, "/opportunities", title, description),
  };
}

export default async function OpportunitiesPage() {
  const opportunities =
    await getHomeCurrentOpportunityCards(getPublicExecutor());
  return (
    <div className="home-page">
      <PageContainer>
        <OpportunitySection opportunities={opportunities} standalone />
      </PageContainer>
    </div>
  );
}
