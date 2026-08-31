import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import {
  correctionChecksum,
  validateCorrectionBundle,
  type CorrectionBundle,
} from "@/src/modules/institution-detail-bootstrap/correction.server";
import {
  loadPrivateElementaryBootstrapTargets,
  PRIVATE_ELEMENTARY_SEED_PATH,
} from "@/src/modules/institution-detail-bootstrap/contracts";

const bundlePath =
  "data/corrections/PREPPY_PRIVATE_ELEMENTARY_FULL_GUIDES_20260831.json";
const read = async (path: string) => JSON.parse(await readFile(path, "utf8"));
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
type SectionExpectation = {
  heading: string;
  paragraphHashes: string[];
  sourceUrls: string[];
};
type ExpectedSchool = {
  slug: string;
  institutionId: string;
  sections: SectionExpectation[];
  warningHashes: string[];
  supplementary: { title: string; sections: SectionExpectation[] }[];
  captures: {
    requestedUrl: string;
    finalUrl: string;
    responseContentHash: string;
    captureMethod: string;
    fetchedAt: string;
  }[];
};

describe("reviewed full official admission guides", () => {
  let bundle: CorrectionBundle;
  let previous: CorrectionBundle;
  let expected: ExpectedSchool[];
  beforeAll(async () => {
    expect(
      existsSync(bundlePath),
      "the reviewed bundle must be assembled",
    ).toBe(true);
    const value = await read(bundlePath);
    const seed = await loadPrivateElementaryBootstrapTargets(
      PRIVATE_ELEMENTARY_SEED_PATH,
    );
    bundle = validateCorrectionBundle(
      value,
      seed.targets,
      seed.seedSha256,
      await read("data/corrections/private-elementary-official-sources.json"),
      // Artifact tests stay valid after its operational seven-day apply window.
      new Date(value.generatedAt),
    );
    previous = await read(
      "data/corrections/PREPPY_ADMISSION_GUIDANCE_20260831.json",
    );
    expected = await read(
      "tests/fixtures/preppy-full-guides-20260831.expected.json",
    );
  });
  const school = (slug: string) =>
    bundle.schools.find((s) => s.target.slug === slug)!;
  const main = (slug: string) =>
    school(slug).admissions.find((a) => a.key === "main")!;

  it("retains all 41 seed identities and every independently reviewed section without truncation", () => {
    expect(bundle.schools).toHaveLength(41);
    expect(expected).toHaveLength(41);
    expect(bundle.artifactChecksum).toBe(correctionChecksum(bundle));
    for (const reviewed of expected) {
      const current = school(reviewed.slug);
      expect(current.target.institutionId).toBe(reviewed.institutionId);
      const guide = main(reviewed.slug);
      const paragraphs = guide.summary!.split("\n\n");
      const hashes = paragraphs.map(sha);
      expect(
        paragraphs.filter((paragraph) => /^\[.*\]$/u.test(paragraph)),
      ).toEqual([
        ...reviewed.sections.map((section) => `[${section.heading}]`),
        ...(reviewed.warningHashes.length ? ["[원문 유의사항·확인 범위]"] : []),
      ]);
      for (const section of reviewed.sections) {
        expect(paragraphs).toContain(`[${section.heading}]`);
        for (const hash of section.paragraphHashes)
          expect(hashes).toContain(hash);
        for (const url of section.sourceUrls) {
          expect(guide.sourceUrls).toContain(url);
          const evidence = current.sources.find((s) => s.requestedUrl === url)!;
          const evidenceHashes = evidence.evidenceText.split("\n\n").map(sha);
          for (const hash of section.paragraphHashes)
            expect(evidenceHashes).toContain(hash);
        }
      }
      for (const hash of reviewed.warningHashes) expect(hashes).toContain(hash);
      expect(guide.summary!.length).toBeLessThanOrEqual(8000);
      for (const supplemental of reviewed.supplementary) {
        for (const section of supplemental.sections) {
          for (const url of section.sourceUrls) {
            const evidence = current.sources.find(
              (s) => s.requestedUrl === url,
            )!;
            expect(evidence.evidenceText).toContain(supplemental.title);
            for (const hash of section.paragraphHashes)
              expect(evidence.evidenceText.split("\n\n").map(sha)).toContain(
                hash,
              );
          }
        }
      }
    }
  });

  it("preserves captured hashes, actual capture chronology and honest browser provenance", () => {
    for (const reviewed of expected) {
      const current = school(reviewed.slug);
      expect(current.sources).toHaveLength(reviewed.captures.length);
      for (const capture of reviewed.captures) {
        const source = current.sources.find(
          (s) => s.requestedUrl === capture.requestedUrl,
        )!;
        expect(source).toMatchObject(capture);
        expect(source.evidenceTextHash).toBe(sha(source.evidenceText));
        expect(Date.parse(source.fetchedAt)).toBeLessThanOrEqual(
          Date.parse(current.reviewedAt),
        );
        expect(Date.parse(current.reviewedAt)).toBeLessThanOrEqual(
          Date.parse(bundle.generatedAt),
        );
        expect(source.evidenceText).toContain(
          "OPERATOR_REVIEWED_FACTUAL_PARAPHRASE",
        );
        if (source.captureMethod === "BROWSER_CAPTURE") {
          expect([
            source.httpStatus,
            source.responseBytes,
            source.durationMs,
          ]).toEqual([null, null, null]);
          expect(source.evidenceText).toContain("NOT_ORIGINAL_HTTP_RESPONSE");
        } else {
          expect(source.responseBytes).toBeLessThanOrEqual(2 * 1024 * 1024);
        }
      }
    }
    expect(JSON.stringify(bundle)).not.toMatch(
      /<!DOCTYPE|<script|<html|sk-proj-/iu,
    );
  });

  it("preserves reviewed existing timestamps and facts except the explicit corrections", () => {
    for (const before of previous.schools) {
      const current = school(before.target.slug);
      for (const admission of before.admissions) {
        const after = current.admissions.find((a) => a.key === admission.key)!;
        for (const key of [
          "applicationOpenAt",
          "applicationCloseAt",
          "eventStartAt",
          "eventEndAt",
        ] as const)
          expect(after[key]).toBe(admission[key]);
        if (before.target.slug !== "kumsung") {
          expect(after.academicYearLabel).toBe(admission.academicYearLabel);
          expect(after.rawAcademicYear).toBe(admission.rawAcademicYear);
        }
      }
      for (const fact of before.facts) {
        if (
          (before.target.slug === "ihansin" && fact.factType === "TUITION") ||
          (before.target.slug === "kyonggi" && fact.factType === "TRANSPORT") ||
          (before.target.slug === "kumsung" &&
            fact.factType === "ELIGIBILITY") ||
          (before.target.slug === "taegang" && fact.factType === "ELIGIBILITY")
        )
          continue;
        expect(
          current.facts.find((f) => f.factType === fact.factType)?.displayText,
        ).toBe(fact.displayText);
      }
    }
  });

  it("retires unsupported Hansin tuition with a version guard and adds both real sessions", () => {
    const current = school("ihansin");
    expect(current.facts.some((f) => f.factType === "TUITION")).toBe(false);
    expect(current.retireFacts).toContainEqual(
      expect.objectContaining({
        factType: "TUITION",
        versionId: "6a2e3379-e805-4139-8f7f-bbc7fb998c80",
        expectedDisplayText:
          "2025학년도 기준 분기 수업료 1,830,000원 · 해당 학년도 기준 공개값",
      }),
    );
    expect(
      JSON.stringify({
        sources: current.sources,
        admissions: current.admissions,
        facts: current.facts,
      }),
    ).not.toMatch(/1,830,000|1830000|후보\s*300%|다음\s*날\s*16|3회\s*연락/u);
    for (const [key, start, end] of [
      ["session-1", "2025-10-31T09:00:00.000Z", "2025-10-31T11:00:00.000Z"],
      ["session-2", "2025-11-01T05:00:00.000Z", "2025-11-01T07:00:00.000Z"],
    ])
      expect(current.admissions.find((a) => a.key === key)).toMatchObject({
        kind: "INFORMATION_SESSION",
        academicYearLabel: "2026학년도",
        rawAcademicYear: "2026학년도",
        businessState: "COMPLETED",
        applicationOpenAt: null,
        applicationCloseAt: null,
        eventStartAt: start,
        eventEndAt: end,
      });
  });

  it("corrects all four Kumsung identities from explicit 2026 follow-up evidence", () => {
    const proof =
      "https://www.kumsung.net/data/editor/2511/796b72a1a353cedcc4df4da80465948e_1763108630_82.jpg";
    expect(school("kumsung").admissions).toHaveLength(4);
    for (const admission of school("kumsung").admissions) {
      expect(admission.academicYearLabel).toBe("2026학년도");
      expect(admission.rawAcademicYear).toBe("2026학년도");
      expect(admission.sourceUrls).toContain(proof);
      expect(admission.title).toContain("2026학년도");
    }
    expect(JSON.stringify(school("kumsung"))).not.toContain("학년도 미확인");
  });

  it("keeps separate 2027 criteria out of the 2026 opportunities", () => {
    for (const slug of ["seoul36", "taegang"]) {
      expect(
        school(slug).admissions.every(
          (a) => a.academicYearLabel === "2026학년도",
        ),
      ).toBe(true);
      for (const type of ["ELIGIBILITY", "ADMISSION_PROCESS"])
        expect(
          school(slug).facts.find((f) => f.factType === type)?.displayText,
        ).toContain("2027학년도");
    }
    expect(main("seoul36").summary).not.toContain(
      "2025년 1월 1일~10월 31일 침례",
    );
    expect(main("taegang").summary).not.toContain("신입생 전형일 기준 전년도");
    expect(
      school("taegang").facts.find((f) => f.factType === "ADMISSION_PROCESS")
        ?.displayText,
    ).toContain("HWP");
  });

  it("preserves school-specific conflicts, source limits and common reservation semantics", () => {
    const kyonggi = school("kyonggi");
    expect(JSON.stringify(kyonggi)).not.toContain("정자·대치");
    expect(
      kyonggi.facts.find((f) => f.factType === "TRANSPORT")?.displayText,
    ).toContain("대치사거리 정거장은 2029학년도");
    for (const event of school("hwarang-s").admissions.filter(
      (a) => a.kind === "INFORMATION_SESSION",
    )) {
      expect(event.summary).toContain("2026년 10월 1일 10:00~10월 27일 16:00");
      expect(event.summary).toContain("200명");
      expect(event.applicationCloseAt).toBeNull();
      expect(event.summary).not.toContain("초안 정보");
    }
    expect(main("chugye").targetAudience).toContain("60명");
    expect(main("dongbuk").targetAudience).toContain("거주지와 상관없음");
    expect(main("donggwang").summary).toContain("2027년 2월 말");
    expect(main("donggwang").summary).toContain("11월 17~19일");
    expect(main("seoul36").summary).toContain("19:00");
    expect(main("sohwa-e").summary).toContain("HWP");
    expect(main("kumsung").summary).toContain("확인하지 못했다");
    expect(JSON.stringify(school("simseok-e"))).not.toContain("http://mysimes");
  });

  it("uses the actually read Taegang attachments and keeps their year-specific requirements separate", () => {
    const current = school("taegang");
    const guide = main("taegang");
    expect(guide.summary).toContain("80%");
    for (const required of [
      "6개",
      "5개",
      "신앙생활기간",
      "교회출석",
      "십일금",
      "월정",
      "도르가",
      "교회직분",
      "금요일",
    ])
      expect(guide.summary!.replaceAll(" ", "")).toContain(required);
    expect(guide.summary).toContain("2024년 1월 1일");
    expect(guide.summary).not.toContain("2025년 1월 1일 이전");
    const eligibility = current.facts.find(
      (f) => f.factType === "ELIGIBILITY",
    )!;
    const procedure = current.facts.find(
      (f) => f.factType === "ADMISSION_PROCESS",
    )!;
    expect(eligibility.displayText).toContain("2025년 1월 1일 이전");
    expect(procedure.displayText).toContain("80%");
    expect(procedure.displayText).toContain("2026년 1월 1일");
    expect(JSON.stringify(current)).not.toMatch(
      /HWP[^\n]{0,50}(?:미검토|검토하지|읽지)|나머지 3개 항목을 추정/u,
    );
    const source = current.sources.find(
      (s) => s.requestedUrl === "https://taegang.sen.es.kr/111804/subMenu.do",
    )!;
    expect(source.fetchedAt).toBe("2026-08-30T23:55:40.836Z");
    expect(source.evidenceText).toContain(
      "LINKED_ATTACHMENT_PREVIEWS_NOT_HTTP_RESPONSE",
    );
    expect(source.captureMethod).toBe("BROWSER_CAPTURE");
    expect(current.sources.every((s) => !new URL(s.requestedUrl).port)).toBe(
      true,
    );
  });
});
