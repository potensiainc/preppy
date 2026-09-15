import { describe, expect, it } from "vitest";

import { isInternationalSchoolPubliclyEligible } from "@/src/modules/public/international-school-publication-policy";

describe("international school public eligibility", () => {
  it.each([
    ["PUBLISHED", "ACTIVE", true, true],
    ["PUBLISHED", "ACTIVE", false, false],
    ["PUBLISHED", "UNKNOWN", true, false],
    ["PUBLISHED", "INACTIVE", true, false],
    ["PUBLISHED", "CLOSED", true, false],
    ["DRAFT", "ACTIVE", true, false],
  ] as const)(
    "requires PUBLISHED + ACTIVE + ISI for international schools (%s, %s, %s)",
    (publicationState, operationalState, hasIsiIdentity, expected) => {
      expect(
        isInternationalSchoolPubliclyEligible({
          category: "INTERNATIONAL_SCHOOL",
          publicationState,
          operationalState,
          hasIsiIdentity,
        }),
      ).toBe(expected);
    },
  );

  it.each(["PRIVATE_ELEMENTARY", "ENGLISH_KINDERGARTEN"] as const)(
    "preserves existing publication eligibility for %s",
    (category) => {
      expect(
        isInternationalSchoolPubliclyEligible({
          category,
          publicationState: "PUBLISHED",
          operationalState: "UNKNOWN",
          hasIsiIdentity: false,
        }),
      ).toBe(true);
      expect(
        isInternationalSchoolPubliclyEligible({
          category,
          publicationState: "DRAFT",
          operationalState: "ACTIVE",
          hasIsiIdentity: false,
        }),
      ).toBe(false);
    },
  );
});
