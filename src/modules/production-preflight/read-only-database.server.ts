import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/src/db/schema";
import type { ReadOnlyDatabaseExecutor } from "@/src/infrastructure/db/runtime.server";

export type ProductionReadOnlySettings = {
  transactionReadOnly: string;
  defaultTransactionReadOnly: string;
};

export type ProductionReadOnlyMetadata = ProductionReadOnlySettings & {
  databaseName: string;
  databaseUser: string;
  serverVersion: string;
  snapshotConsistency: "REPEATABLE_READ_READ_ONLY";
};

export class UnsafeProductionConnectionError extends Error {
  readonly exitCode = 3;

  constructor() {
    super("Production connection is not demonstrably read-only.");
    this.name = "UnsafeProductionConnectionError";
  }
}

export const PREFLIGHT_TABLES = [
  "admin_users",
  "schools",
  "school_aliases",
  "admission_cycles",
  "admission_events",
  "admission_event_versions",
  "admission_facts",
  "admission_fact_versions",
  "expected_windows",
  "sources",
  "source_monitor_configs",
  "source_snapshots",
  "source_observations",
  "detected_changes",
  "meaningful_changes",
  "event_version_evidence",
  "fact_version_evidence",
  "source_bindings",
  "updates",
  "update_changes",
  "guides",
  "subscribers",
  "subscriptions",
  "subscription_action_tokens",
  "alerts",
  "alert_deliveries",
  "audit_logs",
  "institutions",
  "institution_school_links",
  "opportunities",
  "opportunity_admission_event_links",
  "opportunity_versions",
  "opportunity_version_evidence",
  "opportunity_changes",
  "institution_facts",
  "institution_fact_versions",
  "institution_fact_version_evidence",
  "users",
  "auth_identities",
  "user_emails",
  "user_profiles",
  "user_interest_regions",
  "user_interest_categories",
  "consent_decisions",
  "notification_preferences",
  "follows",
  "follow_episodes",
  "institution_source_bindings",
  "opportunity_source_bindings",
  "notifications",
  "notification_deliveries",
  "notification_delivery_attempts",
  "outbox_events",
  "articles",
  "article_institutions",
  "article_opportunities",
  "url_redirects",
  "email_provider_events",
] as const;

export type PreflightTable = (typeof PREFLIGHT_TABLES)[number];
export type PreflightDistribution =
  | "institutionPublication"
  | "institutionOperational"
  | "opportunityPublication"
  | "opportunityTruthMode"
  | "userStatus"
  | "userEmailVerification"
  | "userEmailDelivery"
  | "followStatus"
  | "outboxStatus"
  | "notificationStatus"
  | "notificationDeliveryStatus"
  | "deliveryAttemptStatus"
  | "articleStatus"
  | "providerEventStatus";

export type BridgeIntegrityCounts = {
  orphanInstitutionBridge: number;
  orphanOpportunityBridge: number;
  bridgeOwnershipContradiction: number;
  legacyOpportunityMissingBridge: number;
  nativeOpportunityWithBridge: number;
  legacyBackedInstitutions: number;
  nativeInstitutions: number;
  invalidMixedOwnership: number;
  orphanInstitutionSourceBinding: number;
  orphanOpportunitySourceBinding: number;
  multipleInstitutionPrimary: number;
  multipleOpportunityPrimary: number;
};

export type IdentityIntegrityCounts = {
  duplicateAuthIdentity: number;
  duplicateUserEmail: number;
  duplicateNotificationPreference: number;
  duplicateFollow: number;
  invalidFollowEpisodeInterval: number;
  activeFollowWithoutOpenEpisode: number;
  multipleOpenEpisodes: number;
  inactiveFollowWithOpenEpisode: number;
  activeUserMissingRequiredConsent: number;
  activeUserMissingEmailPreference: number;
};

export type NotificationIntegrityCounts = {
  staleProcessingLease: number;
  failedOutbox: number;
  deadLetterOutbox: number;
  resultUnknownAttempt: number;
  orphanDelivery: number;
  orphanDeliveryAttempt: number;
  duplicateProviderMessage: number;
  orphanProviderEvent: number;
};

export type ArticleIntegrityCounts = {
  publishedArticle: number;
  unsafeArticleBody: number;
  redirectChain: number;
  redirectSourceCollision: number;
  nonpublicRedirectTarget: number;
  sameOriginCanonicalMismatch: number;
};

export function assertReadOnlySessionSettings(
  settings: ProductionReadOnlySettings,
): void {
  if (
    settings.transactionReadOnly.toLowerCase() !== "on" ||
    settings.defaultTransactionReadOnly.toLowerCase() !== "on"
  ) {
    throw new UnsafeProductionConnectionError();
  }
}

const MUTATION_SQL =
  /\b(?:insert|update|delete|merge|create|alter|drop|truncate|copy|vacuum|reindex|refresh|grant|revoke|comment|cluster|discard|call|do)\b/i;
const STATEFUL_FUNCTION =
  /\b(?:nextval|setval|pg_advisory_(?:xact_)?lock|pg_terminate_backend|pg_cancel_backend|lo_import|lo_unlink|dblink)\s*\(/i;

export function isReadOnlySqlText(query: string): boolean {
  const normalized = query.trim().replace(/;\s*$/, "");
  if (!/^(?:select|show|with)\b/i.test(normalized)) return false;
  if (normalized.includes(";")) return false;
  if (MUTATION_SQL.test(normalized) || STATEFUL_FUNCTION.test(normalized)) {
    return false;
  }
  return true;
}

export class ReadOnlyPreflightSession {
  constructor(
    private readonly sql: postgres.TransactionSql,
    private readonly rootOptions: postgres.Sql["options"],
  ) {}

  async listPublicTables(): Promise<string[]> {
    const rows = await this.sql<{ tableName: string }[]>`
      select table_name as "tableName"
      from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
      order by table_name
    `;
    return rows.map((row) => row.tableName);
  }

  async getAppliedMigrationRows(): Promise<Array<{
    id: number;
    hash: string;
    createdAt: number;
  }> | null> {
    const [relation] = await this.sql<{ relationName: string | null }[]>`
      select to_regclass('drizzle.__drizzle_migrations')::text as "relationName"
    `;
    if (!relation?.relationName) return null;
    const rows = await this.sql<
      Array<{ id: number; hash: string; createdAt: string }>
    >`
      select id, hash, created_at::text as "createdAt"
      from drizzle.__drizzle_migrations
      order by created_at, id
    `;
    return rows.map((row) => ({
      id: row.id,
      hash: row.hash,
      createdAt: Number(row.createdAt),
    }));
  }

  createBackfillExecutor(): ReadOnlyDatabaseExecutor {
    const transactionClient = new Proxy(this.sql, {
      get: (target, property, receiver) =>
        property === "options"
          ? this.rootOptions
          : Reflect.get(target, property, receiver),
    }) as unknown as postgres.Sql;
    const database = drizzle(transactionClient, { schema });
    return {
      scope: "transaction",
      drizzle: {
        select: database.select.bind(database),
        execute: database.execute.bind(database),
      },
      raw: database.execute.bind(database),
    };
  }

  async listPublicColumns(): Promise<
    Array<{
      tableName: string;
      columnName: string;
      dataType: string;
      nullable: boolean;
    }>
  > {
    const rows = await this.sql<
      Array<{
        tableName: string;
        columnName: string;
        dataType: string;
        isNullable: "YES" | "NO";
      }>
    >`
      select table_name as "tableName", column_name as "columnName",
        data_type as "dataType", is_nullable as "isNullable"
      from information_schema.columns
      where table_schema = 'public'
      order by table_name, ordinal_position
    `;
    return rows.map(({ isNullable, ...row }) => ({
      ...row,
      nullable: isNullable === "YES",
    }));
  }

  async listPublicIndexes(): Promise<string[]> {
    const rows = await this.sql<{ indexName: string }[]>`
      select indexname as "indexName"
      from pg_indexes
      where schemaname = 'public'
      order by indexname
    `;
    return rows.map((row) => row.indexName);
  }

  async listPublicConstraints(): Promise<string[]> {
    const rows = await this.sql<{ constraintName: string }[]>`
      select constraint_row.conname as "constraintName"
      from pg_catalog.pg_constraint constraint_row
      join pg_catalog.pg_namespace namespace_row
        on namespace_row.oid = constraint_row.connamespace
      where namespace_row.nspname = 'public'
      order by constraint_row.conname
    `;
    return rows.map((row) => row.constraintName);
  }

  async countTable(table: PreflightTable): Promise<number> {
    if (!(PREFLIGHT_TABLES as readonly string[]).includes(table)) {
      throw new Error("Table is not allowlisted for preflight inventory.");
    }
    const [row] = await this.sql<{ count: string }[]>`
      select count(*)::text as count from ${this.sql(table)}
    `;
    return Number(row?.count ?? 0);
  }

  async getDistribution(
    distribution: PreflightDistribution,
  ): Promise<Record<string, number>> {
    const query = (() => {
      switch (distribution) {
        case "institutionPublication":
          return this
            .sql`select publication_state as value, count(*)::text as count from institutions group by publication_state order by publication_state`;
        case "institutionOperational":
          return this
            .sql`select operational_state as value, count(*)::text as count from institutions group by operational_state order by operational_state`;
        case "opportunityPublication":
          return this
            .sql`select publication_state as value, count(*)::text as count from opportunities group by publication_state order by publication_state`;
        case "opportunityTruthMode":
          return this
            .sql`select truth_mode as value, count(*)::text as count from opportunities group by truth_mode order by truth_mode`;
        case "userStatus":
          return this
            .sql`select status as value, count(*)::text as count from users group by status order by status`;
        case "userEmailVerification":
          return this
            .sql`select verification_state as value, count(*)::text as count from user_emails group by verification_state order by verification_state`;
        case "userEmailDelivery":
          return this
            .sql`select delivery_state as value, count(*)::text as count from user_emails group by delivery_state order by delivery_state`;
        case "followStatus":
          return this
            .sql`select status as value, count(*)::text as count from follows group by status order by status`;
        case "outboxStatus":
          return this
            .sql`select status as value, count(*)::text as count from outbox_events group by status order by status`;
        case "notificationStatus":
          return this
            .sql`select status as value, count(*)::text as count from notifications group by status order by status`;
        case "notificationDeliveryStatus":
          return this
            .sql`select status as value, count(*)::text as count from notification_deliveries group by status order by status`;
        case "deliveryAttemptStatus":
          return this
            .sql`select attempt_status as value, count(*)::text as count from notification_delivery_attempts group by attempt_status order by attempt_status`;
        case "articleStatus":
          return this
            .sql`select status as value, count(*)::text as count from articles group by status order by status`;
        case "providerEventStatus":
          return this
            .sql`select processing_status as value, count(*)::text as count from email_provider_events group by processing_status order by processing_status`;
      }
    })();
    const rows = (await query) as unknown as Array<{
      value: string;
      count: string;
    }>;
    return Object.fromEntries(
      rows.map((row) => [row.value, Number(row.count)]),
    );
  }

  async getBridgeIntegrityCounts(): Promise<BridgeIntegrityCounts> {
    const [row] = await this.sql<BridgeIntegrityCounts[]>`
      select
        (select count(*)::int from institution_school_links l
          left join institutions i on i.id = l.institution_id
          left join schools s on s.id = l.school_id
          where i.id is null or s.id is null) as "orphanInstitutionBridge",
        (select count(*)::int from opportunity_admission_event_links l
          left join opportunities o on o.id = l.opportunity_id
          left join admission_events e on e.id = l.admission_event_id
          left join admission_cycles c on c.id = l.admission_cycle_id
          left join institution_school_links isl
            on isl.institution_id = l.institution_id and isl.school_id = l.school_id
          where o.id is null or e.id is null or c.id is null or isl.institution_id is null)
          as "orphanOpportunityBridge",
        (select count(*)::int from opportunity_admission_event_links l
          join opportunities o on o.id = l.opportunity_id
          join admission_events e on e.id = l.admission_event_id
          join admission_cycles c on c.id = l.admission_cycle_id
          where o.institution_id <> l.institution_id
             or o.truth_mode <> 'LEGACY_BACKED'
             or e.admission_cycle_id <> l.admission_cycle_id
             or c.school_id <> l.school_id) as "bridgeOwnershipContradiction",
        (select count(*)::int from opportunities o
          left join opportunity_admission_event_links l on l.opportunity_id = o.id
          where o.truth_mode = 'LEGACY_BACKED' and l.opportunity_id is null)
          as "legacyOpportunityMissingBridge",
        (select count(*)::int from opportunities o
          join opportunity_admission_event_links l on l.opportunity_id = o.id
          where o.truth_mode = 'NATIVE') as "nativeOpportunityWithBridge",
        (select count(distinct i.id)::int from institutions i
          join institution_school_links l on l.institution_id = i.id)
          as "legacyBackedInstitutions",
        (select count(*)::int from institutions i
          left join institution_school_links l on l.institution_id = i.id
          where l.institution_id is null) as "nativeInstitutions",
        (select count(distinct o.institution_id)::int from opportunities o
          left join opportunity_admission_event_links l on l.opportunity_id = o.id
          where (o.truth_mode = 'NATIVE' and l.opportunity_id is not null)
             or (o.truth_mode = 'LEGACY_BACKED' and l.opportunity_id is null))
          as "invalidMixedOwnership",
        (select count(*)::int from institution_source_bindings b
          left join institutions i on i.id = b.institution_id
          left join sources s on s.id = b.source_id
          where i.id is null or s.id is null) as "orphanInstitutionSourceBinding",
        (select count(*)::int from opportunity_source_bindings b
          left join opportunities o on o.id = b.opportunity_id
          left join sources s on s.id = b.source_id
          where o.id is null or s.id is null) as "orphanOpportunitySourceBinding",
        (select count(*)::int from (
          select institution_id from institution_source_bindings
          where is_active and is_primary and role = 'OFFICIAL_MAIN'
          group by institution_id having count(*) > 1
        ) conflicts) as "multipleInstitutionPrimary",
        (select count(*)::int from (
          select opportunity_id, role from opportunity_source_bindings
          where is_active and is_primary
          group by opportunity_id, role having count(*) > 1
        ) conflicts) as "multipleOpportunityPrimary"
    `;
    if (!row) throw new Error("Bridge integrity aggregate is unavailable.");
    return row;
  }

  async getIdentityIntegrityCounts(): Promise<IdentityIntegrityCounts> {
    const [row] = await this.sql<IdentityIntegrityCounts[]>`
      select
        (select count(*)::int from (
          select provider, provider_subject from auth_identities
          group by provider, provider_subject having count(*) > 1
        ) duplicates) as "duplicateAuthIdentity",
        (select count(*)::int from (
          select user_id from user_emails group by user_id having count(*) > 1
        ) duplicates) as "duplicateUserEmail",
        (select count(*)::int from (
          select user_id, channel from notification_preferences
          group by user_id, channel having count(*) > 1
        ) duplicates) as "duplicateNotificationPreference",
        (select count(*)::int from (
          select user_id, institution_id from follows
          group by user_id, institution_id having count(*) > 1
        ) duplicates) as "duplicateFollow",
        (select count(*)::int from follow_episodes
          where deactivated_at is not null and deactivated_at < activated_at)
          as "invalidFollowEpisodeInterval",
        (select count(*)::int from follows f
          left join follow_episodes e
            on e.follow_id = f.id and e.deactivated_at is null
          where f.status = 'ACTIVE' and e.id is null)
          as "activeFollowWithoutOpenEpisode",
        (select count(*)::int from (
          select follow_id from follow_episodes where deactivated_at is null
          group by follow_id having count(*) > 1
        ) duplicates) as "multipleOpenEpisodes",
        (select count(*)::int from follows f
          join follow_episodes e
            on e.follow_id = f.id and e.deactivated_at is null
          where f.status = 'INACTIVE') as "inactiveFollowWithOpenEpisode",
        (select count(*)::int from users u where u.status = 'ACTIVE' and exists (
          select 1 from (values
            ('TERMS_OF_SERVICE'), ('PRIVACY_POLICY'), ('SERVICE_EMAIL_UPDATES')
          ) required(consent_type)
          where not exists (
            select 1 from lateral (
              select c.decision from consent_decisions c
              where c.user_id = u.id and c.consent_type = required.consent_type
              order by c.decided_at desc, c.id desc limit 1
            ) latest where latest.decision = 'GRANTED'
          )
        )) as "activeUserMissingRequiredConsent",
        (select count(*)::int from users u
          left join notification_preferences p
            on p.user_id = u.id and p.channel = 'EMAIL'
          where u.status = 'ACTIVE' and p.user_id is null)
          as "activeUserMissingEmailPreference"
    `;
    if (!row) throw new Error("Identity integrity aggregate is unavailable.");
    return row;
  }

  async getNotificationIntegrityCounts(
    staleBefore: Date,
  ): Promise<NotificationIntegrityCounts> {
    const [row] = await this.sql<NotificationIntegrityCounts[]>`
      select
        (select count(*)::int from outbox_events
          where status = 'PROCESSING'
            and locked_at < ${staleBefore.toISOString()}::timestamptz)
          as "staleProcessingLease",
        (select count(*)::int from outbox_events where status = 'FAILED')
          as "failedOutbox",
        (select count(*)::int from outbox_events where status = 'DEAD_LETTER')
          as "deadLetterOutbox",
        (select count(*)::int from notification_delivery_attempts
          where attempt_status = 'STARTED'
            and error_code = 'PROVIDER_RESULT_UNKNOWN')
          as "resultUnknownAttempt",
        (select count(*)::int from notification_deliveries d
          left join notifications n on n.id = d.notification_id
          left join users u on u.id = d.user_id
          where n.id is null or u.id is null) as "orphanDelivery",
        (select count(*)::int from notification_delivery_attempts a
          left join notification_deliveries d
            on d.id = a.notification_delivery_id
          where d.id is null) as "orphanDeliveryAttempt",
        (select count(*)::int from (
          select provider, provider_message_id
          from notification_delivery_attempts
          where provider_message_id is not null
          group by provider, provider_message_id having count(*) > 1
        ) duplicates) as "duplicateProviderMessage",
        (select count(*)::int from email_provider_events e
          where e.provider_message_id is not null and not exists (
            select 1 from notification_delivery_attempts a
            where a.provider = e.provider
              and a.provider_message_id = e.provider_message_id
          )) as "orphanProviderEvent"
    `;
    if (!row)
      throw new Error("Notification integrity aggregate is unavailable.");
    return row;
  }

  async getArticleIntegrityCounts(
    appBaseUrl: string,
  ): Promise<ArticleIntegrityCounts> {
    const base = appBaseUrl.replace(/\/$/, "");
    const [row] = await this.sql<ArticleIntegrityCounts[]>`
      select
        (select count(*)::int from articles where status = 'PUBLISHED')
          as "publishedArticle",
        (select count(*)::int from articles
          where content_html ~* '<script|javascript:|on[a-z]+[[:space:]]*=')
          as "unsafeArticleBody",
        (select count(*)::int from url_redirects source
          join url_redirects target
            on target.source_path = source.target_path
           and target.disabled_at is null
          where source.disabled_at is null) as "redirectChain",
        (select count(*)::int from url_redirects r
          join articles a on r.source_path = '/articles/' || a.slug
          where r.disabled_at is null) as "redirectSourceCollision",
        (select count(*)::int from url_redirects r
          join articles a on r.target_path = '/articles/' || a.slug
          where r.disabled_at is null and a.status <> 'PUBLISHED')
          as "nonpublicRedirectTarget",
        (select count(*)::int from articles
          where canonical_url is not null
            and canonical_url like ${`${base}/%`}
            and canonical_url <> ${base} || '/articles/' || slug)
          as "sameOriginCanonicalMismatch"
    `;
    if (!row) throw new Error("Article integrity aggregate is unavailable.");
    return row;
  }
}

export async function runWithProductionReadOnlyDatabase<T>(
  databaseUrl: string,
  operation: (context: {
    metadata: ProductionReadOnlyMetadata;
    session: ReadOnlyPreflightSession;
  }) => Promise<T>,
  options: { statementTimeoutMs?: number; connectTimeoutSeconds?: number } = {},
): Promise<T> {
  const statementTimeoutMs = options.statementTimeoutMs ?? 5_000;
  const client = postgres(databaseUrl, {
    max: 1,
    connect_timeout: options.connectTimeoutSeconds ?? 5,
    idle_timeout: 5,
    connection: {
      application_name: "preppy-production-preflight",
      statement_timeout: statementTimeoutMs,
      idle_in_transaction_session_timeout: Math.max(
        statementTimeoutMs * 2,
        10_000,
      ),
    },
  });

  try {
    const [transactionSetting] = await client<
      { transaction_read_only: string }[]
    >`show transaction_read_only`;
    const [defaultSetting] = await client<
      { default_transaction_read_only: string }[]
    >`show default_transaction_read_only`;
    const [identity] = await client<
      { databaseName: string; databaseUser: string; serverVersion: string }[]
    >`
      select current_database() as "databaseName",
        current_user as "databaseUser",
        version() as "serverVersion"
    `;
    const settings = {
      transactionReadOnly:
        transactionSetting?.transaction_read_only ?? "unknown",
      defaultTransactionReadOnly:
        defaultSetting?.default_transaction_read_only ?? "unknown",
    };
    assertReadOnlySessionSettings(settings);
    if (!identity)
      throw new Error("Production database identity is unavailable.");

    const metadata: ProductionReadOnlyMetadata = {
      ...settings,
      ...identity,
      snapshotConsistency: "REPEATABLE_READ_READ_ONLY",
    };

    const result = await client.begin(
      "isolation level repeatable read read only",
      async (transaction) => {
        const [verified] = await transaction<
          { transaction_read_only: string }[]
        >`show transaction_read_only`;
        assertReadOnlySessionSettings({
          transactionReadOnly: verified?.transaction_read_only ?? "unknown",
          defaultTransactionReadOnly: settings.defaultTransactionReadOnly,
        });
        return operation({
          metadata,
          session: new ReadOnlyPreflightSession(transaction, client.options),
        });
      },
    );
    return result as T;
  } finally {
    await client.end({ timeout: 5 });
  }
}

export async function runWithRehearsalReadOnlyDatabase<T>(
  databaseUrl: string,
  operation: (context: {
    metadata: ProductionReadOnlyMetadata;
    session: ReadOnlyPreflightSession;
  }) => Promise<T>,
  options: { statementTimeoutMs?: number; connectTimeoutSeconds?: number } = {},
): Promise<T> {
  const statementTimeoutMs = options.statementTimeoutMs ?? 10_000;
  const client = postgres(databaseUrl, {
    max: 1,
    connect_timeout: options.connectTimeoutSeconds ?? 5,
    idle_timeout: 5,
    connection: {
      application_name: "preppy-rehearsal-readback",
      statement_timeout: statementTimeoutMs,
      idle_in_transaction_session_timeout: Math.max(
        statementTimeoutMs * 2,
        20_000,
      ),
    },
  });
  try {
    const [defaultSetting] = await client<
      { default_transaction_read_only: string }[]
    >`show default_transaction_read_only`;
    const [identity] = await client<
      { databaseName: string; databaseUser: string; serverVersion: string }[]
    >`
      select current_database() as "databaseName",
        current_user as "databaseUser",
        version() as "serverVersion"
    `;
    if (!identity)
      throw new Error("Rehearsal database identity is unavailable.");
    const result = await client.begin(
      "isolation level repeatable read read only",
      async (transaction) => {
        const [setting] = await transaction<
          { transaction_read_only: string }[]
        >`show transaction_read_only`;
        if (setting?.transaction_read_only !== "on") {
          throw new Error("Rehearsal readback transaction is not read-only.");
        }
        return operation({
          metadata: {
            transactionReadOnly: "on",
            defaultTransactionReadOnly:
              defaultSetting?.default_transaction_read_only ?? "unknown",
            ...identity,
            snapshotConsistency: "REPEATABLE_READ_READ_ONLY",
          },
          session: new ReadOnlyPreflightSession(transaction, client.options),
        });
      },
    );
    return result as T;
  } finally {
    await client.end({ timeout: 5 });
  }
}
