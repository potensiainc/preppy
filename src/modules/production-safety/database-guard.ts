import {
  databaseIdentityFromUrl,
  type SafeDatabaseUrlIdentity,
} from "@/src/modules/production-preflight/database-guard";

const DEDICATED_NON_PRODUCTION_NAME =
  /(?:^|_)(?:restore|rehearsal|verify|test|staging)(?:_|$)/i;
const PRODUCTION_LIKE_NAME = /(?:^|_)(?:production|prod)(?:_|$)/i;
const SAFE_DATABASE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;

function connectionTarget(databaseUrl: string): string {
  const identity = databaseIdentityFromUrl(databaseUrl);
  return `${identity.host}:${identity.port}/${identity.databaseName}`.toLowerCase();
}

function assertDedicatedIdentity(
  databaseUrl: string,
  purpose: "source" | "restore",
): SafeDatabaseUrlIdentity {
  let identity: SafeDatabaseUrlIdentity;
  try {
    identity = databaseIdentityFromUrl(databaseUrl);
  } catch {
    throw new Error(
      purpose === "restore"
        ? "Database URL must identify a dedicated non-production restore database; credentials were redacted."
        : "Database URL must identify a dedicated non-production backup source; credentials were redacted.",
    );
  }
  if (
    !SAFE_DATABASE_NAME.test(identity.databaseName) ||
    !DEDICATED_NON_PRODUCTION_NAME.test(identity.databaseName) ||
    PRODUCTION_LIKE_NAME.test(identity.databaseName) ||
    identity.databaseName.toLowerCase() === "postgres"
  ) {
    throw new Error(
      purpose === "restore"
        ? "Database URL must identify a dedicated non-production restore database; credentials were redacted."
        : "Database URL must identify a dedicated non-production backup source; credentials were redacted.",
    );
  }
  return identity;
}

export function assertDedicatedBackupSourceDatabaseUrl(
  sourceDatabaseUrl: string,
  productionDatabaseUrl?: string,
): SafeDatabaseUrlIdentity {
  const identity = assertDedicatedIdentity(sourceDatabaseUrl, "source");
  if (
    productionDatabaseUrl &&
    connectionTarget(sourceDatabaseUrl) ===
      connectionTarget(productionDatabaseUrl)
  ) {
    throw new Error(
      "Dedicated backup source must not equal production; credentials were redacted.",
    );
  }
  return identity;
}

export function assertDedicatedRestoreDatabaseUrl(
  restoreDatabaseUrl: string,
  options: Readonly<{
    sourceDatabaseUrl: string;
    productionDatabaseUrl?: string;
  }>,
): SafeDatabaseUrlIdentity {
  const identity = assertDedicatedIdentity(restoreDatabaseUrl, "restore");
  const target = connectionTarget(restoreDatabaseUrl);
  if (target === connectionTarget(options.sourceDatabaseUrl)) {
    throw new Error(
      "Dedicated restore database must differ from source; credentials were redacted.",
    );
  }
  if (
    options.productionDatabaseUrl &&
    target === connectionTarget(options.productionDatabaseUrl)
  ) {
    throw new Error(
      "Dedicated restore database must not equal production; credentials were redacted.",
    );
  }
  return identity;
}
