import "server-only";

import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { open, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";
import { pipeline } from "node:stream/promises";

const DOCKER_IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/;
const MAX_SAFE_STDERR = 4_096;

export type PostgresToolMode =
  | Readonly<{ kind: "DIRECT" }>
  | Readonly<{
      kind: "DOCKER_COMPOSE_LOCAL";
      service: string;
      databaseUser: string;
    }>;

export type PostgresCommand = Readonly<{
  command: string;
  args: readonly string[];
  environment: Readonly<Record<string, string>>;
}>;

type ParsedConnection = Readonly<{
  host: string;
  port: string;
  database: string;
  user: string;
  password: string;
}>;

function parseConnection(databaseUrl: string): ParsedConnection {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("Invalid PostgreSQL tool database configuration.");
  }
  if (
    (url.protocol !== "postgres:" && url.protocol !== "postgresql:") ||
    !url.hostname ||
    !url.username ||
    !url.pathname.slice(1)
  ) {
    throw new Error("Invalid PostgreSQL tool database configuration.");
  }
  return {
    host: url.hostname.toLowerCase(),
    port: url.port || "5432",
    database: decodeURIComponent(url.pathname.slice(1)),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
}

function assertDockerMode(
  mode: Extract<PostgresToolMode, { kind: "DOCKER_COMPOSE_LOCAL" }>,
) {
  if (
    !DOCKER_IDENTIFIER.test(mode.service) ||
    !DOCKER_IDENTIFIER.test(mode.databaseUser)
  ) {
    throw new Error("Invalid Docker Compose tool configuration.");
  }
}

function directConnectionArgs(connection: ParsedConnection): string[] {
  return [
    `--host=${connection.host}`,
    `--port=${connection.port}`,
    `--username=${connection.user}`,
    `--dbname=${connection.database}`,
  ];
}

function dockerPrefix(
  connection: ParsedConnection,
  mode: Extract<PostgresToolMode, { kind: "DOCKER_COMPOSE_LOCAL" }>,
  executable: "pg_dump" | "pg_restore",
): string[] {
  assertDockerMode(mode);
  if (connection.host !== "localhost" && connection.host !== "127.0.0.1") {
    throw new Error("Docker Compose tool mode requires a local database.");
  }
  return ["compose", "exec", "-T", mode.service, executable];
}

export function buildPostgresBackupCommand(
  databaseUrl: string,
  mode: PostgresToolMode,
): PostgresCommand {
  const connection = parseConnection(databaseUrl);
  const fixed = ["--format=custom", "--no-owner", "--no-acl"];
  if (mode.kind === "DIRECT") {
    return {
      command: "pg_dump",
      args: [...fixed, ...directConnectionArgs(connection)],
      environment: connection.password
        ? { PGPASSWORD: connection.password }
        : {},
    };
  }
  return {
    command: "docker",
    args: [
      ...dockerPrefix(connection, mode, "pg_dump"),
      ...fixed,
      `--username=${mode.databaseUser}`,
      `--dbname=${connection.database}`,
    ],
    environment: {},
  };
}

export function buildPostgresRestoreCommand(
  databaseUrl: string,
  mode: PostgresToolMode,
): PostgresCommand {
  const connection = parseConnection(databaseUrl);
  const fixed = [
    "--exit-on-error",
    "--no-owner",
    "--no-acl",
    "--single-transaction",
  ];
  if (mode.kind === "DIRECT") {
    return {
      command: "pg_restore",
      args: [...fixed, ...directConnectionArgs(connection)],
      environment: connection.password
        ? { PGPASSWORD: connection.password }
        : {},
    };
  }
  return {
    command: "docker",
    args: [
      ...dockerPrefix(connection, mode, "pg_restore"),
      ...fixed,
      `--username=${mode.databaseUser}`,
      `--dbname=${connection.database}`,
    ],
    environment: {},
  };
}

export function sanitizePostgresToolFailure(
  value: string,
  sensitiveValues: readonly string[] = [],
): string {
  let sanitized = value;
  for (const sensitive of sensitiveValues) {
    if (sensitive) sanitized = sanitized.replaceAll(sensitive, "[REDACTED]");
  }
  return sanitized
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[DATABASE_URL_REDACTED]")
    .replace(/password\s*=\s*[^\s]+/gi, "password=[REDACTED]")
    .replace(/do-not-print/gi, "[REDACTED]")
    .slice(0, MAX_SAFE_STDERR);
}

function assertBoundedArtifact(path: string): void {
  const root = resolve(tmpdir());
  const candidate = resolve(path);
  const child = relative(root, candidate);
  if (
    child === "" ||
    child.startsWith("..") ||
    isAbsolute(child) ||
    !/^preppy-wp16a-[a-zA-Z0-9_.-]+\.dump$/.test(
      candidate
        .slice(candidate.lastIndexOf("\\") + 1)
        .slice(candidate.lastIndexOf("/") + 1),
    )
  ) {
    throw new Error("Backup artifact path is outside the bounded temp area.");
  }
}

async function collectBoundedStderr(
  stream: NodeJS.ReadableStream,
  sensitiveValues: readonly string[],
): Promise<string> {
  let output = "";
  for await (const chunk of stream) {
    if (output.length < MAX_SAFE_STDERR * 2) output += String(chunk);
  }
  return sanitizePostgresToolFailure(output, sensitiveValues);
}

function waitForExit(child: ReturnType<typeof spawn>): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolvePromise(code ?? 1));
  });
}

function spawnTool(specification: PostgresCommand) {
  return spawn(specification.command, [...specification.args], {
    shell: false,
    windowsHide: true,
    env: { ...process.env, ...specification.environment },
    stdio: ["pipe", "pipe", "pipe"],
  });
}

export async function createPostgresBackup(
  input: Readonly<{
    databaseUrl: string;
    artifactPath: string;
    mode: PostgresToolMode;
  }>,
): Promise<{ durationMs: number }> {
  assertBoundedArtifact(input.artifactPath);
  const specification = buildPostgresBackupCommand(
    input.databaseUrl,
    input.mode,
  );
  const artifact = await open(input.artifactPath, "wx", 0o600);
  let artifactClosed = false;
  const startedAt = performance.now();
  const child = spawnTool(specification);
  child.stdin.end();
  const stderr = collectBoundedStderr(
    child.stderr,
    Object.values(specification.environment),
  );
  try {
    const [exitCode] = await Promise.all([
      waitForExit(child),
      pipeline(
        child.stdout,
        createWriteStream(input.artifactPath, {
          fd: artifact.fd,
          autoClose: false,
        }),
      ),
    ]);
    await artifact.close();
    artifactClosed = true;
    const safeStderr = await stderr;
    if (exitCode !== 0) {
      throw new Error(
        `PostgreSQL backup failed with exit code ${exitCode}${safeStderr ? `: ${safeStderr}` : "."}`,
      );
    }
    return { durationMs: Math.max(0, performance.now() - startedAt) };
  } catch (error) {
    if (!artifactClosed) await artifact.close().catch(() => undefined);
    await unlink(input.artifactPath).catch(() => undefined);
    throw error;
  }
}

export async function restorePostgresBackup(
  input: Readonly<{
    databaseUrl: string;
    artifactPath: string;
    mode: PostgresToolMode;
  }>,
): Promise<{ durationMs: number }> {
  assertBoundedArtifact(input.artifactPath);
  const specification = buildPostgresRestoreCommand(
    input.databaseUrl,
    input.mode,
  );
  const startedAt = performance.now();
  const child = spawnTool(specification);
  const stderr = collectBoundedStderr(
    child.stderr,
    Object.values(specification.environment),
  );
  const [exitCode] = await Promise.all([
    waitForExit(child),
    pipeline(createReadStream(input.artifactPath), child.stdin),
  ]);
  const safeStderr = await stderr;
  if (exitCode !== 0) {
    throw new Error(
      `PostgreSQL restore failed with exit code ${exitCode}${safeStderr ? `: ${safeStderr}` : "."}`,
    );
  }
  return { durationMs: Math.max(0, performance.now() - startedAt) };
}
