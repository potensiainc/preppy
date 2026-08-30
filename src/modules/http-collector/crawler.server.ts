import type { HttpCollectorPolicy } from "./contracts";
import {
  classifyCandidate,
  type CandidateClassification,
} from "./classification";
import { analyzeHtml } from "./html";
import { sha256Hex } from "./hash";
import type {
  CollectorFailureCode,
  StaticHttpFailure,
  StaticHttpResponse,
  StaticHttpTransport,
} from "./http-transport.server";
import type { RobotsDecision, RobotsPolicy } from "./robots.server";
import type { RunByteBudgetLedger } from "./run-budget";
import {
  isSameDiscoveryDomain,
  normalizeDiscoveryUrl,
  parseCollectorUrl,
} from "./url-policy";

export type RootCollectionFailureCode =
  | CollectorFailureCode
  | "HTTP_4XX"
  | "HTTP_5XX"
  | "UNSUPPORTED_CONTENT_TYPE"
  | "ROBOTS_BLOCKED"
  | "ROBOTS_UNAVAILABLE_REVIEW_REQUIRED"
  | "PARSE_ERROR";

export type RootCollectionResult =
  | Readonly<{
      kind: "SUCCESS";
      response: StaticHttpResponse;
      robotsDecision: RobotsDecision | null;
      robotsDecisions: readonly RobotsDecision[];
      contentHash: string;
      textHash: string;
      normalizedText: string;
    }>
  | Readonly<{
      kind: "FAILURE";
      code: RootCollectionFailureCode;
      message: string;
      response: StaticHttpResponse | null;
      transportFailure: StaticHttpFailure | null;
      robotsDecision: RobotsDecision | null;
      robotsDecisions: readonly RobotsDecision[];
    }>;

export type CandidateReason =
  | "SELECTED_FOR_FETCH"
  | "DUPLICATE_URL"
  | "EXTERNAL_DOMAIN"
  | "LOGIN_LOGOUT_EXCLUDED"
  | "MUTATION_LINK_EXCLUDED"
  | "FRAGMENT_ONLY"
  | "EMPTY_HREF"
  | "UNSUPPORTED_SCHEME"
  | "INVALID_URL"
  | "ROBOTS_BLOCKED"
  | "ROBOTS_UNAVAILABLE_REVIEW_REQUIRED"
  | "DEPTH_LIMIT_REACHED"
  | "PAGE_BUDGET_EXCEEDED"
  | "BYTE_BUDGET_EXCEEDED"
  | "FETCH_FAILED"
  | "FETCHED";

export type CandidateFetchOutcome = Readonly<{
  httpStatus: number | null;
  responseBytes: number;
  errorCode: string | null;
}>;

export type DiscoveryCandidate = Readonly<{
  url: string;
  normalizedUrl: string;
  sourcePageUrl: string;
  anchorText: string;
  discoveryDepth: number;
  discoveredAt: Date;
  classificationHint: CandidateClassification;
  sameDomain: boolean;
  reasonSelectedOrRejected: CandidateReason;
  fetchOutcome: CandidateFetchOutcome | null;
}>;

export type CollectorCrawlResult = Readonly<{
  sourceId: string;
  institutionId: string;
  root: RootCollectionResult;
  candidates: readonly DiscoveryCandidate[];
  pagesScheduled: number;
  pagesFetched: number;
  totalResponseBytes: number;
  budgetOutcomes: readonly (
    | "PAGE_BUDGET_EXCEEDED"
    | "BYTE_BUDGET_EXCEEDED"
    | "DEPTH_LIMIT_REACHED"
    | "LINK_LIMIT_REACHED"
  )[];
}>;

export type CollectorFetchedPage = Readonly<{
  requestedUrl: string;
  depth: number;
  response: StaticHttpResponse;
  normalizedText: string | null;
  textHash: string | null;
}>;

type MutableCandidate = Omit<
  DiscoveryCandidate,
  "reasonSelectedOrRejected" | "fetchOutcome"
> & {
  reasonSelectedOrRejected: CandidateReason;
  fetchOutcome: CandidateFetchOutcome | null;
};

type QueueEntry = Readonly<{
  url: string;
  depth: number;
  candidate: MutableCandidate | null;
}>;

export type CollectorCrawlerDependencies = Readonly<{
  policy: HttpCollectorPolicy;
  transport: StaticHttpTransport;
  robots: RobotsPolicy;
  now?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
  beforeRequest?: (url: string) => Promise<void>;
  onFetchedPage?: (page: CollectorFetchedPage) => void | Promise<void>;
  candidatePriority?: (candidate: DiscoveryCandidate) => number;
  runBudget?: RunByteBudgetLedger;
}>;

function mimeType(contentType: string | null): string | null {
  return contentType?.split(";", 1)[0]?.trim().toLowerCase() || null;
}

function charset(contentType: string | null): string {
  const match = contentType?.match(/(?:^|;)\s*charset\s*=\s*["']?([^;"'\s]+)/i);
  return match?.[1]?.toLowerCase() ?? "utf-8";
}

function isHtml(contentType: string | null): boolean {
  const mime = mimeType(contentType);
  return mime === "text/html" || mime === "application/xhtml+xml";
}

function statusFailureCode(status: number): RootCollectionFailureCode | null {
  if (status >= 400 && status <= 499) return "HTTP_4XX";
  if (status >= 500) return "HTTP_5XX";
  if (status < 200 || status >= 300) return "HTTP_4XX";
  return null;
}

function excludedPathReason(url: URL): CandidateReason | null {
  const decodedPath = decodeURIComponent(url.pathname).toLowerCase();
  if (
    /(?:^|\/)(?:login|logout|sign-in|signin|sign-out|signout)(?:\/|$)/u.test(
      decodedPath,
    )
  ) {
    return "LOGIN_LOGOUT_EXCLUDED";
  }
  if (/(?:^|\/)(?:delete|remove|unsubscribe)(?:\/|$)/u.test(decodedPath)) {
    return "MUTATION_LINK_EXCLUDED";
  }
  const action = url.searchParams.get("action")?.toLowerCase();
  if (
    action &&
    ["delete", "logout", "remove", "unsubscribe"].includes(action)
  ) {
    return "MUTATION_LINK_EXCLUDED";
  }
  return null;
}

function frozenCandidate(candidate: MutableCandidate): DiscoveryCandidate {
  return Object.freeze({
    ...candidate,
    fetchOutcome:
      candidate.fetchOutcome === null
        ? null
        : Object.freeze({ ...candidate.fetchOutcome }),
  });
}

function syntheticRobotsFailure(
  sourceId: string,
  institutionId: string,
  robotsDecision: RobotsDecision,
  totalResponseBytes: number,
): CollectorCrawlResult {
  const byteBudgetExceeded =
    robotsDecision.transportErrorCode === "BYTE_BUDGET_EXCEEDED";
  return Object.freeze({
    sourceId,
    institutionId,
    root: Object.freeze({
      kind: "FAILURE" as const,
      code: byteBudgetExceeded
        ? ("BYTE_BUDGET_EXCEEDED" as const)
        : robotsDecision.decision === "ROBOTS_BLOCKED"
          ? ("ROBOTS_BLOCKED" as const)
          : ("ROBOTS_UNAVAILABLE_REVIEW_REQUIRED" as const),
      message: "Root fetch was blocked by robots policy",
      response: null,
      transportFailure: null,
      robotsDecision,
      robotsDecisions: Object.freeze([robotsDecision]),
    }),
    candidates: Object.freeze([]),
    pagesScheduled: 1,
    pagesFetched: 0,
    totalResponseBytes,
    budgetOutcomes: Object.freeze(
      byteBudgetExceeded ? (["BYTE_BUDGET_EXCEEDED"] as const) : [],
    ),
  });
}

export async function crawlOfficialMainRoot(
  input: Readonly<{
    sourceId: string;
    institutionId: string;
    requestedUrl: string;
  }>,
  dependencies: CollectorCrawlerDependencies,
): Promise<CollectorCrawlResult> {
  const now = dependencies.now ?? (() => new Date());
  const sleep =
    dependencies.sleep ??
    ((milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const runStartBytes = dependencies.runBudget?.consumedBytes ?? 0;
  const sourceResponseBytes = (fallback: number) =>
    dependencies.runBudget
      ? dependencies.runBudget.consumedBytes - runStartBytes
      : fallback;
  let rootUrl: string;
  try {
    rootUrl = normalizeDiscoveryUrl(input.requestedUrl);
  } catch {
    return Object.freeze({
      sourceId: input.sourceId,
      institutionId: input.institutionId,
      root: Object.freeze({
        kind: "FAILURE" as const,
        code: "INVALID_URL" as const,
        message: "Collector URL is invalid or unsupported",
        response: null,
        transportFailure: null,
        robotsDecision: null,
        robotsDecisions: Object.freeze([]),
      }),
      candidates: Object.freeze([]),
      pagesScheduled: 0,
      pagesFetched: 0,
      totalResponseBytes: 0,
      budgetOutcomes: Object.freeze([]),
    });
  }
  const rootRobots = await dependencies.robots.evaluate(rootUrl);
  const rootRobotsDecisions: RobotsDecision[] = [rootRobots];
  const robotsOrigins = new Set([rootRobots.origin]);
  const recordRootRobotsDecision = (value: RobotsDecision) => {
    if (
      robotsOrigins.has(value.origin) ||
      rootRobotsDecisions.length >= dependencies.policy.maxRedirects + 1
    ) {
      return;
    }
    robotsOrigins.add(value.origin);
    rootRobotsDecisions.push(value);
  };
  if (rootRobots.decision !== "ALLOW") {
    return syntheticRobotsFailure(
      input.sourceId,
      input.institutionId,
      rootRobots,
      sourceResponseBytes(0),
    );
  }
  if (dependencies.policy.minimumHostDelayMs > 0) {
    await sleep(dependencies.policy.minimumHostDelayMs);
  }
  const rootFetch = await dependencies.transport.fetch({
    url: rootUrl,
    maxResponseBytes: dependencies.policy.maxResponseBytesPerPage,
    requestTimeoutMs: dependencies.policy.requestTimeoutMs,
    connectTimeoutMs: dependencies.policy.connectTimeoutMs,
    maxRedirects: dependencies.policy.maxRedirects,
    ...(dependencies.beforeRequest
      ? { beforeRequest: dependencies.beforeRequest }
      : {}),
    beforeRedirect: async (destinationUrl) => {
      const redirectRobots = await dependencies.robots.evaluate(destinationUrl);
      recordRootRobotsDecision(redirectRobots);
      return {
        allowed: redirectRobots.decision === "ALLOW",
        code: redirectRobots.errorCode,
      };
    },
    ...(dependencies.runBudget ? { runBudget: dependencies.runBudget } : {}),
  });
  if (!rootFetch.ok) {
    return Object.freeze({
      sourceId: input.sourceId,
      institutionId: input.institutionId,
      root: Object.freeze({
        kind: "FAILURE" as const,
        code: rootFetch.failure.code,
        message: rootFetch.failure.message,
        response: null,
        transportFailure: rootFetch.failure,
        robotsDecision: rootRobots,
        robotsDecisions: Object.freeze([...rootRobotsDecisions]),
      }),
      candidates: Object.freeze([]),
      pagesScheduled: 1,
      pagesFetched: 0,
      totalResponseBytes: sourceResponseBytes(
        rootFetch.failure.actualResponseBytes,
      ),
      budgetOutcomes: Object.freeze(
        rootFetch.failure.code === "BYTE_BUDGET_EXCEEDED"
          ? (["BYTE_BUDGET_EXCEEDED"] as const)
          : [],
      ),
    });
  }
  const rootResponse = rootFetch.response;
  const rootStatusFailure = statusFailureCode(rootResponse.httpStatus);
  if (rootStatusFailure || !isHtml(rootResponse.contentType)) {
    return Object.freeze({
      sourceId: input.sourceId,
      institutionId: input.institutionId,
      root: Object.freeze({
        kind: "FAILURE" as const,
        code: rootStatusFailure ?? ("UNSUPPORTED_CONTENT_TYPE" as const),
        message: rootStatusFailure
          ? "Root returned an unsuccessful HTTP status"
          : "Root returned an unsupported content type",
        response: rootResponse,
        transportFailure: null,
        robotsDecision: rootRobots,
        robotsDecisions: Object.freeze([...rootRobotsDecisions]),
      }),
      candidates: Object.freeze([]),
      pagesScheduled: 1,
      pagesFetched: 1,
      totalResponseBytes: sourceResponseBytes(rootResponse.actualResponseBytes),
      budgetOutcomes: Object.freeze([]),
    });
  }

  let rootAnalysis: ReturnType<typeof analyzeHtml>;
  try {
    rootAnalysis = analyzeHtml(rootResponse.entityBytes, {
      charset: charset(rootResponse.contentType),
      maxLinks: dependencies.policy.maxLinksPerPage,
    });
  } catch {
    return Object.freeze({
      sourceId: input.sourceId,
      institutionId: input.institutionId,
      root: Object.freeze({
        kind: "FAILURE" as const,
        code: "PARSE_ERROR" as const,
        message: "Root HTML could not be parsed",
        response: rootResponse,
        transportFailure: null,
        robotsDecision: rootRobots,
        robotsDecisions: Object.freeze([...rootRobotsDecisions]),
      }),
      candidates: Object.freeze([]),
      pagesScheduled: 1,
      pagesFetched: 1,
      totalResponseBytes: sourceResponseBytes(rootResponse.actualResponseBytes),
      budgetOutcomes: Object.freeze([]),
    });
  }

  const candidates: MutableCandidate[] = [];
  const queue: QueueEntry[] = [];
  const visited = new Set([normalizeDiscoveryUrl(rootResponse.finalUrl)]);
  const budgetOutcomes = new Set<
    CollectorCrawlResult["budgetOutcomes"][number]
  >();
  let pagesScheduled = 1;
  let pagesFetched = 1;
  let totalResponseBytes = rootResponse.actualResponseBytes;

  await dependencies.onFetchedPage?.(
    Object.freeze({
      requestedUrl: rootUrl,
      depth: 0,
      response: rootResponse,
      normalizedText: rootAnalysis.normalizedText,
      textHash: rootAnalysis.textHash,
    }),
  );

  const discover = (
    links: ReturnType<typeof analyzeHtml>["links"],
    sourcePageUrl: string,
    sourceDepth: number,
    linkLimitReached: boolean,
  ) => {
    if (linkLimitReached) budgetOutcomes.add("LINK_LIMIT_REACHED");
    const eligible: Array<
      Readonly<{ candidate: MutableCandidate; order: number }>
    > = [];
    const discoveredThisPage = new Set<string>();
    for (const link of links) {
      const discoveryDepth = sourceDepth + 1;
      let url = link.href;
      let normalizedUrl = link.href;
      let sameDomain = false;
      let reason: CandidateReason = "SELECTED_FOR_FETCH";
      if (!link.href) {
        reason = "EMPTY_HREF";
      } else if (link.href.startsWith("#")) {
        reason = "FRAGMENT_ONLY";
        url = new URL(link.href, sourcePageUrl).href;
        normalizedUrl = sourcePageUrl;
      } else {
        let resolved: URL | null = null;
        try {
          resolved = new URL(link.href, sourcePageUrl);
          url = resolved.href;
          if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
            reason = "UNSUPPORTED_SCHEME";
          } else {
            parseCollectorUrl(resolved.href);
            normalizedUrl = normalizeDiscoveryUrl(resolved.href);
            sameDomain = isSameDiscoveryDomain(rootUrl, normalizedUrl);
            const excluded = excludedPathReason(resolved);
            if (!sameDomain) reason = "EXTERNAL_DOMAIN";
            else if (excluded) reason = excluded;
            else if (
              visited.has(normalizedUrl) ||
              discoveredThisPage.has(normalizedUrl)
            )
              reason = "DUPLICATE_URL";
            else if (discoveryDepth > dependencies.policy.maxDepth) {
              reason = "DEPTH_LIMIT_REACHED";
              budgetOutcomes.add("DEPTH_LIMIT_REACHED");
            }
          }
        } catch {
          reason = "INVALID_URL";
        }
      }
      const candidate: MutableCandidate = {
        url,
        normalizedUrl,
        sourcePageUrl,
        anchorText: link.anchorText,
        discoveryDepth,
        discoveredAt: now(),
        classificationHint: classifyCandidate({
          url,
          anchorText: link.anchorText,
        }),
        sameDomain,
        reasonSelectedOrRejected: reason,
        fetchOutcome: null,
      };
      candidates.push(candidate);
      if (reason === "SELECTED_FOR_FETCH") {
        discoveredThisPage.add(normalizedUrl);
        eligible.push({ candidate, order: candidates.length - 1 });
      }
    }
    eligible.sort((left, right) => {
      const priority = dependencies.candidatePriority;
      return priority === undefined
        ? left.order - right.order
        : priority(right.candidate) - priority(left.candidate) ||
            left.order - right.order;
    });
    for (const entry of eligible) {
      if (pagesScheduled >= dependencies.policy.maxPagesPerInstitution) {
        entry.candidate.reasonSelectedOrRejected = "PAGE_BUDGET_EXCEEDED";
        budgetOutcomes.add("PAGE_BUDGET_EXCEEDED");
        continue;
      }
      visited.add(entry.candidate.normalizedUrl);
      pagesScheduled += 1;
      queue.push({
        url: entry.candidate.normalizedUrl,
        depth: entry.candidate.discoveryDepth,
        candidate: entry.candidate,
      });
    }
  };

  discover(
    rootAnalysis.links,
    rootResponse.finalUrl,
    0,
    rootAnalysis.linkLimitReached,
  );

  while (queue.length > 0) {
    const entry = queue.shift()!;
    const candidate = entry.candidate!;
    const robotsDecision = await dependencies.robots.evaluate(entry.url);
    if (robotsDecision.decision !== "ALLOW") {
      candidate.reasonSelectedOrRejected = robotsDecision.decision;
      candidate.fetchOutcome = {
        httpStatus: robotsDecision.robotsHttpStatus,
        responseBytes: 0,
        errorCode: robotsDecision.errorCode,
      };
      continue;
    }
    const remainingBytes = dependencies.runBudget
      ? dependencies.runBudget.remainingBytes
      : dependencies.policy.maxTotalBytesPerRun - totalResponseBytes;
    if (remainingBytes <= 0) {
      candidate.reasonSelectedOrRejected = "BYTE_BUDGET_EXCEEDED";
      candidate.fetchOutcome = {
        httpStatus: null,
        responseBytes: 0,
        errorCode: "BYTE_BUDGET_EXCEEDED",
      };
      budgetOutcomes.add("BYTE_BUDGET_EXCEEDED");
      continue;
    }
    if (dependencies.policy.minimumHostDelayMs > 0) {
      await sleep(dependencies.policy.minimumHostDelayMs);
    }
    const fetched = await dependencies.transport.fetch({
      url: entry.url,
      maxResponseBytes: dependencies.policy.maxResponseBytesPerPage,
      requestTimeoutMs: dependencies.policy.requestTimeoutMs,
      connectTimeoutMs: dependencies.policy.connectTimeoutMs,
      maxRedirects: dependencies.policy.maxRedirects,
      ...(dependencies.beforeRequest
        ? { beforeRequest: dependencies.beforeRequest }
        : {}),
      beforeRedirect: async (destinationUrl) => {
        const redirectRobots =
          await dependencies.robots.evaluate(destinationUrl);
        return {
          allowed: redirectRobots.decision === "ALLOW",
          code: redirectRobots.errorCode,
        };
      },
      ...(dependencies.runBudget ? { runBudget: dependencies.runBudget } : {}),
    });
    if (!fetched.ok) {
      const exhausted = fetched.failure.code === "BYTE_BUDGET_EXCEEDED";
      candidate.reasonSelectedOrRejected = exhausted
        ? "BYTE_BUDGET_EXCEEDED"
        : "FETCH_FAILED";
      candidate.fetchOutcome = {
        httpStatus: fetched.failure.httpStatus,
        responseBytes: fetched.failure.actualResponseBytes,
        errorCode: exhausted ? "BYTE_BUDGET_EXCEEDED" : fetched.failure.code,
      };
      if (exhausted) budgetOutcomes.add("BYTE_BUDGET_EXCEEDED");
      continue;
    }
    pagesFetched += 1;
    totalResponseBytes += fetched.response.actualResponseBytes;
    candidate.reasonSelectedOrRejected = "FETCHED";
    candidate.fetchOutcome = {
      httpStatus: fetched.response.httpStatus,
      responseBytes: fetched.response.actualResponseBytes,
      errorCode: null,
    };
    if (
      fetched.response.httpStatus >= 200 &&
      fetched.response.httpStatus < 300 &&
      isHtml(fetched.response.contentType)
    ) {
      try {
        const analysis = analyzeHtml(fetched.response.entityBytes, {
          charset: charset(fetched.response.contentType),
          maxLinks: dependencies.policy.maxLinksPerPage,
        });
        await dependencies.onFetchedPage?.(
          Object.freeze({
            requestedUrl: entry.url,
            depth: entry.depth,
            response: fetched.response,
            normalizedText: analysis.normalizedText,
            textHash: analysis.textHash,
          }),
        );
        discover(
          analysis.links,
          fetched.response.finalUrl,
          entry.depth,
          analysis.linkLimitReached,
        );
      } catch {
        candidate.reasonSelectedOrRejected = "FETCH_FAILED";
        candidate.fetchOutcome = {
          ...candidate.fetchOutcome,
          errorCode: "PARSE_ERROR",
        };
      }
    } else {
      await dependencies.onFetchedPage?.(
        Object.freeze({
          requestedUrl: entry.url,
          depth: entry.depth,
          response: fetched.response,
          normalizedText: null,
          textHash: null,
        }),
      );
    }
  }

  const root: RootCollectionResult = Object.freeze({
    kind: "SUCCESS",
    response: rootResponse,
    robotsDecision: rootRobots,
    robotsDecisions: Object.freeze([...rootRobotsDecisions]),
    contentHash: sha256Hex(rootResponse.entityBytes),
    textHash: rootAnalysis.textHash,
    normalizedText: rootAnalysis.normalizedText,
  });
  return Object.freeze({
    sourceId: input.sourceId,
    institutionId: input.institutionId,
    root,
    candidates: Object.freeze(candidates.map(frozenCandidate)),
    pagesScheduled,
    pagesFetched,
    totalResponseBytes: sourceResponseBytes(totalResponseBytes),
    budgetOutcomes: Object.freeze([...budgetOutcomes]),
  });
}
