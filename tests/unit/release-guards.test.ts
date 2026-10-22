import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  assertHeaderAuthAbsence,
  PUBLIC_HEADER_FILES,
} from "../../scripts/deploy/assert-header-auth-absence.mjs";
import { assertBrandIcons } from "../../scripts/deploy/assert-brand-icons.mjs";
import { assertReleaseBaseline } from "../../scripts/deploy/check-release-baseline.mjs";

describe("public release regression guards", () => {
  it.each([
    "<AuthControl />",
    '<a href="/auth/kakao/start">로그인</a>',
    "카카오로 로그인",
    "카카오 로그인",
    'class="auth-control"',
  ])("blocks reintroduced header authentication: %s", (source) => {
    expect(() => assertHeaderAuthAbsence("test header", source)).toThrow(
      "Owner approval",
    );
  });

  it("guards the header, its menu and the footer", () => {
    expect(PUBLIC_HEADER_FILES.map(([, file]) => file)).toEqual([
      "app/_components/site-header.tsx",
      "app/_components/site-menu.tsx",
      "app/_components/site-footer.tsx",
      "public/commute/index.html",
    ]);
  });

  it("blocks a Kakao login link added to the shared menu", () => {
    expect(() =>
      assertHeaderAuthAbsence(
        "shared site menu",
        '<Link href="/auth/kakao/start">로그인</Link>',
      ),
    ).toThrow("Owner approval");
  });

  it("does not guard the follow button's user-chosen login hand-off", () => {
    expect(PUBLIC_HEADER_FILES.map(([, file]) => file)).not.toContain(
      "app/_components/follow-cta.tsx",
    );
  });

  it("accepts current public headers with clean navigation", async () => {
    for (const [, file] of PUBLIC_HEADER_FILES) {
      const source = await readFile(
        new URL(`../../${file}`, import.meta.url),
        "utf8",
      );
      expect(() => assertHeaderAuthAbsence(file, source)).not.toThrow();
    }
  });

  it("keeps the approved icon assets and install manifest together", () => {
    expect(() => assertBrandIcons()).not.toThrow();
  });

  it("blocks a missing or replaced approved icon", () => {
    expect(() =>
      assertBrandIcons((name: string) =>
        name === "app/icon.png"
          ? Buffer.from("replacement")
          : readFileSync(name),
      ),
    ).toThrow("approved PREPPY icon");
  });

  it("blocks a clean but outdated release branch", () => {
    expect(() =>
      assertReleaseBaseline({ dirty: false, includesMain: false }),
    ).toThrow("latest origin/main");
  });
  it("blocks uncommitted release contents", () => {
    expect(() =>
      assertReleaseBaseline({ dirty: true, includesMain: true }),
    ).toThrow("working tree");
  });
  it("accepts a clean integrated release", () => {
    expect(() =>
      assertReleaseBaseline({ dirty: false, includesMain: true }),
    ).not.toThrow();
  });

  it("keeps the guard wired into npm, Docker, and PR checks", async () => {
    const read = (file: string) =>
      readFile(new URL(`../../${file}`, import.meta.url), "utf8");
    const pkg = JSON.parse(await read("package.json"));
    expect(pkg.scripts.prebuild).toContain(
      "node scripts/deploy/assert-header-auth-absence.mjs",
    );
    expect(pkg.scripts.prebuild).toContain(
      "node scripts/deploy/assert-brand-icons.mjs",
    );
    expect(pkg.scripts["deploy:preflight"]).toBe(
      "node scripts/deploy/check-release-baseline.mjs",
    );
    expect(await read("Dockerfile")).toContain(
      "RUN node scripts/deploy/assert-header-auth-absence.mjs && npm run build",
    );
    expect(await read(".github/workflows/public-release-guard.yml")).toContain(
      "npm run prebuild",
    );
  });
});
