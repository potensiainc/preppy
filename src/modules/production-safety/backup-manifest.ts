import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";

const RUN_ID = /^[0-9]{8}T[0-9]{6}Z-[a-z0-9]{8,32}$/;
const SAFE_LABEL = /^[a-z0-9][a-z0-9_-]{0,127}$/i;
const MIGRATION_IDENTIFIER = /^(?:[0-9]{4}[a-z0-9_-]*|NONE)$/i;
const SHA256 = /^[a-f0-9]{64}$/;

export const restoreCriticalTableNames = [
  "admin_users",
  "admission_cycles",
  "admission_events",
  "admission_event_versions",
  "admission_facts",
  "admission_fact_versions",
  "articles",
  "article_institutions",
  "article_opportunities",
  "audit_logs",
  "auth_identities",
  "consent_decisions",
  "email_provider_events",
  "follow_episodes",
  "follows",
  "institution_facts",
  "institution_fact_versions",
  "institution_fact_version_evidence",
  "institution_school_links",
  "institution_source_bindings",
  "institutions",
  "notification_deliveries",
  "notification_delivery_attempts",
  "notification_preferences",
  "notifications",
  "opportunities",
  "opportunity_admission_event_links",
  "opportunity_changes",
  "opportunity_source_bindings",
  "opportunity_version_evidence",
  "opportunity_versions",
  "outbox_events",
  "schools",
  "source_bindings",
  "source_observations",
  "source_snapshots",
  "sources",
  "url_redirects",
  "user_emails",
  "users",
] as const;

const criticalTableSet = new Set<string>(restoreCriticalTableNames);

export type BackupRestoreManifest = Readonly<{
  version: 1;
  generatedAt: string;
  sourceEnvironment: "NON_PRODUCTION";
  sourceDatabaseLabel: string;
  migrationLatest: string;
  criticalTableCounts: Readonly<Record<string, number>>;
  artifactSha256: string;
}>;

function isInside(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path !== "" && !path.startsWith("..") && !isAbsolute(path);
}

export async function createBoundedBackupArtifactPath(
  rootDirectory: string,
  input: Readonly<{ runId: string }>,
): Promise<string> {
  if (!RUN_ID.test(input.runId)) throw new Error("Invalid backup run ID.");
  const allowedRoot = resolve(tmpdir());
  const root = resolve(rootDirectory);
  if (root !== allowedRoot && !isInside(allowedRoot, root)) {
    throw new Error(
      "Backup artifact directory must be below the OS temp root.",
    );
  }
  const artifact = resolve(root, `preppy-wp16a-${input.runId}.dump`);
  if (!isInside(root, artifact))
    throw new Error("Invalid backup artifact path.");
  try {
    await access(artifact);
    throw new Error("Backup artifact already exists; overwrite is forbidden.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "Backup artifact already exists; overwrite is forbidden."
    ) {
      throw error;
    }
  }
  return artifact;
}

export async function hashBackupArtifact(path: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolvePromise, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolvePromise);
  });
  return hash.digest("hex");
}

export function buildBackupRestoreManifest(input: {
  generatedAt: string;
  sourceDatabaseLabel: string;
  migrationLatest: string;
  criticalTableCounts: Readonly<Record<string, number>>;
  artifactSha256: string;
}): BackupRestoreManifest {
  const generatedAt = new Date(input.generatedAt);
  const safeCounts = Object.fromEntries(
    Object.entries(input.criticalTableCounts).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
  const safe =
    Number.isFinite(generatedAt.getTime()) &&
    generatedAt.toISOString() === input.generatedAt &&
    SAFE_LABEL.test(input.sourceDatabaseLabel) &&
    MIGRATION_IDENTIFIER.test(input.migrationLatest) &&
    SHA256.test(input.artifactSha256) &&
    Object.entries(safeCounts).every(
      ([key, count]) =>
        criticalTableSet.has(key) && Number.isSafeInteger(count) && count >= 0,
    );
  if (!safe) throw new Error("Unsafe backup manifest input.");
  return {
    version: 1,
    generatedAt: input.generatedAt,
    sourceEnvironment: "NON_PRODUCTION",
    sourceDatabaseLabel: input.sourceDatabaseLabel,
    migrationLatest: input.migrationLatest,
    criticalTableCounts: safeCounts,
    artifactSha256: input.artifactSha256,
  };
}
