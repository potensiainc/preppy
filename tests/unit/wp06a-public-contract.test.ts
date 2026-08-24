import { describe, expect, expectTypeOf, it } from "vitest";

import { ValidationError } from "@/src/application/errors";
import type {
  InstitutionCardDTO,
  InstitutionDetailDTO,
  InstitutionFactDTO,
  PublicArticleDTO,
  PublicOpportunityDTO,
} from "@/src/modules/public/dto";
import type { UnsafeStoredArticleDetailDTO } from "@/src/modules/public/article-detail.server";
import { getIndexability } from "@/src/modules/public/indexability";
import {
  DEFAULT_INSTITUTION_PAGE_SIZE,
  MAX_INSTITUTION_PAGE,
  MAX_INSTITUTION_PAGE_SIZE,
  parseInstitutionListQuery,
} from "@/src/modules/public/input";

describe("WP-06A public indexability policy", () => {
  it("indexes a published Institution only when its canonical public page is trustworthy and meaningful", () => {
    expect(
      getIndexability({
        entity: "INSTITUTION",
        publicationState: "PUBLISHED",
        slug: "seoul-international-school",
        name: "Seoul International School",
        category: "INTERNATIONAL_SCHOOL",
        region: "SEOUL",
        hasOfficialSource: true,
        hasMeaningfulContent: true,
      }),
    ).toBe("INDEX");
  });

  it("keeps a published but thin Institution public and noindexed", () => {
    expect(
      getIndexability({
        entity: "INSTITUTION",
        publicationState: "PUBLISHED",
        slug: "thin-school",
        name: "Thin School",
        category: "PRIVATE_ELEMENTARY",
        region: "SEOUL",
        hasOfficialSource: false,
        hasMeaningfulContent: false,
      }),
    ).toBe("NOINDEX");
  });

  it("keeps a published Institution with a non-canonical slug noindexed", () => {
    expect(
      getIndexability({
        entity: "INSTITUTION",
        publicationState: "PUBLISHED",
        slug: "Seoul International School",
        name: "Seoul International School",
        category: "INTERNATIONAL_SCHOOL",
        region: "SEOUL",
        hasOfficialSource: true,
        hasMeaningfulContent: true,
      }),
    ).toBe("NOINDEX");
  });

  it("marks a non-public Institution as not public instead of noindex", () => {
    expect(
      getIndexability({
        entity: "INSTITUTION",
        publicationState: "HIDDEN",
        slug: "hidden-school",
        name: "Hidden School",
        category: "PRIVATE_ELEMENTARY",
        region: "SEOUL",
        hasOfficialSource: true,
        hasMeaningfulContent: true,
      }),
    ).toBe("NOT_PUBLIC");
  });

  it("does not noindex a closed Opportunity solely because it is closed", () => {
    expect(
      getIndexability({
        entity: "OPPORTUNITY",
        publicationState: "PUBLISHED",
        title: "2026 application deadline",
        businessState: "CLOSED",
        hasVerifiedCurrentTruth: true,
        hasOfficialEvidence: true,
        hasUniqueActionableContent: true,
      }),
    ).toBe("INDEX");
  });

  it("marks unpublished Opportunities as not public even if their content is otherwise eligible", () => {
    expect(
      getIndexability({
        entity: "OPPORTUNITY",
        publicationState: "DRAFT",
        title: "Application window",
        businessState: "OPEN",
        hasVerifiedCurrentTruth: true,
        hasOfficialEvidence: true,
        hasUniqueActionableContent: true,
      }),
    ).toBe("NOT_PUBLIC");
  });

  it("keeps a published thin Opportunity public and noindexed", () => {
    expect(
      getIndexability({
        entity: "OPPORTUNITY",
        publicationState: "PUBLISHED",
        title: "Application window",
        businessState: "OPEN",
        hasVerifiedCurrentTruth: false,
        hasOfficialEvidence: false,
        hasUniqueActionableContent: false,
      }),
    ).toBe("NOINDEX");
  });

  it("evaluates only canonical business states without treating closed history as ineligible", () => {
    const eligible = {
      entity: "OPPORTUNITY" as const,
      publicationState: "PUBLISHED" as const,
      title: "2026 application deadline",
      hasVerifiedCurrentTruth: true,
      hasOfficialEvidence: true,
      hasUniqueActionableContent: true,
    };

    expect(getIndexability({ ...eligible, businessState: "COMPLETED" })).toBe(
      "INDEX",
    );
    expect(
      getIndexability({
        ...eligible,
        businessState: "NOT_A_BUSINESS_STATE" as "OPEN",
      }),
    ).toBe("NOINDEX");
  });

  it("indexes only a published Article with a sanitizer-backed meaningful body and description", () => {
    expect(
      getIndexability({
        entity: "ARTICLE",
        status: "PUBLISHED",
        slug: "choosing-an-international-school",
        robotsIndex: true,
        hasMeaningfulSanitizedBody: true,
        hasDescription: true,
      }),
    ).toBe("INDEX");
  });

  it("marks non-public Articles as not public", () => {
    expect(
      getIndexability({
        entity: "ARTICLE",
        status: "ARCHIVED",
        slug: "old-guide",
        robotsIndex: true,
        hasMeaningfulSanitizedBody: true,
        hasDescription: true,
      }),
    ).toBe("NOT_PUBLIC");
  });
});

describe("WP-06A institution list input", () => {
  it("normalizes bounded public filters and applies canonical pagination defaults", () => {
    expect(
      parseInstitutionListQuery({
        category: "INTERNATIONAL_SCHOOL",
        region: "  Seoul   Gangnam ",
        recruitmentState: "OPEN",
        query: "  International   school ",
        page: "2",
        pageSize: "10",
      }),
    ).toEqual({
      category: "INTERNATIONAL_SCHOOL",
      region: "Seoul Gangnam",
      recruitmentState: "OPEN",
      query: "International school",
      page: 2,
      pageSize: 10,
    });

    expect(parseInstitutionListQuery({})).toEqual({
      page: 1,
      pageSize: DEFAULT_INSTITUTION_PAGE_SIZE,
    });
  });

  it("rejects unknown, non-canonical, and unbounded public filters", () => {
    const invalidInputs = [
      { category: "international_school" },
      { recruitmentState: "ACTIVE" },
      { page: "0" },
      { page: "1.5" },
      { page: MAX_INSTITUTION_PAGE + 1 },
      { pageSize: String(MAX_INSTITUTION_PAGE_SIZE + 1) },
      { region: "x".repeat(65) },
      { query: "x".repeat(121) },
      { sort: "updatedAt" },
    ];

    for (const input of invalidInputs) {
      expect(() => parseInstitutionListQuery(input)).toThrow(ValidationError);
    }
  });

  it("accepts bounded numeric pagination inputs", () => {
    expect(parseInstitutionListQuery({ page: 2, pageSize: 10 })).toEqual({
      page: 2,
      pageSize: 10,
    });
  });
});

describe("WP-06A public DTO contract", () => {
  it("does not expose persistence, user, or operational fields in public DTO types", () => {
    expectTypeOf<PublicOpportunityDTO>().not.toHaveProperty("truthMode");
    expectTypeOf<PublicOpportunityDTO>().not.toHaveProperty("legacySchoolId");
    expectTypeOf<PublicOpportunityDTO>().not.toHaveProperty("admissionEventId");
    expectTypeOf<PublicOpportunityDTO>().not.toHaveProperty("isFollowed");
    expectTypeOf<PublicOpportunityDTO>().not.toHaveProperty("userId");
    expectTypeOf<InstitutionCardDTO>().not.toHaveProperty("userId");
    expectTypeOf<InstitutionFactDTO>().not.toHaveProperty("userId");
    expectTypeOf<PublicArticleDTO>().not.toHaveProperty("adminUserId");
    expectTypeOf<PublicArticleDTO>().not.toHaveProperty("email");
    expectTypeOf<PublicArticleDTO>().not.toHaveProperty("userId");
    expectTypeOf<PublicArticleDTO>().not.toHaveProperty("audit");
    expectTypeOf<PublicArticleDTO>().not.toHaveProperty("outbox");
    expectTypeOf<PublicArticleDTO>().not.toHaveProperty("providerMessageId");
  });

  it("defines Institution detail freshness only per verified fact, never as a fabricated page timestamp", () => {
    expectTypeOf<InstitutionFactDTO>().toHaveProperty("factType");
    expectTypeOf<InstitutionFactDTO>().toHaveProperty("displayValue");
    expectTypeOf<InstitutionFactDTO>().toHaveProperty("value");
    expectTypeOf<InstitutionFactDTO>().toHaveProperty("verifiedAt");
    expectTypeOf<InstitutionFactDTO>().toHaveProperty("officialSource");
    expectTypeOf<InstitutionDetailDTO>().toHaveProperty("officialSources");
    expectTypeOf<InstitutionDetailDTO>().toHaveProperty("currentOpportunities");
    expectTypeOf<InstitutionDetailDTO>().toHaveProperty(
      "upcomingOpportunities",
    );
    expectTypeOf<InstitutionDetailDTO>().toHaveProperty("recentOpportunities");
    expectTypeOf<InstitutionDetailDTO>().toHaveProperty("relatedArticles");
    expectTypeOf<InstitutionDetailDTO>().not.toHaveProperty("lastVerifiedAt");
    expectTypeOf<InstitutionDetailDTO>().not.toHaveProperty("userId");
  });

  it("keeps plural Opportunity dates in the shared detail contract", () => {
    expectTypeOf<PublicOpportunityDTO>().toHaveProperty("keyDate");
    expectTypeOf<PublicOpportunityDTO>().toHaveProperty("keyDates");
    expectTypeOf<PublicOpportunityDTO["keyDates"]>().toHaveProperty(
      "eventStartsAt",
    );
    expectTypeOf<PublicOpportunityDTO["keyDates"]>().toHaveProperty(
      "eventEndsAt",
    );
    expectTypeOf<PublicOpportunityDTO["keyDates"]>().toHaveProperty(
      "applicationOpensAt",
    );
    expectTypeOf<PublicOpportunityDTO["keyDates"]>().toHaveProperty(
      "applicationClosesAt",
    );
  });

  it("keeps opaque stored HTML outside the client-safe Article DTO", () => {
    expectTypeOf<PublicArticleDTO>().not.toHaveProperty("storedContentHtml");
    expectTypeOf<PublicArticleDTO>().toHaveProperty("sanitizedContentHtml");
    expectTypeOf<PublicArticleDTO>().not.toHaveProperty("authorDisplayName");
    expectTypeOf<UnsafeStoredArticleDetailDTO>().toHaveProperty(
      "unsafeStoredContentHtml",
    );
    expectTypeOf<UnsafeStoredArticleDetailDTO>().toHaveProperty("updatedAt");
    expectTypeOf<UnsafeStoredArticleDetailDTO>().not.toHaveProperty(
      "dateModified",
    );
  });
});
