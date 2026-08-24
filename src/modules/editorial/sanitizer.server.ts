import "server-only";

import { createHash } from "node:crypto";

import sanitizeHtml from "sanitize-html";

import { classifyArticleHref } from "./article-links.server";

export const ARTICLE_SANITIZER_POLICY_VERSION = "v1" as const;
export const ARTICLE_HTML_MAX_BYTES = 128 * 1024;

export type SanitizedArticleHtml = Readonly<{
  html: string;
  text: string;
  nonWhitespaceCodePoints: number;
  fingerprint: `sha256:${string}`;
  policyVersion: "v1";
}>;

export type ArticleHtmlSanitizationErrorCategory =
  "input-too-large" | "output-too-large";

export class ArticleHtmlSanitizationError extends Error {
  readonly category: ArticleHtmlSanitizationErrorCategory;

  constructor(category: ArticleHtmlSanitizationErrorCategory) {
    super(
      category === "input-too-large"
        ? "Article HTML exceeds the input size limit."
        : "Sanitized Article HTML exceeds the output size limit.",
    );
    this.name = "ArticleHtmlSanitizationError";
    this.category = category;
  }
}

const ALLOWED_TAGS = [
  "p",
  "h2",
  "h3",
  "h4",
  "strong",
  "em",
  "u",
  "s",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "code",
  "br",
  "hr",
  "a",
] as const;

const NON_TEXT_TAGS = [
  "script",
  "style",
  "textarea",
  "option",
  "noscript",
  "template",
  "svg",
  "math",
] as const;

function utf8ByteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function deriveMeaningfulText(html: string): string {
  const chunks: string[] = [];

  sanitizeHtml(html, {
    allowedTags: [],
    allowedAttributes: {},
    nonTextTags: [...NON_TEXT_TAGS],
    textFilter(text) {
      chunks.push(text);
      return "";
    },
  });

  return chunks.join(" ").replace(/\s+/gu, " ").trim();
}

export function sanitizeArticleHtmlV1(
  input: string,
  options: Readonly<{ appBaseUrl: string }>,
): SanitizedArticleHtml {
  if (utf8ByteLength(input) > ARTICLE_HTML_MAX_BYTES) {
    throw new ArticleHtmlSanitizationError("input-too-large");
  }

  const html = sanitizeHtml(input, {
    allowedTags: [...ALLOWED_TAGS],
    allowedAttributes: {
      a: ["href", "target", "rel"],
    },
    allowedSchemes: ["http", "https"],
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    nonTextTags: [...NON_TEXT_TAGS],
    parseStyleAttributes: false,
    transformTags: {
      a(
        _tagName,
        attributes,
      ): { tagName: string; attribs: Record<string, string> } {
        const classification = classifyArticleHref(
          attributes.href ?? "",
          options.appBaseUrl,
        );

        if (classification.kind === "REJECT") {
          return { tagName: "a", attribs: {} };
        }
        if (classification.kind === "INTERNAL") {
          return {
            tagName: "a",
            attribs: { href: classification.href },
          };
        }

        return {
          tagName: "a",
          attribs:
            attributes.target === "_blank"
              ? {
                  href: classification.href,
                  target: "_blank",
                  rel: "noopener noreferrer",
                }
              : { href: classification.href },
        };
      },
    },
    exclusiveFilter(frame) {
      return frame.tag === "a" && !frame.attribs.href ? "excludeTag" : false;
    },
  });

  if (utf8ByteLength(html) > ARTICLE_HTML_MAX_BYTES) {
    throw new ArticleHtmlSanitizationError("output-too-large");
  }

  const text = deriveMeaningfulText(html);
  const nonWhitespaceCodePoints = [...text].filter(
    (character) => !/\s/u.test(character),
  ).length;
  const digest = createHash("sha256").update(html, "utf8").digest("hex");

  return {
    html,
    text,
    nonWhitespaceCodePoints,
    fingerprint: `sha256:${digest}`,
    policyVersion: ARTICLE_SANITIZER_POLICY_VERSION,
  };
}
