import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { describe, expect, it } from "vitest";
import {
  AdmissionSections,
  ReviewedAdmissions,
} from "@/app/_components/admissions-content";
import { admissionSections } from "@/app/_lib/admissions-presentation";
import type { ReviewedAdmissionDTO } from "@/src/modules/public/dto";
import {
  admissionAudienceRows,
  admissionReadingGroups,
  admissionReadingItems,
} from "@/app/_lib/admissions-readability";

const bundle = JSON.parse(
  readFileSync(
    "data/corrections/PREPPY_PRIVATE_ELEMENTARY_FULL_GUIDES_20260831.json",
    "utf8",
  ),
) as {
  schools: {
    target: { slug: string };
    admissions: { key: string; summary: string; targetAudience: string }[];
  }[];
};
const main = (slug: string) =>
  bundle.schools
    .find((s) => s.target.slug === slug)!
    .admissions.find((a) => a.key === "main")!;
function guide(summary: string, collapsible = false) {
  return load(
    renderToStaticMarkup(
      createElement(AdmissionSections, {
        sections: admissionSections(summary, "guide"),
        collapsible,
      }),
    ),
  );
}

describe("admissions readable topic sections", () => {
  it("keeps Donggwang's three-percent follow-up under twins, not the ordinary cohort quota", () => {
    const $ = guide(main("donggwang").summary);
    expect($("[data-admission-topic='쌍둥이 지원']").text()).toContain(
      "3%를 초과하면 추가추첨으로 정원 외 입학자 3명을 선정해요.",
    );
    expect($("[data-admission-topic='모집 인원']").text()).not.toContain(
      "3%를 초과하면",
    );
  });
  it("separates Maewon quota, documents, application, lottery and registration instead of leaving combined headings", () => {
    const $ = guide(main("maewon").summary);
    for (const heading of [
      "지원 대상",
      "모집 인원",
      "제출 서류",
      "원서접수",
      "추첨",
      "등록",
      "쌍둥이 지원",
      "대기자·결원 충원",
      "교육비",
    ]) {
      expect(
        $("h3")
          .toArray()
          .some((el) => $(el).text() === heading),
        heading,
      ).toBe(true);
    }
    expect($("h3").text()).not.toContain("접수·추첨·등록");
    expect($("[data-admission-topic='모집 인원']").text()).toContain(
      "84명(남녀 각 42명)",
    );
    expect($("[data-admission-topic='원서접수']").text()).toContain(
      "2025년 11월 7일 09:00부터 12일 16:30까지",
    );
    expect($("[data-admission-topic='등록']").text()).toContain(
      "중복등록은 모두 취소돼요",
    );
    expect($("[data-admission-topic='대기자·결원 충원']").text()).toContain(
      "500%",
    );
    expect($("[data-admission-topic='교육비']").text()).toContain(
      "2025학년도 기준 분기 수업료 2,151,000원",
    );
  });

  it("separates Smcho payment, transport and cautions, keeping fee years and cancellation conditions visible", () => {
    const $ = guide(main("smcho").summary, true);
    for (const heading of ["교육비", "납부 금액·방법", "통학", "유의사항"])
      expect(
        $("h3")
          .toArray()
          .some((el) => $(el).text() === heading),
        heading,
      ).toBe(true);
    expect($("[data-admission-topic='교육비']").text()).toContain(
      "2025학년도 기준 1분기 수업료는 2,520,000원",
    );
    expect($("[data-admission-topic='교육비']").text()).toContain(
      "2026학년도 금액은 변동될 수 있어요",
    );
    expect($("[data-admission-topic='통학']").text()).toContain(
      "따로 받지 않는다고 안내해요",
    );
    expect($("[data-admission-topic='납부 금액·방법']").text()).toContain(
      "학교 지정 금융기관",
    );
    expect($("details:not([open])").text()).not.toContain("허위 사실");
    expect($("[data-admission-topic='유의사항']").text()).toContain(
      "입학허가가 취소돼요",
    );
    expect($("li").length).toBeGreaterThan(10);
  });

  it("renders audience tokens as labelled rows, never semicolon prose or a quota disguised as eligibility", () => {
    const admission: ReviewedAdmissionDTO = {
      id: "test",
      slug: "test",
      title: "입학 안내",
      academicYearLabel: "2026학년도",
      knowledgeState: "GUIDANCE_FOUND",
      kind: "RECRUITMENT",
      businessState: "CLOSED",
      summary: "[지원 자격]\n취학유예 및 조기입학자는 증빙이 필요합니다.",
      targetAudience: "2019년 출생;84명;서울·통학가능수도권",
      keyDates: {
        eventStartsAt: null,
        eventEndsAt: null,
        applicationOpensAt: null,
        applicationClosesAt: null,
      },
      actionUrl: null,
      officialSource: {
        name: "학교",
        url: "https://school.test/guide",
        authorityLevel: "PRIMARY",
      },
      lastCollectedAt: "2026-08-30T00:00:00Z",
      lastVerifiedAt: "2026-08-31T00:00:00Z",
    };
    const $ = load(
      renderToStaticMarkup(
        createElement(ReviewedAdmissions, { admissions: [admission] }),
      ),
    );
    expect(
      $("dt")
        .filter((_, el) => $(el).text() === "지원 대상")
        .next("dd")
        .text(),
    ).toBe("2019년 출생");
    expect(
      $("dt")
        .filter((_, el) => $(el).text() === "모집 인원")
        .next("dd")
        .text(),
    ).toBe("84명");
    expect(
      $("dt")
        .filter((_, el) => $(el).text() === "지원 가능 지역")
        .next("dd")
        .text(),
    ).toBe("서울·통학가능수도권");
    expect($("body").text()).not.toContain(";");
    expect($("body").text()).not.toContain("지원 대상 / 자격");
    expect($("body").text()).toContain(
      "취학유예 및 조기입학자는 증빙이 필요해요.",
    );
  });

  it("keeps unknown headings, quoted exceptions, decimals, URL punctuation and historical context intact", () => {
    const summary =
      "[학교별 추가 조건]\n원문은 “등록하지 않으면 취소된다. 단, 학교 확인 필요.”라고 명시한다.\n\n[납부금·통학·유의사항]\n2025학년도 수업료는 2,520,000원이다. 2026학년도에는 변동될 수 있다.\n\n통학 조건은 https://school.test/guide?a=1;b=2 에서 확인한다. 3.5km 이내이다.";
    const $ = guide(summary);
    expect($("h3").text()).toContain("학교별 추가 조건");
    expect($("body").text()).toContain(
      "“등록하지 않으면 취소된다. 단, 학교 확인 필요.”",
    );
    expect($("body").text()).toContain("https://school.test/guide?a=1;b=2");
    expect($("body").text()).toContain("3.5km");
    expect($("[data-admission-topic='교육비']").text()).toContain(
      "2026학년도에는 변동될 수 있어요.",
    );
  });

  it("separates the ordinary birth cohort from explicit deferred/early admission eligibility", () => {
    const $ = guide(main("maewon").summary);
    expect($("[data-admission-topic='지원 대상']").text()).toContain(
      "2019년 출생 적령아동",
    );
    expect($("[data-admission-topic='지원 자격']").text()).toContain(
      "취학의무 유예·전년도 미취학·조기입학 희망 아동이 대상이에요.",
    );
    expect($("[data-admission-topic='지원 대상']").text()).not.toContain(
      "취학의무 유예",
    );
    expect(admissionAudienceRows("2020년 출생, 유예·조기입학 포함")).toEqual([
      { label: "지원 대상", value: "2020년 출생" },
      { label: "지원 자격", value: "유예·조기입학 포함" },
    ]);
  });

  it("does not turn Soongeui's early-admission caution into a new eligibility requirement", () => {
    const $ = guide(main("soongeui").summary, true);
    expect($("[data-admission-topic='유의사항']").text()).toContain(
      "정서적 적응도 신중하게 고려",
    );
    expect($("details:not([open])").text()).not.toContain("신중하게 고려");
    expect($("[data-admission-topic='모집 인원']").text()).toContain("84명");
    expect($("[data-admission-topic='문의']").text()).toContain("3708-9403");
    expect($("[data-admission-topic='통학']").text()).toContain("1,250,000원");
  });

  it("does not make a general undersubscription rule exclusive to twins after resetting paragraph context", () => {
    const $ = guide(main("maewon").summary);
    expect($("[data-admission-topic='쌍둥이 지원']").text()).not.toContain(
      "미달이면 전원 당첨 후 학교장 방식으로 추가모집해요.",
    );
    expect($("[data-admission-topic='추첨']").text()).toContain(
      "미달이면 전원 당첨 후 학교장 방식으로 추가모집해요.",
    );
  });

  it("emphasizes source amounts with their stated year, and distinguishes quota from eligibility", () => {
    const $ = guide(
      "[지원 대상 및 모집인원]\n초등 과정 신입생 84명\n\n[교육비]\n2025학년도 기준 분기 수업료 2,151,000원이다.",
    );
    expect($("[data-admission-topic='모집 인원']").text()).toContain("84명");
    expect($("strong").text()).toContain("2,151,000원");
    expect($("strong").text()).toContain("2025학년도");
  });

  it("retains every source character through sentence boundaries before topic layout, across all 41 school guides", () => {
    expect(bundle.schools).toHaveLength(41);
    const normalize = (text: string) => text.replace(/[\s;；]/gu, "");
    for (const school of bundle.schools)
      for (const admission of school.admissions) {
        for (const section of admissionSections(admission.summary, "check"))
          for (const paragraph of section.paragraphs) {
            expect(
              normalize(admissionReadingItems(paragraph).join("")),
              school.target.slug,
            ).toBe(normalize(paragraph));
          }
      }
  });

  it("never drops or invents numbers, URLs or exceptions when all 69 canonical admissions are regrouped", () => {
    const units = (text: string) =>
      (
        text.match(
          /https?:\/\/\S+|\d[\d,.:/%~-]*|취소|미반환|반환|불합격|미확인|변동|포기/gu,
        ) ?? []
      ).sort();
    for (const school of bundle.schools)
      for (const admission of school.admissions) {
        for (const section of admissionSections(admission.summary, "check")) {
          const groups = admissionReadingGroups(section);
          expect(
            units(groups.flatMap((g) => g.paragraphs).join(" ")),
            `${school.target.slug}: ${section.heading}`,
          ).toEqual(units(section.paragraphs.join(" ")));
        }
      }
  });

  it("keeps CAU and Choongam twin-only follow-up lottery limits under twins", () => {
    const cau = guide(main("cau").summary);
    expect(cau("[data-admission-topic='쌍둥이 지원']").text()).toContain(
      "1회 추첨에서 대표가 당첨되면",
    );
    expect(cau("[data-admission-topic='쌍둥이 지원']").text()).toContain(
      "소수점 올림한 4명까지",
    );
    const choongam = guide(main("choongam").summary);
    expect(choongam("[data-admission-topic='쌍둥이 지원']").text()).toContain(
      "5순위부터는 지정 1인만 입학",
    );
    expect(choongam("[data-admission-topic='추첨']").text()).not.toContain(
      "5순위부터는",
    );
  });

  it("keeps Choongam's waitlist response deadline with the offer, not general registration", () => {
    const $ = guide(main("choongam").summary);
    expect($("[data-admission-topic='대기자·결원 충원']").text()).toContain(
      "다음 날 17시까지 미등록하면 포기로 간주해요.",
    );
    expect($("[data-admission-topic='등록']").text()).not.toContain(
      "다음 날 17시까지",
    );
  });

  it("recognizes Chugye monthly registration fees as tuition and preserves its base year", () => {
    const $ = guide(main("chugye").summary);
    expect($("[data-admission-topic='교육비']").text()).toContain(
      "724,000원으로 2025년 기준",
    );
    expect($("[data-admission-topic='교육비']").text()).toContain(
      "2026학년도에는 변동 가능해요.",
    );
    expect($("[data-admission-topic='등록']").text()).not.toContain(
      "724,000원",
    );
  });

  it("keeps Q&A context, recognises quota breakdowns and separates explicit results notices", () => {
    expect(
      guide("[학부모 Q&A: 교육비·통학·돌봄]\n돌봄교실은 운영하지 않는다.")(
        "h3",
      ).text(),
    ).toBe("학부모 Q&A: 교육비·통학·돌봄");
    expect(admissionAudienceRows("일반67·특별45")).toEqual([
      { label: "모집 인원", value: "일반67·특별45" },
    ]);
    const $ = guide(main("yooseok").summary);
    expect($("[data-admission-topic='결과 발표']").text()).toContain(
      "개별 문자와 학교 홈페이지로 결과를 알려요.",
    );
  });

  it("switches from waitlist discussion back to explicitly named regular registration and year-prefixed fees", () => {
    for (const slug of ["yale", "kyonggi"]) {
      const $ = guide(main(slug).summary);
      expect($("[data-admission-topic='등록']").text(), slug).toContain(
        "11월 18일",
      );
      expect($("[data-admission-topic='등록']").text(), slug).toContain(
        slug === "yale"
          ? "등록한 모든 학교의 입학이 취소돼요."
          : "중복등록은 모두 취소돼요.",
      );
    }
    const $ = guide(main("cheongwon").summary);
    expect($("[data-admission-topic='교육비']").text()).toContain(
      "2025학년도 기준 입학금 100만원, 분기 수업료 178만원",
    );
    expect($("[data-admission-topic='교육비']").text()).toContain(
      "2026학년도에는 변동될 수 있어요.",
    );
  });
});
