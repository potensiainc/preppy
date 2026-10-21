import { pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";

import { institutions } from "./institutions";
import { opportunities } from "./opportunities";

export const englishCampusIdentities = pgTable(
  "english_campus_identities",
  {
    namespace: text("namespace").notNull(),
    externalId: text("external_id").notNull(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "restrict" }),
  },
  (table) => [primaryKey({ columns: [table.namespace, table.externalId] })],
);
export const englishCampusAliases = pgTable(
  "english_campus_aliases",
  {
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
  },
  (table) => [primaryKey({ columns: [table.institutionId, table.name] })],
);
export const englishSessionIdentities = pgTable("english_session_identities", {
  opportunityId: uuid("opportunity_id")
    .primaryKey()
    .references(() => opportunities.id, { onDelete: "restrict" }),
  fingerprint: text("fingerprint").notNull(),
});
