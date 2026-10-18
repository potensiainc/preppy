import postgres from "postgres";
import {
  loadMigrationSpecs,
  migrationStatements,
  planFullMigrations,
  stop,
  type MigrationSpec,
  type LedgerRow,
} from "./migration-plan";
export type MigrationSql = ReturnType<typeof postgres>;
export type MigrationTx = postgres.TransactionSql;
export async function lockMigrationLedger(
  tx: MigrationTx,
): Promise<LedgerRow[] | null> {
  await tx`set local lock_timeout='5s'`;
  await tx`set local statement_timeout='30s'`;
  await tx`set local search_path=public`;
  await tx`select pg_advisory_xact_lock(hashtext('preppy-schema-migrations'))`;
  const [row] =
    await tx`select to_regclass('drizzle.__drizzle_migrations') as relation`;
  if (!row?.relation) return null;
  await tx`lock table drizzle.__drizzle_migrations in share row exclusive mode`;
  return await tx<
    LedgerRow[]
  >`select id,hash,created_at from drizzle.__drizzle_migrations order by id`;
}
export async function runFullMigrations(
  client: MigrationSql,
  specs: readonly MigrationSpec[],
) {
  return client.begin(async (tx) => {
    const ledger = await lockMigrationLedger(tx);
    const pending = planFullMigrations(specs, ledger ?? []);
    const commands = pending.map((migration) => ({
      migration,
      statements: migrationStatements(migration),
    }));
    if (ledger === null) {
      const [schema] =
        await tx`select count(*)::int as count from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','drizzle') and c.relkind in ('r','p')`;
      if (schema?.count !== 0) stop("LEDGER_MISSING_WITH_EXISTING_SCHEMA");
      await tx`create schema if not exists drizzle`;
      await tx`create table drizzle.__drizzle_migrations(id serial primary key,hash text not null,created_at bigint)`;
    }
    for (const { migration, statements } of commands) {
      for (const statement of statements) await tx.unsafe(statement);
      await tx`insert into drizzle.__drizzle_migrations(hash,created_at) values(${migration.hash},${migration.when})`;
    }
    return { applied: pending.map((s) => s.identifier) };
  });
}
export async function migrateDatabase(databaseUrl: string): Promise<void> {
  const specs = await loadMigrationSpecs();
  const client = postgres(databaseUrl, { max: 1 });
  try {
    await runFullMigrations(client, specs);
  } finally {
    await client.end({ timeout: 5 });
  }
}
