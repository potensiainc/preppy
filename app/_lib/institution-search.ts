import type {
  InstitutionCategory,
  OpportunityBusinessState,
} from "@/src/db/schema";
import type { InstitutionListQuery } from "@/src/modules/public/dto";

export type NextSearchParams = Record<string, string | string[] | undefined>;

const categories = new Set<InstitutionCategory>([
  "ENGLISH_KINDERGARTEN",
  "PRIVATE_ELEMENTARY",
  "INTERNATIONAL_SCHOOL",
]);

const recruitmentStates = new Set<OpportunityBusinessState>([
  "UPCOMING",
  "OPEN",
  "CLOSED",
  "COMPLETED",
  "CANCELLED",
  "UNKNOWN",
]);

const MAX_REGION_LENGTH = 64;
const MAX_QUERY_LENGTH = 120;
const MAX_PAGE = 10_000;
const MAX_CHILD_AGE = 20;

const englishKindergartenSorts = new Set<
  NonNullable<InstitutionListQuery["sort"]>
>(["NAME_ASC", "INFO_SESSION_ASC", "TUITION_ASC"]);

function scalar(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function normalizedText(
  value: string | undefined,
  maximum: number,
): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > 0 && normalized.length <= maximum
    ? normalized
    : undefined;
}

function pageValue(value: string | undefined): number {
  if (value === undefined || !/^[1-9][0-9]*$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page <= MAX_PAGE ? page : 1;
}

/** Narrows Next route values to public filters before canonical revalidation. */
export function toInstitutionListInput(
  searchParams: NextSearchParams,
): InstitutionListQuery {
  const category = scalar(searchParams.category);
  const recruitmentState = scalar(searchParams.recruitmentState);
  const region = normalizedText(scalar(searchParams.region), MAX_REGION_LENGTH);
  const query = normalizedText(scalar(searchParams.query), MAX_QUERY_LENGTH);
  const isEnglishKindergarten = category === "ENGLISH_KINDERGARTEN";
  const minAgeInput = scalar(searchParams.minAge);
  const minAge =
    isEnglishKindergarten &&
    minAgeInput !== undefined &&
    /^[1-9][0-9]*$/u.test(minAgeInput) &&
    Number(minAgeInput) <= MAX_CHILD_AGE
      ? Number(minAgeInput)
      : undefined;
  const transport =
    isEnglishKindergarten && scalar(searchParams.transport) === "AVAILABLE"
      ? ("AVAILABLE" as const)
      : undefined;
  const hasUpcomingInfoSession =
    isEnglishKindergarten &&
    scalar(searchParams.hasUpcomingInfoSession) === "true"
      ? true
      : undefined;
  const sortInput = scalar(searchParams.sort);
  const sort =
    isEnglishKindergarten &&
    sortInput !== undefined &&
    englishKindergartenSorts.has(
      sortInput as NonNullable<InstitutionListQuery["sort"]>,
    )
      ? (sortInput as NonNullable<InstitutionListQuery["sort"]>)
      : undefined;

  return {
    ...(category !== undefined &&
    categories.has(category as InstitutionCategory)
      ? { category: category as InstitutionCategory }
      : {}),
    ...(region === undefined ? {} : { region }),
    ...(recruitmentState !== undefined &&
    recruitmentStates.has(recruitmentState as OpportunityBusinessState)
      ? { recruitmentState: recruitmentState as OpportunityBusinessState }
      : {}),
    ...(query === undefined ? {} : { query }),
    ...(minAge === undefined ? {} : { minAge }),
    ...(transport === undefined ? {} : { transport }),
    ...(hasUpcomingInfoSession === undefined ? {} : { hasUpcomingInfoSession }),
    ...(sort === undefined ? {} : { sort }),
    page: pageValue(scalar(searchParams.page)),
    pageSize: 12,
  };
}
