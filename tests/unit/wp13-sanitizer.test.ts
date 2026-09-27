import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  ARTICLE_HTML_MAX_BYTES,
  ARTICLE_SANITIZER_POLICY_VERSION,
  ArticleHtmlSanitizationError,
  sanitizeArticleHtmlV1,
} from "@/src/modules/editorial/sanitizer.server";

const APP_BASE_URL = "https://preppy.example";

function sanitize(input: string) {
  return sanitizeArticleHtmlV1(input, { appBaseUrl: APP_BASE_URL });
}

describe("WP-13 Article HTML sanitizer", () => {
  it("keeps only the exact editorial tag allowlist", () => {
    const result = sanitize(
      "<p>Paragraph <strong>strong</strong> <em>em</em> <u>under</u> <s>strike</s></p>" +
        "<h2>H2</h2><h3>H3</h3><h4>H4</h4>" +
        "<ul><li>one</li></ul><ol><li>two</li></ol>" +
        "<blockquote>quote</blockquote><pre><code>const x = 1;</code></pre><br><hr>",
    );

    expect(result.html).toBe(
      "<p>Paragraph <strong>strong</strong> <em>em</em> <u>under</u> <s>strike</s></p>" +
        "<h2>H2</h2><h3>H3</h3><h4>H4</h4>" +
        "<ul><li>one</li></ul><ol><li>two</li></ol>" +
        "<blockquote>quote</blockquote><pre><code>const x = 1;</code></pre><br /><hr />",
    );
  });

  it("normalizes internal and external anchors with one URL classifier", () => {
    const result = sanitize(
      '<p><a href="https://preppy.example/articles/foo" target="_blank" rel="opener sponsored">internal</a> ' +
        '<a href="https://external.example/guide" target="_blank" rel="opener">external</a> ' +
        '<a href="https://external.example/plain" target="_self" rel="opener">plain</a> ' +
        '<a href="https://preppy.example/admin/users">private</a> ' +
        '<a href="javascript:alert(1)">unsafe</a></p>',
    );

    expect(result.html).toBe(
      '<p><a href="/articles/foo">internal</a> ' +
        '<a href="https://external.example/guide" target="_blank" rel="noopener noreferrer">external</a> ' +
        '<a href="https://external.example/plain">plain</a> private unsafe</p>',
    );
  });

  it("removes active content, unsafe elements, comments, and all unapproved attributes", () => {
    const result = sanitize(
      '<!--secret--><p id="x" class="y" style="color:red" data-secret="z" onclick="x()">Safe</p>' +
        "<script>alert(1)</script><style>body{display:none}</style>" +
        '<iframe src="https://evil.example"></iframe><object></object><embed>' +
        '<form><input value="secret"><button>submit</button></form>' +
        '<video src="x"></video><audio src="x"></audio><img src=x onerror=alert(1)>' +
        "<table><tr><td>cell</td></tr></table>",
    );

    expect(result.html).toBe(
      "<p>Safe</p>submit<table><tr><td>cell</td></tr></table>",
    );
    expect(result.html).not.toMatch(
      /script|style|iframe|object|embed|form|input|button|video|audio|img|onerror|onclick|class=|id=|data-/i,
    );
  });

  it("keeps editorial tables with bounded cell spans only", () => {
    const result = sanitize(
      '<table style="min-width:50px"><colgroup><col style="min-width:25px"></colgroup><tbody>' +
        '<tr><th colspan="1" rowspan="1"><p>학교</p></th><th colspan="2" onclick="x()"><p>일정</p></th></tr>' +
        '<tr><td rowspan="999" class="c"><p>리라초</p></td><td colspan="0">11/6</td></tr>' +
        "</tbody></table>",
    );

    expect(result.html).toBe(
      "<table><colgroup><col /></colgroup><tbody>" +
        '<tr><th><p>학교</p></th><th colspan="2"><p>일정</p></th></tr>' +
        "<tr><td><p>리라초</p></td><td>11/6</td></tr>" +
        "</tbody></table>",
    );
  });

  it("keeps only credential-free HTTPS images with alt text and lazy loading", () => {
    const result = sanitize(
      '<p>a</p><img src="https://cdn.example/a.png" alt="설명" onerror="x()" width="3">' +
        '<img src="http://cdn.example/a.png"><img src="javascript:alert(1)">' +
        '<img src="https://user:pass@cdn.example/a.png"><img src="/local.png"><img>',
    );

    expect(result.html).toBe(
      '<p>a</p><img src="https://cdn.example/a.png" alt="설명" loading="lazy" />',
    );
  });

  it.each([
    "<svg><style><img src=x onerror=alert(1)></style></svg>",
    "<math><style><img src=x onerror=alert(1)></style></math>",
    '<svg><foreignObject><iframe srcdoc="<script>alert(1)</script>"></iframe></foreignObject></svg>',
  ])("blocks the SVG/MathML raw-text bypass family", (fixture) => {
    const result = sanitize(`<p>before</p>${fixture}<p>after</p>`);

    expect(result.html).toBe("<p>before</p><p>after</p>");
    expect(result.html).not.toMatch(
      /img|onerror|script|style|iframe|svg|math/i,
    );
  });

  it("is deterministic and idempotent across malformed markup and duplicate attributes", () => {
    const input =
      '<p><strong>broken<p><a href="/articles/first" href="javascript:alert(1)">link</a>';
    const first = sanitize(input);
    const second = sanitize(input);
    const resanitized = sanitize(first.html);

    expect(first).toEqual(second);
    expect(resanitized.html).toBe(first.html);
    expect(resanitized.fingerprint).toBe(first.fingerprint);
  });

  it("derives normalized meaningful text, Unicode code-point count, and exact HTML fingerprint", () => {
    const result = sanitize("<h2>  Safe\n title </h2><p>A 🔐</p>");

    expect(result.text).toBe("Safe title A 🔐");
    expect(result.nonWhitespaceCodePoints).toBe(11);
    expect(result.policyVersion).toBe(ARTICLE_SANITIZER_POLICY_VERSION);
    expect(result.fingerprint).toBe(
      `sha256:${createHash("sha256").update(result.html, "utf8").digest("hex")}`,
    );
    expect(result.fingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("accepts exactly 128 KiB of UTF-8 input and rejects one byte more", () => {
    const exact = "a".repeat(ARTICLE_HTML_MAX_BYTES);

    expect(Buffer.byteLength(exact, "utf8")).toBe(128 * 1024);
    expect(sanitize(exact).html).toBe(exact);
    expect(() => sanitize(`${exact}a`)).toThrow(ArticleHtmlSanitizationError);
  });

  it("rejects sanitized output over 128 KiB without truncating", () => {
    const input = "&".repeat(Math.floor(ARTICLE_HTML_MAX_BYTES / 2));

    expect(Buffer.byteLength(input, "utf8")).toBeLessThan(
      ARTICLE_HTML_MAX_BYTES,
    );
    expect(() => sanitize(input)).toThrow(ArticleHtmlSanitizationError);
  });
});
