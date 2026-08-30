import { describe, expect, it } from "vitest";

import {
  REQUIRED_BOOTSTRAP_COLUMNS,
  validateBootstrapSchemaInventory,
} from "@/src/modules/institution-detail-bootstrap/schema-preflight.server";

describe("private elementary Production schema preflight", () => {
  it("accepts the stable canonical schema without forbidden collector columns or migration ledger", () => {
    const columns = Object.entries(REQUIRED_BOOTSTRAP_COLUMNS).flatMap(
      ([tableName, names]) =>
        names.map((columnName) => ({ tableName, columnName })),
    );
    const result = validateBootstrapSchemaInventory({
      columns,
      constraints: [
        {
          name: "sources_source_type_check",
          definition:
            "CHECK (source_type = ANY (ARRAY['OFFICIAL_ADMISSION_PAGE','OFFICIAL_NOTICE_BOARD','OFFICIAL_DOCUMENT','OFFICIAL_SCHOOL_PAGE']))",
        },
        {
          name: "institution_source_bindings_role_check",
          definition:
            "CHECK (role = ANY (ARRAY['OFFICIAL_MAIN','ADMISSIONS','TUITION','CURRICULUM','APPLICATION','OTHER']))",
        },
        {
          name: "opportunity_source_bindings_role_check",
          definition:
            "CHECK (role = ANY (ARRAY['PRIMARY_NOTICE','APPLICATION','DETAILS','SUPPORTING','OTHER']))",
        },
      ],
    });

    expect(result).toMatchObject({
      compatible: true,
      missingColumns: [],
      migrationLedgerInspected: false,
      supportsOfficialRegistrySourceType: false,
      supportsRegistryIdentityBindingRole: false,
    });
    expect(REQUIRED_BOOTSTRAP_COLUMNS.source_snapshots).not.toContain(
      "raw_body",
    );
    expect(REQUIRED_BOOTSTRAP_COLUMNS.source_observations).not.toContain(
      "metadata",
    );
    expect(REQUIRED_BOOTSTRAP_COLUMNS).not.toHaveProperty(
      "institution_registry_identities",
    );
  });

  it("blocks before writes when a required canonical column or role is absent", () => {
    const columns = Object.entries(REQUIRED_BOOTSTRAP_COLUMNS).flatMap(
      ([tableName, names]) =>
        names
          .filter(
            (columnName) =>
              !(
                tableName === "opportunity_versions" &&
                columnName === "verified_at"
              ),
          )
          .map((columnName) => ({ tableName, columnName })),
    );
    const result = validateBootstrapSchemaInventory({
      columns,
      constraints: [
        {
          name: "sources_source_type_check",
          definition:
            "CHECK (source_type IN ('OFFICIAL_SCHOOL_PAGE','OFFICIAL_DOCUMENT','OFFICIAL_ADMISSION_PAGE','OFFICIAL_NOTICE_BOARD'))",
        },
        {
          name: "institution_source_bindings_role_check",
          definition: "CHECK (role IN ('OFFICIAL_MAIN','OTHER'))",
        },
        {
          name: "opportunity_source_bindings_role_check",
          definition: "CHECK (role IN ('PRIMARY_NOTICE'))",
        },
      ],
    });

    expect(result.compatible).toBe(false);
    expect(result.missingColumns).toContain("opportunity_versions.verified_at");
    expect(result.missingConstraintValues).toContain(
      "institution_source_bindings.role=ADMISSIONS",
    );
  });
});
