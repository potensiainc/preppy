import { randomUUID } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { migrateDatabase } from "@/src/db/migrate";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL must be set");
assertDedicatedTestDatabaseUrl(databaseUrl);

const sql = postgres(databaseUrl, { max: 4 });
const schemaLockSql = postgres(databaseUrl, { max: 1 });
const prefix = `wp-04b-notification-${randomUUID()}-`;
const primaryDatabaseName = new URL(databaseUrl).pathname.slice(1);
const upgradeDatabaseBase = primaryDatabaseName
  .replace(/(?:^|_)(?:test|verify\d*)$/, "")
  .replace(/[^a-zA-Z0-9_]/g, "_")
  .slice(0, 28);
const upgradeDatabaseName = `${upgradeDatabaseBase}_wp04b_verify${`${Date.now()}${randomUUID().replace(/\D/g, "")}`.slice(0, 20)}`;
if (!/^[A-Za-z0-9_]+_verify\d+$/.test(upgradeDatabaseName)) {
  throw new Error("WP-04B upgrade database name must be identifier-safe");
}
const upgradeDatabaseUrl = new URL(databaseUrl);
upgradeDatabaseUrl.pathname = `/${upgradeDatabaseName}`;
assertDedicatedTestDatabaseUrl(upgradeDatabaseUrl.toString());
const maintenanceDatabaseUrl = new URL(databaseUrl);
maintenanceDatabaseUrl.pathname = "/postgres";
const migrationDirectory = resolve(process.cwd(), "src/db/migrations");

async function currentMigrationCount(): Promise<number> {
  const journal = JSON.parse(
    await readFile(join(migrationDirectory, "meta", "_journal.json"), "utf8"),
  ) as { entries: unknown[] };
  return journal.entries.length;
}

type ColumnCatalog = {
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: "YES" | "NO";
  column_default: string | null;
};

type ConstraintCatalog = {
  conname: string;
  contype: string;
  definition: string;
};

type IndexCatalog = {
  indexname: string;
  indexdef: string;
};

type TriggerCatalog = {
  trigger_name: string;
  definition: string;
};

type RelationCatalog = {
  columns: ColumnCatalog[];
  constraints: ConstraintCatalog[];
  indexes: IndexCatalog[];
  triggers: TriggerCatalog[];
};

const fixtureIds = {
  institutions: new Set<string>(),
  opportunities: new Set<string>(),
  opportunityChanges: new Set<string>(),
  opportunityVersions: new Set<string>(),
  users: new Set<string>(),
};

async function institution() {
  const id = randomUUID();
  await sql`insert into institutions(id, slug, display_name, category)
    values (${id}, ${`${prefix}${id}`}, 'WP-04B Institution', 'ENGLISH_KINDERGARTEN')`;
  fixtureIds.institutions.add(id);
  return id;
}

async function opportunity() {
  const id = randomUUID();
  await sql`insert into opportunities(id, institution_id, slug, kind, truth_mode)
    values (${id}, ${await institution()}, ${`${prefix}${id}`}, 'APPLICATION', 'NATIVE')`;
  fixtureIds.opportunities.add(id);
  return id;
}

async function opportunityChange(inputOpportunityId?: string) {
  const opportunityId = inputOpportunityId ?? (await opportunity());
  const versionId = randomUUID();
  await sql`insert into opportunity_versions(
      id, opportunity_id, truth_mode, version_number, verification_state,
      business_state, is_current, title, verified_at
    ) values (
      ${versionId}, ${opportunityId}, 'NATIVE', 1, 'VERIFIED', 'UPCOMING',
      false, 'WP-04B Version', now()
    )`;
  fixtureIds.opportunityVersions.add(versionId);
  const id = randomUUID();
  await sql`insert into opportunity_changes(
      id, opportunity_id, truth_mode, change_type, materiality,
      to_native_version_id, summary, verified_at, published_at, dedupe_key
    ) values (
      ${id}, ${opportunityId}, 'NATIVE', 'NEW_OPPORTUNITY', 'NOTIFIABLE',
      ${versionId}, 'WP-04B Change', now(), now(), ${`${prefix}change-${id}`}
    )`;
  fixtureIds.opportunityChanges.add(id);
  return { id, opportunityId };
}

async function user(status = "ACTIVE") {
  const id = randomUUID();
  await sql`insert into users(id, status) values (${id}, ${status})`;
  fixtureIds.users.add(id);
  return id;
}

async function notification(
  input: {
    opportunityId?: string;
    changeId?: string | null;
    signalType?: "OPPORTUNITY_CHANGED" | "OPPORTUNITY_PUBLISHED";
    policyVersion?: string;
    dedupeKey?: string;
  } = {},
) {
  const origin =
    input.opportunityId === undefined
      ? await opportunityChange()
      : { id: input.changeId ?? null, opportunityId: input.opportunityId };
  const signalType = input.signalType ?? "OPPORTUNITY_CHANGED";
  const id = randomUUID();
  await sql`insert into notifications(
      id, opportunity_id, opportunity_change_id, signal_type, policy_version,
      status, signal_published_at, title_snapshot, body_context_json,
      deep_link_path, dedupe_key
    ) values (
      ${id}, ${origin.opportunityId},
      ${signalType === "OPPORTUNITY_CHANGED" ? origin.id : null},
      ${signalType}, ${input.policyVersion ?? "policy-v1"}, 'PENDING', now(),
      'WP-04B notification', '{"kind":"test"}'::jsonb, '/opportunities/test',
      ${input.dedupeKey ?? `${prefix}notification-${id}`}
    )`;
  return { id, opportunityId: origin.opportunityId, changeId: origin.id };
}

async function delivery(
  input: {
    notificationId?: string;
    userId?: string;
    status?: string;
    suppressReason?: string | null;
  } = {},
) {
  const id = randomUUID();
  await sql`insert into notification_deliveries(
      id, notification_id, user_id, channel, status, suppress_reason, suppressed_at
    ) values (
      ${id}, ${input.notificationId ?? (await notification()).id},
      ${input.userId ?? (await user())}, 'EMAIL', ${input.status ?? "PENDING"},
      ${input.suppressReason ?? null},
      ${input.status === "SUPPRESSED" ? new Date("2026-08-22T00:00:00Z") : null}
    )`;
  return id;
}

async function resetUpgradeDatabase() {
  const maintenanceSql = postgres(maintenanceDatabaseUrl.toString(), {
    max: 1,
  });
  try {
    await maintenanceSql`select pg_terminate_backend(pid)
      from pg_stat_activity where datname = ${upgradeDatabaseName} and pid <> pg_backend_pid()`;
    await maintenanceSql`drop database if exists ${maintenanceSql(upgradeDatabaseName)}`;
  } finally {
    await maintenanceSql.end({ timeout: 5 });
  }
}

async function createPreWp04bMigrationFolder(): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), "preppy-wp04b-upgrade-"));
  const metadataDirectory = join(folder, "meta");
  await mkdir(metadataDirectory);
  const journal = JSON.parse(
    await readFile(join(migrationDirectory, "meta", "_journal.json"), "utf8"),
  ) as { entries: unknown[] };
  journal.entries = journal.entries.slice(0, 7);
  await writeFile(
    join(metadataDirectory, "_journal.json"),
    `${JSON.stringify(journal, null, 2)}\n`,
  );
  for (const filename of [
    "0000_absent_shen.sql",
    "0001_productive_morph.sql",
    "0002_spicy_starbolt.sql",
    "0003_stormy_mach_iv.sql",
    "0004_panoramic_vindicator.sql",
    "0005_canonical_identity_follow.sql",
    "0006_bright_garia.sql",
  ]) {
    await copyFile(join(migrationDirectory, filename), join(folder, filename));
  }
  return folder;
}

async function migrateMigrationFolder(
  targetDatabaseUrl: string,
  folder: string,
): Promise<void> {
  const migrationClient = postgres(targetDatabaseUrl, { max: 1 });
  const database = drizzle(migrationClient);
  try {
    await migrate(database, { migrationsFolder: folder });
  } finally {
    await migrationClient.end({ timeout: 5 });
  }
}

async function relationCatalog(
  executor: postgres.Sql,
  tableName: string,
): Promise<RelationCatalog> {
  const [columns, constraints, indexes, triggers] = await Promise.all([
    executor<ColumnCatalog[]>`
      select column_name, data_type, udt_name, is_nullable, column_default
      from information_schema.columns
      where table_schema = 'public' and table_name = ${tableName}
      order by ordinal_position`,
    executor<ConstraintCatalog[]>`
      select con.conname, con.contype, pg_get_constraintdef(con.oid) as definition
      from pg_constraint as con
      join pg_class as relation on relation.oid = con.conrelid
      join pg_namespace as namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public' and relation.relname = ${tableName}
      order by con.conname`,
    executor<IndexCatalog[]>`
      select indexname, indexdef from pg_indexes
      where schemaname = 'public' and tablename = ${tableName}
      order by indexname`,
    executor<TriggerCatalog[]>`
      select trigger.tgname as trigger_name, pg_get_triggerdef(trigger.oid) as definition
      from pg_trigger as trigger
      join pg_class as relation on relation.oid = trigger.tgrelid
      join pg_namespace as namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public' and relation.relname = ${tableName}
        and not trigger.tgisinternal
      order by trigger.tgname`,
  ]);
  return { columns, constraints, indexes, triggers };
}

async function clearWp04bFixtures() {
  const tracked = {
    institutions: [...fixtureIds.institutions],
    opportunities: [...fixtureIds.opportunities],
    opportunityChanges: [...fixtureIds.opportunityChanges],
    opportunityVersions: [...fixtureIds.opportunityVersions],
    users: [...fixtureIds.users],
  };
  try {
    await sql.begin(async (transaction) => {
      await transaction`delete from notification_delivery_attempts as attempt
        using notification_deliveries as delivery, notifications as notification
        where attempt.notification_delivery_id = delivery.id
          and delivery.notification_id = notification.id
          and notification.dedupe_key like ${`${prefix}%`}`;
      await transaction`delete from notification_deliveries as delivery
        using notifications as notification
        where delivery.notification_id = notification.id
          and notification.dedupe_key like ${`${prefix}%`}`;
      await transaction`delete from notifications
        where dedupe_key like ${`${prefix}%`}`;
      if (tracked.users.length > 0) {
        await transaction`delete from user_emails where user_id in ${sql(tracked.users)}`;
        await transaction`delete from users where id in ${sql(tracked.users)}`;
      }
      // OpportunityChange/Version fixtures are append-only; scope trigger bypass
      // to this transaction and the exact helper-created IDs below.
      await transaction.unsafe("set local session_replication_role = replica");
      if (tracked.opportunityChanges.length > 0) {
        await transaction`delete from opportunity_changes where id in ${sql(tracked.opportunityChanges)}`;
      }
      if (tracked.opportunityVersions.length > 0) {
        await transaction`delete from opportunity_versions where id in ${sql(tracked.opportunityVersions)}`;
      }
      if (tracked.opportunities.length > 0) {
        await transaction`delete from opportunities where id in ${sql(tracked.opportunities)}`;
      }
      if (tracked.institutions.length > 0) {
        await transaction`delete from institutions where id in ${sql(tracked.institutions)}`;
      }
    });
  } finally {
    fixtureIds.institutions.clear();
    fixtureIds.opportunities.clear();
    fixtureIds.opportunityChanges.clear();
    fixtureIds.opportunityVersions.clear();
    fixtureIds.users.clear();
  }
}

describe("WP-04B canonical Notification persistence", () => {
  beforeAll(async () => {
    await schemaLockSql`select pg_advisory_lock(hashtext('admissionradar-schema-tests'))`;
    await migrateDatabase(databaseUrl);
  });

  afterEach(clearWp04bFixtures);

  afterAll(async () => {
    await schemaLockSql`select pg_advisory_unlock(hashtext('admissionradar-schema-tests'))`;
    await schemaLockSql.end({ timeout: 5 });
    await sql.end({ timeout: 5 });
  });

  it("exposes the exact canonical Notification, Delivery, and Attempt catalog without PII columns", async () => {
    const catalogs = Object.fromEntries(
      await Promise.all(
        [
          "notifications",
          "notification_deliveries",
          "notification_delivery_attempts",
        ].map(async (tableName) => [
          tableName,
          await relationCatalog(sql, tableName),
        ]),
      ),
    ) as Record<string, RelationCatalog>;
    const columns = (tableName: string) =>
      catalogs[tableName]!.columns.map((column) => [
        column.column_name,
        column.data_type,
        column.udt_name,
        column.is_nullable,
        column.column_default,
      ]);
    expect(columns("notifications")).toEqual([
      ["id", "uuid", "uuid", "NO", "gen_random_uuid()"],
      ["opportunity_id", "uuid", "uuid", "NO", null],
      ["opportunity_change_id", "uuid", "uuid", "YES", null],
      ["signal_type", "text", "text", "NO", null],
      ["policy_version", "text", "text", "NO", null],
      ["status", "text", "text", "NO", null],
      [
        "signal_published_at",
        "timestamp with time zone",
        "timestamptz",
        "NO",
        null,
      ],
      ["title_snapshot", "text", "text", "NO", null],
      ["body_context_json", "jsonb", "jsonb", "NO", null],
      ["deep_link_path", "text", "text", "NO", null],
      ["dedupe_key", "text", "text", "NO", null],
      ["created_at", "timestamp with time zone", "timestamptz", "NO", "now()"],
      ["ready_at", "timestamp with time zone", "timestamptz", "YES", null],
      ["completed_at", "timestamp with time zone", "timestamptz", "YES", null],
      ["cancelled_at", "timestamp with time zone", "timestamptz", "YES", null],
    ]);
    expect(columns("notification_deliveries")).toEqual([
      ["id", "uuid", "uuid", "NO", "gen_random_uuid()"],
      ["notification_id", "uuid", "uuid", "NO", null],
      ["user_id", "uuid", "uuid", "NO", null],
      ["channel", "text", "text", "NO", null],
      ["status", "text", "text", "NO", null],
      ["suppress_reason", "text", "text", "YES", null],
      ["recipient_hash", "text", "text", "YES", null],
      ["created_at", "timestamp with time zone", "timestamptz", "NO", "now()"],
      ["queued_at", "timestamp with time zone", "timestamptz", "YES", null],
      ["sent_at", "timestamp with time zone", "timestamptz", "YES", null],
      ["delivered_at", "timestamp with time zone", "timestamptz", "YES", null],
      ["opened_at", "timestamp with time zone", "timestamptz", "YES", null],
      ["clicked_at", "timestamp with time zone", "timestamptz", "YES", null],
      ["failed_at", "timestamp with time zone", "timestamptz", "YES", null],
      ["suppressed_at", "timestamp with time zone", "timestamptz", "YES", null],
    ]);
    expect(columns("notification_delivery_attempts")).toEqual([
      ["id", "uuid", "uuid", "NO", "gen_random_uuid()"],
      ["notification_delivery_id", "uuid", "uuid", "NO", null],
      ["attempt_number", "integer", "int4", "NO", null],
      ["provider", "text", "text", "NO", null],
      ["provider_message_id", "text", "text", "YES", null],
      ["attempt_status", "text", "text", "NO", null],
      ["error_code", "text", "text", "YES", null],
      ["error_message_safe", "text", "text", "YES", null],
      [
        "attempted_at",
        "timestamp with time zone",
        "timestamptz",
        "NO",
        "now()",
      ],
      ["completed_at", "timestamp with time zone", "timestamptz", "YES", null],
      ["created_at", "timestamp with time zone", "timestamptz", "NO", "now()"],
    ]);
    const definitions = (tableName: string) =>
      Object.fromEntries(
        catalogs[tableName]!.constraints.map((constraint) => [
          constraint.conname,
          [constraint.contype, constraint.definition],
        ]),
      );
    expect(definitions("notifications")).toEqual({
      notifications_body_context_object_check: [
        "c",
        "CHECK ((jsonb_typeof(body_context_json) = 'object'::text))",
      ],
      notifications_dedupe_key_check: [
        "c",
        "CHECK ((length(btrim(dedupe_key)) > 0))",
      ],
      notifications_deep_link_path_check: [
        "c",
        "CHECK ((length(btrim(deep_link_path)) > 0))",
      ],
      notifications_opportunity_change_opportunity_fk: [
        "f",
        "FOREIGN KEY (opportunity_change_id, opportunity_id) REFERENCES opportunity_changes(id, opportunity_id) ON DELETE RESTRICT",
      ],
      notifications_opportunity_id_opportunities_id_fk: [
        "f",
        "FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE RESTRICT",
      ],
      notifications_pkey: ["p", "PRIMARY KEY (id)"],
      notifications_policy_version_check: [
        "c",
        "CHECK ((length(btrim(policy_version)) > 0))",
      ],
      notifications_signal_origin_check: [
        "c",
        "CHECK ((((signal_type = 'OPPORTUNITY_CHANGED'::text) AND (opportunity_change_id IS NOT NULL)) OR ((signal_type = 'OPPORTUNITY_PUBLISHED'::text) AND (opportunity_change_id IS NULL))))",
      ],
      notifications_signal_type_check: [
        "c",
        "CHECK ((signal_type = ANY (ARRAY['OPPORTUNITY_PUBLISHED'::text, 'OPPORTUNITY_CHANGED'::text])))",
      ],
      notifications_status_check: [
        "c",
        "CHECK ((status = ANY (ARRAY['PENDING'::text, 'READY'::text, 'COMPLETED'::text, 'CANCELLED'::text])))",
      ],
      notifications_title_snapshot_check: [
        "c",
        "CHECK ((length(btrim(title_snapshot)) > 0))",
      ],
    });
    expect(definitions("notification_deliveries")).toEqual({
      notification_deliveries_channel_check: [
        "c",
        "CHECK ((channel = 'EMAIL'::text))",
      ],
      notification_deliveries_notification_id_notifications_id_fk: [
        "f",
        "FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE RESTRICT",
      ],
      notification_deliveries_pkey: ["p", "PRIMARY KEY (id)"],
      notification_deliveries_recipient_hash_check: [
        "c",
        "CHECK (((recipient_hash IS NULL) OR (length(btrim(recipient_hash)) > 0)))",
      ],
      notification_deliveries_status_check: [
        "c",
        "CHECK ((status = ANY (ARRAY['PENDING'::text, 'QUEUED'::text, 'SENT'::text, 'DELIVERED'::text, 'OPENED'::text, 'CLICKED'::text, 'FAILED'::text, 'SUPPRESSED'::text])))",
      ],
      notification_deliveries_suppress_reason_check: [
        "c",
        "CHECK (((suppress_reason IS NULL) OR (suppress_reason = ANY (ARRAY['USER_INACTIVE'::text, 'FOLLOW_INACTIVE'::text, 'PREFERENCE_DISABLED'::text, 'CONSENT_REVOKED'::text, 'EMAIL_UNAVAILABLE'::text, 'EMAIL_SUPPRESSED'::text, 'DUPLICATE'::text, 'OTHER'::text]))))",
      ],
      notification_deliveries_suppression_check: [
        "c",
        "CHECK ((((status = 'SUPPRESSED'::text) AND (suppress_reason IS NOT NULL) AND (suppressed_at IS NOT NULL)) OR ((status <> 'SUPPRESSED'::text) AND (suppress_reason IS NULL) AND (suppressed_at IS NULL))))",
      ],
      notification_deliveries_user_id_users_id_fk: [
        "f",
        "FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT",
      ],
    });
    expect(definitions("notification_delivery_attempts")).toEqual({
      notification_delivery_attempts_completion_check: [
        "c",
        "CHECK ((((attempt_status = 'STARTED'::text) AND (completed_at IS NULL)) OR ((attempt_status <> 'STARTED'::text) AND (completed_at IS NOT NULL))))",
      ],
      notification_attempts_delivery_fk: [
        "f",
        "FOREIGN KEY (notification_delivery_id) REFERENCES notification_deliveries(id) ON DELETE RESTRICT",
      ],
      notification_delivery_attempts_number_check: [
        "c",
        "CHECK ((attempt_number > 0))",
      ],
      notification_delivery_attempts_pkey: ["p", "PRIMARY KEY (id)"],
      notification_delivery_attempts_provider_check: [
        "c",
        "CHECK ((length(btrim(provider)) > 0))",
      ],
      notification_delivery_attempts_status_check: [
        "c",
        "CHECK ((attempt_status = ANY (ARRAY['STARTED'::text, 'ACCEPTED'::text, 'FAILED_RETRYABLE'::text, 'FAILED_TERMINAL'::text])))",
      ],
    });
    const indexes = (tableName: string) =>
      Object.fromEntries(
        catalogs[tableName]!.indexes.map((index) => [
          index.indexname,
          index.indexdef,
        ]),
      );
    expect(indexes("notifications")).toEqual({
      notifications_change_policy_unique:
        "CREATE UNIQUE INDEX notifications_change_policy_unique ON public.notifications USING btree (opportunity_change_id, policy_version) WHERE (signal_type = 'OPPORTUNITY_CHANGED'::text)",
      notifications_dedupe_key_unique:
        "CREATE UNIQUE INDEX notifications_dedupe_key_unique ON public.notifications USING btree (dedupe_key)",
      notifications_opportunity_status_idx:
        "CREATE INDEX notifications_opportunity_status_idx ON public.notifications USING btree (opportunity_id, status)",
      notifications_pkey:
        "CREATE UNIQUE INDEX notifications_pkey ON public.notifications USING btree (id)",
      notifications_published_policy_unique:
        "CREATE UNIQUE INDEX notifications_published_policy_unique ON public.notifications USING btree (opportunity_id, policy_version) WHERE (signal_type = 'OPPORTUNITY_PUBLISHED'::text)",
      notifications_status_signal_published_idx:
        "CREATE INDEX notifications_status_signal_published_idx ON public.notifications USING btree (status, signal_published_at)",
    });
    expect(indexes("notification_deliveries")).toEqual({
      notification_deliveries_logical_unique:
        "CREATE UNIQUE INDEX notification_deliveries_logical_unique ON public.notification_deliveries USING btree (notification_id, user_id, channel)",
      notification_deliveries_pkey:
        "CREATE UNIQUE INDEX notification_deliveries_pkey ON public.notification_deliveries USING btree (id)",
      notification_deliveries_status_created_idx:
        "CREATE INDEX notification_deliveries_status_created_idx ON public.notification_deliveries USING btree (status, created_at)",
      notification_deliveries_user_created_idx:
        "CREATE INDEX notification_deliveries_user_created_idx ON public.notification_deliveries USING btree (user_id, created_at DESC NULLS LAST)",
    });
    expect(indexes("notification_delivery_attempts")).toEqual({
      notification_delivery_attempts_number_unique:
        "CREATE UNIQUE INDEX notification_delivery_attempts_number_unique ON public.notification_delivery_attempts USING btree (notification_delivery_id, attempt_number)",
      notification_delivery_attempts_pkey:
        "CREATE UNIQUE INDEX notification_delivery_attempts_pkey ON public.notification_delivery_attempts USING btree (id)",
      notification_delivery_attempts_provider_message_unique:
        "CREATE UNIQUE INDEX notification_delivery_attempts_provider_message_unique ON public.notification_delivery_attempts USING btree (provider, provider_message_id) WHERE (provider_message_id IS NOT NULL)",
      notification_delivery_attempts_status_idx:
        "CREATE INDEX notification_delivery_attempts_status_idx ON public.notification_delivery_attempts USING btree (attempt_status)",
    });
    expect(catalogs.notifications!.triggers).toEqual([]);
    expect(catalogs.notification_deliveries!.triggers).toEqual([]);
    expect(catalogs.notification_delivery_attempts!.triggers).toEqual([]);
  });

  it("enforces canonical signal origins, cross-Opportunity parent consistency, and policy/dedupe identities", async () => {
    const changed = await notification();
    const publicationOpportunity = await opportunity();
    await notification({
      opportunityId: publicationOpportunity,
      signalType: "OPPORTUNITY_PUBLISHED",
    });
    await expect(sql`insert into notifications(
      opportunity_id, opportunity_change_id, signal_type, policy_version, status,
      signal_published_at, title_snapshot, body_context_json, deep_link_path, dedupe_key
    ) values (${changed.opportunityId}, null, 'OPPORTUNITY_CHANGED', 'missing-origin', 'PENDING', now(), 'title', '{}'::jsonb, '/x', ${`${prefix}${randomUUID()}`})`).rejects.toMatchObject(
      { code: "23514" },
    );
    await expect(sql`insert into notifications(
      opportunity_id, opportunity_change_id, signal_type, policy_version, status,
      signal_published_at, title_snapshot, body_context_json, deep_link_path, dedupe_key
    ) values (${changed.opportunityId}, ${changed.changeId}, 'OPPORTUNITY_PUBLISHED', 'wrong-origin', 'PENDING', now(), 'title', '{}'::jsonb, '/x', ${`${prefix}${randomUUID()}`})`).rejects.toMatchObject(
      { code: "23514" },
    );
    const otherOpportunity = await opportunity();
    await expect(sql`insert into notifications(
      opportunity_id, opportunity_change_id, signal_type, policy_version, status,
      signal_published_at, title_snapshot, body_context_json, deep_link_path, dedupe_key
    ) values (${otherOpportunity}, ${changed.changeId}, 'OPPORTUNITY_CHANGED', 'wrong-parent', 'PENDING', now(), 'title', '{}'::jsonb, '/x', ${`${prefix}${randomUUID()}`})`).rejects.toMatchObject(
      { code: "23503" },
    );
    await expect(
      notification({
        opportunityId: changed.opportunityId,
        changeId: changed.changeId,
        policyVersion: "policy-v1",
      }),
    ).rejects.toMatchObject({ code: "23505" });
    await notification({
      opportunityId: changed.opportunityId,
      changeId: changed.changeId,
      policyVersion: "policy-v2",
    });
    const duplicateKey = `${prefix}independent-dedupe-${randomUUID()}`;
    await notification({ dedupeKey: duplicateKey });
    await expect(
      notification({ dedupeKey: duplicateKey }),
    ).rejects.toMatchObject({ code: "23505" });
    const invalid = (values: {
      signalType?: string;
      status?: string;
      policyVersion?: string;
      title?: string;
      context?: string;
      deepLink?: string;
      dedupeKey?: string;
    }) => sql`insert into notifications(
      opportunity_id, opportunity_change_id, signal_type, policy_version, status,
      signal_published_at, title_snapshot, body_context_json, deep_link_path, dedupe_key
    ) values (
      ${changed.opportunityId}, null, ${values.signalType ?? "OPPORTUNITY_PUBLISHED"},
      ${values.policyVersion ?? `policy-${randomUUID()}`}, ${values.status ?? "PENDING"},
      now(), ${values.title ?? "title"}, ${values.context ?? "{}"}::jsonb,
      ${values.deepLink ?? "/x"}, ${values.dedupeKey ?? `${prefix}${randomUUID()}`}
    )`;
    await expect(invalid({ signalType: "UNKNOWN" })).rejects.toMatchObject({
      code: "23514",
    });
    await expect(invalid({ status: "UNKNOWN" })).rejects.toMatchObject({
      code: "23514",
    });
    await expect(invalid({ context: "[]" })).rejects.toMatchObject({
      code: "23514",
    });
    await expect(invalid({ policyVersion: "   " })).rejects.toMatchObject({
      code: "23514",
    });
    await expect(invalid({ title: "   " })).rejects.toMatchObject({
      code: "23514",
    });
    await expect(invalid({ deepLink: "   " })).rejects.toMatchObject({
      code: "23514",
    });
    await expect(invalid({ dedupeKey: "   " })).rejects.toMatchObject({
      code: "23514",
    });
  });

  it("allows exactly one concurrent Notification per changed signal and policy", async () => {
    const change = await opportunityChange();
    const a = postgres(databaseUrl, { max: 1 });
    const b = postgres(databaseUrl, { max: 1 });
    try {
      const insert = (
        executor: postgres.Sql,
      ) => executor`insert into notifications(
        opportunity_id, opportunity_change_id, signal_type, policy_version, status,
        signal_published_at, title_snapshot, body_context_json, deep_link_path, dedupe_key
      ) values (${change.opportunityId}, ${change.id}, 'OPPORTUNITY_CHANGED', 'concurrent-v1',
        'PENDING', now(), 'title', '{}'::jsonb, '/x', ${`${prefix}${randomUUID()}`})`;
      const outcomes = await Promise.allSettled([insert(a), insert(b)]);
      expect(
        outcomes.filter((outcome) => outcome.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        outcomes.filter((outcome) => outcome.status === "rejected"),
      ).toHaveLength(1);
      expect(
        outcomes.find((outcome) => outcome.status === "rejected"),
      ).toMatchObject({ reason: { code: "23505" } });
    } finally {
      await a.end({ timeout: 5 });
      await b.end({ timeout: 5 });
    }
  });

  it("enforces canonical EMAIL Deliveries, suppression equivalence, opaque DELETED Users, and logical concurrency", async () => {
    const firstNotification = await notification();
    const firstUser = await user();
    const firstDeliveryId = await delivery({
      notificationId: firstNotification.id,
      userId: firstUser,
    });
    await expect(
      delivery({ notificationId: firstNotification.id, userId: firstUser }),
    ).rejects.toMatchObject({ code: "23505" });
    await delivery({
      notificationId: firstNotification.id,
      userId: await user(),
    });
    await sql`insert into user_emails(
      user_id, email, email_normalized, source, verification_state, delivery_state
    ) values (
      ${firstUser}, 'active-user@example.test', 'active-user@example.test',
      'USER_INPUT', 'VERIFIED', 'USABLE'
    )`;
    await sql`delete from user_emails where user_id = ${firstUser}`;
    await sql`update users set status = 'DELETED', deleted_at = now(), pii_anonymized_at = now()
      where id = ${firstUser}`;
    const [historicalDelivery] = await sql<
      { id: string; user_id: string; status: string }[]
    >`select id, user_id, status from notification_deliveries where id = ${firstDeliveryId}`;
    expect(historicalDelivery).toEqual({
      id: firstDeliveryId,
      user_id: firstUser,
      status: "PENDING",
    });
    const [deletedAnchor] = await sql<
      { status: string; email_count: number }[]
    >`
      select users.status, count(user_emails.user_id)::int as email_count
      from users left join user_emails on user_emails.user_id = users.id
      where users.id = ${firstUser} group by users.status`;
    expect(deletedAnchor).toEqual({ status: "DELETED", email_count: 0 });
    await delivery({
      notificationId: (await notification()).id,
      userId: await user(),
    });
    await expect(sql`insert into notification_deliveries(notification_id, user_id, channel, status)
      values (${firstNotification.id}, ${randomUUID()}, 'EMAIL', 'PENDING')`).rejects.toMatchObject(
      { code: "23503" },
    );
    const deletedUser = await user("DELETED");
    await delivery({
      notificationId: (await notification()).id,
      userId: deletedUser,
    });
    await delivery({
      notificationId: (await notification()).id,
      userId: await user(),
      status: "SUPPRESSED",
      suppressReason: "CONSENT_REVOKED",
    });
    await expect(sql`insert into notification_deliveries(notification_id, user_id, channel, status, suppress_reason)
      values (${(await notification()).id}, ${await user()}, 'EMAIL', 'PENDING', 'CONSENT_REVOKED')`).rejects.toMatchObject(
      { code: "23514" },
    );
    await expect(sql`insert into notification_deliveries(notification_id, user_id, channel, status)
      values (${(await notification()).id}, ${await user()}, 'EMAIL', 'SUPPRESSED')`).rejects.toMatchObject(
      { code: "23514" },
    );
    await expect(sql`insert into notification_deliveries(notification_id, user_id, channel, status)
      values (${(await notification()).id}, ${await user()}, 'SMS', 'PENDING')`).rejects.toMatchObject(
      { code: "23514" },
    );
    await expect(sql`insert into notification_deliveries(notification_id, user_id, channel, status)
      values (${(await notification()).id}, ${await user()}, 'EMAIL', 'UNKNOWN')`).rejects.toMatchObject(
      { code: "23514" },
    );
    await expect(sql`insert into notification_deliveries(notification_id, user_id, channel, status, suppress_reason)
      values (${(await notification()).id}, ${await user()}, 'EMAIL', 'SUPPRESSED', 'UNKNOWN')`).rejects.toMatchObject(
      { code: "23514" },
    );
    await expect(sql`insert into notification_deliveries(notification_id, user_id, channel, status, suppress_reason)
      values (${(await notification()).id}, ${await user()}, 'EMAIL', 'SUPPRESSED', 'CONSENT_REVOKED')`).rejects.toMatchObject(
      { code: "23514" },
    );
    await expect(sql`insert into notification_deliveries(notification_id, user_id, channel, status, suppressed_at)
      values (${(await notification()).id}, ${await user()}, 'EMAIL', 'PENDING', now())`).rejects.toMatchObject(
      { code: "23514" },
    );
    const notificationId = (await notification()).id;
    const userId = await user();
    const a = postgres(databaseUrl, { max: 1 });
    const b = postgres(databaseUrl, { max: 1 });
    try {
      const insert = (
        executor: postgres.Sql,
      ) => executor`insert into notification_deliveries(
        notification_id, user_id, channel, status
      ) values (${notificationId}, ${userId}, 'EMAIL', 'PENDING')`;
      const outcomes = await Promise.allSettled([insert(a), insert(b)]);
      expect(
        outcomes.filter((outcome) => outcome.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        outcomes.find((outcome) => outcome.status === "rejected"),
      ).toMatchObject({ reason: { code: "23505" } });
    } finally {
      await a.end({ timeout: 5 });
      await b.end({ timeout: 5 });
    }
  });

  it("enforces append-only Attempt numbering, provider reconciliation uniqueness, and unresolved timeout representation", async () => {
    const notificationDeliveryId = await delivery();
    const insert = (input: {
      number: number;
      status: string;
      completedAt?: Date | null;
      providerMessageId?: string | null;
      errorCode?: string | null;
      deliveryId?: string;
    }) => sql`insert into notification_delivery_attempts(
      notification_delivery_id, attempt_number, provider, provider_message_id,
      attempt_status, error_code, attempted_at, completed_at
    ) values (
      ${input.deliveryId ?? notificationDeliveryId}, ${input.number}, 'test-provider',
      ${input.providerMessageId ?? null}, ${input.status}, ${input.errorCode ?? null}, now(),
      ${input.completedAt === undefined ? (input.status === "STARTED" ? null : new Date("2026-08-22T00:00:00Z")) : input.completedAt}
    )`;
    await insert({
      number: 1,
      status: "STARTED",
      errorCode: "PROVIDER_RESULT_UNKNOWN",
    });
    await expect(
      insert({ number: 1, status: "ACCEPTED" }),
    ).rejects.toMatchObject({ code: "23505" });
    const providerMessageId = `message-${randomUUID()}`;
    await insert({
      number: 2,
      status: "ACCEPTED",
      providerMessageId,
    });
    await insert({ number: 3, status: "FAILED_RETRYABLE" });
    await insert({ number: 4, status: "FAILED_TERMINAL" });
    await expect(
      insert({ number: 5, status: "STARTED", completedAt: new Date() }),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      insert({ number: 5, status: "ACCEPTED", completedAt: null }),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      insert({
        number: 5,
        status: "ACCEPTED",
        providerMessageId,
      }),
    ).rejects.toMatchObject({ code: "23505" });
    await insert({ number: 5, status: "ACCEPTED", providerMessageId: null });
    await insert({
      number: 6,
      status: "FAILED_RETRYABLE",
      providerMessageId: null,
    });
    await expect(
      insert({ number: 7, status: "ACCEPTED", deliveryId: randomUUID() }),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      insert({ number: 0, status: "ACCEPTED" }),
    ).rejects.toMatchObject({
      code: "23514",
    });
    await expect(
      insert({ number: 7, status: "UNKNOWN" }),
    ).rejects.toMatchObject({
      code: "23514",
    });
    await expect(sql`insert into notification_delivery_attempts(
      notification_delivery_id, attempt_number, provider, attempt_status, attempted_at
    ) values (${notificationDeliveryId}, 7, '   ', 'STARTED', now())`).rejects.toMatchObject(
      { code: "23514" },
    );
    const secondDelivery = await delivery();
    const a = postgres(databaseUrl, { max: 1 });
    const b = postgres(databaseUrl, { max: 1 });
    try {
      const concurrent = (
        executor: postgres.Sql,
      ) => executor`insert into notification_delivery_attempts(
        notification_delivery_id, attempt_number, provider, attempt_status, attempted_at
      ) values (${secondDelivery}, 1, 'concurrent-provider', 'STARTED', now())`;
      const outcomes = await Promise.allSettled([concurrent(a), concurrent(b)]);
      expect(
        outcomes.filter((outcome) => outcome.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        outcomes.find((outcome) => outcome.status === "rejected"),
      ).toMatchObject({ reason: { code: "23505" } });
    } finally {
      await a.end({ timeout: 5 });
      await b.end({ timeout: 5 });
    }
  });

  it("keeps legacy alerts, subscribers, subscriptions, and Outbox unchanged and applies the full chain to an existing 0000-0006 database", async () => {
    const wp04bTables = [
      "notifications",
      "notification_deliveries",
      "notification_delivery_attempts",
    ];
    const legacyAndOutboxTables = [
      "alerts",
      "alert_deliveries",
      "subscribers",
      "subscriptions",
      "outbox_events",
    ];
    const relationLinks = await sql<
      { source_relation: string; target_relation: string }[]
    >`
      select source_relation.relname as source_relation, target_relation.relname as target_relation
      from pg_constraint as foreign_key
      join pg_class as source_relation on source_relation.oid = foreign_key.conrelid
      join pg_class as target_relation on target_relation.oid = foreign_key.confrelid
      join pg_namespace as namespace on namespace.oid = source_relation.relnamespace
      where namespace.nspname = 'public'
        and source_relation.relname in ${sql(wp04bTables)}
        and target_relation.relname in ${sql(legacyAndOutboxTables)}
      union all
      select source_relation.relname as source_relation, target_relation.relname as target_relation
      from pg_depend as dependency
      join pg_constraint as foreign_key
        on dependency.classid = 'pg_constraint'::regclass and dependency.objid = foreign_key.oid
      join pg_class as source_relation on source_relation.oid = foreign_key.conrelid
      join pg_class as target_relation on target_relation.oid = dependency.refobjid
      join pg_namespace as namespace on namespace.oid = source_relation.relnamespace
      where namespace.nspname = 'public'
        and source_relation.relname in ${sql(wp04bTables)}
        and target_relation.relname in ${sql(legacyAndOutboxTables)}
      order by source_relation, target_relation`;
    expect(relationLinks).toEqual([]);
    const triggerFunctions = await sql<
      { relation_name: string; function_name: string }[]
    >`
      select relation.relname as relation_name, procedure.proname as function_name
      from pg_trigger as trigger
      join pg_class as relation on relation.oid = trigger.tgrelid
      join pg_proc as procedure on procedure.oid = trigger.tgfoid
      join pg_namespace as namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public' and relation.relname in ${sql(wp04bTables)}
        and not trigger.tgisinternal
      order by relation_name, function_name`;
    expect(triggerFunctions).toEqual([]);
    await resetUpgradeDatabase();
    const maintenanceSql = postgres(maintenanceDatabaseUrl.toString(), {
      max: 1,
    });
    const preWp04bMigrationFolder = await createPreWp04bMigrationFolder();
    let upgradeSql: postgres.Sql | undefined;
    try {
      await maintenanceSql`create database ${maintenanceSql(upgradeDatabaseName)}`;
      await migrateMigrationFolder(
        upgradeDatabaseUrl.toString(),
        preWp04bMigrationFolder,
      );
      upgradeSql = postgres(upgradeDatabaseUrl.toString(), { max: 1 });
      const ledgerBefore = await upgradeSql<
        { id: number; hash: string; created_at: Date }[]
      >`select id, hash, created_at from "drizzle"."__drizzle_migrations" order by id`;
      expect(ledgerBefore).toHaveLength(7);
      const expectedCurrentMigrationCount = await currentMigrationCount();
      await upgradeSql`insert into outbox_events(
        event_type, aggregate_type, aggregate_id, payload
      ) values (
        ${`${prefix}upgrade-outbox`}, 'WP04B_TEST', ${randomUUID()}, '{"scope":"frozen"}'::jsonb
      )`;
      const before = {
        catalog: await relationCatalog(upgradeSql, "outbox_events"),
        count: await upgradeSql<
          { count: number }[]
        >`select count(*)::int as count from outbox_events`,
        rows: await upgradeSql<{ row: Record<string, unknown> }[]>`
          select to_jsonb(event) as row from outbox_events as event order by event.id`,
      };
      await migrateDatabase(upgradeDatabaseUrl.toString());
      const ledgerAfter = await upgradeSql<
        { id: number; hash: string; created_at: Date }[]
      >`select id, hash, created_at from "drizzle"."__drizzle_migrations" order by id`;
      expect(ledgerAfter).toHaveLength(expectedCurrentMigrationCount);
      expect(ledgerAfter.slice(0, ledgerBefore.length)).toEqual(ledgerBefore);
      const after = {
        catalog: await relationCatalog(upgradeSql, "outbox_events"),
        count: await upgradeSql<
          { count: number }[]
        >`select count(*)::int as count from outbox_events`,
        rows: await upgradeSql<{ row: Record<string, unknown> }[]>`
          select to_jsonb(event) as row from outbox_events as event order by event.id`,
      };
      expect(after).toEqual(before);
      await migrateDatabase(upgradeDatabaseUrl.toString());
      const ledgerAfterSecondRun = await upgradeSql<
        { id: number; hash: string; created_at: Date }[]
      >`select id, hash, created_at from "drizzle"."__drizzle_migrations" order by id`;
      expect(ledgerAfterSecondRun).toEqual(ledgerAfter);
      const [notificationTable] = await upgradeSql<
        { exists: boolean }[]
      >`select to_regclass('public.notifications') is not null as exists`;
      expect(notificationTable).toEqual({ exists: true });
    } finally {
      await upgradeSql?.end({ timeout: 5 });
      await maintenanceSql.end({ timeout: 5 });
      await rm(preWp04bMigrationFolder, { recursive: true, force: true });
      await resetUpgradeDatabase();
    }
  });
});
