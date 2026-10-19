import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sessionPackageSchema } from "@/src/modules/english-kindergarten/session-package";

// The corporate notice is one canonical source, shared by distinct campuses.
// A campus-specific name would leak onto every other campus detail page.
describe("reviewed SLP shared corporate notice", () => {
  it("uses the official nationwide title for every source key and campus reference", () => {
    const data = sessionPackageSchema.parse(
      JSON.parse(
        readFileSync(
          "data/review/english-kindergarten-20261018/session-registration-package.json",
          "utf8",
        ),
      ),
    );
    const shared = data.sources.filter(
      (source) =>
        source.url ===
        "https://slp.ac.kr/brandstory/news/board/499?category=notice_event_press",
    );
    expect(shared).toHaveLength(16);
    expect(new Set(shared.map((source) => source.name))).toEqual(
      new Set(["2027년 전국 SLP 유치부 신입생 설명회(상담) 일정 안내"]),
    );
    const keys = new Set(shared.map((source) => source.key));
    const campuses = data.campuses.filter((campus) =>
      campus.identityEvidenceKeys.some((key) => keys.has(key)),
    );
    expect(campuses).toHaveLength(15);
    expect(
      new Set(campuses.map((campus) => campus.officialCampusId!.value)).size,
    ).toBe(15);
    for (const campus of campuses) {
      const identityEvidence = shared.find((source) =>
        campus.identityEvidenceKeys.includes(source.key),
      );
      expect(identityEvidence, campus.slug).toBeDefined();
      expect(
        JSON.parse(identityEvidence!.normalizedText).reviewedIdentityExtract
          .officialCampusId,
      ).toEqual(campus.officialCampusId);
    }
  });
});
