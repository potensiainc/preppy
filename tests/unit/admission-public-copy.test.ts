import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { describe, expect, it } from "vitest";
import {
  AdmissionAudience,
  AdmissionSections,
  AdmissionSources,
} from "@/app/_components/admissions-content";
import { admissionSections } from "@/app/_lib/admissions-presentation";
import { publicAdmissionText } from "@/src/modules/public/admission-copy";

const guides = JSON.parse(
  readFileSync(
    "data/corrections/PREPPY_PRIVATE_ELEMENTARY_FULL_GUIDES_20260831.json",
    "utf8",
  ),
) as {
  schools: {
    target: { slug: string };
    admissions: {
      key: string;
      summary: string;
      targetAudience: string | null;
    }[];
  }[];
};
const admissions = guides.schools.flatMap((school) => school.admissions);
const renderGuide = (summary: string) =>
  load(
    renderToStaticMarkup(
      createElement(AdmissionSections, {
        sections: admissionSections(summary, "test"),
      }),
    ),
  )("body").text();

describe("parent-facing admission copy", () => {
  it.each([
    ["skes", ["1,000,000원", "1,990,000원", "월 약 663,000원"]],
    [
      "donggwang",
      [
        "원서접수 기간 안에",
        "지정 이메일(nammi91@sen.go.kr)로 제출해요.",
        "입금자명은 수험번호와 학생 이름",
        "유효기간은 당해 학년도인 2027년 2월 말까지로 안내되어 있으나",
        "2027년도 모집 학년도와의 관계는 학교에 확인해야 해요",
      ],
    ],
    [
      "seoul-dongsan",
      [
        "가족관계증명서를 학생 본인 기준·일반으로 발급",
        "구글 로그인이 필요할 수 있어요.",
        "정확한 마감은 학교 확인이 필요해요.",
      ],
    ],
    [
      "kumsung",
      [
        "동의 거부 권리가 있으나",
        "해당 교육서비스 이용에 제한이 생길 수 있어요",
      ],
    ],
    ["gyeseong1882", ["수업료는 2025학년도 1분기 기준", "다음 학년도 변동"]],
    [
      "uchon",
      [
        "2026학년도에는 변동될 수 있어요",
        "2018년생 취학유예자",
        "2024학년도 유예 조건은 출생연도와 학년도 관계를 학교에 확인해야 해요",
      ],
    ],
    ["suwoncca", ["입학금과 수업료는 자율화되어 있어요."]],
  ])(
    "preserves reviewed conditions through the complete stored %s guide",
    (slug, facts) => {
      const admission = guides.schools
        .find((school) => school.target.slug === slug)!
        .admissions.find((item) => item.key === "main")!;
      const text = renderGuide(admission.summary);
      for (const fact of facts) expect(text).toContain(fact);
      expect(text).not.toMatch(/원문|HTML|재게시/u);
      const account = /원문 계좌는 (.+?)이다/u.exec(admission.summary)?.[1];
      if (account) expect(text).not.toContain(account);
    },
  );

  it.each([
    [
      "입학금은 입학 시 1회 1,000,000원, 수업료는 1분기 1,990,000원(원문 월 약 663,000원)이다.",
      ["1,000,000원", "1,990,000원", "월 약 663,000원"],
    ],
    [
      "이 서류는 원서접수 기간 안에 원문 지정 이메일(nammi91@sen.go.kr)로 제출한다.",
      ["원서접수 기간 안에", "지정 이메일(nammi91@sen.go.kr)로 제출한다."],
    ],
    [
      "연결 HTML은 가족관계증명서를 학생 본인 기준·일반으로 발급하도록 안내하며 파일 첨부 과정에 구글 로그인이 필요할 수 있다.",
      [
        "가족관계증명서를 학생 본인 기준·일반으로 발급",
        "구글 로그인이 필요할 수 있다.",
      ],
    ],
  ])(
    "preserves actionable facts alongside source narration: %s",
    (input, facts) => {
      const text = publicAdmissionText(input as string);
      expect(text).not.toBeNull();
      for (const fact of facts) expect(text).toContain(fact);
      expect(text).not.toMatch(/원문|HTML/u);
    },
  );

  it("preserves exact URLs while cleaning document labels and remains stable when applied twice", () => {
    const text =
      "[모집요강 PDF]\n지원 주소: https://school.test/guide.pdf?download=1.\n특수교육대상자는 별도 전형이며 전형별 상세 자격은 공식 PDF 참조.";
    const cleaned = publicAdmissionText(text)!;
    expect(cleaned).toContain("https://school.test/guide.pdf?download=1.");
    expect(cleaned).toContain("[모집요강]");
    expect(publicAdmissionText(cleaned)).toBe(cleaned);
  });
  it("removes the reported PDF audit commentary while preserving eligibility and application dates", () => {
    const admission = admissions.find((item) =>
      item.summary.includes("PDF 3쪽"),
    )!;
    const text = renderGuide(admission.summary);
    expect(text).not.toMatch(
      /PDF|\d+(?:[·,]\d+)*쪽|원문|확인 범위|두 표현|보존|적혀/u,
    );
    expect(text).toContain("10월 9~21일");
    expect(text).toContain("수요일은 16:00 마감");
    expect(text).toContain("불참하면 입학이 취소돼요");
    expect(text).toContain("일정 변경 시 홈페이지");
    const audience = load(
      renderToStaticMarkup(
        createElement(AdmissionAudience, { value: admission.targetAudience }),
      ),
    )("body").text();
    expect(audience).not.toMatch(/PDF|참조/u);
    expect(audience).toContain(
      "특수교육대상자는 일반(추첨)전형이 아닌 별도 전형",
    );
  });

  it("does not show source formats, page references or audit headings in any stored guide", () => {
    for (const admission of admissions) {
      expect(
        renderGuide(admission.summary).match(
          /\b(?:PDF|HWPX?|HTML|ZIP)\b|원문|원본\s*(?:이미지|파일)|확인 범위|\d+(?:\s*[·,~–-]\s*\d+)*\s*(?:쪽|페이지)/giu,
        ),
        admission.summary.slice(0, 70),
      ).toBeNull();
    }
  });

  it("keeps real warnings, amounts and page-qualified facts without document narration", () => {
    const text = renderGuide(
      "[지원 자격]\n특수교육대상자는 별도 전형이며 전형별 상세 자격은 공식 PDF 참조.\n\n[유의사항]\nPDF 4,5쪽에 따르면 중복등록은 모두 취소된다.\n\n수업료는 원문상 2025학년도 기준 2,520,000원이며 2026학년도 변동 가능하다.",
    );
    expect(text).toContain("특수교육대상자는 별도 전형");
    expect(text).toContain("중복등록은 모두 취소돼요");
    expect(text).toContain("2025학년도 기준 2,520,000원");
    expect(text).toContain("2026학년도 변동 가능해요");
    expect(text).not.toMatch(/PDF|쪽|원문|참조/u);
  });

  it("keeps original-document submission requirements and negative eligibility rules", () => {
    expect(
      renderGuide(
        "[유의사항]\n서류는 원본만 가능합니다.\nPDF 4쪽에 따르면 재학생은 지원할 수 없다.",
      ),
    ).toContain("서류는 원본만 가능해요.");
    expect(
      renderGuide("[지원 자격]\nPDF 4쪽에 따르면 재학생은 지원할 수 없다."),
    ).toContain("재학생은 지원할 수 없어요.");
  });

  it("keeps official links and distinct timestamps but hides file types and document review explanations", () => {
    const $ = load(
      renderToStaticMarkup(
        createElement(AdmissionSources, {
          sources: [
            {
              name: "2027 모집요강 PDF",
              url: "https://school.test/guide.pdf",
              authorityLevel: "PRIMARY",
            },
          ],
          collectedAt: "2026-08-30T00:00:00Z",
          verifiedAt: "2026-08-31T00:00:00Z",
        }),
      ),
    );
    expect($("body").text()).not.toMatch(/PDF|원문|원본/u);
    expect(
      $("dt")
        .map((_, el) => $(el).text())
        .get(),
    ).toEqual(["자료 수집", "내용 확인"]);
    expect(
      $("time")
        .map((_, el) => $(el).attr("datetime"))
        .get(),
    ).toEqual(["2026-08-30T00:00:00Z", "2026-08-31T00:00:00Z"]);
    expect($("a").attr("href")).toBe("https://school.test/guide.pdf");
  });
});
