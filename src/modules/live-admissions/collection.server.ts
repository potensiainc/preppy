import "server-only";

import { and, eq } from "drizzle-orm";

import {
  institutionSourceBindings,
  sources,
  type InstitutionSourceBindingRole,
  type SourceType,
} from "@/src/db/schema";
import type {
  DatabaseExecutor,
  TransactionManager,
} from "@/src/infrastructure/db/runtime.server";
import {
  DEFAULT_HTTP_COLLECTOR_POLICY,
  parseHttpCollectorPolicy,
} from "@/src/modules/http-collector/contracts";
import { crawlOfficialMainRoot } from "@/src/modules/http-collector/crawler.server";
import {
  createNodeHttpTransport,
  type StaticHttpTransport,
} from "@/src/modules/http-collector/http-transport.server";
import { createRequestPolitenessGate } from "@/src/modules/http-collector/politeness.server";
import {
  loadEligibleOfficialMainSources,
  persistRootCollection,
} from "@/src/modules/http-collector/repository.server";
import { createRobotsPolicy } from "@/src/modules/http-collector/robots.server";
import { createRunByteBudgetLedger } from "@/src/modules/http-collector/run-budget";
import {
  isSameDiscoveryDomain,
  normalizeDiscoveryUrl,
} from "@/src/modules/http-collector/url-policy";

const reviewedSourceTypes = [
  "OFFICIAL_ADMISSION_PAGE",
  "OFFICIAL_NOTICE_BOARD",
  "OFFICIAL_APPLICATION_PORTAL",
  "OFFICIAL_SCHOOL_PAGE",
] as const satisfies readonly SourceType[];
const reviewedSourceTypeSet = new Set<SourceType>(reviewedSourceTypes);

const reviewedBindingRoles = [
  "ADMISSIONS",
  "APPLICATION",
] as const satisfies readonly InstitutionSourceBindingRole[];

export class ReviewedAdmissionSourceError extends Error {
  constructor(
    readonly code:
      | "ROOT_SOURCE_MISMATCH"
      | "EXTERNAL_ADMISSION_URL"
      | "SOURCE_CONFLICT"
      | "COLLECTION_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "ReviewedAdmissionSourceError";
  }
}

export type ReviewedAdmissionSourceInput = Readonly<{
  institutionId: string;
  rootSourceId: string;
  admissionUrl: string;
  sourceName: string;
  sourceType: (typeof reviewedSourceTypes)[number];
  institutionBindingRole: "ADMISSIONS" | "APPLICATION";
}>;

export type ReviewedAdmissionCollection = Readonly<{
  institutionId: string;
  sourceId: string;
  canonicalUrl: string;
  snapshotId: string;
  observationId: string;
  collectedAt: string;
  pagesFetched: number;
  snapshotCreated: boolean;
}>;

export async function collectReviewedAdmissionSource(
  input: ReviewedAdmissionSourceInput,
  dependencies: Readonly<{
    executor: DatabaseExecutor;
    transactionManager: TransactionManager;
    baseTransport?: StaticHttpTransport;
    now?: () => Date;
    sleep?: (milliseconds: number) => Promise<void>;
    clockMs?: () => number;
  }>,
): Promise<ReviewedAdmissionCollection> {
  if (!reviewedSourceTypes.includes(input.sourceType)) {
    throw new ReviewedAdmissionSourceError(
      "SOURCE_CONFLICT",
      "Reviewed Source type is not eligible for this bounded workflow",
    );
  }
  if (!reviewedBindingRoles.includes(input.institutionBindingRole)) {
    throw new ReviewedAdmissionSourceError(
      "SOURCE_CONFLICT",
      "Reviewed Institution Source role is not eligible",
    );
  }
  const canonicalUrl = normalizeDiscoveryUrl(input.admissionUrl);
  const [root] = await loadEligibleOfficialMainSources(dependencies.executor, [
    input.rootSourceId,
  ]);
  if (root === undefined || root.institutionId !== input.institutionId) {
    throw new ReviewedAdmissionSourceError(
      "ROOT_SOURCE_MISMATCH",
      "OFFICIAL_MAIN Source does not belong to the selected Institution",
    );
  }
  if (!isSameDiscoveryDomain(root.canonicalUrl, canonicalUrl)) {
    throw new ReviewedAdmissionSourceError(
      "EXTERNAL_ADMISSION_URL",
      "Reviewed admission URL must stay on the OFFICIAL_MAIN discovery domain",
    );
  }

  const promoted = await dependencies.transactionManager.run(
    async (executor) => {
      const [lockedRoot] = await loadEligibleOfficialMainSources(executor, [
        input.rootSourceId,
      ]);
      if (
        lockedRoot === undefined ||
        lockedRoot.institutionId !== input.institutionId ||
        !isSameDiscoveryDomain(lockedRoot.canonicalUrl, canonicalUrl)
      ) {
        throw new ReviewedAdmissionSourceError(
          "ROOT_SOURCE_MISMATCH",
          "OFFICIAL_MAIN Source eligibility changed during promotion",
        );
      }
      const isReviewedRoot =
        normalizeDiscoveryUrl(lockedRoot.canonicalUrl) === canonicalUrl;
      if (isReviewedRoot && input.sourceType !== "OFFICIAL_SCHOOL_PAGE") {
        throw new ReviewedAdmissionSourceError(
          "SOURCE_CONFLICT",
          "Reviewed root Source type must remain OFFICIAL_SCHOOL_PAGE",
        );
      }
      let [source] = await executor.drizzle
        .select({
          id: sources.id,
          sourceType: sources.sourceType,
          authorityLevel: sources.authorityLevel,
          lifecycleStatus: sources.lifecycleStatus,
          requiresJs: sources.requiresJs,
        })
        .from(sources)
        .where(
          isReviewedRoot
            ? eq(sources.id, lockedRoot.sourceId)
            : eq(sources.canonicalUrl, canonicalUrl),
        )
        .limit(1);
      if (source === undefined) {
        [source] = await executor.drizzle
          .insert(sources)
          .values({
            canonicalUrl,
            sourceType: input.sourceType,
            authorityLevel: "PRIMARY",
            lifecycleStatus: "ACTIVE",
            sourceName: input.sourceName,
            requiresJs: false,
            contentTypeHint: "text/html",
          })
          .onConflictDoNothing({ target: sources.canonicalUrl })
          .returning({
            id: sources.id,
            sourceType: sources.sourceType,
            authorityLevel: sources.authorityLevel,
            lifecycleStatus: sources.lifecycleStatus,
            requiresJs: sources.requiresJs,
          });
        if (source === undefined) {
          [source] = await executor.drizzle
            .select({
              id: sources.id,
              sourceType: sources.sourceType,
              authorityLevel: sources.authorityLevel,
              lifecycleStatus: sources.lifecycleStatus,
              requiresJs: sources.requiresJs,
            })
            .from(sources)
            .where(eq(sources.canonicalUrl, canonicalUrl))
            .limit(1);
        }
      }
      if (
        source === undefined ||
        source.sourceType !== input.sourceType ||
        !reviewedSourceTypeSet.has(source.sourceType as SourceType) ||
        source.authorityLevel !== "PRIMARY" ||
        source.lifecycleStatus !== "ACTIVE" ||
        source.requiresJs
      ) {
        throw new ReviewedAdmissionSourceError(
          "SOURCE_CONFLICT",
          "Canonical URL is already owned by an incompatible Source",
        );
      }
      const activeBindings = await executor.drizzle
        .select({ institutionId: institutionSourceBindings.institutionId })
        .from(institutionSourceBindings)
        .where(
          and(
            eq(institutionSourceBindings.sourceId, source.id),
            eq(institutionSourceBindings.isActive, true),
          ),
        );
      if (
        activeBindings.some(
          (binding) => binding.institutionId !== input.institutionId,
        )
      ) {
        throw new ReviewedAdmissionSourceError(
          "SOURCE_CONFLICT",
          "Reviewed Source is already active for another Institution",
        );
      }
      const [binding] = await executor.drizzle
        .select({ isActive: institutionSourceBindings.isActive })
        .from(institutionSourceBindings)
        .where(
          and(
            eq(institutionSourceBindings.institutionId, input.institutionId),
            eq(institutionSourceBindings.sourceId, source.id),
            eq(institutionSourceBindings.role, input.institutionBindingRole),
          ),
        )
        .limit(1);
      if (binding !== undefined && !binding.isActive) {
        throw new ReviewedAdmissionSourceError(
          "SOURCE_CONFLICT",
          "Reviewed Source binding exists but is inactive",
        );
      }
      if (binding === undefined) {
        await executor.drizzle.insert(institutionSourceBindings).values({
          institutionId: input.institutionId,
          sourceId: source.id,
          role: input.institutionBindingRole,
          isPrimary: true,
          isActive: true,
        });
      }
      return Object.freeze({ sourceId: source.id });
    },
  );

  const policy = parseHttpCollectorPolicy({
    ...DEFAULT_HTTP_COLLECTOR_POLICY,
    maxDepth: 0,
    maxPagesPerInstitution: 1,
    maxLinksPerPage: 100,
    perHostConcurrency: 1,
    globalConcurrency: 1,
  });
  const transport = dependencies.baseTransport ?? createNodeHttpTransport();
  const runBudget = createRunByteBudgetLedger(policy.maxTotalBytesPerRun);
  const beforeRequest = createRequestPolitenessGate({
    policy,
    ...(dependencies.sleep ? { sleep: dependencies.sleep } : {}),
    ...(dependencies.clockMs ? { clockMs: dependencies.clockMs } : {}),
  });
  const result = await crawlOfficialMainRoot(
    {
      sourceId: promoted.sourceId,
      institutionId: input.institutionId,
      requestedUrl: canonicalUrl,
    },
    {
      policy,
      transport,
      robots: createRobotsPolicy({
        transport,
        policy,
        beforeRequest,
        runBudget,
      }),
      beforeRequest,
      runBudget,
      ...(dependencies.now ? { now: dependencies.now } : {}),
      sleep: async () => undefined,
    },
  );
  const persisted = await dependencies.transactionManager.run(
    async (executor) => {
      const [binding] = await executor.drizzle
        .select({
          institutionId: institutionSourceBindings.institutionId,
          canonicalUrl: sources.canonicalUrl,
        })
        .from(institutionSourceBindings)
        .innerJoin(sources, eq(sources.id, institutionSourceBindings.sourceId))
        .where(
          and(
            eq(institutionSourceBindings.institutionId, input.institutionId),
            eq(institutionSourceBindings.sourceId, promoted.sourceId),
            eq(institutionSourceBindings.role, input.institutionBindingRole),
            eq(institutionSourceBindings.isActive, true),
            eq(sources.lifecycleStatus, "ACTIVE"),
          ),
        )
        .limit(1);
      if (
        binding === undefined ||
        normalizeDiscoveryUrl(binding.canonicalUrl) !== canonicalUrl
      ) {
        throw new ReviewedAdmissionSourceError(
          "SOURCE_CONFLICT",
          "Reviewed Source eligibility changed during collection",
        );
      }
      return persistRootCollection(executor, result);
    },
  );
  if (result.root.kind !== "SUCCESS" || persisted.snapshotId === null) {
    throw new ReviewedAdmissionSourceError(
      "COLLECTION_FAILED",
      `Reviewed Source collection failed: ${
        result.root.kind === "FAILURE" ? result.root.code : "NO_SNAPSHOT"
      }`,
    );
  }
  return Object.freeze({
    institutionId: input.institutionId,
    sourceId: promoted.sourceId,
    canonicalUrl,
    snapshotId: persisted.snapshotId,
    observationId: persisted.observationId,
    collectedAt: result.root.response.fetchedAt.toISOString(),
    pagesFetched: result.pagesFetched,
    snapshotCreated: persisted.snapshotCreated,
  });
}
