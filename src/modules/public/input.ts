import { z } from "zod";

import { ValidationError } from "@/src/application/errors";
import {
  institutionCategoryValues,
  opportunityBusinessStateValues,
} from "@/src/db/schema";

import type { InstitutionListQuery } from "./dto";
import { SEOUL_REGION_CODE, seoulDistrictValues } from "./location";

export const DEFAULT_INSTITUTION_PAGE_SIZE = 20;
export const MAX_INSTITUTION_PAGE_SIZE = 50;
export const MAX_INSTITUTION_PAGE = 10_000;
const MAX_REGION_LENGTH = 64;
const MAX_QUERY_LENGTH = 120;
const MAX_CHILD_AGE = 20;

const integerString = /^[1-9][0-9]*$/;

/**
 * Boundary type for future public query entry points. They must receive unknown
 * request input and call `parseInstitutionListQuery` before database access.
 */
export type InstitutionListQueryInput = unknown;

const positiveInteger = (maximum: number) =>
  z.union([
    z.number().int().min(1).max(maximum),
    z
      .string()
      .regex(integerString)
      .transform((value) => Number(value))
      .pipe(z.number().int().min(1).max(maximum)),
  ]);

const normalizeWhitespace = (value: string) =>
  value.trim().replace(/\s+/g, " ");

const normalizedRequiredText = (maximum: number) =>
  z
    .string()
    .transform(normalizeWhitespace)
    .pipe(z.string().min(1).max(maximum));

const institutionListQuerySchema = z
  .object({
    category: z.enum(institutionCategoryValues).optional(),
    region: normalizedRequiredText(MAX_REGION_LENGTH).optional(),
    district: z.enum(seoulDistrictValues).optional(),
    recruitmentState: z.enum(opportunityBusinessStateValues).optional(),
    query: normalizedRequiredText(MAX_QUERY_LENGTH).optional(),
    hasConfirmedTuition: z.boolean().optional(),
    minAge: positiveInteger(MAX_CHILD_AGE).optional(),
    transport: z.literal("AVAILABLE").optional(),
    hasUpcomingInfoSession: z.boolean().optional(),
    sort: z.enum(["NAME_ASC", "INFO_SESSION_ASC", "TUITION_ASC"]).optional(),
    page: positiveInteger(MAX_INSTITUTION_PAGE).optional(),
    pageSize: positiveInteger(MAX_INSTITUTION_PAGE_SIZE).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const hasEnglishKindergartenFilter =
      value.hasConfirmedTuition !== undefined ||
      value.district !== undefined ||
      value.minAge !== undefined ||
      value.transport !== undefined ||
      value.hasUpcomingInfoSession !== undefined ||
      value.sort !== undefined;
    if (
      hasEnglishKindergartenFilter &&
      value.category !== "ENGLISH_KINDERGARTEN"
    ) {
      context.addIssue({
        code: "custom",
        message:
          "영어유치원 비교 조건은 영어유치원 카테고리에서만 사용할 수 있습니다.",
        path: ["category"],
      });
    }
    if (
      value.district !== undefined &&
      value.region !== undefined &&
      value.region !== SEOUL_REGION_CODE
    ) {
      context.addIssue({
        code: "custom",
        message: "서울 자치구는 서울 지역에서만 사용할 수 있습니다.",
        path: ["region"],
      });
    }
  });

/**
 * Parses only explicit public filters. It normalizes text for the eventual
 * database search but performs no logging, analytics, auditing, or other write.
 */
export function parseInstitutionListQuery(
  input: InstitutionListQueryInput,
): InstitutionListQuery {
  const parsed = institutionListQuerySchema.safeParse(input);
  if (!parsed.success) {
    throw ValidationError.fromZodError(parsed.error);
  }

  return {
    ...(parsed.data.category === undefined
      ? {}
      : { category: parsed.data.category }),
    ...(parsed.data.region === undefined ? {} : { region: parsed.data.region }),
    ...(parsed.data.district === undefined
      ? {}
      : { district: parsed.data.district }),
    ...(parsed.data.recruitmentState === undefined
      ? {}
      : { recruitmentState: parsed.data.recruitmentState }),
    ...(parsed.data.query === undefined ? {} : { query: parsed.data.query }),
    ...(parsed.data.hasConfirmedTuition === undefined
      ? {}
      : { hasConfirmedTuition: parsed.data.hasConfirmedTuition }),
    ...(parsed.data.minAge === undefined ? {} : { minAge: parsed.data.minAge }),
    ...(parsed.data.transport === undefined
      ? {}
      : { transport: parsed.data.transport }),
    ...(parsed.data.hasUpcomingInfoSession === undefined
      ? {}
      : { hasUpcomingInfoSession: parsed.data.hasUpcomingInfoSession }),
    ...(parsed.data.sort === undefined ? {} : { sort: parsed.data.sort }),
    page: parsed.data.page ?? 1,
    pageSize: parsed.data.pageSize ?? DEFAULT_INSTITUTION_PAGE_SIZE,
  };
}
