import { customType, timestamp } from "drizzle-orm/pg-core";

export const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
