import { z } from "zod";

const LOCAL_MAX_CONNECTIONS = 5;

const databaseUrlSchema = z.url().refine(
  (value) => {
    const protocol = new URL(value).protocol;
    return protocol === "postgres:" || protocol === "postgresql:";
  },
  { message: "DATABASE_URL must use postgres:// or postgresql://" },
);

const positiveIntegerString = z
  .string()
  .regex(/^[1-9]\d*$/, "DATABASE_MAX_CONNECTIONS must be a positive integer")
  .transform(Number)
  .refine(Number.isSafeInteger, {
    message: "DATABASE_MAX_CONNECTIONS must be a safe positive integer",
  });

const runtimeDatabaseEnvSchema = z
  .object({
    DATABASE_URL: databaseUrlSchema,
    DATABASE_MAX_CONNECTIONS: positiveIntegerString.optional(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  })
  .superRefine((environment, context) => {
    if (
      environment.NODE_ENV === "production" &&
      environment.DATABASE_MAX_CONNECTIONS === undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["DATABASE_MAX_CONNECTIONS"],
        message:
          "DATABASE_MAX_CONNECTIONS must be set from the deployment connection budget in production",
      });
    }
  })
  .transform((environment) => ({
    DATABASE_URL: environment.DATABASE_URL,
    DATABASE_MAX_CONNECTIONS:
      environment.DATABASE_MAX_CONNECTIONS ?? LOCAL_MAX_CONNECTIONS,
    NODE_ENV: environment.NODE_ENV,
  }));

const disabledByDefaultBoolean = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const sideEffectEnvSchema = z.object({
  EMAIL_SEND_ENABLED: disabledByDefaultBoolean,
  WORKER_ENABLED: disabledByDefaultBoolean,
  ANALYTICS_ENABLED: disabledByDefaultBoolean,
  CACHE_REVALIDATION_ENABLED: disabledByDefaultBoolean,
});

export type RuntimeDatabaseEnv = z.infer<typeof runtimeDatabaseEnvSchema>;
export type SideEffectEnv = z.infer<typeof sideEffectEnvSchema>;

export function parseRuntimeDatabaseEnv(
  environment: Record<string, string | undefined>,
): RuntimeDatabaseEnv {
  return runtimeDatabaseEnvSchema.parse(environment);
}

export function getRuntimeDatabaseEnv(): RuntimeDatabaseEnv {
  return parseRuntimeDatabaseEnv(process.env);
}

export function parseSideEffectEnv(
  environment: Record<string, string | undefined>,
): SideEffectEnv {
  return sideEffectEnvSchema.parse(environment);
}

export function getSideEffectEnv(): SideEffectEnv {
  return parseSideEffectEnv(process.env);
}
