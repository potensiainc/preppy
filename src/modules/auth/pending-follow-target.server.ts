import "server-only";

import type {
  InstitutionCategory,
  InstitutionOperationalState,
  InstitutionPublicationState,
} from "@/src/db/schema";
import { isInstitutionFollowable } from "@/src/modules/follow/followability-policy.server";

export type PendingFollowInstitutionRecord = {
  id: string;
  slug: string;
  category: InstitutionCategory;
  publicationState: InstitutionPublicationState;
  operationalState: InstitutionOperationalState;
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
  hasIsiIdentity: (id: string) => Promise<boolean>,
): Promise<ResolvedPendingFollowTarget<Institution> | null> {
  const institution = await findInstitution(institutionId);
  const [monitorable, isiIdentity] = institution
    ? await Promise.all([
        hasMonitorableSourceCoverage(institution.id),
        hasIsiIdentity(institution.id),
      ])
    : [false, false];
  if (
    !institution ||
    institution.id.toLowerCase() !== institutionId.toLowerCase() ||
    !isInstitutionFollowable(
      { ...institution, hasIsiIdentity: isiIdentity },
      monitorable,
    )
  ) {
    return null;
  }

  return {
    institution,
    canonicalPath: `/institutions/${institution.slug}`,
  };
}
