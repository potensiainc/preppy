import "server-only";

import { isInstitutionFollowable } from "@/src/modules/follow/followability-policy.server";

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
  hasMonitorableSourceCoverage: (id: string) => Promise<boolean>,
): Promise<ResolvedPendingFollowTarget<Institution> | null> {
  const institution = await findInstitution(institutionId);
  const monitorable = institution
    ? await hasMonitorableSourceCoverage(institution.id)
    : false;
  if (
    !institution ||
    institution.id.toLowerCase() !== institutionId.toLowerCase() ||
    !isInstitutionFollowable(institution, monitorable)
  ) {
    return null;
  }

  return {
    institution,
    canonicalPath: `/institutions/${institution.slug}`,
  };
}
