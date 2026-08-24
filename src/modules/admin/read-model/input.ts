import { z } from "zod";

import { ValidationError } from "@/src/application/errors";
import {
  articleStatusValues,
  articleTypeValues,
  institutionCategoryValues,
  institutionOperationalStateValues,
  institutionPublicationStateValues,
  notificationSignalTypeValues,
  notificationStatusValues,
  opportunityBusinessStateValues,
  opportunityKindValues,
  opportunityPublicationStateValues,
  opportunityTruthModeValues,
} from "@/src/db/schema";

export const DEFAULT_ADMIN_PAGE_SIZE = 20;
export const MAX_ADMIN_PAGE_SIZE = 50;
export const MAX_ADMIN_PAGE = 10_000;

const MAX_QUERY_LENGTH = 120;
const integerString = /^[1-9][0-9]*$/;

const sourceTypeValues = [
  "OFFICIAL_ADMISSION_PAGE",
  "OFFICIAL_NOTICE_BOARD",
  "OFFICIAL_DOCUMENT",
  "OFFICIAL_APPLICATION_PORTAL",
  "OFFICIAL_SCHOOL_PAGE",
  "OFFICIAL_SOCIAL",
  "THIRD_PARTY_DISCOVERY",
  "OTHER",
] as const;

const sourceAuthorityValues = [
  "PRIMARY",
  "SECONDARY_OFFICIAL",
  "DISCOVERY_ONLY",
] as const;

const sourceLifecycleValues = [
  "DISCOVERED",
  "ACTIVE",
  "PAUSED",
  "RETIRED",
] as const;

export const emailReadinessValues = [
  "READY",
  "USER_INACTIVE",
  "EMAIL_UNAVAILABLE",
  "EMAIL_UNVERIFIED",
  "EMAIL_BLOCKED",
  "PREFERENCE_DISABLED",
  "CONSENT_NOT_GRANTED",
] as const;

const positiveInteger = (maximum: number) =>
  z.union([
    z.number().int().min(1).max(maximum),
    z
      .string()
      .regex(integerString)
      .transform(Number)
      .pipe(z.number().int().min(1).max(maximum)),
  ]);

const pageShape = {
  page: positiveInteger(MAX_ADMIN_PAGE).optional(),
  pageSize: positiveInteger(MAX_ADMIN_PAGE_SIZE).optional(),
};

const normalizedQuery = z
  .string()
  .transform((value) => value.trim().replace(/\s+/g, " "))
  .pipe(z.string().min(1).max(MAX_QUERY_LENGTH));

const institutionListSchema = z
  .object({
    category: z.enum(institutionCategoryValues).optional(),
    publicationState: z.enum(institutionPublicationStateValues).optional(),
    operationalState: z.enum(institutionOperationalStateValues).optional(),
    query: normalizedQuery.optional(),
    ...pageShape,
  })
  .strict();

const opportunityListSchema = z
  .object({
    institutionId: z.uuid().optional(),
    kind: z.enum(opportunityKindValues).optional(),
    truthMode: z.enum(opportunityTruthModeValues).optional(),
    publicationState: z.enum(opportunityPublicationStateValues).optional(),
    businessState: z.enum(opportunityBusinessStateValues).optional(),
    ...pageShape,
  })
  .strict();

const sourceListSchema = z
  .object({
    sourceType: z.enum(sourceTypeValues).optional(),
    authorityLevel: z.enum(sourceAuthorityValues).optional(),
    lifecycleStatus: z.enum(sourceLifecycleValues).optional(),
    query: normalizedQuery.optional(),
    ...pageShape,
  })
  .strict();

const articleListSchema = z
  .object({
    type: z.enum(articleTypeValues).optional(),
    status: z.enum(articleStatusValues).optional(),
    ...pageShape,
  })
  .strict();

const notificationListSchema = z
  .object({
    status: z.enum(notificationStatusValues).optional(),
    signalType: z.enum(notificationSignalTypeValues).optional(),
    ...pageShape,
  })
  .strict();

const userListSchema = z
  .object({
    status: z.enum(["PENDING", "ACTIVE", "SUSPENDED", "DELETED"]).optional(),
    emailReadiness: z.enum(emailReadinessValues).optional(),
    ...pageShape,
  })
  .strict();

const detailSchema = z.object({ id: z.uuid() }).strict();

type WithPagination<T> = Omit<T, "page" | "pageSize"> & {
  page: number;
  pageSize: number;
};

export type InstitutionAdminListInput = WithPagination<
  z.output<typeof institutionListSchema>
>;
export type OpportunityAdminListInput = WithPagination<
  z.output<typeof opportunityListSchema>
>;
export type SourceAdminListInput = WithPagination<
  z.output<typeof sourceListSchema>
>;
export type ArticleAdminListInput = WithPagination<
  z.output<typeof articleListSchema>
>;
export type NotificationAdminListInput = WithPagination<
  z.output<typeof notificationListSchema>
>;
export type UserAdminListInput = WithPagination<
  z.output<typeof userListSchema>
>;
export type AdminDetailInput = z.output<typeof detailSchema>;

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw ValidationError.fromZodError(result.error);
  return result.data;
}

function withPagination<T extends { page?: number; pageSize?: number }>(
  value: T,
): WithPagination<T> {
  return {
    ...value,
    page: value.page ?? 1,
    pageSize: value.pageSize ?? DEFAULT_ADMIN_PAGE_SIZE,
  };
}

export function parseInstitutionAdminListInput(
  value: unknown,
): InstitutionAdminListInput {
  return withPagination(parse(institutionListSchema, value));
}

export function parseOpportunityAdminListInput(
  value: unknown,
): OpportunityAdminListInput {
  return withPagination(parse(opportunityListSchema, value));
}

export function parseSourceAdminListInput(
  value: unknown,
): SourceAdminListInput {
  return withPagination(parse(sourceListSchema, value));
}

export function parseArticleAdminListInput(
  value: unknown,
): ArticleAdminListInput {
  return withPagination(parse(articleListSchema, value));
}

export function parseNotificationAdminListInput(
  value: unknown,
): NotificationAdminListInput {
  return withPagination(parse(notificationListSchema, value));
}

export function parseUserAdminListInput(value: unknown): UserAdminListInput {
  return withPagination(parse(userListSchema, value));
}

export function parseAdminDetailInput(value: unknown): AdminDetailInput {
  return parse(detailSchema, value);
}
