import { getDatabaseEnv } from "../../src/config/env";
import { migrateDatabase } from "../../src/db/migrate";

const { DATABASE_URL } = getDatabaseEnv();

await migrateDatabase(DATABASE_URL);
process.stdout.write("PostgreSQL migrations: OK\n");
