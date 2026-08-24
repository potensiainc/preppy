import "server-only";

import { sql } from "drizzle-orm";

import type { DatabaseExecutor } from "@/src/infrastructure/db/runtime.server";

import type { AdminPageDTO, AdminUserDTO, EmailReadiness } from "./contracts";
import { parseUserAdminListInput } from "./input";

function iso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

export async function listAdminUsers(
  executor: DatabaseExecutor,
  rawInput: unknown,
): Promise<AdminPageDTO<AdminUserDTO>> {
  const input = parseUserAdminListInput(rawInput);
  const filters = [
    input.status === undefined ? undefined : sql`status = ${input.status}`,
    input.emailReadiness === undefined
      ? undefined
      : sql`"emailReadiness" = ${input.emailReadiness}`,
  ].filter((filter) => filter !== undefined);
  const where =
    filters.length === 0 ? sql`true` : sql.join(filters, sql` and `);
  const projection = sql`
    with latest_email_consent as (
      select distinct on (user_id) user_id, decision
      from consent_decisions
      where consent_type = 'SERVICE_EMAIL_UPDATES'
      order by user_id, decided_at desc, id desc
    ), support_projection as (
      select u.id, u.status, u.created_at as "createdAt",
        (select count(*)::int from follows f where f.user_id = u.id) as "followCount",
        case
          when u.status <> 'ACTIVE' then 'USER_INACTIVE'
          when e.user_id is null or e.removed_at is not null or e.delivery_state = 'REMOVED'
            then 'EMAIL_UNAVAILABLE'
          when e.verification_state <> 'VERIFIED' then 'EMAIL_UNVERIFIED'
          when e.delivery_state <> 'USABLE' then 'EMAIL_BLOCKED'
          when p.state is distinct from 'ENABLED' then 'PREFERENCE_DISABLED'
          when c.decision is distinct from 'GRANTED' then 'CONSENT_NOT_GRANTED'
          else 'READY'
        end as "emailReadiness"
      from users u
      left join user_emails e on e.user_id = u.id
      left join notification_preferences p
        on p.user_id = u.id and p.channel = 'EMAIL'
      left join latest_email_consent c on c.user_id = u.id
    )
  `;
  const rows = (await executor.raw(sql`
    ${projection}
    select id, status, "createdAt", "followCount", "emailReadiness"
    from support_projection
    where ${where}
    order by "createdAt" desc, id desc
    limit ${input.pageSize} offset ${(input.page - 1) * input.pageSize}
  `)) as unknown as Array<{
    id: string;
    status: AdminUserDTO["status"];
    createdAt: Date | string;
    followCount: number;
    emailReadiness: EmailReadiness;
  }>;
  const totals = (await executor.raw(sql`
    ${projection}
    select count(*)::int as total from support_projection where ${where}
  `)) as unknown as Array<{ total: number }>;
  const total = totals[0]?.total ?? 0;
  return {
    items: rows.map((row) => ({
      id: row.id,
      status: row.status,
      createdAt: iso(row.createdAt),
      followCount: row.followCount,
      emailReadiness: row.emailReadiness,
    })),
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      hasNext: input.page * input.pageSize < total,
    },
  };
}
