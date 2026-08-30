import { describe, expect, it } from "vitest";

import {
  buildRegistryBaselineFacts,
  buildOperatingInfoFact,
  extractInstitutionFacts,
} from "@/src/modules/institution-detail-bootstrap/fact-extractor";
import {
  isStaleAdmissionCycle,
  selectCurrentAdmissionProposal,
} from "@/src/modules/institution-detail-bootstrap/admission-extractor";
import {
  loadPrivateElementaryBootstrapTargets,
  PRIVATE_ELEMENTARY_SEED_PATH,
} from "@/src/modules/institution-detail-bootstrap/contracts";

describe("private elementary fact extraction", () => {
  it("builds two registry-backed baseline facts for every checksum-validated private elementary row", async () => {
    const { targets } = await loadPrivateElementaryBootstrapTargets(
      PRIVATE_ELEMENTARY_SEED_PATH,
    );
    for (const target of targets) {
      const facts = buildRegistryBaselineFacts(target);
      expect(facts.map((fact) => fact.factType)).toEqual([
        "OPERATING_INFO",
        "TARGET_AGE_GRADE",
      ]);
      expect(facts[1]).toMatchObject({
        displayText:
          "초등학교 1~6학년 (학교 교육과정 기준; 신입생 모집 대상 아님)",
        sourceUrl: target.registryUrl,
        valueJson: { offersElementary: true, registryVerifiedAt: "2026-08-27" },
      });
      expect(facts[0]?.valueJson).toMatchObject({
        registryVerifiedAt: "2026-08-27",
      });
      expect(facts[0]?.displayText).toContain(target.address);
    }
    expect(targets).toHaveLength(41);
  });

  it("does not infer grade coverage from the school category alone", async () => {
    const { targets } = await loadPrivateElementaryBootstrapTargets(
      PRIVATE_ELEMENTARY_SEED_PATH,
    );
    expect(
      buildRegistryBaselineFacts({
        ...targets[0]!,
        offersElementary: false,
      }).map((fact) => fact.factType),
    ).toEqual(["OPERATING_INFO"]);
    expect(
      buildRegistryBaselineFacts({
        ...targets[0]!,
        gradeRange: "확인되지 않음",
      }).map((fact) => fact.factType),
    ).toEqual(["OPERATING_INFO"]);
  });

  it("keeps the historical tuition year and future change notice in display evidence", () => {
    const [fact] = extractInstitutionFacts({
      sourceUrl: "https://school.example/fees",
      content:
        "<p>2025학년도 1기 수업료 2,312,100원 (2027학년도 변동 가능)</p>",
    });
    expect(fact?.displayText).toBe(
      "2025학년도 1기 수업료 2,312,100원 (2027학년도 변동 가능)",
    );
  });
  it("extracts only source-backed bounded fact sentences", () => {
    const facts = extractInstitutionFacts({
      sourceUrl: "https://school.example/guide",
      content: `
        <h1>학교 및 입학 안내</h1>
        <p>2027학년도 신입생 모집 대상은 초등학교 1학년 취학 예정 아동입니다.</p>
        <p>2027학년도 입학금은 1,000,000원이며 수업료는 분기별 2,000,000원입니다.</p>
        <p>교육과정은 영어 몰입활동과 예술·체육 특색교육을 운영합니다.</p>
        <p>지원 자격은 서울특별시 거주 취학 예정 아동입니다.</p>
        <p>통학버스는 서울 동북권 4개 노선으로 운행합니다.</p>
        <p>입학 절차는 온라인 원서접수 후 공개 추첨과 등록 순서입니다.</p>
      `,
    });

    expect(facts.map((fact) => fact.factType)).toEqual([
      "TUITION",
      "TARGET_AGE_GRADE",
      "CURRICULUM",
      "ELIGIBILITY",
      "TRANSPORT",
      "ADMISSION_PROCESS",
    ]);
    expect(facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          factType: "TUITION",
          displayText: expect.stringContaining("수업료"),
          evidenceExcerpt: expect.stringContaining("1,000,000원"),
          sourceUrl: "https://school.example/guide",
        }),
        expect.objectContaining({
          factType: "TRANSPORT",
          valueJson: expect.objectContaining({
            text: expect.stringContaining("통학버스"),
          }),
        }),
      ]),
    );
    expect(facts.every((fact) => fact.evidenceExcerpt.length <= 1_000)).toBe(
      true,
    );
  });

  it("leaves unsupported or missing values absent", () => {
    expect(
      extractInstitutionFacts({
        sourceUrl: "https://school.example/",
        content: "<p>우리 학교에 오신 것을 환영합니다.</p>",
      }),
    ).toEqual([]);
  });

  it("builds deterministic registry-backed operating information", () => {
    const fact = buildOperatingInfoFact({
      institutionName: "테스트초등학교",
      address: "서울특별시 테스트구 공식로 1",
      gradeRange: "초등학교(1–6)",
      websiteUrl: "https://school.example/",
      registryUrl: "https://www.schoolinfo.go.kr/official-record",
    });

    expect(fact).toMatchObject({
      factType: "OPERATING_INFO",
      sourceUrl: "https://www.schoolinfo.go.kr/official-record",
      valueJson: {
        institutionName: "테스트초등학교",
        institutionType: "PRIVATE_ELEMENTARY",
        address: "서울특별시 테스트구 공식로 1",
        gradeRange: "초등학교(1–6)",
        officialWebsite: "https://school.example/",
      },
    });
    expect(fact.displayText).toContain("서울특별시 테스트구 공식로 1");
  });
});

describe("private elementary admission selection", () => {
  it("does not let a newer curriculum year outrank actual admission evidence", () => {
    const collectedAt = new Date("2026-08-30T00:00:00Z");
    const selected = selectCurrentAdmissionProposal(
      [
        {
          sourceUrl: "https://school.example/curriculum",
          content:
            "<h1>2027학년도 교육과정</h1><p>영어 교육과정 안내입니다.</p>",
          classificationHint: "OTHER",
          collectedAt,
        },
        {
          sourceUrl: "https://school.example/admissions",
          content:
            "<h1>2026학년도 신입생 모집</h1><p>원서접수 기간 2025년 11월 1일 ~ 2025년 11월 5일</p>",
          classificationHint: "ADMISSIONS",
          collectedAt,
        },
      ],
      collectedAt,
    );
    expect(selected).toMatchObject({
      sourceUrl: "https://school.example/admissions",
      proposal: {
        academicYearLabel: "2026학년도",
        knowledgeState: "SCHEDULE_FOUND",
      },
    });
  });

  it.each([
    ["2024학년도", true],
    ["2025학년도", true],
    ["2026학년도", false],
    ["2027학년도", false],
    [null, false],
  ])(
    "guards current publication for %s without rewriting the source year",
    (year, stale) => {
      expect(isStaleAdmissionCycle(year)).toBe(stale);
    },
  );
  const referenceTime = new Date("2026-08-30T00:00:00.000Z");

  it("selects explicit 2027 over 2026 across official pages", () => {
    const selected = selectCurrentAdmissionProposal(
      [
        {
          sourceUrl: "https://school.example/admission-2026",
          content:
            "<h1>2026학년도 신입생 모집</h1><p>원서접수 기간 2025년 11월 10일 ~ 2025년 11월 14일</p>",
          classificationHint: "ADMISSIONS",
          collectedAt: new Date("2026-08-30T00:00:01.000Z"),
        },
        {
          sourceUrl: "https://school.example/admission-2027",
          content:
            "<h1>2027학년도 신입생 모집</h1><p>원서접수 기간 2026년 11월 9일 ~ 2026년 11월 13일</p><p>지원 대상은 2020년 출생 취학 예정 아동입니다.</p>",
          classificationHint: "ADMISSIONS",
          collectedAt: new Date("2026-08-30T00:00:02.000Z"),
        },
      ],
      referenceTime,
    );

    expect(selected?.proposal).toMatchObject({
      academicYearLabel: "2027학년도",
      knowledgeState: "SCHEDULE_FOUND",
      actionUrl: "https://school.example/admission-2027",
      targetAudience: expect.stringContaining("지원 대상"),
    });
    expect(selected?.collectedAt.toISOString()).toBe(
      "2026-08-30T00:00:02.000Z",
    );
  });

  it("selects 2027 when both years occur on the same page", () => {
    const selected = selectCurrentAdmissionProposal(
      [
        {
          sourceUrl: "https://school.example/admissions",
          content: `
            <p>2026학년도 신입생 모집은 마감되었습니다.</p>
            <h1>2027학년도 신입생 모집</h1>
            <p>원서접수 기간 2026년 11월 9일 ~ 2026년 11월 13일</p>
          `,
          classificationHint: "ADMISSIONS",
          collectedAt: new Date("2026-08-30T00:00:02.000Z"),
        },
      ],
      referenceTime,
    );

    expect(selected?.proposal.academicYearLabel).toBe("2027학년도");
    expect(selected?.proposal.title).toContain("2027학년도");
    expect(selected?.proposal.applicationOpenAt?.toISOString()).toBe(
      "2026-11-08T15:00:00.000Z",
    );
  });

  it("distinguishes explicit not-announced from a bounded not-found result", () => {
    const notAnnounced = selectCurrentAdmissionProposal(
      [
        {
          sourceUrl: "https://school.example/admission",
          content:
            "<h1>2027학년도 신입생 입학 안내</h1><p>원서접수 일정은 추후 공지합니다.</p>",
          classificationHint: "ADMISSIONS",
          collectedAt: referenceTime,
        },
      ],
      referenceTime,
    );
    const notFound = selectCurrentAdmissionProposal(
      [
        {
          sourceUrl: "https://school.example/",
          content: "<h1>학교 홈페이지</h1><p>교육활동 안내입니다.</p>",
          classificationHint: "OTHER",
          collectedAt: referenceTime,
        },
      ],
      referenceTime,
    );

    expect(notAnnounced?.proposal.knowledgeState).toBe("NOT_ANNOUNCED");
    expect(notFound?.proposal).toMatchObject({
      academicYearLabel: null,
      knowledgeState: "NOT_FOUND",
      title: "입학 관련 정보 미발견",
    });
  });
});
