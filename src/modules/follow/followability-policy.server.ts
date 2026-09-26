import "server-only";

import { sql } from "drizzle-orm";

import type {
  InstitutionCategory,
  InstitutionOperationalState,
  InstitutionPublicationState,
} from "@/src/db/schema";
import type { DatabaseExecutor } from "@/src/infrastructure/db/runtime.server";
import { isInternationalSchoolPubliclyEligible } from "@/src/modules/public/international-school-publication-policy";

const MAX_INSTITUTION_COVERAGE_BATCH = 100;

export type FollowabilityInstitution = {
  category: InstitutionCategory;
  publicationState: InstitutionPublicationState;
  operationalState: InstitutionOperationalState;
  hasIsiIdentity: boolean;
};

/** Saving a public institution is independent of monitoring and email readiness. */
export function isInstitutionFollowable(
  institution: FollowabilityInstitution,
  _hasMonitorableSourceCoverage?: boolean,
): boolean {
  return (
    isInternationalSchoolPubliclyEligible({
      category: institution.category,
      publicationState: institution.publicationState,
      operationalState: institution.operationalState,
      hasIsiIdentity: institution.hasIsiIdentity,
    }) && institution.operationalState !== "CLOSED"
  );
}

export async function getInstitutionIsiIdentityIds(
  executor: DatabaseExecutor,
  institutionIds: readonly string[],
): Promise<Set<string>> {
  const ids = [...new Set(institutionIds)];
  if (ids.length === 0) return new Set();
  if (ids.length > MAX_INSTITUTION_COVERAGE_BATCH) {
    throw new Error("Institution ISI identity batch exceeds the query limit.");
  }

  const rows = (await executor.raw(sql`
    select distinct identity.institution_id as "institutionId"
    from institution_registry_identities identity
    where identity.registry_name = 'ISI'
      and identity.institution_id in (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )})
    order by identity.institution_id
  `)) as unknown as Array<{ institutionId: string }>;

  return new Set(rows.map((row) => row.institutionId));
}

export async function hasInstitutionIsiIdentity(
  executor: DatabaseExecutor,
  institutionId: string,
): Promise<boolean> {
  return (await getInstitutionIsiIdentityIds(executor, [institutionId])).has(
    institutionId,
  );
}

/**
 * Conservative existing-schema coverage proof. A Source is monitorable only
 * when it is active, official, and explicitly enabled for monitoring. Its
 * relationship to an Institution must be proven through one of the three
 * canonical paths available in the current schema.
 */
export async function getMonitorableInstitutionIds(
  executor: DatabaseExecutor,
  institutionIds: readonly string[],
): Promise<Set<string>> {
  const ids = [...new Set(institutionIds)];
  if (ids.length === 0) return new Set();
  if (ids.length > MAX_INSTITUTION_COVERAGE_BATCH) {
    throw new Error(
      "Institution source-coverage batch exceeds the query limit.",
    );
  }

  const rows = (await executor.raw(sql`
    with monitorable_sources as (
      select source.id
      from sources source
      join source_monitor_configs monitor
        on monitor.source_id = source.id and monitor.is_enabled = true
      where source.lifecycle_status = 'ACTIVE'
        and source.authority_level in ('PRIMARY', 'SECONDARY_OFFICIAL')
        and source.source_type in (
          'OFFICIAL_ADMISSION_PAGE',
          'OFFICIAL_NOTICE_BOARD',
          'OFFICIAL_DOCUMENT',
          'OFFICIAL_APPLICATION_PORTAL',
          'OFFICIAL_SCHOOL_PAGE',
          'OFFICIAL_SOCIAL'
        )
    ), covered_institutions as (
      select link.institution_id
      from institution_school_links link
      join source_bindings binding
        on binding.school_id = link.school_id and binding.is_active = true
      join monitorable_sources source on source.id = binding.source_id

      union

      select fact.institution_id
      from institution_facts fact
      join institutions institution on institution.id = fact.institution_id
      join institution_fact_versions version
        on version.institution_fact_id = fact.id
       and version.is_current = true
       and version.verification_state = 'VERIFIED'
       and version.verified_at is not null
      join institution_fact_version_evidence evidence
        on evidence.institution_fact_version_id = version.id
      join monitorable_sources source on source.id = evidence.source_id
      where institution.category <> 'INTERNATIONAL_SCHOOL'
         or (
           evidence.source_observation_id is not null
           and evidence.source_snapshot_id is not null
         )

      union

      select opportunity.institution_id
      from opportunities opportunity
      join institutions institution on institution.id = opportunity.institution_id
      join opportunity_versions version
        on version.opportunity_id = opportunity.id
       and version.is_current = true
       and version.verification_state = 'VERIFIED'
       and version.verified_at is not null
      join opportunity_version_evidence evidence
        on evidence.opportunity_version_id = version.id
      join monitorable_sources source on source.id = evidence.source_id
      where opportunity.publication_state = 'PUBLISHED'
        and (
          institution.category <> 'INTERNATIONAL_SCHOOL'
          or (
            evidence.source_observation_id is not null
            and evidence.source_snapshot_id is not null
          )
        )
    )
    select distinct covered.institution_id as "institutionId"
    from covered_institutions covered
    where covered.institution_id in (${sql.join(
      ids.map((id) => sql`${id}`),
      sql`, `,
    )})
    order by covered.institution_id
  `)) as unknown as Array<{ institutionId: string }>;

  return new Set(rows.map((row) => row.institutionId));
}

export async function hasMonitorableSourceCoverage(
  executor: DatabaseExecutor,
  institutionId: string,
): Promise<boolean> {
  return (await getMonitorableInstitutionIds(executor, [institutionId])).has(
    institutionId,
  );
}
