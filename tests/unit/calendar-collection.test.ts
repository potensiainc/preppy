import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { describe, expect, it } from "vitest";
import { CalendarCollection } from "@/app/_components/calendar-collection";
import {
  calendarCollection,
  calendarFilterHref,
  calendarInstitutionType,
  parseCalendarFilter,
} from "@/app/_lib/calendar-institution-types";
import type { OpportunityCardDTO } from "@/src/modules/public/dto";
import { extractLiveAdmissionProposal } from "@/src/modules/live-admissions/extractor";

function item(
  category: OpportunityCardDTO["institution"]["category"],
  id: string,
): OpportunityCardDTO {
  return {
    id,
    slug: `session-${id}`,
    title: "2027학년도 입학설명회",
    kind: "INFORMATION_SESSION",
    businessState: "UPCOMING",
    keyDate: "2026-11-07T01:00:00.000Z",
    institution: {
      id: `school-${id}`,
      slug: `school-${id}`,
      name: "국제학교라는 이름의 영어유치원과아주긴이름을가진캠퍼스",
      category,
      region: "SEOUL",
      followable: false,
    },
    lastVerifiedAt: "2026-10-18T03:00:00.000Z",
    indexability: "NOINDEX",
  };
}
const fixtures = [
  item("ENGLISH_KINDERGARTEN", "english"),
  item("INTERNATIONAL_SCHOOL", "international"),
  item("PRIVATE_ELEMENTARY", "elementary"),
];
function render(filter = "ALL", items = fixtures) {
  return load(
    renderToStaticMarkup(
      createElement(CalendarCollection, {
        items,
        filter: parseCalendarFilter(filter),
      }),
    ),
  );
}
describe("calendar institution type discovery", () => {
  it("filters by verified institution category regardless of school name", () => {
    const result = calendarCollection(fixtures, "ENGLISH_KINDERGARTEN");
    expect(result.items.map((x) => x.id)).toEqual(["english"]);
    expect(result.counts).toMatchObject({
      ALL: 3,
      ENGLISH_KINDERGARTEN: 1,
      INTERNATIONAL_SCHOOL: 1,
      PRIVATE_ELEMENTARY: 1,
    });
  });
  it.each([
    undefined,
    "wrong",
    ["INTERNATIONAL_SCHOOL"],
    "INFORMATION_SESSION",
    "international_school",
  ])("safely defaults an invalid filter %j to all", (value) =>
    expect(parseCalendarFilter(value)).toBe("ALL"),
  );
  it("keeps unknown categories explicitly unclassified without guessing", () => {
    const unknown = {
      ...fixtures[0]!,
      institution: { ...fixtures[0]!.institution, category: "UNRECOGNIZED" },
    } as unknown as OpportunityCardDTO;
    expect(calendarInstitutionType(unknown.institution.category).value).toBe(
      "UNCLASSIFIED",
    );
    const $ = render("UNCLASSIFIED", [unknown]);
    expect($("article[data-type='unknown']").length).toBe(1);
    expect($("nav a[aria-current='page']").text()).toContain(
      "기관 유형 미확인",
    );
  });
  it("exposes four keyboard-native filter links, counts and selected state in the URL", () => {
    const $ = render("INTERNATIONAL_SCHOOL");
    expect($("nav[aria-label='기관 유형 필터'] a").length).toBe(4);
    expect($("nav a[aria-current='page']").attr("href")).toBe(
      calendarFilterHref("INTERNATIONAL_SCHOOL"),
    );
    expect($("article").length).toBe(1);
    expect($("article").attr("data-type")).toBe("international");
    expect($("nav a[aria-disabled]").length).toBe(0);
  });
  it("shows persistent text type badges separately from schedule kind and business state", () => {
    const $ = render();
    for (const label of ["영어유치원", "국제학교", "사립초"])
      expect($("article > div:first-child").text()).toContain(label);
    expect($("article[data-type='english']").text()).toContain("(학원)");
    expect($("article").first().text()).toContain("입학설명회");
    expect($("article [aria-hidden='true']").length).toBe(3);
  });
  it("preserves full school/title text and distinct detail links for browser-back restoration", () => {
    const $ = render("ENGLISH_KINDERGARTEN");
    expect($("article p a").text()).toBe(fixtures[0]!.institution.name);
    expect($("article h3 a").attr("href")).toBe(
      "/opportunities/session-english",
    );
    expect($("article p a").attr("href")).toBe("/institutions/school-english");
    expect($("nav a[aria-current='page']").attr("href")).toContain(
      "category=ENGLISH_KINDERGARTEN",
    );
  });
  it("does not infer published time precision from an ISO instant", () => {
    let $ = render();
    expect($("article time").first().text()).toBe("2026년 11월 7일");
    $ = render("ALL", [{ ...fixtures[0]!, keyDate: "2026-11-07" }]);
    expect($("article time").text()).not.toMatch(/00:00|10:00/);
    expect($("article time").attr("datetime")).toBe("2026-11-07");
  });
  it("does not display synthetic midnight from a real date-only extraction", () => {
    const proposal = extractLiveAdmissionProposal({
      html: "<h1>2027학년도 신입생 모집</h1><p>원서 접수: 2026년 11월 6일 ~ 2026년 11월 10일</p>",
      sourceUrl: "https://school.example.test/admission",
      classificationHint: "ADMISSIONS",
      targetAcademicYearLabel: "2027학년도",
      referenceTime: new Date("2026-10-19T00:00:00Z"),
    });
    expect(proposal.applicationOpenAt?.toISOString()).toBe(
      "2026-11-05T15:00:00.000Z",
    );
    const $ = render("ALL", [
      { ...fixtures[0]!, keyDate: proposal.applicationOpenAt!.toISOString() },
    ]);
    expect($("article > p time").text()).toBe("2026년 11월 6일");
    expect($("article > p time").text()).not.toContain("00:00");
  });
  it("shows an unknown date rather than inventing one", () => {
    const $ = render("ALL", [{ ...fixtures[0]!, keyDate: null }]);
    expect($("article > p time").length).toBe(0);
    expect($("article").text()).toContain("날짜 미확인");
  });
  it("keeps zero-count filters usable and explains scope with recovery links", () => {
    const $ = render("INTERNATIONAL_SCHOOL", [fixtures[0]!]);
    expect($("article").length).toBe(0);
    expect($.text()).toContain("이 목록에는 국제학교 일정이 없어요");
    expect($.text()).toContain("학교의 일정이 없다는 뜻은 아니에요");
    expect($.text()).toContain("홈에 소개된 1개 일정");
    expect($("a[href='/curation/calendar']").length).toBe(2);
  });
  it("reports only the supplied curated list, including all-empty state", () => {
    const $ = render("ALL", []);
    expect($.text()).toContain("홈에 소개된 0개 일정");
    expect($.text()).not.toContain("213");
    expect($("a[href='/institutions']").length).toBe(1);
    expect(
      $("a").filter((_, a) => $(a).text() === "전체 일정 보기").length,
    ).toBe(0);
  });
});
