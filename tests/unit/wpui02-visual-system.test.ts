import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("WP-UI-02 public visual system", () => {
  it("loads the locked Korean and Latin sans-serif families through next/font", async () => {
    const layout = await readFile(
      new URL("../../app/layout.tsx", import.meta.url),
      "utf8",
    );

    expect(layout).toContain('from "next/font/google"');
    expect(layout).toContain("IBM_Plex_Sans_KR");
    expect(layout).toContain("DM_Sans");
    expect(layout).toContain("--font-preppy-korean");
    expect(layout).toContain("--font-preppy-latin");
  });

  it("uses the approved bright palette and removes the serif template treatment", async () => {
    const css = await readFile(
      new URL("../../app/globals.css", import.meta.url),
      "utf8",
    );

    expect(css).toMatch(/--paper:\s*#fbfbf8/i);
    expect(css).toMatch(/--surface:\s*#fff(?:fff)?/i);
    expect(css).toMatch(/--secondary-surface:\s*#f5f6f3/i);
    expect(css).toMatch(/--ink:\s*#171a18/i);
    expect(css).toMatch(/--muted-ink:\s*#676d68/i);
    expect(css).toMatch(/--rule:\s*#e5e8e3/i);
    expect(css).toMatch(/--accent:\s*#315c50/i);
    expect(css).not.toMatch(/Noto Serif KR|Iowan Old Style|Batang/);
    expect(css).not.toMatch(/linear-gradient|radial-gradient|backdrop-filter/);
  });

  it("keeps public controls restrained instead of relying on heavy weights", async () => {
    const css = await readFile(
      new URL("../../app/globals.css", import.meta.url),
      "utf8",
    );

    expect(css).not.toMatch(/font-weight:\s*(?:700|800|900)/);
    expect(css).toContain("border-radius: 10px");
    expect(css).toContain("border-radius: 12px");
  });
});
