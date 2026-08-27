import { createHash } from "node:crypto";

import type {
  SeedInstitution,
  SeedSource,
  ValidatedSeedPackage,
} from "@/src/modules/institution-seed/contract";
import {
  canonicalDomain,
  mapSeedInstitution,
} from "@/src/modules/institution-seed/contract";

const PREPPY_SEED_NAMESPACE = "9c930974-2c56-5d2d-8833-11e4df9bc18e";

export type SeedInstitutionRow = ReturnType<typeof mapSeedInstitution> & {
  id: string;
};

export type SeedRegistryMetadata = SeedInstitution & {
  seed_dataset: {
    name: string;
    version: string;
    verified_at: string;
    sha256: string;
  };
  seed_sources: SeedSource[];
};

export type SeedRegistryIdentityRow = {
  id: string;
  institutionId: string;
  registryName: "SCHOOLINFO" | "ISI";
  registryExternalId: string;
  registryRecordUrl: string;
  registryLocator: string;
  metadataJson: SeedRegistryMetadata;
};

export type SeedSourceRow = {
  id: string;
  canonicalUrl: string;
  sourceType: "OFFICIAL_REGISTRY" | "OFFICIAL_SCHOOL_PAGE";
  authorityLevel: "PRIMARY";
  lifecycleStatus: "ACTIVE";
  sourceName: string;
  requiresJs: false;
  contentTypeHint: "text/html";
};

export type SeedBindingRow = {
  institutionId: string;
  sourceId: string;
  role: "REGISTRY_IDENTITY" | "OFFICIAL_MAIN";
  isPrimary: boolean;
  isActive: true;
};

export type SeedInventoryInstitutionRow = {
  id: string;
  slug: string;
  displayName: string;
  category: string;
  internationalSubtype: string | null;
  operationalState: string;
  publicationState: string;
  regionCode: string | null;
  city: string | null;
  district: string | null;
  addressLine: string | null;
  websiteUrl: string | null;
};

export type SeedInventoryRegistryIdentityRow = Omit<
  SeedRegistryIdentityRow,
  "metadataJson"
> & {
  metadataJson: Record<string, unknown>;
};

export type SeedInventorySourceRow = {
  id: string;
  canonicalUrl: string;
  sourceType: string;
  authorityLevel: string;
  lifecycleStatus: string;
  sourceName: string;
  requiresJs: boolean;
  contentTypeHint: string | null;
};

export type SeedInventoryBindingRow = {
  institutionId: string;
  sourceId: string;
  role: string;
  isPrimary: boolean;
  isActive: boolean;
};

export type SeedImportInventory = {
  institutions: SeedInventoryInstitutionRow[];
  registryIdentities: SeedInventoryRegistryIdentityRow[];
  sources: SeedInventorySourceRow[];
  bindings: SeedInventoryBindingRow[];
};

export type SeedPlanCode =
  | "CREATED"
  | "UPDATED_NON_MATERIAL"
  | "UNCHANGED"
  | "SKIPPED_PENDING_ID"
  | "CONFLICT_EXISTING_IDENTITY"
  | "CONFLICT_SLUG"
  | "CONFLICT_DOMAIN"
  | "INVALID_ROW"
  | "SOURCE_CREATED"
  | "SOURCE_REUSED"
  | "BINDING_CREATED"
  | "BINDING_REUSED";

export type InstitutionPlanAction = {
  seedId: string;
  institutionId: string;
  code: "CREATED" | "UPDATED_NON_MATERIAL" | "UNCHANGED";
  institutionOperation: "CREATE" | "NONE";
  registryOperation: "CREATE" | "UPDATE" | "NONE";
  desiredInstitution: SeedInstitutionRow;
  desiredRegistryIdentity: SeedRegistryIdentityRow;
};

export type SourcePlanAction = {
  seedId: string;
  sourceSeedId: string;
  sourceId: string;
  code: "SOURCE_CREATED" | "SOURCE_REUSED";
  operation: "CREATE" | "NONE";
  desiredSource: SeedSourceRow;
};

export type BindingPlanAction = {
  seedId: string;
  sourceSeedId: string;
  institutionId: string;
  sourceId: string;
  code: "BINDING_CREATED" | "BINDING_REUSED";
  operation: "UPSERT" | "NONE";
  desiredBinding: SeedBindingRow;
};

export type SeedPlanIssue = {
  code:
    | "CONFLICT_EXISTING_IDENTITY"
    | "CONFLICT_SLUG"
    | "CONFLICT_DOMAIN"
    | "INVALID_ROW";
  seedId: string;
  message: string;
  institutionId?: string;
  sourceSeedId?: string;
};

export type SeedImportPlan = {
  applyAllowed: boolean;
  checksum: string;
  dataset: {
    name: string;
    version: string;
    total: number;
    resolved: number;
    pending: number;
    sources: number;
  };
  institutionActions: InstitutionPlanAction[];
  sourceActions: SourcePlanAction[];
  bindingActions: BindingPlanAction[];
  pending: Array<{
    seedId: string;
    name: string;
    code: "SKIPPED_PENDING_ID";
  }>;
  conflicts: SeedPlanIssue[];
  invalidRows: SeedPlanIssue[];
  counts: Record<string, number>;
};

export function emptySeedImportInventory(): SeedImportInventory {
  return {
    institutions: [],
    registryIdentities: [],
    sources: [],
    bindings: [],
  };
}

function deterministicUuid(name: string): string {
  const hash = createHash("sha1")
    .update(
      Buffer.concat([
        Buffer.from(PREPPY_SEED_NAMESPACE.replaceAll("-", ""), "hex"),
        Buffer.from(name),
      ]),
    )
    .digest()
    .subarray(0, 16);
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const value = hash.toString("hex");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export function institutionIdForRegistryIdentity(
  registryName: string,
  registryExternalId: string,
): string {
  return deterministicUuid(
    `preppy:registry:${registryName}:${registryExternalId}`,
  );
}

function registryIdentityId(
  registryName: string,
  registryExternalId: string,
): string {
  return deterministicUuid(
    `preppy:registry-identity:${registryName}:${registryExternalId}`,
  );
}

function sourceIdForUrl(canonicalUrl: string): string {
  return deterministicUuid(`preppy:source:${canonicalUrl}`);
}

function registryKey(registryName: string, registryExternalId: string): string {
  return `${registryName}\u0000${registryExternalId}`;
}

function bindingKey(binding: {
  institutionId: string;
  sourceId: string;
  role: string;
}): string {
  return `${binding.institutionId}\u0000${binding.sourceId}\u0000${binding.role}`;
}

function increment(counts: Record<string, number>, code: SeedPlanCode): void {
  counts[code] = (counts[code] ?? 0) + 1;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function materialInstitutionMatches(
  existing: SeedInventoryInstitutionRow,
  desired: SeedInstitutionRow,
): boolean {
  return (
    existing.slug === desired.slug &&
    existing.displayName === desired.displayName &&
    existing.category === desired.category &&
    existing.internationalSubtype === desired.internationalSubtype &&
    existing.operationalState === desired.operationalState &&
    existing.regionCode === desired.regionCode &&
    existing.district === desired.district &&
    existing.addressLine === desired.addressLine &&
    existing.websiteUrl === desired.websiteUrl
  );
}

function sameWebsiteDomain(
  existing: SeedInventoryInstitutionRow,
  desired: SeedInstitutionRow,
): boolean {
  if (!existing.websiteUrl) return false;
  try {
    return (
      canonicalDomain(existing.websiteUrl) ===
      canonicalDomain(desired.websiteUrl)
    );
  } catch {
    return false;
  }
}

function registryMetadata(
  validated: ValidatedSeedPackage,
  institution: SeedInstitution,
  seedSources: SeedSource[],
): SeedRegistryMetadata {
  return {
    ...institution,
    seed_dataset: {
      name: validated.package.metadata.dataset_name,
      version: validated.package.metadata.version,
      verified_at: validated.package.metadata.verified_at,
      sha256: validated.checksums.seedSha256,
    },
    seed_sources: structuredClone(seedSources),
  };
}

function desiredSourceFor(
  institution: SeedInstitution,
  source: SeedSource,
  id: string,
): SeedSourceRow {
  const registry = source.source_role === "REGISTRY_IDENTITY";
  return {
    id,
    canonicalUrl: source.source_url,
    sourceType: registry ? "OFFICIAL_REGISTRY" : "OFFICIAL_SCHOOL_PAGE",
    authorityLevel: "PRIMARY",
    lifecycleStatus: "ACTIVE",
    sourceName: registry
      ? `${institution.canonical_name_ko} Official Registry`
      : `${institution.canonical_name_ko} Official Website`,
    requiresJs: false,
    contentTypeHint: "text/html",
  };
}

function compatibleSource(
  existing: SeedInventorySourceRow,
  desired: SeedSourceRow,
): boolean {
  return (
    existing.sourceType === desired.sourceType &&
    existing.authorityLevel === desired.authorityLevel &&
    existing.lifecycleStatus === desired.lifecycleStatus
  );
}

export function planInstitutionSeedImport(
  validated: ValidatedSeedPackage,
  inventory: SeedImportInventory,
): SeedImportPlan {
  const counts: Record<string, number> = {};
  const conflicts: SeedPlanIssue[] = [];
  const invalidRows: SeedPlanIssue[] = [];
  const pending: SeedImportPlan["pending"] = [];
  const institutionActions: InstitutionPlanAction[] = [];
  const sourceActions: SourcePlanAction[] = [];
  const bindingActions: BindingPlanAction[] = [];

  const institutionById = new Map(
    inventory.institutions.map((row) => [row.id, row]),
  );
  const institutionsBySlug = new Map<string, SeedInventoryInstitutionRow[]>();
  for (const row of inventory.institutions) {
    const rows = institutionsBySlug.get(row.slug) ?? [];
    rows.push(row);
    institutionsBySlug.set(row.slug, rows);
  }
  const identitiesByKey = new Map<string, SeedInventoryRegistryIdentityRow[]>();
  for (const row of inventory.registryIdentities) {
    const key = registryKey(row.registryName, row.registryExternalId);
    const rows = identitiesByKey.get(key) ?? [];
    rows.push(row);
    identitiesByKey.set(key, rows);
  }
  const sourcesByUrl = new Map<string, SeedInventorySourceRow[]>();
  for (const row of inventory.sources) {
    const rows = sourcesByUrl.get(row.canonicalUrl) ?? [];
    rows.push(row);
    sourcesByUrl.set(row.canonicalUrl, rows);
  }
  const bindingsByKey = new Map<string, SeedInventoryBindingRow[]>();
  for (const row of inventory.bindings) {
    const key = bindingKey(row);
    const rows = bindingsByKey.get(key) ?? [];
    rows.push(row);
    bindingsByKey.set(key, rows);
  }
  const seedSourcesBySeedId = new Map<string, SeedSource[]>();
  for (const row of validated.package.sources) {
    const rows = seedSourcesBySeedId.get(row.seed_id) ?? [];
    rows.push(row);
    seedSourcesBySeedId.set(row.seed_id, rows);
  }

  for (const seed of validated.package.institutions) {
    if (seed.registry_record_id_status === "PENDING") {
      pending.push({
        seedId: seed.seed_id,
        name: seed.canonical_name_ko,
        code: "SKIPPED_PENDING_ID",
      });
      increment(counts, "SKIPPED_PENDING_ID");
      continue;
    }

    const desiredCore = mapSeedInstitution(seed);
    const deterministicInstitutionId = institutionIdForRegistryIdentity(
      seed.registry_name,
      seed.registry_external_id,
    );
    const identityRows =
      identitiesByKey.get(
        registryKey(seed.registry_name, seed.registry_external_id),
      ) ?? [];
    let existingInstitution: SeedInventoryInstitutionRow | undefined;
    let existingIdentity: SeedInventoryRegistryIdentityRow | undefined;

    if (identityRows.length > 1) {
      conflicts.push({
        code: "CONFLICT_EXISTING_IDENTITY",
        seedId: seed.seed_id,
        message: "Repository contains duplicate registry identities.",
      });
      increment(counts, "CONFLICT_EXISTING_IDENTITY");
      continue;
    }
    existingIdentity = identityRows[0];
    if (existingIdentity) {
      existingInstitution = institutionById.get(existingIdentity.institutionId);
      if (!existingInstitution) {
        conflicts.push({
          code: "CONFLICT_EXISTING_IDENTITY",
          seedId: seed.seed_id,
          institutionId: existingIdentity.institutionId,
          message: "Registry identity references a missing Institution.",
        });
        increment(counts, "CONFLICT_EXISTING_IDENTITY");
        continue;
      }
      const desired = { ...desiredCore, id: existingInstitution.id };
      if (!sameWebsiteDomain(existingInstitution, desired)) {
        conflicts.push({
          code: "CONFLICT_DOMAIN",
          seedId: seed.seed_id,
          institutionId: existingInstitution.id,
          message: "Existing registry Institution website host differs.",
        });
        increment(counts, "CONFLICT_DOMAIN");
        continue;
      }
      if (!materialInstitutionMatches(existingInstitution, desired)) {
        conflicts.push({
          code: "CONFLICT_EXISTING_IDENTITY",
          seedId: seed.seed_id,
          institutionId: existingInstitution.id,
          message: "Existing registry Institution has material differences.",
        });
        increment(counts, "CONFLICT_EXISTING_IDENTITY");
        continue;
      }
    } else {
      const slugRows = institutionsBySlug.get(seed.slug) ?? [];
      if (slugRows.length > 1) {
        conflicts.push({
          code: "CONFLICT_SLUG",
          seedId: seed.seed_id,
          message: "Multiple Institutions occupy the seed slug.",
        });
        increment(counts, "CONFLICT_SLUG");
        continue;
      }
      existingInstitution = slugRows[0];
      if (existingInstitution) {
        const desired = { ...desiredCore, id: existingInstitution.id };
        if (!sameWebsiteDomain(existingInstitution, desired)) {
          conflicts.push({
            code: "CONFLICT_DOMAIN",
            seedId: seed.seed_id,
            institutionId: existingInstitution.id,
            message: "Slug-selected Institution website host differs.",
          });
          increment(counts, "CONFLICT_DOMAIN");
          continue;
        }
        if (!materialInstitutionMatches(existingInstitution, desired)) {
          conflicts.push({
            code: "CONFLICT_SLUG",
            seedId: seed.seed_id,
            institutionId: existingInstitution.id,
            message: "Slug is occupied by a materially different Institution.",
          });
          increment(counts, "CONFLICT_SLUG");
          continue;
        }
      } else {
        const occupiedId = institutionById.get(deterministicInstitutionId);
        if (occupiedId) {
          conflicts.push({
            code: "CONFLICT_EXISTING_IDENTITY",
            seedId: seed.seed_id,
            institutionId: occupiedId.id,
            message: "Deterministic Institution ID is already occupied.",
          });
          increment(counts, "CONFLICT_EXISTING_IDENTITY");
          continue;
        }
      }
    }

    const institutionId = existingInstitution?.id ?? deterministicInstitutionId;
    const desiredInstitution: SeedInstitutionRow = {
      ...desiredCore,
      id: institutionId,
    };
    const seedSources = seedSourcesBySeedId.get(seed.seed_id) ?? [];
    if (seedSources.length !== 2) {
      invalidRows.push({
        code: "INVALID_ROW",
        seedId: seed.seed_id,
        message: "Resolved Institution does not have exactly two Sources.",
      });
      increment(counts, "INVALID_ROW");
      continue;
    }
    const desiredMetadata = registryMetadata(validated, seed, seedSources);
    const desiredRegistryIdentity: SeedRegistryIdentityRow = {
      id:
        existingIdentity?.id ??
        registryIdentityId(seed.registry_name, seed.registry_external_id),
      institutionId,
      registryName: seed.registry_name,
      registryExternalId: seed.registry_external_id,
      registryRecordUrl: seed.registry_record_url,
      registryLocator: seed.registry_locator,
      metadataJson: desiredMetadata,
    };
    const registryOperation = !existingIdentity
      ? "CREATE"
      : existingIdentity.registryRecordUrl !== seed.registry_record_url ||
          existingIdentity.registryLocator !== seed.registry_locator ||
          stableJson(existingIdentity.metadataJson) !==
            stableJson(desiredMetadata)
        ? "UPDATE"
        : "NONE";
    const institutionAction: InstitutionPlanAction = {
      seedId: seed.seed_id,
      institutionId,
      code: existingInstitution ? "UNCHANGED" : "CREATED",
      institutionOperation: existingInstitution ? "NONE" : "CREATE",
      registryOperation,
      desiredInstitution,
      desiredRegistryIdentity,
    };
    institutionActions.push(institutionAction);

    let graphChanged = registryOperation !== "NONE";
    for (const source of seedSources) {
      const existingSources = sourcesByUrl.get(source.source_url) ?? [];
      if (existingSources.length > 1) {
        conflicts.push({
          code: "CONFLICT_EXISTING_IDENTITY",
          seedId: seed.seed_id,
          sourceSeedId: source.source_id,
          message: "Repository contains duplicate canonical Source URLs.",
        });
        increment(counts, "CONFLICT_EXISTING_IDENTITY");
        continue;
      }
      const existingSource = existingSources[0];
      const sourceId = existingSource?.id ?? sourceIdForUrl(source.source_url);
      const desiredSource = desiredSourceFor(seed, source, sourceId);
      if (existingSource && !compatibleSource(existingSource, desiredSource)) {
        conflicts.push({
          code: "CONFLICT_EXISTING_IDENTITY",
          seedId: seed.seed_id,
          sourceSeedId: source.source_id,
          message: "Existing canonical Source has incompatible semantics.",
        });
        increment(counts, "CONFLICT_EXISTING_IDENTITY");
        continue;
      }
      const sourceCode = existingSource ? "SOURCE_REUSED" : "SOURCE_CREATED";
      sourceActions.push({
        seedId: seed.seed_id,
        sourceSeedId: source.source_id,
        sourceId,
        code: sourceCode,
        operation: existingSource ? "NONE" : "CREATE",
        desiredSource,
      });
      increment(counts, sourceCode);
      if (!existingSource) graphChanged = true;

      const role =
        source.source_role === "REGISTRY_IDENTITY"
          ? "REGISTRY_IDENTITY"
          : "OFFICIAL_MAIN";
      const desiredBinding: SeedBindingRow = {
        institutionId,
        sourceId,
        role,
        isPrimary: role === "OFFICIAL_MAIN",
        isActive: true,
      };
      const activeOtherPrimary = inventory.bindings.find(
        (binding) =>
          binding.institutionId === institutionId &&
          binding.role === "OFFICIAL_MAIN" &&
          binding.isPrimary &&
          binding.isActive &&
          binding.sourceId !== sourceId,
      );
      if (desiredBinding.isPrimary && activeOtherPrimary) {
        conflicts.push({
          code: "CONFLICT_EXISTING_IDENTITY",
          seedId: seed.seed_id,
          institutionId,
          sourceSeedId: source.source_id,
          message:
            "Institution already has another active primary website Source.",
        });
        increment(counts, "CONFLICT_EXISTING_IDENTITY");
        continue;
      }
      const existingBindings =
        bindingsByKey.get(bindingKey(desiredBinding)) ?? [];
      if (existingBindings.length > 1) {
        conflicts.push({
          code: "CONFLICT_EXISTING_IDENTITY",
          seedId: seed.seed_id,
          institutionId,
          sourceSeedId: source.source_id,
          message: "Repository contains duplicate canonical bindings.",
        });
        increment(counts, "CONFLICT_EXISTING_IDENTITY");
        continue;
      }
      const existingBinding = existingBindings[0];
      const bindingReused =
        existingBinding?.isActive === true &&
        existingBinding.isPrimary === desiredBinding.isPrimary;
      const bindingCode = bindingReused ? "BINDING_REUSED" : "BINDING_CREATED";
      bindingActions.push({
        seedId: seed.seed_id,
        sourceSeedId: source.source_id,
        institutionId,
        sourceId,
        code: bindingCode,
        operation: bindingReused ? "NONE" : "UPSERT",
        desiredBinding,
      });
      increment(counts, bindingCode);
      if (!bindingReused) graphChanged = true;
    }

    if (existingInstitution && graphChanged) {
      institutionAction.code = "UPDATED_NON_MATERIAL";
    }
    increment(counts, institutionAction.code);
  }

  return {
    applyAllowed: conflicts.length === 0 && invalidRows.length === 0,
    checksum: validated.checksums.seedSha256,
    dataset: {
      name: validated.package.metadata.dataset_name,
      version: validated.package.metadata.version,
      total: validated.counts.institutions,
      resolved: validated.counts.safelyResolvedInstitutions,
      pending: validated.counts.pendingSchoolInfoIds,
      sources: validated.counts.sources,
    },
    institutionActions,
    sourceActions,
    bindingActions,
    pending,
    conflicts,
    invalidRows,
    counts,
  };
}
