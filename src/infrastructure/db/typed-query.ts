import type { SQL } from "drizzle-orm";
import { z } from "zod";

import type { DatabaseExecutor } from "./runtime.server";

// The driver returns timestamptz as an ISO-like string, bigint as a string
// and json/jsonb as parsed values; schemas must describe that reality.
export const dbTimestamp = z.string().min(1);

export class DatabaseContractViolationError extends Error {
  readonly code = "DATABASE_CONTRACT_VIOLATION";
  constructor(readonly paths: readonly string[]) {
    // Only issue paths are kept: row values can contain personal data.
    super(`Database result does not match its contract at ${paths.join(", ")}`);
    this.name = "DatabaseContractViolationError";
  }
}

export async function queryRows<Schema extends z.ZodType>(
  executor: Pick<DatabaseExecutor, "raw">,
  query: SQL,
  schema: Schema,
): Promise<z.output<Schema>[]> {
  const rows: unknown = Array.from(
    (await executor.raw(query)) as unknown as Iterable<unknown>,
  );
  const parsed = z.array(schema).safeParse(rows);
  if (!parsed.success) {
    throw new DatabaseContractViolationError(
      parsed.error.issues.map((issue) => issue.path.join(".") || "(root)"),
    );
  }
  return parsed.data;
}

export async function queryOne<Schema extends z.ZodType>(
  executor: Pick<DatabaseExecutor, "raw">,
  query: SQL,
  schema: Schema,
): Promise<z.output<Schema> | undefined> {
  return (await queryRows(executor, query, schema))[0];
}
