import "server-only";

import { sql } from "drizzle-orm";

import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/src/application/errors";
import type { TransactionManager } from "@/src/infrastructure/db/runtime.server";
import {
  deliverySendDedupeKey,
  OPPORTUNITY_NOTIFICATION_POLICY_VERSION,
  opportunityChangeNotificationDedupeKey,
} from "@/src/modules/notification/policy";
import { completeOutboxEvent } from "@/src/modules/outbox/transitions.server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WORKER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export type ResolveOpportunityChangeEventInput = Readonly<{
  eventId: string;
  opportunityChangeId: string;
  workerId: string;
  now: Date;
}>;

export type ResolverTestHooks = Readonly<{
  beforeComplete?: () => Promise<void>;
}>;

type ChangeProjection = {
  changeId: string;
  opportunityId: string;
  changeType: string;
  summary: string;
  signalPublishedAt: Date | string;
  opportunitySlug: string;
  opportunityKind: string;
  institutionId: string;
  institutionName: string;
};

function validateInput(input: ResolveOpportunityChangeEventInput) {
  if (
    !UUID_PATTERN.test(input.eventId) ||
    !UUID_PATTERN.test(input.opportunityChangeId) ||
    !WORKER_ID_PATTERN.test(input.workerId) ||
    !(input.now instanceof Date) ||
    !Number.isFinite(input.now.getTime())
  ) {
    throw ValidationError.invalidRequest();
  }
}

export async function resolveOpportunityChangeEvent(
  transactionManager: Pick<TransactionManager, "run">,
  input: ResolveOpportunityChangeEventInput,
  hooks: ResolverTestHooks = {},
) {
  validateInput(input);
  const nowIso = input.now.toISOString();

  return transactionManager.run(async (executor) => {
    const [source] = (await executor.raw(sql`
      select aggregate_id as "aggregateId"
      from outbox_events
      where id=${input.eventId}
        and event_type='OPPORTUNITY_CHANGE_PUBLISHED'
        and aggregate_type='OPPORTUNITY_CHANGE'
        and status='PROCESSING'
        and locked_by=${input.workerId}
      for update
    `)) as unknown as Array<{ aggregateId: string }>;
    if (!source) throw new ConflictError();
    if (source.aggregateId !== input.opportunityChangeId) {
      throw new ConflictError();
    }

    const [change] = (await executor.raw(sql`
      select change.id as "changeId",
        change.opportunity_id as "opportunityId",
        change.change_type as "changeType",
        change.summary,
        change.published_at as "signalPublishedAt",
        opportunity.slug as "opportunitySlug",
        opportunity.kind as "opportunityKind",
        institution.id as "institutionId",
        institution.display_name as "institutionName"
      from opportunity_changes as change
      join opportunities as opportunity on opportunity.id=change.opportunity_id
      join institutions as institution on institution.id=opportunity.institution_id
      where change.id=${input.opportunityChangeId}
        and change.materiality='NOTIFIABLE'
      for share of change, opportunity, institution
    `)) as unknown as ChangeProjection[];
    if (!change) throw new NotFoundError();

    const notificationDedupeKey = opportunityChangeNotificationDedupeKey(
      change.changeId,
    );
    const titleSnapshot = `${change.institutionName} 입학정보 변경`;
    const bodyContext = JSON.stringify({
      institutionId: change.institutionId,
      institutionName: change.institutionName,
      opportunityId: change.opportunityId,
      opportunityKind: change.opportunityKind,
      opportunitySlug: change.opportunitySlug,
      changeType: change.changeType,
      summary: change.summary,
    });
    const signalIso = new Date(change.signalPublishedAt).toISOString();
    const insertedNotifications = (await executor.raw(sql`
      insert into notifications(
        opportunity_id, opportunity_change_id, signal_type, policy_version,
        status, signal_published_at, title_snapshot, body_context_json,
        deep_link_path, dedupe_key, created_at
      ) values (
        ${change.opportunityId}, ${change.changeId}, 'OPPORTUNITY_CHANGED',
        ${OPPORTUNITY_NOTIFICATION_POLICY_VERSION}, 'PENDING',
        ${signalIso}::timestamptz, ${titleSnapshot}, ${bodyContext}::jsonb,
        ${`/opportunities/${change.opportunitySlug}`},
        ${notificationDedupeKey}, ${nowIso}::timestamptz
      )
      on conflict do nothing
      returning id
    `)) as unknown as Array<{ id: string }>;
    let notificationId = insertedNotifications[0]?.id;
    const createdNotification = notificationId !== undefined;
    if (!notificationId) {
      const [existing] = (await executor.raw(sql`
        select id from notifications
        where opportunity_change_id=${change.changeId}
          and policy_version=${OPPORTUNITY_NOTIFICATION_POLICY_VERSION}
        limit 1
        for update
      `)) as unknown as Array<{ id: string }>;
      if (!existing) throw new ConflictError();
      notificationId = existing.id;
    }

    const eligibleUsers = (await executor.raw(sql`
      select distinct follow.user_id as "userId"
      from follows as follow
      join follow_episodes as episode on episode.follow_id=follow.id
      join users as identity on identity.id=follow.user_id
      where follow.institution_id=${change.institutionId}
        and episode.activated_at <= ${signalIso}::timestamptz
        and (
          episode.deactivated_at is null
          or ${signalIso}::timestamptz < episode.deactivated_at
        )
      order by follow.user_id
    `)) as unknown as Array<{ userId: string }>;

    for (const { userId } of eligibleUsers) {
      const insertedDeliveries = (await executor.raw(sql`
        insert into notification_deliveries(
          notification_id, user_id, channel, status, created_at
        ) values (
          ${notificationId}, ${userId}, 'EMAIL', 'PENDING',
          ${nowIso}::timestamptz
        )
        on conflict do nothing
        returning id
      `)) as unknown as Array<{ id: string }>;
      let deliveryId = insertedDeliveries[0]?.id;
      if (!deliveryId) {
        const [existing] = (await executor.raw(sql`
          select id from notification_deliveries
          where notification_id=${notificationId} and user_id=${userId}
            and channel='EMAIL'
          limit 1
          for update
        `)) as unknown as Array<{ id: string }>;
        if (!existing) throw new ConflictError();
        deliveryId = existing.id;
      }

      const sendDedupeKey = deliverySendDedupeKey(deliveryId);
      const sendPayload = JSON.stringify({ deliveryId });
      await executor.raw(sql`
        insert into outbox_events(
          event_type, aggregate_type, aggregate_id, payload, status,
          available_at, attempt_count, dedupe_key, max_attempts, created_at
        ) values (
          'DELIVERY_EMAIL_SEND', 'NOTIFICATION_DELIVERY', ${deliveryId},
          ${sendPayload}::jsonb, 'PENDING', ${nowIso}::timestamptz, 0,
          ${sendDedupeKey}, 3, ${nowIso}::timestamptz
        )
        on conflict do nothing
      `);
      await executor.raw(sql`
        update notification_deliveries
        set status='QUEUED', queued_at=coalesce(queued_at, ${nowIso}::timestamptz)
        where id=${deliveryId} and status='PENDING'
      `);
    }

    await executor.raw(sql`
      update notifications
      set status='READY', ready_at=coalesce(ready_at, ${nowIso}::timestamptz)
      where id=${notificationId} and status='PENDING'
    `);

    await hooks.beforeComplete?.();
    await completeOutboxEvent(executor, {
      eventId: input.eventId,
      workerId: input.workerId,
      now: input.now,
    });

    return {
      notificationId,
      createdNotification,
      deliveries: eligibleUsers.length,
    };
  });
}
