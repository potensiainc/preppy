import "server-only";

export type PendingFollowInstitutionRecord = {
  id: string;
  slug: string;
  publicationState: string;
  operationalState: string;
};

export type ResolvedPendingFollowTarget<
  Institution extends PendingFollowInstitutionRecord =
    PendingFollowInstitutionRecord,
> = {
  institution: Institution;
  canonicalPath: string;
};

export async function resolveCanonicalPendingFollowTarget<
  Institution extends PendingFollowInstitutionRecord,
>(
  institutionId: string,
  findInstitution: (id: string) => Promise<Institution | null>,
): Promise<ResolvedPendingFollowTarget<Institution> | null> {
  const institution = await findInstitution(institutionId);
  if (
    !institution ||
    institution.id.toLowerCase() !== institutionId.toLowerCase() ||
    institution.publicationState !== "PUBLISHED" ||
    institution.operationalState === "CLOSED"
  ) {
    return null;
  }

  return {
    institution,
    canonicalPath: `/institutions/${institution.slug}`,
  };
}
