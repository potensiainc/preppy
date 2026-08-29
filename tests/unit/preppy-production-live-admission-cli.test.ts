import { describe, expect, it } from "vitest";

import { assertLocalLiveAdmissionDatabase } from "@/src/modules/live-admissions/cli.server";
import {
  PRODUCTION_FIVE_SCHOOL_TARGETS,
  assertProductionFiveSchoolEnvironment,
  assertProductionReviewTarget,
  parseProductionFiveSchoolCliArgs,
  toSafeProductionRolloutFailure,
} from "@/src/modules/live-admissions/production-contract";
import { assertProductionRolloutMigrationReady } from "@/src/modules/live-admissions/production-rollout.server";

const ACKNOWLEDGEMENT = "--acknowledge-production-write=PREPPY-5-SCHOOL";

describe("PREPPY production five-school rollout contract", () => {
  it("pins the exact owner-approved institution and official-URL allowlist", () => {
    expect(PRODUCTION_FIVE_SCHOOL_TARGETS).toEqual([
      expect.objectContaining({
        slug: "kbes",
        institutionId: "abcb72f0-a6aa-53b1-9104-77d318660f8a",
        admissionUrl: "https://www.kbes.kr/bbs/content.php?co_id=1_3",
      }),
      expect.objectContaining({
        slug: "myongji",
        institutionId: "4b732452-6f4b-5f7e-9303-456667250a67",
        admissionUrl: "http://www.myongji.net/subpage.php?p=m24",
      }),
      expect.objectContaining({
        slug: "younghoon",
        institutionId: "626f9b01-1855-536f-b7cc-1608ab65eb9b",
        admissionUrl:
          "http://www.younghoon.es.kr/younghoon_e/admission/typical-syllabus.do",
      }),
      expect.objectContaining({
        slug: "uchon",
        institutionId: "37de5a08-cbb8-5dec-95d1-faca0a5d8009",
        admissionUrl: "https://uchon.sen.es.kr",
      }),
      expect.objectContaining({
        slug: "yale",
        institutionId: "af494821-037e-5730-a54e-809cb7253e41",
        admissionUrl: "https://yale.sen.es.kr",
      }),
    ]);
    expect(
      new Set(
        PRODUCTION_FIVE_SCHOOL_TARGETS.map((target) => target.institutionId),
      ).size,
    ).toBe(5);
  });

  it("preserves the exact Korean UTF-8 allowlist labels", () => {
    expect(
      PRODUCTION_FIVE_SCHOOL_TARGETS.map((target) => ({
        institutionName: target.institutionName,
        sourceName: target.sourceName,
        targetAcademicYearLabel: target.targetAcademicYearLabel,
      })),
    ).toEqual([
      {
        institutionName: "경복초등학교",
        sourceName: "경복초등학교 입학 안내",
        targetAcademicYearLabel: "2026학년도",
      },
      {
        institutionName: "명지초등학교",
        sourceName: "명지초등학교 신입학 안내",
        targetAcademicYearLabel: "2026학년도",
      },
      {
        institutionName: "영훈초등학교",
        sourceName: "영훈초등학교 신입학 전형요강",
        targetAcademicYearLabel: "2026학년도",
      },
      {
        institutionName: "우촌초등학교",
        sourceName: "우촌초등학교 공식 홈페이지",
        targetAcademicYearLabel: "2026학년도",
      },
      {
        institutionName: "예일초등학교",
        sourceName: "예일초등학교 공식 홈페이지",
        targetAcademicYearLabel: "2026학년도",
      },
    ]);
  });

  it("parses explicitly acknowledged inspect mode", () => {
    expect(
      parseProductionFiveSchoolCliArgs([
        "--production",
        ACKNOWLEDGEMENT,
        "--inspect",
      ]),
    ).toEqual({ mode: "inspect" });
  });

  it("requires one explicit allowlisted slug for prepare mode", () => {
    expect(
      parseProductionFiveSchoolCliArgs([
        "--prepare",
        "--slug=kbes",
        ACKNOWLEDGEMENT,
        "--production",
      ]),
    ).toEqual({ mode: "prepare", slug: "kbes" });
  });

  it("requires one explicit review manifest", () => {
    expect(
      parseProductionFiveSchoolCliArgs([
        "--production",
        ACKNOWLEDGEMENT,
        "--review",
        "--file",
        "review-one.json",
      ]),
    ).toEqual({ mode: "review", filePath: "review-one.json" });
  });

  it.each([
    { args: ["--inspect"] },
    { args: ["--production", "--inspect"] },
    { args: [ACKNOWLEDGEMENT, "--inspect"] },
    {
      args: [
        "--production",
        "--acknowledge-production-write=WRONG",
        "--inspect",
      ],
    },
    {
      args: ["--production", ACKNOWLEDGEMENT, "--inspect", "--prepare"],
    },
    { args: ["--production", ACKNOWLEDGEMENT, "--review"] },
    {
      args: ["--production", ACKNOWLEDGEMENT, "--prepare", "--file=x.json"],
    },
    { args: ["--production", ACKNOWLEDGEMENT, "--prepare"] },
    {
      args: ["--production", ACKNOWLEDGEMENT, "--prepare", "--slug=unknown"],
    },
    {
      args: [
        "--production",
        ACKNOWLEDGEMENT,
        "--prepare",
        "--slug=kbes",
        "--slug=yale",
      ],
    },
    {
      args: ["--production", ACKNOWLEDGEMENT, "--inspect", "--slug=kbes"],
    },
    {
      args: ["--production", ACKNOWLEDGEMENT, "--inspect", "--unknown"],
    },
  ])("rejects an unsafe or ambiguous invocation $args", ({ args }) => {
    expect(() => parseProductionFiveSchoolCliArgs(args)).toThrow(
      "Production five-school rollout invocation rejected",
    );
  });

  it("requires an explicit production runtime and PostgreSQL DATABASE_URL", () => {
    expect(() =>
      assertProductionFiveSchoolEnvironment({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://operator:secret@database.internal/preppy",
      }),
    ).not.toThrow();
    expect(() =>
      assertProductionFiveSchoolEnvironment({
        NODE_ENV: "test",
        DATABASE_URL: "postgresql://operator:secret@database.internal/preppy",
      }),
    ).toThrow("production runtime");
    expect(() =>
      assertProductionFiveSchoolEnvironment({ NODE_ENV: "production" }),
    ).toThrow("DATABASE_URL");
    expect(() =>
      assertProductionFiveSchoolEnvironment({
        NODE_ENV: "production",
        DATABASE_URL: "mysql://operator:secret@database.internal/preppy",
      }),
    ).toThrow("PostgreSQL");
  });

  it("rejects non-allowlisted or URL-mismatched review records", () => {
    expect(() =>
      assertProductionReviewTarget({
        institutionId: PRODUCTION_FIVE_SCHOOL_TARGETS[0]!.institutionId,
        actionUrl: PRODUCTION_FIVE_SCHOOL_TARGETS[0]!.admissionUrl,
      }),
    ).not.toThrow();
    expect(() =>
      assertProductionReviewTarget({
        institutionId: "11111111-1111-4111-8111-111111111111",
        actionUrl: PRODUCTION_FIVE_SCHOOL_TARGETS[0]!.admissionUrl,
      }),
    ).toThrow("allowlist");
    expect(() =>
      assertProductionReviewTarget({
        institutionId: PRODUCTION_FIVE_SCHOOL_TARGETS[0]!.institutionId,
        actionUrl: "https://attacker.example/review",
      }),
    ).toThrow("allowlist");
  });

  it("never includes a production connection string in safe failure output", () => {
    const secretUrl =
      "postgresql://production-user:production-password@prod.internal/preppy";
    const report = toSafeProductionRolloutFailure(
      new Error(`connection failed: ${secretUrl}`),
    );

    expect(report).toEqual({
      status: "FAILED",
      errorCode: "UNEXPECTED_FAILURE",
    });
    expect(JSON.stringify(report)).not.toContain(secretUrl);
    expect(JSON.stringify(report)).not.toContain("production-password");
  });

  it("leaves the existing local-only guard strict", () => {
    const local = "postgresql://postgres:postgres@localhost/preppy_test";
    expect(() => assertLocalLiveAdmissionDatabase(local, local)).not.toThrow();
    expect(() =>
      assertLocalLiveAdmissionDatabase(
        "postgresql://operator:secret@database.internal/preppy",
        "postgresql://operator:secret@database.internal/preppy",
      ),
    ).toThrow("localhost");
  });

  it("blocks every write mode when the repository migration ledger is incomplete", async () => {
    await expect(
      assertProductionRolloutMigrationReady({
        raw: async () => [],
      } as never),
    ).rejects.toMatchObject({ code: "MIGRATION_BLOCKED" });
  });
});
