import "server-only";

import { eq } from "drizzle-orm";

import { institutions } from "@/src/db/schema";
import type {
  DatabaseExecutor,
  TransactionExecutor,
} from "@/src/infrastructure/db/runtime.server";

export async function findInstitutionById(
  executor: DatabaseExecutor,
  id: string,
) {
  const [institution] = await executor.drizzle
    .select()
    .from(institutions)
    .where(eq(institutions.id, id))
    .limit(1);

  return institution ?? null;
}

export async function findInstitutionForUpdate(
  executor: TransactionExecutor,
  id: string,
) {
  const [institution] = await executor.drizzle
    .select()
    .from(institutions)
    .where(eq(institutions.id, id))
    .for("update")
    .limit(1);

  return institution ?? null;
}
