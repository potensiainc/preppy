import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  getRuntimeDatabaseEnv,
  type RuntimeDatabaseEnv,
} from "@/src/config/runtime-env";
import * as schema from "@/src/db/schema";

if (typeof window !== "undefined") {
  throw new Error("The database runtime is server-only.");
}

export type PostgresClient = ReturnType<typeof postgres>;
export type RuntimeDrizzleDatabase = PostgresJsDatabase<typeof schema> & {
  $client: PostgresClient;
};

type DrizzleOperations = Pick<
  RuntimeDrizzleDatabase,
  "select" | "insert" | "update" | "delete" | "execute"
>;

export type DatabaseExecutor = {
  readonly scope: "runtime" | "transaction";
  readonly drizzle: DrizzleOperations;
  readonly raw: RuntimeDrizzleDatabase["execute"];
};

export type TransactionExecutor = DatabaseExecutor & {
  readonly scope: "transaction";
};

type ExecutableDatabase = DrizzleOperations;

function createExecutor(
  database: ExecutableDatabase,
  scope: DatabaseExecutor["scope"],
): DatabaseExecutor {
  return {
    scope,
    drizzle: {
      select: database.select.bind(database) as DrizzleOperations["select"],
      insert: database.insert.bind(database) as DrizzleOperations["insert"],
      update: database.update.bind(database) as DrizzleOperations["update"],
      delete: database.delete.bind(database) as DrizzleOperations["delete"],
      execute: database.execute.bind(database) as DrizzleOperations["execute"],
    },
    raw: database.execute.bind(database) as RuntimeDrizzleDatabase["execute"],
  };
}

const activeTransaction = new AsyncLocalStorage<boolean>();

export class TransactionManager {
  constructor(private readonly database: RuntimeDrizzleDatabase) {}

  run<T>(operation: (executor: TransactionExecutor) => Promise<T>): Promise<T> {
    if (activeTransaction.getStore()) {
      return Promise.reject(
        new Error(
          "Nested root database transactions are not allowed; pass the existing transaction executor.",
        ),
      );
    }

    return this.database.transaction(async (transaction) => {
      const executor = createExecutor(
        transaction as ExecutableDatabase,
        "transaction",
      ) as TransactionExecutor;

      return activeTransaction.run(true, () => operation(executor));
    });
  }
}

export type RuntimeDatabaseResources = {
  readonly config: RuntimeDatabaseEnv;
  readonly client: PostgresClient;
  readonly database: RuntimeDrizzleDatabase;
  readonly executor: DatabaseExecutor;
  readonly transactionManager: TransactionManager;
};

let runtimeDatabase: RuntimeDatabaseResources | undefined;
let closePromise: Promise<void> | undefined;

function sameConfiguration(
  current: RuntimeDatabaseEnv,
  requested: RuntimeDatabaseEnv,
): boolean {
  return (
    current.DATABASE_URL === requested.DATABASE_URL &&
    current.DATABASE_MAX_CONNECTIONS === requested.DATABASE_MAX_CONNECTIONS &&
    current.NODE_ENV === requested.NODE_ENV
  );
}

export function getRuntimeDatabase(
  config: RuntimeDatabaseEnv = getRuntimeDatabaseEnv(),
): RuntimeDatabaseResources {
  if (closePromise) {
    throw new Error(
      "The runtime database is closing; wait before reopening it.",
    );
  }

  if (runtimeDatabase) {
    if (!sameConfiguration(runtimeDatabase.config, config)) {
      throw new Error(
        "The runtime database is already configured with different settings.",
      );
    }

    return runtimeDatabase;
  }

  const client = postgres(config.DATABASE_URL, {
    max: config.DATABASE_MAX_CONNECTIONS,
  });
  const database = drizzle(client, { schema });

  runtimeDatabase = {
    config,
    client,
    database,
    executor: createExecutor(database, "runtime"),
    transactionManager: new TransactionManager(database),
  };

  return runtimeDatabase;
}

export function closeRuntimeDatabase(): Promise<void> {
  if (closePromise) {
    return closePromise;
  }

  const current = runtimeDatabase;

  if (!current) {
    return Promise.resolve();
  }

  runtimeDatabase = undefined;
  closePromise = (async () => {
    try {
      await current.client.end({ timeout: 5 });
    } catch (error) {
      if (!runtimeDatabase) {
        runtimeDatabase = current;
      }
      throw error;
    } finally {
      closePromise = undefined;
    }
  })();

  return closePromise;
}
