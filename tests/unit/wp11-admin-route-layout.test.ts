import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import PublicLayout from "@/app/(public)/layout";
import RootError from "@/app/error";
import RootLayout from "@/app/layout";
import RootNotFound from "@/app/not-found";

const repositoryRoot = resolve(import.meta.dirname, "../..");

async function readSource(path: string): Promise<string> {
  return readFile(resolve(repositoryRoot, path), "utf8");
}

async function importOptional<T>(specifier: string): Promise<T | null> {
  try {
    return await vi.importActual<T>(specifier);
  } catch {
    return null;
  }
}

function cssHexToken(css: string, token: string): string | null {
  const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    css.match(
      new RegExp(`${escapedToken}:\\s*(#[0-9a-f]{6})\\s*;`, "i"),
    )?.[1] ?? null
  );
}

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((start) =>
    Number.parseInt(hex.slice(start, start + 2), 16),
  );
  const linear = channels.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("WP-11 public/Admin route and layout separation", () => {
  it("moves public pages into a URL-transparent public route group", () => {
    // Mutation caught: a physical move changes a public URL, leaves a duplicate route, or moves root auth/API boundaries.
    const publicPages = [
      ["app/(public)/page.tsx", "/"],
      ["app/(public)/institutions/page.tsx", "/institutions"],
      ["app/(public)/institutions/[slug]/page.tsx", "/institutions/[slug]"],
      ["app/(public)/opportunities/[slug]/page.tsx", "/opportunities/[slug]"],
      ["app/(public)/articles/[slug]/page.tsx", "/articles/[slug]"],
      ["app/(public)/my-preppy/page.tsx", "/my-preppy"],
      ["app/(public)/onboarding/page.tsx", "/onboarding"],
    ] as const;

    for (const [physicalPath] of publicPages) {
      expect(existsSync(resolve(repositoryRoot, physicalPath))).toBe(true);
    }
    for (const oldPath of [
      "app/page.tsx",
      "app/institutions",
      "app/opportunities",
      "app/articles",
      "app/my-preppy",
      "app/onboarding",
    ]) {
      expect(existsSync(resolve(repositoryRoot, oldPath))).toBe(false);
    }

    const urls = publicPages.map(([physicalPath, expectedUrl]) => {
      const pagePath = physicalPath
        .replace(/^app\//, "")
        .replace(/\([^/]+\)\//g, "")
        .replace(/\/page\.tsx$/, "")
        .replace(/^page\.tsx$/, "");
      const url = pagePath === "" ? "/" : `/${pagePath}`;
      expect(url).toBe(expectedUrl);
      return url;
    });
    expect(urls).toEqual([
      "/",
      "/institutions",
      "/institutions/[slug]",
      "/opportunities/[slug]",
      "/articles/[slug]",
      "/my-preppy",
      "/onboarding",
    ]);

    expect(existsSync(resolve(repositoryRoot, "app/auth"))).toBe(true);
    expect(existsSync(resolve(repositoryRoot, "app/api"))).toBe(true);
    expect(existsSync(resolve(repositoryRoot, "app/error.tsx"))).toBe(true);
    expect(existsSync(resolve(repositoryRoot, "app/not-found.tsx"))).toBe(true);
  });

  it("keeps the root document neutral and gives the public group the marketing shell", async () => {
    // Mutation caught: the public header/footer remains above Admin or public pages lose their established shell.
    const [rootSource, publicSource] = await Promise.all([
      readSource("app/layout.tsx"),
      readSource("app/(public)/layout.tsx"),
    ]);
    const rootMarkup = renderToStaticMarkup(
      createElement(RootLayout, null, createElement("p", null, "boundary")),
    );

    expect(rootSource).not.toMatch(/SiteHeader|SiteFooter/);
    expect(rootSource).not.toContain("<main");
    expect(rootMarkup).toContain("boundary");
    expect(rootMarkup).not.toContain("site-header");
    expect(rootMarkup).not.toContain("site-footer");
    expect(publicSource).toContain("<SiteHeader />");
    expect(publicSource).toContain("<main");
    expect(publicSource).toContain("<SiteFooter />");
    expect(publicSource).toContain("PREPPY | 입학정보를 더 차분하게");
  });

  it("keeps public and Admin recovery inside their shells while root fallbacks stay neutral", async () => {
    // Mutation caught: a public/Admin fallback escapes its route group or the root fallback leaks a branded shell/domain CTA.
    const reset = vi.fn();
    const rootErrorMarkup = renderToStaticMarkup(
      createElement(RootError, {
        error: new Error("root failure"),
        reset,
      }),
    );
    const rootNotFoundMarkup = renderToStaticMarkup(
      createElement(RootNotFound),
    );

    expect(rootErrorMarkup).toContain("Unable to display this page");
    expect(rootNotFoundMarkup).toContain("Page not found");
    for (const rootMarkup of [rootErrorMarkup, rootNotFoundMarkup]) {
      expect(rootMarkup).not.toMatch(
        /class=|PREPPY|status-surface|page-container|eyebrow|institutions|기관/,
      );
    }

    const [publicError, publicNotFound, adminError, adminNotFound] =
      await Promise.all([
        importOptional<{
          default: ComponentType<{
            error: Error & { digest?: string };
            reset: () => void;
          }>;
        }>("@/app/(public)/error"),
        importOptional<{ default: ComponentType }>("@/app/(public)/not-found"),
        importOptional<{
          default: ComponentType<{
            error: Error & { digest?: string };
            reset: () => void;
          }>;
        }>("@/app/admin/error"),
        importOptional<{ default: ComponentType }>("@/app/admin/not-found"),
      ]);
    expect(publicError).not.toBeNull();
    expect(publicNotFound).not.toBeNull();
    expect(adminError).not.toBeNull();
    expect(adminNotFound).not.toBeNull();
    if (!publicError || !publicNotFound || !adminError || !adminNotFound) {
      return;
    }

    const publicErrorMarkup = renderToStaticMarkup(
      createElement(
        PublicLayout,
        null,
        createElement(publicError.default, {
          error: new Error("public failure"),
          reset,
        }),
      ),
    );
    const publicNotFoundMarkup = renderToStaticMarkup(
      createElement(PublicLayout, null, createElement(publicNotFound.default)),
    );
    for (const publicMarkup of [publicErrorMarkup, publicNotFoundMarkup]) {
      expect(publicMarkup).toContain('class="site-header"');
      expect(publicMarkup).toContain('class="site-footer"');
    }
    expect(publicErrorMarkup).toContain(
      "정보를 불러오는 중 잠시 문제가 생겼습니다.",
    );
    expect(publicNotFoundMarkup).toContain('href="/institutions"');
    expect(publicNotFoundMarkup).toContain("기관 찾기로 이동");

    const adminErrorMarkup = renderToStaticMarkup(
      createElement(adminError.default, {
        error: new Error("admin failure"),
        reset,
      }),
    );
    const adminNotFoundMarkup = renderToStaticMarkup(
      createElement(adminNotFound.default),
    );
    for (const adminMarkup of [adminErrorMarkup, adminNotFoundMarkup]) {
      expect(adminMarkup).toContain('class="preppy-admin-fallback"');
      expect(adminMarkup).not.toMatch(/site-header|site-footer|\/institutions/);
    }
    expect(adminErrorMarkup).toContain("Admin view unavailable");
    expect(adminNotFoundMarkup).toContain('href="/admin"');

    const [adminErrorSource, adminNotFoundSource, adminCss] = await Promise.all(
      [
        readSource("app/admin/error.tsx"),
        readSource("app/admin/not-found.tsx"),
        readSource("app/admin/admin.css"),
      ],
    );
    expect(`${adminErrorSource}\n${adminNotFoundSource}`).not.toMatch(
      /requireCurrentAdmin|AdminShell/,
    );
    expect(adminCss).toMatch(/\.preppy-admin-fallback\s*\{/);
  });

  it("declares the public document Korean and the English Admin subtree locally", async () => {
    // Mutation caught: Admin English copy inherits the root Korean pronunciation context.
    const loaded = await importOptional<{
      default: ComponentType<{ children?: ReactNode }>;
    }>("@/app/admin/layout");
    expect(loaded).not.toBeNull();
    if (!loaded) return;

    const publicMarkup = renderToStaticMarkup(
      createElement(
        RootLayout,
        null,
        createElement(
          PublicLayout,
          null,
          createElement("p", null, "공개 정보"),
        ),
      ),
    );
    expect(publicMarkup).toContain('<html lang="ko"');
    expect(publicMarkup).not.toContain('class="preppy-admin-root"');

    const adminMarkup = renderToStaticMarkup(
      createElement(
        RootLayout,
        null,
        createElement(
          loaded.default,
          null,
          createElement("p", null, "Operations"),
        ),
      ),
    );
    expect(adminMarkup).toContain('<html lang="ko"');
    expect(adminMarkup).toMatch(
      /<div[^>]*class="preppy-admin-root"[^>]*lang="en"/,
    );
  });

  it("keeps Admin auth unguarded while one protected layout owns the ACTIVE guard", async () => {
    // Mutation caught: a parent guard redirects login/callback, or an operational route escapes the protected group.
    const [adminLayout, protectedLayout, login, start, callback] =
      await Promise.all([
        readSource("app/admin/layout.tsx"),
        readSource("app/admin/(protected)/layout.tsx"),
        readSource("app/admin/(auth)/login/page.tsx"),
        readSource("app/admin/(auth)/auth/start/route.ts"),
        readSource("app/admin/(auth)/auth/callback/route.ts"),
      ]);

    expect(adminLayout).toContain('import "./admin.css"');
    expect(adminLayout).toContain('export const dynamic = "force-dynamic"');
    expect(adminLayout).toContain("export const revalidate = 0");
    expect(adminLayout).toMatch(
      /robots:\s*\{\s*index:\s*false,\s*follow:\s*false/,
    );
    expect(adminLayout).not.toMatch(
      /requireCurrentAdmin|AdminShell|SiteHeader|SiteFooter/,
    );
    for (const authSource of [login, start, callback]) {
      expect(authSource).not.toMatch(/requireCurrentAdmin|AdminShell/);
    }

    expect(protectedLayout).toContain("requireCurrentAdmin");
    expect(protectedLayout).toContain("await requireCurrentAdmin()");
    expect(protectedLayout).toContain("instanceof UnauthenticatedError");
    expect(protectedLayout).toContain('redirect("/admin/login")');
    expect(protectedLayout).toContain("<AdminShell");
    expect(protectedLayout).not.toMatch(/SiteHeader|SiteFooter/);
    expect(
      existsSync(resolve(repositoryRoot, "app/admin/(protected)/page.tsx")),
    ).toBe(true);
  });

  it("renders an accessible operational shell, compact navigation, and authoritative logout", async () => {
    // Mutation caught: the Admin shell loses its skip target/landmarks, an operational domain, identity, or POST logout.
    const loaded = await importOptional<{
      AdminShell: ComponentType<{
        adminName: string;
        children?: ReactNode;
      }>;
      runAdminLogout: (
        fetcher: typeof fetch,
        navigate: (path: string) => void,
      ) => Promise<void>;
    }>("@/app/admin/_components/admin-shell");
    expect(loaded).not.toBeNull();
    if (!loaded) return;

    const markup = renderToStaticMarkup(
      createElement(
        loaded.AdminShell,
        { adminName: "Operations Editor" },
        createElement("p", null, "Protected content"),
      ),
    );
    expect(markup).toContain('href="#admin-main"');
    expect(markup).toContain('id="admin-main"');
    expect(markup).toContain("<nav");
    expect(markup).toContain('aria-label="Admin sections"');
    expect(markup).toContain('aria-label="Compact Admin sections"');
    for (const [href, label] of [
      ["/admin", "Dashboard"],
      ["/admin/monitoring", "Monitoring"],
      ["/admin/institutions", "Institutions"],
      ["/admin/opportunities", "Opportunities"],
      ["/admin/sources", "Sources"],
      ["/admin/articles", "Articles"],
      ["/admin/notifications", "Notifications"],
      ["/admin/users", "Users"],
      ["/admin/operations", "Operations"],
    ]) {
      expect(markup).toContain(`href="${href}"`);
      expect(markup).toContain(label);
    }
    expect(markup).toContain("Operations Editor");
    expect(markup).toMatch(
      /<form[^>]*action="\/api\/admin\/auth\/logout"[^>]*method="post"/,
    );
    expect(markup).toContain('role="status"');

    const logoutOrder: string[] = [];
    const logoutResponse = new Response(null, { status: 204 });
    const readLogoutBody = logoutResponse.arrayBuffer.bind(logoutResponse);
    const logoutBodyConsumed = vi
      .spyOn(logoutResponse, "arrayBuffer")
      .mockImplementation(async () => {
        logoutOrder.push("response-consumed");
        return readLogoutBody();
      });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(logoutResponse);
    const navigate = vi.fn(() => logoutOrder.push("navigate"));
    await loaded.runAdminLogout(fetcher, navigate);
    expect(fetcher).toHaveBeenCalledWith("/api/admin/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
    });
    expect(logoutBodyConsumed).toHaveBeenCalledOnce();
    expect(logoutOrder).toEqual(["response-consumed", "navigate"]);
    expect(navigate).toHaveBeenCalledWith("/admin/login");
  });

  it("provides Admin-scoped focus, table, state, and responsive navigation styles", async () => {
    // Mutation caught: operational tables overflow the viewport, states become color-only, or keyboard/mobile affordances disappear.
    const css = await readSource("app/admin/admin.css");
    expect(css).toContain(".preppy-admin");
    expect(css).toMatch(/\.preppy-admin[^}]*--admin-/s);
    expect(css).toContain(":focus-visible");
    expect(css).toMatch(/\.admin-table-scroll\s*\{[^}]*overflow-x:\s*auto/s);
    expect(css).toContain(".admin-state-chip");
    expect(css).toContain(".admin-mobile-nav");
    expect(css).toMatch(/@media\s*\(max-width:\s*\d+px\)/);
  });

  it("keeps small Admin kicker text at WCAG AA contrast on both real backgrounds", async () => {
    // Mutation caught: the 0.68rem kicker uses a decorative accent that falls below 4.5:1 on canvas or surface.
    const css = await readSource("app/admin/admin.css");
    const kickerRule = css.match(/\.admin-kicker\s*\{([^}]*)\}/s)?.[1] ?? "";
    const kickerToken =
      kickerRule.match(/color:\s*var\((--[a-z0-9-]+)\)/i)?.[1] ?? null;
    expect(kickerToken).not.toBeNull();
    if (!kickerToken) return;

    const foreground = cssHexToken(css, kickerToken);
    const canvas = cssHexToken(css, "--admin-canvas");
    const surface = cssHexToken(css, "--admin-surface");
    expect(foreground).toMatch(/^#[0-9a-f]{6}$/i);
    expect(canvas).toBe("#ecefeb");
    expect(surface).toBe("#f8faf7");
    if (!foreground || !canvas || !surface) return;

    expect(contrastRatio(foreground, canvas)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(foreground, surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("renders a data-honest Dashboard boundary without invented metrics", async () => {
    // Mutation caught: the Task 7 Dashboard regresses to its temporary skeleton or invents an unsupported percentage.
    const loaded = await importOptional<{
      AdminDashboardView: ComponentType<{
        data: {
          monitoring: { due: number; overdue: number };
          recentVerifiedChanges: { count: number; items: readonly [] };
          unavailableSources: number;
          outbox: { pending: number; deadLetter: number };
        };
      }>;
    }>("@/app/admin/(protected)/page");
    expect(loaded).not.toBeNull();
    if (!loaded) return;

    const markup = renderToStaticMarkup(
      createElement(loaded.AdminDashboardView, {
        data: {
          monitoring: { due: 3, overdue: 2 },
          recentVerifiedChanges: { count: 1, items: [] },
          unavailableSources: 4,
          outbox: { pending: 5, deadLetter: 1 },
        },
      }),
    );
    expect(markup).toContain("Operations overview");
    expect(markup).not.toContain("Read projections pending");
    expect(markup).toMatch(/Due[\s\S]*3/);
    expect(markup).toMatch(/Overdue[\s\S]*2/);
    const visibleText = markup.replace(/<[^>]+>/g, " ");
    expect(visibleText).not.toMatch(/\b(?:12|24|99|100)%\b/);
  });
});
