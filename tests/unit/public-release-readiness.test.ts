import { describe, expect, it } from "vitest";
import {
  auditSource,
  inspectHtml,
} from "../../scripts/audit-public-release.mjs";

describe("public release readiness", () => {
  it("rejects development labels in all public UI source strings and static data", async () => {
    const result = await auditSource();
    expect(result.filesScanned).toBeGreaterThan(50);
    expect(result.findings).toEqual([]);
  });
  it("checks hidden dialogs, accessibility names and metadata, not code comments", () => {
    expect(
      inspectHtml(
        '<dialog hidden>MOCKUP</dialog><button aria-label="목업 안내"></button><meta name="description" content="PUBLIC DESIGN PREVIEW">',
      ).markers,
    ).toHaveLength(3);
    expect(
      inspectHtml(
        '<!-- TODO --><script>const x="MOCKUP"</script><p>공식 확인 전 자료예요. 학교에 확인해 주세요.</p>',
      ).markers,
    ).toEqual([]);
  });
  it("identifies empty navigation without rejecting legitimate fragment navigation", () => {
    expect(
      inspectHtml(
        '<a href="#">blank</a><a href="">empty</a><a href="#results">목록으로 이동</a>',
      ).emptyLinks,
    ).toEqual(["blank", "empty"]);
  });
});
