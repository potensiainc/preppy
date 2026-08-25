import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrateDatabase } from "@/src/db/migrate";
import { collectInvariantChecks } from "@/src/modules/production-preflight/invariant-checks.server";
import { ReadOnlyPreflightSession } from "@/src/modules/production-preflight/read-only-database.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL must be set");
assertDedicatedTestDatabaseUrl(testDatabaseUrl);

const baseUrl = new URL(testDatabaseUrl);
const databaseName = "admissionradar_wp15a_invariants_rehearsal";
const databaseUrl = new URL(baseUrl);
databaseUrl.pathname = `/${databaseName}`;
const maintenanceUrl = new URL(baseUrl);
maintenanceUrl.pathname = "/postgres";
const maintenance = postgres(maintenanceUrl.toString(), { max: 1 });
const sql = postgres(databaseUrl.toString(), { max: 1 });

describe("WP-15A domain invariant checks", () => {
  beforeAll(async () => {
    await maintenance`select pg_advisory_lock(hashtext('admissionradar-schema-tests'))`;
    await maintenance.unsafe(`drop database if exists ${databaseName}`);
    await maintenance.unsafe(`create database ${databaseName}`);
    await migrateDatabase(databaseUrl.toString());

    const institutionId = randomUUID();
    const userId = randomUUID();
    const followId = randomUUID();
    const articleId = randomUUID();
    await sql`
      insert into institutions (
        id, slug, display_name, category, operational_state, publication_state
      ) values (
        ${institutionId}, 'wp15a-invariant-school', 'Invariant School',
        'ENGLISH_KINDERGARTEN', 'ACTIVE', 'PUBLISHED'
      )
    `;
    await sql`
      insert into users (id, status, activated_at)
      values (${userId}, 'ACTIVE', now())
    `;
    await sql`
      insert into follows (
        id, user_id, institution_id, status, first_activated_at,
        current_activated_at
      ) values (${followId}, ${userId}, ${institutionId}, 'ACTIVE', now(), now())
    `;
    await sql`
      insert into outbox_events (
        event_type, aggregate_type, aggregate_id, payload, status,
        attempt_count, locked_at, locked_by
      ) values (
        'WP15A_FIXTURE', 'WP15A', ${randomUUID()}, '{}'::jsonb,
        'PROCESSING', 1, now() - interval '1 hour', 'wp15a-worker'
      )
    `;
    await sql`
      insert into articles (
        id, slug, type, category, status, title, content_html,
        robots_index, robots_follow
      ) values (
        ${articleId}, 'wp15a-private-target', 'GUIDE', 'ADMISSIONS_GENERAL',
        'UNPUBLISHED', 'Private Target', '<script>alert(1)</script>', false, false
      )
    `;
    await sql`
      insert into url_redirects (source_path, target_path, status_code)
      values
        ('/articles/wp15a-old-a', '/articles/wp15a-old-b', 308),
        ('/articles/wp15a-old-b', '/articles/wp15a-private-target', 308)
    `;
    await sql`
      insert into email_provider_events (
        provider, provider_event_id, provider_message_id, event_type,
        processing_status, payload_hash
      ) values (
        'RESEND', 'wp15a-orphan-event', 'wp15a-missing-message', 'email.delivered',
        'RECEIVED', ${`sha256:${"a".repeat(64)}`}
      )
    `;
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
    await maintenance.unsafe(`drop database if exists ${databaseName}`);
    await maintenance`select pg_advisory_unlock(hashtext('admissionradar-schema-tests'))`;
    await maintenance.end({ timeout: 5 });
  });

  it("classifies invariant conflicts without exposing PII or raw content", async () => {
    const checks = await sql.begin(
      "isolation level repeatable read read only",
      (transaction) =>
        collectInvariantChecks(
          new ReadOnlyPreflightSession(transaction, sql.options),
          {
            now: new Date(),
            staleLeaseSeconds: 900,
            appBaseUrl: "https://preppy.example",
          },
        ),
    );
    const byCode = new Map(checks.map((check) => [check.code, check]));

    expect(byCode.get("ACTIVE_FOLLOW_WITHOUT_OPEN_EPISODE")).toMatchObject({
      severity: "BLOCKER",
      count: 1,
    });
    expect(byCode.get("STALE_OUTBOX_PROCESSING_LEASE")).toMatchObject({
      severity: "WARNING",
      count: 1,
    });
    expect(byCode.get("HISTORICAL_UNSAFE_ARTICLE_BODY")).toMatchObject({
      severity: "WARNING",
      count: 1,
    });
    expect(byCode.get("REDIRECT_CHAIN_PRESENT")).toMatchObject({
      severity: "BLOCKER",
      count: 1,
    });
    expect(byCode.get("NONPUBLIC_REDIRECT_TARGET")).toMatchObject({
      severity: "WARNING",
      count: 1,
    });
    expect(byCode.get("ORPHAN_PROVIDER_EVENT")).toMatchObject({
      severity: "WARNING",
      count: 1,
    });
    expect(JSON.stringify(checks)).not.toContain("alert(1)");
    expect(JSON.stringify(checks)).not.toContain("wp15a-missing-message");
  });
});
