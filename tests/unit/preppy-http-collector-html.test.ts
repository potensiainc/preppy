import { describe, expect, it } from "vitest";

import { analyzeHtml } from "@/src/modules/http-collector/html";
import { sha256Hex } from "@/src/modules/http-collector/hash";

describe("collector entity and visible-text hashes", () => {
  it("computes lowercase SHA-256 over exact decoded entity bytes", () => {
    expect(sha256Hex(Buffer.from("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("normalizes visible DOM text deterministically using Unicode NFC", () => {
    const html = Buffer.from(`
      <html><head><style>.hidden { display:none }</style></head>
      <body>
        First&nbsp;&amp;   Second
        <script>secret script</script>
        <noscript>fallback trap</noscript>
        <p>Cafe\u0301\tThird</p>
      </body></html>
    `);
    const result = analyzeHtml(html, { charset: "utf-8", maxLinks: 20 });
    expect(result.normalizedText).toBe("First & Second Café Third");
    expect(result.textHash).toBe(
      "0cbcfc30fc8e8956d8f5d8ef2f63c64a25213bc6c6f92b7208503a5f3a933d8c",
    );
  });

  it("keeps the text hash stable for markup-only changes and changes it for visible text", () => {
    const first = analyzeHtml(
      Buffer.from("<p>Hello <strong>school</strong></p>"),
      {
        charset: "utf-8",
        maxLinks: 20,
      },
    );
    const markupOnly = analyzeHtml(Buffer.from("<div>Hello school</div>"), {
      charset: "utf-8",
      maxLinks: 20,
    });
    const visibleChange = analyzeHtml(Buffer.from("<div>Hello schools</div>"), {
      charset: "utf-8",
      maxLinks: 20,
    });
    expect(markupOnly.normalizedText).toBe(first.normalizedText);
    expect(markupOnly.textHash).toBe(first.textHash);
    expect(visibleChange.textHash).not.toBe(first.textHash);
  });

  it("extracts links in DOM order from malformed HTML without regex parsing", () => {
    const result = analyzeHtml(
      Buffer.from(
        '<a href="/admissions"><span> Admissions <a href="notice">공지사항',
      ),
      { charset: "utf-8", maxLinks: 20 },
    );
    expect(result.links).toEqual([
      { href: "/admissions", anchorText: "Admissions" },
      { href: "notice", anchorText: "공지사항" },
    ]);
    expect(result.linkLimitReached).toBe(false);
  });

  it("bounds extracted links and records the limit outcome", () => {
    const result = analyzeHtml(
      Buffer.from(
        '<a href="/1">one</a><a href="/2">two</a><a href="/3">three</a>',
      ),
      { charset: "utf-8", maxLinks: 2 },
    );
    expect(result.links).toHaveLength(2);
    expect(result.linkLimitReached).toBe(true);
  });
});
