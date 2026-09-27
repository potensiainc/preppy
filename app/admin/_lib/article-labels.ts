import type {
  ArticleCategory,
  ArticleStatus,
  ArticleType,
} from "@/src/db/schema";

export const ARTICLE_TYPE_OPTIONS: ReadonlyArray<
  Readonly<{ value: ArticleType; label: string }>
> = [
  { value: "GUIDE", label: "가이드" },
  { value: "UPDATE", label: "변경 안내" },
  { value: "ROUNDUP", label: "모아보기" },
];

export const ARTICLE_CATEGORY_OPTIONS: ReadonlyArray<
  Readonly<{ value: ArticleCategory; label: string }>
> = [
  { value: "ADMISSIONS_GENERAL", label: "입학 일반" },
  { value: "ENGLISH_KINDERGARTEN", label: "영어유치원" },
  { value: "PRIVATE_ELEMENTARY", label: "사립초" },
  { value: "INTERNATIONAL_SCHOOL", label: "국제학교" },
];

const STATUS_LABELS: Readonly<Record<ArticleStatus, string>> = {
  DRAFT: "초안",
  PUBLISHED: "발행됨",
  UNPUBLISHED: "발행 취소",
  ARCHIVED: "보관됨",
};

export function articleTypeLabel(value: ArticleType): string {
  return ARTICLE_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export function articleCategoryLabel(value: ArticleCategory): string {
  return (
    ARTICLE_CATEGORY_OPTIONS.find((o) => o.value === value)?.label ?? value
  );
}

export function articleStatusLabel(value: ArticleStatus): string {
  return STATUS_LABELS[value] ?? value;
}

/** Limits mirror src/modules/editorial/contracts.ts. */
export const ARTICLE_FIELD_LIMITS = {
  title: 160,
  excerpt: 500,
  seoTitle: 70,
  seoDescription: 320,
  imageAlt: 300,
  relations: 12,
  minBodyCharacters: 40,
} as const;
