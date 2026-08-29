import { describe, expect, it } from "vitest";

import {
  assertLocalLiveAdmissionDatabase,
  parseFiveSchoolLiveAdmissionCliArgs,
  parseFiveSchoolSelectionManifest,
  parseLiveAdmissionReviewManifest,
  runFiveSchoolLiveAdmissionCli,
} from "@/src/modules/live-admissions/cli.server";
import { parseHttpCollectorPolicy } from "@/src/modules/http-collector/contracts";

const SOURCE_A = "00000000-0000-4000-8000-000000000001";
const SOURCE_B = "00000000-0000-4000-8000-000000000002";

describe("five-school live admission CLI contract", () => {
  it("parses a bounded calibration batch without an apply mode", () => {
    // Catches calibration accidentally becoming a database-writing command.
    expect(
      parseFiveSchoolLiveAdmissionCliArgs([
        "--calibrate",
        "--source-id",
        SOURCE_A,
        `--source-id=${SOURCE_B}`,
      ]),
    ).toEqual({
      mode: "calibrate",
      sourceIds: [SOURCE_A, SOURCE_B],
    });
  });

  it("requires an explicit file for prepare and exactly one-record review", () => {
    // Catches an ambiguous implicit or bulk auto-review path.
    expect(
      parseFiveSchoolLiveAdmissionCliArgs([
        "--prepare",
        "--file",
        "selection.json",
      ]),
    ).toEqual({ mode: "prepare", filePath: "selection.json" });
    expect(
      parseFiveSchoolLiveAdmissionCliArgs([
        "--review",
        "--file=review-one.json",
      ]),
    ).toEqual({ mode: "review", filePath: "review-one.json" });
    expect(() =>
      parseFiveSchoolLiveAdmissionCliArgs([
        "--review",
        "--file",
        "one.json",
        "--file",
        "two.json",
      ]),
    ).toThrow(/Usage/);
  });

  it("rejects mixed modes, invalid UUIDs, and more than ten calibration roots", () => {
    // Catches an unbounded or ambiguous live crawl scope.
    expect(() =>
      parseFiveSchoolLiveAdmissionCliArgs([
        "--calibrate",
        "--prepare",
        "--source-id",
        SOURCE_A,
        "--file",
        "selection.json",
      ]),
    ).toThrow(/Usage/);
    expect(() =>
      parseFiveSchoolLiveAdmissionCliArgs([
        "--calibrate",
        "--source-id",
        "not-a-uuid",
      ]),
    ).toThrow(/Usage/);
    expect(() =>
      parseFiveSchoolLiveAdmissionCliArgs([
        "--calibrate",
        ...Array.from({ length: 11 }, (_value, index) => [
          "--source-id",
          `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        ]).flat(),
      ]),
    ).toThrow(/Usage/);
  });

  it("accepts only an identical dedicated localhost TEST_DATABASE_URL", () => {
    // Catches production or merely renamed remote databases entering the local path.
    const local =
      "postgres://preppy_test:test-only@127.0.0.1:55435/preppy_live5_test";
    expect(() => assertLocalLiveAdmissionDatabase(local, local)).not.toThrow();
    expect(() =>
      assertLocalLiveAdmissionDatabase(
        "postgres://prod.example.com/preppy_test",
        "postgres://prod.example.com/preppy_test",
      ),
    ).toThrow(/localhost/);
    expect(() =>
      assertLocalLiveAdmissionDatabase(
        local,
        "postgres://preppy_test:test-only@127.0.0.1:55435/other_test",
      ),
    ).toThrow(/match/);
    expect(() =>
      assertLocalLiveAdmissionDatabase(
        "postgres://preppy_test:test-only@127.0.0.1:55435/preppy_live5",
        "postgres://preppy_test:test-only@127.0.0.1:55435/preppy_live5",
      ),
    ).toThrow(/dedicated/);
  });

  it("accepts only a bounded explicit five-school selection manifest", () => {
    // Catches implicit candidate promotion or expansion beyond this vertical slice.
    const selection = parseFiveSchoolSelectionManifest({
      targetAcademicYearLabel: "2027학년도",
      entries: [
        {
          institutionId: SOURCE_A,
          rootSourceId: SOURCE_B,
          admissionUrl: "https://school.example/admissions",
          sourceName: "School admissions",
          sourceType: "OFFICIAL_ADMISSION_PAGE",
          institutionBindingRole: "ADMISSIONS",
          classificationHint: "ADMISSIONS",
        },
      ],
    });
    expect(selection.entries).toHaveLength(1);
    expect(selection.entries[0]?.admissionUrl).toBe(
      "https://school.example/admissions",
    );
    expect(() =>
      parseFiveSchoolSelectionManifest({
        targetAcademicYearLabel: "2027학년도",
        entries: Array.from({ length: 6 }, (_value, index) => ({
          institutionId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
          rootSourceId: SOURCE_B,
          admissionUrl: `https://school.example/admissions/${index}`,
          sourceName: "School admissions",
          sourceType: "OFFICIAL_ADMISSION_PAGE",
          institutionBindingRole: "ADMISSIONS",
          classificationHint: "ADMISSIONS",
        })),
      }),
    ).toThrow();
  });

  it("parses one explicit review record and converts only stated ISO timestamps", () => {
    // Catches bulk auto-verification and collector time substituted for operator time.
    const review = parseLiveAdmissionReviewManifest({
      institutionId: SOURCE_A,
      opportunityId: SOURCE_B,
      expectedVersionId: "00000000-0000-4000-8000-000000000003",
      expectedContentFingerprint: "a".repeat(64),
      sourceId: "00000000-0000-4000-8000-000000000004",
      observationId: "17",
      snapshotId: "00000000-0000-4000-8000-000000000005",
      operatorAdminId: "00000000-0000-4000-8000-000000000006",
      approvedProposal: {
        academicYearLabel: "2027학년도",
        knowledgeState: "SCHEDULE_FOUND",
        kind: "RECRUITMENT",
        businessState: "UPCOMING",
        title: "2027학년도 신입생 모집",
        summary: null,
        targetAudience: null,
        eventStartAt: null,
        eventEndAt: null,
        applicationOpenAt: "2026-10-05T00:00:00.000Z",
        applicationCloseAt: "2026-10-09T00:00:00.000Z",
        actionUrl: "https://school.example/admissions",
        evidenceExcerpt: "원서접수",
        warnings: [],
      },
    });
    expect(review.approvedProposal.applicationOpenAt?.toISOString()).toBe(
      "2026-10-05T00:00:00.000Z",
    );
    expect(() => parseLiveAdmissionReviewManifest([review, review])).toThrow();
  });

  it("executes calibration as a no-write collector run with the fixed conservative policy", async () => {
    // Catches a calibration runner that silently applies or widens crawl scope.
    const local =
      "postgres://preppy_test:test-only@127.0.0.1:55435/preppy_live5_test";
    const result = await runFiveSchoolLiveAdmissionCli(
      ["--calibrate", "--source-id", SOURCE_A],
      {
        databaseUrl: local,
        testDatabaseUrl: local,
        openRuntime: () =>
          ({
            executor: {},
            transactionManager: {},
          }) as never,
        closeRuntime: async () => undefined,
        collect: async (input, _dependencies) => {
          expect(input.mode).toBe("dry-run");
          expect(input.sourceIds).toEqual([SOURCE_A]);
          expect(input.policy).toMatchObject({
            maxDepth: 1,
            maxPagesPerInstitution: 10,
            maxLinksPerPage: 100,
            perHostConcurrency: 1,
          });
          return {
            mode: "dry-run",
            applied: false,
            policy: parseHttpCollectorPolicy(input.policy),
            sources: [],
            persistence: [],
            runBudget: {
              maximumBytes: 20 * 1024 * 1024,
              consumedBytes: 0,
              remainingBytes: 20 * 1024 * 1024,
              exhausted: false,
              exceeded: false,
            },
          };
        },
      },
    );
    expect(result).toMatchObject({ mode: "dry-run", applied: false });
  });
});
