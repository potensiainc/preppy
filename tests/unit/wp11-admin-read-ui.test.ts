import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

async function importReadInput() {
  try {
    return await vi.importActual<
      typeof import("@/src/modules/admin/read-model/input")
    >("@/src/modules/admin/read-model/input");
  } catch {
    return null;
  }
}

describe("WP-11 Admin read input boundaries", () => {
  it("strictly parses bounded catalog pagination and allowlisted filters", async () => {
    // Mutation caught: a catalog accepts unknown/array-shaped URL fields or permits an unbounded page.
    const input = await importReadInput();
    expect(input).not.toBeNull();
    if (!input) return;

    expect(
      input.parseInstitutionAdminListInput({
        category: "INTERNATIONAL_SCHOOL",
        publicationState: "PUBLISHED",
        operationalState: "ACTIVE",
        query: "  Seoul   Academy  ",
        page: "2",
        pageSize: "50",
      }),
    ).toEqual({
      category: "INTERNATIONAL_SCHOOL",
      publicationState: "PUBLISHED",
      operationalState: "ACTIVE",
      query: "Seoul Academy",
      page: 2,
      pageSize: 50,
    });
    expect(input.parseOpportunityAdminListInput({})).toEqual({
      page: 1,
      pageSize: 20,
    });
    expect(input.parseSourceAdminListInput({})).toEqual({
      page: 1,
      pageSize: 20,
    });
    expect(input.parseArticleAdminListInput({})).toEqual({
      page: 1,
      pageSize: 20,
    });
    expect(input.parseNotificationAdminListInput({})).toEqual({
      page: 1,
      pageSize: 20,
    });
    expect(input.parseUserAdminListInput({})).toEqual({
      page: 1,
      pageSize: 20,
    });

    for (const invalid of [
      { pageSize: "51" },
      { page: "10001" },
      { page: "0" },
      { page: ["1", "2"] },
      { unexpected: "field" },
    ]) {
      expect(() => input.parseInstitutionAdminListInput(invalid)).toThrowError(
        expect.objectContaining({ code: "VALIDATION_ERROR" }),
      );
    }
  });

  it("uses distinct strict filters and validates canonical detail IDs", async () => {
    // Mutation caught: one broad pass-through schema admits a filter belonging to another catalog or a malformed route ID.
    const input = await importReadInput();
    expect(input).not.toBeNull();
    if (!input) return;

    expect(
      input.parseOpportunityAdminListInput({
        institutionId: "cc24e723-2eaa-4ce3-91a2-3646aaf1ef89",
        kind: "APPLICATION",
        truthMode: "NATIVE",
        publicationState: "DRAFT",
        businessState: "OPEN",
      }),
    ).toMatchObject({
      institutionId: "cc24e723-2eaa-4ce3-91a2-3646aaf1ef89",
      kind: "APPLICATION",
      truthMode: "NATIVE",
      publicationState: "DRAFT",
      businessState: "OPEN",
    });
    expect(
      input.parseSourceAdminListInput({
        sourceType: "OFFICIAL_ADMISSION_PAGE",
        authorityLevel: "PRIMARY",
        lifecycleStatus: "PAUSED",
      }),
    ).toMatchObject({
      sourceType: "OFFICIAL_ADMISSION_PAGE",
      authorityLevel: "PRIMARY",
      lifecycleStatus: "PAUSED",
    });
    expect(
      input.parseArticleAdminListInput({ type: "GUIDE", status: "DRAFT" }),
    ).toMatchObject({ type: "GUIDE", status: "DRAFT" });
    expect(
      input.parseNotificationAdminListInput({
        status: "READY",
        signalType: "OPPORTUNITY_CHANGED",
      }),
    ).toMatchObject({
      status: "READY",
      signalType: "OPPORTUNITY_CHANGED",
    });
    expect(
      input.parseUserAdminListInput({
        status: "ACTIVE",
        emailReadiness: "READY",
      }),
    ).toMatchObject({ status: "ACTIVE", emailReadiness: "READY" });

    const id = "cc24e723-2eaa-4ce3-91a2-3646aaf1ef89";
    expect(input.parseAdminDetailInput({ id })).toEqual({ id });
    expect(() => input.parseAdminDetailInput({ id: "not-a-uuid" })).toThrow();
    expect(() => input.parseAdminDetailInput({ id, extra: "no" })).toThrow();
    expect(() =>
      input.parseArticleAdminListInput({ lifecycleStatus: "ACTIVE" }),
    ).toThrow();
  });
});

async function importReadPages() {
  try {
    return await Promise.all([
      vi.importActual<typeof import("@/app/admin/(protected)/page")>(
        "@/app/admin/(protected)/page",
      ),
      vi.importActual<
        typeof import("@/app/admin/(protected)/institutions/page")
      >("@/app/admin/(protected)/institutions/page"),
      vi.importActual<
        typeof import("@/app/admin/(protected)/opportunities/page")
      >("@/app/admin/(protected)/opportunities/page"),
      vi.importActual<typeof import("@/app/admin/(protected)/sources/page")>(
        "@/app/admin/(protected)/sources/page",
      ),
      vi.importActual<typeof import("@/app/admin/(protected)/articles/page")>(
        "@/app/admin/(protected)/articles/page",
      ),
      vi.importActual<
        typeof import("@/app/admin/(protected)/notifications/page")
      >("@/app/admin/(protected)/notifications/page"),
      vi.importActual<typeof import("@/app/admin/(protected)/users/page")>(
        "@/app/admin/(protected)/users/page",
      ),
    ] as const);
  } catch {
    return null;
  }
}

async function importDetailPages() {
  try {
    return await Promise.all([
      vi.importActual<
        typeof import("@/app/admin/(protected)/institutions/[id]/page")
      >("@/app/admin/(protected)/institutions/[id]/page"),
      vi.importActual<
        typeof import("@/app/admin/(protected)/opportunities/[id]/page")
      >("@/app/admin/(protected)/opportunities/[id]/page"),
      vi.importActual<
        typeof import("@/app/admin/(protected)/sources/[id]/page")
      >("@/app/admin/(protected)/sources/[id]/page"),
    ] as const);
  } catch {
    return null;
  }
}

const pagination = { page: 1, pageSize: 20, total: 1, hasNext: false };
const institution = {
  id: "cc24e723-2eaa-4ce3-91a2-3646aaf1ef89",
  slug: "seoul-academy",
  displayName: "Seoul Academy",
  category: "INTERNATIONAL_SCHOOL" as const,
  operationalState: "ACTIVE" as const,
  publicationState: "PUBLISHED" as const,
  activeSourceBindingCount: 1,
  opportunitySummary: {
    total: 1,
    items: [
      {
        id: "a9fe13f7-ad24-4f47-aeca-18b170179450",
        slug: "seoul-applications",
        kind: "APPLICATION" as const,
        truthMode: "NATIVE" as const,
        publicationState: "DRAFT" as const,
        title: "2027 Applications",
        businessState: "OPEN" as const,
        verifiedAt: "2026-08-24T00:00:00.000Z",
      },
    ],
  },
};
const change = {
  id: "a1252341-9152-462e-b0de-9c956992a595",
  changeType: "STATUS_CHANGED" as const,
  materiality: "NOTIFIABLE" as const,
  summary: "Applications opened",
  verifiedAt: "2026-08-24T00:00:00.000Z",
  publishedAt: "2026-08-24T00:00:00.000Z",
};
const opportunity = {
  id: institution.opportunitySummary.items[0].id,
  slug: institution.opportunitySummary.items[0].slug,
  kind: "APPLICATION" as const,
  truthMode: "NATIVE" as const,
  publicationState: "DRAFT" as const,
  institution: { id: institution.id, displayName: institution.displayName },
  currentVersion: {
    id: "ae02365c-9318-4afa-8fc0-d2a61fea3d08",
    versionNumber: 2,
    verificationState: "VERIFIED" as const,
    businessState: "OPEN" as const,
    title: "2027 Applications",
    verifiedAt: "2026-08-24T00:00:00.000Z",
  },
  activeSourceBindingCount: 1,
  recentChange: change,
};
const safeSource = {
  id: "e77be50a-f834-4be6-8cc6-1da7a1a7c2c0",
  sourceName: "Official admissions",
  canonicalUrl: "https://official.example.test/admissions",
  safeUrl: "https://official.example.test/admissions",
  sourceType: "OFFICIAL_ADMISSION_PAGE",
  authorityLevel: "PRIMARY",
  lifecycleStatus: "ACTIVE",
  monitorConfig: {
    collectionStrategy: "HTTP",
    monitoringProfile: "CRITICAL_SEASONAL",
    customIntervalMinutes: 60,
    seasonalEnabled: true,
    browserRequired: false,
    maxAttempts: 3,
    isEnabled: true,
  },
  activeInstitutionBindingCount: 1,
  activeOpportunityBindingCount: 1,
  latestObservation: {
    id: "84",
    observedAt: "2026-08-24T00:00:00.000Z",
    outcome: "UNCHANGED",
    httpStatus: 200,
    durationMs: 120,
    errorCode: null,
  },
};

describe("WP-11 Admin read-only pages", () => {
  it("renders real Dashboard values and accessible catalog tables without write controls", async () => {
    // Mutation caught: the pending skeleton returns, catalogs lose semantic tables, or inspection pages gain mutation controls.
    const pages = await importReadPages();
    expect(pages).not.toBeNull();
    if (!pages) return;
    const [
      dashboardPage,
      institutionPage,
      opportunityPage,
      sourcePage,
      articlePage,
      notificationPage,
      userPage,
    ] = pages;

    const markups = [
      renderToStaticMarkup(
        createElement(dashboardPage.AdminDashboardView, {
          data: {
            monitoring: { due: 3, overdue: 2 },
            recentVerifiedChanges: { count: 1, items: [change] },
            unavailableSources: 4,
            outbox: { pending: 5, deadLetter: 1 },
          },
        }),
      ),
      renderToStaticMarkup(
        createElement(institutionPage.AdminInstitutionListView, {
          data: { items: [institution], pagination },
        }),
      ),
      renderToStaticMarkup(
        createElement(opportunityPage.AdminOpportunityListView, {
          data: { items: [opportunity], pagination },
        }),
      ),
      renderToStaticMarkup(
        createElement(sourcePage.AdminSourceListView, {
          data: { items: [safeSource], pagination },
        }),
      ),
      renderToStaticMarkup(
        createElement(articlePage.AdminArticleListView, {
          data: {
            items: [
              {
                id: "f0465ed5-39f1-433d-814b-9483f104218d",
                slug: "calm-guide",
                title: "A calm guide",
                type: "GUIDE",
                category: "ADMISSIONS_GENERAL",
                status: "DRAFT",
                publishedAt: null,
                institutionRelationCount: 1,
                opportunityRelationCount: 1,
              },
            ],
            pagination,
          },
        }),
      ),
      renderToStaticMarkup(
        createElement(notificationPage.AdminNotificationListView, {
          data: {
            items: [
              {
                id: "33372f80-7823-4d8f-b6a3-92508426166a",
                status: "READY",
                signalType: "OPPORTUNITY_CHANGED",
                opportunityId: opportunity.id,
                opportunityChangeId: change.id,
                signalPublishedAt: "2026-08-24T00:00:00.000Z",
                deliveryCount: 8,
                attemptCount: 2,
              },
            ],
            pagination,
          },
        }),
      ),
      renderToStaticMarkup(
        createElement(userPage.AdminUserListView, {
          data: {
            items: [
              {
                id: "01110786-46b0-4bc4-b5fb-6262e2a2a0a6",
                status: "ACTIVE",
                createdAt: "2026-08-24T00:00:00.000Z",
                followCount: 2,
                emailReadiness: "READY",
              },
            ],
            pagination,
          },
        }),
      ),
    ];

    expect(markups[0]).toContain("Operations overview");
    expect(markups[0]).not.toContain("Read projections pending");
    expect(markups[0]).toMatch(/Due[\s\S]*3/);
    for (const markup of markups.slice(1)) {
      expect(markup).toContain("<table");
      expect(markup).toContain("<caption");
      expect(markup).toContain('scope="col"');
      expect(markup).toContain('scope="row"');
    }
    const combined = markups.join("\n");
    expect(combined).not.toMatch(
      /Edit article|Publish article|Delete user|Retry notification|Cancel notification/,
    );
    expect(combined).not.toContain("@example.test");
  });

  it("renders safe Source links and non-link unsafe URLs in list, detail, and explicit empty states", async () => {
    // Mutation caught: an unsafe stored scheme reaches href, external links lose isolation, or empty datasets render an empty table.
    const pages = await importReadPages();
    const details = await importDetailPages();
    expect(pages).not.toBeNull();
    expect(details).not.toBeNull();
    if (!pages || !details) return;
    const sourcePage = pages[3];
    const [institutionDetail, opportunityDetail, sourceDetail] = details;
    const unsafeSource = {
      ...safeSource,
      id: "7dfef676-79de-4e75-9101-171f5031c039",
      canonicalUrl: "javascript:alert(1)",
      safeUrl: null,
    };
    const sourceMarkup = renderToStaticMarkup(
      createElement(sourcePage.AdminSourceListView, {
        data: {
          items: [safeSource, unsafeSource],
          pagination: { ...pagination, total: 2 },
        },
      }),
    );
    expect(sourceMarkup).toContain('target="_blank"');
    expect(sourceMarkup).toContain('rel="noopener noreferrer"');
    expect(sourceMarkup).toContain("javascript:alert(1)");
    expect(sourceMarkup).not.toContain('href="javascript:');

    for (const markup of [
      renderToStaticMarkup(
        createElement(institutionDetail.AdminInstitutionDetailView, {
          data: institution,
        }),
      ),
      renderToStaticMarkup(
        createElement(opportunityDetail.AdminOpportunityDetailView, {
          data: opportunity,
        }),
      ),
      renderToStaticMarkup(
        createElement(sourceDetail.AdminSourceDetailView, { data: safeSource }),
      ),
    ]) {
      expect(markup).toContain("<table");
      expect(markup).toContain('scope="row"');
    }
    expect(
      renderToStaticMarkup(
        createElement(pages[1].AdminInstitutionListView, {
          data: { items: [], pagination: { ...pagination, total: 0 } },
        }),
      ),
    ).toContain('role="status"');
  });
});
