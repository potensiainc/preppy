import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import {
  notificationDeliveries,
  notificationDeliveryAttempts,
  notifications,
} from "@/src/db/schema";
import type { DatabaseExecutor } from "@/src/infrastructure/db/runtime.server";

import type { AdminNotificationDTO, AdminPageDTO } from "./contracts";
import { parseNotificationAdminListInput } from "./input";

function iso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

async function aggregateCounts(
  executor: DatabaseExecutor,
  notificationIds: readonly string[],
): Promise<{ deliveries: Map<string, number>; attempts: Map<string, number> }> {
  if (notificationIds.length === 0) {
    return { deliveries: new Map(), attempts: new Map() };
  }
  const [deliveryRows, attemptRows] = await Promise.all([
    executor.drizzle
      .select({
        notificationId: notificationDeliveries.notificationId,
        count: sql<number>`count(*)::int`,
      })
      .from(notificationDeliveries)
      .where(inArray(notificationDeliveries.notificationId, notificationIds))
      .groupBy(notificationDeliveries.notificationId),
    executor.drizzle
      .select({
        notificationId: notificationDeliveries.notificationId,
        count: sql<number>`count(*)::int`,
      })
      .from(notificationDeliveryAttempts)
      .innerJoin(
        notificationDeliveries,
        eq(
          notificationDeliveries.id,
          notificationDeliveryAttempts.notificationDeliveryId,
        ),
      )
      .where(inArray(notificationDeliveries.notificationId, notificationIds))
      .groupBy(notificationDeliveries.notificationId),
  ]);
  return {
    deliveries: new Map(
      deliveryRows.map((row) => [row.notificationId, row.count]),
    ),
    attempts: new Map(
      attemptRows.map((row) => [row.notificationId, row.count]),
    ),
  };
}

export async function listAdminNotifications(
  executor: DatabaseExecutor,
  rawInput: unknown,
): Promise<AdminPageDTO<AdminNotificationDTO>> {
  const input = parseNotificationAdminListInput(rawInput);
  const conditions = [
    input.status === undefined
      ? undefined
      : eq(notifications.status, input.status),
    input.signalType === undefined
      ? undefined
      : eq(notifications.signalType, input.signalType),
  ].filter((condition) => condition !== undefined);
  const where = conditions.length === 0 ? undefined : and(...conditions);
  const [rows, totals] = await Promise.all([
    executor.drizzle
      .select({
        id: notifications.id,
        status: notifications.status,
        signalType: notifications.signalType,
        opportunityId: notifications.opportunityId,
        opportunityChangeId: notifications.opportunityChangeId,
        signalPublishedAt: notifications.signalPublishedAt,
      })
      .from(notifications)
      .where(where)
      .orderBy(desc(notifications.signalPublishedAt), desc(notifications.id))
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize),
    executor.drizzle
      .select({ total: sql<number>`count(*)::int` })
      .from(notifications)
      .where(where),
  ]);
  const counts = await aggregateCounts(
    executor,
    rows.map((row) => row.id),
  );
  const total = totals[0]?.total ?? 0;
  return {
    items: rows.map((row) => ({
      id: row.id,
      status: row.status,
      signalType: row.signalType,
      opportunityId: row.opportunityId,
      opportunityChangeId: row.opportunityChangeId,
      signalPublishedAt: iso(row.signalPublishedAt),
      deliveryCount: counts.deliveries.get(row.id) ?? 0,
      attemptCount: counts.attempts.get(row.id) ?? 0,
    })),
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      hasNext: input.page * input.pageSize < total,
    },
  };
}
