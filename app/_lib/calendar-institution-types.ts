import type { OpportunityCardDTO } from "@/src/modules/public/dto";

export const calendarTypes = [
  {
    value: "ENGLISH_KINDERGARTEN",
    label: "영어유치원",
    note: "학원",
    marker: "●",
    tone: "english",
  },
  {
    value: "INTERNATIONAL_SCHOOL",
    label: "국제학교",
    note: null,
    marker: "◆",
    tone: "international",
  },
  {
    value: "PRIVATE_ELEMENTARY",
    label: "사립초",
    note: null,
    marker: "■",
    tone: "elementary",
  },
] as const;
const unclassified = {
  value: "UNCLASSIFIED",
  label: "기관 유형 미확인",
  note: null,
  marker: "○",
  tone: "unknown",
} as const;
export type CalendarType =
  (typeof calendarTypes)[number]["value"] | "UNCLASSIFIED";
export type CalendarFilter = CalendarType | "ALL";

/** Use the institution category already verified by the public projection, never its name. */
export function calendarInstitutionType(category: unknown) {
  return calendarTypes.find((type) => type.value === category) ?? unclassified;
}

export function parseCalendarFilter(value: unknown): CalendarFilter {
  return typeof value === "string" &&
    (value === "UNCLASSIFIED" ||
      calendarTypes.some((type) => type.value === value))
    ? (value as CalendarType)
    : "ALL";
}

export function calendarCollection(
  items: OpportunityCardDTO[],
  filter: CalendarFilter,
) {
  const counts = {
    ALL: items.length,
    ENGLISH_KINDERGARTEN: 0,
    INTERNATIONAL_SCHOOL: 0,
    PRIVATE_ELEMENTARY: 0,
    UNCLASSIFIED: 0,
  };
  for (const item of items)
    counts[calendarInstitutionType(item.institution.category).value]++;
  return {
    counts,
    types:
      counts.UNCLASSIFIED > 0 || filter === "UNCLASSIFIED"
        ? [...calendarTypes, unclassified]
        : [...calendarTypes],
    items:
      filter === "ALL"
        ? items
        : items.filter(
            (item) =>
              calendarInstitutionType(item.institution.category).value ===
              filter,
          ),
  };
}

export function calendarFilterHref(filter: CalendarFilter) {
  return filter === "ALL"
    ? "/curation/calendar"
    : `/curation/calendar?category=${filter}`;
}
