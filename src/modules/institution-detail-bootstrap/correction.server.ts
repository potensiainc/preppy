import "server-only";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { z } from "zod";
import { opportunityBusinessStateValues } from "@/src/db/schema";
import {
  parseCollectorUrl,
  normalizeDiscoveryUrl,
} from "@/src/modules/http-collector/url-policy";
import { artifactChecksum } from "./artifact.server";
import { artifactDate } from "./artifact-schema";
import {
  PrivateElementaryBootstrapError,
  type PrivateElementaryBootstrapTarget,
} from "./contracts";

export const MAX_CORRECTION_BYTES = 10 * 1024 * 1024;
export const CORRECTION_SOURCE_MANIFEST_PATH =
  "data/corrections/private-elementary-official-sources.json";
const text = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((v) => v.trim().length > 0);
const url = text(2048);
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const factType = z.enum([
  "OPERATING_INFO",
  "TARGET_AGE_GRADE",
  "TUITION",
  "CURRICULUM",
  "TRANSPORT",
  "ELIGIBILITY",
  "ADMISSION_PROCESS",
]);
const sourceUrls = z.array(url).min(1).max(20);
const sourceSchema = z
  .object({
    requestedUrl: url,
    finalUrl: url,
    sourceName: text(500),
    sourceType: z.enum([
      "OFFICIAL_ADMISSION_PAGE",
      "OFFICIAL_NOTICE_BOARD",
      "OFFICIAL_DOCUMENT",
      "OFFICIAL_APPLICATION_PORTAL",
    ]),
    captureMethod: z.enum(["HTTP_ORIGINAL_MEDIA", "BROWSER_CAPTURE"]),
    httpStatus: z.number().int().min(200).max(299).nullable(),
    contentType: text(200),
    fetchedAt: artifactDate,
    responseBytes: z
      .number()
      .int()
      .min(1)
      .max(2 * 1024 * 1024)
      .nullable(),
    durationMs: z.number().int().min(0).max(120000).nullable(),
    responseContentHash: hash,
    evidenceText: text(16000),
    evidenceTextHash: hash,
  })
  .strict();
const admissionSchema = z
  .object({
    key: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
      .max(80),
    academicYearLabel: z.enum(["2026학년도", "2027학년도"]).nullable(),
    rawAcademicYear: text(100).nullable(),
    knowledgeState: z.enum([
      "SCHEDULE_FOUND",
      "GUIDANCE_FOUND",
      "NOT_ANNOUNCED",
    ]),
    kind: z.enum([
      "RECRUITMENT",
      "INFORMATION_SESSION",
      "LOTTERY",
      "RESULT_ANNOUNCEMENT",
    ]),
    businessState: z.enum(opportunityBusinessStateValues),
    title: text(500),
    summary: text(8000).nullable(),
    targetAudience: text(2000).nullable(),
    applicationOpenAt: artifactDate.nullable(),
    applicationCloseAt: artifactDate.nullable(),
    eventStartAt: artifactDate.nullable(),
    eventEndAt: artifactDate.nullable(),
    actionUrl: url,
    sourceUrls,
    evidenceExcerpt: text(2000),
  })
  .strict();
const schoolSchema = z
  .object({
    target: z
      .object({
        institutionId: z.string().uuid(),
        slug: text(100),
        institutionName: text(200),
        category: z.literal("PRIVATE_ELEMENTARY"),
      })
      .strict(),
    reviewedAt: artifactDate,
    sources: z.array(sourceSchema).min(1).max(20),
    admissions: z.array(admissionSchema).min(1).max(20),
    facts: z
      .array(
        z
          .object({
            factType,
            displayText: text(1000),
            evidenceExcerpt: text(2000),
            sourceUrls,
            valueJson: z.record(z.string(), z.unknown()),
          })
          .strict(),
      )
      .max(7),
    retireFacts: z
      .array(
        z
          .object({
            factType,
            versionId: z.string().uuid(),
            expectedDisplayText: text(1000),
            reason: text(2000),
          })
          .strict(),
      )
      .max(7),
  })
  .strict();
export const correctionBundleSchema = z
  .object({
    correctionVersion: z.literal(1),
    generatedAt: artifactDate,
    seedSha256: hash,
    schools: z.array(schoolSchema).length(41),
    artifactChecksum: hash,
  })
  .strict();
const manifestSchema = z
  .object({
    manifestVersion: z.literal(1),
    schools: z
      .array(
        z
          .object({
            institutionId: z.string().uuid(),
            slug: text(100),
            urls: z.array(url).min(1).max(100),
          })
          .strict(),
      )
      .length(41),
  })
  .strict();
export type CorrectionBundle = z.infer<typeof correctionBundleSchema>;
export type CorrectionSchool = CorrectionBundle["schools"][number];
export const correctionChecksum = artifactChecksum;
function reject(reason: string): never {
  throw new PrivateElementaryBootstrapError(
    "ARTIFACT_REJECTED",
    `Correction rejected: ${reason}`,
  );
}
function exactUrl(value: string, allowed: Set<string>) {
  const parsed = parseCollectorUrl(value);
  if (
    parsed.hash ||
    parsed.port ||
    isIP(parsed.hostname) ||
    /(?:^|\.)(?:localhost|local|internal)$/iu.test(parsed.hostname) ||
    normalizeDiscoveryUrl(value) !== value ||
    !allowed.has(value)
  )
    reject("untrusted source URL");
}
export function validateCorrectionBundle(
  value: unknown,
  targets: readonly PrivateElementaryBootstrapTarget[],
  seedSha256: string,
  trustedManifest: unknown,
  now = new Date(),
): CorrectionBundle {
  if (Buffer.byteLength(JSON.stringify(value) ?? "") > MAX_CORRECTION_BYTES)
    reject("size");
  const parsed = correctionBundleSchema.safeParse(value);
  const manifest = manifestSchema.safeParse(trustedManifest);
  if (!parsed.success || !manifest.success) reject("shape");
  const bundle = parsed.data;
  if (
    bundle.artifactChecksum !== correctionChecksum(bundle) ||
    bundle.seedSha256 !== seedSha256
  )
    reject("checksum");
  if (
    targets.length !== 41 ||
    new Set(targets.map((t) => t.slug)).size !== 41 ||
    targets.some((t) => t.category !== "PRIVATE_ELEMENTARY")
  )
    reject("target scope");
  if (
    new Set(bundle.schools.map((s) => s.target.slug)).size !== 41 ||
    new Set(bundle.schools.map((s) => s.target.institutionId)).size !== 41 ||
    new Set(manifest.data.schools.map((s) => s.slug)).size !== 41
  )
    reject("duplicate identity");
  const generated = Date.parse(bundle.generatedAt);
  if (
    !Number.isFinite(now.getTime()) ||
    generated > now.getTime() + 300000 ||
    now.getTime() - generated > 7 * 86400000
  )
    reject("stale or future artifact");
  for (const school of bundle.schools) {
    const target = targets.find((t) => t.slug === school.target.slug);
    const trusted = manifest.data.schools.find(
      (t) => t.slug === school.target.slug,
    );
    if (
      !target ||
      !trusted ||
      target.institutionName !== school.target.institutionName ||
      (target.institutionId !== null &&
        target.institutionId !== school.target.institutionId) ||
      trusted.institutionId !== school.target.institutionId
    )
      reject("institution identity");
    const reviewed = Date.parse(school.reviewedAt);
    if (reviewed > generated || now.getTime() - reviewed > 7 * 86400000)
      reject("review chronology");
    const allowed = new Set(trusted.urls);
    const pages = new Map(school.sources.map((s) => [s.requestedUrl, s]));
    if (pages.size !== school.sources.length) reject("duplicate source");
    for (const page of school.sources) {
      exactUrl(page.requestedUrl, allowed);
      exactUrl(page.finalUrl, allowed);
      if (
        Date.parse(page.fetchedAt) > reviewed ||
        now.getTime() - Date.parse(page.fetchedAt) > 7 * 86400000
      )
        reject("fetch chronology");
      if (
        page.evidenceTextHash !==
        createHash("sha256").update(page.evidenceText).digest("hex")
      )
        reject("evidence hash");
      if (
        page.captureMethod === "HTTP_ORIGINAL_MEDIA"
          ? page.httpStatus === null ||
            page.responseBytes === null ||
            page.durationMs === null
          : page.httpStatus !== null ||
            page.responseBytes !== null ||
            page.durationMs !== null
      )
        reject("capture metadata");
      if (
        !/^(?:text\/(?:html|plain)|application\/(?:xhtml\+xml|pdf|octet-stream|haansofthwp|x-hwp|hwp\+zip)|image\/(?:png|jpeg|gif|webp))(?:;|$)/iu.test(
          page.contentType,
        )
      )
        reject("media type");
    }
    const evidence = (urls: string[], excerpt: string) => {
      if (new Set(urls).size !== urls.length || urls.some((u) => !pages.has(u)))
        reject("field source mapping");
      if (!urls.some((u) => pages.get(u)!.evidenceText.includes(excerpt)))
        reject("field evidence");
    };
    if (
      new Set(school.facts.map((f) => f.factType)).size !==
        school.facts.length ||
      new Set(school.retireFacts.map((f) => f.factType)).size !==
        school.retireFacts.length
    )
      reject("duplicate fact");
    for (const fact of school.facts)
      evidence(fact.sourceUrls, fact.evidenceExcerpt);
    if (
      new Set(school.admissions.map((a) => a.key)).size !==
        school.admissions.length ||
      school.admissions.filter((a) => a.key === "main").length !== 1
    )
      reject("admission identity");
    const main = school.admissions.find((a) => a.key === "main")!;
    for (const admission of school.admissions) {
      evidence(admission.sourceUrls, admission.evidenceExcerpt);
      exactUrl(admission.actionUrl, allowed);
      if (admission.academicYearLabel !== main.academicYearLabel)
        reject("mixed admission cycle");
      const rawYear = admission.rawAcademicYear?.match(
        /^(20\d{2})\s*(?:학년도|년도)$/u,
      )?.[1];
      if (
        admission.academicYearLabel === null
          ? admission.rawAcademicYear !== null
          : !rawYear ||
            `${rawYear}학년도` !== admission.academicYearLabel ||
            !admission.sourceUrls.some((u) =>
              pages.get(u)!.evidenceText.includes(admission.rawAcademicYear!),
            )
      )
        reject("academic year evidence");
      for (const [start, end] of [
        [admission.applicationOpenAt, admission.applicationCloseAt],
        [admission.eventStartAt, admission.eventEndAt],
      ])
        if (start && end && start > end) reject("backward dates");
      const hasDates = [
        admission.applicationOpenAt,
        admission.applicationCloseAt,
        admission.eventStartAt,
        admission.eventEndAt,
      ].some(Boolean);
      if (
        admission.knowledgeState === "SCHEDULE_FOUND"
          ? !hasDates
          : hasDates || admission.businessState !== "UNKNOWN"
      )
        reject("knowledge semantics");
      if (
        admission.kind !== "RECRUITMENT" &&
        (admission.applicationOpenAt ||
          admission.applicationCloseAt ||
          !admission.eventStartAt)
      )
        reject("event semantics");
      if (admission.key !== "main" && admission.kind === "RECRUITMENT")
        reject("duplicate recruitment");
    }
  }
  return bundle;
}
