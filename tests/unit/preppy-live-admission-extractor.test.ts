import { describe, expect, it } from "vitest";

import { extractLiveAdmissionProposal } from "@/src/modules/live-admissions/extractor";

const SOURCE_URL = "https://school.example/admission";
const REFERENCE_TIME = new Date("2026-08-29T00:00:00.000Z");

function extract(html: string) {
  return extractLiveAdmissionProposal({
    html,
    sourceUrl: SOURCE_URL,
    classificationHint: "ADMISSIONS",
    targetAcademicYearLabel: "2027학년도",
    referenceTime: REFERENCE_TIME,
  });
}

describe("five-school live admission extraction", () => {
  it.each([
    "<p>2025학년도 원서접수 기간: 2024년 11월 1일 ~ 2024년 11월 5일</p><p>2025학년도 입학설명회: 2024년 10월 1일</p><p>2025학년도 지원 대상: 2018년 출생 아동</p>",
    "<h2>2025학년도 신입생 모집</h2><p>원서접수 기간: 2024년 11월 1일 ~ 2024년 11월 5일</p><p>입학설명회: 2024년 10월 1일</p><p>지원 대상: 2018년 출생 아동</p>",
  ])(
    "does not attach an older cycle's dates or audience to a current not-announced notice (%#)",
    (historical) => {
      const result = extract(
        "<h1>2027학년도 신입생 모집</h1><p>2027학년도 원서접수 일정은 추후 공지합니다.</p>" +
          historical,
      );
      expect(result).toMatchObject({
        academicYearLabel: "2027학년도",
        knowledgeState: "NOT_ANNOUNCED",
        businessState: "UNKNOWN",
        applicationOpenAt: null,
        applicationCloseAt: null,
        eventStartAt: null,
        targetAudience: null,
      });
      expect(result.summary).not.toContain("2024년");
      expect(result.evidenceExcerpt).not.toContain("2018년");
    },
  );

  it("does not describe the current cycle as not-announced using a previous cycle's notice", () => {
    const result = extract(
      "<h1>2027학년도 신입생 모집</h1><p>입학자료는 공식 홈페이지에서 확인하세요.</p><p>2025학년도 원서접수 일정은 추후 공지합니다.</p>",
    );
    expect(result).toMatchObject({
      academicYearLabel: "2027학년도",
      knowledgeState: "NOT_FOUND",
      applicationOpenAt: null,
    });
  });

  it("preserves the stated academic year and parses contextual application and briefing dates", () => {
    // Catches a parser that collects date tokens without their admission context.
    const result = extract(`
      <html lang="ko">
        <head><title>2027학년도 신입생 모집</title></head>
        <body>
          <h1>2027학년도 신입생 입학 안내</h1>
          <p>원서접수: 2026. 10. 5.(월) 09:00 ~ 2026. 10. 9.(금) 16:00</p>
          <h2>입학설명회</h2>
          <p>입학설명회: 2026년 9월 12일(토) 오전 10시</p>
          <p>지원자격: 2020년 1월 1일부터 2020년 12월 31일 사이 출생 아동</p>
        </body>
      </html>
    `);

    expect(result).toMatchObject({
      academicYearLabel: "2027학년도",
      knowledgeState: "SCHEDULE_FOUND",
      kind: "RECRUITMENT",
      businessState: "UPCOMING",
      title: "2027학년도 신입생 모집",
      targetAudience:
        "지원자격: 2020년 1월 1일부터 2020년 12월 31일 사이 출생 아동",
      actionUrl: SOURCE_URL,
    });
    expect(result.applicationOpenAt?.toISOString()).toBe(
      "2026-10-05T00:00:00.000Z",
    );
    expect(result.applicationCloseAt?.toISOString()).toBe(
      "2026-10-09T07:00:00.000Z",
    );
    expect(result.eventStartAt?.toISOString()).toBe("2026-09-12T01:00:00.000Z");
    expect(result.evidenceExcerpt).toContain("원서접수");
    expect(result.evidenceExcerpt.length).toBeLessThanOrEqual(2_000);
  });

  it("uses NOT_ANNOUNCED only when the official text explicitly says the schedule will be announced later", () => {
    // Catches an implementation that treats every absent date as an announcement fact.
    const result = extract(`
      <title>2027학년도 입학 안내</title>
      <main>
        <h1>2027학년도 신입생 모집</h1>
        <p>2027학년도 신입생 모집 일정은 추후 공지합니다.</p>
      </main>
    `);

    expect(result.knowledgeState).toBe("NOT_ANNOUNCED");
    expect(result.academicYearLabel).toBe("2027학년도");
    expect(result.title).toBe("2027학년도 입학 일정 미발표");
    expect(result.applicationOpenAt).toBeNull();
    expect(result.applicationCloseAt).toBeNull();
    expect(result.eventStartAt).toBeNull();
  });

  it("keeps a bounded official-source miss distinct from NOT_ANNOUNCED", () => {
    // Catches the stronger unsupported claim that a school has not announced data.
    const result = extract(`
      <title>학교 소식</title>
      <main><h1>학교 소식</h1><p>교육 활동과 급식 소식입니다.</p></main>
    `);

    expect(result).toMatchObject({
      academicYearLabel: null,
      knowledgeState: "NOT_FOUND",
      businessState: "UNKNOWN",
      title: "입학 관련 정보 미발견",
    });
    expect(result.warnings).toContain("TARGET_ACADEMIC_YEAR_NOT_FOUND");
  });

  it("preserves an older source year instead of relabeling it as the requested year", () => {
    // Catches accidental promotion of historical material into 2027 truth.
    const result = extract(`
      <title>2026학년도 신입생 모집</title>
      <h1>2026학년도 신입생 원서접수</h1>
      <p>원서접수 2025년 10월 1일 ~ 2025년 10월 3일</p>
    `);

    expect(result.academicYearLabel).toBe("2026학년도");
    expect(result.title).toBe("2026학년도 신입생 모집");
    expect(result.warnings).toContain("TARGET_ACADEMIC_YEAR_NOT_FOUND");
  });

  it("prefers the elementary admission year and inherits an omitted range year only within the same evidence block", () => {
    // Catches unrelated news years and a missing close date in Korean date ranges.
    const result = extract(`
      <title>학교 홈페이지</title>
      <p>2022학년도 교육과정 자료</p>
      <a>2026학년도 입학안내</a>
      <p>2027학년도 중학교 입학 배정업무 시행계획</p>
      <p>교부 및 접수 기간 : 2025년 11월 7일(금) 09:00 ~ 11월 12일(수) 16:30</p>
      <p>취학의무 유예자 및 조기입학 희망 아동 포함</p>
    `);

    expect(result.academicYearLabel).toBe("2026학년도");
    expect(result.applicationOpenAt?.toISOString()).toBe(
      "2025-11-07T00:00:00.000Z",
    );
    expect(result.applicationCloseAt?.toISOString()).toBe(
      "2025-11-12T07:30:00.000Z",
    );
    expect(result.targetAudience).toBe(
      "취학의무 유예자 및 조기입학 희망 아동 포함",
    );
  });

  it("does not expose script text or accept a reversed application period", () => {
    // Catches invented truth from hidden code and invalid date ordering.
    const result = extract(`
      <title>2027학년도 입학 안내</title>
      <script>원서접수 2026년 1월 1일 ~ 2026년 1월 2일</script>
      <p>원서접수 2026년 10월 9일 ~ 2026년 10월 5일</p>
    `);

    expect(result.applicationOpenAt).toBeNull();
    expect(result.applicationCloseAt).toBeNull();
    expect(result.warnings).toContain("INVALID_APPLICATION_DATE_RANGE");
    expect(result.evidenceExcerpt).not.toContain("2026년 1월 1일");
  });
});
