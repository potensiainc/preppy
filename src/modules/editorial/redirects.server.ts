import "server-only";

import type { DatabaseExecutor } from "@/src/infrastructure/db/runtime.server";

import {
  findArticleBySlug,
  findRedirectBySourcePath,
} from "./repository.server";

const CANONICAL_ARTICLE_PATH = /^\/articles\/([a-z0-9]+(?:-[a-z0-9]+)*)$/u;

export type HistoricalArticleRedirectResolution =
  | Readonly<{
      kind: "REDIRECT";
      targetPath: `/articles/${string}`;
    }>
  | Readonly<{ kind: "NOT_FOUND" }>;

export type HistoricalArticleRedirectTarget =
  | Readonly<{
      kind: "TARGET";
      targetPath: `/articles/${string}`;
      targetSlug: string;
    }>
  | Readonly<{ kind: "NOT_FOUND" }>;

export type HistoricalArticleRedirectRow = Readonly<{
  sourcePath: string;
  targetPath: string;
  statusCode: number;
  disabledAt: Date | null;
}>;

export function parseCanonicalArticlePath(path: string): string | null {
  if (
    path.includes("\\") ||
    path.includes("%") ||
    path.includes("?") ||
    path.includes("#") ||
    /[\u0000-\u001f\u007f-\u009f]/u.test(path)
  ) {
    return null;
  }
  const slug = CANONICAL_ARTICLE_PATH.exec(path)?.[1] ?? null;
  return slug !== null && slug.length <= 120 ? slug : null;
}

export function validateHistoricalArticleRedirect(
  sourcePath: string,
  row: HistoricalArticleRedirectRow | null,
): HistoricalArticleRedirectTarget {
  if (
    !row ||
    parseCanonicalArticlePath(sourcePath) === null ||
    row.sourcePath !== sourcePath ||
    row.statusCode !== 308 ||
    row.disabledAt !== null ||
    row.sourcePath === row.targetPath
  ) {
    return { kind: "NOT_FOUND" };
  }
  const targetSlug = parseCanonicalArticlePath(row.targetPath);
  if (targetSlug === null) return { kind: "NOT_FOUND" };
  return {
    kind: "TARGET",
    targetPath: row.targetPath as `/articles/${string}`,
    targetSlug,
  };
}

export async function resolveHistoricalArticleRedirect(
  executor: DatabaseExecutor,
  sourcePath: string,
): Promise<HistoricalArticleRedirectResolution> {
  const redirect = await findRedirectBySourcePath(executor, sourcePath);
  const target = validateHistoricalArticleRedirect(sourcePath, redirect);
  if (target.kind === "NOT_FOUND") return target;

  const article = await findArticleBySlug(executor, target.targetSlug);
  if (
    !article ||
    article.status !== "PUBLISHED" ||
    `/articles/${article.slug}` !== target.targetPath
  ) {
    return { kind: "NOT_FOUND" };
  }
  return { kind: "REDIRECT", targetPath: target.targetPath };
}
