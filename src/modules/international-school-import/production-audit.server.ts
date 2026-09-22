import "server-only";

import { sql } from "drizzle-orm";

import { institutionIdForRegistryIdentity } from "@/src/modules/institution-seed/planner";
import {
  runWithProductionReadOnlyDatabase,
  UnsafeProductionConnectionError,
} from "@/src/modules/production-preflight/read-only-database.server";

import { planInternationalSchoolImport } from "./planner.server";
import {
  loadInternationalSchoolPackage,
  validateInternationalSchoolPackage,
} from "./validator";

type Environment = Record<string, string | undefined>;

type AuditCounts = Readonly<{
  existingIsiIdentities: number;
  exactDraftMatches: number;
  publicCollisions: number;
  materialCollisions: number;
  artifactOnlyDomainRows: number;
}>;

type AuditBlocker = Readonly<{
  code: string;
  key: string;
  message: string;
}>;

export type InternationalSchoolProductionAuditResult = Readonly<{
  executed: boolean;
  reason: "COMPLETED" | "CREDENTIALS_UNAVAILABLE" | "UNSAFE_CONNECTION";
  expectedIsiIds: readonly string[];
  counts: AuditCounts;
  blockers: readonly AuditBlocker[];
}>;

export type InternationalSchoolProductionAuditDependencies = Readonly<{
  loadPackage?: typeof loadInternationalSchoolPackage;
  runReadOnly?: typeof runWithProductionReadOnlyDatabase;
}>;

const EMPTY_COUNTS: AuditCounts = {
  existingIsiIdentities: 0,
  exactDraftMatches: 0,
  publicCollisions: 0,
  materialCollisions: 0,
  artifactOnlyDomainRows: 0,
};

function host(value: string | null): string | null {
  if (value === null) return null;
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function sortBlockers(blockers: readonly AuditBlocker[]): AuditBlocker[] {
  return [...blockers].sort(
    (left, right) =>
      left.code.localeCompare(right.code) || left.key.localeCompare(right.key),
  );
}

export async function runInternationalSchoolProductionAudit(
  packageDirectory: string,
  environment: Environment,
  dependencies: InternationalSchoolProductionAuditDependencies = {},
): Promise<InternationalSchoolProductionAuditResult> {
  const loadPackage =
    dependencies.loadPackage ?? loadInternationalSchoolPackage;
  const packageValue = await loadPackage(packageDirectory);
  const validation = validateInternationalSchoolPackage(packageValue);
  if (validation.status === "FAIL") {
    throw new Error("International-school package validation failed.");
  }
  const expectedIsiIds = packageValue.institutions
    .map((institution) => institution.registryExternalId)
    .sort((left, right) => Number(left.slice(5)) - Number(right.slice(5)));
  const productionDatabaseUrl = environment.PRODUCTION_DATABASE_URL?.trim();
  if (!productionDatabaseUrl) {
    return {
      executed: false,
      reason: "CREDENTIALS_UNAVAILABLE",
      expectedIsiIds,
      counts: EMPTY_COUNTS,
      blockers: [],
    };
  }

  const runReadOnly =
    dependencies.runReadOnly ?? runWithProductionReadOnlyDatabase;
  try {
    return await runReadOnly(productionDatabaseUrl, async ({ session }) => {
      const executor = session.createBackfillExecutor();
      const plan = await planInternationalSchoolImport(executor, packageValue);
      const expectedInstitutionIds = expectedIsiIds.map((registryExternalId) =>
        institutionIdForRegistryIdentity("ISI", registryExternalId),
      );
      const identityRows = (await executor.raw(sql`
        select registry_external_id as "registryExternalId"
        from institution_registry_identities
        where registry_name='ISI'
          and registry_external_id in (
            ${sql.join(
              expectedIsiIds.map((id) => sql`${id}`),
              sql`, `,
            )}
          )
        order by registry_external_id
      `)) as unknown as Array<{ registryExternalId: string }>;

      const artifactOnlyNames = [
        ...packageValue.specialAccess.map((item) => item.name),
        ...packageValue.candidates.flatMap((item) => [
          item.name,
          ...item.aliases,
        ]),
      ].map((name) => name.toLowerCase());
      const artifactOnlyHosts = [
        ...packageValue.specialAccess.map((item) => item.publicUrl),
        ...packageValue.candidates.map((item) => item.officialUrl),
      ]
        .map(host)
        .filter((value): value is string => value !== null);
      const uniqueNames = [...new Set(artifactOnlyNames)];
      const uniqueHosts = [...new Set(artifactOnlyHosts)];
      const artifactOnlyRows = (await executor.raw(sql`
        select distinct i.slug
        from institutions i
        where i.id not in (
          ${sql.join(
            expectedInstitutionIds.map((id) => sql`${id}`),
            sql`, `,
          )}
        )
          and (
            lower(i.display_name) in (
              ${sql.join(
                uniqueNames.map((name) => sql`${name}`),
                sql`, `,
              )}
            )
            or regexp_replace(
              lower(split_part(split_part(regexp_replace(coalesce(i.website_url, ''), '^https?://', '', 'i'), '/', 1), ':', 1)),
              '^www\\.', ''
            ) in (
              ${sql.join(
                uniqueHosts.map((hostname) => sql`${hostname}`),
                sql`, `,
              )}
            )
          )
        order by i.slug
      `)) as unknown as Array<{ slug: string }>;

      const institutionRejectKeys = new Set(
        plan.rejects.map((reject) => reject.key),
      );
      const exactDraftMatches = plan.actions.institutions.filter(
        (action) =>
          action.operation === "NONE" &&
          !institutionRejectKeys.has(action.registryExternalId),
      ).length;
      const publicCollisions = plan.rejects.filter(
        (reject) => reject.code === "PUBLICATION_STATE_COLLISION",
      ).length;
      const materialCollisions = plan.rejects.filter(
        (reject) => reject.code === "MATERIAL_FIELD_COLLISION",
      ).length;
      const artifactBlockers = artifactOnlyRows.map((row) => ({
        code: "ARTIFACT_ONLY_DOMAIN_ROW",
        key: row.slug,
        message:
          "후보 또는 제한 접근 기관과 일치하는 행이 프로덕션 기관 영역에 있어요.",
      }));

      return {
        executed: true,
        reason: "COMPLETED",
        expectedIsiIds,
        counts: {
          existingIsiIdentities: identityRows.length,
          exactDraftMatches,
          publicCollisions,
          materialCollisions,
          artifactOnlyDomainRows: artifactOnlyRows.length,
        },
        blockers: sortBlockers([...plan.rejects, ...artifactBlockers]),
      } as const;
    });
  } catch (error) {
    if (!(error instanceof UnsafeProductionConnectionError)) throw error;
    return {
      executed: false,
      reason: "UNSAFE_CONNECTION",
      expectedIsiIds,
      counts: EMPTY_COUNTS,
      blockers: [
        {
          code: "UNSAFE_CONNECTION",
          key: "PRODUCTION_DATABASE_URL",
          message: "프로덕션 연결이 읽기 전용임을 확인할 수 없어요.",
        },
      ],
    };
  }
}
