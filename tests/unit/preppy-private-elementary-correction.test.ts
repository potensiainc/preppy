import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  loadPrivateElementaryBootstrapTargets,
  PRIVATE_ELEMENTARY_SEED_PATH,
} from "@/src/modules/institution-detail-bootstrap/contracts";
import * as correction from "@/src/modules/institution-detail-bootstrap/correction.server";
import {
  assertCorrectionEnvironment,
  parseCorrectionCliArgs,
} from "@/src/modules/institution-detail-bootstrap/correction-cli.server";
import {
  correctionFixture,
  correctionTestTime,
  hashText,
} from "@/tests/support/private-elementary-correction";

let loaded: Awaited<ReturnType<typeof loadPrivateElementaryBootstrapTargets>>;
beforeAll(async () => {
  const seed = await loadPrivateElementaryBootstrapTargets(
    resolve(PRIVATE_ELEMENTARY_SEED_PATH),
  );
  loaded = {
    ...seed,
    targets: seed.targets.map((t) => ({
      ...t,
      institutionId: t.institutionId ?? randomUUID(),
    })),
  };
});

describe("correction production CLI boundary", () => {
  const args = [
    "--artifact",
    "reviewed.json",
    "--apply",
    "--production",
    "--expected-artifact-checksum",
    "a".repeat(64),
    "--acknowledge-production-write=PREPPY-41-SCHOOL-2026-BOOTSTRAP",
  ];
  const env = {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://test:test@postgres.railway.internal/preppy",
    RAILWAY_SERVICE_NAME: "preppy-web",
    RAILWAY_ENVIRONMENT_NAME: "production",
    RAILWAY_SERVICE_ID: "service",
    RAILWAY_ENVIRONMENT_ID: "environment",
  };
  it("accepts only deployed /app execution and rejects local production credentials", () => {
    const options = parseCorrectionCliArgs(args);
    expect(() =>
      assertCorrectionEnvironment(options, env, "/app"),
    ).not.toThrow();
    expect(() =>
      assertCorrectionEnvironment(options, env, "D:/potensia/preppy"),
    ).toThrow();
    expect(() =>
      assertCorrectionEnvironment(
        options,
        {
          ...env,
          DATABASE_URL: "postgresql://test:test@public.proxy.rlwy.net/preppy",
        },
        "/app",
      ),
    ).toThrow();
    expect(() =>
      assertCorrectionEnvironment(
        options,
        { ...env, RAILWAY_SERVICE_NAME: "worker" },
        "/app",
      ),
    ).toThrow();
  });
  it("requires an approved checksum and explicit apply, rejects ambiguous flags", () => {
    expect(() =>
      parseCorrectionCliArgs(["--artifact", "reviewed.json"]),
    ).toThrow();
    expect(() => parseCorrectionCliArgs([...args, "--dry-run"])).toThrow();
    expect(() => parseCorrectionCliArgs([...args, "--production"])).toThrow();
    expect(() =>
      assertCorrectionEnvironment(
        parseCorrectionCliArgs([
          "--artifact",
          "reviewed.json",
          "--apply",
          "--production",
        ]),
        env,
        "/app",
      ),
    ).toThrow();
  });
});
function fixture() {
  return correctionFixture(loaded.targets, loaded.seedSha256);
}
function validate(f: ReturnType<typeof fixture>) {
  f.bundle.artifactChecksum = correction.correctionChecksum(f.bundle);
  return correction.validateCorrectionBundle(
    f.bundle,
    loaded.targets,
    loaded.seedSha256,
    f.manifest,
    correctionTestTime,
  );
}
describe("bounded reviewed correction validation", () => {
  it("preserves original media, tuition year and operator review time", () => {
    const result = validate(fixture());
    expect(result.schools).toHaveLength(41);
    expect(result.schools[0]!.sources[0]).toMatchObject({
      contentType: "image/png",
      responseContentHash: hashText("original image bytes"),
    });
    expect(result.schools[0]!.facts[0]!.displayText).toContain("2025년 기준");
    expect(result.schools[0]!.reviewedAt).toBe("2026-08-30T08:30:00.000Z");
  });
  it("does not infer unknown academic year and allows historical application dates", () => {
    const f = fixture();
    f.bundle.schools[0]!.admissions[0]!.academicYearLabel = null;
    f.bundle.schools[0]!.admissions[0]!.rawAcademicYear = null;
    f.bundle.schools[0]!.admissions[0]!.applicationOpenAt =
      "2025-11-06T00:00:00.000Z";
    expect(validate(f).schools[0]!.admissions[0]!.academicYearLabel).toBeNull();
  });
  it.each([
    ["scope", (f: ReturnType<typeof fixture>) => f.bundle.schools.pop()],
    [
      "duplicate identity",
      (f: ReturnType<typeof fixture>) =>
        (f.bundle.schools[1] = f.bundle.schools[0]!),
    ],
    [
      "source mapping",
      (f: ReturnType<typeof fixture>) =>
        (f.bundle.schools[0]!.sources[0]!.finalUrl =
          "https://attacker.example/"),
    ],
    [
      "duplicate fact",
      (f: ReturnType<typeof fixture>) =>
        f.bundle.schools[0]!.facts.push(f.bundle.schools[0]!.facts[0]!),
    ],
    [
      "bad evidence hash",
      (f: ReturnType<typeof fixture>) =>
        (f.bundle.schools[0]!.sources[0]!.evidenceTextHash = "0".repeat(64)),
    ],
    [
      "missing evidence",
      (f: ReturnType<typeof fixture>) =>
        (f.bundle.schools[0]!.facts[0]!.evidenceExcerpt =
          "unreviewed new claim"),
    ],
    [
      "backward dates",
      (f: ReturnType<typeof fixture>) =>
        (f.bundle.schools[0]!.admissions[0]!.applicationCloseAt =
          "2025-11-01T00:00:00.000Z"),
    ],
    [
      "wrong enum",
      (f: ReturnType<typeof fixture>) =>
        (f.bundle.schools[0]!.admissions[0]!.kind = "RESULT"),
    ],
    [
      "lottery as application",
      (f: ReturnType<typeof fixture>) =>
        (f.bundle.schools[0]!.admissions[0]!.kind = "LOTTERY"),
    ],
    [
      "stale artifact",
      (f: ReturnType<typeof fixture>) =>
        (f.bundle.generatedAt = "2026-08-01T00:00:00.000Z"),
    ],
  ])("rejects %s before persistence", (_name, mutate) => {
    const f = fixture();
    mutate(f);
    expect(() => validate(f)).toThrow();
  });
  it("rejects a self-inconsistent checksum", () => {
    const f = fixture();
    f.bundle.artifactChecksum = "0".repeat(64);
    expect(() =>
      correction.validateCorrectionBundle(
        f.bundle,
        loaded.targets,
        loaded.seedSha256,
        f.manifest,
        correctionTestTime,
      ),
    ).toThrow();
  });
});
