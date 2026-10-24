import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  assertHeaderAuthControl,
  assertNoDuplicateLogin,
  assertPublicHeaderAuth,
  LOGIN_FREE_FILES,
  PUBLIC_HEADER_FILE,
} from "../../scripts/deploy/assert-header-auth.mjs";
import { assertBrandIcons } from "../../scripts/deploy/assert-brand-icons.mjs";
import { assertReleaseBaseline } from "../../scripts/deploy/check-release-baseline.mjs";

describe("public release regression guards", () => {
  it("requires the header login control (Owner decision 2026-10-24)", () => {
    expect(PUBLIC_HEADER_FILE).toBe("app/_components/site-header.tsx");
    expect(() => assertHeaderAuthControl("<header></header>")).toThrow(
      "2026-10-24",
    );
    expect(() =>
      assertHeaderAuthControl("<div>\n  <AuthControl />\n</div>"),
    ).not.toThrow();
  });

  it.each(LOGIN_FREE_FILES)(
    "blocks a second raw Kakao login link in the %s",
    (name) => {
      expect(() =>
        assertNoDuplicateLogin(
          name,
          '<Link href="/auth/kakao/start">로그인</Link>',
        ),
      ).toThrow("second Kakao login link");
    },
  );

  it("does not guard the follow button's user-chosen login hand-off", () => {
    expect(LOGIN_FREE_FILES.map(([, file]) => file)).not.toContain(
      "app/_components/follow-cta.tsx",
    );
  });

  it("accepts the current public header, menu and footer", async () => {
    const sources = new Map<string, string>();
    for (const file of [
      PUBLIC_HEADER_FILE,
      ...LOGIN_FREE_FILES.map(([, file]) => file),
    ]) {
      sources.set(
        file,
        await readFile(new URL(`../../${file}`, import.meta.url), "utf8"),
      );
    }
    expect(() =>
      assertPublicHeaderAuth((file) => sources.get(file) ?? ""),
    ).not.toThrow();
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
      "node scripts/deploy/assert-header-auth.mjs",
    );
    expect(pkg.scripts.prebuild).toContain(
      "node scripts/deploy/assert-brand-icons.mjs",
    );
    expect(pkg.scripts["deploy:preflight"]).toBe(
      "node scripts/deploy/check-release-baseline.mjs",
    );
    expect(await read("Dockerfile")).toContain(
      "RUN node scripts/deploy/assert-header-auth.mjs && npm run build",
    );
    expect(await read(".github/workflows/public-release-guard.yml")).toContain(
      "npm run prebuild",
    );
  });
});
