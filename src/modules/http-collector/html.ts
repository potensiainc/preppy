import { load } from "cheerio";

import { sha256Hex } from "./hash";

export type ExtractedHtmlLink = Readonly<{
  href: string;
  anchorText: string;
}>;

export type HtmlAnalysis = Readonly<{
  normalizedText: string;
  textHash: string;
  links: readonly ExtractedHtmlLink[];
  linkLimitReached: boolean;
}>;

export function normalizeVisibleText(value: string): string {
  return value.normalize("NFC").replace(/\s+/gu, " ").trim();
}

export function analyzeHtml(
  entityBytes: Uint8Array,
  options: Readonly<{ charset: string; maxLinks: number }>,
): HtmlAnalysis {
  if (!Number.isInteger(options.maxLinks) || options.maxLinks < 1) {
    throw new RangeError("maxLinks must be a positive integer");
  }
  const decoded = new TextDecoder(options.charset, { fatal: false }).decode(
    entityBytes,
  );
  const $ = load(decoded);
  $("script, style, noscript").remove();
  const visibleTextNodes = $.root()
    .find("*")
    .contents()
    .filter((_index, element) => element.type === "text")
    .map((_index, element) => $(element).text())
    .get();
  const normalizedText = normalizeVisibleText(visibleTextNodes.join(" "));
  const anchors = $("a[href]").toArray();
  const links = anchors.slice(0, options.maxLinks).map((element) => ({
    href: ($(element).attr("href") ?? "").trim(),
    anchorText: normalizeVisibleText($(element).text()),
  }));
  return Object.freeze({
    normalizedText,
    textHash: sha256Hex(normalizedText),
    links: Object.freeze(links.map((link) => Object.freeze(link))),
    linkLimitReached: anchors.length > options.maxLinks,
  });
}
