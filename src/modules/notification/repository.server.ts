import "server-only";

import { eq } from "drizzle-orm";

import { notificationDeliveries, notifications } from "@/src/db/schema";
import type { DatabaseExecutor } from "@/src/infrastructure/db/runtime.server";

export async function findNotificationById(
  executor: DatabaseExecutor,
  id: string,
) {
  const [notification] = await executor.drizzle
    .select()
    .from(notifications)
    .where(eq(notifications.id, id))
    .limit(1);

  return notification ?? null;
}

export async function findDeliveryById(executor: DatabaseExecutor, id: string) {
  const [delivery] = await executor.drizzle
    .select()
    .from(notificationDeliveries)
    .where(eq(notificationDeliveries.id, id))
    .limit(1);

  return delivery ?? null;
}
