import "server-only";
import { createHash } from "node:crypto";
import { asc } from "drizzle-orm";
import {
  institutionSchoolLinks,
  institutions,
  schools,
  type InstitutionCategory,
  type InstitutionOperationalState,
  type InstitutionPublicationState,
  type InternationalSubtype,
} from "@/src/db/schema";
import {
  type ReadOnlyDatabaseExecutor,
  type TransactionManager,
} from "@/src/infrastructure/db/runtime.server";

const NAMESPACE = "9c930974-2c56-5d2d-8833-11e4df9bc18e";
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LIFECYCLES = new Set(["ACTIVE", "PAUSED", "ARCHIVED"]);
export const MIGRATION_BACKFILL_CONTEXT = {
  source: "MIGRATION",
  emitProductSignals: false,
} as const;
export type LegacySchoolBackfillSource = {
  id: string;
  slug: string;
  canonicalName: string;
  schoolType: string;
  lifecycleStatus: string;
  region1: string | null;
  region2: string | null;
  address: string | null;
  officialWebsiteUrl: string | null;
  shortDescription: string | null;
};
export type InstitutionBackfillMapping = {
  id: string;
  schoolId: string;
  slug: string;
  displayName: string;
  category: InstitutionCategory;
  internationalSubtype: InternationalSubtype | null;
  operationalState: InstitutionOperationalState;
  publicationState: InstitutionPublicationState;
  city: string | null;
  district: string | null;
  addressLine: string | null;
  websiteUrl: string | null;
  shortDescription: string | null;
};
export type InstitutionBackfillIssue = {
  code: string;
  message: string;
  schoolId?: string;
  institutionId?: string;
  slug?: string;
};
export type InstitutionBackfillAction = {
  mapping: InstitutionBackfillMapping;
  createInstitution: boolean;
  createLink: boolean;
};
export type InstitutionBackfillPreflight = {
  context: typeof MIGRATION_BACKFILL_CONTEXT;
  schoolCount: number;
  typeDistribution: Record<string, number>;
  blockingIssues: InstitutionBackfillIssue[];
  warnings: InstitutionBackfillIssue[];
  planned: { create: number; link: number; skip: number };
  productionStateVerified: false;
  actions: InstitutionBackfillAction[];
};
export type InstitutionBackfillApplyResult = {
  context: typeof MIGRATION_BACKFILL_CONTEXT;
  created: number;
  linked: number;
  skipped: number;
};

export function institutionIdForSchool(schoolId: string): string {
  const h = createHash("sha1")
    .update(
      Buffer.concat([
        Buffer.from(NAMESPACE.replaceAll("-", ""), "hex"),
        Buffer.from(`preppy:legacy-school:${schoolId}`),
      ]),
    )
    .digest()
    .subarray(0, 16);
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
function taxonomy(
  t: string,
): Pick<InstitutionBackfillMapping, "category" | "internationalSubtype"> {
  switch (t) {
    case "PRIVATE_ELEMENTARY":
      return { category: "PRIVATE_ELEMENTARY", internationalSubtype: null };
    case "INTERNATIONAL_SCHOOL":
      return {
        category: "INTERNATIONAL_SCHOOL",
        internationalSubtype: "INTERNATIONAL_SCHOOL",
      };
    case "FOREIGN_SCHOOL":
      return {
        category: "INTERNATIONAL_SCHOOL",
        internationalSubtype: "FOREIGN_SCHOOL",
      };
    default:
      throw new Error(`UNKNOWN_SCHOOL_TYPE: ${t}`);
  }
}
function state(s: string): InstitutionOperationalState {
  return s === "ACTIVE" ? "ACTIVE" : s === "PAUSED" ? "INACTIVE" : "UNKNOWN";
}
export function mapLegacySchoolToInstitution(
  s: LegacySchoolBackfillSource,
): InstitutionBackfillMapping {
  return {
    id: institutionIdForSchool(s.id),
    schoolId: s.id,
    slug: s.slug,
    displayName: s.canonicalName,
    ...taxonomy(s.schoolType),
    operationalState: state(s.lifecycleStatus),
    publicationState: "DRAFT",
    city: s.region1,
    district: s.region2,
    addressLine: s.address,
    websiteUrl: s.officialWebsiteUrl,
    shortDescription: s.shortDescription,
  };
}
const norm = (v: string | null) =>
  (v ?? "").trim().replace(/\s+/g, " ").toLowerCase();
const issue = (
  code: string,
  message: string,
  details: Omit<InstitutionBackfillIssue, "code" | "message"> = {},
): InstitutionBackfillIssue => ({ code, message, ...details });
function matches(
  row: {
    slug: string;
    displayName: string;
    category: InstitutionCategory;
    internationalSubtype: InternationalSubtype | null;
    operationalState: InstitutionOperationalState;
    publicationState: InstitutionPublicationState;
    city: string | null;
    district: string | null;
    addressLine: string | null;
    websiteUrl: string | null;
    shortDescription: string | null;
  },
  m: InstitutionBackfillMapping,
) {
  return (
    row.slug === m.slug &&
    row.displayName === m.displayName &&
    row.category === m.category &&
    row.internationalSubtype === m.internationalSubtype &&
    row.operationalState === m.operationalState &&
    row.publicationState === m.publicationState &&
    row.city === m.city &&
    row.district === m.district &&
    row.addressLine === m.addressLine &&
    row.websiteUrl === m.websiteUrl &&
    row.shortDescription === m.shortDescription
  );
}

export async function preflightInstitutionBackfill(
  executor: ReadOnlyDatabaseExecutor,
): Promise<InstitutionBackfillPreflight> {
  const [sourceRows, institutionRows, linkRows] = await Promise.all([
    executor.drizzle
      .select({
        id: schools.id,
        slug: schools.slug,
        canonicalName: schools.canonicalName,
        schoolType: schools.schoolType,
        lifecycleStatus: schools.lifecycleStatus,
        region1: schools.region1,
        region2: schools.region2,
        address: schools.address,
        officialWebsiteUrl: schools.officialWebsiteUrl,
        shortDescription: schools.shortDescription,
      })
      .from(schools)
      .orderBy(asc(schools.id)),
    executor.drizzle
      .select({
        id: institutions.id,
        slug: institutions.slug,
        displayName: institutions.displayName,
        category: institutions.category,
        internationalSubtype: institutions.internationalSubtype,
        operationalState: institutions.operationalState,
        publicationState: institutions.publicationState,
        city: institutions.city,
        district: institutions.district,
        addressLine: institutions.addressLine,
        websiteUrl: institutions.websiteUrl,
        shortDescription: institutions.shortDescription,
      })
      .from(institutions),
    executor.drizzle
      .select({
        institutionId: institutionSchoolLinks.institutionId,
        schoolId: institutionSchoolLinks.schoolId,
      })
      .from(institutionSchoolLinks),
  ]);
  const blockingIssues: InstitutionBackfillIssue[] = [];
  const warnings: InstitutionBackfillIssue[] = [];
  const typeDistribution: Record<string, number> = {};
  const slugs = new Map<string, LegacySchoolBackfillSource[]>();
  const names = new Map<string, LegacySchoolBackfillSource[]>();
  for (const source of sourceRows as LegacySchoolBackfillSource[]) {
    typeDistribution[source.schoolType] =
      (typeDistribution[source.schoolType] ?? 0) + 1;
    const a = slugs.get(source.slug) ?? [];
    a.push(source);
    slugs.set(source.slug, a);
    const key = `${norm(source.canonicalName)}|${norm(source.region1)}|${norm(source.region2)}`;
    const b = names.get(key) ?? [];
    b.push(source);
    names.set(key, b);
    if (!source.canonicalName.trim())
      blockingIssues.push(
        issue("EMPTY_CANONICAL_NAME", "School canonical_name is empty.", {
          schoolId: source.id,
        }),
      );
    if (!SLUG.test(source.slug))
      blockingIssues.push(
        issue("INVALID_SOURCE_SLUG", "School slug is not canonical.", {
          schoolId: source.id,
          slug: source.slug,
        }),
      );
    if (!LIFECYCLES.has(source.lifecycleStatus))
      blockingIssues.push(
        issue(
          "UNKNOWN_LIFECYCLE_STATUS",
          "School lifecycle status cannot be mapped.",
          { schoolId: source.id },
        ),
      );
    if (!source.region1?.trim() || !source.region2?.trim())
      warnings.push(
        issue("WEAK_REGION", "School region data is missing or incomplete.", {
          schoolId: source.id,
        }),
      );
    if (!source.officialWebsiteUrl?.trim() || !source.shortDescription?.trim())
      warnings.push(
        issue(
          "MISSING_OPTIONAL_PROFILE",
          "School optional profile data is incomplete.",
          { schoolId: source.id },
        ),
      );
  }
  for (const [slug, rows] of slugs)
    if (rows.length > 1)
      blockingIssues.push(
        issue(
          "DUPLICATE_SOURCE_SLUG",
          "Multiple Schools share the same slug.",
          { slug },
        ),
      );
  for (const rows of names.values())
    if (rows.length > 1)
      for (const school of rows)
        warnings.push(
          issue(
            "DUPLICATE_NORMALIZED_NAME_REGION",
            "Multiple Schools share the same normalized name and region.",
            { schoolId: school.id },
          ),
        );
  const byId = new Map(institutionRows.map((row) => [row.id, row]));
  const bySlug = new Map(institutionRows.map((row) => [row.slug, row]));
  const schoolById = new Map(sourceRows.map((row) => [row.id, row]));
  const bySchool = new Map(linkRows.map((row) => [row.schoolId, row]));
  const byInstitution = new Map(
    linkRows.map((row) => [row.institutionId, row]),
  );
  for (const link of linkRows) {
    const s = schoolById.get(link.schoolId);
    const i = byId.get(link.institutionId);
    if (!s || !i) {
      blockingIssues.push(
        issue(
          "ORPHAN_INCONSISTENT_BRIDGE",
          "Bridge references a missing row.",
          { schoolId: link.schoolId, institutionId: link.institutionId },
        ),
      );
      continue;
    }
    try {
      if (mapLegacySchoolToInstitution(s).id !== link.institutionId)
        blockingIssues.push(
          issue(
            "ORPHAN_INCONSISTENT_BRIDGE",
            "Bridge does not match deterministic Institution identity.",
            { schoolId: link.schoolId, institutionId: link.institutionId },
          ),
        );
    } catch {
      blockingIssues.push(
        issue("ORPHAN_INCONSISTENT_BRIDGE", "Bridge School cannot be mapped.", {
          schoolId: link.schoolId,
          institutionId: link.institutionId,
        }),
      );
    }
  }
  const actions: InstitutionBackfillAction[] = [];
  for (const source of sourceRows) {
    let mapping: InstitutionBackfillMapping;
    try {
      mapping = mapLegacySchoolToInstitution(source);
    } catch {
      blockingIssues.push(
        issue("UNKNOWN_SCHOOL_TYPE", "School type cannot be mapped.", {
          schoolId: source.id,
        }),
      );
      continue;
    }
    const sourceLink = bySchool.get(source.id);
    const expected = byId.get(mapping.id);
    const expectedLink = byInstitution.get(mapping.id);
    let bad = false;
    if (sourceLink && sourceLink.institutionId !== mapping.id) {
      blockingIssues.push(
        issue(
          "SCHOOL_LINKED_TO_UNEXPECTED_INSTITUTION",
          "School is linked to a non-deterministic Institution.",
          { schoolId: source.id, institutionId: sourceLink.institutionId },
        ),
      );
      bad = true;
    }
    if (expectedLink && expectedLink.schoolId !== source.id) {
      blockingIssues.push(
        issue(
          "EXPECTED_INSTITUTION_LINKED_TO_ANOTHER_SCHOOL",
          "Expected Institution is linked to another School.",
          { schoolId: source.id, institutionId: mapping.id },
        ),
      );
      bad = true;
    }
    const occupied = bySlug.get(mapping.slug);
    if (occupied && occupied.id !== mapping.id) {
      blockingIssues.push(
        issue(
          "TARGET_SLUG_OCCUPIED",
          "Institution slug is occupied by a different Institution.",
          {
            schoolId: source.id,
            institutionId: occupied.id,
            slug: mapping.slug,
          },
        ),
      );
      bad = true;
    }
    if (expected && !matches(expected, mapping)) {
      blockingIssues.push(
        issue(
          "EXPECTED_INSTITUTION_MISMATCH",
          "Expected Institution values differ.",
          { schoolId: source.id, institutionId: mapping.id },
        ),
      );
      bad = true;
    }
    if (bad) continue;
    if (sourceLink?.institutionId === mapping.id && expected)
      actions.push({ mapping, createInstitution: false, createLink: false });
    else if (expected)
      actions.push({ mapping, createInstitution: false, createLink: true });
    else actions.push({ mapping, createInstitution: true, createLink: true });
  }
  return {
    context: MIGRATION_BACKFILL_CONTEXT,
    schoolCount: sourceRows.length,
    typeDistribution,
    blockingIssues,
    warnings,
    planned: {
      create: actions.filter((a) => a.createInstitution).length,
      link: actions.filter((a) => a.createLink).length,
      skip: actions.filter((a) => !a.createInstitution && !a.createLink).length,
    },
    productionStateVerified: false,
    actions,
  };
}
export async function applyInstitutionBackfill({
  transactionManager,
}: {
  transactionManager: TransactionManager;
}): Promise<InstitutionBackfillApplyResult> {
  return transactionManager.run(async (executor) => {
    const report = await preflightInstitutionBackfill(executor);
    if (report.blockingIssues.length)
      throw new Error(
        "Institution backfill preflight failed; no rows were written.",
      );
    for (const action of report.actions) {
      if (action.createInstitution)
        await executor.drizzle.insert(institutions).values({
          id: action.mapping.id,
          slug: action.mapping.slug,
          displayName: action.mapping.displayName,
          category: action.mapping.category,
          internationalSubtype: action.mapping.internationalSubtype,
          operationalState: action.mapping.operationalState,
          publicationState: action.mapping.publicationState,
          city: action.mapping.city,
          district: action.mapping.district,
          addressLine: action.mapping.addressLine,
          websiteUrl: action.mapping.websiteUrl,
          shortDescription: action.mapping.shortDescription,
        });
      if (action.createLink)
        await executor.drizzle.insert(institutionSchoolLinks).values({
          institutionId: action.mapping.id,
          schoolId: action.mapping.schoolId,
          linkReason: "MIGRATION_BACKFILL",
        });
    }
    return {
      context: MIGRATION_BACKFILL_CONTEXT,
      created: report.planned.create,
      linked: report.planned.link,
      skipped: report.planned.skip,
    };
  });
}
