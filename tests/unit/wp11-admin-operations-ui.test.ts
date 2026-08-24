import { readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { DatabaseExecutor } from "@/src/infrastructure/db/runtime.server";

const repositoryRoot = resolve(import.meta.dirname, "../..");

async function importPages() {
  try {
    return await Promise.all([
      vi.importActual<typeof import("@/app/admin/(protected)/operations/page")>(
        "@/app/admin/(protected)/operations/page",
      ),
      vi.importActual<
        typeof import("@/app/admin/(protected)/operations/outbox/page")
      >("@/app/admin/(protected)/operations/outbox/page"),
      vi.importActual<
        typeof import("@/app/admin/(protected)/operations/deliveries/page")
      >("@/app/admin/(protected)/operations/deliveries/page"),
      vi.importActual<
        typeof import("@/app/admin/(protected)/operations/audit/page")
      >("@/app/admin/(protected)/operations/audit/page"),
      vi.importActual<
        typeof import("@/app/admin/(protected)/operations/health/page")
      >("@/app/admin/(protected)/operations/health/page"),
    ] as const);
  } catch {
    return null;
  }
}

async function filesBelow(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory);
    const files: string[] = [];
    for (const entry of entries) {
      const path = resolve(directory, entry);
      if ((await stat(path)).isDirectory())
        files.push(...(await filesBelow(path)));
      else files.push(path);
    }
    return files;
  } catch {
    return [];
  }
}

const pagination = { page: 1, pageSize: 20, total: 1, hasNext: false };
const health = {
  status: "ATTENTION" as const,
  checkedAt: "2099-08-24T12:00:00.000Z",
  database: { status: "AVAILABLE" as const },
  outbox: {
    status: "AVAILABLE" as const,
    pending: 2,
    processing: 1,
    failed: 0,
    deadLetter: 1,
  },
  dataQuality: {
    status: "AVAILABLE" as const,
    warningCount: 1,
    affectedRecordCount: 1,
    unavailableCheckCount: 0,
  },
};
const warnings = {
  status: "AVAILABLE" as const,
  checkedAt: health.checkedAt,
  warnings: [
    {
      code: "OVERDUE_CRITICAL_MONITORING" as const,
      severity: "CRITICAL" as const,
      evaluationStatus: "AVAILABLE" as const,
      errorCategory: null,
      count: 1,
      details: [
        {
          targetType: "OPPORTUNITY" as const,
          targetId: "6c78ea0e-393f-47ad-ae96-58fb18fc1421",
          relatedId: "30154504-e5f0-4a6d-86f4-07967471ef13",
          observedCount: 1,
        },
      ],
    },
  ],
};

describe("WP-11 read-only Operations UI", () => {
  it("renders bounded inspection pages with no mutation affordance or PII", async () => {
    const pages = await importPages();
    expect(pages).not.toBeNull();
    if (!pages) return;
    const [landing, outbox, deliveries, audit, healthPage] = pages;
    const markups = [
      renderToStaticMarkup(
        createElement(landing.AdminOperationsView, { health }),
      ),
      renderToStaticMarkup(
        createElement(outbox.AdminOutboxView, {
          data: {
            items: [
              {
                id: "18ac6bd6-83f9-4e03-a980-cd507354ea90",
                eventType: "OPPORTUNITY_CHANGED",
                aggregateType: "OPPORTUNITY",
                aggregateId: "6c78ea0e-393f-47ad-ae96-58fb18fc1421",
                status: "DEAD_LETTER",
                availableAt: health.checkedAt,
                processedAt: null,
                attemptCount: 3,
                maxAttempts: 3,
                errorCode: "PROVIDER.TIMEOUT",
                lastErrorAt: health.checkedAt,
                deadLetteredAt: health.checkedAt,
                createdAt: health.checkedAt,
              },
            ],
            pagination,
          },
        }),
      ),
      renderToStaticMarkup(
        createElement(deliveries.AdminDeliveriesView, {
          data: {
            items: [
              {
                deliveryId: "ea913b0d-ec0a-417b-b413-1008923a6b58",
                notificationId: "127f567d-f823-4bcc-bdf2-43557d583592",
                channel: "EMAIL",
                status: "FAILED",
                suppressReason: null,
                createdAt: health.checkedAt,
                terminalAt: health.checkedAt,
                attemptCount: 1,
                latestAttempt: {
                  id: "8a363e26-6074-408a-9551-418ef7fd9ed9",
                  attemptNumber: 1,
                  status: "FAILED_RETRYABLE",
                  errorCategory: "RETRYABLE",
                  errorCode: "SMTP.TIMEOUT",
                  attemptedAt: health.checkedAt,
                  completedAt: health.checkedAt,
                },
              },
            ],
            pagination,
          },
        }),
      ),
      renderToStaticMarkup(
        createElement(audit.AdminAuditView, {
          data: {
            items: [
              {
                id: "42",
                actor: { adminUserId: "48ef48ca-d316-42d7-a82c-585b6315769c" },
                action: "WP10B_SOURCE_URL_CORRECTED",
                entityType: "SOURCE",
                entityId: "30154504-e5f0-4a6d-86f4-07967471ef13",
                reason: "SOURCE_URL_CORRECTION_CONFIRMED",
                correlationId: "330573c1-5c95-46c7-a0b5-f8904802902e",
                metadata: {
                  sourceId: "30154504-e5f0-4a6d-86f4-07967471ef13",
                  changedFields: ["CANONICAL_URL"],
                },
                createdAt: health.checkedAt,
              },
            ],
            pagination,
          },
        }),
      ),
      renderToStaticMarkup(
        createElement(healthPage.AdminOperationsHealthView, {
          health,
          dataQuality: warnings,
        }),
      ),
    ];
    const combined = markups.join("\n");
    expect(combined).toContain("Inspection only");
    expect(combined).toContain("DEAD LETTER");
    expect(combined).toContain("Data quality");
    expect(combined).not.toMatch(/<button|<form|action=|method=/i);
    expect(combined).not.toMatch(
      /recipient@example|recipientHash|providerMessageId|payload|body context|SELECT secret|stack trace/i,
    );
  });

  it("renders one safe unavailable health bundle without throwing", async () => {
    const pages = await importPages();
    expect(pages).not.toBeNull();
    if (!pages) return;
    const healthPage = pages[4];
    const failingExecutor = {
      scope: "runtime",
      raw: async () => {
        throw new Error("database unavailable with secret SQL stack");
      },
      drizzle: {},
    } as unknown as DatabaseExecutor;
    const bundle = await healthPage.loadAdminOperationsHealthPageData(
      failingExecutor,
      new Date(health.checkedAt),
    );
    const markup = renderToStaticMarkup(
      createElement(healthPage.AdminOperationsHealthView, {
        health: bundle.health,
        dataQuality: bundle.dataQuality,
      }),
    );
    expect(markup).toContain("UNAVAILABLE");
    expect(markup).toContain("Evaluation unavailable");
    expect(markup).toContain("could not be evaluated safely");
    expect(markup).not.toMatch(/<button|<form|secret|sql|stack/i);
  });

  it("has no Operations API handlers, mutation imports, or public health-route drift", async () => {
    const apiFiles = await filesBelow(
      resolve(repositoryRoot, "app/api/admin/operations"),
    );
    expect(apiFiles).toEqual([]);

    for (const path of [
      "src/modules/admin/read-model/operations-query.server.ts",
      "src/modules/admin/read-model/data-quality-query.server.ts",
      "src/modules/admin/read-model/health-query.server.ts",
    ]) {
      const source = await readFile(resolve(repositoryRoot, path), "utf8");
      expect(source, path).not.toMatch(
        /\.update\(|\.insert\(|\.delete\(|TransactionManager/,
      );
      expect(source, path).not.toMatch(/\bselect\s+\*/i);
      if (path.endsWith("operations-query.server.ts")) {
        expect(source).not.toContain("afterData: auditLogs.afterData");
        expect(source).not.toContain("beforeData: auditLogs.beforeData");
      }
    }

    const publicHealth = await readFile(
      resolve(repositoryRoot, "app/api/health/route.ts"),
      "utf8",
    );
    expect(publicHealth).toBe(
      'import { NextResponse } from "next/server";\n\nexport function GET(): NextResponse {\n  return NextResponse.json({\n    status: "ok",\n    service: "admissionradar",\n  });\n}\n',
    );

    const adminHealthPage = await readFile(
      resolve(
        repositoryRoot,
        "app/admin/(protected)/operations/health/page.tsx",
      ),
      "utf8",
    );
    expect(adminHealthPage).not.toContain("getAdminDataQuality");
    expect(adminHealthPage.match(/getAdminHealthBundle\(/g)).toHaveLength(1);
  });
});
