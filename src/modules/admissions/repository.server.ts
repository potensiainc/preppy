import "server-only";

import { and, eq } from "drizzle-orm";

import {
  admissionEvents,
  admissionEventVersions,
  eventVersionEvidence,
  meaningfulChanges,
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

export async function getLegacyAdmissionEventLinkForUpdate(
  executor: TransactionExecutor,
  opportunityId: string,
): Promise<typeof opportunityAdmissionEventLinks.$inferSelect | null> {
  const [link] = await executor.drizzle
    .select()
    .from(opportunityAdmissionEventLinks)
    .where(eq(opportunityAdmissionEventLinks.opportunityId, opportunityId))
    .for("update")
    .limit(1);
  return link ?? null;
}

export async function findAdmissionEventForUpdate(
  executor: TransactionExecutor,
  eventId: string,
) {
  const [event] = await executor.drizzle
    .select()
    .from(admissionEvents)
    .where(eq(admissionEvents.id, eventId))
    .for("update")
    .limit(1);
  return event ?? null;
}

export async function findCurrentAdmissionEventVersionForUpdate(
  executor: TransactionExecutor,
  eventId: string,
) {
  const [version] = await executor.drizzle
    .select()
    .from(admissionEventVersions)
    .where(
      and(
        eq(admissionEventVersions.admissionEventId, eventId),
        eq(admissionEventVersions.isCurrent, true),
      ),
    )
    .for("update")
    .limit(1);
  return version ?? null;
}

export async function supersedeCurrentAdmissionEventVersion(
  executor: TransactionExecutor,
  input: { eventId: string; versionId: string },
) {
  const [version] = await executor.drizzle
    .update(admissionEventVersions)
    .set({ verificationStatus: "SUPERSEDED", isCurrent: false })
    .where(
      and(
        eq(admissionEventVersions.id, input.versionId),
        eq(admissionEventVersions.admissionEventId, input.eventId),
        eq(admissionEventVersions.isCurrent, true),
      ),
    )
    .returning();
  return version ?? null;
}

export async function insertAdmissionEventVersion(
  executor: TransactionExecutor,
  input: typeof admissionEventVersions.$inferInsert,
) {
  const [version] = await executor.drizzle
    .insert(admissionEventVersions)
    .values(input)
    .returning();
  return version!;
}

export async function insertEventVersionEvidence(
  executor: TransactionExecutor,
  input: typeof eventVersionEvidence.$inferInsert,
) {
  const [evidence] = await executor.drizzle
    .insert(eventVersionEvidence)
    .values(input)
    .returning();
  return evidence!;
}

export async function findEventVersionEvidenceForSource(
  executor: DatabaseExecutor,
  input: { eventVersionId: string; sourceId: string },
) {
  const [evidence] = await executor.drizzle
    .select()
    .from(eventVersionEvidence)
    .where(
      and(
        eq(eventVersionEvidence.eventVersionId, input.eventVersionId),
        eq(eventVersionEvidence.sourceId, input.sourceId),
      ),
    )
    .limit(1);
  return evidence ?? null;
}

export async function insertMeaningfulChange(
  executor: TransactionExecutor,
  input: typeof meaningfulChanges.$inferInsert,
) {
  const [change] = await executor.drizzle
    .insert(meaningfulChanges)
    .values(input)
    .returning();
  return change!;
}
