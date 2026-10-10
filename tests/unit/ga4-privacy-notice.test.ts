import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { privacyContent } from "@/src/modules/legal/content";

describe("GA4 privacy notice", () => {
  it("serves the published policy text and preserves the earlier policy terms", () => {
    const current = readFileSync(
      "docs/PREPPY_PRIVACY_FINAL_2026-10-10.md",
      "utf8",
    ).replace(/\r\n/g, "\n");
    const previous = readFileSync(
      "docs/PREPPY_PRIVACY_FINAL_2026-09-26.md",
      "utf8",
    ).replace(/\r\n/g, "\n");

    expect(privacyContent.trim()).toBe(current.trim());
    for (const condition of [
      "가입 대기 중인 정보는 최종 가입 여부 확인에 사용해요.",
      "로그인 쿠키는 발급 후 최대 24시간",
      "이메일 발송업체로의 회원 정보 이전은 현재 시행하지 않아요.",
      "법령상 보존 의무가 있는 기록은 별도로 보관하고",
    ]) {
      expect(previous).toContain(condition);
      expect(current).toContain(condition);
    }
    expect(current).toContain("방문 분석을 허용한 경우에만");
    expect(current).toContain("분석 쿠키는 설정 후 최대 90일");
    expect(current).toContain("분석을 거부해도 회원 기능을 이용할 수 있어요.");
    expect(current).toContain("허용 후 거부하면 이후의 분석 전송을 멈춰요.");
  });
});
