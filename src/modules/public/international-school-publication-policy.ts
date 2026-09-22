import { sql } from "drizzle-orm";

import { institutions } from "@/src/db/schema";
import type {
  InstitutionCategory,
  InstitutionOperationalState,
  InstitutionPublicationState,
} from "@/src/db/schema";

export type InternationalSchoolPublicEligibilityInput = Readonly<{
  category: InstitutionCategory;
  publicationState: InstitutionPublicationState;
  operationalState: InstitutionOperationalState;
  hasIsiIdentity: boolean;
}>;

export function isInternationalSchoolPubliclyEligible(
  input: InternationalSchoolPublicEligibilityInput,
): boolean {
  if (input.publicationState !== "PUBLISHED") return false;
  if (input.category !== "INTERNATIONAL_SCHOOL") return true;

  return input.operationalState === "ACTIVE" && input.hasIsiIdentity;
}

/** SQL equivalent for queries that reference the canonical Institutions table. */
export function internationalSchoolPublicEligibilitySql() {
  return sql`(
    ${institutions.category} <> 'INTERNATIONAL_SCHOOL'
    or (
      ${institutions.operationalState} = 'ACTIVE'
      and exists (
        select 1
        from institution_registry_identities isi
        where isi.institution_id = ${institutions.id}
          and isi.registry_name = 'ISI'
      )
    )
  )`;
}
