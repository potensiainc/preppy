import { describe, it, expect } from "vitest";
import { reviewedSourceEligibility } from "@/src/modules/english-kindergarten/reviewed-source-policy";
describe("reviewed session-only source eligibility", () => {
  const official = {
    sourceType: "OFFICIAL_SCHOOL_PAGE",
    authorityLevel: "PRIMARY",
  };
  it.each(["ACTIVE", "DISCOVERED"])(
    "accepts official %s without rewriting lifecycle",
    (lifecycleStatus) => {
      const source = { ...official, lifecycleStatus };
      expect(reviewedSourceEligibility(source)).toBeNull();
      expect(source.lifecycleStatus).toBe(lifecycleStatus);
    },
  );
  it.each(["PAUSED", "RETIRED", "BLOCKED", "UNKNOWN", ""])(
    "rejects %s",
    (lifecycleStatus) => {
      expect(reviewedSourceEligibility({ ...official, lifecycleStatus })).toBe(
        "SOURCE_LIFECYCLE_NOT_ALLOWED",
      );
    },
  );
  it.each(["ACTIVE", "DISCOVERED"])(
    "retains official authority checks for %s",
    (lifecycleStatus) => {
      expect(
        reviewedSourceEligibility({
          ...official,
          lifecycleStatus,
          sourceType: "THIRD_PARTY_DISCOVERY",
        }),
      ).toBe("SOURCE_OFFICIAL_AUTHORITY_REQUIRED");
      expect(
        reviewedSourceEligibility({
          ...official,
          lifecycleStatus,
          authorityLevel: "DISCOVERY_ONLY",
        }),
      ).toBe("SOURCE_OFFICIAL_AUTHORITY_REQUIRED");
    },
  );
});
