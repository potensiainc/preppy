import { InstitutionDetailView } from "@/app/_components/institution-pages";
import {
  getPublicExecutor,
  loadPublicPage,
} from "@/app/_lib/public-page.server";
import { getInstitutionBySlug } from "@/src/modules/public/institution-query.server";

export const dynamic = "force-dynamic";

export default async function InstitutionDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await loadPublicPage(() =>
    getInstitutionBySlug(getPublicExecutor(), slug),
  );

  return <InstitutionDetailView data={data} />;
}
