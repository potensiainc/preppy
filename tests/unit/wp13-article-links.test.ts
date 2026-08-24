import { describe, expect, it } from "vitest";

import {
  ARTICLE_CANONICAL_SLUG,
  classifyArticleHref,
} from "@/src/modules/editorial/article-links.server";

const APP_BASE_URL = "https://preppy.example";

describe("WP-13 Article link classification", () => {
  it.each([
    ["/institutions/example-university", "/institutions/example-university"],
    ["/opportunities/fall-2027", "/opportunities/fall-2027"],
    ["/articles/how-to-apply", "/articles/how-to-apply"],
    ["https://preppy.example/articles/how-to-apply", "/articles/how-to-apply"],
  ])("normalizes the approved internal link %s", (rawHref, href) => {
    expect(classifyArticleHref(rawHref, APP_BASE_URL)).toEqual({
      kind: "INTERNAL",
      href,
    });
  });

  it.each([
    "https://external.example/guide",
    "http://external.example/guide?from=preppy#requirements",
  ])("allows a credential-free external HTTP(S) URL: %s", (rawHref) => {
    expect(classifyArticleHref(rawHref, APP_BASE_URL)).toEqual({
      kind: "EXTERNAL",
      href: rawHref,
    });
  });

  it.each([
    "",
    "//evil.example/guide",
    "/\\evil.example/guide",
    "\\\\evil.example/guide",
    "/articles/foo/extra",
    "/articles/foo/",
    "/articles/Foo",
    "/articles/fóo",
    "/articles/foo?preview=true",
    "/articles/foo#private",
    "/articles/foo%2fbar",
    "/articles/foo%2Fbar",
    "/articles/foo%5cbar",
    "/articles/foo%5Cbar",
    "/articles/%66oo",
    "/articles/%E0%A4%A",
    "/admin/users",
    "/api/admin/articles",
    "/auth/login",
    "/onboarding/profile",
    "/my-preppy/follows",
    "https://preppy.example/admin/users",
    "https://preppy.example/articles/foo?preview=true",
    "https://preppy.example/articles/foo#private",
    "https://user:secret@external.example/guide",
    "javascript:alert(1)",
    "data:text/html,unsafe",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "mailto:editor@preppy.example",
    "https://external.example/line\nbreak",
    " https://external.example/guide",
  ])("rejects ambiguous or unsafe href %j", (rawHref) => {
    expect(classifyArticleHref(rawHref, APP_BASE_URL)).toEqual({
      kind: "REJECT",
    });
  });

  it("uses one strict canonical slug grammar", () => {
    expect(ARTICLE_CANONICAL_SLUG.test("fall-2027-guide")).toBe(true);
    expect(ARTICLE_CANONICAL_SLUG.test("fall--2027")).toBe(false);
    expect(ARTICLE_CANONICAL_SLUG.test("-fall-2027")).toBe(false);
    expect(ARTICLE_CANONICAL_SLUG.test("fall-2027-")).toBe(false);
    expect(ARTICLE_CANONICAL_SLUG.test("Fall-2027")).toBe(false);
  });
});
