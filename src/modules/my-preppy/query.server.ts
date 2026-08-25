import "server-only";

import { and, desc, eq, ne, sql } from "drizzle-orm";

import type { AnalyticsTracker } from "@/src/analytics/tracker";
import {
  consentDecisions,
  follows,
  institutions,
  notificationPreferences,
  userEmails,
  users,
} from "@/src/db/schema";
import type {
  DatabaseExecutor,
  TransactionExecutor,
  TransactionManager,
} from "@/src/infrastructure/db/runtime.server";
import { readUserSession } from "@/src/modules/auth/session.server";
import type { OpportunityCardDTO } from "@/src/modules/public/dto";
import { getPublicOpportunityCardsByIds } from "@/src/modules/public/institution-query.server";

const MAX_ACTIVE_FOLLOWS = 24;
const MAX_PUBLISHED_OPPORTUNITIES = 50;
const MAX_RECENT_CHANGES_PER_INSTITUTION = 3;

export type EmailReadinessInputs = {
  emailExists: boolean;
  emailDeliveryState: "USABLE" | "BOUNCED" | "SUPPRESSED" | "REMOVED" | null;
  emailRemoved: boolean;
  latestConsent: "GRANTED" | "REVOKED" | null;
  emailPreference: "ENABLED" | "DISABLED" | null;
};

export type MyPreppyEmailReadiness = {
  ready: boolean;
  label:
    | "이메일 업데이트 준비됨"
    | "이메일 미등록"
    | "서비스 이메일 동의 필요"
    | "이메일 업데이트 꺼짐"
    | "이메일 사용 불가";
  analyticsState: "ENABLED" | "DISABLED" | "UNAVAILABLE";
};

export type MyPreppyInstitutionRoot = {
  followId: string;
  followedAt: string;
  institution: {
    id: string;
    slug: string;
    name: string;
    category:
      "ENGLISH_KINDERGARTEN" | "PRIVATE_ELEMENTARY" | "INTERNATIONAL_SCHOOL";
    region: string | null;
  };
};

export type MyPreppyRecentChange = {
  opportunityId: string;
  institutionId: string;
  summary: string;
  publishedAt: string;
};

export type MyPreppyOpportunitySummary = {
  id: string;
  slug: string;
  title: string;
  state: "OPEN" | "UPCOMING";
  keyDate: string | null;
  lastVerifiedAt: string | null;
};

export type MyPreppyCard = MyPreppyInstitutionRoot & {
  currentAdmissionsState: "OPEN" | "UPCOMING" | null;
  currentOpportunities: MyPreppyOpportunitySummary[];
  upcomingOpportunities: MyPreppyOpportunitySummary[];
  recentChanges: Omit<MyPreppyRecentChange, "institutionId">[];
  lastVerifiedAt: string | null;
  readiness: MyPreppyEmailReadiness;
};

export type MyPreppyData = {
  activeFollowCount: number;
  cards: MyPreppyCard[];
  readiness: MyPreppyEmailReadiness;
};

export type MyPreppyResult =
  | { access: "ANONYMOUS" }
  | { access: "PENDING" }
  | { access: "DENIED" }
  | { access: "ACTIVE"; data: MyPreppyData };

export type MyPreppyPersistence = {
  findUserForShare(
    executor: TransactionExecutor,
    userId: string,
  ): Promise<{ id: string; status: string } | null>;
  listActiveFollowedInstitutions(
    executor: DatabaseExecutor,
    userId: string,
    limit: number,
  ): Promise<MyPreppyInstitutionRoot[]>;
  countActiveEligibleFollows(
    executor: DatabaseExecutor,
    userId: string,
  ): Promise<number>;
  listPublishedOpportunityIds(
    executor: DatabaseExecutor,
    institutionIds: readonly string[],
    limit: number,
  ): Promise<string[]>;
  getCanonicalOpportunityCards(
    executor: DatabaseExecutor,
    opportunityIds: readonly string[],
  ): Promise<OpportunityCardDTO[]>;
  listRecentChanges(
    executor: DatabaseExecutor,
    institutionIds: readonly string[],
    limitPerInstitution: number,
  ): Promise<MyPreppyRecentChange[]>;
  getEmailReadinessInputs(
    executor: DatabaseExecutor,
    userId: string,
  ): Promise<EmailReadinessInputs>;
};

function toIso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

export function deriveEmailReadiness(
  inputs: EmailReadinessInputs,
): MyPreppyEmailReadiness {
  if (!inputs.emailExists) {
    return {
      ready: false,
      label: "이메일 미등록",
      analyticsState: "UNAVAILABLE",
    };
  }
  if (
    inputs.emailRemoved ||
    inputs.emailDeliveryState === null ||
    inputs.emailDeliveryState !== "USABLE"
  ) {
    return {
      ready: false,
      label: "이메일 사용 불가",
      analyticsState: "UNAVAILABLE",
    };
  }
  if (inputs.latestConsent !== "GRANTED") {
    return {
      ready: false,
      label: "서비스 이메일 동의 필요",
      analyticsState: "UNAVAILABLE",
    };
  }
  if (inputs.emailPreference !== "ENABLED") {
    return {
      ready: false,
      label: "이메일 업데이트 꺼짐",
      analyticsState: "DISABLED",
    };
  }
  return {
    ready: true,
    label: "이메일 업데이트 준비됨",
    analyticsState: "ENABLED",
  };
}

export const defaultMyPreppyPersistence: MyPreppyPersistence = {
  async findUserForShare(executor, userId) {
    const [user] = await executor.drizzle
      .select({ id: users.id, status: users.status })
      .from(users)
      .where(eq(users.id, userId))
      .for("share")
      .limit(1);
    return user ?? null;
  },

  async listActiveFollowedInstitutions(executor, userId, limit) {
    const rows = await executor.drizzle
      .select({
        followId: follows.id,
        followedAt: follows.currentActivatedAt,
        institutionId: institutions.id,
        slug: institutions.slug,
        name: institutions.displayName,
        category: institutions.category,
        region: institutions.regionCode,
      })
      .from(follows)
      .innerJoin(institutions, eq(institutions.id, follows.institutionId))
      .where(
        and(
          eq(follows.userId, userId),
          eq(follows.status, "ACTIVE"),
          eq(institutions.publicationState, "PUBLISHED"),
          ne(institutions.operationalState, "CLOSED"),
        ),
      )
      .orderBy(desc(follows.currentActivatedAt), desc(follows.id))
      .limit(limit);
    return rows.flatMap((row) =>
      row.followedAt === null
        ? []
        : [
            {
              followId: row.followId,
              followedAt: toIso(row.followedAt),
              institution: {
                id: row.institutionId,
                slug: row.slug,
                name: row.name,
                category: row.category,
                region: row.region,
              },
            },
          ],
    );
  },

  async countActiveEligibleFollows(executor, userId) {
    const [row] = await executor.drizzle
      .select({ count: sql<number>`count(*)::int` })
      .from(follows)
      .innerJoin(institutions, eq(institutions.id, follows.institutionId))
      .where(
        and(
          eq(follows.userId, userId),
          eq(follows.status, "ACTIVE"),
          eq(institutions.publicationState, "PUBLISHED"),
          ne(institutions.operationalState, "CLOSED"),
        ),
      );
    return Number(row?.count ?? 0);
  },

  async listPublishedOpportunityIds(executor, institutionIds, limit) {
    if (institutionIds.length === 0) return [];
    const ids = sql.join(
      institutionIds.map((id) => sql`${id}`),
      sql`, `,
    );
    const rows = (await executor.raw(sql`
      with canonical_candidates as (
        select
          o.id,
          o.institution_id as "institutionId",
          v.business_state as state,
          o.published_at as "publishedAt"
        from opportunities o
        join opportunity_versions v
          on v.opportunity_id = o.id
          and v.is_current = true
          and v.verification_state = 'VERIFIED'
          and v.verified_at is not null
        where o.institution_id in (${ids})
          and o.publication_state = 'PUBLISHED'
          and o.truth_mode = 'NATIVE'
          and v.business_state in ('OPEN', 'UPCOMING')

        union all

        select
          o.id,
          o.institution_id,
          case
            when v.event_status = 'ACTIVE' then 'OPEN'
            when v.event_status = 'SCHEDULED' then 'UPCOMING'
          end,
          o.published_at
        from opportunities o
        join opportunity_admission_event_links link
          on link.opportunity_id = o.id
        join admission_events event
          on event.id = link.admission_event_id
          and event.is_public = true
        join admission_event_versions v
          on v.admission_event_id = event.id
          and v.is_current = true
          and v.verification_status = 'VERIFIED'
          and v.verified_at is not null
        where o.institution_id in (${ids})
          and o.publication_state = 'PUBLISHED'
          and o.truth_mode = 'LEGACY_BACKED'
          and v.event_status in ('ACTIVE', 'SCHEDULED')
      ), ranked as (
        select *, row_number() over (
          partition by "institutionId", state
          order by "publishedAt" desc nulls last, id desc
        ) as state_rank
        from canonical_candidates
      )
      select id
      from ranked
      where state_rank = 1
      order by "institutionId", case state when 'OPEN' then 0 else 1 end, id
      limit ${limit}
    `)) as unknown as Array<{ id: string }>;
    return rows.map((row) => row.id);
  },

  getCanonicalOpportunityCards(executor, opportunityIds) {
    return getPublicOpportunityCardsByIds(executor, opportunityIds);
  },

  async listRecentChanges(executor, institutionIds, limitPerInstitution) {
    if (institutionIds.length === 0) return [];
    const ids = sql.join(
      institutionIds.map((id) => sql`${id}`),
      sql`, `,
    );
    const rows = (await executor.raw(sql`
      with ranked_changes as (
        select
          change.opportunity_id as "opportunityId",
          opportunity.institution_id as "institutionId",
          change.summary,
          change.published_at as "publishedAt",
          row_number() over (
            partition by opportunity.institution_id
            order by change.published_at desc, change.id desc
          ) as institution_rank
        from opportunity_changes change
        join opportunities opportunity on opportunity.id = change.opportunity_id
        where opportunity.institution_id in (${ids})
          and opportunity.publication_state = 'PUBLISHED'
      )
      select "opportunityId", "institutionId", summary, "publishedAt"
      from ranked_changes
      where institution_rank <= ${limitPerInstitution}
      order by "institutionId", "publishedAt" desc, "opportunityId"
    `)) as unknown as Array<{
      opportunityId: string;
      institutionId: string;
      summary: string;
      publishedAt: Date | string;
    }>;
    return rows.map((row) => ({
      opportunityId: row.opportunityId,
      institutionId: row.institutionId,
      summary: row.summary,
      publishedAt: toIso(row.publishedAt),
    }));
  },

  async getEmailReadinessInputs(executor, userId) {
    const rows = (await executor.raw(sql`
      select
        (email.id is not null) as "emailExists",
        email.delivery_state as "emailDeliveryState",
        (email.removed_at is not null) as "emailRemoved",
        consent.decision as "latestConsent",
        preference.state as "emailPreference"
      from (select 1) seed
      left join lateral (
        select id, delivery_state, removed_at
        from ${userEmails}
        where user_id = ${userId}
        limit 1
      ) email on true
      left join lateral (
        select decision
        from ${consentDecisions}
        where user_id = ${userId}
          and consent_type = 'SERVICE_EMAIL_UPDATES'
        order by decided_at desc, id desc
        limit 1
      ) consent on true
      left join lateral (
        select state
        from ${notificationPreferences}
        where user_id = ${userId} and channel = 'EMAIL'
        limit 1
      ) preference on true
    `)) as unknown as Array<{
      emailExists: boolean;
      emailDeliveryState: EmailReadinessInputs["emailDeliveryState"];
      emailRemoved: boolean;
      latestConsent: EmailReadinessInputs["latestConsent"];
      emailPreference: EmailReadinessInputs["emailPreference"];
    }>;
    return (
      rows[0] ?? {
        emailExists: false,
        emailDeliveryState: null,
        emailRemoved: false,
        latestConsent: null,
        emailPreference: null,
      }
    );
  },
};

function opportunitySummary(
  card: OpportunityCardDTO,
): MyPreppyOpportunitySummary | null {
  if (card.businessState !== "OPEN" && card.businessState !== "UPCOMING") {
    return null;
  }
  return {
    id: card.id,
    slug: card.slug,
    title: card.title,
    state: card.businessState,
    keyDate: card.keyDate,
    lastVerifiedAt: card.lastVerifiedAt,
  };
}

function latestVerifiedAt(
  opportunities: readonly MyPreppyOpportunitySummary[],
): string | null {
  return (
    opportunities
      .map((item) => item.lastVerifiedAt)
      .filter((value): value is string => value !== null)
      .sort((left, right) => right.localeCompare(left))[0] ?? null
  );
}

async function queryActiveSnapshot(
  executor: TransactionExecutor,
  userId: string,
  persistence: MyPreppyPersistence,
): Promise<{ data: MyPreppyData; activeEligibleFollowCount: number }> {
  const [roots, activeEligibleFollowCount] = await Promise.all([
    persistence.listActiveFollowedInstitutions(
      executor,
      userId,
      MAX_ACTIVE_FOLLOWS,
    ),
    persistence.countActiveEligibleFollows(executor, userId),
  ]);
  const institutionIds = roots.map((root) => root.institution.id);
  const opportunityIds = await persistence.listPublishedOpportunityIds(
    executor,
    institutionIds,
    MAX_PUBLISHED_OPPORTUNITIES,
  );
  const [canonicalCards, recentChanges, readinessInputs] = await Promise.all([
    persistence.getCanonicalOpportunityCards(executor, opportunityIds),
    persistence.listRecentChanges(
      executor,
      institutionIds,
      MAX_RECENT_CHANGES_PER_INSTITUTION,
    ),
    persistence.getEmailReadinessInputs(executor, userId),
  ]);
  const readiness = deriveEmailReadiness(readinessInputs);
  const summaries = canonicalCards.flatMap((card) => {
    const summary = opportunitySummary(card);
    return summary === null
      ? []
      : [{ institutionId: card.institution.id, summary }];
  });

  return {
    activeEligibleFollowCount,
    data: {
      activeFollowCount: activeEligibleFollowCount,
      readiness,
      cards: roots.map((root) => {
        const institutionOpportunities = summaries
          .filter((item) => item.institutionId === root.institution.id)
          .map((item) => item.summary);
        const currentOpportunities = institutionOpportunities.filter(
          (item) => item.state === "OPEN",
        );
        const upcomingOpportunities = institutionOpportunities.filter(
          (item) => item.state === "UPCOMING",
        );
        return {
          ...root,
          currentAdmissionsState:
            currentOpportunities.length > 0
              ? "OPEN"
              : upcomingOpportunities.length > 0
                ? "UPCOMING"
                : null,
          currentOpportunities,
          upcomingOpportunities,
          recentChanges: recentChanges
            .filter((change) => change.institutionId === root.institution.id)
            .map((change) => ({
              opportunityId: change.opportunityId,
              summary: change.summary,
              publishedAt: change.publishedAt,
            })),
          lastVerifiedAt: latestVerifiedAt(institutionOpportunities),
          readiness,
        };
      }),
    },
  };
}

export async function loadMyPreppy(
  sessionCookie: string | null | undefined,
  dependencies: {
    sessionSecret: string;
    transactionManager: Pick<TransactionManager, "run">;
    /** @deprecated my_preppy_view is client-owned in WP-14. */
    tracker?: AnalyticsTracker;
    persistence?: MyPreppyPersistence;
    now?: Date;
  },
): Promise<MyPreppyResult> {
  const session = readUserSession(sessionCookie, {
    secret: dependencies.sessionSecret,
    now: dependencies.now,
  });
  if (!session) return { access: "ANONYMOUS" };

  const persistence = dependencies.persistence ?? defaultMyPreppyPersistence;
  const result = await dependencies.transactionManager.run(async (executor) => {
    const user = await persistence.findUserForShare(executor, session.userId);
    if (user?.status === "PENDING") return { access: "PENDING" } as const;
    if (user?.status !== "ACTIVE") return { access: "DENIED" } as const;
    const snapshot = await queryActiveSnapshot(executor, user.id, persistence);
    return {
      access: "ACTIVE",
      ...snapshot,
    } as const;
  });

  return result.access === "ACTIVE"
    ? { access: "ACTIVE", data: result.data }
    : result;
}
