import type { ArticleCategory, InstitutionCategory } from "@/src/db/schema";

const CATEGORY_LABEL: Record<ArticleCategory, string> = {
  ENGLISH_KINDERGARTEN: "영어유치원",
  PRIVATE_ELEMENTARY: "사립초등학교",
  INTERNATIONAL_SCHOOL: "국제학교",
  ADMISSIONS_GENERAL: "입학 준비",
};

export function socialCategoryLabel(
  category: ArticleCategory | InstitutionCategory,
): string {
  return CATEGORY_LABEL[category];
}

function shortRegion(region: string | null | undefined): string | null {
  if (!region) return null;
  if (region === "KR-11" || region.startsWith("서울")) return "서울";
  if (region === "KR-41" || region.startsWith("경기")) return "경기";
  if (region === "KR-28" || region.startsWith("인천")) return "인천";
  return null;
}

/** Eyebrow line for institution share images, e.g. "서울 사립초 · 광진구". */
export function institutionSocialEyebrow(
  institution: Readonly<{
    category: InstitutionCategory;
    region: string | null;
    district?: string | null;
  }>,
): string {
  const short =
    institution.category === "PRIVATE_ELEMENTARY"
      ? "사립초"
      : institution.category === "ENGLISH_KINDERGARTEN"
        ? "영어유치원"
        : "국제학교";
  const region = shortRegion(institution.region);
  const head = region ? `${region} ${short}` : short;
  return institution.district ? `${head} · ${institution.district}` : head;
}

/** Search-intent title per category, used for metadata and share images. */
export function institutionSearchTitle(
  institution: Readonly<{ name: string; category: InstitutionCategory }>,
): string {
  switch (institution.category) {
    case "PRIVATE_ELEMENTARY":
      return `${institution.name} 2027 입학: 모집·원서접수·추첨·학비`;
    case "ENGLISH_KINDERGARTEN":
      return `${institution.name} 원비·설명회·모집 일정`;
    case "INTERNATIONAL_SCHOOL":
      return `${institution.name} 입학 조건·학비·입학 일정`;
  }
}
