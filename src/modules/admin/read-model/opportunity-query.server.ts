import "server-only";

import { and, desc, eq, inArray, or, sql } from "drizzle-orm";

import { NotFoundError } from "@/src/application/errors";
import {
  admissionEventVersions,
  institutions,
  opportunities,
  opportunityAdmissionEventLinks,
  opportunitySourceBindings,
  opportunityVersions,
} from "@/src/db/schema";
import type { DatabaseExecutor } from "@/src/infrastructure/db/runtime.server";

import type {
  AdminOpportunityChangeDTO,
  AdminOpportunityDTO,
  AdminOpportunityVersionDTO,
  AdminPageDTO,
} from "./contracts";
import {
  parseAdminDetailInput,
  parseOpportunityAdminListInput,
  type OpportunityAdminListInput,
} from "./input";

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function legacyEventStatus(businessState: string): string | null {
  switch (businessState) {
    case "UPCOMING":
      return "SCHEDULED";
    case "OPEN":
      return "ACTIVE";
    case "CLOSED":
    case "COMPLETED":
    case "CANCELLED":
      return businessState;
    default:
      return null;
  }
}

function listConditions(input: OpportunityAdminListInput) {
  const legacyStatus =
    input.businessState === undefined
      ? null
      : legacyEventStatus(input.businessState);
  return [
    input.institutionId === undefined
      ? undefined
      : eq(opportunities.institutionId, input.institutionId),
    input.kind === undefined ? undefined : eq(opportunities.kind, input.kind),
    input.truthMode === undefined
      ? undefined
      : eq(opportunities.truthMode, input.truthMode),
    input.publicationState === undefined
      ? undefined
      : eq(opportunities.publicationState, input.publicationState),
    input.businessState === undefined
      ? undefined
      : or(
          and(
            eq(opportunities.truthMode, "NATIVE"),
            eq(opportunityVersions.businessState, input.businessState),
          ),
          ...(legacyStatus === null
            ? []
            : [
                and(
                  eq(opportunities.truthMode, "LEGACY_BACKED"),
                  eq(admissionEventVersions.eventStatus, legacyStatus),
                ),
              ]),
        ),
  ].filter((condition) => condition !== undefined);
}

function joinedOpportunityQuery(executor: DatabaseExecutor) {
  return executor.drizzle
    .select({
      id: opportunities.id,
      slug: opportunities.slug,
      kind: opportunities.kind,
      truthMode: opportunities.truthMode,
      publicationState: opportunities.publicationState,
      institutionId: institutions.id,
      institutionDisplayName: institutions.displayName,
      currentVersionId: sql<
        string | null
      >`coalesce(${opportunityVersions.id}, ${admissionEventVersions.id})`,
      currentVersionNumber: sql<
        number | null
      >`coalesce(${opportunityVersions.versionNumber}, ${admissionEventVersions.versionNo})`,
      currentVerificationState: sql<
        AdminOpportunityVersionDTO["verificationState"] | null
      >`case
        when ${opportunities.truthMode} = 'NATIVE' then ${opportunityVersions.verificationState}
        when ${admissionEventVersions.id} is null then null
        when ${admissionEventVersions.verificationStatus} = 'VERIFIED' then 'VERIFIED'
        when ${admissionEventVersions.verificationStatus} = 'SUPERSEDED' then 'SUPERSEDED'
        else 'UNVERIFIED'
      end`,
      currentBusinessState: sql<
        AdminOpportunityVersionDTO["businessState"] | null
      >`case
        when ${opportunities.truthMode} = 'NATIVE' then ${opportunityVersions.businessState}
        when ${admissionEventVersions.id} is null then null
        when ${admissionEventVersions.eventStatus} = 'SCHEDULED' then 'UPCOMING'
        when ${admissionEventVersions.eventStatus} = 'ACTIVE' then 'OPEN'
        when ${admissionEventVersions.eventStatus} = 'CLOSED' then 'CLOSED'
        when ${admissionEventVersions.eventStatus} = 'COMPLETED' then 'COMPLETED'
        when ${admissionEventVersions.eventStatus} = 'CANCELLED' then 'CANCELLED'
        else 'UNKNOWN'
      end`,
      currentTitle: sql<
        string | null
      >`coalesce(${opportunityVersions.title}, ${admissionEventVersions.displayTitle})`,
      currentVerifiedAt: sql<Date | null>`coalesce(${opportunityVersions.verifiedAt}, ${admissionEventVersions.verifiedAt})`,
    })
    .from(opportunities)
    .innerJoin(institutions, eq(institutions.id, opportunities.institutionId))
    .leftJoin(
      opportunityVersions,
      and(
        eq(opportunityVersions.opportunityId, opportunities.id),
        eq(opportunityVersions.isCurrent, true),
      ),
    )
    .leftJoin(
      opportunityAdmissionEventLinks,
      eq(opportunityAdmissionEventLinks.opportunityId, opportunities.id),
    )
    .leftJoin(
      admissionEventVersions,
      and(
        eq(
          admissionEventVersions.admissionEventId,
          opportunityAdmissionEventLinks.admissionEventId,
        ),
        eq(admissionEventVersions.isCurrent, true),
      ),
    );
}

type OpportunityRow = Awaited<
  ReturnType<ReturnType<typeof joinedOpportunityQuery>["execute"]>
>[number];

async function loadBindingCounts(
  executor: DatabaseExecutor,
  opportunityIds: readonly string[],
): Promise<Map<string, number>> {
  if (opportunityIds.length === 0) return new Map();
  const rows = await executor.drizzle
    .select({
      opportunityId: opportunitySourceBindings.opportunityId,
      count: sql<number>`count(*)::int`,
    })
    .from(opportunitySourceBindings)
    .where(
      and(
        inArray(opportunitySourceBindings.opportunityId, opportunityIds),
        eq(opportunitySourceBindings.isActive, true),
      ),
    )
    .groupBy(opportunitySourceBindings.opportunityId);
  return new Map(rows.map((row) => [row.opportunityId, row.count]));
}

async function loadRecentChanges(
  executor: DatabaseExecutor,
  opportunityIds: readonly string[],
): Promise<Map<string, AdminOpportunityChangeDTO>> {
  const result = new Map<string, AdminOpportunityChangeDTO>();
  if (opportunityIds.length === 0) return result;
  const rows = (await executor.raw(sql`
    select distinct on (opportunity_id)
      opportunity_id as "opportunityId", id, change_type as "changeType",
      materiality, summary, verified_at as "verifiedAt",
      published_at as "publishedAt"
    from opportunity_changes
    where opportunity_id in (${sql.join(
      opportunityIds.map((id) => sql`${id}`),
      sql`, `,
    )})
    order by opportunity_id, published_at desc, id desc
  `)) as unknown as Array<{
    opportunityId: string;
    id: string;
    changeType: AdminOpportunityChangeDTO["changeType"];
    materiality: AdminOpportunityChangeDTO["materiality"];
    summary: string;
    verifiedAt: Date | string;
    publishedAt: Date | string;
  }>;
  for (const row of rows) {
    result.set(row.opportunityId, {
      id: row.id,
      changeType: row.changeType,
      materiality: row.materiality,
      summary: row.summary,
      verifiedAt: iso(row.verifiedAt)!,
      publishedAt: iso(row.publishedAt)!,
    });
  }
  return result;
}

function projectOpportunity(
  row: OpportunityRow,
  bindingCounts: ReadonlyMap<string, number>,
  changes: ReadonlyMap<string, AdminOpportunityChangeDTO>,
): AdminOpportunityDTO {
  const currentVersion =
    row.currentVersionId === null ||
    row.currentVersionNumber === null ||
    row.currentVerificationState === null ||
    row.currentBusinessState === null ||
    row.currentTitle === null
      ? null
      : {
          id: row.currentVersionId,
          versionNumber: row.currentVersionNumber,
          verificationState: row.currentVerificationState,
          businessState: row.currentBusinessState,
          title: row.currentTitle,
          verifiedAt: iso(row.currentVerifiedAt),
        };
  return {
    id: row.id,
    slug: row.slug,
    kind: row.kind,
    truthMode: row.truthMode,
    publicationState: row.publicationState,
    institution: {
      id: row.institutionId,
      displayName: row.institutionDisplayName,
    },
    currentVersion,
    activeSourceBindingCount: bindingCounts.get(row.id) ?? 0,
    recentChange: changes.get(row.id) ?? null,
  };
}

async function enrichRows(
  executor: DatabaseExecutor,
  rows: readonly OpportunityRow[],
): Promise<AdminOpportunityDTO[]> {
  const ids = rows.map((row) => row.id);
  const [bindingCounts, changes] = await Promise.all([
    loadBindingCounts(executor, ids),
    loadRecentChanges(executor, ids),
  ]);
  return rows.map((row) => projectOpportunity(row, bindingCounts, changes));
}

export async function listAdminOpportunities(
  executor: DatabaseExecutor,
  rawInput: unknown,
): Promise<AdminPageDTO<AdminOpportunityDTO>> {
  const input = parseOpportunityAdminListInput(rawInput);
  const conditions = listConditions(input);
  const where = conditions.length === 0 ? undefined : and(...conditions);
  const [rows, totals] = await Promise.all([
    joinedOpportunityQuery(executor)
      .where(where)
      .orderBy(desc(opportunities.updatedAt), desc(opportunities.id))
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize),
    executor.drizzle
      .select({ total: sql<number>`count(*)::int` })
      .from(opportunities)
      .leftJoin(
        opportunityVersions,
        and(
          eq(opportunityVersions.opportunityId, opportunities.id),
          eq(opportunityVersions.isCurrent, true),
        ),
      )
      .leftJoin(
        opportunityAdmissionEventLinks,
        eq(opportunityAdmissionEventLinks.opportunityId, opportunities.id),
      )
      .leftJoin(
        admissionEventVersions,
        and(
          eq(
            admissionEventVersions.admissionEventId,
            opportunityAdmissionEventLinks.admissionEventId,
          ),
          eq(admissionEventVersions.isCurrent, true),
        ),
      )
      .where(where),
  ]);
  const total = totals[0]?.total ?? 0;
  return {
    items: await enrichRows(executor, rows),
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      hasNext: input.page * input.pageSize < total,
    },
  };
}

export async function getAdminOpportunity(
  executor: DatabaseExecutor,
  rawInput: unknown,
): Promise<AdminOpportunityDTO> {
  const input = parseAdminDetailInput(rawInput);
  const rows = await joinedOpportunityQuery(executor)
    .where(eq(opportunities.id, input.id))
    .limit(1);
  const row = rows[0];
  if (!row) throw new NotFoundError();
  return (await enrichRows(executor, [row]))[0]!;
}
