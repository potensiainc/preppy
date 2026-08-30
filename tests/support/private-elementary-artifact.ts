import { createHash } from "node:crypto";

import type { PrivateElementaryBootstrapTarget } from "@/src/modules/institution-detail-bootstrap/contracts";
import type { CollectedPrivateElementarySchool } from "@/src/modules/institution-detail-bootstrap/discovery.server";
import { buildRegistryBaselineFacts } from "@/src/modules/institution-detail-bootstrap/fact-extractor";

export const artifactTestTime = new Date("2026-08-30T08:00:00.000Z");

export function artifactTestCollection(
  target: PrivateElementaryBootstrapTarget,
): CollectedPrivateElementarySchool {
  const sourceUrl = new URL("/artifact-test-admission", target.websiteUrl).href;
  const tuition = "2025학년도 1기 수업료 2,000,000원";
  const evidence =
    "2027학년도 신입생 모집 원서접수 2026년 11월 9일 ~ 11월 13일, 2020년 출생 아동";
  const text = `${evidence}\n${tuition}`;
  const collectedAt = new Date("2026-08-30T07:59:00.000Z");
  const page = (url: string, root: boolean) => ({
    url,
    finalUrl: url,
    sourceName: `${target.institutionName} 공식 안내`,
    sourceType: root
      ? ("OFFICIAL_SCHOOL_PAGE" as const)
      : ("OFFICIAL_ADMISSION_PAGE" as const),
    classificationHint: root ? ("OTHER" as const) : ("ADMISSIONS" as const),
    collectedAt,
    contentHash: createHash("sha256").update(`<p>${text}</p>`).digest("hex"),
    textHash: createHash("sha256").update(text).digest("hex"),
    normalizedText: text,
    mimeType: "text/html",
    httpStatus: 200,
    responseBytes: Buffer.byteLength(`<p>${text}</p>`),
    durationMs: 2,
    extractionHtml: `<p>${text}</p>`,
    score: root ? 0 : 100,
  });
  return {
    target,
    status: "COLLECTED",
    partialFetchWarning: false,
    pagesScheduled: 2,
    pagesFetched: 2,
    candidateUrls: [sourceUrl],
    pages: [page(target.websiteUrl, true), page(sourceUrl, false)],
    facts: [
      ...buildRegistryBaselineFacts(target),
      {
        factType: "TUITION",
        displayText: tuition,
        evidenceExcerpt: tuition,
        sourceUrl,
        valueJson: { text: tuition, evidenceExcerpt: tuition, sourceUrl },
      },
    ],
    admission: {
      sourceUrl,
      collectedAt,
      proposal: {
        academicYearLabel: "2027학년도",
        knowledgeState: "SCHEDULE_FOUND",
        kind: "RECRUITMENT",
        businessState: "UPCOMING",
        title: "2027학년도 신입생 모집",
        summary: evidence,
        targetAudience: "2020년 출생 아동",
        applicationOpenAt: new Date("2026-11-08T15:00:00.000Z"),
        applicationCloseAt: new Date("2026-11-12T15:00:00.000Z"),
        eventStartAt: null,
        eventEndAt: null,
        actionUrl: sourceUrl,
        evidenceExcerpt: evidence,
        warnings: [],
      },
    },
    warnings: [],
    errors: [],
  };
}
