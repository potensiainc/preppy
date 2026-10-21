import { sql } from "drizzle-orm";
import { check, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { createdAt, updatedAt } from "./_shared";

export const adminUsers = pgTable(
  "admin_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    externalAuthSubject: text("external_auth_subject").notNull(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    status: text("status").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("admin_users_external_auth_subject_unique").on(
      table.externalAuthSubject,
    ),
    check(
      "admin_users_status_check",
      sql`${table.status} in ('ACTIVE', 'DISABLED')`,
    ),
  ],
);
