export type PreflightMode = "PRODUCTION_READ_ONLY" | "REHEARSAL";
export type PreflightSeverity = "BLOCKER" | "WARNING" | "INFO";
export type PreflightFinalGate = "READY_FOR_WP16A" | "BLOCKED";

export type PreflightCheck = {
  code: string;
  severity: PreflightSeverity;
  entityType?: string;
  entityId?: string;
  count?: number;
  message: string;
};

export type MigrationInventory = {
  expected: string[];
  applied: string[];
  latestApplied: string | null;
  missing: string[];
  unexpected: string[];
  hashMismatches: string[];
  identifierStatus: "MATCH" | "MISMATCH" | "UNKNOWN";
};

export type PreflightDatabaseMetadata = {
  name: string;
  user: string;
  serverVersion: string;
  snapshotConsistency:
    "REPEATABLE_READ_READ_ONLY" | "POINT_IN_TIME_PER_QUERY" | "NOT_EXECUTED";
};

export type PreflightReport = {
  version: 1;
  generatedAt: string;
  mode: PreflightMode;
  database: PreflightDatabaseMetadata;
  migrations: MigrationInventory;
  inventory: Record<string, unknown>;
  backfills: Record<string, unknown>;
  checks: PreflightCheck[];
  summary: {
    blockers: number;
    warnings: number;
    infos: number;
    readyForNextGate: boolean;
    finalGate: PreflightFinalGate;
  };
};

export type PreflightReportInput = Omit<PreflightReport, "version" | "summary">;
