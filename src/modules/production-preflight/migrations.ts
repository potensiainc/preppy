export type RepositoryMigration = {
  identifier: string;
  hash: string;
};

export type AppliedMigration = {
  identifier: string;
  hash: string;
  appliedOrder: number;
};

export type MigrationLedgerComparison = {
  expected: string[];
  applied: string[];
  latestApplied: string | null;
  missing: string[];
  unexpected: string[];
  hashMismatches: string[];
  identifierStatus: "MATCH" | "MISMATCH" | "UNKNOWN";
};

type DrizzleJournal = {
  entries: Array<{ idx: number; tag: string }>;
};

export async function loadRepositoryMigrationManifest(
  migrationsFolder: string,
): Promise<RepositoryMigration[]> {
  const folder = resolve(process.cwd(), migrationsFolder);
  const journal = JSON.parse(
    await readFile(resolve(folder, "meta/_journal.json"), "utf8"),
  ) as DrizzleJournal;
  const migrations = readMigrationFiles({ migrationsFolder: folder });
  if (journal.entries.length !== migrations.length) {
    throw new Error("Repository migration journal and SQL files disagree.");
  }
  return [...journal.entries]
    .sort((left, right) => left.idx - right.idx)
    .map((entry, index) => {
      const migration = migrations[index];
      if (!migration || !/^\d{4}_[a-z0-9_]+$/.test(entry.tag)) {
        throw new Error("Repository migration manifest is invalid.");
      }
      return { identifier: entry.tag, hash: migration.hash };
    });
}

export function compareMigrationLedgers(
  repository: readonly RepositoryMigration[],
  appliedInput: readonly AppliedMigration[],
): MigrationLedgerComparison {
  const applied = [...appliedInput].sort(
    (left, right) => left.appliedOrder - right.appliedOrder,
  );
  const repositoryByIdentifier = new Map(
    repository.map((migration) => [migration.identifier, migration]),
  );
  const appliedByIdentifier = new Map(
    applied.map((migration) => [migration.identifier, migration]),
  );
  const missing = repository
    .filter((migration) => !appliedByIdentifier.has(migration.identifier))
    .map((migration) => migration.identifier);
  const unexpected = applied
    .filter((migration) => !repositoryByIdentifier.has(migration.identifier))
    .map((migration) => migration.identifier);
  const hashMismatches = applied
    .filter((migration) => {
      const expected = repositoryByIdentifier.get(migration.identifier);
      return expected !== undefined && expected.hash !== migration.hash;
    })
    .map((migration) => migration.identifier);
  const expectedOrder = repository.map((migration) => migration.identifier);
  const appliedOrder = applied.map((migration) => migration.identifier);
  const orderedPrefix = appliedOrder.every(
    (identifier, index) => expectedOrder[index] === identifier,
  );
  const identifierStatus =
    missing.length === 0 &&
    unexpected.length === 0 &&
    hashMismatches.length === 0 &&
    orderedPrefix &&
    appliedOrder.length === expectedOrder.length
      ? "MATCH"
      : "MISMATCH";

  return {
    expected: expectedOrder,
    applied: appliedOrder,
    latestApplied: applied.at(-1)?.identifier ?? null,
    missing,
    unexpected,
    hashMismatches,
    identifierStatus,
  };
}
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { readMigrationFiles } from "drizzle-orm/migrator";
