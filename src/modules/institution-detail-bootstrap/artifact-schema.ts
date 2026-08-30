import { z } from "zod";
import {
  opportunityKindValues,
  opportunityBusinessStateValues,
} from "@/src/db/schema";

export const MAX_BOOTSTRAP_ARTIFACT_BYTES = 1024 * 1024;
const text = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((value) => value.trim().length > 0);
export const artifactDate = z.string().refine((value) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
});
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const url = text(2048);
const warnings = z.array(text(4096)).max(300);
export const artifactSourceType = z.enum([
  "OFFICIAL_SCHOOL_PAGE",
  "OFFICIAL_ADMISSION_PAGE",
  "OFFICIAL_NOTICE_BOARD",
  "OFFICIAL_DOCUMENT",
  "OFFICIAL_REGISTRY",
]);
export const artifactFactSchema = z
  .object({
    factType: z.enum([
      "OPERATING_INFO",
      "TARGET_AGE_GRADE",
      "TUITION",
      "CURRICULUM",
      "ELIGIBILITY",
      "TRANSPORT",
      "ADMISSION_PROCESS",
    ]),
    valueJson: z.record(z.string(), z.unknown()),
    displayText: text(1000),
    sourceUrl: url,
    evidenceExcerpt: text(1000),
    contentFingerprint: hash,
  })
  .strict();
export const artifactAdmissionSchema = z
  .object({
    academicYearLabel: z
      .string()
      .regex(/^20\d{2}학년도$/u)
      .nullable(),
    knowledgeState: z.enum(["SCHEDULE_FOUND", "NOT_ANNOUNCED", "NOT_FOUND"]),
    kind: z.enum(opportunityKindValues),
    businessState: z.enum(opportunityBusinessStateValues),
    title: text(500),
    summary: text(8000).nullable(),
    targetAudience: text(2000).nullable(),
    applicationOpenAt: artifactDate.nullable(),
    applicationCloseAt: artifactDate.nullable(),
    eventStartAt: artifactDate.nullable(),
    eventEndAt: artifactDate.nullable(),
    actionUrl: url,
    sourceUrl: url,
    evidenceExcerpt: text(2000),
    collectedAt: artifactDate,
    warnings,
    contentFingerprint: hash,
  })
  .strict();
export const bootstrapArtifactSchema = z
  .object({
    artifactVersion: z.literal(1),
    generatedAt: artifactDate,
    seedSha256: hash,
    target: z
      .object({
        institutionId: z.string().uuid(),
        slug: text(100),
        institutionName: text(200),
        category: z.literal("PRIVATE_ELEMENTARY"),
      })
      .strict(),
    classification: z.enum([
      "DETAIL_WITH_ADMISSION",
      "DETAIL_WITHOUT_ADMISSION",
      "BASELINE_ONLY",
      "TECHNICAL_FETCH_FAILED",
    ]),
    collection: z
      .object({
        websiteCollection: z.enum(["SUCCESS", "PARTIAL", "FETCH_FAILED"]),
        pagesScheduled: z.number().int().min(0).max(30),
        pagesFetched: z.number().int().min(0).max(30),
        pages: z
          .array(
            z
              .object({
                requestedUrl: url,
                canonicalUrl: url,
                finalUrl: url,
                httpStatus: z.number().int().min(200).max(299),
                contentType: text(200),
                collectedAt: artifactDate,
                responseBytes: z
                  .number()
                  .int()
                  .min(0)
                  .max(2 * 1024 * 1024),
                durationMs: z.number().int().min(0).max(120000),
                responseContentHash: hash,
                evidenceText: text(16000),
                evidenceTextHash: hash,
                contentFingerprint: hash,
              })
              .strict(),
          )
          .max(30),
        warnings,
        errors: warnings,
      })
      .strict(),
    sources: z
      .array(
        z
          .object({
            canonicalUrl: url,
            sourceType: artifactSourceType,
            authority: z.enum(["PRIMARY", "SECONDARY_OFFICIAL"]),
            sourceName: text(500),
          })
          .strict(),
      )
      .min(1)
      .max(31),
    facts: z.array(artifactFactSchema).min(1).max(7),
    admission: artifactAdmissionSchema.nullable(),
    artifactChecksum: hash,
  })
  .strict();

export type BootstrapArtifact = z.infer<typeof bootstrapArtifactSchema>;
