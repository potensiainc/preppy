import { describe, expect, it } from "vitest";

import {
  mapLegacyInstitutionBindingRole,
  mapNativeOpportunityEvidenceRole,
} from "@/src/infrastructure/db/source-binding-backfill-policy";

describe("WP-10A deterministic Source binding backfill policy", () => {
  it.each([
    [
      "PRIMARY_ADMISSIONS",
      "OFFICIAL_SCHOOL_PAGE",
      { role: "OFFICIAL_MAIN", isPrimary: true },
    ],
    [
      "PRIMARY_ADMISSIONS",
      "OFFICIAL_ADMISSION_PAGE",
      { role: "ADMISSIONS", isPrimary: true },
    ],
    [
      "NOTICE_BOARD",
      "OFFICIAL_NOTICE_BOARD",
      { role: "ADMISSIONS", isPrimary: false },
    ],
    [
      "APPLICATION",
      "OFFICIAL_APPLICATION_PORTAL",
      { role: "APPLICATION", isPrimary: false },
    ],
    ["OTHER", "OTHER", { role: "OTHER", isPrimary: false }],
  ] as const)(
    "maps legacy role %s and Source type %s without broad inference",
    (sourceRole, sourceType, expected) => {
      expect(mapLegacyInstitutionBindingRole(sourceRole, sourceType)).toEqual(
        expected,
      );
    },
  );

  it.each(["ELIGIBILITY", "HISTORICAL", "DISCOVERY"] as const)(
    "reports legacy role %s as NOT_IMPORTED",
    (sourceRole) => {
      expect(
        mapLegacyInstitutionBindingRole(sourceRole, "OFFICIAL_ADMISSION_PAGE"),
      ).toEqual({ notImportedReason: `UNSAFE_LEGACY_ROLE:${sourceRole}` });
    },
  );

  it("throws for a legacy role outside the physical schema vocabulary", () => {
    expect(() =>
      mapLegacyInstitutionBindingRole(
        "UNEXPECTED_ROLE",
        "OFFICIAL_ADMISSION_PAGE",
      ),
    ).toThrow("UNKNOWN_LEGACY_SOURCE_ROLE:UNEXPECTED_ROLE");
  });

  it.each([
    ["PRIMARY", { role: "PRIMARY_NOTICE", isPrimary: true }],
    [" primary_notice ", { role: "PRIMARY_NOTICE", isPrimary: true }],
    ["application", { role: "APPLICATION", isPrimary: false }],
    ["DETAILS", { role: "DETAILS", isPrimary: false }],
    [" supporting ", { role: "SUPPORTING", isPrimary: false }],
    ["OTHER", { role: "OTHER", isPrimary: false }],
  ] as const)("maps native Evidence role %s explicitly", (role, expected) => {
    expect(mapNativeOpportunityEvidenceRole(role)).toEqual(expected);
  });

  it.each(["", "ELIGIBILITY", "NOTICE", "PRIMARY_SOURCE"])(
    "reports unmapped native Evidence role %s as NOT_IMPORTED",
    (role) => {
      expect(mapNativeOpportunityEvidenceRole(role)).toEqual({
        notImportedReason: `UNMAPPED_OPPORTUNITY_EVIDENCE_ROLE:${role.trim().toUpperCase() || "EMPTY"}`,
      });
    },
  );
});
