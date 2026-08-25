import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { resolveRouteScrollAction } from "@/app/_components/route-scroll-policy";

describe("WP-UI-02 public route scroll restoration", () => {
  it("returns to the top after a real pathname change", () => {
    expect(
      resolveRouteScrollAction({
        previousPathname: "/institutions",
        nextPathname: "/opportunities/demo-admission",
        hash: "",
      }),
    ).toBe("TOP");
  });

  it("preserves position for same-path query navigation", () => {
    expect(
      resolveRouteScrollAction({
        previousPathname: "/institutions",
        nextPathname: "/institutions",
        hash: "",
      }),
    ).toBe("PRESERVE");
  });

  it("preserves native anchor behavior when a hash target is present", () => {
    expect(
      resolveRouteScrollAction({
        previousPathname: "/institutions",
        nextPathname: "/",
        hash: "#current-opportunities",
      }),
    ).toBe("PRESERVE");
  });

  it("wires one pathname-only client observer into the public shell", async () => {
    const [component, layout] = await Promise.all([
      readFile(
        new URL(
          "../../app/_components/route-scroll-to-top.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL("../../app/(public)/layout.tsx", import.meta.url),
        "utf8",
      ),
    ]);

    expect(component).toContain('"use client"');
    expect(component).toContain("usePathname");
    expect(component).not.toContain("useSearchParams");
    expect(component).toContain("window.location.hash");
    expect(component).toContain("window.scrollTo");
    expect(layout).toContain("<RouteScrollToTop />");
  });
});
