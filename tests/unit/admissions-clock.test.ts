import { afterEach, describe, expect, it, vi } from "vitest";
import { admissionClock } from "@/app/_lib/admissions-presentation";

afterEach(() => vi.restoreAllMocks());

describe("admissionClock", () => {
  it("keeps Korean day periods when the host ICU uses English for ko-KR", () => {
    const OriginalDateTimeFormat = Intl.DateTimeFormat;
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(
      function DateTimeFormat(locales, options) {
        if (locales === "ko-KR" && options?.hour12 === true) {
          return { format: () => "PM 2:00" } as unknown as Intl.DateTimeFormat;
        }
        return new OriginalDateTimeFormat(locales, options);
      },
    );

    expect(admissionClock("2026-10-31T05:00:00.000Z")).toBe("오후 2:00 KST");
    expect(admissionClock("2026-10-31T01:00:00.000Z")).toBe("오전 10:00 KST");
    expect(admissionClock("2026-10-30T15:00:00.000Z")).toBe("오전 12:00 KST");
    expect(admissionClock("2026-10-31T03:00:00.000Z")).toBe("오후 12:00 KST");
  });

  it("keeps local time without inventing a Korean time zone", () => {
    expect(admissionClock("2026-10-31T14:15")).toBe("오후 2:15 · 현지 시각");
    expect(admissionClock("2026-10-31")).toBeNull();
  });
});
