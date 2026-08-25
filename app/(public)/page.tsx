import type { Metadata } from "next";

import { HomePageView } from "@/app/_components/home-page";
import { PageAnalytics } from "@/app/_components/page-analytics";
import { getPublicExecutor } from "@/app/_lib/public-page.server";
import { getHomePage } from "@/src/modules/public/home-query.server";
import { buildHomeMetadata, getSeoAppBaseUrl } from "@/src/modules/public/seo";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return buildHomeMetadata(getSeoAppBaseUrl());
}

export default async function Home() {
  const data = await getHomePage(getPublicExecutor());

  return (
    <>
      <PageAnalytics
        events={[{ name: "home_view", properties: { landingPage: "HOME" } }]}
        navigationKey="HOME"
      />
      <HomePageView data={data} />
    </>
  );
}
