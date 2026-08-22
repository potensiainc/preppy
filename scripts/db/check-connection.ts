import {
  checkDatabaseConnection,
  closeDatabaseConnection,
} from "../../src/db/connection";
import { getDatabaseEnv } from "../../src/config/env";

const { DATABASE_URL } = getDatabaseEnv();

try {
  const ready = await checkDatabaseConnection(DATABASE_URL);
  if (!ready) {
    throw new Error("PostgreSQL readiness query returned an unexpected result");
  }
  process.stdout.write("PostgreSQL connection: OK\n");
} finally {
  await closeDatabaseConnection();
}
