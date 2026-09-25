/**
 * Schema types for international school import artifacts.
 *
 * These types represent the structure of the curated international school
 * data package produced by the research workflow and consumed by the import
 * planner.
 */

export type EvidenceStatus =
  | "VERIFIED"
  | "VERIFIED_WITH_WARNING"
  | "VERIFIED_WITH_DATE_LIMIT"
  | "NEEDS_REVIEW"
  | "NOT_FOUND_IN_CHECKED_OFFICIAL_SOURCES"
  | "ACCESS_FAILED"
  | "ERROR";

export type EvidenceField =
  | "IDENTITY"
  | "TUITION"
  | "CURRICULUM"
  | "ELIGIBILITY"
  | "ADMISSION_PROCESS"
  | "INFORMATION_SESSION"
  | "OTHER";

export type EvidenceArtifactRecord = Readonly<{
  evidenceId: string;
  institutionRef: string;
  field: EvidenceField;
  sourceType: "OFFICIAL_REGISTRY" | "OFFICIAL_SCHOOL_PAGE" | "SOCIAL_MEDIA";
  sourceUrl: string;
  capturedAt: string;
  status: EvidenceStatus;
  contentHash: string;
  textHash: string;
  normalizedText: string | null;
  metadata: Record<string, unknown>;
}>;

export type AddressConflict = Readonly<{
  status: "NEEDS_REVIEW";
  values: readonly {
    addressLine: string;
    evidenceId: string;
  }[];
}>;

export type InstitutionArtifactRecord = Readonly<{
  institutionRef: string;
  registryExternalId: string;
  registryRecordUrl: string;
  slug: string;
  canonicalNameKo: string;
  canonicalNameEn: string;
  regionCode: string;
  city: string;
  district: string | null;
  addressLine: string | null;
  addressConflict?: AddressConflict;
  websiteUrl: string;
  category: "INTERNATIONAL_SCHOOL";
  subtype: "FOREIGN_SCHOOL";
  status: "OFFICIAL" | "SPECIAL_ACCESS" | "CANDIDATE";
}>;

export type CandidateArtifactRecord = Readonly<{
  candidateRef: string;
  name: string;
  websiteUrl: string | null;
  sourceUrl: string;
  status: "PENDING_VERIFICATION" | "REJECTED";
  rejectionReason?: string;
}>;

export type SpecialAccessArtifactRecord = Readonly<{
  institutionRef: string;
  name: string;
  websiteUrl: string | null;
  reason: string;
}>;

export type SocialEvidenceArtifactRecord = Readonly<{
  evidenceId: string;
  institutionRef: string;
  platform: string;
  sourceUrl: string;
  capturedAt: string;
  status: "COLLECTED" | "SKIPPED";
}>;

export type FactArtifactRecord = Readonly<{
  factRef: string;
  institutionRef: string;
  factType: string;
  valueJson: Record<string, unknown>;
  displayText: string | null;
  evidenceIds: readonly string[];
  verifiedAt: string;
}>;

export type OpportunityArtifactRecord = Readonly<{
  opportunityRef: string;
  institutionRef: string;
  slug: string;
  kind: string;
  title: string;
  businessState: string;
  eventStartsAt: string | null;
  applicationClosesAt: string | null;
  actionUrl: string | null;
  evidenceIds: readonly string[];
  verifiedAt: string;
}>;

export type CoverageArtifactRecord = Readonly<{
  institutionRef: string;
  section: string;
  status: string;
  academicYearLabel: string | null;
  publicNote: string | null;
  internalNote: string | null;
  sourceEvidenceId: string | null;
  lastCollectedAt: string | null;
  lastCheckedAt: string;
}>;

export type SnapshotMetadata = Readonly<{
  packageId: string;
  packageVersion: string;
  exportedAt: string;
  scope: readonly string[];
}>;

export type InternationalSchoolImportPackage = Readonly<{
  snapshot: SnapshotMetadata;
  institutions: readonly InstitutionArtifactRecord[];
  evidence: readonly EvidenceArtifactRecord[];
  facts: readonly FactArtifactRecord[];
  opportunities: readonly OpportunityArtifactRecord[];
  coverages: readonly CoverageArtifactRecord[];
  candidates: readonly CandidateArtifactRecord[];
  specialAccess: readonly SpecialAccessArtifactRecord[];
  socialEvidence: readonly SocialEvidenceArtifactRecord[];
}>;
