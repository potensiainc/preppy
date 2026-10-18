import "server-only";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { sources, sourceSnapshots, sourceObservations } from "@/src/db/schema";
import type { TransactionExecutor } from "@/src/infrastructure/db/runtime.server";
import { ValidationError } from "@/src/application/errors";
import type { SessionPackage } from "./session-package";
import { reviewedSourceEligibility } from "./reviewed-source-policy";
export async function captureReviewedSource(
  executor: TransactionExecutor,
  evidence: SessionPackage["sources"][number],
) {
  let [source] = await executor.drizzle
    .select()
    .from(sources)
    .where(eq(sources.canonicalUrl, evidence.url))
    .for("update")
    .limit(1);
  if (!source)
    [source] = await executor.drizzle
      .insert(sources)
      .values({
        canonicalUrl: evidence.url,
        sourceName: evidence.name,
        sourceType: "OFFICIAL_ADMISSION_PAGE",
        authorityLevel: "PRIMARY",
        lifecycleStatus: "ACTIVE",
      })
      .returning();
  if (!source || reviewedSourceEligibility(source))
    throw ValidationError.invalidRequest();
  const hash = createHash("sha256")
    .update(evidence.normalizedText)
    .digest("hex");
  let [snapshot] = await executor.drizzle
    .select()
    .from(sourceSnapshots)
    .where(
      and(
        eq(sourceSnapshots.sourceId, source.id),
        eq(sourceSnapshots.contentHash, hash),
      ),
    )
    .limit(1);
  if (!snapshot)
    [snapshot] = await executor.drizzle
      .insert(sourceSnapshots)
      .values({
        sourceId: source.id,
        capturedAt: new Date(evidence.checkedAt),
        contentHash: hash,
        normalizedText: evidence.normalizedText,
        mimeType: "text/plain",
      })
      .returning();
  const [observation] = await executor.drizzle
    .insert(sourceObservations)
    .values({
      sourceId: source.id,
      observedAt: new Date(evidence.checkedAt),
      outcome: "SUCCESS",
      httpStatus: null,
      finalUrl: evidence.url,
      snapshotId: snapshot!.id,
    })
    .returning();
  return {
    sourceId: source.id,
    observationId: observation!.id.toString(),
    snapshotId: snapshot!.id,
  };
}
