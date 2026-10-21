import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EnglishKindergartenCompareView } from "@/app/_components/english-kindergarten-compare";
import {
  compareDistricts,
  isCompareDistrictKey,
} from "@/app/_lib/english-kindergarten-compare";
import { getPublicExecutor } from "@/app/_lib/public-page.server";
import { listInstitutions } from "@/src/modules/public/institution-query.server";
import { SEOUL_REGION_CODE } from "@/src/modules/public/location";
import {
  buildSocialMetadata,
  getSeoAppBaseUrl,
} from "@/src/modules/public/seo";

export const dynamic = "force-dynamic";

const COMPARE_PAGE_SIZE = 50;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ district: string }>;
}): Promise<Metadata> {
  const { district } = await params;
  if (!isCompareDistrictKey(district)) return { title: "PREPPY" };
  const config = compareDistricts[district];
  const path = `/compare/english-kindergarten/${district}`;
  const title = `${config.heading} | PREPPY`;
  const description = `${config.areaLabel} 영어유치원의 원비, 운영 연령, 셔틀, 다음 설명회를 공식 안내 기준으로 한 표에서 비교해요.`;
  return {
    title,
    description,
    alternates: { canonical: path },
    ...buildSocialMetadata(getSeoAppBaseUrl(), path, title, description),
  };
}

export default async function EnglishKindergartenComparePage({
  params,
}: {
  params: Promise<{ district: string }>;
}) {
  const { district } = await params;
  if (!isCompareDistrictKey(district)) notFound();
  const config = compareDistricts[district];
  const data = await listInstitutions(getPublicExecutor(), {
    category: "ENGLISH_KINDERGARTEN",
    region: SEOUL_REGION_CODE,
    district: config.district,
    sort: "INFO_FIRST",
    pageSize: COMPARE_PAGE_SIZE,
  });
  const listParams = new URLSearchParams({
    category: "ENGLISH_KINDERGARTEN",
    region: SEOUL_REGION_CODE,
    district: config.district,
    page: "1",
  });
  return (
    <EnglishKindergartenCompareView
      config={config}
      data={data}
      listHref={`/institutions?${listParams.toString()}`}
      pagePath={`/compare/english-kindergarten/${district}`}
    />
  );
}
