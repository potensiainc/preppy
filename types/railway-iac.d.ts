declare module "railway/iac" {
  export type RailwayReference = Readonly<{
    readonly reference: string;
  }>;

  export type RailwayEnvironmentValue = string | RailwayReference;

  export type RailwayResource = Readonly<{
    kind: "service" | "postgres";
    name: string;
  }>;

  export type RailwayContext = Readonly<{
    environment: string;
    shared: Readonly<Record<string, RailwayReference>>;
  }>;

  export type RailwayProject = Readonly<{
    kind: "project";
    name: string;
    resources: readonly RailwayResource[];
  }>;

  export function defineRailway(
    factory: (context: RailwayContext) => RailwayProject,
  ): (context: RailwayContext) => RailwayProject;

  export function project(
    name: string,
    config: Readonly<{ resources: readonly RailwayResource[] }>,
  ): RailwayProject;

  export function service(
    name: string,
    config?: Readonly<{
      build?: string;
      start?: string;
      healthcheck?: string;
      healthcheckTimeout?: number;
      replicas?: number;
      env?: Readonly<Record<string, RailwayEnvironmentValue>>;
    }>,
  ): RailwayResource;

  export function postgres(name: string): RailwayResource &
    Readonly<{
      env: Readonly<{ DATABASE_URL: RailwayReference }>;
    }>;
}
