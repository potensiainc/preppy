import { z } from "zod";

import { sourceTypeValues } from "@/src/db/schema";
import {
  coverageStatusValues,
  englishKindergartenSectionValues,
} from "@/src/modules/english-kindergarten/coverage";
import {
  englishKindergartenFactTypeValues,
  parseEnglishKindergartenFactValue,
  type EnglishKindergartenFactType,
  type EnglishKindergartenFactValue,
} from "@/src/modules/english-kindergarten/fact-values";
import { parseReviewInsightValue } from "@/src/modules/english-kindergarten/review-insight";

const nonEmpty = z.string().trim().min(1);
const httpsUrl = z
  .url()
  .refine(
    (value) => new URL(value).protocol === "https:",
    "HTTPS URL이 필요합니다.",
  );
const isoDateTime = z.iso.datetime({ offset: true });
const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
const identifier = z.string().regex(/^[a-z0-9][a-z0-9-]{2,79}$/u);

export const campusRecordSchema = z
  .object({
    campusId: identifier,
    displayName: nonEmpty,
    slug: identifier,
    addressLine: nonEmpty,
    // Version 1 packages are further limited to the first rollout's districts
    // and legal dongs by the validator.
    district: z.string().regex(/^[가-힣]{1,4}구$/u),
    legalDong: z.string().regex(/^[가-힣0-9]{1,8}동$/u),
    operationalState: z.enum(["ACTIVE", "UNKNOWN"]),
    classificationState: z.literal("CONFIRMED"),
    officialChannels: z.array(
      z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("WEBSITE"), value: httpsUrl }).strict(),
        z.object({ kind: z.literal("BLOG"), value: httpsUrl }).strict(),
        z.object({ kind: z.literal("SOCIAL"), value: httpsUrl }).strict(),
        z.object({ kind: z.literal("PHONE"), value: nonEmpty }).strict(),
      ]),
    ),
    collectedAt: isoDateTime,
  })
  .strict();

export type CampusRecord = z.infer<typeof campusRecordSchema>;

export const evidenceRecordSchema = z
  .object({
    evidenceId: identifier,
    campusId: identifier,
    claimType: z.enum([
      "IDENTITY",
      "OPERATION",
      "CLASSIFICATION",
      "ADMISSION",
      "FACT",
    ]),
    sourceUrl: httpsUrl,
    finalUrl: httpsUrl,
    sourceType: z.enum(sourceTypeValues),
    authorityLevel: z.enum(["PRIMARY", "SECONDARY_OFFICIAL", "THIRD_PARTY"]),
    fetchOutcome: z.enum(["SUCCESS", "ACCESS_FAILED", "CHECKED_NOT_FOUND"]),
    sourceTextExcerpt: nonEmpty.max(2_000),
    boundedExcerpt: nonEmpty.max(2_000),
    collectedAt: isoDateTime,
    sourceContentSha256: sha256,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      /<(?:!doctype|html|head|body|script|style)\b/iu.test(
        `${value.sourceTextExcerpt}\n${value.boundedExcerpt}`,
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["boundedExcerpt"],
        message: "전체 HTML 문서는 근거 발췌문으로 저장할 수 없습니다.",
      });
    }
  });

export type EvidenceRecord = z.infer<typeof evidenceRecordSchema>;

const coverageImportSchema = z
  .object({
    section: z.enum(englishKindergartenSectionValues),
    status: z.enum(coverageStatusValues),
    evidenceId: identifier.nullable(),
    academicYearLabel: nonEmpty.nullable(),
    publicNote: nonEmpty.nullable(),
    internalNote: nonEmpty.nullable(),
    lastCollectedAt: isoDateTime.nullable(),
    lastCheckedAt: isoDateTime,
  })
  .strict();

const factImportSchema = z
  .object({
    factType: z.enum(englishKindergartenFactTypeValues),
    value: z.unknown(),
    displayText: nonEmpty.nullable(),
    evidenceIds: z.array(identifier).min(1),
    verifiedAt: isoDateTime,
  })
  .strict()
  .transform((value) => ({
    ...value,
    value: parseEnglishKindergartenFactValue(
      value.factType as EnglishKindergartenFactType,
      value.value,
    ) as EnglishKindergartenFactValue,
  }));

const opportunityImportSchema = z
  .object({
    slug: identifier,
    title: nonEmpty,
    kind: z.literal("INFORMATION_SESSION"),
    businessState: z.enum([
      "UPCOMING",
      "OPEN",
      "CLOSED",
      "COMPLETED",
      "CANCELLED",
      "UNKNOWN",
    ]),
    eventStartsAt: isoDateTime,
    applicationClosesAt: isoDateTime.nullable(),
    actionUrl: httpsUrl.nullable(),
    evidenceIds: z.array(identifier).min(1),
    verifiedAt: isoDateTime,
  })
  .strict();

const reviewInsightImportSchema = z
  .object({
    periodStart: z.iso.date().nullable(),
    periodEnd: z.iso.date().nullable(),
    sampleSize: z.number().int().positive(),
    themes: z.unknown(),
    limitations: nonEmpty.nullable(),
    evidenceIds: z.array(identifier).min(1),
    verifiedAt: isoDateTime,
  })
  .strict()
  .transform((value) => {
    const parsed = parseReviewInsightValue({
      periodStart: value.periodStart,
      periodEnd: value.periodEnd,
      reviewCount: value.sampleSize,
      themes: value.themes,
      limitations: value.limitations,
    });
    return {
      ...value,
      periodStart: parsed.periodStart,
      periodEnd: parsed.periodEnd,
      sampleSize: parsed.reviewCount,
      themes: parsed.themes,
      limitations: parsed.limitations,
    };
  });

export const importInstitutionSchema = z
  .object({
    campusId: identifier,
    category: z.literal("ENGLISH_KINDERGARTEN"),
    // DRAFT rows may create new roots; PUBLISHED rows only update institutions
    // that are already public. The validator enforces the per-version rules.
    publicationState: z.enum(["DRAFT", "PUBLISHED"]),
    coverages: z
      .array(coverageImportSchema)
      .min(1)
      .max(englishKindergartenSectionValues.length),
    facts: z.array(factImportSchema),
    opportunities: z.array(opportunityImportSchema),
    reviewInsight: reviewInsightImportSchema.nullable(),
  })
  .strict();

/**
 * Version 1 is the first Gangnam/Seocho rollout of 25 DRAFT campuses.
 * Version 2 updates campuses that are already published: it changes only the
 * listed coverage sections and facts, and never creates or publishes roots or
 * information sessions.
 */
export const importSnapshotSchema = z
  .object({
    schemaVersion: z.union([z.literal(1), z.literal(2)]),
    packageId: identifier,
    institutions: z.array(importInstitutionSchema).min(1).max(100),
  })
  .strict();

export const progressSchema = z
  .object({
    packageId: identifier,
    confirmed: z.number().int().nonnegative(),
    excluded: z.number().int().nonnegative(),
    held: z.number().int().nonnegative(),
    recordsReviewed: z.number().int().nonnegative(),
    districts: z.record(z.string(), z.number().int()),
    legalDongs: z.record(z.string(), z.number().int()),
    sourceFetches: z
      .object({
        success: z.number().int().nonnegative(),
        accessFailed: z.number().int().nonnegative(),
        checkedNotFound: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export const manifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    packageId: identifier,
    files: z
      .object({
        "campuses.ndjson": sha256,
        "evidence.ndjson": sha256,
        "progress.json": sha256,
        "preppy-import.snapshot.json": sha256,
      })
      .strict(),
    preppyImportChecksum: sha256,
  })
  .strict();

export type ImportInstitution = z.infer<typeof importInstitutionSchema>;
export type EnglishKindergartenImportSnapshot = z.infer<
  typeof importSnapshotSchema
>;
export type EnglishKindergartenProgress = z.infer<typeof progressSchema>;
export type EnglishKindergartenManifest = z.infer<typeof manifestSchema>;

export type EnglishKindergartenImportPackage = Readonly<{
  directory: string;
  campuses: readonly CampusRecord[];
  evidence: readonly EvidenceRecord[];
  progress: EnglishKindergartenProgress;
  snapshot: EnglishKindergartenImportSnapshot;
  manifest: EnglishKindergartenManifest;
  actualFileHashes: Readonly<
    Record<keyof EnglishKindergartenManifest["files"], string>
  >;
}>;
