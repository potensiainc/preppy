import type {
  ArticleCategory,
  ArticleType,
  InstitutionCategory,
  InstitutionFactType,
  OpportunityBusinessState,
  OpportunityKind,
} from "@/src/db/schema";

/** A public SEO rendering decision, distinct from whether an object is retrievable. */
export type Indexability = "INDEX" | "NOINDEX" | "NOT_PUBLIC";

/**
 * Allowlisted institution-list filters after server validation and normalization.
 * Pagination is always present so callers cannot create unbounded public lists.
 * Future public query entry points must accept `unknown` input and parse it
 * internally before accepting this trusted parser output.
 */
export type InstitutionListQuery = {
  category?: InstitutionCategory;
  region?: string;
  recruitmentState?: OpportunityBusinessState;
  query?: string;
  page: number;
  pageSize: number;
};

export type PaginationDTO = {
  page: number;
  pageSize: number;
  total: number;
  hasNext: boolean;
};

export type OfficialSourceDTO = {
  name: string;
  url: string;
  authorityLevel: "PRIMARY" | "SECONDARY_OFFICIAL";
};

export type InstitutionCardDTO = {
  id: string;
  slug: string;
  name: string;
  category: InstitutionCategory;
  region: string | null;
  currentAdmissionsState: OpportunityBusinessState | null;
  currentOpportunity?: {
    id: string;
    slug: string;
    title: string;
    kind: OpportunityKind;
    state: OpportunityBusinessState;
    keyDate?: string | null;
  } | null;
  lastVerifiedAt?: string | null;
};

export type InstitutionListDTO = {
  items: InstitutionCardDTO[];
  pagination: PaginationDTO;
};

export type OpportunityCardDTO = {
  id: string;
  slug: string;
  title: string;
  kind: OpportunityKind;
  businessState: OpportunityBusinessState;
  keyDate: string | null;
  institution: Pick<
    InstitutionCardDTO,
    "id" | "slug" | "name" | "category" | "region"
  >;
  lastVerifiedAt: string | null;
  indexability: Indexability;
};

/**
 * Explicit, globally cache-safe opportunity projection. Persistence truth mode,
 * legacy linkage identifiers, provenance internals, and user state stay private.
 */
export type PublicOpportunityDTO = OpportunityCardDTO & {
  keyDates: OpportunityKeyDatesDTO;
  targetAudience: string | null;
  summary: string | null;
  actionUrl: string | null;
  officialSource: OfficialSourceDTO | null;
  recentMeaningfulChanges: Array<{
    occurredAt: string;
    summary: string;
  }>;
  relatedArticles: ArticleCardDTO[];
};

/**
 * Canonical public event/application windows. Native timestamps and Legacy
 * date/time pairs are normalized to these ISO-like nullable fields by queries.
 */
export type OpportunityKeyDatesDTO = {
  eventStartsAt: string | null;
  eventEndsAt: string | null;
  applicationOpensAt: string | null;
  applicationClosesAt: string | null;
};

export type ArticleCardDTO = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  articleType: ArticleType;
  category: ArticleCategory;
  publishedAt: string | null;
  featuredImageUrl: string | null;
  featuredImageAlt: string | null;
  indexability: Indexability;
};

/**
 * The stored article HTML is deliberately named `storedContentHtml`: the current
 * schema has no sanitization marker, so this field is not a claim of sanitization
 * and must not be rendered until a server-side sanitizer guarantee exists.
 */
export type PublicArticleDTO = ArticleCardDTO & {
  updatedAt: string;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  robotsIndex: boolean;
  robotsFollow: boolean;
  authorDisplayName: string | null;
  relatedInstitutions: InstitutionCardDTO[];
  relatedOpportunities: OpportunityCardDTO[];
};

/**
 * A selected Fact must be the current verified version. `verifiedAt` is
 * fact-level provenance, never a synthesized Institution page freshness value.
 */
export type InstitutionFactDTO = {
  factType: InstitutionFactType;
  value: Record<string, unknown>;
  displayValue: string | null;
  verifiedAt: string;
  officialSource: OfficialSourceDTO | null;
};

/**
 * Explicit Institution page contract. It deliberately has no page-wide
 * `lastVerifiedAt`, since facts and opportunities have separate freshness.
 */
export type InstitutionDetailDTO = {
  institution: InstitutionCardDTO;
  currentOpportunities: OpportunityCardDTO[];
  upcomingOpportunities: OpportunityCardDTO[];
  recentOpportunities: OpportunityCardDTO[];
  verifiedFacts: InstitutionFactDTO[];
  officialSources: OfficialSourceDTO[];
  relatedArticles: ArticleCardDTO[];
  indexability: Indexability;
};

export type CategoryEntryDTO = {
  category: InstitutionCategory;
  label: string;
  href: string;
};

export type HomePageDTO = {
  currentOpportunities: OpportunityCardDTO[];
  featuredInstitutions: InstitutionCardDTO[];
  latestArticles: ArticleCardDTO[];
  categories: CategoryEntryDTO[];
};
