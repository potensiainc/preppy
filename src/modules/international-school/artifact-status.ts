import type { CoverageStatus } from "@/src/modules/english-kindergarten/coverage";

export const artifactEvidenceStatusValues = [
  "VERIFIED",
  "VERIFIED_WITH_WARNING",
  "VERIFIED_WITH_DATE_LIMIT",
  "NEEDS_REVIEW",
  "NOT_FOUND_IN_CHECKED_OFFICIAL_SOURCES",
  "ACCESS_FAILED",
  "LEAD_ONLY",
  "LOGIN_REQUIRED",
  "ROBOTS_BLOCKED",
  "NO_PUBLIC_RESULT",
] as const;

export type ArtifactEvidenceStatus =
  (typeof artifactEvidenceStatusValues)[number];

export function mapArtifactStatusToCoverage(
  status: ArtifactEvidenceStatus,
): CoverageStatus | null {
  if (status === "VERIFIED") return "CONFIRMED";
  if (
    status === "VERIFIED_WITH_WARNING" ||
    status === "VERIFIED_WITH_DATE_LIMIT" ||
    status === "NEEDS_REVIEW"
  ) {
    return "NEEDS_REVIEW";
  }
  if (status === "NOT_FOUND_IN_CHECKED_OFFICIAL_SOURCES") {
    return "CHECKED_NOT_FOUND";
  }
  if (status === "ACCESS_FAILED") return "ACCESS_FAILED";
  return null;
}
