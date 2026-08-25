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

  it("records the bounded production migration evidence without granting cutover", () => {
    const decisions = readFileSync(
      resolve("docs/15B_FINAL_OWNER_DECISIONS.md"),
      "utf8",
    );
    const checklist = readFileSync(
      resolve("docs/15B_FINAL_PRODUCTION_READINESS_CHECKLIST.md"),
      "utf8",
    );
    const result = readFileSync(
      resolve("docs/15B_RAILWAY_PRODUCTION_PROVISIONING_RESULT.md"),
      "utf8",
    );
    const migrationResult = readFileSync(
      resolve("docs/15B_PRODUCTION_MIGRATION_RESULT.md"),
      "utf8",
    );

    for (const decision of ["D1", "D2", "D4", "D5", "D6", "D7", "D8", "D9"]) {
      expect(decisions).toMatch(
        new RegExp("### " + decision + "\\.[\\s\\S]*?Status: `OWNER APPROVED`"),
      );
    }
    expect(decisions).toMatch(/### D3\.[\s\S]*?Status: `UNRESOLVED`/);
    expect(decisions).toMatch(
      /#### D10A\.[\s\S]*?Status: `OWNER APPROVED` and `EXECUTED`/,
    );
    expect(decisions).toMatch(
      /#### D10B\.[\s\S]*?Status: `NOT APPROVED` \/ `NOT EXECUTED`/,
    );

    expect(result).toContain("Project | `preppy-production`");
    expect(result).toContain("`preppy-web`");
    expect(result).toContain("`preppy-worker`");
    expect(result).toContain("`*/5 * * * *` UTC");
    expect(result).toContain("`FRESH_EMPTY_PRODUCTION_BASELINE`");
    expect(result).toContain("`OWNER_BILLING_ACTION_REQUIRED`");
    expect(result).toContain("WORKER_ENABLED=false");
    expect(result).toContain("claimed=0");
    expect(result).toContain("Final canonical launch origin: `UNRESOLVED`");
    expect(result).not.toMatch(/postgres(?:ql)?:\/\//i);
    expect(result).not.toMatch(/(?:password|secret|token)\s*[:=]\s*[^`\s]+/i);

    expect(migrationResult).toContain(
      "Final gate: `PRODUCTION_MIGRATION_COMPLETE_CAPABILITIES_DISABLED`",
    );
    expect(migrationResult).toContain("`0010_colorful_randall_flagg`");
    expect(migrationResult).toContain("BLOCKER | `0`");
    expect(migrationResult).toContain("WORKER_ENABLED=false");
    expect(migrationResult).toContain("Railway remains on Hobby");
    expect(migrationResult).toContain("D10B Product cutover");
    expect(checklist).toContain(
      "Final gate: `PRODUCTION_MIGRATION_COMPLETE_CAPABILITIES_DISABLED`",
    );
    expect(checklist).toContain("Railway Pro/native PITR");
    expect(checklist).toContain("deliberately deferred");
    expect(checklist).toContain("D10A production migration/backfill");
    expect(checklist).toContain("D10B Product cutover/capability enablement");

    for (const document of [decisions, checklist, migrationResult]) {
      expect(document).not.toMatch(/postgres(?:ql)?:\/\//i);
      expect(document).not.toMatch(
        /(?:password|secret|token)\s*[:=]\s*[^`\s]+/i,
      );
    }
  });
});
