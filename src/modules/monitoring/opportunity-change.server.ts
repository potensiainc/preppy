import "server-only";

import { AuditWriter } from "@/src/application/audit-writer.server";
import type { AdminCommandContext } from "@/src/application/context";
import { OutboxWriter } from "@/src/application/outbox-writer.server";
import type {
  OpportunityChangeMateriality,
  OpportunityChangeType,
} from "@/src/db/schema";
import type { TransactionExecutor } from "@/src/infrastructure/db/runtime.server";
import {
  findOpportunityChangeByDedupeKey,
  findOutboxEventByDedupeKey,
  insertOpportunityChange,
} from "@/src/modules/monitoring/repository.server";

const POLICY_VERSION = "OPPORTUNITY_NOTIFICATION_V1";

type CommonChangeInput = Readonly<{
  opportunityId: string;
  sourceId: string;
  changeType: OpportunityChangeType;
  materiality: OpportunityChangeMateriality;
  summary: string;
  changedFields: readonly string[];
  customerSignalEligible: boolean;
  auditReason?: string;
}>;

export type NativeChangeOrigin = CommonChangeInput &
  Readonly<{
    truthMode: "NATIVE";
    fromVersionId: string | null;
    toVersionId: string;
  }>;

export type LegacyChangeOrigin = CommonChangeInput &
  Readonly<{
    truthMode: "LEGACY_BACKED";
    meaningfulChangeId: string;
    admissionEventId: string;
  }>;

export type CanonicalChangeInput = NativeChangeOrigin | LegacyChangeOrigin;

export type CanonicalChangeDependencies = Readonly<{
  findByDedupeKey: typeof findOpportunityChangeByDedupeKey;
  findOutboxByDedupeKey: typeof findOutboxEventByDedupeKey;
  insertChange: typeof insertOpportunityChange;
  writeAudit: typeof AuditWriter.write;
  enqueueOutbox: typeof OutboxWriter.enqueue;
}>;

export const defaultCanonicalChangeDependencies: CanonicalChangeDependencies = {
  findByDedupeKey: findOpportunityChangeByDedupeKey,
  findOutboxByDedupeKey: findOutboxEventByDedupeKey,
  insertChange: insertOpportunityChange,
  writeAudit: AuditWriter.write,
  enqueueOutbox: OutboxWriter.enqueue,
};

function changeDedupeKey(input: CanonicalChangeInput): string {
  return input.truthMode === "NATIVE"
    ? `NATIVE:${input.opportunityId}:${input.toVersionId}`
    : `LEGACY:${input.opportunityId}:${input.meaningfulChangeId}`;
}

export function createOpportunityChangeOutboxDedupeKey(
  opportunityChangeId: string,
): string {
  return `OPPORTUNITY_CHANGE_PUBLISHED:${opportunityChangeId}:${POLICY_VERSION}`;
}

function canonicalFieldName(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9_]/g, "_")
    .toUpperCase();
}

export async function publishCanonicalOpportunityChange(
  executor: TransactionExecutor,
  ctx: AdminCommandContext,
  input: CanonicalChangeInput,
  dependencies: CanonicalChangeDependencies = defaultCanonicalChangeDependencies,
) {
  const dedupeKey = changeDedupeKey(input);
  const existing = await dependencies.findByDedupeKey(executor, dedupeKey);
  if (existing) {
    const existingOutbox = await dependencies.findOutboxByDedupeKey(
      executor,
      createOpportunityChangeOutboxDedupeKey(existing.id),
    );
    return {
      change: existing,
      outboxEnqueued: existingOutbox !== null,
      created: false,
    };
  }

  const change = await dependencies.insertChange(executor, {
    opportunityId: input.opportunityId,
    truthMode: input.truthMode,
    changeType: input.changeType,
    materiality: input.materiality,
    ...(input.truthMode === "NATIVE"
      ? {
          fromNativeVersionId: input.fromVersionId,
          toNativeVersionId: input.toVersionId,
        }
      : {
          legacyMeaningfulChangeId: input.meaningfulChangeId,
          legacyAdmissionEventId: input.admissionEventId,
        }),
    summary: input.summary,
    detectedAt: ctx.occurredAt,
    verifiedAt: ctx.occurredAt,
    publishedAt: ctx.occurredAt,
    dedupeKey,
    createdAt: ctx.occurredAt,
  });

  await dependencies.writeAudit(
    {
      adminUserId: ctx.adminUserId,
      actionType:
        input.truthMode === "NATIVE"
          ? "WP10B_VERIFY_NATIVE_OPPORTUNITY"
          : "WP10B_VERIFY_LEGACY_OPPORTUNITY",
      entityType: "OPPORTUNITY",
      entityId: input.opportunityId,
      correlationId: ctx.correlationId,
      ...((input.auditReason ?? ctx.reason)
        ? { reason: input.auditReason ?? ctx.reason }
        : {}),
      occurredAt: ctx.occurredAt,
      metadata: {
        sourceId: input.sourceId,
        versionId:
          input.truthMode === "NATIVE"
            ? input.toVersionId
            : input.meaningfulChangeId,
        changeId: change.id,
        changedFields: input.changedFields.map(canonicalFieldName),
        outcomeCode: input.materiality,
      },
    },
    executor,
  );

  if (input.materiality === "NOTIFIABLE" && input.customerSignalEligible) {
    await dependencies.enqueueOutbox(
      {
        eventType: "OPPORTUNITY_CHANGE_PUBLISHED",
        aggregateType: "OPPORTUNITY_CHANGE",
        aggregateId: change.id,
        dedupeKey: createOpportunityChangeOutboxDedupeKey(change.id),
        payloadSafe: {
          opportunityId: input.opportunityId,
          opportunityChangeId: change.id,
          policyVersion: POLICY_VERSION,
          signalPublishedAt: ctx.occurredAt.toISOString(),
        },
      },
      executor,
    );
  }

  return {
    change,
    outboxEnqueued:
      input.materiality === "NOTIFIABLE" && input.customerSignalEligible,
    created: true,
  };
}
