/** Article tag rules shared by the Admin editor, commands and public pages. */
export const ARTICLE_TAG_MAX_ITEMS = 10;
export const ARTICLE_TAG_MAX_CODE_POINTS = 30;

// Letters, numbers, marks, spaces and a few joiners. Excludes URL syntax.
const ARTICLE_TAG_PATTERN = /^[\p{L}\p{N}\p{M}][\p{L}\p{N}\p{M} ·&+._-]*$/u;

export function normalizeArticleTag(raw: string): string | null {
  const value = raw
    .normalize("NFC")
    .trim()
    .replace(/^#+/u, "")
    .trim()
    .replace(/\s+/gu, " ");
  if (value === "") return null;
  if ([...value].length > ARTICLE_TAG_MAX_CODE_POINTS) return null;
  if (!ARTICLE_TAG_PATTERN.test(value)) return null;
  return value;
}

/** Normalizes, drops invalid entries and de-duplicates case-insensitively. */
export function normalizeArticleTags(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const tag = normalizeArticleTag(raw);
    if (tag === null) continue;
    const key = tag.toLocaleLowerCase("ko-KR");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
  }
  return result;
}

/** Splits free text such as "강남 영유, 추가모집 #레벨테스트". */
export function parseArticleTagInput(text: string): string[] {
  return text
    .split(/[,\n]|(?=#)/u)
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

export function articleTagPath(tag: string): `/articles/tag/${string}` {
  return `/articles/tag/${encodeURIComponent(tag)}`;
}
