import { resolve } from "node:path";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

export async function migrateDatabase(databaseUrl: string): Promise<void> {
  const migrationClient = postgres(databaseUrl, { max: 1 });
  const database = drizzle(migrationClient);

  try {
    await migrate(database, {
      migrationsFolder: resolve(process.cwd(), "src/db/migrations"),
    });
  } finally {
    await migrationClient.end({ timeout: 5 });
  }
}
