import type {
  ArticleStatus,
  InstitutionCategory,
  InstitutionPublicationState,
  OpportunityBusinessState,
  OpportunityPublicationState,
} from "@/src/db/schema";
import { opportunityBusinessStateValues } from "@/src/db/schema";

import type { Indexability } from "./dto";

type InstitutionIndexabilityInput = {
  entity: "INSTITUTION";
  publicationState: InstitutionPublicationState;
  slug: string | null | undefined;
  name: string | null | undefined;
  category: InstitutionCategory | null | undefined;
  region: string | null | undefined;
  hasOfficialSource: boolean;
  hasMeaningfulContent: boolean;
};

type OpportunityIndexabilityInput = {
  entity: "OPPORTUNITY";
  publicationState: OpportunityPublicationState;
  title: string | null | undefined;
  businessState: OpportunityBusinessState;
  hasVerifiedCurrentTruth: boolean;
  hasOfficialEvidence: boolean;
  hasUniqueActionableContent: boolean;
};

type ArticleIndexabilityInput = {
  entity: "ARTICLE";
  status: ArticleStatus;
  slug: string | null | undefined;
  robotsIndex: boolean;
};

export type IndexabilityInput =
  | InstitutionIndexabilityInput
  | OpportunityIndexabilityInput
  | ArticleIndexabilityInput;

function hasText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

const canonicalInstitutionSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function hasCanonicalInstitutionSlug(
  value: string | null | undefined,
): boolean {
  return typeof value === "string" && canonicalInstitutionSlug.test(value);
}

function isCanonicalOpportunityBusinessState(
  value: OpportunityBusinessState,
): boolean {
  return (opportunityBusinessStateValues as readonly string[]).includes(value);
}

/**
 * Single public SEO policy. Public retrieval and search eligibility are kept
 * separate: a PUBLISHED but thin record can remain publicly renderable NOINDEX.
 */
export function getIndexability(input: IndexabilityInput): Indexability {
  switch (input.entity) {
    case "INSTITUTION":
      if (input.publicationState !== "PUBLISHED") return "NOT_PUBLIC";

      return hasCanonicalInstitutionSlug(input.slug) &&
        hasText(input.name) &&
        input.category !== null &&
        input.category !== undefined &&
        hasText(input.region) &&
        input.hasOfficialSource &&
        input.hasMeaningfulContent
        ? "INDEX"
        : "NOINDEX";

    case "OPPORTUNITY":
      if (input.publicationState !== "PUBLISHED") return "NOT_PUBLIC";

      // CLOSED and COMPLETED remain eligible historical content. State is
      // validated here but is not itself a reason to noindex a canonical state.
      if (!isCanonicalOpportunityBusinessState(input.businessState)) {
        return "NOINDEX";
      }

      return hasText(input.title) &&
        input.hasVerifiedCurrentTruth &&
        input.hasOfficialEvidence &&
        input.hasUniqueActionableContent
        ? "INDEX"
        : "NOINDEX";

    case "ARTICLE":
      if (input.status !== "PUBLISHED") return "NOT_PUBLIC";

      // Articles have opaque stored HTML and no schema-level sanitization proof.
      // Keep every public Article NOINDEX until that guarantee is added later.
      return "NOINDEX";
  }
}
