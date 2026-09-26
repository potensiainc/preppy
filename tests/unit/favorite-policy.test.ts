import { describe, expect, it } from "vitest";
import { isInstitutionFollowable } from "@/src/modules/follow/followability-policy.server";
describe("favorites are independent of delivery readiness", () => {
  it.each([
    "ENGLISH_KINDERGARTEN",
    "PRIVATE_ELEMENTARY",
    "INTERNATIONAL_SCHOOL",
  ] as const)("allows public %s without monitoring", (category) => {
    expect(
      isInstitutionFollowable(
        {
          category,
          publicationState: "PUBLISHED",
          operationalState: "ACTIVE",
          hasIsiIdentity: true,
        },
        false,
      ),
    ).toBe(true);
  });
  it.each(["DRAFT", "HIDDEN", "ARCHIVED"] as const)(
    "rejects %s",
    (publicationState) => {
      expect(
        isInstitutionFollowable(
          {
            category: "ENGLISH_KINDERGARTEN",
            publicationState,
            operationalState: "ACTIVE",
            hasIsiIdentity: false,
          },
          true,
        ),
      ).toBe(false);
    },
  );
  it("retains closed institution and international identity restrictions", () => {
    expect(
      isInstitutionFollowable(
        {
          category: "ENGLISH_KINDERGARTEN",
          publicationState: "PUBLISHED",
          operationalState: "CLOSED",
          hasIsiIdentity: false,
        },
        false,
      ),
    ).toBe(false);
    expect(
      isInstitutionFollowable(
        {
          category: "INTERNATIONAL_SCHOOL",
          publicationState: "PUBLISHED",
          operationalState: "ACTIVE",
          hasIsiIdentity: false,
        },
        true,
      ),
    ).toBe(false);
  });
});
