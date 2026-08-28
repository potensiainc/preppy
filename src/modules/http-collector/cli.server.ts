import "server-only";

import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
  type RuntimeDatabaseResources,
} from "@/src/infrastructure/db/runtime.server";

import {
  collectExplicitSources,
  type HttpCollectorRunReport,
} from "./service.server";
import { HTTP_COLLECTOR_MAX_BATCH } from "./repository.server";

export type HttpCollectorCliOptions = Readonly<{
  sourceIds: readonly string[];
  mode: "dry-run" | "apply";
}>;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const USAGE =
  "Usage: npm run collector:http -- --source-id <uuid> [--source-id <uuid> ...] [--dry-run|--apply]";

export function parseHttpCollectorCliArgs(
  arguments_: readonly string[],
): HttpCollectorCliOptions {
  const sourceIds: string[] = [];
  let dryRun = false;
  let apply = false;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]!;
    if (argument === "--source-id") {
      const sourceId = arguments_[index + 1];
      if (!sourceId || sourceId.startsWith("--")) throw new Error(USAGE);
      sourceIds.push(sourceId);
      index += 1;
    } else if (argument.startsWith("--source-id=")) {
      sourceIds.push(argument.slice("--source-id=".length));
    } else if (argument === "--dry-run") {
      if (dryRun) throw new Error(USAGE);
      dryRun = true;
    } else if (argument === "--apply") {
      if (apply) throw new Error(USAGE);
      apply = true;
    } else {
      throw new Error(USAGE);
    }
  }
  if (
    sourceIds.length < 1 ||
    sourceIds.length > HTTP_COLLECTOR_MAX_BATCH ||
    sourceIds.some((sourceId) => !UUID.test(sourceId)) ||
    new Set(sourceIds).size !== sourceIds.length ||
    (dryRun && apply)
  ) {
    throw new Error(USAGE);
  }
  return Object.freeze({
    sourceIds: Object.freeze(sourceIds),
    mode: apply ? "apply" : "dry-run",
  });
}

function safeUrl(value: string | null): string | null {
  if (value === null) return null;
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    return url.href.slice(0, 2_048);
  } catch {
    return null;
  }
}

function redirectReport(
  redirects: readonly Readonly<{
    status: number;
    url: string;
    location: string;
    nextUrl: string;
  }>[],
) {
  return redirects.slice(0, 6).map((redirect) => ({
    status: redirect.status,
    url: safeUrl(redirect.url),
    location: redirect.location.slice(0, 512),
    nextUrl: safeUrl(redirect.nextUrl),
  }));
}

export function toHttpCollectorOperatorReport(run: HttpCollectorRunReport) {
  return {
    mode: run.mode,
    applied: run.applied,
    policy: run.policy,
    runBudget: run.runBudget,
    sources: run.sources.map((source) => {
      const root = source.root;
      const evidence =
        root.kind === "SUCCESS"
          ? root.response
          : (root.response ?? root.transportFailure);
      return {
        sourceId: source.sourceId,
        institutionId: source.institutionId,
        root: {
          kind: root.kind,
          errorCode: root.kind === "FAILURE" ? root.code : null,
          requestedUrl: safeUrl(evidence?.requestedUrl ?? null),
          finalUrl: safeUrl(evidence?.finalUrl ?? null),
          redirectChain: redirectReport(evidence?.redirectChain ?? []),
          httpStatus: evidence?.httpStatus ?? null,
          contentType: evidence?.contentType?.slice(0, 256) ?? null,
          contentLengthHeader:
            evidence?.contentLengthHeader?.slice(0, 64) ?? null,
          responseBytes: evidence?.actualResponseBytes ?? 0,
          fetchedAt: evidence?.fetchedAt.toISOString() ?? null,
          elapsedMs: evidence?.elapsedMs ?? 0,
          contentHash: root.kind === "SUCCESS" ? root.contentHash : null,
          textHash: root.kind === "SUCCESS" ? root.textHash : null,
          robotsDecision:
            root.robotsDecision === null
              ? null
              : {
                  decision: root.robotsDecision.decision,
                  reason: root.robotsDecision.reason,
                  robotsHttpStatus: root.robotsDecision.robotsHttpStatus,
                  transportErrorCode: root.robotsDecision.transportErrorCode,
                },
          robotsDecisions: root.robotsDecisions.slice(0, 6).map((decision) => ({
            origin: safeUrl(decision.origin),
            robotsUrl: safeUrl(decision.robotsUrl),
            decision: decision.decision,
            reason: decision.reason,
            robotsHttpStatus: decision.robotsHttpStatus,
            transportErrorCode: decision.transportErrorCode,
          })),
        },
        pagesScheduled: source.pagesScheduled,
        pagesFetched: source.pagesFetched,
        totalResponseBytes: source.totalResponseBytes,
        budgetOutcomes: source.budgetOutcomes,
        candidates: source.candidates.slice(0, 7_500).map((candidate) => ({
          url: safeUrl(candidate.url),
          normalizedUrl: safeUrl(candidate.normalizedUrl),
          sourcePageUrl: safeUrl(candidate.sourcePageUrl),
          anchorText: candidate.anchorText.slice(0, 256),
          discoveryDepth: candidate.discoveryDepth,
          discoveredAt: candidate.discoveredAt.toISOString(),
          classificationHint: candidate.classificationHint,
          sameDomain: candidate.sameDomain,
          reasonSelectedOrRejected: candidate.reasonSelectedOrRejected,
          fetchOutcome: candidate.fetchOutcome,
        })),
      };
    }),
    persistence: run.persistence,
  };
}

export async function runHttpCollectorCli(
  arguments_: readonly string[],
  dependencies: Readonly<{
    openRuntime?: () => RuntimeDatabaseResources;
    closeRuntime?: typeof closeRuntimeDatabase;
    collect?: typeof collectExplicitSources;
  }> = {},
) {
  const options = parseHttpCollectorCliArgs(arguments_);
  const runtime = (dependencies.openRuntime ?? getRuntimeDatabase)();
  try {
    const run = await (dependencies.collect ?? collectExplicitSources)(
      options,
      {
        executor: runtime.executor,
        transactionManager: runtime.transactionManager,
      },
    );
    return toHttpCollectorOperatorReport(run);
  } finally {
    await (dependencies.closeRuntime ?? closeRuntimeDatabase)();
  }
}
