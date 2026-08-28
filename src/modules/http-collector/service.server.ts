import "server-only";

import type {
  TransactionManager,
  DatabaseExecutor,
} from "@/src/infrastructure/db/runtime.server";

import {
  DEFAULT_HTTP_COLLECTOR_POLICY,
  parseHttpCollectorPolicy,
  type HttpCollectorPolicy,
} from "./contracts";
import {
  crawlOfficialMainRoot,
  type CollectorCrawlResult,
} from "./crawler.server";
import {
  createNodeHttpTransport,
  type StaticHttpTransport,
} from "./http-transport.server";
import { createRequestPolitenessGate } from "./politeness.server";
import {
  loadEligibleOfficialMainSources,
  persistRootCollection,
  type PersistedRootCollection,
} from "./repository.server";
import { createRobotsPolicy } from "./robots.server";
import {
  createRunByteBudgetLedger,
  snapshotRunByteBudget,
  type RunByteBudgetEvidence,
} from "./run-budget";

export type HttpCollectorRunReport = Readonly<{
  mode: "dry-run" | "apply";
  applied: boolean;
  policy: HttpCollectorPolicy;
  sources: readonly CollectorCrawlResult[];
  persistence: readonly PersistedRootCollection[];
  runBudget: RunByteBudgetEvidence;
}>;

export async function collectExplicitSources(
  input: Readonly<{
    sourceIds: readonly string[];
    mode: "dry-run" | "apply";
    policy?: HttpCollectorPolicy;
  }>,
  dependencies: Readonly<{
    executor: DatabaseExecutor;
    transactionManager: TransactionManager;
    baseTransport?: StaticHttpTransport;
    now?: () => Date;
    sleep?: (milliseconds: number) => Promise<void>;
    clockMs?: () => number;
  }>,
): Promise<HttpCollectorRunReport> {
  const policy =
    input.policy === undefined
      ? DEFAULT_HTTP_COLLECTOR_POLICY
      : parseHttpCollectorPolicy(input.policy);
  const eligible = await loadEligibleOfficialMainSources(
    dependencies.executor,
    input.sourceIds,
  );
  const transport = dependencies.baseTransport ?? createNodeHttpTransport();
  const runBudget = createRunByteBudgetLedger(policy.maxTotalBytesPerRun);
  const beforeRequest = createRequestPolitenessGate({
    policy,
    ...(dependencies.sleep ? { sleep: dependencies.sleep } : {}),
    ...(dependencies.clockMs ? { clockMs: dependencies.clockMs } : {}),
  });
  const robots = createRobotsPolicy({
    transport,
    policy,
    beforeRequest,
    runBudget,
  });
  const sources: CollectorCrawlResult[] = [];
  for (const source of eligible) {
    if (runBudget.exhausted) break;
    sources.push(
      await crawlOfficialMainRoot(
        {
          sourceId: source.sourceId,
          institutionId: source.institutionId,
          requestedUrl: source.canonicalUrl,
        },
        {
          policy,
          transport,
          robots,
          beforeRequest,
          runBudget,
          ...(dependencies.now ? { now: dependencies.now } : {}),
          sleep: async () => undefined,
        },
      ),
    );
  }
  if (input.mode === "dry-run") {
    return Object.freeze({
      mode: "dry-run",
      applied: false,
      policy,
      sources: Object.freeze(sources),
      persistence: Object.freeze([]),
      runBudget: snapshotRunByteBudget(runBudget),
    });
  }
  const persistence: PersistedRootCollection[] = [];
  for (let index = 0; index < sources.length; index += 1) {
    const before = eligible[index]!;
    const result = sources[index]!;
    persistence.push(
      await dependencies.transactionManager.run(async (executor) => {
        const [current] = await loadEligibleOfficialMainSources(executor, [
          before.sourceId,
        ]);
        if (
          current === undefined ||
          before.sourceId !== current.sourceId ||
          before.institutionId !== current.institutionId ||
          before.canonicalUrl !== current.canonicalUrl
        ) {
          throw new Error(
            "Collector Source eligibility changed during collection",
          );
        }
        return persistRootCollection(executor, result);
      }),
    );
  }
  return Object.freeze({
    mode: "apply",
    applied: true,
    policy,
    sources: Object.freeze(sources),
    persistence: Object.freeze(persistence),
    runBudget: snapshotRunByteBudget(runBudget),
  });
}
