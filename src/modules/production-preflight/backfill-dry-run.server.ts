import "server-only";

import { preflightInstitutionBackfill } from "@/src/infrastructure/db/institution-backfill.server";
import { preflightOpportunityBackfill } from "@/src/infrastructure/db/opportunity-backfill.server";
import { preflightSourceBindingBackfill } from "@/src/infrastructure/db/source-binding-backfill.server";
import type { ReadOnlyPreflightSession } from "@/src/modules/production-preflight/read-only-database.server";

type DryRunCounts = {
  wouldInsert: number;
  wouldReuse: number;
  wouldSkip: number;
  wouldBlock: number;
  blockerCodes: string[];
};

export type BackfillDryRun = {
  institution: DryRunCounts;
  opportunity: DryRunCounts;
  sourceBindings: DryRunCounts & {
    notImported: number;
    notImportedCodes: string[];
  };
  productSignals: 0;
};

const uniqueCodes = (issues: readonly { code: string }[]) =>
  [...new Set(issues.map((issue) => issue.code))].sort();

export async function collectBackfillDryRun(
  session: ReadOnlyPreflightSession,
): Promise<BackfillDryRun> {
  const executor = session.createBackfillExecutor();
  const [institution, opportunity, sourceBindings] = await Promise.all([
    preflightInstitutionBackfill(executor),
    preflightOpportunityBackfill(executor),
    preflightSourceBindingBackfill(executor),
  ]);
  return {
    institution: {
      wouldInsert: institution.planned.create,
      wouldReuse: institution.actions.filter(
        (action) => !action.createInstitution && action.createLink,
      ).length,
      wouldSkip: institution.planned.skip,
      wouldBlock: institution.blockingIssues.length,
      blockerCodes: uniqueCodes(institution.blockingIssues),
    },
    opportunity: {
      wouldInsert: opportunity.planned.create,
      wouldReuse: opportunity.actions.filter(
        (action) => !action.createOpportunity && action.createLink,
      ).length,
      wouldSkip: opportunity.planned.skip,
      wouldBlock: opportunity.blockingIssues.length,
      blockerCodes: uniqueCodes(opportunity.blockingIssues),
    },
    sourceBindings: {
      wouldInsert:
        sourceBindings.planned.institution.insert +
        sourceBindings.planned.opportunity.insert,
      wouldReuse: 0,
      wouldSkip:
        sourceBindings.planned.institution.skip +
        sourceBindings.planned.opportunity.skip,
      wouldBlock: sourceBindings.blockingIssues.length,
      blockerCodes: uniqueCodes(sourceBindings.blockingIssues),
      notImported: sourceBindings.notImported.length,
      notImportedCodes: uniqueCodes(sourceBindings.notImported),
    },
    productSignals: 0,
  };
}
