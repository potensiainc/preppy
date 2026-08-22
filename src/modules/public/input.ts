import { z } from "zod";

import { ValidationError } from "@/src/application/errors";
import {
  institutionCategoryValues,
  opportunityBusinessStateValues,
} from "@/src/db/schema";

import type { InstitutionListQuery } from "./dto";

export const DEFAULT_INSTITUTION_PAGE_SIZE = 20;
export const MAX_INSTITUTION_PAGE_SIZE = 50;
export const MAX_INSTITUTION_PAGE = 10_000;
const MAX_REGION_LENGTH = 64;
const MAX_QUERY_LENGTH = 120;

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
    recruitmentState: z.enum(opportunityBusinessStateValues).optional(),
    query: normalizedRequiredText(MAX_QUERY_LENGTH).optional(),
    page: positiveInteger(MAX_INSTITUTION_PAGE).optional(),
    pageSize: positiveInteger(MAX_INSTITUTION_PAGE_SIZE).optional(),
  })
  .strict();

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
    ...(parsed.data.recruitmentState === undefined
      ? {}
      : { recruitmentState: parsed.data.recruitmentState }),
    ...(parsed.data.query === undefined ? {} : { query: parsed.data.query }),
    page: parsed.data.page ?? 1,
    pageSize: parsed.data.pageSize ?? DEFAULT_INSTITUTION_PAGE_SIZE,
  };
}
