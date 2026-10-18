import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { object, literal, string, iso, type z } from "zod";
import { stop } from "./migration-plan";
export const scopedBackupReceiptSchema = object({
  version: literal(1),
  target: object({
    environmentId: string().min(1),
    databaseServiceId: string().min(1),
    database: string().min(1),
  }).strict(),
  capturedAt: iso.datetime(),
  verifiedAt: iso.datetime(),
  dumpPath: string(),
  dumpSha256: string().regex(/^[a-f0-9]{64}$/),
  beforeTablesPath: string(),
  restoredTablesPath: string(),
  tablesSha256: string().regex(/^[a-f0-9]{64}$/),
  ledgerSha256: string().regex(/^[a-f0-9]{64}$/),
  schemaEquivalent: literal(true),
}).strict();
export type ScopedBackupReceipt = z.infer<typeof scopedBackupReceiptSchema>;
export async function hashScopedFile(path: string) {
  if (!isAbsolute(path) || !(await lstat(path)).isFile())
    stop("BACKUP_FILE_REQUIRED");
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(path)) hash.update(bytes);
  return hash.digest("hex");
}
export async function verifyScopedBackup(
  receiptPath: string,
  now = new Date(),
): Promise<ScopedBackupReceipt> {
  const receipt = scopedBackupReceiptSchema.parse(
    JSON.parse(await readFile(receiptPath, "utf8")),
  );
  if (resolve(receipt.beforeTablesPath) === resolve(receipt.restoredTablesPath))
    stop("DISTINCT_RESTORE_PROOF_FILES_REQUIRED");
  const captured = Date.parse(receipt.capturedAt),
    verified = Date.parse(receipt.verifiedAt);
  if (
    captured > verified ||
    verified > now.getTime() + 300000 ||
    now.getTime() - captured > 21600000
  )
    stop("BACKUP_STALE_OR_INVALID_TIME");
  if (
    (await hashScopedFile(receipt.dumpPath)) !== receipt.dumpSha256 ||
    (await hashScopedFile(receipt.beforeTablesPath)) !== receipt.tablesSha256 ||
    (await hashScopedFile(receipt.restoredTablesPath)) !== receipt.tablesSha256
  )
    stop("BACKUP_ARTIFACT_CHECKSUM_MISMATCH");
  const rows = (await readFile(receipt.beforeTablesPath, "utf8"))
    .trim()
    .split(/\r?\n/)
    .map(
      (s) =>
        JSON.parse(s) as {
          kind?: string;
          table?: string;
          sha256?: string;
          count?: number;
        },
    );
  if (
    !rows.length ||
    !rows.some((x) => x.table === "drizzle.__drizzle_migrations") ||
    rows.some(
      (x) =>
        x.kind !== "table" ||
        !x.table ||
        !x.sha256?.match(/^[a-f0-9]{64}$/) ||
        !Number.isSafeInteger(x.count) ||
        x.count! < 0,
    ) ||
    new Set(rows.map((x) => x.table)).size !== rows.length
  )
    stop("RESTORE_TABLE_PROOF_INVALID");
  const decoded = spawnSync(
    "pg_restore",
    [
      "--file=" + (process.platform === "win32" ? "NUL" : "/dev/null"),
      receipt.dumpPath,
    ],
    { stdio: "ignore", timeout: 60000 },
  );
  if (decoded.status !== 0) stop("BACKUP_ARCHIVE_DECODE_FAILED");
  const toc = spawnSync("pg_restore", ["--list", receipt.dumpPath], {
    encoding: "utf8",
    timeout: 10000,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (
    toc.status !== 0 ||
    !toc.stdout
      .split(/\r?\n/)
      .some(
        (line) => line.trim() === ";     dbname: " + receipt.target.database,
      )
  )
    stop("BACKUP_ARCHIVE_DATABASE_MISMATCH");
  return receipt;
}
