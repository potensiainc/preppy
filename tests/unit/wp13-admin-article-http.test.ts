import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { AdminCommandContext } from "@/src/application/context";
import type { AdminCommandRequestDependencies } from "@/src/modules/admin/http/command-handler.server";
import {
  handleAdminArchiveArticleRequest,
  handleAdminChangeArticleSlugRequest,
  handleAdminCreateArticleRequest,
  handleAdminPublishArticleRequest,
  handleAdminSetArticleRelationsRequest,
  handleAdminUnpublishArticleRequest,
  handleAdminUpdateArticleDraftRequest,
} from "@/src/modules/admin/http/article-commands.server";

const appBaseUrl = "https://preppy.example";
const adminUserId = "550e8400-e29b-41d4-a716-446655440000";
const articleId = "550e8400-e29b-41d4-a716-446655440001";
const relationId = "550e8400-e29b-41d4-a716-446655440002";
const expectedUpdatedAt = "2026-08-25T00:00:00.000Z";

function request(body: unknown): Request {
  return new Request(`${appBaseUrl}/api/admin/articles`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: appBaseUrl },
    body: JSON.stringify(body),
  });
}

function pipeline(): AdminCommandRequestDependencies {
  return {
    requireCurrentAdmin: vi.fn(async () => ({
      adminUserId,
      displayName: "Operator",
    })),
    getAppBaseUrl: vi.fn(() => appBaseUrl),
    createContext: vi.fn(
      ({ adminUserId: id, reason }): AdminCommandContext => ({
        adminUserId: id,
        reason,
        occurredAt: new Date("2026-08-25T01:00:00.000Z"),
        correlationId: randomUUID(),
      }),
    ),
    createErrorCorrelationId: randomUUID,
  };
}

const draftCandidate = {
  title: "Admissions guide",
  type: "GUIDE",
  category: "ADMISSIONS_GENERAL",
  excerpt: "A bounded guide",
  contentHtml: "<p>Safe content</p>",
  seoTitle: "Admissions guide",
  seoDescription: "A bounded guide",
  canonicalUrl: null,
  robotsIndex: true,
  robotsFollow: true,
  featuredImageUrl: null,
  featuredImageAlt: null,
} as const;

describe("WP-13 Admin Article HTTP adapters", () => {
  it("delegates all seven endpoints once with path ownership and fixed reasons", async () => {
    const cases = [
      [
        "ARTICLE_CREATED",
        handleAdminCreateArticleRequest,
        undefined,
        {
          slug: "admissions-guide",
          title: "Admissions guide",
          type: "GUIDE",
          category: "ADMISSIONS_GENERAL",
        },
        "createArticleDraft",
        {
          slug: "admissions-guide",
          title: "Admissions guide",
          type: "GUIDE",
          category: "ADMISSIONS_GENERAL",
        },
      ],
      [
        "ARTICLE_DRAFT_UPDATED",
        handleAdminUpdateArticleDraftRequest,
        { articleId },
        { expectedUpdatedAt, candidate: draftCandidate },
        "updateArticleDraft",
        { articleId, expectedUpdatedAt, candidate: draftCandidate },
      ],
      [
        "ARTICLE_RELATIONS_UPDATED",
        handleAdminSetArticleRelationsRequest,
        { articleId },
        { expectedUpdatedAt, institutionIds: [relationId], opportunityIds: [] },
        "setArticleRelations",
        {
          articleId,
          expectedUpdatedAt,
          institutionIds: [relationId],
          opportunityIds: [],
        },
      ],
      [
        "ARTICLE_PUBLISHED",
        handleAdminPublishArticleRequest,
        { articleId },
        {
          expectedUpdatedAt,
          candidate: {
            ...draftCandidate,
            institutionIds: [],
            opportunityIds: [relationId],
          },
        },
        "publishArticle",
        {
          articleId,
          expectedUpdatedAt,
          candidate: {
            ...draftCandidate,
            institutionIds: [],
            opportunityIds: [relationId],
          },
        },
      ],
      [
        "ARTICLE_UNPUBLISHED",
        handleAdminUnpublishArticleRequest,
        { articleId },
        { expectedUpdatedAt },
        "unpublishArticle",
        { articleId, expectedUpdatedAt },
      ],
      [
        "ARTICLE_ARCHIVED",
        handleAdminArchiveArticleRequest,
        { articleId },
        { expectedUpdatedAt },
        "archiveArticle",
        { articleId, expectedUpdatedAt },
      ],
      [
        "ARTICLE_SLUG_CHANGED",
        handleAdminChangeArticleSlugRequest,
        { articleId },
        { expectedUpdatedAt, newSlug: "new-guide" },
        "changeArticleSlug",
        { articleId, expectedUpdatedAt, newSlug: "new-guide" },
      ],
    ] as const;

    for (const [
      reason,
      handler,
      path,
      body,
      commandName,
      expectedInput,
    ] of cases) {
      const command = vi.fn(
        async (context: AdminCommandContext, input: unknown) => {
          void context;
          void input;
          return {
            articleId,
            status: "DRAFT" as const,
            updatedAt: expectedUpdatedAt,
          };
        },
      );
      const dependencies = { ...pipeline(), [commandName]: command };
      const response =
        path === undefined
          ? await handleAdminCreateArticleRequest(request(body), dependencies)
          : await handler(request(body), path, dependencies);
      expect(response.status, reason).toBe(200);
      expect(command, reason).toHaveBeenCalledTimes(1);
      expect(command.mock.calls[0]?.[0]).toMatchObject({ reason });
      expect(command.mock.calls[0]?.[1]).toEqual(expectedInput);
    }
  });

  it("rejects client-owned policy/lifecycle/path fields and unknown keys", async () => {
    for (const injected of [
      { articleId },
      { authorAdminId: adminUserId },
      { status: "PUBLISHED" },
      { publishedAt: expectedUpdatedAt },
      { contentFingerprint: "secret" },
      { reason: "CLIENT_REASON" },
      { eventType: "CACHE_REVALIDATION_REQUESTED" },
      { currentCanonicalPath: "/articles/evil" },
      { tags: ["evil"] },
    ]) {
      const command = vi.fn();
      const response = await handleAdminUnpublishArticleRequest(
        request({ expectedUpdatedAt, ...injected }),
        { articleId },
        { ...pipeline(), unpublishArticle: command },
      );
      expect(response.status, JSON.stringify(injected)).toBe(400);
      expect(command).not.toHaveBeenCalled();
    }
  });

  it("uses the 192 KiB/128 KiB Article parser profile only on Article adapters", async () => {
    for (const size of [127 * 1024, 128 * 1024]) {
      const command = vi.fn(
        async (context: AdminCommandContext, input: unknown) => {
          void context;
          void input;
          return {
            articleId,
            status: "DRAFT" as const,
            updatedAt: expectedUpdatedAt,
          };
        },
      );
      const response = await handleAdminUpdateArticleDraftRequest(
        request({
          expectedUpdatedAt,
          candidate: { ...draftCandidate, contentHtml: "x".repeat(size) },
        }),
        { articleId },
        { ...pipeline(), updateArticleDraft: command },
      );
      expect(response.status, String(size)).toBe(200);
      expect(command).toHaveBeenCalledTimes(1);
    }

    const command = vi.fn();
    const response = await handleAdminUpdateArticleDraftRequest(
      request({
        expectedUpdatedAt,
        candidate: {
          ...draftCandidate,
          contentHtml: "x".repeat(128 * 1024 + 1),
        },
      }),
      { articleId },
      { ...pipeline(), updateArticleDraft: command },
    );
    expect(response.status).toBe(400);
    expect(command).not.toHaveBeenCalled();
  });
});
