import { createHash } from "node:crypto";
import type { PrivateElementaryBootstrapTarget } from "@/src/modules/institution-detail-bootstrap/contracts";

export const correctionTestTime = new Date("2026-08-30T09:00:00.000Z");
export const hashText = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function correctionSchool(target: PrivateElementaryBootstrapTarget) {
  const requestedUrl = new URL("/admission.png", target.websiteUrl).href;
  const evidenceText =
    "2027 학년도 모집요강(안). 원서접수 2026-11-06 09:00 ~ 2026-11-11 16:30. 설명회 2026-10-31 10:00, 14:00. 2020년 출생 아동. 2025년 기준 수업료 2,488,000원 · 2026학년도 변동 가능";
  return {
    target: {
      institutionId: target.institutionId!,
      slug: target.slug,
      institutionName: target.institutionName,
      category: "PRIVATE_ELEMENTARY" as const,
    },
    reviewedAt: "2026-08-30T08:30:00.000Z",
    sources: [
      {
        requestedUrl,
        finalUrl: requestedUrl,
        sourceName: "공식 모집요강 원본",
        sourceType: "OFFICIAL_DOCUMENT" as const,
        captureMethod: "HTTP_ORIGINAL_MEDIA" as const,
        httpStatus: 200,
        contentType: "image/png",
        fetchedAt: "2026-08-30T08:00:00.000Z",
        responseBytes: 1000,
        durationMs: 200,
        responseContentHash: hashText("original image bytes"),
        evidenceText,
        evidenceTextHash: hashText(evidenceText),
      },
    ],
    admissions: [
      {
        key: "main",
        academicYearLabel: "2027학년도" as string | null,
        rawAcademicYear: "2027 학년도" as string | null,
        knowledgeState: "SCHEDULE_FOUND" as const,
        kind: "RECRUITMENT" as string,
        businessState: "UPCOMING" as const,
        title: "모집요강(안)",
        summary: "원서접수 일정 확인",
        targetAudience: "2020년 출생 아동",
        applicationOpenAt: "2026-11-06T00:00:00.000Z" as string | null,
        applicationCloseAt: "2026-11-11T07:30:00.000Z" as string | null,
        eventStartAt: null as string | null,
        eventEndAt: null as string | null,
        actionUrl: requestedUrl,
        sourceUrls: [requestedUrl],
        evidenceExcerpt:
          "2027 학년도 모집요강(안). 원서접수 2026-11-06 09:00 ~ 2026-11-11 16:30.",
      },
    ],
    facts: [
      {
        factType: "TUITION" as const,
        displayText: "2025년 기준 수업료 2,488,000원 · 2026학년도 변동 가능",
        evidenceExcerpt:
          "2025년 기준 수업료 2,488,000원 · 2026학년도 변동 가능",
        sourceUrls: [requestedUrl],
        valueJson: {
          text: "2025년 기준 수업료 2,488,000원 · 2026학년도 변동 가능",
        },
      },
    ],
    retireFacts: [] as Array<{
      factType: string;
      versionId: string;
      expectedDisplayText: string;
      reason: string;
    }>,
  };
}

export function correctionFixture(
  targets: readonly PrivateElementaryBootstrapTarget[],
  seedSha256: string,
) {
  const schools = targets.map(correctionSchool);
  return {
    bundle: {
      correctionVersion: 1,
      generatedAt: correctionTestTime.toISOString(),
      seedSha256,
      schools,
      artifactChecksum: "",
    },
    manifest: {
      manifestVersion: 1,
      schools: schools.map((s) => ({
        institutionId: s.target.institutionId,
        slug: s.target.slug,
        urls: s.sources.map((p) => p.requestedUrl),
      })),
    },
  };
}
