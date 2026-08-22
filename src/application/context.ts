import { randomUUID } from "node:crypto";

export type BaseCommandContext = {
  correlationId: string;
  occurredAt: Date;
};

type BaseCommandContextOptions = {
  occurredAt?: Date;
  clientCorrelationId?: string;
};

export type UserCommandContext = BaseCommandContext & { userId: string };

export type AdminCommandContext = BaseCommandContext & {
  adminUserId: string;
  reason?: string;
};

export type MigrationCommandContext = BaseCommandContext & {
  source: "MIGRATION";
  emitProductSignals: false;
};

export type LiveSystemCommandContext = BaseCommandContext & {
  source: "WORKER" | "WEBHOOK";
  emitProductSignals: true;
};

export type SystemCommandContext =
  MigrationCommandContext | LiveSystemCommandContext;

type UserCommandContextOptions = BaseCommandContextOptions & {
  userId: string;
};

type AdminCommandContextOptions = BaseCommandContextOptions & {
  adminUserId: string;
  reason?: string;
};

type LiveSystemCommandContextOptions = BaseCommandContextOptions & {
  source: LiveSystemCommandContext["source"];
};

export function createBaseCommandContext(
  options: BaseCommandContextOptions = {},
): BaseCommandContext {
  return {
    correlationId: randomUUID(),
    occurredAt: options.occurredAt ?? new Date(),
  };
}

export function createUserCommandContext(
  options: UserCommandContextOptions,
): UserCommandContext {
  return {
    ...createBaseCommandContext(options),
    userId: options.userId,
  };
}

export function createAdminCommandContext(
  options: AdminCommandContextOptions,
): AdminCommandContext {
  return {
    ...createBaseCommandContext(options),
    adminUserId: options.adminUserId,
    ...(options.reason === undefined ? {} : { reason: options.reason }),
  };
}

export function createLiveSystemCommandContext(
  options: LiveSystemCommandContextOptions,
): LiveSystemCommandContext {
  return {
    ...createBaseCommandContext(options),
    source: options.source,
    emitProductSignals: true,
  };
}

export function createMigrationCommandContext(
  options: BaseCommandContextOptions = {},
): MigrationCommandContext {
  return {
    ...createBaseCommandContext(options),
    source: "MIGRATION",
    emitProductSignals: false,
  };
}
