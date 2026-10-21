import type postgres from "postgres";
import { z } from "zod";

export type AdminProvisioningSql = ReturnType<typeof postgres>;

const subjectSchema = z.string().trim().min(1).max(255);
const provisionSchema = z
  .object({
    mode: z.literal("ACTIVATE"),
    subject: subjectSchema,
    email: z.email().max(320),
    displayName: z.string().trim().min(1).max(100),
    apply: z.boolean(),
  })
  .strict();
const disableSchema = z
  .object({
    mode: z.literal("DISABLE"),
    subject: subjectSchema,
    apply: z.boolean(),
  })
  .strict();

export type AdminProvisioningInput =
  z.input<typeof provisionSchema> | z.input<typeof disableSchema>;

export class AdminProvisioningError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "AdminProvisioningError";
  }
}

export type AdminProvisioningResult = Readonly<{
  mode: "DRY_RUN" | "APPLIED" | "NO_OP";
  action: "CREATE" | "REACTIVATE" | "DISABLE" | "NONE";
  adminUserId: string | null;
}>;

// Replaces hand-written SQL for the admin allowlist. Every applied change
// writes an audit row without the person's email, and the last active admin
// can never be disabled.
export async function provisionAdminUser(
  sql: AdminProvisioningSql,
  rawInput: AdminProvisioningInput,
): Promise<AdminProvisioningResult> {
  const input =
    rawInput.mode === "ACTIVATE"
      ? provisionSchema.parse(rawInput)
      : disableSchema.parse(rawInput);
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('preppy-admin-provisioning'))`;
    const [existing] = await tx<{ id: string; status: string }[]>`
      select id, status from admin_users
      where external_auth_subject = ${input.subject}
      for update`;

    if (input.mode === "DISABLE") {
      if (!existing) throw new AdminProvisioningError("ADMIN_NOT_FOUND");
      if (existing.status === "DISABLED")
        return { mode: "NO_OP", action: "NONE", adminUserId: existing.id };
      const [active] = await tx<{ count: number }[]>`
        select count(*)::int as count from admin_users where status = 'ACTIVE'`;
      if ((active?.count ?? 0) <= 1)
        throw new AdminProvisioningError("LAST_ACTIVE_ADMIN");
      if (!input.apply)
        return { mode: "DRY_RUN", action: "DISABLE", adminUserId: existing.id };
      await tx`update admin_users set status = 'DISABLED' where id = ${existing.id}`;
      await tx`
        insert into audit_logs (action_type, entity_type, entity_id, after_data)
        values ('ADMIN_USER_DISABLED', 'ADMIN_USER', ${existing.id},
          ${tx.json({ source: "ADMIN_PROVISIONING_CLI" })})`;
      return { mode: "APPLIED", action: "DISABLE", adminUserId: existing.id };
    }

    if (existing?.status === "ACTIVE")
      return { mode: "NO_OP", action: "NONE", adminUserId: existing.id };
    const action = existing ? "REACTIVATE" : "CREATE";
    if (!input.apply)
      return { mode: "DRY_RUN", action, adminUserId: existing?.id ?? null };
    const [row] = existing
      ? await tx<{ id: string }[]>`
          update admin_users
          set status = 'ACTIVE', email = ${input.email},
            display_name = ${input.displayName}
          where id = ${existing.id}
          returning id`
      : await tx<{ id: string }[]>`
          insert into admin_users (external_auth_subject, email, display_name, status)
          values (${input.subject}, ${input.email}, ${input.displayName}, 'ACTIVE')
          returning id`;
    await tx`
      insert into audit_logs (action_type, entity_type, entity_id, after_data)
      values (${action === "CREATE" ? "ADMIN_USER_CREATED" : "ADMIN_USER_REACTIVATED"},
        'ADMIN_USER', ${row!.id},
        ${tx.json({ source: "ADMIN_PROVISIONING_CLI" })})`;
    return { mode: "APPLIED", action, adminUserId: row!.id };
  });
}
