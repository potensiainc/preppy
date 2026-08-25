import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import railwayDefinition from "@/.railway/railway";
import * as sitemapRoute from "@/app/sitemap";
import packageJson from "@/package.json";

describe("WP-15B Railway production contract", () => {
  it("provides a fixed scheduled run-once Worker command", () => {
    expect(packageJson.scripts["worker:once"]).toBe(
      "tsx --tsconfig scripts/worker-tsconfig.json scripts/worker.ts --once --provider=resend --worker-id=railway-worker --batch=10 --lease-ms=300000 --timeout-ms=240000",
    );
  });

  it("renders the database-backed sitemap at request time", () => {
    expect((sitemapRoute as Record<string, unknown>).dynamic).toBe(
      "force-dynamic",
    );
  });

  it("includes the current Railway project IaC entrypoint", () => {
    expect(existsSync(resolve(".railway/railway.ts"))).toBe(true);
  });

  it("defines one web, one scheduled Worker, and one PostgreSQL primary with side effects off", () => {
    const shared = new Proxy<Record<string, { readonly reference: string }>>(
      {},
      {
        get: (_target, property) => ({
          reference: `shared:${String(property)}`,
        }),
      },
    );
    const project = railwayDefinition({
      environment: "production",
      shared,
    }) as unknown as {
      name: string;
      resources: Array<{
        kind: string;
        name: string;
        build?: string;
        start?: string;
        healthcheck?: string;
        healthcheckTimeout?: number;
        replicas?: number;
        env?: Record<string, unknown>;
        source?: unknown;
        domains?: unknown;
      }>;
    };

    expect(project.name).toBe("PREPPY Production");
    expect(project.resources.map(({ kind, name }) => ({ kind, name }))).toEqual(
      [
        { kind: "service", name: "web" },
        { kind: "service", name: "worker" },
        { kind: "postgres", name: "postgres" },
      ],
    );

    const web = project.resources[0]!;
    const worker = project.resources[1]!;
    expect(web).toMatchObject({
      build: "npm run build",
      start: "npm run start",
      healthcheck: "/api/health",
      healthcheckTimeout: 120,
      replicas: 1,
    });
    expect(worker).toMatchObject({
      build: "npm run build",
      start: "npm run worker:once",
      replicas: 1,
    });
    expect(worker.healthcheck).toBeUndefined();
    expect(web.source).toBeUndefined();
    expect(worker.source).toBeUndefined();
    expect(web.domains).toBeUndefined();
    expect(worker.domains).toBeUndefined();

    expect(web.env).toMatchObject({
      NODE_ENV: "production",
      RAILPACK_NODE_NPM_INSTALL: "npm ci",
      DATABASE_URL: { reference: "shared:PREPPY_WEB_DATABASE_URL" },
      WORKER_ENABLED: "false",
      EMAIL_SEND_ENABLED: "false",
      ANALYTICS_ENABLED: "false",
      CACHE_REVALIDATION_ENABLED: "false",
    });
    expect(worker.env).toMatchObject({
      NODE_ENV: "production",
      RAILPACK_NODE_NPM_INSTALL: "npm ci",
      DATABASE_URL: { reference: "shared:PREPPY_WORKER_DATABASE_URL" },
      WORKER_ENABLED: "false",
      EMAIL_SEND_ENABLED: "false",
      ANALYTICS_ENABLED: "false",
      CACHE_REVALIDATION_ENABLED: "false",
    });
    expect(web.env?.DATABASE_URL).not.toBe(worker.env?.DATABASE_URL);

    for (const command of [web.build, web.start, worker.build, worker.start]) {
      expect(command).not.toMatch(/migrat|backfill/i);
    }

    const safeLiterals = new Set([
      "NODE_ENV",
      "RAILPACK_NODE_NPM_INSTALL",
      "WORKER_ENABLED",
      "EMAIL_SEND_ENABLED",
      "ANALYTICS_ENABLED",
      "CACHE_REVALIDATION_ENABLED",
    ]);
    for (const resource of [web, worker]) {
      for (const [name, value] of Object.entries(resource.env ?? {})) {
        if (safeLiterals.has(name)) continue;
        expect(value).toMatchObject({
          reference: expect.stringMatching(/^shared:/),
        });
      }
    }
  });

  it("keeps every owner decision unchecked and the Railway candidate unapproved", () => {
    const approvals = readFileSync(
      resolve("docs/15B_OWNER_APPROVALS.md"),
      "utf8",
    );

    expect(approvals.match(/- \[x\]/gi) ?? []).toHaveLength(0);
    expect(approvals).toContain("Candidate: Railway");
    expect(approvals).toContain("Status: `UNAPPROVED");
    expect(approvals).toContain("Final gate: `READY_FOR_OWNER_APPROVAL`");
  });
});
