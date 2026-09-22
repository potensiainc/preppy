import "server-only";

import type { PreflightCheck } from "@/src/modules/production-preflight/contracts";
import type {
  CurrentSourceBindingIntegrityCounts,
  ReadOnlyPreflightSession,
} from "@/src/modules/production-preflight/read-only-database.server";

export async function collectCurrentSourceBindingAudit(
  session: ReadOnlyPreflightSession,
): Promise<{
  counts: CurrentSourceBindingIntegrityCounts;
  checks: PreflightCheck[];
}> {
  const counts = await session.getCurrentSourceBindingIntegrityCounts();
  const definitions: Array<[number, string, string]> = [
    [
      counts.missingActiveBinding,
      "CURRENT_EVIDENCE_MISSING_ACTIVE_BINDING",
      "Current verified evidence has no active binding to its Source.",
    ],
    [
      counts.bindingRoleMismatch,
      "CURRENT_EVIDENCE_BINDING_ROLE_MISMATCH",
      "Current verified evidence role differs from its active Source binding.",
    ],
    [
      counts.orphanEvidenceSource,
      "CURRENT_EVIDENCE_ORPHAN_SOURCE",
      "Current verified evidence references a missing Source.",
    ],
    [
      counts.observationSourceMismatch,
      "CURRENT_EVIDENCE_OBSERVATION_SOURCE_MISMATCH",
      "Current verified evidence observation belongs to another Source.",
    ],
    [
      counts.snapshotSourceMismatch,
      "CURRENT_EVIDENCE_SNAPSHOT_SOURCE_MISMATCH",
      "Current verified evidence snapshot belongs to another Source.",
    ],
  ];
  return {
    counts,
    checks: definitions
      .filter(([count]) => count > 0)
      .map(([count, code, message]) => ({
        code,
        severity: "BLOCKER" as const,
        count,
        message,
      })),
  };
}
