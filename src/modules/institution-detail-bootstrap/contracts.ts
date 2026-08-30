import "server-only";

import { loadAndValidateSeedPackage } from "@/src/modules/institution-seed/contract";
import { institutionIdForRegistryIdentity } from "@/src/modules/institution-seed/planner";

export const PRIVATE_ELEMENTARY_BOOTSTRAP_ACKNOWLEDGEMENT =
  "PREPPY-41-SCHOOL-2026-BOOTSTRAP" as const;

export const PRIVATE_ELEMENTARY_SEED_PATH =
  "data/seeds/preppy/preppy_seed_institutions_seoul_gyeonggi_v1.json" as const;

export type PrivateElementaryBootstrapTarget = Readonly<{
  institutionId: string | null;
  slug: string;
  institutionName: string;
  category: "PRIVATE_ELEMENTARY";
  regionCode: "KR-11" | "KR-41";
  address: string;
  gradeRange: string;
  offersElementary: boolean;
  province: string;
  cityDistrict: string;
  registryVerifiedAt: string;
  websiteUrl: string;
  registryName: "SCHOOLINFO";
  registryExternalId: string | null;
  registryUrl: string;
}>;

export type PrivateElementaryBootstrapCliOptions = Readonly<{
  mode: "dry-run" | "apply";
  slug: string | null;
  work: "both" | "facts" | "admissions";
  production: boolean;
  acknowledgement: string | null;
}>;

export type PrivateElementaryBootstrapErrorCode =
  | "ARTIFACT_REJECTED"
  | "INVOCATION_REJECTED"
  | "ENVIRONMENT_REJECTED"
  | "ALLOWLIST_REJECTED"
  | "SCHEMA_BLOCKED"
  | "INSTITUTION_CONFLICT"
  | "PERSISTENCE_FAILED"
  | "SIDE_EFFECT_DETECTED";

export class PrivateElementaryBootstrapError extends Error {
  constructor(
    readonly code: PrivateElementaryBootstrapErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PrivateElementaryBootstrapError";
  }
}

export async function loadPrivateElementaryBootstrapTargets(
  seedPath: string,
): Promise<
  Readonly<{
    targets: readonly PrivateElementaryBootstrapTarget[];
    seedSha256: string;
  }>
> {
  const validated = await loadAndValidateSeedPackage(seedPath);
  const targets = validated.package.institutions
    .filter((row) => row.institution_type === "PRIVATE_ELEMENTARY")
    .map((row): PrivateElementaryBootstrapTarget => {
      if (row.registry_name !== "SCHOOLINFO") {
        throw new PrivateElementaryBootstrapError(
          "ALLOWLIST_REJECTED",
          "Private elementary bootstrap requires SchoolInfo scope",
        );
      }
      return Object.freeze({
        institutionId:
          row.registry_record_id_status === "RESOLVED"
            ? institutionIdForRegistryIdentity(
                row.registry_name,
                row.registry_external_id,
              )
            : null,
        slug: row.slug,
        institutionName: row.canonical_name_ko,
        category: "PRIVATE_ELEMENTARY" as const,
        regionCode:
          row.province === "서울특별시"
            ? ("KR-11" as const)
            : ("KR-41" as const),
        address: row.address,
        gradeRange: row.grade_range_raw,
        offersElementary: row.offers_elementary,
        province: row.province,
        cityDistrict: row.city_district,
        registryVerifiedAt: row.verified_at,
        websiteUrl: row.official_website_url_normalized,
        registryName: row.registry_name,
        registryExternalId: row.registry_external_id || null,
        registryUrl: row.registry_record_url,
      });
    });
  if (
    targets.length !== 41 ||
    new Set(targets.map((row) => row.slug)).size !== 41
  ) {
    throw new PrivateElementaryBootstrapError(
      "ALLOWLIST_REJECTED",
      "Private elementary bootstrap requires the exact 41-school seed scope",
    );
  }
  return Object.freeze({
    targets: Object.freeze(targets),
    seedSha256: validated.checksums.seedSha256,
  });
}

const INVOCATION_MESSAGE = "Private elementary bootstrap invocation rejected";

function invocationError(): PrivateElementaryBootstrapError {
  return new PrivateElementaryBootstrapError(
    "INVOCATION_REJECTED",
    INVOCATION_MESSAGE,
  );
}

export function parsePrivateElementaryBootstrapCliArgs(
  arguments_: readonly string[],
): PrivateElementaryBootstrapCliOptions {
  let mode: "dry-run" | "apply" | null = null;
  let slug: string | null = null;
  let work: "both" | "facts" | "admissions" = "both";
  let production = false;
  let acknowledgement: string | null = null;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]!;
    if (argument === "--dry-run" || argument === "--apply") {
      const requested = argument === "--apply" ? "apply" : "dry-run";
      if (mode !== null) throw invocationError();
      mode = requested;
    } else if (argument === "--production") {
      if (production) throw invocationError();
      production = true;
    } else if (argument === "--facts-only") {
      if (work !== "both") throw invocationError();
      work = "facts";
    } else if (argument === "--admissions-only") {
      if (work !== "both") throw invocationError();
      work = "admissions";
    } else if (argument === "--slug") {
      const value = arguments_[index + 1];
      if (slug !== null || !value || value.startsWith("--")) {
        throw invocationError();
      }
      slug = value;
      index += 1;
    } else if (argument.startsWith("--slug=")) {
      if (slug !== null) throw invocationError();
      slug = argument.slice("--slug=".length);
      if (!slug) throw invocationError();
    } else if (argument.startsWith("--acknowledge-production-write=")) {
      if (acknowledgement !== null) throw invocationError();
      acknowledgement = argument.slice(
        "--acknowledge-production-write=".length,
      );
      if (!acknowledgement) throw invocationError();
    } else {
      throw invocationError();
    }
  }
  if (slug !== null && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug)) {
    throw invocationError();
  }
  return Object.freeze({
    mode: mode ?? "dry-run",
    slug,
    work,
    production,
    acknowledgement,
  });
}

export function assertPrivateElementaryBootstrapEnvironment(
  options: PrivateElementaryBootstrapCliOptions,
  environment: Readonly<Record<string, string | undefined>>,
): void {
  const databaseUrl = environment.DATABASE_URL?.trim();
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl ?? "");
  } catch {
    throw new PrivateElementaryBootstrapError(
      "ENVIRONMENT_REJECTED",
      "Private elementary bootstrap requires a valid PostgreSQL DATABASE_URL",
    );
  }
  if (!new Set(["postgres:", "postgresql:"]).has(parsed.protocol)) {
    throw new PrivateElementaryBootstrapError(
      "ENVIRONMENT_REJECTED",
      "Private elementary bootstrap requires PostgreSQL",
    );
  }
  if (
    options.mode === "apply" &&
    (environment.NODE_ENV !== "production" ||
      !options.production ||
      options.acknowledgement !== PRIVATE_ELEMENTARY_BOOTSTRAP_ACKNOWLEDGEMENT)
  ) {
    throw new PrivateElementaryBootstrapError(
      "ENVIRONMENT_REJECTED",
      "Production apply requires the explicit runtime, target, and acknowledgement guard",
    );
  }
}
