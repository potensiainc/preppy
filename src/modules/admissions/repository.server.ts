import "server-only";

import { and, eq } from "drizzle-orm";

import {
  opportunities,
  opportunityAdmissionEventLinks,
  opportunityVersions,
} from "@/src/db/schema";
import type {
  DatabaseExecutor,
  TransactionExecutor,
} from "@/src/infrastructure/db/runtime.server";

export async function findOpportunityById(
  executor: DatabaseExecutor,
  id: string,
) {
  const [opportunity] = await executor.drizzle
    .select()
    .from(opportunities)
    .where(eq(opportunities.id, id))
    .limit(1);

  return opportunity ?? null;
}

export async function findOpportunityForUpdate(
  executor: TransactionExecutor,
  id: string,
) {
  const [opportunity] = await executor.drizzle
    .select()
    .from(opportunities)
    .where(eq(opportunities.id, id))
    .for("update")
    .limit(1);

  return opportunity ?? null;
}

export async function findCurrentNativeVersion(
  executor: DatabaseExecutor,
  opportunityId: string,
) {
  const [version] = await executor.drizzle
    .select()
    .from(opportunityVersions)
    .where(
      and(
        eq(opportunityVersions.opportunityId, opportunityId),
        eq(opportunityVersions.isCurrent, true),
      ),
    )
    .limit(1);

  return version ?? null;
}

export async function findCurrentNativeVersionForUpdate(
  executor: TransactionExecutor,
  opportunityId: string,
) {
  const [version] = await executor.drizzle
    .select()
    .from(opportunityVersions)
    .where(
      and(
        eq(opportunityVersions.opportunityId, opportunityId),
        eq(opportunityVersions.isCurrent, true),
      ),
    )
    .for("update")
    .limit(1);

  return version ?? null;
}

export async function getLegacyAdmissionEventLink(
  executor: DatabaseExecutor,
  opportunityId: string,
) {
  const [link] = await executor.drizzle
    .select()
    .from(opportunityAdmissionEventLinks)
    .where(eq(opportunityAdmissionEventLinks.opportunityId, opportunityId))
    .limit(1);

  return link ?? null;
}
