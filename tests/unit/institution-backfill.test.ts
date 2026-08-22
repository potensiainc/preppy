import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  MIGRATION_BACKFILL_CONTEXT,
  institutionIdForSchool,
  mapLegacySchoolToInstitution,
} from "@/src/infrastructure/db/institution-backfill.server";

describe("Institution backfill mapping", () => {
  it("derives a stable canonical UUID that is independent from the School UUID", () => {
    const schoolId = "00000000-0000-4000-8000-000000000001";

    expect(institutionIdForSchool(schoolId)).toBe(
      "bb935f67-4f6c-5f46-84a7-e70195b63502",
    );
    expect(institutionIdForSchool(schoolId)).not.toBe(schoolId);
    expect(institutionIdForSchool(schoolId)).toBe(
      institutionIdForSchool(schoolId),
    );
  });

  it.each([
    ["PRIVATE_ELEMENTARY", "PRIVATE_ELEMENTARY", null],
    ["INTERNATIONAL_SCHOOL", "INTERNATIONAL_SCHOOL", "INTERNATIONAL_SCHOOL"],
    ["FOREIGN_SCHOOL", "INTERNATIONAL_SCHOOL", "FOREIGN_SCHOOL"],
  ] as const)(
    "maps %s to the canonical Institution taxonomy",
    (schoolType, category, internationalSubtype) => {
      const mapping = mapLegacySchoolToInstitution({
        id: randomUUID(),
        slug: "valid-school-slug",
        canonicalName: "Test School",
        schoolType,
        lifecycleStatus: "ACTIVE",
        region1: "Seoul",
        region2: "Jongno",
        address: "1 Test Road",
        officialWebsiteUrl: "https://example.test",
        shortDescription: "Test profile",
      });

      expect(mapping).toMatchObject({
        category,
        internationalSubtype,
        displayName: "Test School",
        slug: "valid-school-slug",
        city: "Seoul",
        district: "Jongno",
        addressLine: "1 Test Road",
        websiteUrl: "https://example.test",
        shortDescription: "Test profile",
        publicationState: "DRAFT",
        operationalState: "ACTIVE",
      });
    },
  );

  it("rejects an unknown legacy School type as a blocking mapping error", () => {
    expect(() =>
      mapLegacySchoolToInstitution({
        id: randomUUID(),
        slug: "valid-school-slug",
        canonicalName: "Unknown Type School",
        schoolType: "UNSUPPORTED_TYPE",
        lifecycleStatus: "ACTIVE",
        region1: null,
        region2: null,
        address: null,
        officialWebsiteUrl: null,
        shortDescription: null,
      }),
    ).toThrow("UNKNOWN_SCHOOL_TYPE");
  });

  it("exports the silent Migration context", () => {
    expect(MIGRATION_BACKFILL_CONTEXT).toEqual({
      source: "MIGRATION",
      emitProductSignals: false,
    });
  });
});
