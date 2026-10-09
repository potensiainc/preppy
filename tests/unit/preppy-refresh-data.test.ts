import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadPrivateElementaryBootstrapTargets,
  PRIVATE_ELEMENTARY_SEED_PATH,
} from "@/src/modules/institution-detail-bootstrap/contracts";
import {
  correctionChecksum,
  validateCorrectionBundle,
} from "@/src/modules/institution-detail-bootstrap/correction.server";
import { evidenceArtifactRecordSchema } from "@/src/modules/international-school-import/artifact-schema";
import { parseInternationalSchoolFactValue } from "@/src/modules/international-school/fact-values";

const read = async (path: string) =>
  JSON.parse(await readFile(resolve(path), "utf8"));
const bundle = await read(
  "data/corrections/PREPPY_PRIVATE_ELEMENTARY_REFRESH_20261008.json",
);
const manifest = await read(
  "data/corrections/private-elementary-official-sources.json",
);
const loaded = await loadPrivateElementaryBootstrapTargets(
  resolve(PRIVATE_ELEMENTARY_SEED_PATH),
);
const now = new Date(bundle.generatedAt);

describe("reviewed October partial refresh", () => {
  it("validates captured sources, original hashes and exact identities against the existing manifest", () => {
    const result = validateCorrectionBundle(
      bundle,
      loaded.targets,
      loaded.seedSha256,
      manifest,
      now,
    );
    expect(result.schools.map((s) => s.target.slug)).toEqual([
      "myongji",
      "kumsung",
      "younghoon",
      "kbes",
    ]);
    expect(result.schools.flatMap((s) => s.admissions)).toHaveLength(11);
    expect(result.schools.flatMap((s) => s.facts)).toHaveLength(10);
    const tour = result.schools[0]!.admissions.find((a) => a.key === "tour-1")!;
    expect(tour.kind).toBe("OPEN_HOUSE");
    expect(tour.applicationOpenAt).toBe("2026-10-20T01:00:00.000Z");
    expect(tour.eventStartAt).toBe("2026-10-30T01:30:00.000Z");
    expect(tour.summary).toContain("자녀는 동반할 수 없어요");
    expect(
      result.schools[0]!.admissions.find((a) => a.key === "session-1")!.summary,
    ).toContain("가급적 자녀");
    expect(
      result.schools[3]!.facts.find((f) => f.factType === "TUITION")!.valueJson,
    ).toMatchObject({
      academicYearLabel: "2026학년도 참고 수업료 / 2027학년도 입학금",
      billingUnit: "MONTHLY",
      tuitionKrw: 931200,
    });
    expect(
      result.schools[0]!.facts.find((f) => f.factType === "TUITION")!
        .displayText,
    ).toContain("2026년 기준 분기(3개월) 2,180,000원");
    expect(result.schools[1]!.facts.some((f) => f.factType === "TUITION")).toBe(
      false,
    );
    const younghoon = result.schools[2]!;
    expect(younghoon.facts).toHaveLength(0);
    for (const event of younghoon.admissions) {
      expect(event.kind).toBe("INFORMATION_SESSION");
      expect(event.applicationOpenAt).toBeNull();
      expect(event.summary).toContain("두 회차 모두 마감");
      expect(event.summary).toContain("가급적 아이 동반");
    }
  });
  it("keeps international tuition evidence in the existing typed model with currency and eligibility conditions", async () => {
    const lines = (
      await readFile(
        resolve(
          "data/corrections/international-school-20261008/evidence.ndjson",
        ),
        "utf8",
      )
    )
      .trim()
      .split("\n");
    const evidence = lines.map((line) =>
      evidenceArtifactRecordSchema.parse(JSON.parse(line)),
    );
    expect(
      new Set(evidence.map((item) => item.institutionRegistryId)).size,
    ).toBe(8);
    for (const item of evidence) {
      expect(() =>
        parseInternationalSchoolFactValue("TUITION", item.observedValueJson),
      ).not.toThrow();
      expect(item.sourceSnapshotId).toBeNull();
      expect(item.sourceObservationRef).toBeNull();
      expect(item.academicYearLabel).toBe(
        item.institutionRegistryId === "ST01:18" ? "2026年度" : "2026–27",
      );
    }
    const kis = evidence.find(
      (item) => item.institutionRegistryId === "ST01:1",
    )!;
    expect(JSON.stringify(kis.observedValueJson)).toContain(
      "PK/JK에는 일괄 적용하지 않아요",
    );
    const dwight = evidence.find(
      (item) => item.institutionRegistryId === "ST01:76",
    )!;
    expect(JSON.stringify(dwight.observedValueJson)).toContain(
      "선택 비용이 아니에요",
    );
  });
  it("keeps v1 complete-scope validation and rejects duplicated or stale v2 reviews", () => {
    const validate = (value: typeof bundle, time = now) => {
      value.artifactChecksum = correctionChecksum(value);
      return validateCorrectionBundle(
        value,
        loaded.targets,
        loaded.seedSha256,
        manifest,
        time,
      );
    };
    expect(() =>
      validate({ ...structuredClone(bundle), correctionVersion: 1 }),
    ).toThrow();
    expect(() =>
      validate({
        ...structuredClone(bundle),
        schools: [bundle.schools[0], bundle.schools[0]],
      }),
    ).toThrow();
    expect(() =>
      validate(structuredClone(bundle), new Date(now.getTime() + 8 * 86400000)),
    ).toThrow();
  });
});
