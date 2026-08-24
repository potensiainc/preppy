import { z } from "zod";

const urlWithProtocols = (protocols: readonly string[]) =>
  z.url().refine(
    (value) => {
      try {
        return protocols.includes(new URL(value).protocol);
      } catch {
        return false;
      }
    },
    {
      message: `URL protocol must be one of: ${protocols.join(", ")}`,
    },
  );

const databaseEnvSchema = z.object({
  DATABASE_URL: urlWithProtocols(["postgres:", "postgresql:"]),
});

const serverEnvSchema = databaseEnvSchema.extend({
  APP_BASE_URL: urlWithProtocols(["http:", "https:"]),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseDatabaseEnv(
  environment: Record<string, string | undefined>,
): z.infer<typeof databaseEnvSchema> {
  return databaseEnvSchema.parse(environment);
}

export function getDatabaseEnv(): z.infer<typeof databaseEnvSchema> {
  return parseDatabaseEnv(process.env);
}

export function parseServerEnv(
  environment: Record<string, string | undefined>,
): ServerEnv {
  return serverEnvSchema.parse(environment);
}

export function getServerEnv(): ServerEnv {
  return parseServerEnv(process.env);
}
