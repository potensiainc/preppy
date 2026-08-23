import type {
  InstitutionSourceBindingRole,
  OpportunitySourceBindingRole,
} from "@/src/db/schema";

export type BindingRoleMapping<Role extends string> =
  { role: Role; isPrimary: boolean } | { notImportedReason: string };

export function mapLegacyInstitutionBindingRole(
  sourceRole: string,
  sourceType: string,
): BindingRoleMapping<InstitutionSourceBindingRole> {
  switch (sourceRole) {
    case "PRIMARY_ADMISSIONS":
      return sourceType === "OFFICIAL_SCHOOL_PAGE"
        ? { role: "OFFICIAL_MAIN", isPrimary: true }
        : { role: "ADMISSIONS", isPrimary: true };
    case "NOTICE_BOARD":
      return { role: "ADMISSIONS", isPrimary: false };
    case "APPLICATION":
      return { role: "APPLICATION", isPrimary: false };
    case "OTHER":
      return { role: "OTHER", isPrimary: false };
    case "ELIGIBILITY":
    case "HISTORICAL":
    case "DISCOVERY":
      return { notImportedReason: `UNSAFE_LEGACY_ROLE:${sourceRole}` };
    default:
      throw new Error(`UNKNOWN_LEGACY_SOURCE_ROLE:${sourceRole}`);
  }
}

export function mapNativeOpportunityEvidenceRole(
  evidenceRole: string,
): BindingRoleMapping<OpportunitySourceBindingRole> {
  const normalized = evidenceRole.trim().toUpperCase();

  switch (normalized) {
    case "PRIMARY":
    case "PRIMARY_NOTICE":
      return { role: "PRIMARY_NOTICE", isPrimary: true };
    case "APPLICATION":
      return { role: "APPLICATION", isPrimary: false };
    case "DETAILS":
      return { role: "DETAILS", isPrimary: false };
    case "SUPPORTING":
      return { role: "SUPPORTING", isPrimary: false };
    case "OTHER":
      return { role: "OTHER", isPrimary: false };
    default:
      return {
        notImportedReason: `UNMAPPED_OPPORTUNITY_EVIDENCE_ROLE:${normalized || "EMPTY"}`,
      };
  }
}
