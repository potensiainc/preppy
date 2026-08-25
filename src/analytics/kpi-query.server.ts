import "server-only";

import { sql } from "drizzle-orm";

import type { DatabaseExecutor } from "@/src/infrastructure/db/runtime.server";

export type OperationalKpiSnapshot = Readonly<{
  asOf: string;
  activeMonitoringParents: number;
  activeUsers: number;
  usersWithActiveFollow: number;
  totalActiveFollows: number;
  averageActiveFollowsPerAmp: number;
  emailReadyFollowUsers: number;
  newUsers30d: number;
  newFollows30d: number;
}>;

type KpiRow = {
  activeMonitoringParents: number | string;
  activeUsers: number | string;
  usersWithActiveFollow: number | string;
  totalActiveFollows: number | string;
  averageActiveFollowsPerAmp: number | string;
  emailReadyFollowUsers: number | string;
  newUsers30d: number | string;
  newFollows30d: number | string;
};

function finiteCount(value: number | string, name: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid operational KPI result: ${name}`);
  }
  return parsed;
}

export async function getOperationalKpiSnapshot(
  executor: DatabaseExecutor,
  asOf: Date = new Date(),
): Promise<OperationalKpiSnapshot> {
  if (!Number.isFinite(asOf.getTime()))
    throw new Error("Invalid KPI asOf time");
  const cutoff30d = new Date(
    asOf.getTime() - 30 * 24 * 60 * 60 * 1_000,
  ).toISOString();
  const rows = (await executor.raw(sql`
    with active_follow_counts as (
      select user_id, count(*)::int as active_follow_count
      from follows
      where status = 'ACTIVE'
      group by user_id
    ),
    email_ready as (
      select user_id
      from user_emails
      where verification_state = 'VERIFIED'
        and delivery_state = 'USABLE'
        and removed_at is null
    ),
    latest_service_consent as (
      select distinct on (user_id) user_id, decision
      from consent_decisions
      where consent_type = 'SERVICE_EMAIL_UPDATES'
      order by user_id, decided_at desc, id desc
    ),
    user_state as (
      select
        u.id,
        u.status,
        u.created_at,
        coalesce(af.active_follow_count, 0)::int as active_follow_count,
        (er.user_id is not null) as email_ready,
        lc.decision as service_email_consent,
        np.state as email_preference
      from users u
      left join active_follow_counts af on af.user_id = u.id
      left join email_ready er on er.user_id = u.id
      left join latest_service_consent lc on lc.user_id = u.id
      left join notification_preferences np
        on np.user_id = u.id and np.channel = 'EMAIL'
    )
    select
      count(*) filter (
        where status = 'ACTIVE'
          and active_follow_count >= 1
          and email_ready
          and service_email_consent = 'GRANTED'
          and email_preference = 'ENABLED'
      )::int as "activeMonitoringParents",
      count(*) filter (where status = 'ACTIVE')::int as "activeUsers",
      count(*) filter (
        where status = 'ACTIVE' and active_follow_count >= 1
      )::int as "usersWithActiveFollow",
      coalesce(sum(active_follow_count), 0)::int as "totalActiveFollows",
      coalesce(
        sum(active_follow_count) filter (
          where status = 'ACTIVE'
            and active_follow_count >= 1
            and email_ready
            and service_email_consent = 'GRANTED'
            and email_preference = 'ENABLED'
        )::double precision
        / nullif(count(*) filter (
          where status = 'ACTIVE'
            and active_follow_count >= 1
            and email_ready
            and service_email_consent = 'GRANTED'
            and email_preference = 'ENABLED'
        ), 0),
        0
      )::double precision as "averageActiveFollowsPerAmp",
      count(*) filter (
        where status = 'ACTIVE' and active_follow_count >= 1 and email_ready
      )::int as "emailReadyFollowUsers",
      count(*) filter (
        where created_at >= ${cutoff30d}::timestamptz
      )::int as "newUsers30d",
      (
        select count(*)::int from follows
        where first_activated_at >= ${cutoff30d}::timestamptz
      ) as "newFollows30d"
    from user_state
  `)) as unknown as KpiRow[];
  const row = rows[0];
  if (!row) throw new Error("Operational KPI query returned no row");
  return {
    asOf: asOf.toISOString(),
    activeMonitoringParents: finiteCount(
      row.activeMonitoringParents,
      "activeMonitoringParents",
    ),
    activeUsers: finiteCount(row.activeUsers, "activeUsers"),
    usersWithActiveFollow: finiteCount(
      row.usersWithActiveFollow,
      "usersWithActiveFollow",
    ),
    totalActiveFollows: finiteCount(
      row.totalActiveFollows,
      "totalActiveFollows",
    ),
    averageActiveFollowsPerAmp: finiteCount(
      row.averageActiveFollowsPerAmp,
      "averageActiveFollowsPerAmp",
    ),
    emailReadyFollowUsers: finiteCount(
      row.emailReadyFollowUsers,
      "emailReadyFollowUsers",
    ),
    newUsers30d: finiteCount(row.newUsers30d, "newUsers30d"),
    newFollows30d: finiteCount(row.newFollows30d, "newFollows30d"),
  };
}
