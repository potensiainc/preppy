import type { CandidateClassification } from "@/src/modules/http-collector/classification";
import type { LiveAdmissionProposal } from "@/src/modules/live-admissions/contracts";
import { extractLiveAdmissionProposal } from "@/src/modules/live-admissions/extractor";

export type AdmissionExtractionPage = Readonly<{
  sourceUrl: string;
  content: string | Uint8Array;
  classificationHint: CandidateClassification;
  collectedAt: Date;
}>;

export type SelectedAdmissionProposal = Readonly<{
  proposal: LiveAdmissionProposal;
  collectedAt: Date;
  sourceUrl: string;
}>;

// This bounded command bootstraps current information at the owner's 2026 reference year.
export function isStaleAdmissionCycle(
  academicYearLabel: string | null,
): boolean {
  const year = academicYearLabel?.match(/20\d{2}/u)?.[0];
  return year !== undefined && Number(year) < 2026;
}

function academicYear(proposal: LiveAdmissionProposal): number {
  const year = proposal.academicYearLabel?.match(/20\d{2}/u)?.[0];
  return year === undefined ? -1 : Number(year);
}

function knowledgeScore(proposal: LiveAdmissionProposal): number {
  switch (proposal.knowledgeState) {
    case "SCHEDULE_FOUND":
      return 3;
    case "GUIDANCE_FOUND":
      return 2.5;
    case "NOT_ANNOUNCED":
      return 2;
    case "NOT_FOUND":
      return 1;
  }
}

export function selectCurrentAdmissionProposal(
  pages: readonly AdmissionExtractionPage[],
  referenceTime: Date,
): SelectedAdmissionProposal | null {
  if (!Number.isFinite(referenceTime.getTime())) {
    throw new RangeError("referenceTime must be valid");
  }
  const proposals = pages.map((page, index) => ({
    page,
    index,
    proposal: extractLiveAdmissionProposal({
      html: page.content,
      sourceUrl: page.sourceUrl,
      classificationHint:
        page.classificationHint === "OPEN_HOUSE" ? "OPEN_HOUSE" : "ADMISSIONS",
      targetAcademicYearLabel: "2027학년도",
      referenceTime,
    }),
  }));
  proposals.sort(
    (left, right) =>
      academicYear(right.proposal) - academicYear(left.proposal) ||
      knowledgeScore(right.proposal) - knowledgeScore(left.proposal) ||
      left.index - right.index,
  );
  const selected = proposals[0];
  return selected === undefined
    ? null
    : Object.freeze({
        proposal: selected.proposal,
        collectedAt: selected.page.collectedAt,
        sourceUrl: selected.page.sourceUrl,
      });
}
