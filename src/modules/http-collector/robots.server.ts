import robotsParser from "robots-parser";

import type { HttpCollectorPolicy } from "./contracts";
import type {
  CollectorFailureCode,
  StaticHttpTransport,
} from "./http-transport.server";
import { isSameDiscoveryDomain, parseCollectorUrl } from "./url-policy";
import type { RunByteBudgetLedger } from "./run-budget";

export const ROBOTS_USER_AGENT = "PREPPY-Static-Collector";

export type RobotsDecision = Readonly<{
  decision: "ALLOW" | "ROBOTS_BLOCKED" | "ROBOTS_UNAVAILABLE_REVIEW_REQUIRED";
  reason:
    | "ROBOTS_ALLOWED"
    | "ROBOTS_UNAVAILABLE_ALLOW"
    | "ROBOTS_EXPLICIT_DISALLOW"
    | "ROBOTS_AUTH_REVIEW_REQUIRED"
    | "ROBOTS_FETCH_REVIEW_REQUIRED"
    | "ROBOTS_PARSE_REVIEW_REQUIRED";
  origin: string;
  robotsUrl: string;
  robotsHttpStatus: number | null;
  errorCode: "ROBOTS_BLOCKED" | "ROBOTS_UNAVAILABLE_REVIEW_REQUIRED" | null;
  transportErrorCode: CollectorFailureCode | null;
}>;

export type RobotsPolicy = Readonly<{
  evaluate(targetUrl: string): Promise<RobotsDecision>;
}>;

type RobotsDocument =
  | Readonly<{
      kind: "RULES";
      parser: ReturnType<typeof robotsParser>;
      status: number;
    }>
  | Readonly<{ kind: "UNAVAILABLE_ALLOW"; status: 404 | 410 }>
  | Readonly<{
      kind: "REVIEW";
      status: number | null;
      reason:
        | "ROBOTS_AUTH_REVIEW_REQUIRED"
        | "ROBOTS_FETCH_REVIEW_REQUIRED"
        | "ROBOTS_PARSE_REVIEW_REQUIRED";
      transportErrorCode: CollectorFailureCode | null;
    }>;

function decision(value: RobotsDecision): RobotsDecision {
  return Object.freeze(value);
}

export function createRobotsPolicy(
  input: Readonly<{
    transport: StaticHttpTransport;
    policy: HttpCollectorPolicy;
    robotsPath?: string;
    beforeRequest?: (url: string) => Promise<void>;
    runBudget?: RunByteBudgetLedger;
  }>,
): RobotsPolicy {
  const cache = new Map<string, Promise<RobotsDocument>>();
  const robotsPath = input.robotsPath ?? "/robots.txt";

  async function load(origin: string): Promise<RobotsDocument> {
    const robotsUrl = new URL(robotsPath, `${origin}/`).href;
    const fetched = await input.transport.fetch({
      url: robotsUrl,
      maxResponseBytes: input.policy.robotsMaxResponseBytes,
      requestTimeoutMs: input.policy.requestTimeoutMs,
      connectTimeoutMs: input.policy.connectTimeoutMs,
      maxRedirects: input.policy.maxRedirects,
      redirectAllowed: (requested, destination) => {
        const requestedUrl = parseCollectorUrl(requested);
        const destinationUrl = parseCollectorUrl(destination);
        return (
          isSameDiscoveryDomain(requestedUrl.href, destinationUrl.href) &&
          !(
            requestedUrl.protocol === "https:" &&
            destinationUrl.protocol === "http:"
          )
        );
      },
      ...(input.beforeRequest ? { beforeRequest: input.beforeRequest } : {}),
      ...(input.runBudget ? { runBudget: input.runBudget } : {}),
    });
    if (!fetched.ok) {
      return {
        kind: "REVIEW",
        status: fetched.failure.httpStatus,
        reason: "ROBOTS_FETCH_REVIEW_REQUIRED",
        transportErrorCode: fetched.failure.code,
      };
    }
    const status = fetched.response.httpStatus;
    if (status === 404 || status === 410) {
      return { kind: "UNAVAILABLE_ALLOW", status };
    }
    if (status === 401 || status === 403) {
      return {
        kind: "REVIEW",
        status,
        reason: "ROBOTS_AUTH_REVIEW_REQUIRED",
        transportErrorCode: null,
      };
    }
    if (status < 200 || status > 299) {
      return {
        kind: "REVIEW",
        status,
        reason: "ROBOTS_FETCH_REVIEW_REQUIRED",
        transportErrorCode: null,
      };
    }
    const body = fetched.response.entityBytes.toString("utf8");
    const mime = fetched.response.contentType
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();
    // A challenge/login HTML response is not a robots document. The parser
    // otherwise accepts its lack of directives as allow-all.
    const nonCommentBody = body
      .split(/\r?\n/u)
      .map((line) => line.split("#", 1)[0])
      .join("\n");
    if (
      mime === "text/html" ||
      mime === "application/xhtml+xml" ||
      /<(?:!doctype\b|\/?[a-z][a-z0-9:-]*[\s/>])/iu.test(nonCommentBody)
    ) {
      return {
        kind: "REVIEW",
        status,
        reason: "ROBOTS_PARSE_REVIEW_REQUIRED",
        transportErrorCode: null,
      };
    }
    try {
      return {
        kind: "RULES",
        parser: robotsParser(robotsUrl, body),
        status,
      };
    } catch {
      return {
        kind: "REVIEW",
        status,
        reason: "ROBOTS_PARSE_REVIEW_REQUIRED",
        transportErrorCode: null,
      };
    }
  }

  return {
    async evaluate(targetUrl): Promise<RobotsDecision> {
      const target = parseCollectorUrl(targetUrl);
      const origin = target.origin;
      const robotsUrl = new URL(robotsPath, `${origin}/`).href;
      let pending = cache.get(origin);
      if (!pending) {
        pending = load(origin);
        cache.set(origin, pending);
      }
      const document = await pending;
      if (document.kind === "UNAVAILABLE_ALLOW") {
        return decision({
          decision: "ALLOW",
          reason: "ROBOTS_UNAVAILABLE_ALLOW",
          origin,
          robotsUrl,
          robotsHttpStatus: document.status,
          errorCode: null,
          transportErrorCode: null,
        });
      }
      if (document.kind === "REVIEW") {
        return decision({
          decision: "ROBOTS_UNAVAILABLE_REVIEW_REQUIRED",
          reason: document.reason,
          origin,
          robotsUrl,
          robotsHttpStatus: document.status,
          errorCode: "ROBOTS_UNAVAILABLE_REVIEW_REQUIRED",
          transportErrorCode: document.transportErrorCode,
        });
      }
      const allowed = document.parser.isAllowed(target.href, ROBOTS_USER_AGENT);
      if (allowed === false) {
        return decision({
          decision: "ROBOTS_BLOCKED",
          reason: "ROBOTS_EXPLICIT_DISALLOW",
          origin,
          robotsUrl,
          robotsHttpStatus: document.status,
          errorCode: "ROBOTS_BLOCKED",
          transportErrorCode: null,
        });
      }
      return decision({
        decision: "ALLOW",
        reason: "ROBOTS_ALLOWED",
        origin,
        robotsUrl,
        robotsHttpStatus: document.status,
        errorCode: null,
        transportErrorCode: null,
      });
    },
  };
}
