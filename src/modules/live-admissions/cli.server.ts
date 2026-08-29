import "server-only";

import { readFile } from "node:fs/promises";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { sourceObservations, sourceSnapshots } from "@/src/db/schema";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
  type DatabaseExecutor,
  type RuntimeDatabaseResources,
} from "@/src/infrastructure/db/runtime.server";
import {
  DEFAULT_HTTP_COLLECTOR_POLICY,
  parseHttpCollectorPolicy,
} from "@/src/modules/http-collector/contracts";
import { toHttpCollectorOperatorReport } from "@/src/modules/http-collector/cli.server";
import { collectExplicitSources } from "@/src/modules/http-collector/service.server";

import { collectReviewedAdmissionSource } from "./collection.server";
import type { LiveAdmissionProposal } from "./contracts";
import { extractLiveAdmissionProposal } from "./extractor";
import { prepareLiveAdmissionDraft } from "./preparation.server";
import { reviewAndPublishLiveAdmissionDraft } from "./review.server";

const selectionEntrySchema = z
  .object({
    institutionId: z.uuid(),
    rootSourceId: z.uuid(),
    admissionUrl: z.url().max(2_048),
    sourceName: z.string().trim().min(1).max(200),
    sourceType: z.enum([
      "OFFICIAL_ADMISSION_PAGE",
      "OFFICIAL_NOTICE_BOARD",
      "OFFICIAL_APPLICATION_PORTAL",
      "OFFICIAL_SCHOOL_PAGE",
    ]),
    institutionBindingRole: z.enum(["ADMISSIONS", "APPLICATION"]),
    classificationHint: z.enum([
      "ADMISSIONS",
      "APPLICATION",
      "NOTICE",
      "OPEN_HOUSE",
      "TUITION",
    ]),
  })
  .strict()
  .refine((value) => {
    const protocol = new URL(value.admissionUrl).protocol;
    return protocol === "http:" || protocol === "https:";
  });

const fiveSchoolSelectionManifestSchema = z
  .object({
    targetAcademicYearLabel: z.string().regex(/^20\d{2}학년도$/u),
    entries: z.array(selectionEntrySchema).min(1).max(5),
  })
  .strict()
  .superRefine((value, context) => {
    for (const [field, values] of [
      ["institutionId", value.entries.map((entry) => entry.institutionId)],
      ["rootSourceId", value.entries.map((entry) => entry.rootSourceId)],
      ["admissionUrl", value.entries.map((entry) => entry.admissionUrl)],
    ] as const) {
      if (new Set(values).size !== values.length) {
        context.addIssue({
          code: "custom",
          path: ["entries"],
          message: `${field} must be unique in the bounded selection`,
        });
      }
    }
  });

const nullableIsoDateSchema = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value))
  .nullable();

const liveAdmissionProposalSchema = z
  .object({
    academicYearLabel: z
      .string()
      .regex(/^20\d{2}학년도$/u)
      .nullable(),
    knowledgeState: z.enum(["SCHEDULE_FOUND", "NOT_ANNOUNCED", "NOT_FOUND"]),
    kind: z.enum([
      "RECRUITMENT",
      "ADDITIONAL_RECRUITMENT",
      "INFORMATION_SESSION",
      "CONSULTATION",
      "LEVEL_TEST",
      "OPEN_HOUSE",
      "APPLICATION",
      "DOCUMENT_SUBMISSION",
      "ASSESSMENT",
      "INTERVIEW",
      "LOTTERY",
      "RESULT_ANNOUNCEMENT",
      "REGISTRATION",
      "DEADLINE",
      "OTHER",
    ]),
    businessState: z.enum([
      "UPCOMING",
      "OPEN",
      "CLOSED",
      "COMPLETED",
      "CANCELLED",
      "UNKNOWN",
    ]),
    title: z.string().trim().min(1).max(500),
    summary: z.string().trim().min(1).max(5_000).nullable(),
    targetAudience: z.string().trim().min(1).max(1_000).nullable(),
    eventStartAt: nullableIsoDateSchema,
    eventEndAt: nullableIsoDateSchema,
    applicationOpenAt: nullableIsoDateSchema,
    applicationCloseAt: nullableIsoDateSchema,
    actionUrl: z.url().max(2_048),
    evidenceExcerpt: z.string().max(2_000),
    warnings: z.array(z.string().trim().min(1).max(100)).max(20),
  })
  .strict();

const liveAdmissionReviewManifestSchema = z
  .object({
    institutionId: z.uuid(),
    opportunityId: z.uuid(),
    expectedVersionId: z.uuid(),
    expectedContentFingerprint: z.string().regex(/^[0-9a-f]{64}$/u),
    sourceId: z.uuid(),
    observationId: z.string().regex(/^[1-9]\d{0,18}$/u),
    snapshotId: z.uuid(),
    operatorAdminId: z.uuid(),
    approvedProposal: liveAdmissionProposalSchema,
  })
  .strict();

export type FiveSchoolSelectionManifest = z.output<
  typeof fiveSchoolSelectionManifestSchema
>;
export type LiveAdmissionReviewManifest = z.output<
  typeof liveAdmissionReviewManifestSchema
>;

export function parseFiveSchoolSelectionManifest(
  input: unknown,
): FiveSchoolSelectionManifest {
  return fiveSchoolSelectionManifestSchema.parse(input);
}

export function parseLiveAdmissionReviewManifest(
  input: unknown,
): LiveAdmissionReviewManifest {
  return liveAdmissionReviewManifestSchema.parse(input);
}

export type FiveSchoolLiveAdmissionCliOptions =
  | Readonly<{ mode: "calibrate"; sourceIds: readonly string[] }>
  | Readonly<{ mode: "prepare" | "review"; filePath: string }>;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const USAGE =
  "Usage: live-admissions (--calibrate --source-id <uuid>... | --prepare --file <json> | --review --file <one-record-json>)";

export function parseFiveSchoolLiveAdmissionCliArgs(
  arguments_: readonly string[],
): FiveSchoolLiveAdmissionCliOptions {
  const modes: Array<"calibrate" | "prepare" | "review"> = [];
  const sourceIds: string[] = [];
  let filePath: string | undefined;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]!;
    if (argument === "--calibrate") modes.push("calibrate");
    else if (argument === "--prepare") modes.push("prepare");
    else if (argument === "--review") modes.push("review");
    else if (argument === "--source-id") {
      const value = arguments_[index + 1];
      if (!value || value.startsWith("--")) throw new Error(USAGE);
      sourceIds.push(value);
      index += 1;
    } else if (argument.startsWith("--source-id=")) {
      sourceIds.push(argument.slice("--source-id=".length));
    } else if (argument === "--file") {
      const value = arguments_[index + 1];
      if (filePath !== undefined || !value || value.startsWith("--")) {
        throw new Error(USAGE);
      }
      filePath = value;
      index += 1;
    } else if (argument.startsWith("--file=")) {
      if (filePath !== undefined) throw new Error(USAGE);
      filePath = argument.slice("--file=".length);
    } else {
      throw new Error(USAGE);
    }
  }
  if (modes.length !== 1 || new Set(modes).size !== 1) {
    throw new Error(USAGE);
  }
  const mode = modes[0]!;
  if (mode === "calibrate") {
    if (
      filePath !== undefined ||
      sourceIds.length < 1 ||
      sourceIds.length > 10 ||
      new Set(sourceIds).size !== sourceIds.length ||
      sourceIds.some((sourceId) => !UUID.test(sourceId))
    ) {
      throw new Error(USAGE);
    }
    return Object.freeze({
      mode,
      sourceIds: Object.freeze(sourceIds),
    });
  }
  if (!filePath || sourceIds.length > 0) throw new Error(USAGE);
  return Object.freeze({ mode, filePath });
}

export function assertLocalLiveAdmissionDatabase(
  databaseUrl: string,
  testDatabaseUrl: string,
): void {
  if (databaseUrl !== testDatabaseUrl) {
    throw new Error(
      "DATABASE_URL and TEST_DATABASE_URL must match for live admissions",
    );
  }
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("Live admissions requires a valid local database URL");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("Live admissions requires PostgreSQL");
  }
  const hostname = url.hostname.toLowerCase();
  if (!["127.0.0.1", "localhost", "[::1]"].includes(hostname)) {
    throw new Error("Live admissions database must run on localhost");
  }
  const databaseName = url.pathname.slice(1);
  if (!/(?:^|_)(?:test|verify\d*)$/u.test(databaseName)) {
    throw new Error("Live admissions requires a dedicated test database");
  }
}

function charsetFromObservationMetadata(
  metadata: Record<string, unknown> | null,
): string {
  const contentType = metadata?.contentType;
  if (typeof contentType !== "string") return "utf-8";
  return (
    contentType.match(/(?:^|;)\s*charset\s*=\s*["']?([^;"'\s]+)/iu)?.[1] ??
    "utf-8"
  );
}

export async function loadCollectedHtml(
  executor: DatabaseExecutor,
  input: Readonly<{
    sourceId: string;
    observationId: string;
    snapshotId: string;
  }>,
): Promise<string> {
  const [row] = await executor.drizzle
    .select({
      rawBody: sourceSnapshots.rawBody,
      metadata: sourceObservations.metadata,
    })
    .from(sourceSnapshots)
    .innerJoin(
      sourceObservations,
      and(
        eq(sourceObservations.snapshotId, sourceSnapshots.id),
        eq(sourceObservations.sourceId, sourceSnapshots.sourceId),
      ),
    )
    .where(
      and(
        eq(sourceSnapshots.id, input.snapshotId),
        eq(sourceSnapshots.sourceId, input.sourceId),
        eq(sourceObservations.id, BigInt(input.observationId)),
      ),
    )
    .limit(1);
  if (row?.rawBody === null || row?.rawBody === undefined) {
    throw new Error("Collected admission Snapshot has no inline HTML body");
  }
  return new TextDecoder(charsetFromObservationMetadata(row.metadata), {
    fatal: false,
  }).decode(row.rawBody);
}

export function proposalReport(proposal: LiveAdmissionProposal) {
  return {
    ...proposal,
    eventStartAt: proposal.eventStartAt?.toISOString() ?? null,
    eventEndAt: proposal.eventEndAt?.toISOString() ?? null,
    applicationOpenAt: proposal.applicationOpenAt?.toISOString() ?? null,
    applicationCloseAt: proposal.applicationCloseAt?.toISOString() ?? null,
  };
}

export type FiveSchoolLiveAdmissionCliDependencies = Readonly<{
  databaseUrl?: string;
  testDatabaseUrl?: string;
  openRuntime?: () => RuntimeDatabaseResources;
  closeRuntime?: typeof closeRuntimeDatabase;
  collect?: typeof collectExplicitSources;
  collectReviewed?: typeof collectReviewedAdmissionSource;
  prepare?: typeof prepareLiveAdmissionDraft;
  review?: typeof reviewAndPublishLiveAdmissionDraft;
  readJsonFile?: (path: string) => Promise<unknown>;
  loadHtml?: typeof loadCollectedHtml;
  now?: () => Date;
}>;

async function defaultReadJsonFile(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

export async function runFiveSchoolLiveAdmissionCli(
  arguments_: readonly string[],
  dependencies: FiveSchoolLiveAdmissionCliDependencies = {},
) {
  const options = parseFiveSchoolLiveAdmissionCliArgs(arguments_);
  const databaseUrl = dependencies.databaseUrl ?? process.env.DATABASE_URL;
  const testDatabaseUrl =
    dependencies.testDatabaseUrl ?? process.env.TEST_DATABASE_URL;
  if (!databaseUrl || !testDatabaseUrl) {
    throw new Error(
      "DATABASE_URL and TEST_DATABASE_URL are required for live admissions",
    );
  }
  assertLocalLiveAdmissionDatabase(databaseUrl, testDatabaseUrl);
  const runtime = (dependencies.openRuntime ?? getRuntimeDatabase)();
  try {
    if (options.mode === "calibrate") {
      const policy = parseHttpCollectorPolicy({
        ...DEFAULT_HTTP_COLLECTOR_POLICY,
        maxDepth: 1,
        maxPagesPerInstitution: 10,
        maxLinksPerPage: 100,
        perHostConcurrency: 1,
      });
      const run = await (dependencies.collect ?? collectExplicitSources)(
        {
          sourceIds: options.sourceIds,
          mode: "dry-run",
          policy,
        },
        {
          executor: runtime.executor,
          transactionManager: runtime.transactionManager,
        },
      );
      return toHttpCollectorOperatorReport(run);
    }
    const raw = await (dependencies.readJsonFile ?? defaultReadJsonFile)(
      options.filePath,
    );
    if (options.mode === "review") {
      const manifest = parseLiveAdmissionReviewManifest(raw);
      return (dependencies.review ?? reviewAndPublishLiveAdmissionDraft)(
        manifest,
        {
          transactionManager: runtime.transactionManager,
          ...(dependencies.now ? { now: dependencies.now } : {}),
        },
      );
    }
    const manifest = parseFiveSchoolSelectionManifest(raw);
    const prepared = [];
    for (const entry of manifest.entries) {
      const collection = await (
        dependencies.collectReviewed ?? collectReviewedAdmissionSource
      )(entry, {
        executor: runtime.executor,
        transactionManager: runtime.transactionManager,
      });
      const html = await (dependencies.loadHtml ?? loadCollectedHtml)(
        runtime.executor,
        collection,
      );
      const proposal = extractLiveAdmissionProposal({
        html,
        sourceUrl: collection.canonicalUrl,
        classificationHint: entry.classificationHint,
        targetAcademicYearLabel: manifest.targetAcademicYearLabel,
        referenceTime: dependencies.now?.() ?? new Date(),
      });
      const draft = await (dependencies.prepare ?? prepareLiveAdmissionDraft)(
        {
          institutionId: entry.institutionId,
          sourceId: collection.sourceId,
          observationId: collection.observationId,
          snapshotId: collection.snapshotId,
          proposal,
        },
        {
          transactionManager: runtime.transactionManager,
          ...(dependencies.now ? { now: dependencies.now } : {}),
        },
      );
      prepared.push(
        Object.freeze({
          collection,
          proposal: proposalReport(proposal),
          draft,
        }),
      );
    }
    return Object.freeze({
      mode: "prepare" as const,
      targetAcademicYearLabel: manifest.targetAcademicYearLabel,
      records: Object.freeze(prepared),
    });
  } finally {
    await (dependencies.closeRuntime ?? closeRuntimeDatabase)();
  }
}
