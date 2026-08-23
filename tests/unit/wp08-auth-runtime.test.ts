import { describe, expect, it, vi } from "vitest";

import { resolveCanonicalCompletionInstitutionPath } from "@/src/modules/auth/runtime.server";

const institutionId = "550e8400-e29b-41d4-a716-446655440000";

describe("WP-08 completion Institution resolver", () => {
  it("returns only a currently published non-closed canonical Institution path", async () => {
    // Mutation caught: redirecting completion to a draft/closed target or a caller-provided return path.
    const findInstitution = vi
      .fn()
      .mockResolvedValueOnce({
        id: institutionId,
        slug: "seoul-international-school",
        displayName: "서울국제학교",
        category: "INTERNATIONAL_SCHOOL",
        regionCode: "KR-11",
        publicationState: "PUBLISHED",
        operationalState: "ACTIVE",
      })
      .mockResolvedValueOnce({
        id: institutionId,
        slug: "draft-school",
        displayName: "Draft School",
        category: "INTERNATIONAL_SCHOOL",
        regionCode: "KR-11",
        publicationState: "DRAFT",
        operationalState: "ACTIVE",
      })
      .mockResolvedValueOnce({
        id: institutionId,
        slug: "closed-school",
        displayName: "Closed School",
        category: "INTERNATIONAL_SCHOOL",
        regionCode: "KR-11",
        publicationState: "PUBLISHED",
        operationalState: "CLOSED",
      })
      .mockResolvedValueOnce(null);

    await expect(
      resolveCanonicalCompletionInstitutionPath(
        institutionId,
        findInstitution,
        async () => true,
      ),
    ).resolves.toBe("/institutions/seoul-international-school");
    for (let index = 0; index < 3; index += 1) {
      await expect(
        resolveCanonicalCompletionInstitutionPath(
          institutionId,
          findInstitution,
          async () => true,
        ),
      ).resolves.toBeNull();
    }
  });
});
