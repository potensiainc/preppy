import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { validateCorrectionBundle } from "@/src/modules/institution-detail-bootstrap/correction.server";
import {
  loadPrivateElementaryBootstrapTargets,
  PRIVATE_ELEMENTARY_SEED_PATH,
} from "@/src/modules/institution-detail-bootstrap/contracts";

describe("reviewed admission guidance coverage", () => {
  it("retains all schools, dates and evidence while exposing reviewed facts in each main guide", async () => {
    const read = async (path: string) =>
      JSON.parse(await readFile(path, "utf8"));
    const previous = await read(
      "data/corrections/PREPPY_PRIVATE_ELEMENTARY_REAUDIT_20260830.json",
    );
    const value = await read(
      "data/corrections/PREPPY_ADMISSION_GUIDANCE_20260831.json",
    );
    const manifest = await read(
      "data/corrections/private-elementary-official-sources.json",
    );
    const seed = await loadPrivateElementaryBootstrapTargets(
      PRIVATE_ELEMENTARY_SEED_PATH,
    );
    const bundle = validateCorrectionBundle(
      value,
      seed.targets,
      seed.seedSha256,
      manifest,
      new Date(value.generatedAt),
    );
    expect(bundle.schools).toHaveLength(41);
    for (const school of bundle.schools) {
      const original = previous.schools.find(
        (s: { target: { slug: string } }) =>
          s.target.slug === school.target.slug,
      );
      const main = school.admissions.find((a) => a.key === "main")!;
      expect(school.admissions).toHaveLength(original.admissions.length);
      for (const admission of school.admissions) {
        const before = original.admissions.find(
          (a: { key: string }) => a.key === admission.key,
        );
        for (const key of [
          "academicYearLabel",
          "applicationOpenAt",
          "applicationCloseAt",
          "eventStartAt",
          "eventEndAt",
        ] as const)
          expect(admission[key]).toEqual(before[key]);
      }
      for (const fact of school.facts) {
        expect(main.summary).toContain(fact.displayText);
        for (const url of fact.sourceUrls)
          expect(main.sourceUrls).toContain(url);
      }
      expect(main.summary!.length).toBeLessThanOrEqual(8000);
    }
    const lila = bundle.schools.find((s) => s.target.slug === "lila")!
      .admissions[0]!;
    for (const fact of [
      "84명",
      "30,000원",
      "2026년 11월 16일 11:00",
      "주민등록등본",
      "2025학년도",
      "변동",
      "예정",
    ])
      expect(lila.summary).toContain(fact);
    const donggwang = bundle.schools.find(
      (s) => s.target.slug === "donggwang",
    )!;
    for (const event of donggwang.admissions)
      expect(event.summary).toContain("예정 안내 · 변경 가능");
  });
});
