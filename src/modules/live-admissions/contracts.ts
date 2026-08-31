import type {
  OpportunityBusinessState,
  OpportunityKind,
} from "@/src/db/schema";
import type { CandidateClassification } from "@/src/modules/http-collector/classification";

export type LiveAdmissionKnowledgeState =
  "SCHEDULE_FOUND" | "GUIDANCE_FOUND" | "NOT_ANNOUNCED" | "NOT_FOUND";

export type LiveAdmissionExtractionInput = Readonly<{
  html: string | Uint8Array;
  sourceUrl: string;
  classificationHint: CandidateClassification;
  targetAcademicYearLabel: string;
  referenceTime: Date;
}>;

export type LiveAdmissionProposal = Readonly<{
  academicYearLabel: string | null;
  knowledgeState: LiveAdmissionKnowledgeState;
  kind: OpportunityKind;
  businessState: OpportunityBusinessState;
  title: string;
  summary: string | null;
  targetAudience: string | null;
  eventStartAt: Date | null;
  eventEndAt: Date | null;
  applicationOpenAt: Date | null;
  applicationCloseAt: Date | null;
  actionUrl: string;
  evidenceExcerpt: string;
  warnings: readonly string[];
}>;
