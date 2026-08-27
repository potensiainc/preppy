import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  institutionRegistryIdentities,
  institutionSourceBindingRoleValues,
  sourceTypeValues,
} from "@/src/db/schema";
import { parseSourceAdminListInput } from "@/src/modules/admin/read-model/input";

describe("PREPPY seed schema contract", () => {
  it("adds only the dedicated resolved registry identity table", () => {
    // Mutation caught: registry identity is folded into Institution or loses its exact key.
    const config = getTableConfig(institutionRegistryIdentities);

    expect(config.name).toBe("institution_registry_identities");
    expect(config.columns.map((column) => column.name)).toEqual([
      "id",
      "institution_id",
      "registry_name",
      "registry_external_id",
      "registry_record_url",
      "registry_locator",
      "metadata_json",
      "created_at",
      "updated_at",
    ]);
    expect(
      config.uniqueConstraints.map((constraint) => constraint.name),
    ).toContain("institution_registry_identities_registry_unique");
    expect(config.indexes.map((index) => index.config.name)).toContain(
      "institution_registry_identities_institution_idx",
    );
    expect(config.checks.map((check) => check.name)).toContain(
      "institution_registry_identities_registry_name_check",
    );
  });

  it("extends existing Source and canonical binding vocabularies minimally", () => {
    // Mutation caught: website roots get a duplicate role or registry provenance is generic OTHER.
    expect(sourceTypeValues).toContain("OFFICIAL_REGISTRY");
    expect(institutionSourceBindingRoleValues).toContain("REGISTRY_IDENTITY");
    expect(institutionSourceBindingRoleValues).not.toContain(
      "OFFICIAL_WEBSITE_ROOT",
    );
    expect(
      parseSourceAdminListInput({ sourceType: "OFFICIAL_REGISTRY" }),
    ).toMatchObject({ sourceType: "OFFICIAL_REGISTRY" });
  });
});
