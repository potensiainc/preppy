import type { Metadata } from "next";
import { cache } from "react";

import { InstitutionDetailView } from "@/app/_components/institution-pages";
import {
  getPublicExecutor,
  loadPublicPage,
} from "@/app/_lib/public-page.server";
import { getInstitutionBySlug } from "@/src/modules/public/institution-query.server";
import {
  buildInstitutionMetadata,
  getSeoAppBaseUrl,
} from "@/src/modules/public/seo";

export const dynamic = "force-dynamic";

const loadInstitution = cache(async (slug: string) =>
  await loadPublicPage(() =>
    getInstitutionBySlug(getPublicExecutor(), slug),
  ),
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return buildInstitutionMetadata(
    await loadInstitution(slug),
    getSeoAppBaseUrl(),
  );
}

export default async function InstitutionDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await loadInstitution(slug);

  return <InstitutionDetailView data={data} />;
}
