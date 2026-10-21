import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  EXPECTED_REPOSITORY_MIGRATIONS,
  isKnownHistoricalLedgerRow,
} from "../modules/production-safety/migration-manifest";

export type MigrationSpec = {
  identifier: string;
  hash: string;
  when: number;
  source: string;
};
export type LedgerRow = {
  id: number;
  hash: string;
  created_at: number | string;
};
export class MigrationSafetyError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "MigrationSafetyError";
  }
}
export function stop(code: string): never {
  throw new MigrationSafetyError(code);
}
export async function loadMigrationSpecs(
  folder = resolve(process.cwd(), "src/db/migrations"),
): Promise<MigrationSpec[]> {
  const journal = JSON.parse(
    await readFile(resolve(folder, "meta/_journal.json"), "utf8"),
  ) as { entries: { idx: number; tag: string; when: number }[] };
  const result: MigrationSpec[] = [];
  for (const [index, entry] of journal.entries.entries()) {
    if (
      entry.idx !== index ||
      !/^\d{4}_[a-z0-9_]+$/.test(entry.tag) ||
      !Number.isSafeInteger(entry.when) ||
      (index > 0 && entry.when <= result[index - 1]!.when)
    )
      stop("INVALID_MIGRATION_JOURNAL");
    const source = (
      await readFile(resolve(folder, entry.tag + ".sql"), "utf8")
    ).replace(/\r\n/g, "\n");
    const hash = createHash("sha256").update(source).digest("hex");
    const expected = EXPECTED_REPOSITORY_MIGRATIONS[index];
    if (
      !expected ||
      expected.identifier !== entry.tag ||
      expected.hash !== hash
    )
      stop("MIGRATION_SOURCE_CHECKSUM_MISMATCH");
    result.push({
      identifier: entry.tag,
      when: entry.when,
      hash,
      source,
    });
  }
  if (result.length !== EXPECTED_REPOSITORY_MIGRATIONS.length)
    stop("MIGRATION_MANIFEST_LENGTH_MISMATCH");
  return result;
}
// Production applied 0018 by its scoped command while 0017 was deferred, so
// a later scoped 0017 is appended after 0018. That single reversal is the
// only out-of-order append the runners accept.
const APPROVED_OUT_OF_ORDER_APPENDS = [
  {
    identifier: "0017_account_deletion",
    after: "0018_english_session_identity",
  },
] as const;

function approvedOutOfOrder(
  specs: readonly MigrationSpec[],
  index: number,
  highest: number,
) {
  return APPROVED_OUT_OF_ORDER_APPENDS.some(
    (approved) =>
      specs[index]?.identifier === approved.identifier &&
      specs[highest]?.identifier === approved.after,
  );
}

export function validateKnownLedger(
  specs: readonly MigrationSpec[],
  ledger: readonly LedgerRow[],
): number[] {
  const indices: number[] = [];
  const ids = new Set<number>();
  let highest = -1;
  for (const row of [...ledger].sort((a, b) => a.id - b.id)) {
    if (ids.has(row.id)) stop("DUPLICATE_MIGRATION_LEDGER_ROW");
    ids.add(row.id);
    if (
      isKnownHistoricalLedgerRow({ hash: row.hash, createdAt: row.created_at })
    )
      continue;
    const index = specs.findIndex((s) => s.hash === row.hash);
    if (index < 0) stop("UNKNOWN_MIGRATION_HASH");
    if (indices.includes(index)) stop("DUPLICATE_MIGRATION_LEDGER_ROW");
    if (Number(row.created_at) !== specs[index]!.when)
      stop("MIGRATION_TIMESTAMP_MISMATCH");
    if (index <= highest && !approvedOutOfOrder(specs, index, highest))
      stop("MIGRATION_LEDGER_ORDER_MISMATCH");
    highest = Math.max(highest, index);
    indices.push(index);
  }
  return indices;
}
export function planFullMigrations(
  specs: readonly MigrationSpec[],
  ledger: readonly LedgerRow[],
) {
  const indices = validateKnownLedger(specs, ledger);
  if (
    [...indices]
      .sort((a, b) => a - b)
      .some((index, position) => index !== position)
  )
    stop("MIGRATION_GAP_REQUIRES_REVIEW");
  return specs.slice(indices.length);
}
export const ENGLISH_IDENTITY_MIGRATION = {
  identifier: "0018_english_session_identity",
  hash: "6782c831e6d28b646aca6edc92e7b086406f7b973e29621bac4d77d303e6fcf8",
  when: 1792300000000,
} as const;
export function planEnglishIdentityMigration(
  specs: readonly MigrationSpec[],
  ledger: readonly LedgerRow[],
) {
  const indices = validateKnownLedger(specs, ledger);
  const target = specs.findIndex(
    (s) => s.identifier === ENGLISH_IDENTITY_MIGRATION.identifier,
  );
  if (
    target !== 18 ||
    specs[target]?.hash !== ENGLISH_IDENTITY_MIGRATION.hash ||
    specs[target]?.when !== ENGLISH_IDENTITY_MIGRATION.when
  )
    stop("SCOPED_MIGRATION_CHECKSUM_MISMATCH");
  for (let index = 0; index < 17; index++)
    if (!indices.includes(index)) stop("SCOPED_PREDECESSOR_MISSING");
  if (indices.some((index) => index > target))
    stop("SCOPED_MIGRATION_HAS_LATER_HISTORY");
  return {
    migration: specs[target]!,
    applied: indices.includes(target),
    deferred0017: !indices.includes(17),
  };
}

export const ACCOUNT_DELETION_MIGRATION = {
  identifier: "0017_account_deletion",
  hash: "e4ad10ea39af39346176bcbdaa0340ef3b1a71664106be2c3e6cf16762bca6c1",
  when: 1790298000000,
} as const;
// 0017 is applied by its scoped command only where 0018 was already applied
// while 0017 was deferred (production). Elsewhere the full runner applies it
// in journal order, so this plan refuses any other ledger shape.
export function planAccountDeletionMigration(
  specs: readonly MigrationSpec[],
  ledger: readonly LedgerRow[],
) {
  const indices = validateKnownLedger(specs, ledger);
  const target = specs.findIndex(
    (s) => s.identifier === ACCOUNT_DELETION_MIGRATION.identifier,
  );
  const english = specs.findIndex(
    (s) => s.identifier === ENGLISH_IDENTITY_MIGRATION.identifier,
  );
  if (
    target !== 17 ||
    english !== 18 ||
    specs[target]?.hash !== ACCOUNT_DELETION_MIGRATION.hash ||
    specs[target]?.when !== ACCOUNT_DELETION_MIGRATION.when
  )
    stop("SCOPED_MIGRATION_CHECKSUM_MISMATCH");
  for (let index = 0; index < target; index++)
    if (!indices.includes(index)) stop("SCOPED_PREDECESSOR_MISSING");
  if (!indices.includes(english)) stop("SCOPED_USE_FULL_RUNNER");
  if (indices.some((index) => index > english))
    stop("SCOPED_MIGRATION_HAS_LATER_HISTORY");
  return {
    migration: specs[target]!,
    applied: indices.includes(target),
  };
}

export function migrationStatements(spec: MigrationSpec) {
  if (createHash("sha256").update(spec.source).digest("hex") !== spec.hash)
    stop("MIGRATION_SOURCE_CHECKSUM_MISMATCH");
  return spec.source
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
}
