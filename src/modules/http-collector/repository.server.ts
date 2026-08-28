import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";

import {
  institutionSourceBindings,
  institutions,
  sourceMonitorConfigs,
  sourceObservations,
  sourceSnapshots,
  sources,
} from "@/src/db/schema";
import type {
  CollectorCrawlResult,
  RootCollectionFailureCode,
} from "@/src/modules/http-collector/crawler.server";
import type {
  DatabaseExecutor,
  TransactionExecutor,
} from "@/src/infrastructure/db/runtime.server";

export const HTTP_COLLECTOR_VERSION = "preppy-static-http/1.0";
export const HTTP_COLLECTOR_MAX_BATCH = 10;

export class CollectorEligibilityError extends Error {
  constructor(
    readonly code:
      | "INVALID_SOURCE_SCOPE"
      | "SOURCE_NOT_ELIGIBLE"
      | "SOURCE_BINDING_AMBIGUOUS",
    message: string,
  ) {
    super(message);
    this.name = "CollectorEligibilityError";
  }
}

export type EligibleOfficialMainSource = Readonly<{
  sourceId: string;
  institutionId: string;
  canonicalUrl: string;
  monitorConfigPresent: boolean;
}>;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function loadEligibleOfficialMainSources(
  executor: DatabaseExecutor,
  sourceIds: readonly string[],
): Promise<readonly EligibleOfficialMainSource[]> {
  if (
    sourceIds.length < 1 ||
    sourceIds.length > HTTP_COLLECTOR_MAX_BATCH ||
    new Set(sourceIds).size !== sourceIds.length ||
    sourceIds.some((sourceId) => !UUID.test(sourceId))
  ) {
    throw new CollectorEligibilityError(
      "INVALID_SOURCE_SCOPE",
      "Collector requires 1-10 distinct explicit Source UUIDs",
    );
  }
  const rows = await executor.drizzle
    .select({
      sourceId: sources.id,
      institutionId: institutions.id,
      canonicalUrl: sources.canonicalUrl,
      sourceType: sources.sourceType,
      sourceLifecycle: sources.lifecycleStatus,
      bindingRole: institutionSourceBindings.role,
      bindingActive: institutionSourceBindings.isActive,
      monitorId: sourceMonitorConfigs.id,
      monitorEnabled: sourceMonitorConfigs.isEnabled,
      collectionStrategy: sourceMonitorConfigs.collectionStrategy,
      browserRequired: sourceMonitorConfigs.browserRequired,
    })
    .from(sources)
    .innerJoin(
      institutionSourceBindings,
      eq(institutionSourceBindings.sourceId, sources.id),
    )
    .innerJoin(
      institutions,
      eq(institutions.id, institutionSourceBindings.institutionId),
    )
    .leftJoin(
      sourceMonitorConfigs,
      eq(sourceMonitorConfigs.sourceId, sources.id),
    )
    .where(inArray(sources.id, [...sourceIds]));

  const bySource = new Map<string, typeof rows>();
  for (const row of rows) {
    const existing = bySource.get(row.sourceId) ?? [];
    existing.push(row);
    bySource.set(row.sourceId, existing);
  }
  return Object.freeze(
    sourceIds.map((sourceId) => {
      const candidates = (bySource.get(sourceId) ?? []).filter(
        (row) =>
          row.bindingRole === "OFFICIAL_MAIN" &&
          row.bindingActive &&
          row.sourceType === "OFFICIAL_SCHOOL_PAGE" &&
          row.sourceLifecycle === "ACTIVE" &&
          (row.monitorId === null ||
            (row.monitorEnabled === true &&
              row.collectionStrategy === "HTTP" &&
              row.browserRequired === false)),
      );
      if (candidates.length === 0) {
        throw new CollectorEligibilityError(
          "SOURCE_NOT_ELIGIBLE",
          `Source ${sourceId} is not an eligible explicit OFFICIAL_MAIN HTTP input`,
        );
      }
      if (candidates.length !== 1) {
        throw new CollectorEligibilityError(
          "SOURCE_BINDING_AMBIGUOUS",
          `Source ${sourceId} has ambiguous eligible Institution bindings`,
        );
      }
      const row = candidates[0]!;
      return Object.freeze({
        sourceId: row.sourceId,
        institutionId: row.institutionId,
        canonicalUrl: row.canonicalUrl,
        monitorConfigPresent: row.monitorId !== null,
      });
    }),
  );
}

function bounded(
  value: string | null | undefined,
  maximum: number,
): string | null {
  if (!value) return null;
  return value.slice(0, maximum);
}

function rootResponse(result: CollectorCrawlResult) {
  return result.root.kind === "SUCCESS"
    ? result.root.response
    : (result.root.response ?? result.root.transportFailure);
}

function fetchClassification(result: CollectorCrawlResult): string {
  if (result.root.kind === "SUCCESS") return "FETCH_SUCCESS";
  if (result.root.code === "UNSUPPORTED_CONTENT_TYPE")
    return "UNSUPPORTED_CONTENT";
  if (result.root.code === "REDIRECT_EXTERNAL_HOST")
    return "REDIRECT_REVIEW_REQUIRED";
  if (
    result.root.code === "ROBOTS_BLOCKED" ||
    result.root.code === "ROBOTS_UNAVAILABLE_REVIEW_REQUIRED"
  ) {
    return result.root.code;
  }
  return "FETCH_FAILED";
}

function observationOutcome(
  code: RootCollectionFailureCode,
  status: number | null,
): string {
  if (code === "HTTP_4XX" && status === 404) return "NOT_FOUND";
  if (code === "PARSE_ERROR") return "PARSE_ERROR";
  if (code === "CONNECT_TIMEOUT" || code === "READ_TIMEOUT") return "TIMEOUT";
  if (code === "BODY_READ_ERROR" || code === "UNKNOWN_FETCH_ERROR") {
    return "OTHER_ERROR";
  }
  return "ACCESS_ERROR";
}

type ChangeClassification = "MARKUP_ONLY" | "TEXT_CHANGED" | null;

function buildObservationMetadata(
  result: CollectorCrawlResult,
  changeClassification: ChangeClassification,
): Record<string, unknown> {
  const evidence = rootResponse(result);
  const redirects =
    evidence?.redirectChain.slice(0, 6).map((redirect) => ({
      status: redirect.status,
      url: bounded(redirect.url, 1_024),
      location: bounded(redirect.location, 512),
      nextUrl: bounded(redirect.nextUrl, 1_024),
    })) ?? [];
  const robots = result.root.robotsDecision;
  const robotsDecisions = result.root.robotsDecisions
    .slice(0, 6)
    .map((entry) => ({
      origin: bounded(entry.origin, 2_048),
      robotsUrl: bounded(entry.robotsUrl, 2_048),
      decision: entry.decision,
      reason: entry.reason,
      robotsHttpStatus: entry.robotsHttpStatus,
      transportErrorCode: entry.transportErrorCode,
    }));
  const metadata: Record<string, unknown> = {
    collectorVersion: HTTP_COLLECTOR_VERSION,
    requestedUrl: bounded(evidence?.requestedUrl, 2_048),
    redirectChain: redirects,
    contentType: bounded(evidence?.contentType, 256),
    contentLengthHeader: bounded(evidence?.contentLengthHeader, 64),
    fetchClassification: fetchClassification(result),
    changeClassification,
    robotsDecision:
      robots === null
        ? null
        : {
            decision: robots.decision,
            reason: robots.reason,
            robotsHttpStatus: robots.robotsHttpStatus,
            transportErrorCode: robots.transportErrorCode,
          },
    robotsDecisions,
    budgetOutcome: result.budgetOutcomes.slice(0, 4),
  };
  if (JSON.stringify(metadata).length > 32_768) {
    throw new RangeError("Collector Observation metadata exceeded 32 KiB");
  }
  return metadata;
}

export type PersistedRootCollection = Readonly<{
  sourceId: string;
  outcome: string;
  errorCode: string | null;
  snapshotId: string | null;
  snapshotCreated: boolean;
  observationId: string;
  changeClassification: ChangeClassification;
}>;

export async function persistRootCollection(
  executor: TransactionExecutor,
  result: CollectorCrawlResult,
): Promise<PersistedRootCollection> {
  if (result.root.kind === "FAILURE") {
    const evidence = rootResponse(result);
    const status = evidence?.httpStatus ?? null;
    const [observation] = await executor.drizzle
      .insert(sourceObservations)
      .values({
        sourceId: result.sourceId,
        observedAt: evidence?.fetchedAt ?? new Date(),
        outcome: observationOutcome(result.root.code, status),
        httpStatus: status,
        finalUrl: evidence?.finalUrl ?? null,
        responseBytes:
          evidence === null || evidence === undefined
            ? null
            : BigInt(evidence.actualResponseBytes),
        durationMs: evidence?.elapsedMs ?? null,
        errorCode: result.root.code,
        errorMessage: bounded(result.root.message, 256),
        etag: result.root.response?.etag ?? null,
        lastModified: result.root.response?.lastModified ?? null,
        metadata: buildObservationMetadata(result, null),
      })
      .returning({ id: sourceObservations.id });
    return Object.freeze({
      sourceId: result.sourceId,
      outcome: observationOutcome(result.root.code, status),
      errorCode: result.root.code,
      snapshotId: null,
      snapshotCreated: false,
      observationId: observation!.id.toString(),
      changeClassification: null,
    });
  }

  const [previous] = await executor.drizzle
    .select({
      snapshotId: sourceObservations.snapshotId,
      contentHash: sourceObservations.contentHash,
      textHash: sourceObservations.textHash,
    })
    .from(sourceObservations)
    .where(
      and(
        eq(sourceObservations.sourceId, result.sourceId),
        inArray(sourceObservations.outcome, [
          "SUCCESS",
          "UNCHANGED",
          "CHANGED",
        ]),
      ),
    )
    .orderBy(
      desc(sourceObservations.observedAt),
      desc(sourceObservations.createdAt),
      desc(sourceObservations.id),
    )
    .limit(1);
  const [existing] = await executor.drizzle
    .select({ id: sourceSnapshots.id })
    .from(sourceSnapshots)
    .where(
      and(
        eq(sourceSnapshots.sourceId, result.sourceId),
        eq(sourceSnapshots.contentHash, result.root.contentHash),
      ),
    )
    .limit(1);
  let snapshotId = existing?.id ?? null;
  let snapshotCreated = false;
  if (snapshotId === null) {
    const mime =
      result.root.response.contentType?.split(";", 1)[0]?.trim() ?? null;
    const [inserted] = await executor.drizzle
      .insert(sourceSnapshots)
      .values({
        sourceId: result.sourceId,
        capturedAt: result.root.response.fetchedAt,
        contentHash: result.root.contentHash,
        textHash: result.root.textHash,
        normalizedText: result.root.normalizedText,
        rawBody: result.root.response.entityBytes,
        mimeType: mime,
        metadata: {
          collectorType: "HTTP",
          collectorVersion: HTTP_COLLECTOR_VERSION,
          requestedUrl: bounded(result.root.response.requestedUrl, 2_048),
          finalUrl: bounded(result.root.response.finalUrl, 2_048),
          responseBytes: result.root.response.actualResponseBytes,
          fetchOutcome: "FETCH_SUCCESS",
        },
      })
      .onConflictDoNothing({
        target: [sourceSnapshots.sourceId, sourceSnapshots.contentHash],
      })
      .returning({ id: sourceSnapshots.id });
    snapshotId = inserted?.id ?? null;
    snapshotCreated = inserted !== undefined;
    if (snapshotId === null) {
      const [raced] = await executor.drizzle
        .select({ id: sourceSnapshots.id })
        .from(sourceSnapshots)
        .where(
          and(
            eq(sourceSnapshots.sourceId, result.sourceId),
            eq(sourceSnapshots.contentHash, result.root.contentHash),
          ),
        )
        .limit(1);
      snapshotId = raced?.id ?? null;
    }
  }
  if (snapshotId === null)
    throw new Error("Collector Snapshot persistence failed");

  const outcome =
    previous === undefined
      ? "SUCCESS"
      : previous.contentHash === result.root.contentHash
        ? "UNCHANGED"
        : "CHANGED";
  const changeClassification: ChangeClassification =
    outcome !== "CHANGED"
      ? null
      : previous?.textHash === result.root.textHash
        ? "MARKUP_ONLY"
        : "TEXT_CHANGED";
  const [observation] = await executor.drizzle
    .insert(sourceObservations)
    .values({
      sourceId: result.sourceId,
      observedAt: result.root.response.fetchedAt,
      outcome,
      httpStatus: result.root.response.httpStatus,
      finalUrl: result.root.response.finalUrl,
      contentHash: result.root.contentHash,
      textHash: result.root.textHash,
      responseBytes: BigInt(result.root.response.actualResponseBytes),
      durationMs: result.root.response.elapsedMs,
      snapshotId,
      etag: result.root.response.etag,
      lastModified: result.root.response.lastModified,
      metadata: buildObservationMetadata(result, changeClassification),
    })
    .returning({ id: sourceObservations.id });
  return Object.freeze({
    sourceId: result.sourceId,
    outcome,
    errorCode: null,
    snapshotId,
    snapshotCreated,
    observationId: observation!.id.toString(),
    changeClassification,
  });
}
