import type {
  PreflightCheck,
  PreflightReport,
  PreflightReportInput,
} from "@/src/modules/production-preflight/contracts";

export const PREFLIGHT_EXIT_CODES = {
  OK: 0,
  BLOCKERS: 2,
  UNSAFE_PRODUCTION_CONNECTION: 3,
  INVALID_CONFIG_OR_TOOLING: 4,
} as const;

const FORBIDDEN_KEY =
  /^(?:email|email_normalized|phone|display_name|kakao_subject|oauth_subject|provider_subject|child_data|child_birth_year|password|content_html|raw.*|.*_secret|.*_token|.*_payload|database_url)$/i;
const EMAIL_VALUE = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/;
const CREDENTIAL_URL = /\b(?:postgres(?:ql)?|https?):\/\/[^\s/:]+:[^\s/@]+@/i;
const HTML_VALUE = /<\/?[a-z][^>]*>/i;

function assertSafe(value: unknown, path: string, seen: WeakSet<object>): void {
  if (typeof value === "string") {
    if (
      EMAIL_VALUE.test(value) ||
      CREDENTIAL_URL.test(value) ||
      HTML_VALUE.test(value)
    ) {
      throw new Error(`Unsafe preflight report value at ${path}`);
    }
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) {
    throw new Error(`Unsafe preflight report cycle at ${path}`);
  }
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafe(item, `${path}[${index}]`, seen));
    seen.delete(value);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.replaceAll(/([a-z0-9])([A-Z])/g, "$1_$2");
    if (FORBIDDEN_KEY.test(normalizedKey)) {
      throw new Error(`Unsafe preflight report key at ${path}.${key}`);
    }
    assertSafe(child, `${path}.${key}`, seen);
  }
  seen.delete(value);
}

export function assertPreflightReportSafe(value: unknown): void {
  assertSafe(value, "$", new WeakSet());
}

function summarize(
  checks: readonly PreflightCheck[],
): PreflightReport["summary"] {
  const blockers = checks.filter(
    (check) => check.severity === "BLOCKER",
  ).length;
  const warnings = checks.filter(
    (check) => check.severity === "WARNING",
  ).length;
  const infos = checks.filter((check) => check.severity === "INFO").length;
  return {
    blockers,
    warnings,
    infos,
    readyForNextGate: blockers === 0,
    finalGate: blockers === 0 ? "READY_FOR_WP16A" : "BLOCKED",
  };
}

export function buildPreflightReport(
  input: PreflightReportInput,
): PreflightReport {
  const report: PreflightReport = {
    ...input,
    version: 1,
    summary: summarize(input.checks),
  };
  assertPreflightReportSafe(report);
  return report;
}

export function exitCodeForPreflight(report: PreflightReport): 0 | 2 {
  return report.summary.blockers === 0
    ? PREFLIGHT_EXIT_CODES.OK
    : PREFLIGHT_EXIT_CODES.BLOCKERS;
}
