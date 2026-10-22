import { describe, expect, it } from "vitest";

import {
  assertImageBuiltFrom,
  assertStagingVerified,
  parseReleaseArgs,
} from "../../scripts/deploy/railway-release.mjs";

const image = `ghcr.io/potensiainc/preppy@sha256:${"a".repeat(64)}`;

describe("railway image release", () => {
  it("defaults to a dry run for a CI-built digest", () => {
    expect(parseReleaseArgs(["--target", "staging", "--image", image])).toEqual(
      { target: "staging", image, apply: false },
    );
    expect(
      parseReleaseArgs(["--target", "production", "--image", image, "--apply"])
        .apply,
    ).toBe(true);
  });

  it.each([
    ["--target", "preview", "--image", image],
    ["--target", "staging", "--image", "ghcr.io/potensiainc/preppy:latest"],
    [
      "--target",
      "staging",
      "--image",
      `ghcr.io/other/preppy@sha256:${"a".repeat(64)}`,
    ],
    ["--target", "staging"],
  ])(
    "rejects anything but a known target and a pinned digest: %j",
    (...argv) => {
      expect(() => parseReleaseArgs(argv)).toThrow();
    },
  );

  it("promotes to production only what both staging services run healthily", () => {
    const healthy = { image, status: "SUCCESS" };
    expect(() =>
      assertStagingVerified([healthy, healthy], image),
    ).not.toThrow();
    expect(() =>
      assertStagingVerified([healthy, { image, status: "FAILED" }], image),
    ).toThrow("staging");
    expect(() =>
      assertStagingVerified(
        [healthy, { image: image.replace("a", "b"), status: "SUCCESS" }],
        image,
      ),
    ).toThrow("staging");
  });

  it("ships only the image built from the checked-out commit", () => {
    expect(() =>
      assertImageBuiltFrom(image, `sha256:${"a".repeat(64)}`),
    ).not.toThrow();
    expect(() =>
      assertImageBuiltFrom(image, `sha256:${"b".repeat(64)}`),
    ).toThrow("checked-out commit");
  });
});
