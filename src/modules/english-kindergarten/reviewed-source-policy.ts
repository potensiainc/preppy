const reviewedOfficialSourceTypes = new Set([
  "OFFICIAL_ADMISSION_PAGE",
  "OFFICIAL_NOTICE_BOARD",
  "OFFICIAL_DOCUMENT",
  "OFFICIAL_APPLICATION_PORTAL",
  "OFFICIAL_SCHOOL_PAGE",
  "OFFICIAL_SOCIAL",
]);
export function reviewedSourceEligibility(source: {
  lifecycleStatus: string;
  sourceType: string;
  authorityLevel: string;
}) {
  if (
    !reviewedOfficialSourceTypes.has(source.sourceType) ||
    !["PRIMARY", "SECONDARY_OFFICIAL"].includes(source.authorityLevel)
  )
    return "SOURCE_OFFICIAL_AUTHORITY_REQUIRED" as const;
  if (!["ACTIVE", "DISCOVERED"].includes(source.lifecycleStatus))
    return "SOURCE_LIFECYCLE_NOT_ALLOWED" as const;
  return null;
}
