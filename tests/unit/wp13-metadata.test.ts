import { describe, expect, it } from "vitest";

import type {
  InstitutionDetailDTO,
  PublicArticleDTO,
  PublicOpportunityDTO,
} from "@/src/modules/public/dto";
import {
  buildArticleMetadata,
  buildHomeMetadata,
  buildInstitutionListMetadata,
  buildInstitutionMetadata,
  buildOpportunityMetadata,
} from "@/src/modules/public/seo";

const appBaseUrl = "https://preppy.example";
const article: PublicArticleDTO = {
  id: "article",
  slug: "complete-guide",
  title: "Complete guide",
  excerpt: "A complete description.",
  articleType: "GUIDE",
  category: "ADMISSIONS_GENERAL",
  publishedAt: "2026-08-25T00:00:00.000Z",
  featuredImageUrl: "https://images.example/guide.jpg",
  featuredImageAlt: "Guide",
  indexability: "INDEX",
  updatedAt: "2026-08-25T01:00:00.000Z",
  seoTitle: "SEO guide",
  seoDescription: "SEO description",
  canonicalUrl: "https://preppy.example/articles/complete-guide",
  robotsIndex: true,
  robotsFollow: true,
  relatedInstitutions: [],
  relatedOpportunities: [],
  sanitizedContentHtml:
    "<p>Meaningful complete Article body with enough detail for indexing.</p>",
};
const opportunity = {
  id: "opportunity",
  slug: "open-admission",
  title: "Open admission",
  kind: "APPLICATION",
  businessState: "OPEN",
  keyDate: null,
  institution: {
    id: "institution",
    slug: "alpha-school",
    name: "Alpha School",
    category: "INTERNATIONAL_SCHOOL",
    region: "SEOUL",
    followable: true,
  },
  lastVerifiedAt: "2026-08-25T00:00:00.000Z",
  indexability: "INDEX",
  keyDates: {
    eventStartsAt: null,
    eventEndsAt: null,
    applicationOpensAt: null,
    applicationClosesAt: null,
  },
  targetAudience: null,
  summary: "Verified admissions details.",
  actionUrl: null,
  officialSource: null,
  recentMeaningfulChanges: [],
  relatedArticles: [],
} satisfies PublicOpportunityDTO;
const institution = {
  institution: {
    ...opportunity.institution,
    currentAdmissionsState: "OPEN",
    currentOpportunity: null,
    lastVerifiedAt: null,
  },
  reviewedAdmissions: [],
  currentOpportunities: [],
  upcomingOpportunities: [],
  recentOpportunities: [],
  verifiedFacts: [],
  officialSources: [],
  relatedArticles: [],
  indexability: "INDEX",
} satisfies InstitutionDetailDTO;

describe("WP-13 public metadata", () => {
  it("preserves year, conditions and canonical identity in parent-facing admission descriptions", () => {
    const metadata = buildOpportunityMetadata(
      {
        ...opportunity,
        summary:
          "2027학년도 지원자는 원본만 제출해야 한다. 2025학년도 수업료는 2,312,100원이다.",
      },
      appBaseUrl,
    );
    expect(metadata.description).toBe(
      "2027학년도 지원자는 원본만 제출해야 해요. 2025학년도 수업료는 2,312,100원이에요.",
    );
    expect(metadata.alternates?.canonical).toBe(
      "https://preppy.example/opportunities/open-admission",
    );
    expect(opportunity.slug).toBe("open-admission");
  });
  it("builds exact canonical home/list metadata and noindexes filtered Institution variants", () => {
    const home = buildHomeMetadata(appBaseUrl);
    expect(home.alternates?.canonical).toBe("https://preppy.example/");
    expect(home).toMatchObject({
      openGraph: {
        url: "https://preppy.example/",
        siteName: "PREPPY",
        images: [
          {
            url: "https://preppy.example/preppy-social-og.png",
            width: 1200,
            height: 630,
            type: "image/png",
          },
        ],
      },
      twitter: {
        card: "summary_large_image",
        images: [{ url: "https://preppy.example/preppy-social-x.png" }],
      },
    });
    expect(buildInstitutionListMetadata(appBaseUrl, false)).toMatchObject({
      alternates: { canonical: "https://preppy.example/institutions" },
      robots: { index: true, follow: true },
    });
    expect(buildInstitutionListMetadata(appBaseUrl, true)).toMatchObject({
      alternates: { canonical: "https://preppy.example/institutions" },
      robots: { index: false, follow: true },
    });
  });

  it("builds canonical detail metadata from central indexability without query/tracking", () => {
    expect(buildInstitutionMetadata(institution, appBaseUrl)).toMatchObject({
      alternates: {
        canonical: "https://preppy.example/institutions/alpha-school",
      },
      robots: { index: true },
    });
    expect(buildOpportunityMetadata(opportunity, appBaseUrl)).toMatchObject({
      alternates: {
        canonical: "https://preppy.example/opportunities/open-admission",
      },
      robots: { index: true },
    });
    expect(buildArticleMetadata(article, appBaseUrl)).toMatchObject({
      title: "SEO guide",
      description: "SEO description",
      alternates: {
        canonical: "https://preppy.example/articles/complete-guide",
      },
      robots: { index: true, follow: true },
      openGraph: {
        title: "Complete guide",
        images: [
          {
            url: "https://preppy.example/articles/complete-guide/og.png",
            alt: "Complete guide | PREPPY 입학 준비 아티클",
          },
        ],
      },
      twitter: {
        title: "Complete guide",
        images: [
          { url: "https://preppy.example/articles/complete-guide/x.png" },
        ],
      },
    });
  });

  it("always uses the article-title image route, even when a legacy image is unsafe", () => {
    const metadata = buildArticleMetadata(
      {
        ...article,
        featuredImageUrl: "javascript:bad",
        indexability: "NOINDEX",
      },
      appBaseUrl,
    );
    expect(metadata.robots).toMatchObject({ index: false, follow: true });
    expect(metadata.openGraph).toMatchObject({
      images: [
        { url: "https://preppy.example/articles/complete-guide/og.png" },
      ],
    });
    expect(metadata.twitter).toMatchObject({
      images: [{ url: "https://preppy.example/articles/complete-guide/x.png" }],
    });
  });
});
