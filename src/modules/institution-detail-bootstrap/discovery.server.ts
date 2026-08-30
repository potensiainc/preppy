import "server-only";

import type { StaticHttpTransport } from "@/src/modules/http-collector/http-transport.server";
import { createNodeHttpTransport } from "@/src/modules/http-collector/http-transport.server";
import {
  parseHttpCollectorPolicy,
  type HttpCollectorPolicy,
} from "@/src/modules/http-collector/contracts";
import {
  crawlOfficialMainRoot,
  type CollectorFetchedPage,
} from "@/src/modules/http-collector/crawler.server";
import { sha256Hex } from "@/src/modules/http-collector/hash";
import { createPoliteHttpTransport } from "@/src/modules/http-collector/politeness.server";
import {
  createRobotsPolicy,
  type RobotsPolicy,
} from "@/src/modules/http-collector/robots.server";
import { createRunByteBudgetLedger } from "@/src/modules/http-collector/run-budget";
import { isSameDiscoveryDomain } from "@/src/modules/http-collector/url-policy";
import type { CandidateClassification } from "@/src/modules/http-collector/classification";
import type { PrivateElementaryBootstrapTarget } from "./contracts";
import {
  extractInstitutionFacts,
  type ExtractedInstitutionFact,
} from "./fact-extractor";
import {
  selectCurrentAdmissionProposal,
  type SelectedAdmissionProposal,
} from "./admission-extractor";
import {
  extractBoundedPdfText,
  textAsExtractionHtml,
} from "./document-text.server";

const ADMISSION_KEYWORDS = Object.freeze([
  "입학",
  "입학안내",
  "신입생",
  "신입학",
  "모집",
  "모집요강",
  "전형",
  "원서",
  "원서접수",
  "지원",
  "추첨",
  "설명회",
  "입학설명회",
  "2026학년도",
  "2027학년도",
  "admission",
  "application",
  "open house",
]);

const FACT_KEYWORDS = Object.freeze([
  "교육비",
  "수업료",
  "입학금",
  "납입금",
  "교육과정",
  "특색교육",
  "교육활동",
  "학교소개",
  "통학",
  "통학버스",
  "스쿨버스",
  "지원자격",
  "입학자격",
  "모집대상",
  "학교현황",
  "tuition",
  "curriculum",
  "school bus",
  "eligibility",
]);

function keywordScore(haystack: string, keywords: readonly string[]): number {
  return keywords.reduce(
    (score, keyword) => score + (haystack.includes(keyword) ? 10 : 0),
    0,
  );
}

export function scoreBootstrapCandidate(
  input: Readonly<{
    url: string;
    anchorText: string;
  }>,
): Readonly<{
  admissionScore: number;
  factScore: number;
  totalScore: number;
}> {
  let decodedUrl = input.url;
  try {
    decodedUrl = decodeURIComponent(input.url);
  } catch {
    // A score is only a hint; the collector URL policy remains authoritative.
  }
  const haystack = `${decodedUrl} ${input.anchorText}`
    .normalize("NFC")
    .toLowerCase();
  const admissionScore = keywordScore(haystack, ADMISSION_KEYWORDS);
  const factScore = keywordScore(haystack, FACT_KEYWORDS);
  const documentScore = /\.(?:pdf|hwp|hwpx)(?:$|[?#])/iu.test(input.url)
    ? 5
    : 0;
  return Object.freeze({
    admissionScore,
    factScore,
    totalScore: admissionScore * 2 + factScore + documentScore,
  });
}

export function isOfficialBootstrapUrl(
  officialRootUrl: string,
  candidateUrl: string,
): boolean {
  try {
    return isSameDiscoveryDomain(officialRootUrl, candidateUrl);
  } catch {
    return false;
  }
}

export function classifySchoolCollection(
  input: Readonly<{
    rootSucceeded: boolean;
    usableOfficialPages: number;
    candidateFetchFailures: number;
  }>,
): Readonly<{
  status: "COLLECTED" | "SCHOOL_FETCH_FAILED";
  warning: boolean;
}> {
  if (!input.rootSucceeded || input.usableOfficialPages < 1) {
    return Object.freeze({
      status: "SCHOOL_FETCH_FAILED" as const,
      warning: false,
    });
  }
  return Object.freeze({
    status: "COLLECTED" as const,
    warning: input.candidateFetchFailures > 0,
  });
}

export const PRIVATE_ELEMENTARY_BOOTSTRAP_COLLECTOR_POLICY =
  parseHttpCollectorPolicy({
    maxDepth: 2,
    maxPagesPerInstitution: 30,
    maxLinksPerPage: 250,
    maxResponseBytesPerPage: 2 * 1024 * 1024,
    maxTotalBytesPerRun: 20 * 1024 * 1024,
    requestTimeoutMs: 10_000,
    connectTimeoutMs: 5_000,
    maxRedirects: 5,
    perHostConcurrency: 1,
    globalConcurrency: 3,
    minimumHostDelayMs: 500,
    robotsMaxResponseBytes: 512 * 1024,
  });

export type BootstrapEvidencePage = Readonly<{
  url: string;
  finalUrl: string;
  sourceName: string;
  sourceType:
    | "OFFICIAL_SCHOOL_PAGE"
    | "OFFICIAL_ADMISSION_PAGE"
    | "OFFICIAL_NOTICE_BOARD"
    | "OFFICIAL_DOCUMENT";
  classificationHint: CandidateClassification;
  collectedAt: Date;
  contentHash: string;
  textHash: string;
  normalizedText: string;
  mimeType: string;
  httpStatus: number;
  responseBytes: number;
  durationMs: number;
  extractionHtml: string;
  score: number;
}>;

export type CollectedPrivateElementarySchool = Readonly<{
  target: PrivateElementaryBootstrapTarget;
  status: "COLLECTED" | "SCHOOL_FETCH_FAILED";
  partialFetchWarning: boolean;
  pagesScheduled: number;
  pagesFetched: number;
  candidateUrls: readonly string[];
  pages: readonly BootstrapEvidencePage[];
  facts: readonly ExtractedInstitutionFact[];
  admission: SelectedAdmissionProposal | null;
  warnings: readonly string[];
  errors: readonly string[];
}>;

export type PrivateElementaryCollectionRuntime = Readonly<{
  policy: HttpCollectorPolicy;
  transport: StaticHttpTransport;
  robots: RobotsPolicy;
}>;

export function createPrivateElementaryCollectionRuntime(
  input: Readonly<{
    policy?: HttpCollectorPolicy;
    baseTransport?: StaticHttpTransport;
    sleep?: (milliseconds: number) => Promise<void>;
    clockMs?: () => number;
  }> = {},
): PrivateElementaryCollectionRuntime {
  const policy = input.policy ?? PRIVATE_ELEMENTARY_BOOTSTRAP_COLLECTOR_POLICY;
  const baseTransport = input.baseTransport ?? createNodeHttpTransport();
  const transport = createPoliteHttpTransport({
    delegate: baseTransport,
    policy,
    ...(input.sleep ? { sleep: input.sleep } : {}),
    ...(input.clockMs ? { clockMs: input.clockMs } : {}),
  });
  const robotsTransport = createPoliteHttpTransport({
    delegate: baseTransport,
    policy,
    ...(input.sleep ? { sleep: input.sleep } : {}),
    ...(input.clockMs ? { clockMs: input.clockMs } : {}),
  });
  return Object.freeze({
    policy,
    transport,
    robots: createRobotsPolicy({ transport: robotsTransport, policy }),
  });
}

function mimeType(value: string | null): string {
  return value?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function charset(value: string | null): string {
  return (
    value?.match(/(?:^|;)\s*charset\s*=\s*["']?([^;"'\s]+)/iu)?.[1] ?? "utf-8"
  );
}

async function toEvidencePage(
  target: PrivateElementaryBootstrapTarget,
  page: CollectorFetchedPage,
  classificationHint: CandidateClassification,
): Promise<BootstrapEvidencePage | null> {
  if (!isOfficialBootstrapUrl(target.websiteUrl, page.response.finalUrl)) {
    return null;
  }
  const mime = mimeType(page.response.contentType);
  const pdfDocument =
    mime === "application/pdf" ||
    /\.pdf(?:$|[?#])/iu.test(page.response.finalUrl);
  let extractionHtml: string;
  let normalizedText: string;
  if (mime === "text/html" || mime === "application/xhtml+xml") {
    extractionHtml = new TextDecoder(charset(page.response.contentType), {
      fatal: false,
    }).decode(page.response.entityBytes);
    normalizedText = page.normalizedText ?? "";
  } else if (pdfDocument) {
    normalizedText = await extractBoundedPdfText(page.response.entityBytes);
    extractionHtml = textAsExtractionHtml(normalizedText);
  } else {
    return null;
  }
  if (!normalizedText) return null;
  const bootstrapScore = scoreBootstrapCandidate({
    url: page.response.finalUrl,
    anchorText: normalizedText.slice(0, 2_000),
  });
  const score = bootstrapScore.totalScore;
  const sourceType: BootstrapEvidencePage["sourceType"] = pdfDocument
    ? "OFFICIAL_DOCUMENT"
    : page.depth === 0
      ? "OFFICIAL_SCHOOL_PAGE"
      : classificationHint === "NOTICE"
        ? "OFFICIAL_NOTICE_BOARD"
        : bootstrapScore.admissionScore > 0 ||
            classificationHint === "ADMISSIONS" ||
            classificationHint === "APPLICATION" ||
            classificationHint === "OPEN_HOUSE"
          ? "OFFICIAL_ADMISSION_PAGE"
          : "OFFICIAL_SCHOOL_PAGE";
  return Object.freeze({
    url: page.depth === 0 ? inputRootUrl(target) : page.response.finalUrl,
    finalUrl: page.response.finalUrl,
    sourceName:
      page.depth === 0
        ? `${target.institutionName} 공식 홈페이지`
        : `${target.institutionName} 공식 ${sourceType === "OFFICIAL_DOCUMENT" ? "문서" : "안내"}`,
    sourceType,
    classificationHint,
    collectedAt: page.response.fetchedAt,
    contentHash: sha256Hex(page.response.entityBytes),
    textHash: sha256Hex(normalizedText),
    normalizedText,
    mimeType: mime || "application/octet-stream",
    httpStatus: page.response.httpStatus,
    responseBytes: page.response.actualResponseBytes,
    durationMs: page.response.elapsedMs,
    extractionHtml,
    score,
  });
}

function inputRootUrl(target: PrivateElementaryBootstrapTarget): string {
  return target.websiteUrl;
}

function bestFacts(
  pages: readonly BootstrapEvidencePage[],
): readonly ExtractedInstitutionFact[] {
  const selected = new Map<
    ExtractedInstitutionFact["factType"],
    Readonly<{ fact: ExtractedInstitutionFact; score: number }>
  >();
  for (const page of pages) {
    for (const fact of extractInstitutionFacts({
      sourceUrl: page.url,
      content: page.extractionHtml,
    })) {
      const current = selected.get(fact.factType);
      if (current === undefined || page.score > current.score) {
        selected.set(fact.factType, { fact, score: page.score });
      }
    }
  }
  return Object.freeze([...selected.values()].map((entry) => entry.fact));
}

export async function collectPrivateElementarySchool(
  input: Readonly<{
    target: PrivateElementaryBootstrapTarget;
    work: "both" | "facts" | "admissions";
  }>,
  dependencies: Readonly<{
    runtime: PrivateElementaryCollectionRuntime;
    now?: () => Date;
  }>,
): Promise<CollectedPrivateElementarySchool> {
  const fetchedPages: CollectorFetchedPage[] = [];
  const warnings: string[] = [];
  const crawl = await crawlOfficialMainRoot(
    {
      sourceId: `bootstrap:${input.target.slug}`,
      institutionId:
        input.target.institutionId ?? `pending:${input.target.slug}`,
      requestedUrl: input.target.websiteUrl,
    },
    {
      policy: dependencies.runtime.policy,
      transport: dependencies.runtime.transport,
      robots: dependencies.runtime.robots,
      runBudget: createRunByteBudgetLedger(
        dependencies.runtime.policy.maxTotalBytesPerRun,
      ),
      ...(dependencies.now ? { now: dependencies.now } : {}),
      sleep: async () => undefined,
      candidatePriority: (candidate) =>
        scoreBootstrapCandidate({
          url: candidate.url,
          anchorText: candidate.anchorText,
        }).totalScore,
      onFetchedPage: (page) => {
        fetchedPages.push(page);
      },
    },
  );
  const classificationByUrl = new Map(
    crawl.candidates.map((candidate) => [
      candidate.normalizedUrl,
      candidate.classificationHint,
    ]),
  );
  const pages: BootstrapEvidencePage[] = [];
  for (const page of fetchedPages) {
    const classificationHint =
      classificationByUrl.get(page.requestedUrl) ?? "OTHER";
    try {
      const evidence = await toEvidencePage(
        input.target,
        page,
        classificationHint,
      );
      if (evidence !== null) pages.push(evidence);
      else
        warnings.push(`UNSUPPORTED_OR_EXTERNAL_PAGE:${page.response.finalUrl}`);
    } catch {
      warnings.push(`DOCUMENT_EXTRACTION_FAILED:${page.response.finalUrl}`);
    }
  }
  const candidateFetchFailures = crawl.candidates.filter((candidate) =>
    ["FETCH_FAILED", "BYTE_BUDGET_EXCEEDED"].includes(
      candidate.reasonSelectedOrRejected,
    ),
  ).length;
  const classification = classifySchoolCollection({
    rootSucceeded: crawl.root.kind === "SUCCESS",
    usableOfficialPages: pages.length,
    candidateFetchFailures,
  });
  if (classification.warning) warnings.push("PARTIAL_FETCH_WARNING");
  if (classification.status === "SCHOOL_FETCH_FAILED") {
    return Object.freeze({
      target: input.target,
      status: classification.status,
      partialFetchWarning: false,
      pagesScheduled: crawl.pagesScheduled,
      pagesFetched: crawl.pagesFetched,
      candidateUrls: Object.freeze(
        crawl.candidates.map((candidate) => candidate.url),
      ),
      pages: Object.freeze(pages),
      facts: Object.freeze([]),
      admission: null,
      warnings: Object.freeze(warnings),
      errors: Object.freeze([
        crawl.root.kind === "FAILURE"
          ? crawl.root.code
          : "NO_USABLE_OFFICIAL_PAGE",
      ]),
    });
  }
  const extractedFacts =
    input.work === "admissions" ? [] : [...bestFacts(pages)];
  const admission =
    input.work === "facts"
      ? null
      : selectCurrentAdmissionProposal(
          [...pages]
            .sort((left, right) => right.score - left.score)
            .map((page) => ({
              sourceUrl: page.url,
              content: page.extractionHtml,
              classificationHint: page.classificationHint,
              collectedAt: page.collectedAt,
            })),
          dependencies.now?.() ?? new Date(),
        );
  return Object.freeze({
    target: input.target,
    status: "COLLECTED" as const,
    partialFetchWarning: classification.warning,
    pagesScheduled: crawl.pagesScheduled,
    pagesFetched: crawl.pagesFetched,
    candidateUrls: Object.freeze(
      crawl.candidates.map((candidate) => candidate.url),
    ),
    pages: Object.freeze(pages),
    facts: Object.freeze(extractedFacts),
    admission,
    warnings: Object.freeze(warnings),
    errors: Object.freeze([]),
  });
}
