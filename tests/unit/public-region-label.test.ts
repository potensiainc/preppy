import { describe, expect, it } from "vitest";
import { publicRegionLabel } from "@/app/_lib/public-region-label";

describe("public region label", () => {
  it.each([
    ["11", "서울"],
    ["KR-11", "서울"],
    ["SEOUL", "서울"],
    ["41", "경기"],
    ["KR-41", "경기"],
    ["서울특별시", "서울특별시"],
    ["경기도", "경기도"],
  ])("shows %s as %s", (input, expected) => {
    expect(publicRegionLabel(input)).toBe(expected);
  });
});
