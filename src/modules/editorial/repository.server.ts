import "server-only";

import { eq } from "drizzle-orm";

import { articles } from "@/src/db/schema";
import type {
  DatabaseExecutor,
  TransactionExecutor,
} from "@/src/infrastructure/db/runtime.server";

export async function findArticleById(executor: DatabaseExecutor, id: string) {
  const [article] = await executor.drizzle
    .select()
    .from(articles)
    .where(eq(articles.id, id))
    .limit(1);

  return article ?? null;
}

export async function findArticleForUpdate(
  executor: TransactionExecutor,
  id: string,
) {
  const [article] = await executor.drizzle
    .select()
    .from(articles)
    .where(eq(articles.id, id))
    .for("update")
    .limit(1);

  return article ?? null;
}
