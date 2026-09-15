import { z } from "zod";

import { sourceTypeValues } from "@/src/db/schema";
import {
  coverageStatusValues,
  englishKindergartenSectionValues,
} from "@/src/modules/english-kindergarten/coverage";
import {
  artifactEvidenceStatusValues,
} from "@/src/modules/international-school/artifact-status";
import {
  internationalSchoolFactTypeValues,
  parseInternationalSchoolFactValue,
  type InternationalSchoolFactType,
  type InternationalSchoolFactValue,
} from "@/src/modules/international-school/fact-values";

export const OFFICIAL_ACTIVE_COUNT = 22;
export const SPECIAL_ACCESS_COUNT = 7;
export const CANDIDATE_COUNT = 60;

const nonEmpty = z.string().trim().min(1);
const nullableText = nonEmpty.nullable();
const identifier = z.string().regex(/^[a-z0-9][a-z0-9-]{2,99}$/u);
const isiExternalId = z.string().regex(/^ST01:\d+$/u);
const isoDateTime = z.iso.datetime({ offset: true });
const isoDate = z.iso.date();
const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
const httpsUrl = z
  .url()
  .refine(
    (value) => new URL(value).protocol === "https:",
    "HTTPS URL이 필요합니다.",
  );
const nullableHttpsUrl = httpsUrl.nullable();
const jsonObject = z.record(z.string(), z.unknown());

const addressConflictSchema = z
  .object({
    status: z.literal("NEEDS_REVIEW"),
    values: z
      .array(
        z
          .object({
            addressLine: nonEmpty,
            evidenceId: identifier,
          })
          .strict(),
      )
      .min(2),
  })
  .strict();

export const institutionArtifactRecordSchema = z
  .object({
    recordId: identifier,
    registryName: z.literal("ISI"),
    registryExternalId: isiExternalId,
    canonicalNameKo: nonEmpty,
    canonicalNameEn: nonEmpty,
    aliases: z.array(nonEmpty),
    slug: identifier,
    category: z.literal("INTERNATIONAL_SCHOOL"),
    internationalSubtype: z.literal("FOREIGN_SCHOOL"),
    operationalState: z.literal("ACTIVE"),
    publicationState: z.literal("DRAFT"),
    regionCode: z.enum(["11", "41"]),
    city: z.enum(["서울특별시", "경기도"]),
    district: nullableText,
    addressLine: nullableText,
    websiteUrl: httpsUrl,
    registryRecordUrl: httpsUrl,
    officialMainUrl: httpsUrl,
    addressConflict: addressConflictSchema.nullable(),
    collectedAt: isoDateTime,
  })
  .strict();

export type InstitutionArtifactRecord = z.infer<
  typeof institutionArtifactRecordSchema
>;

export const evidenceFieldValues = [
  "IDENTITY",
  "OPERATION",
  "CLASSIFICATION",
  "TUITION",
  "ELIGIBILITY",
  "TARGET_AGE_GRADE",
  "CURRICULUM",
  "TRANSPORT",
  "MEALS",
  "ADMISSION_PROCESS",
  "OPERATING_INFO",
  "INFORMATION_SESSION",
] as const;

export const evidenceArtifactRecordSchema = z
  .object({
    evidenceId: identifier,
    institutionRegistryId: isiExternalId,
    claimType: z.enum([
      "IDENTITY",
      "OPERATION",
      "CLASSIFICATION",
      "FACT",
      "OPPORTUNITY",
    ]),
    field: z.enum(evidenceFieldValues),
    sourceName: nonEmpty,
    sourceUrl: httpsUrl,
    finalUrl: httpsUrl,
    sourceType: z.enum(sourceTypeValues),
    authorityLevel: z.enum([
      "PRIMARY",
      "SECONDARY_OFFICIAL",
      "DISCOVERY_ONLY",
    ]),
    status: z.enum(artifactEvidenceStatusValues),
    excerpt: nullableText.refine(
      (value) => value === null || value.length <= 2_000,
      "근거 발췌문은 2,000자를 넘을 수 없습니다.",
    ),
    collectedAt: isoDateTime,
    observedAt: isoDateTime.nullable(),
    sourceObservationRef: identifier.nullable(),
    sourceSnapshotId: z.uuid().nullable(),
    sourceContentSha256: sha256,
    academicYearLabel: nullableText,
    observedValueJson: jsonObject.nullable(),
    publicNote: nullableText,
    internalNote: nullableText,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.excerpt !== null &&
      /<(?:!doctype|html|head|body|script|style)\b/iu.test(value.excerpt)
    ) {
      context.addIssue({
        code: "custom",
        path: ["excerpt"],
        message: "전체 HTML 문서는 근거 발췌문으로 저장할 수 없습니다.",
      });
    }
  });

export type EvidenceArtifactRecord = z.infer<
  typeof evidenceArtifactRecordSchema
>;

export const socialEvidenceArtifactRecordSchema = z
  .object({
    socialEvidenceId: identifier,
    institutionRegistryId: isiExternalId,
    channelType: z.enum([
      "OFFICIAL_SOCIAL",
      "BLOG",
      "CAFE",
      "COMMUNITY",
      "REVIEW_SITE",
      "VIDEO",
    ]),
    url: httpsUrl,
    accessStatus: z.enum(artifactEvidenceStatusValues),
    accessedAt: isoDateTime,
    perspective: z.enum([
      "PARENT",
      "STUDENT",
      "TEACHER",
      "ALUMNI",
      "UNKNOWN",
    ]),
    reviewSampleCount: z.number().int().nonnegative(),
    themeSummary: z.array(nonEmpty),
    periodStart: isoDate.nullable(),
    periodEnd: isoDate.nullable(),
    recency: z.enum(["CURRENT", "RECENT", "HISTORICAL", "UNKNOWN"]),
    promotionEligibility: z.literal("DISCOVERY_ONLY"),
    limitation: nonEmpty,
    excerpt: z.string().nullable(),
  })
  .strict();

export type SocialEvidenceArtifactRecord = z.infer<
  typeof socialEvidenceArtifactRecordSchema
>;

export const specialAccessArtifactRecordSchema = z
  .object({
    recordId: identifier,
    name: nonEmpty,
    system: z.enum(["DODEA", "EMBASSY"]),
    regionCode: z.enum(["11", "41"]),
    city: nonEmpty,
    district: nullableText,
    publicUrl: httpsUrl,
    accessStatus: z.enum(artifactEvidenceStatusValues),
    legalClassification: z.literal("SPECIAL_ACCESS"),
    publicationEligibility: z.literal("ARTIFACT_ONLY"),
    limitation: nonEmpty,
    checkedAt: isoDateTime,
  })
  .strict();

export type SpecialAccessArtifactRecord = z.infer<
  typeof specialAccessArtifactRecordSchema
>;

export const candidateArtifactRecordSchema = z
  .object({
    recordId: identifier,
    name: nonEmpty,
    aliases: z.array(nonEmpty),
    regionCandidates: z.array(z.enum(["서울특별시", "경기도"])).min(1),
    officialUrl: nullableHttpsUrl,
    disposition: z.enum([
      "REGISTERED_ALTERNATIVE",
      "ACADEMY",
      "NOT_INTERNATIONAL",
      "EXCLUDE_OUT_OF_REGION",
      "HOLD",
    ]),
    legalStatus: z.enum([
      "REGISTERED_ALTERNATIVE",
      "ACADEMY",
      "UNACCREDITED",
      "DOMESTIC_PRIVATE_SCHOOL",
      "OUT_OF_REGION",
      "UNKNOWN",
    ]),
    evidenceUrls: z.array(httpsUrl),
    collisionGroup: nullableText,
    publicationEligibility: z.literal("ARTIFACT_ONLY"),
    notes: z.array(nonEmpty).min(1),
    checkedAt: isoDateTime,
  })
  .strict();

export type CandidateArtifactRecord = z.infer<
  typeof candidateArtifactRecordSchema
>;

const coverageImportSchema = z
  .object({
    section: z.enum(englishKindergartenSectionValues),
    status: z.enum(coverageStatusValues),
    evidenceId: identifier.nullable(),
    academicYearLabel: nullableText,
    publicNote: nullableText,
    internalNote: nullableText,
    lastCollectedAt: isoDateTime.nullable(),
    lastCheckedAt: isoDateTime,
  })
  .strict();

const factImportSchema = z
  .object({
    factType: z.enum(internationalSchoolFactTypeValues),
    value: z.unknown(),
    displayText: nullableText,
    evidenceIds: z.array(identifier).min(1),
    verifiedAt: isoDateTime,
  })
  .strict()
  .transform((value) => ({
    ...value,
    value: parseInternationalSchoolFactValue(
      value.factType as InternationalSchoolFactType,
      value.value,
    ) as InternationalSchoolFactValue,
  }));

export const opportunityKindValues = [
  "INFORMATION_SESSION",
  "OPEN_HOUSE",
  "CAMPUS_TOUR",
  "APPLICATION",
] as const;

const opportunityImportSchema = z
  .object({
    slug: identifier,
    title: nonEmpty,
    kind: z.enum(opportunityKindValues),
    businessState: z.enum([
      "UPCOMING",
      "OPEN",
      "CLOSED",
      "COMPLETED",
      "CANCELLED",
      "UNKNOWN",
    ]),
    eventStartsAt: isoDateTime.nullable(),
    applicationClosesAt: isoDateTime.nullable(),
    actionUrl: nullableHttpsUrl,
    evidenceIds: z.array(identifier).min(1),
    verifiedAt: isoDateTime,
  })
  .strict();

export const importInstitutionSchema = z
  .object({
    registryName: z.literal("ISI"),
    registryExternalId: isiExternalId,
    category: z.literal("INTERNATIONAL_SCHOOL"),
    internationalSubtype: z.literal("FOREIGN_SCHOOL"),
    operationalState: z.literal("ACTIVE"),
    publicationState: z.literal("DRAFT"),
    coverages: z.array(coverageImportSchema),
    facts: z.array(factImportSchema),
    opportunities: z.array(opportunityImportSchema),
  })
  .strict();

export type ImportInstitution = z.infer<typeof importInstitutionSchema>;

export const importSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    packageId: identifier,
    targetAcademicYearLabel: nonEmpty,
    institutions: z.array(importInstitutionSchema),
  })
  .strict();

const coverageCountsSchema = z
  .object({
    confirmed: z.number().int().nonnegative(),
    needsReview: z.number().int().nonnegative(),
    checkedNotFound: z.number().int().nonnegative(),
    accessFailed: z.number().int().nonnegative(),
    notResearched: z.number().int().nonnegative(),
  })
  .strict();

export const progressSchema = z
  .object({
    schemaVersion: z.literal(1),
    packageId: identifier,
    asOf: isoDate,
    targetAcademicYearLabel: nonEmpty,
    counts: z
      .object({
        officialActive: z.number().int().nonnegative(),
        specialAccess: z.number().int().nonnegative(),
        candidates: z.number().int().nonnegative(),
        importInstitutions: z.number().int().nonnegative(),
      })
      .strict(),
    regions: z
      .object({
        서울특별시: z.number().int().nonnegative(),
        경기도: z.number().int().nonnegative(),
      })
      .strict(),
    fieldCoverage: z.record(
      z.enum(englishKindergartenSectionValues),
      coverageCountsSchema,
    ),
    accessSummary: z
      .object({
        verified: z.number().int().nonnegative(),
        warning: z.number().int().nonnegative(),
        dateLimited: z.number().int().nonnegative(),
        needsReview: z.number().int().nonnegative(),
        checkedNotFound: z.number().int().nonnegative(),
        accessFailed: z.number().int().nonnegative(),
        leadOnly: z.number().int().nonnegative(),
        loginRequired: z.number().int().nonnegative(),
        robotsBlocked: z.number().int().nonnegative(),
        noPublicResult: z.number().int().nonnegative(),
      })
      .strict(),
    unresolvedConflicts: z.array(
      z
        .object({
          code: identifier,
          institutionRegistryId: isiExternalId.nullable(),
          note: nonEmpty,
        })
        .strict(),
    ),
  })
  .strict();

export const manifestFileNames = [
  "institutions.ndjson",
  "evidence.ndjson",
  "social-evidence.ndjson",
  "special-access.ndjson",
  "candidates.ndjson",
  "progress.json",
  "preppy-import.snapshot.json",
] as const;

export const manifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    packageId: identifier,
    files: z
      .object({
        "institutions.ndjson": sha256,
        "evidence.ndjson": sha256,
        "social-evidence.ndjson": sha256,
        "special-access.ndjson": sha256,
        "candidates.ndjson": sha256,
        "progress.json": sha256,
        "preppy-import.snapshot.json": sha256,
      })
      .strict(),
    preppyImportChecksum: sha256,
  })
  .strict();

export const verificationSchema = z
  .object({
    schemaVersion: z.literal(1),
    packageId: identifier,
    status: z.enum(["PENDING", "PASS", "FAIL"]),
    checkedAt: isoDateTime.nullable(),
    checks: z.array(
      z
        .object({
          name: nonEmpty,
          status: z.enum(["PASS", "FAIL"]),
        })
        .strict(),
    ),
    readyForDryRun: z.boolean(),
  })
  .strict();

export type InternationalSchoolImportSnapshot = z.infer<
  typeof importSnapshotSchema
>;
export type InternationalSchoolProgress = z.infer<typeof progressSchema>;
export type InternationalSchoolManifest = z.infer<typeof manifestSchema>;
export type InternationalSchoolVerification = z.infer<
  typeof verificationSchema
>;

export type InternationalSchoolImportPackage = Readonly<{
  directory: string;
  institutions: readonly InstitutionArtifactRecord[];
  evidence: readonly EvidenceArtifactRecord[];
  socialEvidence: readonly SocialEvidenceArtifactRecord[];
  specialAccess: readonly SpecialAccessArtifactRecord[];
  candidates: readonly CandidateArtifactRecord[];
  progress: InternationalSchoolProgress;
  snapshot: InternationalSchoolImportSnapshot;
  manifest: InternationalSchoolManifest;
  verification: InternationalSchoolVerification;
  actualImportChecksum: string;
  actualFileHashes: Readonly<
    Record<(typeof manifestFileNames)[number], string>
  >;
}>;
