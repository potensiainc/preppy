import { describe, expect, it } from "vitest";

import { isFollowEpisodeEligibleAt } from "@/src/modules/follow/eligibility";

describe("WP-09 Follow episode eligibility", () => {
  it("includes activation and excludes deactivation boundaries", () => {
    // Mutations caught: strict activation comparison, inclusive deactivation,
    // or ignoring either endpoint of the persisted Episode interval.
    const activatedAt = new Date("2026-08-20T00:00:00.000Z");
    const deactivatedAt = new Date("2026-08-21T00:00:00.000Z");

    const actual = [
      isFollowEpisodeEligibleAt(
        { activatedAt, deactivatedAt },
        new Date("2026-08-19T23:59:59.999Z"),
      ),
      isFollowEpisodeEligibleAt({ activatedAt, deactivatedAt }, activatedAt),
      isFollowEpisodeEligibleAt(
        { activatedAt, deactivatedAt },
        new Date("2026-08-20T23:59:59.999Z"),
      ),
      isFollowEpisodeEligibleAt({ activatedAt, deactivatedAt }, deactivatedAt),
      isFollowEpisodeEligibleAt(
        { activatedAt, deactivatedAt },
        new Date("2026-08-21T00:00:00.001Z"),
      ),
    ];

    expect(actual).toEqual([false, true, true, false, false]);
  });
});
