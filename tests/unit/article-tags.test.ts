import { describe, expect, it } from "vitest";

import {
  articleTagPath,
  normalizeArticleTag,
  normalizeArticleTags,
  parseArticleTagInput,
} from "@/src/modules/editorial/tags";
import { parseArticleDraftCandidate as parseArticleDraftCandidateForTest } from "@/src/modules/editorial/contracts";

describe("Article tags", () => {
  it("normalizes spacing, leading hashes and Unicode form", () => {
    expect(normalizeArticleTag("  #강남   영유 ")).toBe("강남 영유");
    expect(normalizeArticleTag("2027 사립초")).toBe("2027 사립초");
    expect(normalizeArticleTag("IB·AP")).toBe("IB·AP");
  });

  it("rejects URL syntax, empty and over-long tags", () => {
    for (const bad of [
      "",
      "#",
      "a/b",
      "a?b",
      "<script>",
      "%20",
      "가".repeat(31),
    ])
      expect(normalizeArticleTag(bad)).toBeNull();
  });

  it("parses comma, newline and hash separated input and de-duplicates", () => {
    expect(
      normalizeArticleTags(
        parseArticleTagInput(
          "강남 영유, 추가모집\n#레벨테스트 #추가모집, IB, ib",
        ),
      ),
    ).toEqual(["강남 영유", "추가모집", "레벨테스트", "IB"]);
  });

  it("builds percent-encoded tag hub paths", () => {
    expect(articleTagPath("강남 영유")).toBe(
      "/articles/tag/%EA%B0%95%EB%82%A8%20%EC%98%81%EC%9C%A0",
    );
  });

  it("accepts at most ten normalized tags in the Article candidate", () => {
    const base = {
      title: "t",
      type: "GUIDE",
      category: "ADMISSIONS_GENERAL",
      excerpt: null,
      contentHtml: "<p>x</p>",
      seoTitle: null,
      seoDescription: null,
      canonicalUrl: null,
      robotsIndex: true,
      robotsFollow: true,
      featuredImageUrl: null,
      featuredImageAlt: null,
    };
    expect(parseArticleDraftCandidateForTest(base).tags).toEqual([]);
    expect(
      parseArticleDraftCandidateForTest({ ...base, tags: [" #영유 ", "영유"] })
        .tags,
    ).toEqual(["영유"]);
    expect(() =>
      parseArticleDraftCandidateForTest({
        ...base,
        tags: Array.from({ length: 11 }, (_, i) => `태그${i}`),
      }),
    ).toThrow();
    expect(() =>
      parseArticleDraftCandidateForTest({ ...base, tags: ["a/b"] }),
    ).toThrow();
  });
});
