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
import { publicProse } from "@/src/modules/public/ux-writing";
import { ArticleProse } from "@/app/_components/article-prose";

function guideText(summary: string) {
  return load(
    renderToStaticMarkup(
      createElement(AdmissionSections, {
        sections: admissionSections(summary, "ux-guide"),
      }),
    ),
  )("body").text();
}

describe("PREPPY parent-facing UX writing", () => {
  it.each([
    "학교는 “원본만 <strong>제출해야 한다.</strong>”고 안내했다.",
    '학교는 "재학생은 <em>지원할 수 없다.</em>"고 안내했다.',
    "학교는 ‘전형료는 <span>반환하지 않는다.</span>’고 안내했다.",
  ])(
    "preserves a whole quoted paragraph across inline markup: %s",
    (quoted) => {
      const $ = load(
        renderToStaticMarkup(
          createElement(ArticleProse, {
            sanitizedContentHtml: `<p>${quoted}</p><p>등록 전에 서류를 확인한다.</p>`,
          }),
        ),
      );
      expect($(".article-prose > p").first().html()).toBe(quoted);
      expect($(".article-prose > p").last().text()).toBe(
        "등록 전에 서류를 확인해요.",
      );
    },
  );
  it("keeps an incomplete quotation verbatim and replaces only unquoted semicolon separators", () => {
    expect(publicProse("학교는 “원본만 제출해야 한다.")).toBe(
      "학교는 “원본만 제출해야 한다.",
    );
    expect(
      publicProse("초등학교 1~6학년 (교육과정 기준; 신입생 모집 대상 아님)"),
    ).toBe("초등학교 1~6학년 (교육과정 기준, 신입생 모집 대상 아님)");
    expect(publicProse("“원본; 사본 금지” https://school.test/a;b=1")).toBe(
      "“원본; 사본 금지” https://school.test/a;b=1",
    );
  });
  it("does not conjugate proper nouns, quoted text or unknown endings and is idempotent", () => {
    for (const input of [
      "바다.",
      "사이다.",
      "“신입생은 서류를 제출한다.”",
      "https://school.test/한다",
      "[모집한다]",
      "상세 조건은 다를지도 모른다.",
    ]) {
      expect(publicProse(input)).toBe(input);
    }
    expect(publicProse(publicProse("서류는 원본만 가능합니다."))).toBe(
      "서류는 원본만 가능해요.",
    );
  });

  it("uses the same register for article prose without changing quotations, markup or external destinations", () => {
    const html =
      '<h2>입학 안내</h2><p>서류는 원본만 제출해야 한다.</p><blockquote><p>재학생은 지원할 수 없다.</p></blockquote><p>2025학년도 수업료는 <strong>2,312,100원</strong>이다.</p><p><a href="https://school.test/guide.pdf?year=2027">공식 안내</a>를 확인한다.</p>';
    const $ = load(
      renderToStaticMarkup(
        createElement(ArticleProse, { sanitizedContentHtml: html }),
      ),
    );
    expect($(".article-prose > p").first().text()).toBe(
      "서류는 원본만 제출해야 해요.",
    );
    expect($("blockquote").text()).toBe("재학생은 지원할 수 없다.");
    expect($("strong").text()).toBe("2,312,100원");
    expect($("h2").text()).toBe("입학 안내");
    expect($("a").attr("href")).toBe("https://school.test/guide.pdf?year=2027");
    expect($(".article-prose").text()).toContain(
      "2025학년도 수업료는 2,312,100원이에요.",
    );
  });
  it.each([
    [
      "확인 기간은 2025년 1월 1일~2026년 10월 31일이다.",
      "확인 기간은 2025년 1월 1일~2026년 10월 31일이에요.",
    ],
    [
      "조건은 금요일 저녁 예배 출석이다.",
      "조건은 금요일 저녁 예배 출석이에요.",
    ],
    ["원본 서류만 제출해야 한다.", "원본 서류만 제출해야 해요."],
    ["재학생은 지원할 수 없다.", "재학생은 지원할 수 없어요."],
    ["중복등록하면 입학이 취소된다.", "중복등록하면 입학이 취소돼요."],
    ["불참하면 입학이 취소될 수 있다.", "불참하면 입학이 취소될 수 있어요."],
    ["전형료는 반환하지 않는다.", "전형료는 반환하지 않아요."],
    ["서류는 원본만 가능합니다.", "서류는 원본만 가능해요."],
    ["통학비는 별도다.", "통학비는 별도예요."],
    ["지원 대상은 2020년생이다.", "지원 대상은 2020년생이에요."],
    [
      "합격자를 학교 홈페이지에서 알린다.",
      "합격자를 학교 홈페이지에서 알려요.",
    ],
    [
      "쌍둥이는 각자 추첨 또는 대표 추첨을 고른다.",
      "쌍둥이는 각자 추첨 또는 대표 추첨을 골라요.",
    ],
    ["비율은 각각 50%다.", "비율은 각각 50%예요."],
    ["지원은 최대 3개교다.", "지원은 최대 3개교예요."],
    ["제출물은 개인정보활용 동의서다.", "제출물은 개인정보활용 동의서예요."],
    [
      "입금자명은 수험번호와 학생 이름이다.",
      "입금자명은 수험번호와 학생 이름이에요.",
    ],
    ["미달이면 전원 당첨이다.", "미달이면 전원 당첨이에요."],
    ["노선은 운행하지 않는다고 적었다.", "노선은 운행하지 않는다고 적었어요."],
    [
      "확인할 내용은 예배에 성실히 참여했는지다.",
      "확인할 내용은 예배에 성실히 참여했는지예요.",
    ],
  ])(
    "changes register without weakening this condition: %s",
    (input, expected) => {
      expect(guideText(input)).toBe(expected);
    },
  );

  it("keeps historical amounts, school-confirmation caveats and original-only conditions together", () => {
    const text = guideText(
      "[교육비]\n2025학년도 1분기 수업료는 2,312,100원이다. 2027학년도에는 변동될 수 있다.\n\n[제출 서류]\n원본만 제출해야 한다. 정확한 마감은 학교 확인이 필요하다.",
    );
    expect(text).toContain("2025학년도 1분기 수업료는 2,312,100원이에요.");
    expect(text).toContain("2027학년도에는 변동될 수 있어요.");
    expect(text).toContain("원본만 제출해야 해요.");
    expect(text).toContain("정확한 마감은 학교 확인이 필요해요.");
  });

  it("preserves direct quotations, proper labels and punctuation inside links", () => {
    const text = guideText(
      "[제출 서류]\n학교는 “원본만 제출한다.”고 안내한다. 지원 URL: https://school.test/guide.pdf?next=한다.;mode=all\n지원 대상은 “바다”반이다.",
    );
    expect(text).toContain("“원본만 제출한다.”고 안내해요.");
    expect(text).toContain("https://school.test/guide.pdf?next=한다.;mode=all");
    expect(text).toContain("“바다”반이에요.");
  });

  it("keeps audience rules in separate labeled rows without semicolon-packed prose", () => {
    const $ = load(
      renderToStaticMarkup(
        createElement(AdmissionAudience, {
          value: "2020년 출생;84명;재학생은 지원할 수 없다.",
        }),
      ),
    );
    expect(
      $("dd")
        .map((_, el) => $(el).text())
        .get(),
    ).toEqual(["2020년 출생", "84명", "재학생은 지원할 수 없어요."]);
  });

  it("gives collection and human review separate Korean labels with unchanged timestamps and links", () => {
    const $ = load(
      renderToStaticMarkup(
        createElement(AdmissionSources, {
          sources: [
            {
              name: "공식 모집 안내",
              url: "https://school.test/guide.pdf",
              authorityLevel: "PRIMARY",
            },
          ],
          collectedAt: "2026-08-30T00:00:00Z",
          verifiedAt: "2026-08-31T00:00:00Z",
        }),
      ),
    );
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

  it("retains every numeric/source token across all 69 stored admission guides", () => {
    const bundle = JSON.parse(
      readFileSync(
        "data/corrections/PREPPY_PRIVATE_ELEMENTARY_FULL_GUIDES_20260831.json",
        "utf8",
      ),
    ) as {
      schools: {
        target: { slug: string };
        admissions: { summary: string }[];
      }[];
    };
    const admissions = bundle.schools.flatMap((school) => school.admissions);
    expect(admissions).toHaveLength(69);
    for (const admission of admissions) {
      // The existing document-commentary policy is unchanged. This regression
      // guards the new display register against changing any surviving fact.
      const before = publicAdmissionText(admission.summary)!;
      const after = guideText(admission.summary);
      for (const token of before.match(
        /https?:\/\/\S+|[\w.+-]+@[\w.-]+\.[A-Za-z]+|\d[\d,:.~/%-]*/gu,
      ) ?? []) {
        expect(after, token).toContain(token);
      }
    }
  });
});
