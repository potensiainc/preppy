import { describe, expect, it } from "vitest";

import { parseAnalyticsEvent } from "@/src/analytics/events";
import { toGa4Event } from "@/src/analytics/provider-mapping";

describe("WP-14 GA4 provider mapping", () => {
  it("maps canonical names and allowlisted fields to provider snake_case", () => {
    expect(
      toGa4Event(
        parseAnalyticsEvent("institution_view", {
          institutionId: "00000000-0000-4000-8000-000000000001",
          category: "PRIVATE_ELEMENTARY",
          regionCode: "KR-11",
        }),
      ),
    ).toEqual({
      name: "institution_view",
      params: {
        institution_id: "00000000-0000-4000-8000-000000000001",
        category: "PRIVATE_ELEMENTARY",
        region_code: "KR-11",
      },
    });
  });

  it("omits absent optional fields and never spreads arbitrary properties", () => {
    expect(
      toGa4Event(
        parseAnalyticsEvent("follow_click", {
          institutionId: "00000000-0000-4000-8000-000000000001",
          context: "INSTITUTION",
        }),
      ),
    ).toEqual({
      name: "follow_click",
      params: {
        institution_id: "00000000-0000-4000-8000-000000000001",
        context: "INSTITUTION",
      },
    });
  });
});
