import { load } from "cheerio";

import type { InstitutionFactType } from "@/src/db/schema";
import { normalizeVisibleText } from "@/src/modules/http-collector/html";
import type { PrivateElementaryBootstrapTarget } from "./contracts";

const MAX_FACT_EVIDENCE_EXCERPT = 1_000;

export type ExtractedInstitutionFact = Readonly<{
  factType: InstitutionFactType;
  displayText: string;
  valueJson: Readonly<Record<string, unknown>>;
  evidenceExcerpt: string;
  sourceUrl: string;
}>;

const RULES: readonly Readonly<{
  factType: Exclude<InstitutionFactType, "OPERATING_INFO">;
  pattern: RegExp;
}>[] = Object.freeze([
  {
    factType: "TUITION",
    pattern: /교육비|수업료|입학금|납입금|tuition|school\s*fees?/iu,
  },
  {
    factType: "TARGET_AGE_GRADE",
    pattern:
      /(?:모집|입학|신입학|지원)\s*(?:대상|학년)|대상\s*학년|취학\s*(?:예정|대상)|초등학교\s*[1-6]\s*학년|grade\s*[1-6]/iu,
  },
  {
    factType: "CURRICULUM",
    pattern:
      /교육과정|특색교육|교육활동|영어\s*(?:교육|활동)|외국어\s*교육|예술.{0,12}교육|체육.{0,12}교육|curriculum/iu,
  },
  {
    factType: "ELIGIBILITY",
    pattern:
      /지원\s*(?:자격|조건|대상)|입학\s*자격|취학\s*(?:의무|대상)|eligible|eligibility/iu,
  },
  {
    factType: "TRANSPORT",
    pattern: /통학\s*(?:버스|차량)|스쿨버스|차량\s*운행|school\s*bus/iu,
  },
  {
    factType: "ADMISSION_PROCESS",
    pattern:
      /입학\s*절차|전형\s*절차|지원.{0,24}(?:추첨|면접|등록)|원서\s*접수.{0,40}(?:추첨|면접|등록)|(?:추첨|면접).{0,24}등록/iu,
  },
]);

function contentBlocks(content: string): readonly string[] {
  const $ = load(content);
  $("script, style, noscript, template").remove();
  const values = $("h1, h2, h3, h4, p, li, tr, dd, dt")
    .toArray()
    .map((element) => normalizeVisibleText($(element).text()))
    .filter(Boolean);
  if (values.length === 0) {
    const fallback = normalizeVisibleText($.root().text());
    return fallback ? [fallback] : [];
  }
  return [...new Set(values)];
}

function bounded(value: string): string {
  return value.slice(0, MAX_FACT_EVIDENCE_EXCERPT);
}

export function extractInstitutionFacts(
  input: Readonly<{
    sourceUrl: string;
    content: string;
  }>,
): readonly ExtractedInstitutionFact[] {
  const blocks = contentBlocks(input.content);
  const facts: ExtractedInstitutionFact[] = [];
  for (const rule of RULES) {
    const evidence = blocks.find((block) => rule.pattern.test(block));
    if (evidence === undefined) continue;
    const excerpt = bounded(evidence);
    facts.push(
      Object.freeze({
        factType: rule.factType,
        displayText: excerpt,
        valueJson: Object.freeze({
          text: excerpt,
          evidenceExcerpt: excerpt,
          sourceUrl: input.sourceUrl,
        }),
        evidenceExcerpt: excerpt,
        sourceUrl: input.sourceUrl,
      }),
    );
  }
  return Object.freeze(facts);
}

export function buildOperatingInfoFact(
  input: Readonly<{
    institutionName: string;
    address: string;
    gradeRange: string;
    websiteUrl: string;
    registryUrl: string;
  }>,
): ExtractedInstitutionFact {
  const displayText = bounded(
    `${input.institutionName} · 사립초등학교 · ${input.gradeRange} · ${input.address} · 공식 홈페이지 ${input.websiteUrl}`,
  );
  return Object.freeze({
    factType: "OPERATING_INFO" as const,
    displayText,
    valueJson: Object.freeze({
      institutionName: input.institutionName,
      institutionType: "PRIVATE_ELEMENTARY",
      address: input.address,
      gradeRange: input.gradeRange,
      officialWebsite: input.websiteUrl,
      evidenceExcerpt: displayText,
      sourceUrl: input.registryUrl,
    }),
    evidenceExcerpt: displayText,
    sourceUrl: input.registryUrl,
  });
}

/** Checksum-validated seed provenance, not a claim that the website was fetched. */
export function buildRegistryBaselineFacts(
  target: PrivateElementaryBootstrapTarget,
): readonly ExtractedInstitutionFact[] {
  const registryUrl = new URL(target.registryUrl);
  if (
    target.registryName !== "SCHOOLINFO" ||
    registryUrl.protocol !== "https:" ||
    registryUrl.hostname !== "www.schoolinfo.go.kr" ||
    !target.institutionName.trim() ||
    !target.address.trim() ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(target.registryVerifiedAt) ||
    !Number.isFinite(Date.parse(target.registryVerifiedAt))
  ) {
    throw new Error("REGISTRY_BASELINE_INVALID");
  }
  const provenance = {
    registryName: target.registryName,
    registryExternalId: target.registryExternalId,
    registryVerifiedAt: target.registryVerifiedAt,
    province: target.province,
    cityDistrict: target.cityDistrict,
  };
  const operating = buildOperatingInfoFact(target);
  const facts: ExtractedInstitutionFact[] = [
    Object.freeze({
      ...operating,
      valueJson: Object.freeze({ ...operating.valueJson, ...provenance }),
    }),
  ];
  if (
    target.offersElementary &&
    /^초등학교\s*\(\s*1\s*[-–~]\s*6\s*\)$/u.test(target.gradeRange)
  ) {
    const displayText =
      "초등학교 1~6학년 (학교 교육과정 기준; 신입생 모집 대상 아님)";
    const evidenceExcerpt = `${target.institutionName} · grade_range_raw=${target.gradeRange} · offers_elementary=true`;
    facts.push(
      Object.freeze({
        factType: "TARGET_AGE_GRADE",
        displayText,
        evidenceExcerpt,
        sourceUrl: target.registryUrl,
        valueJson: Object.freeze({
          ...provenance,
          text: displayText,
          gradeRange: target.gradeRange,
          offersElementary: true,
          scope: "INSTITUTION_GRADE_RANGE",
          evidenceExcerpt,
          sourceUrl: target.registryUrl,
        }),
      }),
    );
  }
  return Object.freeze(facts);
}
