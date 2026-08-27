import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { z } from "zod";

const EXPECTED_COUNTS = {
  institutions: 63,
  privateElementary: 41,
  internationalSchool: 22,
  seoul: 54,
  gyeonggi: 9,
  sources: 126,
  excluded: 3,
  pendingSchoolInfoIds: 6,
} as const;

function usesHttpProtocol(value: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

const httpUrl = z.url().refine(usesHttpProtocol, {
  message: "must use http or https",
});

const institutionSchema = z.object({
  seed_id: z.string().min(1),
  canonical_name_ko: z.string().min(1),
  canonical_name_en: z.string(),
  institution_group_key: z.string(),
  campus_name: z.string(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  slug_status: z.literal("PROVISIONAL"),
  institution_type: z.enum(["PRIVATE_ELEMENTARY", "INTERNATIONAL_SCHOOL"]),
  legal_category: z.enum(["PRIVATE_ELEMENTARY_SCHOOL", "FOREIGN_SCHOOL"]),
  province: z.enum(["서울특별시", "경기도"]),
  city_district: z.string().min(1),
  address: z.string().min(1),
  grade_range_raw: z.string().min(1),
  offers_kindergarten: z.boolean(),
  offers_elementary: z.boolean(),
  offers_middle: z.boolean(),
  offers_high: z.boolean(),
  teaching_language_raw: z.string(),
  teaching_language_normalized: z.string(),
  official_website_url_raw: z.string().min(1),
  official_website_url_normalized: z
    .url({ error: "Official website URL is required and must be valid" })
    .refine(usesHttpProtocol, {
      message: "Official website URL must use http or https",
    }),
  canonical_domain: z.string().min(1),
  registry_name: z.enum(["SCHOOLINFO", "ISI"]),
  registry_external_id: z.string(),
  registry_record_id_status: z.enum(["RESOLVED", "PENDING"]),
  registry_record_url: httpUrl,
  registry_locator: z.string().min(1),
  operating_status: z.literal("ACTIVE"),
  identity_verification_status: z.enum([
    "VERIFIED_OFFICIAL_REGISTRY",
    "VERIFIED_REGISTRY_LIST_RECORD_ID_PENDING",
  ]),
  verified_at: z.iso.date(),
  url_http_status: z.literal("NOT_CHECKED"),
  url_last_checked_at: z.string(),
  crawl_status: z.literal("NOT_STARTED"),
  source_binding_status: z.literal("SEEDED"),
  publication_status: z.literal("INTERNAL_ONLY"),
  monitoring_priority: z.enum(["P0", "P1"]),
  monitoring_cadence: z.enum(["WEEKLY", "SEASONAL_WEEKLY"]),
  notes: z.string(),
});

const sourceSchema = z.object({
  source_id: z.string().min(1),
  seed_id: z.string().min(1),
  source_type: z.enum(["OFFICIAL_REGISTRY", "OFFICIAL_WEBSITE"]),
  source_role: z.enum(["REGISTRY_IDENTITY", "OFFICIAL_WEBSITE_ROOT"]),
  source_url: httpUrl,
  canonical_domain: z.string().min(1),
  official_status: z.enum(["OFFICIAL", "OFFICIAL_CANDIDATE_FROM_REGISTRY"]),
  binding_status: z.literal("SEEDED"),
  monitoring_cadence: z.enum(["MONTHLY", "WEEKLY", "SEASONAL_WEEKLY"]),
  fetch_status: z.enum(["NOT_CHECKED", "NOT_CHECKED_BY_IMPORTER"]),
  last_verified_at: z.iso.date(),
  notes: z.string(),
});

const excludedSchema = z.object({
  registry: z.enum(["SCHOOLINFO", "ISI"]),
  registry_external_id: z.string().min(1),
  canonical_name_ko: z.string().min(1),
  canonical_name_en: z.string(),
  province: z.string().min(1),
  city_district: z.string().min(1),
  address: z.string().min(1),
  grade_range_raw: z.string().min(1),
  official_website_url: httpUrl,
  registry_record_url: httpUrl,
  exclusion_reason: z.enum(["KINDERGARTEN_ONLY", "NO_ELEMENTARY_COURSE"]),
  verified_at: z.iso.date(),
});

const metadataSchema = z.object({
  dataset_name: z.string().min(1),
  version: z.string().min(1),
  verified_at: z.iso.date(),
  scope: z.array(z.string().min(1)).min(1),
  counts: z.object({
    institutions_total: z.number().int().nonnegative(),
    private_elementary: z.number().int().nonnegative(),
    international_school: z.number().int().nonnegative(),
    seoul: z.number().int().nonnegative(),
    gyeonggi: z.number().int().nonnegative(),
    sources: z.number().int().nonnegative(),
    excluded: z.number().int().nonnegative(),
    schoolinfo_record_ids_pending: z.number().int().nonnegative(),
  }),
  source_roots: z.record(z.string(), httpUrl),
  policy: z.record(z.string(), z.string()),
});

const seedPackageSchema = z.object({
  metadata: metadataSchema,
  institutions: z.array(institutionSchema),
  sources: z.array(sourceSchema),
  excluded: z.array(excludedSchema),
});

export type SeedInstitution = z.infer<typeof institutionSchema>;
export type SeedSource = z.infer<typeof sourceSchema>;
export type SeedPackage = z.infer<typeof seedPackageSchema>;

export type SeedDatasetCounts = Readonly<{
  institutions: number;
  privateElementary: number;
  internationalSchool: number;
  seoul: number;
  gyeonggi: number;
  sources: number;
  excluded: number;
  pendingSchoolInfoIds: number;
  safelyResolvedInstitutions: number;
}>;

export type ChecksumVerification = Readonly<{
  manifestPath: string;
  seedSha256: string;
  verifiedFiles: readonly string[];
}>;

export type ValidatedSeedPackage = Readonly<{
  package: SeedPackage;
  counts: SeedDatasetCounts;
  checksums: ChecksumVerification;
}>;

export class SeedPackageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedPackageValidationError";
  }
}

export function canonicalDomain(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SeedPackageValidationError(
      "Canonical URL must use http or https.",
    );
  }
  return url.host.toLowerCase().replace(/^www\./, "");
}

function actualCounts(seedPackage: SeedPackage): SeedDatasetCounts {
  const privateElementary = seedPackage.institutions.filter(
    (row) => row.institution_type === "PRIVATE_ELEMENTARY",
  ).length;
  const internationalSchool = seedPackage.institutions.filter(
    (row) => row.institution_type === "INTERNATIONAL_SCHOOL",
  ).length;
  const seoul = seedPackage.institutions.filter(
    (row) => row.province === "서울특별시",
  ).length;
  const gyeonggi = seedPackage.institutions.filter(
    (row) => row.province === "경기도",
  ).length;
  const pendingSchoolInfoIds = seedPackage.institutions.filter(
    (row) => row.registry_record_id_status === "PENDING",
  ).length;

  return {
    institutions: seedPackage.institutions.length,
    privateElementary,
    internationalSchool,
    seoul,
    gyeonggi,
    sources: seedPackage.sources.length,
    excluded: seedPackage.excluded.length,
    pendingSchoolInfoIds,
    safelyResolvedInstitutions:
      seedPackage.institutions.length - pendingSchoolInfoIds,
  };
}

function assertCount(label: string, expected: number, actual: number): void {
  if (actual !== expected) {
    throw new SeedPackageValidationError(
      `${label}: expected ${expected} / actual ${actual}`,
    );
  }
}

function assertUnique(label: string, values: readonly string[]): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new SeedPackageValidationError(`Duplicate ${label}: ${value}`);
    }
    seen.add(value);
  }
}

function assertSemanticRules(seedPackage: SeedPackage): SeedDatasetCounts {
  const counts = actualCounts(seedPackage);
  const metadataCounts = seedPackage.metadata.counts;

  assertCount(
    "Institutions",
    EXPECTED_COUNTS.institutions,
    metadataCounts.institutions_total,
  );
  assertCount(
    "Private elementary",
    EXPECTED_COUNTS.privateElementary,
    metadataCounts.private_elementary,
  );
  assertCount(
    "International school",
    EXPECTED_COUNTS.internationalSchool,
    metadataCounts.international_school,
  );
  assertCount("Seoul", EXPECTED_COUNTS.seoul, metadataCounts.seoul);
  assertCount("Gyeonggi", EXPECTED_COUNTS.gyeonggi, metadataCounts.gyeonggi);
  assertCount("Sources", EXPECTED_COUNTS.sources, metadataCounts.sources);
  assertCount("Excluded", EXPECTED_COUNTS.excluded, metadataCounts.excluded);
  assertCount(
    "Pending SchoolInfo IDs",
    EXPECTED_COUNTS.pendingSchoolInfoIds,
    metadataCounts.schoolinfo_record_ids_pending,
  );

  for (const [label, expected, actual] of [
    ["Institutions", EXPECTED_COUNTS.institutions, counts.institutions],
    [
      "Private elementary",
      EXPECTED_COUNTS.privateElementary,
      counts.privateElementary,
    ],
    [
      "International school",
      EXPECTED_COUNTS.internationalSchool,
      counts.internationalSchool,
    ],
    ["Seoul", EXPECTED_COUNTS.seoul, counts.seoul],
    ["Gyeonggi", EXPECTED_COUNTS.gyeonggi, counts.gyeonggi],
    ["Sources", EXPECTED_COUNTS.sources, counts.sources],
    ["Excluded", EXPECTED_COUNTS.excluded, counts.excluded],
    [
      "Pending SchoolInfo IDs",
      EXPECTED_COUNTS.pendingSchoolInfoIds,
      counts.pendingSchoolInfoIds,
    ],
  ] as const) {
    assertCount(label, expected, actual);
  }

  assertUnique(
    "seed_id",
    seedPackage.institutions.map((row) => row.seed_id),
  );
  assertUnique(
    "slug",
    seedPackage.institutions.map((row) => row.slug),
  );
  assertUnique(
    "source_id",
    seedPackage.sources.map((row) => row.source_id),
  );

  const institutionsBySeedId = new Map(
    seedPackage.institutions.map((row) => [row.seed_id, row]),
  );
  const sourcesBySeedId = new Map<string, SeedSource[]>();

  for (const row of seedPackage.institutions) {
    if (!row.official_website_url_raw.trim()) {
      throw new SeedPackageValidationError(
        `Official website raw URL is empty for ${row.seed_id}.`,
      );
    }
    if (
      canonicalDomain(row.official_website_url_normalized) !==
      row.canonical_domain
    ) {
      throw new SeedPackageValidationError(
        `canonical_domain differs from normalized official website for ${row.seed_id}.`,
      );
    }
    if (row.offers_elementary !== true) {
      throw new SeedPackageValidationError(
        `offers_elementary must be true for ${row.seed_id}.`,
      );
    }
    if (row.registry_record_id_status === "RESOLVED") {
      if (!row.registry_external_id.trim()) {
        throw new SeedPackageValidationError(
          `Resolved row lacks registry_external_id for ${row.seed_id}.`,
        );
      }
      if (row.identity_verification_status !== "VERIFIED_OFFICIAL_REGISTRY") {
        throw new SeedPackageValidationError(
          `Resolved identity verification status is invalid for ${row.seed_id}.`,
        );
      }
    } else {
      if (row.registry_external_id.trim()) {
        throw new SeedPackageValidationError(
          `Pending row must keep registry_external_id empty for ${row.seed_id}.`,
        );
      }
      if (row.registry_name !== "SCHOOLINFO") {
        throw new SeedPackageValidationError(
          `Pending identity must be SCHOOLINFO for ${row.seed_id}.`,
        );
      }
    }
  }

  for (const source of seedPackage.sources) {
    if (!institutionsBySeedId.has(source.seed_id)) {
      throw new SeedPackageValidationError(
        `Source ${source.source_id} references an unknown seed_id.`,
      );
    }
    if (canonicalDomain(source.source_url) !== source.canonical_domain) {
      throw new SeedPackageValidationError(
        `Source canonical_domain differs for ${source.source_id}.`,
      );
    }
    const sources = sourcesBySeedId.get(source.seed_id) ?? [];
    sources.push(source);
    sourcesBySeedId.set(source.seed_id, sources);
  }

  for (const institution of seedPackage.institutions) {
    const sources = sourcesBySeedId.get(institution.seed_id) ?? [];
    const roles = sources.map((source) => source.source_role).sort();
    if (
      sources.length !== 2 ||
      roles[0] !== "OFFICIAL_WEBSITE_ROOT" ||
      roles[1] !== "REGISTRY_IDENTITY"
    ) {
      throw new SeedPackageValidationError(
        `Exactly two canonical Source roles are required for ${institution.seed_id}.`,
      );
    }
    const websiteSource = sources.find(
      (source) => source.source_role === "OFFICIAL_WEBSITE_ROOT",
    )!;
    const registrySource = sources.find(
      (source) => source.source_role === "REGISTRY_IDENTITY",
    )!;
    if (
      websiteSource.source_url !==
        institution.official_website_url_normalized ||
      registrySource.source_url !== institution.registry_record_url
    ) {
      throw new SeedPackageValidationError(
        `Source URLs do not bind to the same Institution for ${institution.seed_id}.`,
      );
    }
  }

  return counts;
}

export function validateSeedPackage(value: unknown): {
  package: SeedPackage;
  counts: SeedDatasetCounts;
} {
  const parsed = seedPackageSchema.safeParse(value);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map(
        (issue) =>
          `${issue.path.join(" ").replaceAll("_", " ")}: ${issue.message}`,
      )
      .join("; ");
    throw new SeedPackageValidationError(
      `Seed package schema validation failed: ${detail}`,
    );
  }
  return { package: parsed.data, counts: assertSemanticRules(parsed.data) };
}

type ManifestEntry = Readonly<{ filename: string; expectedHash: string }>;

function parseChecksumManifest(value: string): ManifestEntry[] {
  const entries = value
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => {
      const match = /^([a-f0-9]{64})\s+(.+)$/.exec(line.trim());
      if (!match) {
        throw new SeedPackageValidationError(
          `Invalid SHA256SUMS entry: ${line}`,
        );
      }
      return { expectedHash: match[1], filename: match[2] };
    });

  for (const required of [
    "preppy_seed_institutions_seoul_gyeonggi_v1.json",
    "PREPPY_SEED_DATASET_README.md",
  ]) {
    if (!entries.some((entry) => entry.filename === required)) {
      throw new SeedPackageValidationError(
        `SHA256SUMS is missing required artifact ${required}.`,
      );
    }
  }
  return entries;
}

async function sha256(filePath: string): Promise<string> {
  return createHash("sha256")
    .update(await readFile(filePath))
    .digest("hex");
}

async function verifyChecksums(
  seedFilePath: string,
): Promise<ChecksumVerification> {
  const directory = dirname(seedFilePath);
  const manifestPath = join(directory, "SHA256SUMS");
  try {
    await access(manifestPath);
  } catch {
    throw new SeedPackageValidationError(
      `SHA256SUMS was not found beside ${basename(seedFilePath)}.`,
    );
  }

  const entries = parseChecksumManifest(await readFile(manifestPath, "utf8"));
  const verifiedFiles: string[] = [];
  let seedSha256 = "";
  for (const entry of entries) {
    const filePath = join(directory, entry.filename);
    let actualHash: string;
    try {
      actualHash = await sha256(filePath);
    } catch {
      throw new SeedPackageValidationError(
        `Checksum artifact is missing: ${entry.filename}.`,
      );
    }
    if (actualHash !== entry.expectedHash) {
      throw new SeedPackageValidationError(
        `Checksum mismatch for ${entry.filename}.`,
      );
    }
    if (entry.filename === basename(seedFilePath)) seedSha256 = actualHash;
    verifiedFiles.push(entry.filename);
  }
  if (!seedSha256) {
    throw new SeedPackageValidationError(
      `SHA256SUMS does not describe requested seed file ${basename(seedFilePath)}.`,
    );
  }

  return {
    manifestPath,
    seedSha256,
    verifiedFiles: verifiedFiles.sort(),
  };
}

export async function loadAndValidateSeedPackage(
  seedFilePath: string,
): Promise<ValidatedSeedPackage> {
  const checksums = await verifyChecksums(seedFilePath);
  let value: unknown;
  try {
    value = JSON.parse(await readFile(seedFilePath, "utf8"));
  } catch (error) {
    throw new SeedPackageValidationError(
      `Seed JSON could not be parsed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
  return { ...validateSeedPackage(value), checksums };
}

export function mapSeedInstitution(row: SeedInstitution) {
  return {
    slug: row.slug,
    displayName: row.canonical_name_ko,
    category: row.institution_type,
    internationalSubtype:
      row.legal_category === "FOREIGN_SCHOOL"
        ? ("FOREIGN_SCHOOL" as const)
        : null,
    operationalState: row.operating_status,
    publicationState: "DRAFT" as const,
    regionCode: row.province,
    city: null,
    district: row.city_district,
    addressLine: row.address,
    websiteUrl: row.official_website_url_normalized,
  };
}
