import { describe, expect, it } from "vitest";

import {
  PREVIEW_DEMO_FIXTURE,
  assertPreviewSeedTarget,
} from "@/scripts/seed-preview-demo";

describe("WP-UI-01 Preview demo seed contract", () => {
  it("defines a clearly synthetic 6/6/3 public review fixture", () => {
    expect(PREVIEW_DEMO_FIXTURE.institutions).toHaveLength(6);
    expect(
      PREVIEW_DEMO_FIXTURE.institutions.reduce<Record<string, number>>(
        (counts, institution) => ({
          ...counts,
          [institution.type]: (counts[institution.type] ?? 0) + 1,
        }),
        {},
      ),
    ).toEqual({
      ENGLISH_KINDERGARTEN: 2,
      PRIVATE_ELEMENTARY: 2,
      INTERNATIONAL_SCHOOL: 2,
    });
    expect(PREVIEW_DEMO_FIXTURE.opportunities).toHaveLength(6);
    expect(
      new Set(PREVIEW_DEMO_FIXTURE.opportunities.map(({ type }) => type)),
    ).toEqual(
      new Set([
        "INFORMATION_SESSION",
        "OPEN_HOUSE",
        "APPLICATION",
        "ASSESSMENT",
        "DEADLINE",
      ]),
    );
    expect(PREVIEW_DEMO_FIXTURE.articles).toHaveLength(3);
    expect(
      PREVIEW_DEMO_FIXTURE.institutions.every(({ name }) =>
        name.includes("데모"),
      ),
    ).toBe(true);
  });

  it("fails closed unless the exact Railway Preview target is proven", () => {
    const safe = {
      databaseUrl: "postgres://preview@postgres.railway.internal:5432/railway",
      projectName: "preppy-ui-preview",
      environmentName: "preview",
      serviceName: "preppy-web-preview",
    } as const;

    expect(assertPreviewSeedTarget(safe)).toEqual({
      projectName: "preppy-ui-preview",
      environmentName: "preview",
      serviceName: "preppy-web-preview",
      databaseHost: "postgres.railway.internal",
    });

    for (const unsafe of [
      { ...safe, projectName: "preppy-production" },
      { ...safe, environmentName: "production" },
      { ...safe, serviceName: "preppy-worker" },
      { ...safe, databaseUrl: "postgres://preview@public.proxy:5432/railway" },
    ]) {
      expect(() => assertPreviewSeedTarget(unsafe)).toThrow(
        "Preview seed target was not proven",
      );
    }
  });
});
