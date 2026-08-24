import type { Metadata } from "next";

import { InstitutionListView } from "@/app/_components/institution-pages";
import {
  toInstitutionListInput,
  type NextSearchParams,
} from "@/app/_lib/institution-search";
import { getPublicExecutor } from "@/app/_lib/public-page.server";
import { listInstitutions } from "@/src/modules/public/institution-query.server";
import {
  buildInstitutionListMetadata,
  getSeoAppBaseUrl,
} from "@/src/modules/public/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<NextSearchParams>;
}): Promise<Metadata> {
  const raw = await searchParams;
  return buildInstitutionListMetadata(
    getSeoAppBaseUrl(),
    Object.keys(raw).length > 0,
  );
}

export default async function InstitutionsPage({
  searchParams,
}: {
  searchParams: Promise<NextSearchParams>;
}) {
  const input = toInstitutionListInput(await searchParams);
  const data = await listInstitutions(getPublicExecutor(), input);

  return <InstitutionListView data={data} filters={input} />;
}
