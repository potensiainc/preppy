import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const modelPath = "../../public/commute/model.js";
const routeViewPath = "../../public/commute/route-view.js";
const { summary, timeLabel } = await import(modelPath);
const { getRouteVariants } = await import(routeViewPath);
const data = JSON.parse(
  await readFile(
    new URL("../../public/commute/data.json", import.meta.url),
    "utf8",
  ),
);
type Stop = {
  name: string;
  time: string;
  direction: string;
  timeNeedsReview?: boolean;
};
type Route = { id: string; stops: Stop[] };
type School = { id: string; routes: Route[] };
const schools: School[] = data.schools;
const school = schools.find((school) => school.id === "cau")!;
const route = school.routes.find((route) => route.id === "cau:2")!;
const stop = route.stops.find((stop) => stop.name === "삼성래미안입구")!;

describe("review of inconsistent commute times", () => {
  it("retains the reported sequence without inventing a corrected time", () => {
    const index = route.stops.indexOf(stop);
    expect(
      route.stops.slice(index - 1, index + 2).map((stop) => stop.time),
    ).toEqual(["07:48", "00:49", "07:50"]);
    expect(timeLabel(stop)).toBe("00:49 · 확인 필요");
    expect(data.snapshot).toBeDefined();
    expect(
      schools.flatMap((school) =>
        school.routes.flatMap((route) =>
          route.stops.filter((stop) => stop.timeNeedsReview),
        ),
      ),
    ).toHaveLength(1);
  });

  it("uses the same uncertainty in school cards, comparison and map stop copies", () => {
    expect(summary(school, {}).clockRange).toBe("시각 확인 필요");
    const variants = getRouteVariants(school);
    const selected = variants.find(
      (variant: { routeId: string; direction: string }) =>
        variant.routeId === "cau:2" && variant.direction === "등교",
    );
    expect(
      timeLabel(selected.stops.find((item: Stop) => item.name === stop.name)),
    ).toBe("00:49 · 확인 필요");
  });

  it("does not mark unrelated regions, missing times or relative minutes as wrong", () => {
    expect(summary(school, { region: "서초구" }).clockRange).not.toBe(
      "시각 확인 필요",
    );
    expect(timeLabel({ timeKind: "missing" })).toBe("시간 미제공");
    expect(timeLabel({ timeKind: "relative_minutes", duration: 5 })).toBe(
      "+5분",
    );
    expect(timeLabel({ timeKind: "clock", time: "07:48" })).toBe("07:48");
    expect(timeLabel({ timeKind: "route_reference", time: "1호차" })).toBe(
      "1호차 참조",
    );
  });
});
