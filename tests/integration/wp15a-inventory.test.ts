import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrateDatabase } from "@/src/db/migrate";
import { collectProductionInventory } from "@/src/modules/production-preflight/inventory.server";
import { ReadOnlyPreflightSession } from "@/src/modules/production-preflight/read-only-database.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL must be set");
assertDedicatedTestDatabaseUrl(testDatabaseUrl);

const baseUrl = new URL(testDatabaseUrl);
const databaseName = "admissionradar_wp15a_inventory_rehearsal";
const readOnlyRole = "preppy_wp15a_inventory_read_only";
const databaseUrl = new URL(baseUrl);
databaseUrl.pathname = `/${databaseName}`;
const maintenanceUrl = new URL(baseUrl);
maintenanceUrl.pathname = "/postgres";
const maintenance = postgres(maintenanceUrl.toString(), { max: 1 });
const sql = postgres(databaseUrl.toString(), { max: 1 });

describe("WP-15A safe production inventory", () => {
  beforeAll(async () => {
    await maintenance`select pg_advisory_lock(hashtext('admissionradar-schema-tests'))`;
    await maintenance.unsafe(`drop database if exists ${databaseName}`);
    await maintenance.unsafe(`drop role if exists ${readOnlyRole}`);
    await maintenance.unsafe(`create role ${readOnlyRole} nologin`);
    await maintenance.unsafe(`create database ${databaseName}`);
    await migrateDatabase(databaseUrl.toString());
    await maintenance.unsafe(
      `grant connect on database ${databaseName} to ${readOnlyRole}`,
    );
    await sql.unsafe(`grant usage on schema public to ${readOnlyRole}`);
    await sql.unsafe(
      `grant select on all tables in schema public to ${readOnlyRole}`,
    );
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
    await maintenance.unsafe(`drop database if exists ${databaseName}`);
    await maintenance.unsafe(`drop role if exists ${readOnlyRole}`);
    await maintenance`select pg_advisory_unlock(hashtext('admissionradar-schema-tests'))`;
    await maintenance.end({ timeout: 5 });
  });

  it("reports critical schema, aggregate counts, and distributions without PII", async () => {
    const institutionId = randomUUID();
    const userId = randomUUID();
    const privateEmail = `private-${randomUUID()}@example.test`;
    await sql`
      insert into institutions (
        id, slug, display_name, category, operational_state, publication_state
      ) values (
        ${institutionId}, ${`wp15a-${institutionId}`}, 'Inventory Fixture',
        'ENGLISH_KINDERGARTEN', 'ACTIVE', 'PUBLISHED'
      )
    `;
    await sql`
      insert into users (id, status, activated_at)
      values (${userId}, 'ACTIVE', now())
    `;
    await sql`
      insert into user_emails (
        user_id, email, email_normalized, source, verification_state,
        delivery_state, verified_at
      ) values (
        ${userId}, ${privateEmail}, ${privateEmail}, 'USER_INPUT', 'VERIFIED',
        'USABLE', now()
      )
    `;

    const inventory = await sql.begin(
      "isolation level repeatable read read only",
      (transaction) =>
        collectProductionInventory(
          new ReadOnlyPreflightSession(transaction, sql.options),
        ),
    );

    expect(inventory.schema.tables.institutions).toBe("PRESENT");
    expect(inventory.schema.tables.email_provider_events).toBe("PRESENT");
    expect(inventory.schema.missingColumns).toEqual([]);
    expect(inventory.rowCounts.institutions).toBe(1);
    expect(inventory.rowCounts.users).toBe(1);
    expect(inventory.rowCounts.user_emails).toBe(1);
    expect(inventory.distributions.institutionPublication).toEqual({
      PUBLISHED: 1,
    });
    expect(inventory.distributions.userStatus).toEqual({ ACTIVE: 1 });
    expect(JSON.stringify(inventory)).not.toContain(privateEmail);
    expect(JSON.stringify(inventory)).not.toContain("Inventory Fixture");
  });

  it("discovers critical constraints for a SELECT-only preflight role", async () => {
    const inventory = await sql.begin(
      "isolation level repeatable read read only",
      async (transaction) => {
        await transaction.unsafe(`set local role ${readOnlyRole}`);
        return collectProductionInventory(
          new ReadOnlyPreflightSession(transaction, sql.options),
        );
      },
    );

    expect(inventory.schema.missingConstraints).toEqual([]);
  });
});
