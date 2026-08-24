import "server-only";

export const ARTICLE_CANONICAL_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type ArticleInternalHref =
  | `/institutions/${string}`
  | `/opportunities/${string}`
  | `/articles/${string}`;

export type ArticleHrefClassification =
  | Readonly<{ kind: "INTERNAL"; href: ArticleInternalHref }>
  | Readonly<{ kind: "EXTERNAL"; href: string }>
  | Readonly<{ kind: "REJECT" }>;

const INTERNAL_PATH = /^\/(institutions|opportunities|articles)\/([^/]+)$/;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/u;
const VALID_PERCENT_ESCAPE = /%[0-9a-f]{2}/giu;
const ENCODED_SEPARATOR = /%(?:2f|5c)/iu;

function reject(): ArticleHrefClassification {
  return { kind: "REJECT" };
}

function hasValidPercentEncoding(value: string): boolean {
  const withoutEscapes = value.replace(VALID_PERCENT_ESCAPE, "");
  if (withoutEscapes.includes("%")) {
    return false;
  }

  try {
    decodeURIComponent(value);
    return true;
  } catch {
    return false;
  }
}

export function classifyInternalCanonicalPath(
  path: string,
): ArticleInternalHref | null {
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\") ||
    path.includes("?") ||
    path.includes("#") ||
    path.includes("%") ||
    CONTROL_CHARACTER.test(path)
  ) {
    return null;
  }

  const match = INTERNAL_PATH.exec(path);
  if (!match || !ARTICLE_CANONICAL_SLUG.test(match[2])) {
    return null;
  }

  return path as ArticleInternalHref;
}

function parseTrustedAppOrigin(appBaseUrl: string): string {
  const appUrl = new URL(appBaseUrl);
  if (
    (appUrl.protocol !== "https:" && appUrl.protocol !== "http:") ||
    appUrl.username !== "" ||
    appUrl.password !== ""
  ) {
    throw new TypeError("APP_BASE_URL must be a credential-free HTTP(S) URL.");
  }

  return appUrl.origin;
}

export function classifyArticleHref(
  rawHref: string,
  appBaseUrl: string,
): ArticleHrefClassification {
  if (
    rawHref.length === 0 ||
    rawHref !== rawHref.trim() ||
    CONTROL_CHARACTER.test(rawHref) ||
    rawHref.includes("\\") ||
    ENCODED_SEPARATOR.test(rawHref) ||
    !hasValidPercentEncoding(rawHref)
  ) {
    return reject();
  }

  if (rawHref.startsWith("/")) {
    const internalHref = classifyInternalCanonicalPath(rawHref);
    return internalHref ? { kind: "INTERNAL", href: internalHref } : reject();
  }

  let url: URL;
  try {
    url = new URL(rawHref);
  } catch {
    return reject();
  }

  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username !== "" ||
    url.password !== ""
  ) {
    return reject();
  }

  if (url.origin === parseTrustedAppOrigin(appBaseUrl)) {
    if (
      url.search !== "" ||
      url.hash !== "" ||
      rawHref.includes("%") ||
      /\/(?:\.{1,2})(?:\/|$)/u.test(rawHref)
    ) {
      return reject();
    }

    const internalHref = classifyInternalCanonicalPath(url.pathname);
    return internalHref ? { kind: "INTERNAL", href: internalHref } : reject();
  }

  return { kind: "EXTERNAL", href: url.toString() };
}
