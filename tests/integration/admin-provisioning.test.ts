import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { migrateDatabase } from "@/src/db/migrate";
import {
  provisionAdminUser,
  type AdminProvisioningInput,
} from "@/src/modules/admin/provisioning";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL must be set");
assertDedicatedTestDatabaseUrl(databaseUrl);
const sql = postgres(databaseUrl, { max: 2 });
const lock = postgres(databaseUrl, { max: 1 });
const prefix = `provision-${randomUUID()}`;
const subjects: string[] = [];

function subject() {
  const value = `${prefix}-${subjects.length}`;
  subjects.push(value);
  return value;
}
function activate(sub: string, apply: boolean): AdminProvisioningInput {
  return {
    mode: "ACTIVATE",
    subject: sub,
    email: "operator@example.test",
    displayName: "운영자",
    apply,
  };
}
async function row(sub: string) {
  const [found] = await sql<{ id: string; status: string }[]>`
    select id, status from admin_users where external_auth_subject = ${sub}`;
  return found ?? null;
}
async function audits(id: string) {
  return sql<{ actionType: string; afterData: Record<string, unknown> }[]>`
    select action_type as "actionType", after_data as "afterData"
    from audit_logs where entity_type = 'ADMIN_USER' and entity_id = ${id}
    order by id`;
}

describe("admin provisioning", () => {
  beforeAll(async () => {
    await lock`select pg_advisory_lock(hashtext('preppy-schema-tests'))`;
    await migrateDatabase(databaseUrl);
  });
  afterEach(async () => {
    await sql`delete from audit_logs where entity_type = 'ADMIN_USER' and entity_id in (select id from admin_users where external_auth_subject like ${`${prefix}%`})`;
    await sql`delete from admin_users where external_auth_subject like ${`${prefix}%`}`;
  });
  afterAll(async () => {
    await lock`select pg_advisory_unlock(hashtext('preppy-schema-tests'))`;
    await lock.end({ timeout: 5 });
    await sql.end({ timeout: 5 });
  });

  it("previews a new admin without writing", async () => {
    const sub = subject();
    await expect(
      provisionAdminUser(sql, activate(sub, false)),
    ).resolves.toEqual({
      mode: "DRY_RUN",
      action: "CREATE",
      adminUserId: null,
    });
    expect(await row(sub)).toBeNull();
  });

  it("creates an active admin with an audit row that omits the email", async () => {
    const sub = subject();
    const result = await provisionAdminUser(sql, activate(sub, true));
    expect(result).toMatchObject({ mode: "APPLIED", action: "CREATE" });
    expect(await row(sub)).toEqual({
      id: result.adminUserId,
      status: "ACTIVE",
    });
    const logs = await audits(result.adminUserId!);
    expect(logs).toEqual([
      {
        actionType: "ADMIN_USER_CREATED",
        afterData: { source: "ADMIN_PROVISIONING_CLI" },
      },
    ]);
    expect(JSON.stringify(logs)).not.toContain("operator@example.test");
  });

  it("is a no-op for an already active admin", async () => {
    const sub = subject();
    await provisionAdminUser(sql, activate(sub, true));
    await expect(
      provisionAdminUser(sql, activate(sub, true)),
    ).resolves.toMatchObject({ mode: "NO_OP", action: "NONE" });
  });

  it("disables one of several admins and reactivates it later", async () => {
    const keep = subject();
    const leave = subject();
    await provisionAdminUser(sql, activate(keep, true));
    const created = await provisionAdminUser(sql, activate(leave, true));
    await expect(
      provisionAdminUser(sql, { mode: "DISABLE", subject: leave, apply: true }),
    ).resolves.toMatchObject({ mode: "APPLIED", action: "DISABLE" });
    expect((await row(leave))?.status).toBe("DISABLED");
    await expect(
      provisionAdminUser(sql, { mode: "DISABLE", subject: leave, apply: true }),
    ).resolves.toMatchObject({ mode: "NO_OP" });
    await expect(
      provisionAdminUser(sql, activate(leave, true)),
    ).resolves.toMatchObject({ mode: "APPLIED", action: "REACTIVATE" });
    expect(
      (await audits(created.adminUserId!)).map(({ actionType }) => actionType),
    ).toEqual([
      "ADMIN_USER_CREATED",
      "ADMIN_USER_DISABLED",
      "ADMIN_USER_REACTIVATED",
    ]);
  });

  it("never disables the last active admin", async () => {
    // Park other suites' active admins so this one is the only active admin.
    const parked = await sql<{ id: string }[]>`
      update admin_users set status = 'DISABLED'
      where status = 'ACTIVE' and external_auth_subject not like ${`${prefix}%`}
      returning id`;
    try {
      const only = subject();
      await provisionAdminUser(sql, activate(only, true));
      await expect(
        provisionAdminUser(sql, {
          mode: "DISABLE",
          subject: only,
          apply: true,
        }),
      ).rejects.toMatchObject({ code: "LAST_ACTIVE_ADMIN" });
      expect((await row(only))?.status).toBe("ACTIVE");
    } finally {
      if (parked.length > 0)
        await sql`update admin_users set status = 'ACTIVE' where id in ${sql(parked.map(({ id }) => id))}`;
    }
  });

  it("rejects unknown subjects and invalid input", async () => {
    await expect(
      provisionAdminUser(sql, {
        mode: "DISABLE",
        subject: subject(),
        apply: true,
      }),
    ).rejects.toMatchObject({ code: "ADMIN_NOT_FOUND" });
    await expect(
      provisionAdminUser(sql, {
        ...(activate(subject(), true) as object),
        email: "not-an-email",
      } as AdminProvisioningInput),
    ).rejects.toThrow();
  });
});
