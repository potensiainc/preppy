import "server-only";

import { desc, eq, gte, sql } from "drizzle-orm";

import { opportunityChanges, outboxEvents, sources } from "@/src/db/schema";
import type { DatabaseExecutor } from "@/src/infrastructure/db/runtime.server";
import { countMonitoringDueStates } from "@/src/modules/monitoring/queue-query.server";

import type { AdminDashboardDTO } from "./contracts";

const RECENT_CHANGE_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;
const RECENT_CHANGE_LIMIT = 8;

export type AdminDashboardDependencies = Readonly<{
  now: Date;
}>;

function iso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

export async function getAdminDashboard(
  executor: DatabaseExecutor,
  dependencies: AdminDashboardDependencies,
): Promise<AdminDashboardDTO> {
  const recentSince = new Date(
    dependencies.now.getTime() - RECENT_CHANGE_WINDOW_MS,
  );
  const [
    monitoring,
    recentRows,
    recentTotals,
    unavailableTotals,
    pendingTotals,
    deadLetterTotals,
  ] = await Promise.all([
    countMonitoringDueStates({ executor, now: dependencies.now }),
    executor.drizzle
      .select({
        id: opportunityChanges.id,
        changeType: opportunityChanges.changeType,
        materiality: opportunityChanges.materiality,
        summary: opportunityChanges.summary,
        verifiedAt: opportunityChanges.verifiedAt,
        publishedAt: opportunityChanges.publishedAt,
      })
      .from(opportunityChanges)
      .where(gte(opportunityChanges.verifiedAt, recentSince))
      .orderBy(desc(opportunityChanges.verifiedAt), desc(opportunityChanges.id))
      .limit(RECENT_CHANGE_LIMIT),
    executor.drizzle
      .select({ total: sql<number>`count(*)::int` })
      .from(opportunityChanges)
      .where(gte(opportunityChanges.verifiedAt, recentSince)),
    executor.drizzle
      .select({ total: sql<number>`count(*)::int` })
      .from(sources)
      .where(eq(sources.lifecycleStatus, "PAUSED")),
    executor.drizzle
      .select({ total: sql<number>`count(*)::int` })
      .from(outboxEvents)
      .where(eq(outboxEvents.status, "PENDING")),
    executor.drizzle
      .select({ total: sql<number>`count(*)::int` })
      .from(outboxEvents)
      .where(eq(outboxEvents.status, "DEAD_LETTER")),
  ]);

  return {
    monitoring,
    recentVerifiedChanges: {
      count: recentTotals[0]?.total ?? 0,
      items: recentRows.map((row) => ({
        id: row.id,
        changeType: row.changeType,
        materiality: row.materiality,
        summary: row.summary,
        verifiedAt: iso(row.verifiedAt),
        publishedAt: iso(row.publishedAt),
      })),
    },
    unavailableSources: unavailableTotals[0]?.total ?? 0,
    outbox: {
      pending: pendingTotals[0]?.total ?? 0,
      deadLetter: deadLetterTotals[0]?.total ?? 0,
    },
  };
}
