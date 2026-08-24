import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrateDatabase } from "@/src/db/migrate";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL must be set");
assertDedicatedTestDatabaseUrl(databaseUrl);

const sql = postgres(databaseUrl, { max: 2 });
const schemaLockSql = postgres(databaseUrl, { max: 1 });

describe("WP-12B provider event receipt schema", () => {
  beforeAll(async () => {
    await schemaLockSql`
      select pg_advisory_lock(hashtext('admissionradar-schema-tests'))
    `;
    await migrateDatabase(databaseUrl);
  });

  afterAll(async () => {
    await sql`delete from email_provider_events where provider_event_id like 'wp12b-schema-%'`;
    await schemaLockSql`
      select pg_advisory_unlock(hashtext('admissionradar-schema-tests'))
    `;
    await schemaLockSql.end({ timeout: 5 });
    await sql.end({ timeout: 5 });
  });

  it("stores one bounded, provider-scoped receipt without raw payload", async () => {
    const providerEventId = `wp12b-schema-${randomUUID()}`;
    const [row] = await sql`
      insert into email_provider_events (
        provider, provider_event_id, provider_message_id, event_type,
        provider_created_at, received_at, processing_status, payload_hash
      ) values (
        'RESEND', ${providerEventId}, 'provider-message-1', 'email.delivered',
        '2026-08-24T00:00:00Z', '2026-08-24T00:00:01Z', 'RECEIVED',
        ${`sha256:${"a".repeat(64)}`}
      )
      returning provider, provider_event_id, provider_message_id, event_type,
        processing_status, processed_at, payload_hash
    `;

    expect(row).toEqual({
      provider: "RESEND",
      provider_event_id: providerEventId,
      provider_message_id: "provider-message-1",
      event_type: "email.delivered",
      processing_status: "RECEIVED",
      processed_at: null,
      payload_hash: `sha256:${"a".repeat(64)}`,
    });
  });

  it("deduplicates provider events and enforces terminal lifecycle", async () => {
    const providerEventId = `wp12b-schema-${randomUUID()}`;
    const insert = () => sql`
      insert into email_provider_events (
        provider, provider_event_id, event_type, received_at,
        processing_status, payload_hash
      ) values (
        'RESEND', ${providerEventId}, 'email.sent', now(), 'RECEIVED',
        ${`sha256:${"b".repeat(64)}`}
      )
    `;

    await insert();
    await expect(insert()).rejects.toMatchObject({ code: "23505" });
    await expect(sql`
      update email_provider_events
      set processing_status = 'PROCESSED'
      where provider = 'RESEND' and provider_event_id = ${providerEventId}
    `).rejects.toMatchObject({ code: "23514" });
  });

  it("rejects malformed hashes and unsupported receipt statuses", async () => {
    await expect(sql`
      insert into email_provider_events (
        provider, provider_event_id, event_type, received_at,
        processing_status, payload_hash
      ) values (
        'RESEND', ${`wp12b-schema-${randomUUID()}`}, 'email.sent', now(),
        'UNKNOWN', 'raw-payload'
      )
    `).rejects.toMatchObject({ code: "23514" });
  });
});
