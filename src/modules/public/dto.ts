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
  /** Public Institution eligibility only; never personalized Follow state. */
  followable: boolean;
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
    "id" | "slug" | "name" | "category" | "region" | "followable"
  >;
  lastVerifiedAt: string | null;
  indexability: Indexability;
};

/**
 * Explicit, globally cache-safe opportunity projection. Persistence truth mode,
 * legacy linkage identifiers, provenance internals, and user state stay private.
 */
export type PublicOpportunityDTO = OpportunityCardDTO & {
  /** Canonical numbered cycle only; current/legacy/unrecognized stays unknown. */
  academicYearLabel?: string | null;
  /** Public, verified same-school/cycle event routes; no persistence IDs. */
  relatedAdmissions?: Array<{
    slug: string;
    title: string;
    kind: OpportunityKind;
    businessState: OpportunityBusinessState;
    keyDates: OpportunityKeyDatesDTO;
  }>;
  keyDates: OpportunityKeyDatesDTO;
  targetAudience: string | null;
  summary: string | null;
  actionUrl: string | null;
  officialSource: OfficialSourceDTO | null;
  officialSources?: OfficialSourceDTO[];
  /**
   * The canonical same-school, same-cycle main recruitment guide shown on a
   * child event page. It is absent on the main guide itself and where no
   * current verified guide is available.
   */
  admissionGuide?: {
    title: string;
    slug: string;
    summary: string | null;
    officialSources: OfficialSourceDTO[];
    lastCollectedAt: string | null;
    lastVerifiedAt: string;
  } | null;
  /** Actual evidence collection time, never an operator verification time. */
  lastCollectedAt?: string | null;
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

/**
 * Evidence-backed Native admission truth for an Institution detail page.
 * Collection freshness and operator verification freshness stay distinct.
 */
export type ReviewedAdmissionDTO = {
  id: string;
  slug: string;
  title: string;
  academicYearLabel: string | null;
  knowledgeState:
    "SCHEDULE_FOUND" | "GUIDANCE_FOUND" | "NOT_ANNOUNCED" | "NOT_FOUND";
  kind: OpportunityKind;
  businessState: OpportunityBusinessState;
  summary: string | null;
  targetAudience: string | null;
  keyDates: OpportunityKeyDatesDTO;
  actionUrl: string | null;
  officialSource: OfficialSourceDTO;
  officialSources?: OfficialSourceDTO[];
  lastCollectedAt: string;
  lastVerifiedAt: string;
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

export type PublicArticleDTO = ArticleCardDTO & {
  updatedAt: string;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  robotsIndex: boolean;
  robotsFollow: boolean;
  relatedInstitutions: InstitutionCardDTO[];
  relatedOpportunities: OpportunityCardDTO[];
  sanitizedContentHtml: string;
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
  officialSources?: OfficialSourceDTO[];
};

/**
 * Explicit Institution page contract. It deliberately has no page-wide
 * `lastVerifiedAt`, since facts and opportunities have separate freshness.
 */
export type InstitutionDetailDTO = {
  institution: InstitutionCardDTO;
  reviewedAdmissions: ReviewedAdmissionDTO[];
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
