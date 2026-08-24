import { InstitutionListView } from "@/app/_components/institution-pages";
import {
  toInstitutionListInput,
  type NextSearchParams,
} from "@/app/_lib/institution-search";
import { getPublicExecutor } from "@/app/_lib/public-page.server";
import { listInstitutions } from "@/src/modules/public/institution-query.server";

export const dynamic = "force-dynamic";

export default async function InstitutionsPage({
  searchParams,
}: {
  searchParams: Promise<NextSearchParams>;
}) {
  const input = toInstitutionListInput(await searchParams);
  const data = await listInstitutions(getPublicExecutor(), input);

  return <InstitutionListView data={data} filters={input} />;
}
