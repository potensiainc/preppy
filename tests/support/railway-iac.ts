type Resource = Readonly<{
  kind: "service" | "postgres";
  name: string;
  [key: string]: unknown;
}>;

type Context = Readonly<{
  environment: string;
  shared: Readonly<Record<string, unknown>>;
}>;

export function defineRailway<T>(factory: (context: Context) => T) {
  return factory;
}

export function project(
  name: string,
  config: Readonly<{ resources: readonly Resource[] }>,
) {
  return { kind: "project" as const, name, resources: config.resources };
}

export function service(
  name: string,
  config: Readonly<Record<string, unknown>> = {},
): Resource {
  return { kind: "service", name, ...config };
}

export function postgres(name: string): Resource {
  return {
    kind: "postgres",
    name,
    env: { DATABASE_URL: `postgres:${name}:DATABASE_URL` },
  };
}
