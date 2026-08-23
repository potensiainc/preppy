import "server-only";

import { and, eq } from "drizzle-orm";

import {
  institutionFacts,
  institutionFactVersionEvidence,
  institutionFactVersions,
  institutions,
  type InstitutionFactType,
} from "@/src/db/schema";
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

export async function findInstitutionFactForUpdate(
  executor: TransactionExecutor,
  input: { institutionId: string; factType: InstitutionFactType },
) {
  const [fact] = await executor.drizzle
    .select()
    .from(institutionFacts)
    .where(
      and(
        eq(institutionFacts.institutionId, input.institutionId),
        eq(institutionFacts.factType, input.factType),
      ),
    )
    .for("update")
    .limit(1);

  return fact ?? null;
}

export async function insertInstitutionFact(
  executor: TransactionExecutor,
  input: typeof institutionFacts.$inferInsert,
) {
  const [fact] = await executor.drizzle
    .insert(institutionFacts)
    .values(input)
    .returning();
  return fact!;
}

export async function findCurrentInstitutionFactVersionForUpdate(
  executor: TransactionExecutor,
  institutionFactId: string,
) {
  const [version] = await executor.drizzle
    .select()
    .from(institutionFactVersions)
    .where(
      and(
        eq(institutionFactVersions.institutionFactId, institutionFactId),
        eq(institutionFactVersions.isCurrent, true),
      ),
    )
    .for("update")
    .limit(1);
  return version ?? null;
}

export async function supersedeCurrentInstitutionFactVersion(
  executor: TransactionExecutor,
  input: { institutionFactId: string; versionId: string },
) {
  const [version] = await executor.drizzle
    .update(institutionFactVersions)
    .set({ verificationState: "SUPERSEDED", isCurrent: false })
    .where(
      and(
        eq(institutionFactVersions.institutionFactId, input.institutionFactId),
        eq(institutionFactVersions.id, input.versionId),
        eq(institutionFactVersions.isCurrent, true),
      ),
    )
    .returning();
  return version ?? null;
}

export async function insertInstitutionFactVersion(
  executor: TransactionExecutor,
  input: typeof institutionFactVersions.$inferInsert,
) {
  const [version] = await executor.drizzle
    .insert(institutionFactVersions)
    .values(input)
    .returning();
  return version!;
}

export async function insertInstitutionFactVersionEvidence(
  executor: TransactionExecutor,
  input: typeof institutionFactVersionEvidence.$inferInsert,
) {
  const [evidence] = await executor.drizzle
    .insert(institutionFactVersionEvidence)
    .values(input)
    .returning();
  return evidence!;
}
