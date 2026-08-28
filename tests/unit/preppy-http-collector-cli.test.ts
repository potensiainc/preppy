import { describe, expect, it } from "vitest";

import {
  parseHttpCollectorCliArgs,
  toHttpCollectorOperatorReport,
} from "@/src/modules/http-collector/cli.server";
import { DEFAULT_HTTP_COLLECTOR_POLICY } from "@/src/modules/http-collector/contracts";
import type { HttpCollectorRunReport } from "@/src/modules/http-collector/service.server";

const ids = Array.from(
  { length: 11 },
  (_, index) =>
    `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
);

describe("explicit HTTP collector CLI", () => {
  it("defaults to dry-run and accepts repeated explicit Source IDs", () => {
    expect(
      parseHttpCollectorCliArgs([
        "--source-id",
        ids[0]!,
        `--source-id=${ids[1]}`,
      ]),
    ).toEqual({ sourceIds: [ids[0], ids[1]], mode: "dry-run" });
  });

  it("accepts explicit apply", () => {
    expect(
      parseHttpCollectorCliArgs(["--source-id", ids[0]!, "--apply"]),
    ).toEqual({
      sourceIds: [ids[0]],
      mode: "apply",
    });
  });

  const rejectedArgumentSets: readonly (readonly string[])[] = [
    [],
    ["--all"],
    ["--source-id", "not-a-uuid"],
    ["--source-id", ids[0]!, "--source-id", ids[0]!],
    ["--source-id", ids[0]!, "--dry-run", "--apply"],
    ids.slice(0, 11).flatMap((id) => ["--source-id", id]),
    ["--source-id", ids[0]!, "--unknown"],
  ];

  it.each(rejectedArgumentSets.map((arguments_) => [arguments_] as const))(
    "rejects unsafe or unbounded arguments %j",
    (arguments_) => {
      expect(() => parseHttpCollectorCliArgs(arguments_)).toThrow();
    },
  );

  it("serializes a bounded operator report without body, normalized text, headers, credentials, or stack data", () => {
    const requestedUrl = `https://user:password@school.example.test/root`;
    const robotsDecision = {
      decision: "ALLOW" as const,
      reason: "ROBOTS_ALLOWED" as const,
      origin: "https://school.example.test",
      robotsUrl: "https://school.example.test/robots.txt",
      robotsHttpStatus: 200,
      errorCode: null,
      transportErrorCode: null,
    };
    const run = {
      mode: "dry-run",
      applied: false,
      policy: DEFAULT_HTTP_COLLECTOR_POLICY,
      runBudget: {
        maximumBytes: DEFAULT_HTTP_COLLECTOR_POLICY.maxTotalBytesPerRun,
        consumedBytes: 24,
        remainingBytes: DEFAULT_HTTP_COLLECTOR_POLICY.maxTotalBytesPerRun - 24,
        exhausted: false,
        exceeded: false,
      },
      persistence: [],
      sources: [
        {
          sourceId: ids[0]!,
          institutionId: ids[1]!,
          pagesScheduled: 1,
          pagesFetched: 1,
          totalResponseBytes: 24,
          budgetOutcomes: [],
          candidates: [],
          root: {
            kind: "SUCCESS",
            robotsDecision,
            robotsDecisions: [robotsDecision],
            contentHash: "a".repeat(64),
            textHash: "b".repeat(64),
            normalizedText: "private visible text",
            response: {
              requestedUrl,
              finalUrl: "https://school.example.test/root",
              redirectChain: [],
              httpStatus: 200,
              contentType: "text/html",
              contentLengthHeader: "24",
              actualResponseBytes: 24,
              fetchedAt: new Date("2026-08-28T00:00:00.000Z"),
              elapsedMs: 12,
              etag: '"etag"',
              lastModified: null,
              entityBytes: Buffer.from("private raw body secret"),
            },
          },
        },
      ],
    } satisfies HttpCollectorRunReport;
    const serialized = JSON.stringify(toHttpCollectorOperatorReport(run));
    expect(serialized).toContain('"contentHash"');
    expect(serialized).not.toContain("private raw body secret");
    expect(serialized).not.toContain("private visible text");
    expect(serialized).not.toContain("password");
    expect(serialized).not.toContain("entityBytes");
    expect(serialized).not.toContain("authorization");
    expect(serialized).not.toContain("stack");
  });
});
