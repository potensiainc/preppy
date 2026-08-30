import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  PRIVATE_ELEMENTARY_BOOTSTRAP_ACKNOWLEDGEMENT,
  PrivateElementaryBootstrapError,
  assertPrivateElementaryBootstrapEnvironment,
  loadPrivateElementaryBootstrapTargets,
  parsePrivateElementaryBootstrapCliArgs,
} from "@/src/modules/institution-detail-bootstrap/contracts";

const seedPath = resolve(
  "data/seeds/preppy/preppy_seed_institutions_seoul_gyeonggi_v1.json",
);

describe("private elementary bootstrap scope", () => {
  it("loads the exact checksum-bound 41-school private elementary allowlist", async () => {
    const loaded = await loadPrivateElementaryBootstrapTargets(seedPath);

    expect(loaded.targets).toHaveLength(41);
    expect(new Set(loaded.targets.map((target) => target.slug)).size).toBe(41);
    expect(
      loaded.targets.every(
        (target) =>
          target.category === "PRIVATE_ELEMENTARY" &&
          target.registryName === "SCHOOLINFO" &&
          target.websiteUrl.startsWith("http") &&
          target.registryUrl.startsWith("https://www.schoolinfo.go.kr/"),
      ),
    ).toBe(true);
    expect(
      loaded.targets.filter((target) => target.institutionId === null),
    ).toHaveLength(6);
    expect(
      loaded.targets.filter((target) => target.institutionId !== null),
    ).toHaveLength(35);
    expect(loaded.targets.map((target) => target.slug)).toContain("kyonggi");
    expect(loaded.targets.map((target) => target.slug)).not.toContain(
      "kis-seoul",
    );
    expect(loaded.seedSha256).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("private elementary bootstrap CLI", () => {
  it("defaults to a full dry-run", () => {
    expect(parsePrivateElementaryBootstrapCliArgs([])).toEqual({
      mode: "dry-run",
      slug: null,
      work: "both",
      production: false,
      acknowledgement: null,
    });
  });

  it("supports a bounded slug and one work mode", () => {
    expect(
      parsePrivateElementaryBootstrapCliArgs([
        "--slug=kyonggi",
        "--facts-only",
        "--dry-run",
      ]),
    ).toMatchObject({
      mode: "dry-run",
      slug: "kyonggi",
      work: "facts",
    });
    expect(
      parsePrivateElementaryBootstrapCliArgs([
        "--slug",
        "kyonggi",
        "--admissions-only",
      ]),
    ).toMatchObject({ slug: "kyonggi", work: "admissions" });
  });

  it("rejects conflicting modes and unknown arguments", () => {
    expect(() =>
      parsePrivateElementaryBootstrapCliArgs(["--dry-run", "--apply"]),
    ).toThrow(PrivateElementaryBootstrapError);
    expect(() =>
      parsePrivateElementaryBootstrapCliArgs([
        "--facts-only",
        "--admissions-only",
      ]),
    ).toThrow(PrivateElementaryBootstrapError);
    expect(() =>
      parsePrivateElementaryBootstrapCliArgs(["--surprise"]),
    ).toThrow(PrivateElementaryBootstrapError);
  });

  it("requires the exact explicit guard for Production apply", () => {
    const options = parsePrivateElementaryBootstrapCliArgs([
      "--apply",
      "--production",
      `--acknowledge-production-write=${PRIVATE_ELEMENTARY_BOOTSTRAP_ACKNOWLEDGEMENT}`,
    ]);
    expect(() =>
      assertPrivateElementaryBootstrapEnvironment(options, {
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://operator:secret@database.internal/preppy",
      }),
    ).not.toThrow();

    for (const arguments_ of [
      ["--apply"],
      ["--apply", "--production"],
      ["--apply", "--production", "--acknowledge-production-write=WRONG"],
    ]) {
      const rejected = parsePrivateElementaryBootstrapCliArgs(arguments_);
      expect(() =>
        assertPrivateElementaryBootstrapEnvironment(rejected, {
          NODE_ENV: "production",
          DATABASE_URL: "postgresql://operator:secret@database.internal/preppy",
        }),
      ).toThrow(PrivateElementaryBootstrapError);
    }
  });

  it("allows dry-run without Production write acknowledgement", () => {
    expect(() =>
      assertPrivateElementaryBootstrapEnvironment(
        parsePrivateElementaryBootstrapCliArgs(["--dry-run"]),
        {
          NODE_ENV: "production",
          DATABASE_URL: "postgresql://operator:secret@database.internal/preppy",
        },
      ),
    ).not.toThrow();
  });
});
