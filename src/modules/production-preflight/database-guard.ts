export type SafeDatabaseUrlIdentity = {
  databaseName: string;
  host: string;
  port: string;
};

function parsePostgresUrl(databaseUrl: string): URL {
  try {
    const parsed = new URL(databaseUrl);
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
      throw new Error("unsupported protocol");
    }
    return parsed;
  } catch {
    throw new Error(
      "Database URL must identify a dedicated rehearsal database; credentials were redacted.",
    );
  }
}

export function databaseIdentityFromUrl(
  databaseUrl: string,
): SafeDatabaseUrlIdentity {
  const parsed = parsePostgresUrl(databaseUrl);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!databaseName) {
    throw new Error(
      "Database URL must identify a dedicated rehearsal database; credentials were redacted.",
    );
  }
  return {
    databaseName,
    host: parsed.hostname.toLowerCase(),
    port: parsed.port || "5432",
  };
}

function connectionTarget(databaseUrl: string): string {
  const identity = databaseIdentityFromUrl(databaseUrl);
  return `${identity.host}:${identity.port}/${identity.databaseName}`.toLowerCase();
}

export function assertDedicatedRehearsalDatabaseUrl(
  rehearsalDatabaseUrl: string,
  productionDatabaseUrl?: string,
): SafeDatabaseUrlIdentity {
  const identity = databaseIdentityFromUrl(rehearsalDatabaseUrl);
  if (
    !/(?:^|_)(?:rehearsal|verify|test|staging)(?:_|$)/i.test(
      identity.databaseName,
    )
  ) {
    throw new Error(
      "Database URL must identify a dedicated rehearsal database; credentials were redacted.",
    );
  }
  if (/production|\bprod\b/i.test(identity.databaseName)) {
    throw new Error(
      "Database URL must identify a dedicated rehearsal database; credentials were redacted.",
    );
  }
  if (
    productionDatabaseUrl &&
    connectionTarget(rehearsalDatabaseUrl) ===
      connectionTarget(productionDatabaseUrl)
  ) {
    throw new Error(
      "Dedicated rehearsal database must not equal production; credentials were redacted.",
    );
  }
  return identity;
}
