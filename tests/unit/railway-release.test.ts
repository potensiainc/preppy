import { describe, expect, it } from "vitest";

import {
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

  it("promotes to production only what staging serves healthily", () => {
    expect(() =>
      assertStagingVerified({ image, status: "SUCCESS" }, image),
    ).not.toThrow();
    expect(() =>
      assertStagingVerified({ image, status: "FAILED" }, image),
    ).toThrow("staging");
    expect(() =>
      assertStagingVerified(
        { image: image.replace("a", "b"), status: "SUCCESS" },
        image,
      ),
    ).toThrow("staging");
  });
});
