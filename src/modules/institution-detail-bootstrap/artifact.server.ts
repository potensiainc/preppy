import "server-only";

import { createHash } from "node:crypto";
import { isIP } from "node:net";
import {
  bootstrapArtifactSchema,
  MAX_BOOTSTRAP_ARTIFACT_BYTES,
  type BootstrapArtifact,
} from "./artifact-schema";
import {
  PrivateElementaryBootstrapError,
  type PrivateElementaryBootstrapTarget,
} from "./contracts";
import type {
  CollectedPrivateElementarySchool,
  BootstrapEvidencePage,
} from "./discovery.server";
import {
  buildRegistryBaselineFacts,
  type ExtractedInstitutionFact,
} from "./fact-extractor";
import { isStaleAdmissionCycle } from "./admission-extractor";
import type { LiveAdmissionProposal } from "@/src/modules/live-admissions/contracts";
import { liveAdmissionContentFingerprint } from "@/src/modules/live-admissions/preparation.server";
import {
  normalizeDiscoveryUrl,
  isSameDiscoveryDomain,
  parseCollectorUrl,
} from "@/src/modules/http-collector/url-policy";

export class BootstrapArtifactError extends PrivateElementaryBootstrapError {
  constructor() {
    super("ARTIFACT_REJECTED", "Bootstrap artifact validation failed");
  }
}
function reject(): never {
  throw new BootstrapArtifactError();
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
function json(value: unknown): string {
  return JSON.stringify(canonical(value));
}
function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
export function artifactChecksum(value: unknown): string {
  const copy = { ...(value as Record<string, unknown>) };
  delete copy.artifactChecksum;
  return digest(json(copy));
}
function factFingerprint(fact: ExtractedInstitutionFact): string {
  return digest(
    json({
      factType: fact.factType,
      displayText: fact.displayText,
      valueJson: fact.valueJson,
      sourceUrl: fact.sourceUrl,
      evidenceExcerpt: fact.evidenceExcerpt,
    }),
  );
}
function pageFingerprint(
  page: Pick<
    BootstrapArtifact["collection"]["pages"][number],
    "canonicalUrl" | "finalUrl" | "responseContentHash" | "evidenceText"
  >,
): string {
  return digest(
    json({
      format: "preppy-offline-evidence-excerpt-v1",
      sourceUrl: page.canonicalUrl,
      finalUrl: page.finalUrl,
      responseContentHash: page.responseContentHash,
      evidenceText: page.evidenceText,
    }),
  );
}
function admissionProposal(
  admission: NonNullable<BootstrapArtifact["admission"]>,
): LiveAdmissionProposal {
  const date = (value: string | null) =>
    value === null ? null : new Date(value);
  return {
    academicYearLabel: admission.academicYearLabel,
    knowledgeState: admission.knowledgeState,
    kind: admission.kind,
    businessState: admission.businessState,
    title: admission.title,
    summary: admission.summary,
    targetAudience: admission.targetAudience,
    applicationOpenAt: date(admission.applicationOpenAt),
    applicationCloseAt: date(admission.applicationCloseAt),
    eventStartAt: date(admission.eventStartAt),
    eventEndAt: date(admission.eventEndAt),
    actionUrl: admission.actionUrl,
    evidenceExcerpt: admission.evidenceExcerpt,
    warnings: admission.warnings,
  };
}
function classification(
  collection: Pick<
    CollectedPrivateElementarySchool,
    "status" | "facts" | "admission" | "target"
  >,
): BootstrapArtifact["classification"] {
  if (collection.status === "SCHOOL_FETCH_FAILED")
    return "TECHNICAL_FETCH_FAILED";
  if (
    collection.admission !== null &&
    collection.admission.proposal.knowledgeState !== "NOT_FOUND"
  )
    return "DETAIL_WITH_ADMISSION";
  return collection.facts.some(
    (f) => f.sourceUrl !== collection.target.registryUrl,
  )
    ? "DETAIL_WITHOUT_ADMISSION"
    : "BASELINE_ONLY";
}
function officialUrl(
  value: string,
  target: PrivateElementaryBootstrapTarget,
  registry = false,
): string {
  let parsed: URL;
  try {
    parsed = parseCollectorUrl(value);
  } catch {
    return reject();
  }
  if (
    parsed.hash ||
    isIP(parsed.hostname) ||
    parsed.port ||
    /(?:^|\.)(?:localhost|local|internal)$/iu.test(parsed.hostname)
  )
    reject();
  if (
    registry
      ? value !== target.registryUrl
      : !isSameDiscoveryDomain(value, target.websiteUrl)
  )
    reject();
  return value;
}

export function createBootstrapArtifact(
  collection: CollectedPrivateElementarySchool,
  seedSha256: string,
  generatedAt: Date,
): BootstrapArtifact {
  if (!collection.target.institutionId) reject();
  const admission =
    collection.admission &&
    !isStaleAdmissionCycle(collection.admission.proposal.academicYearLabel)
      ? collection.admission
      : null;
  const facts = collection.facts.map((f) => {
    const fact =
      f.sourceUrl === collection.target.registryUrl
        ? f
        : {
            ...f,
            sourceUrl: normalizeDiscoveryUrl(f.sourceUrl),
            valueJson: {
              ...f.valueJson,
              sourceUrl: normalizeDiscoveryUrl(f.sourceUrl),
            },
          };
    return { ...fact, contentFingerprint: factFingerprint(fact) };
  });
  const used = new Set(
    facts
      .filter((f) => f.sourceUrl !== collection.target.registryUrl)
      .map((f) => f.sourceUrl),
  );
  if (admission) used.add(normalizeDiscoveryUrl(admission.sourceUrl));
  const root = collection.pages.find(
    (p) => p.url === collection.target.websiteUrl,
  );
  if (root) used.add(normalizeDiscoveryUrl(root.url));
  const selected = collection.pages.filter((p) =>
    used.has(normalizeDiscoveryUrl(p.url)),
  );
  const pages = selected.map((page) => {
    const excerpts = facts
      .filter((f) => f.sourceUrl === normalizeDiscoveryUrl(page.url))
      .map((f) => f.evidenceExcerpt);
    if (admission?.sourceUrl === page.url)
      excerpts.push(admission.proposal.evidenceExcerpt);
    const evidenceText = [
      ...new Set([page.normalizedText.slice(0, 500), ...excerpts]),
    ].join("\n");
    const value = {
      requestedUrl: page.url,
      canonicalUrl: normalizeDiscoveryUrl(page.url),
      finalUrl: page.finalUrl,
      httpStatus: page.httpStatus,
      contentType:
        page.mimeType as BootstrapArtifact["collection"]["pages"][number]["contentType"],
      collectedAt: page.collectedAt.toISOString(),
      responseBytes: page.responseBytes,
      durationMs: page.durationMs,
      responseContentHash: page.contentHash,
      evidenceText,
      evidenceTextHash: digest(evidenceText),
    };
    return { ...value, contentFingerprint: pageFingerprint(value) };
  });
  const artifact = {
    artifactVersion: 1,
    generatedAt: generatedAt.toISOString(),
    seedSha256,
    target: {
      institutionId: collection.target.institutionId,
      slug: collection.target.slug,
      institutionName: collection.target.institutionName,
      category: "PRIVATE_ELEMENTARY",
    },
    classification: classification({ ...collection, admission }),
    collection: {
      websiteCollection:
        collection.status === "SCHOOL_FETCH_FAILED"
          ? "FETCH_FAILED"
          : collection.partialFetchWarning
            ? "PARTIAL"
            : "SUCCESS",
      pagesScheduled: collection.pagesScheduled,
      pagesFetched: collection.pagesFetched,
      pages,
      warnings: [
        ...collection.warnings,
        ...(collection.admission && !admission
          ? ["STALE_ADMISSION_CYCLE_NOT_PUBLISHED"]
          : []),
      ],
      errors: [...collection.errors],
    },
    sources: [
      {
        canonicalUrl: collection.target.registryUrl,
        sourceType: "OFFICIAL_REGISTRY",
        authority: "SECONDARY_OFFICIAL",
        sourceName: `${collection.target.institutionName} 학교알리미 공식 등록정보`,
      },
      ...selected.map((page) => ({
        canonicalUrl: normalizeDiscoveryUrl(page.url),
        sourceType: page.sourceType,
        authority: "PRIMARY" as const,
        sourceName: page.sourceName,
      })),
    ],
    facts,
    admission:
      admission === null
        ? null
        : {
            ...admission.proposal,
            applicationOpenAt:
              admission.proposal.applicationOpenAt?.toISOString() ?? null,
            applicationCloseAt:
              admission.proposal.applicationCloseAt?.toISOString() ?? null,
            eventStartAt:
              admission.proposal.eventStartAt?.toISOString() ?? null,
            eventEndAt: admission.proposal.eventEndAt?.toISOString() ?? null,
            sourceUrl: normalizeDiscoveryUrl(admission.sourceUrl),
            collectedAt: admission.collectedAt.toISOString(),
            warnings: [...admission.proposal.warnings],
            contentFingerprint: liveAdmissionContentFingerprint(
              admission.proposal,
            ),
          },
    artifactChecksum: "0".repeat(64),
  };
  artifact.artifactChecksum = artifactChecksum(artifact);
  const parsed = bootstrapArtifactSchema.safeParse(artifact);
  if (!parsed.success) reject();
  return parsed.data;
}

export function validateBootstrapArtifact(
  value: unknown,
  targets: readonly PrivateElementaryBootstrapTarget[],
  seedSha256: string,
  now = new Date(),
): CollectedPrivateElementarySchool {
  if (
    Buffer.byteLength(JSON.stringify(value) ?? "") >
    MAX_BOOTSTRAP_ARTIFACT_BYTES
  )
    reject();
  const parsed = bootstrapArtifactSchema.safeParse(value);
  if (!parsed.success) reject();
  const a = parsed.data;
  if (a.artifactChecksum !== artifactChecksum(a) || a.seedSha256 !== seedSha256)
    reject();
  if (
    targets.length !== 41 ||
    new Set(targets.map((t) => t.slug)).size !== 41 ||
    targets.some((t) => t.category !== "PRIVATE_ELEMENTARY")
  )
    reject();
  const target = targets.find((t) => t.slug === a.target.slug);
  if (
    !target ||
    target.institutionName !== a.target.institutionName ||
    (target.institutionId !== null &&
      target.institutionId !== a.target.institutionId)
  )
    reject();
  const resolvedTarget = { ...target, institutionId: a.target.institutionId };
  if (
    !Number.isFinite(now.getTime()) ||
    Date.parse(a.generatedAt) > now.getTime() + 300000
  )
    reject();
  const sources = new Map(a.sources.map((s) => [s.canonicalUrl, s]));
  const pages = new Map(a.collection.pages.map((p) => [p.canonicalUrl, p]));
  if (
    sources.size !== a.sources.length ||
    pages.size !== a.collection.pages.length ||
    new Set(a.facts.map((f) => f.factType)).size !== a.facts.length
  )
    reject();
  if (
    a.collection.pages.length > a.collection.pagesFetched ||
    a.collection.pagesFetched > a.collection.pagesScheduled
  )
    reject();
  if (
    a.collection.websiteCollection === "FETCH_FAILED" &&
    (pages.size > 0 || a.admission !== null)
  )
    reject();
  if (a.collection.websiteCollection !== "FETCH_FAILED" && pages.size === 0)
    reject();
  const registry = sources.get(target.registryUrl);
  if (
    !registry ||
    registry.sourceType !== "OFFICIAL_REGISTRY" ||
    registry.authority !== "SECONDARY_OFFICIAL"
  )
    reject();
  for (const source of a.sources) {
    const isRegistry = source.canonicalUrl === target.registryUrl;
    officialUrl(source.canonicalUrl, target, isRegistry);
    if (normalizeDiscoveryUrl(source.canonicalUrl) !== source.canonicalUrl)
      reject();
    if (
      !isRegistry &&
      (source.authority !== "PRIMARY" ||
        source.sourceType === "OFFICIAL_REGISTRY" ||
        !pages.has(source.canonicalUrl))
    )
      reject();
  }
  for (const page of a.collection.pages) {
    officialUrl(page.requestedUrl, target);
    officialUrl(page.canonicalUrl, target);
    officialUrl(page.finalUrl, target);
    if (
      !["text/html", "application/xhtml+xml", "application/pdf"].includes(
        page.contentType,
      ) &&
      !(
        sources.get(page.canonicalUrl)?.sourceType === "OFFICIAL_DOCUMENT" &&
        /\.pdf(?:$|[?#])/iu.test(page.finalUrl)
      )
    )
      reject();
    if (
      normalizeDiscoveryUrl(page.requestedUrl) !== page.canonicalUrl ||
      !sources.has(page.canonicalUrl) ||
      Date.parse(page.collectedAt) > Date.parse(a.generatedAt)
    )
      reject();
    if (
      page.evidenceTextHash !== digest(page.evidenceText) ||
      page.contentFingerprint !== pageFingerprint(page)
    )
      reject();
  }
  const baseline = buildRegistryBaselineFacts(target);
  for (const expected of baseline) {
    const actual = a.facts.find((f) => f.factType === expected.factType);
    if (!actual || actual.contentFingerprint !== factFingerprint(expected))
      reject();
  }
  for (const fact of a.facts) {
    if (fact.contentFingerprint !== factFingerprint(fact)) reject();
    if (fact.sourceUrl === target.registryUrl) {
      if (!baseline.some((f) => f.factType === fact.factType)) reject();
    } else {
      officialUrl(fact.sourceUrl, target);
      const page = pages.get(fact.sourceUrl);
      if (!page || !page.evidenceText.includes(fact.evidenceExcerpt)) reject();
      if (
        fact.displayText !== fact.evidenceExcerpt ||
        json(fact.valueJson) !==
          json({
            text: fact.displayText,
            evidenceExcerpt: fact.evidenceExcerpt,
            sourceUrl: fact.sourceUrl,
          })
      )
        reject();
    }
  }
  let admission: CollectedPrivateElementarySchool["admission"] = null;
  if (a.admission) {
    const proposal = admissionProposal(a.admission);
    officialUrl(a.admission.sourceUrl, target);
    officialUrl(proposal.actionUrl, target);
    const page = pages.get(a.admission.sourceUrl);
    if (
      !page ||
      page.collectedAt !== a.admission.collectedAt ||
      !page.evidenceText.includes(proposal.evidenceExcerpt) ||
      isStaleAdmissionCycle(proposal.academicYearLabel) ||
      liveAdmissionContentFingerprint(proposal) !==
        a.admission.contentFingerprint
    )
      reject();
    for (const [start, end] of [
      [proposal.applicationOpenAt, proposal.applicationCloseAt],
      [proposal.eventStartAt, proposal.eventEndAt],
    ])
      if (start && end && start > end) reject();
    const dates = [
      proposal.applicationOpenAt,
      proposal.applicationCloseAt,
      proposal.eventStartAt,
      proposal.eventEndAt,
    ];
    if (
      proposal.knowledgeState === "SCHEDULE_FOUND"
        ? !proposal.academicYearLabel || !dates.some(Boolean)
        : dates.some(Boolean) || proposal.businessState !== "UNKNOWN"
    )
      reject();
    admission = {
      proposal,
      sourceUrl: a.admission.sourceUrl,
      collectedAt: new Date(a.admission.collectedAt),
    };
  }
  const collection: CollectedPrivateElementarySchool = {
    target: resolvedTarget,
    status:
      a.collection.websiteCollection === "FETCH_FAILED"
        ? "SCHOOL_FETCH_FAILED"
        : "COLLECTED",
    partialFetchWarning: a.collection.websiteCollection === "PARTIAL",
    pagesScheduled: a.collection.pagesScheduled,
    pagesFetched: a.collection.pagesFetched,
    candidateUrls: [],
    pages: a.collection.pages.map((page) => {
      const source = sources.get(page.canonicalUrl)!;
      return {
        url: page.canonicalUrl,
        finalUrl: page.finalUrl,
        sourceName: source.sourceName,
        sourceType: source.sourceType as BootstrapEvidencePage["sourceType"],
        classificationHint:
          source.sourceType === "OFFICIAL_ADMISSION_PAGE"
            ? "ADMISSIONS"
            : "OTHER",
        collectedAt: new Date(page.collectedAt),
        contentHash: page.contentFingerprint,
        textHash: page.evidenceTextHash,
        normalizedText: page.evidenceText,
        mimeType: page.contentType,
        httpStatus: page.httpStatus,
        responseBytes: page.responseBytes,
        durationMs: page.durationMs,
        extractionHtml: "",
        score: 0,
      };
    }),
    facts: a.facts.map(
      ({ factType, valueJson, displayText, sourceUrl, evidenceExcerpt }) => ({
        factType,
        valueJson,
        displayText,
        sourceUrl,
        evidenceExcerpt,
      }),
    ),
    admission,
    warnings: a.collection.warnings,
    errors: a.collection.errors,
  };
  if (a.classification !== classification(collection)) reject();
  return collection;
}
