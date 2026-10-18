import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  institutions,
  institutionSourceBindings,
  sources,
} from "@/src/db/schema";
import type { TransactionExecutor } from "@/src/infrastructure/db/runtime.server";
import type { SessionPackage } from "./session-package";
import { normalizeCampusLocation } from "./campus-location";

export function campusIdentityText(value: string) {
  return value
    .toLowerCase()
    .replace(/서울특별시|서울시/g, "서울")
    .replace(/경기도/g, "경기")
    .replace(/인천광역시|인천시/g, "인천")
    .replace(/[\s()·,~–-]/g, "");
}
function street(value: string) {
  const text = value.replace(/(?<=로)\s+(?=\d+길)/g, "");
  return (
    text
      .match(/([가-힣0-9·]+(?:대로|로|길)\s*\d+(?:-\d+)?)/)?.[1]
      .replace(/\s/g, "") ?? null
  );
}
type ResolvedCampus = Pick<
  typeof institutions.$inferSelect,
  "id" | "slug" | "displayName" | "category" | "publicationState"
>;
export async function planSessionCampuses(
  executor: TransactionExecutor,
  data: SessionPackage,
) {
  const all = await executor.drizzle.select().from(institutions).for("update");
  const resolved = new Map<string, ResolvedCampus>(
    all.map((row) => [row.slug, row]),
  );
  const before = [];
  const creates = [];
  const links = [];
  const rejects = [];
  for (const row of data.campuses) {
    const current = all.find((i) => i.slug === row.slug);
    if (current) {
      const replay =
        row.mode === "CREATE" &&
        current.category === "ENGLISH_KINDERGARTEN" &&
        current.displayName === row.name &&
        current.addressLine === row.officialAddress;
      if (
        !replay &&
        (row.mode !== "EXISTING" ||
          row.expectedInstitutionId !== current.id ||
          row.expectedName !== current.displayName ||
          (row.expectedAddress !== current.addressLine &&
            !(
              row.updateAddress && current.addressLine === row.officialAddress
            )))
      )
        rejects.push({
          institutionSlug: row.slug,
          code: "CAMPUS_CURRENT_IDENTITY_CONFLICT",
        });
      if (
        current.category !== "ENGLISH_KINDERGARTEN" ||
        current.publicationState !== "PUBLISHED"
      )
        rejects.push({
          institutionSlug: row.slug,
          code: "CAMPUS_MAPPING_OR_PUBLICATION_REQUIRED",
        });
      links.push({ row, desired: current });
      before.push({
        slug: row.slug,
        operation:
          row.updateAddress && current.addressLine !== row.officialAddress
            ? "UPDATE_ADDRESS"
            : "UNCHANGED",
        current,
      });
      continue;
    }
    const location = normalizeCampusLocation(
      row.officialAddress,
      row.officialRegion,
    );
    const duplicates = all.filter(
      (i) =>
        i.category === "ENGLISH_KINDERGARTEN" &&
        (campusIdentityText(i.displayName) === campusIdentityText(row.name) ||
          (i.addressLine &&
            (campusIdentityText(i.addressLine) ===
              campusIdentityText(row.officialAddress) ||
              (street(i.addressLine) &&
                street(i.addressLine) === street(row.officialAddress))))),
    );
    const urls = await executor.drizzle
      .select({
        institutionId: institutionSourceBindings.institutionId,
        url: sources.canonicalUrl,
      })
      .from(institutionSourceBindings)
      .innerJoin(sources, eq(sources.id, institutionSourceBindings.sourceId));
    const identityUrlCollision =
      row.officialCampusUrl &&
      urls.some((binding) => binding.url === row.officialCampusUrl);
    if (
      row.mode !== "CREATE" ||
      row.expectedInstitutionId !== null ||
      !location.regionCode ||
      duplicates.length ||
      identityUrlCollision
    ) {
      rejects.push({
        institutionSlug: row.slug,
        code: "CAMPUS_DUPLICATE_OR_IDENTITY_REVIEW_REQUIRED",
        candidates: duplicates.map((i) => ({
          id: i.id,
          slug: i.slug,
          name: i.displayName,
          address: i.addressLine,
          publicationState: i.publicationState,
        })),
      });
      continue;
    }
    const desired = {
      id: randomUUID(),
      slug: row.slug,
      displayName: row.name,
      category: "ENGLISH_KINDERGARTEN" as const,
      publicationState: "PUBLISHED" as const,
      operationalState: "UNKNOWN" as const,
      regionCode: location.regionCode,
      district: location.district,
      addressLine: row.officialAddress,
      websiteUrl: row.officialCampusUrl,
    };
    // Include already planned roots in duplicate checks within the same package.
    all.push({
      ...desired,
      internationalSubtype: null,
      city: null,
      latitude: null,
      longitude: null,
      shortDescription: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      publishedAt: null,
      archivedAt: null,
    });
    creates.push({ row, desired });
    before.push({
      slug: row.slug,
      operation: "CREATE_CAMPUS",
      current: null,
      desired,
    });
    resolved.set(row.slug, desired);
  }
  return { resolved, before, creates, links, rejects };
}
