import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  executeRehearsalStages,
  isSecondPassIdempotent,
} from "@/src/modules/production-preflight/rehearsal.server";

describe("WP-15A rehearsal orchestration", () => {
  it("runs migration and both deterministic backfill passes in locked order", async () => {
    const order: string[] = [];
    const result = await executeRehearsalStages({
      baseline: async () => {
        order.push("baseline");
        return { appliedMigrations: 4 };
      },
      migrate: async () => {
        order.push("migrate");
      },
      institution: async (pass) => {
        order.push(`institution-${pass}`);
        return {
          created: pass === 1 ? 2 : 0,
          linked: pass === 1 ? 2 : 0,
          skipped: pass === 1 ? 0 : 2,
        };
      },
      opportunity: async (pass) => {
        order.push(`opportunity-${pass}`);
        return {
          created: pass === 1 ? 3 : 0,
          linked: pass === 1 ? 3 : 0,
          skipped: pass === 1 ? 0 : 3,
        };
      },
      sourceBindings: async (pass) => {
        order.push(`source-${pass}`);
        return {
          institution: {
            inserted: pass === 1 ? 2 : 0,
            skipped: pass === 1 ? 0 : 2,
          },
          opportunity: {
            inserted: pass === 1 ? 1 : 0,
            skipped: pass === 1 ? 0 : 1,
          },
          notImported: 1,
        };
      },
      productSignals: async (point) => {
        order.push(`signals-${point}`);
        return {
          opportunityChanges: 0,
          notifications: 0,
          deliveries: 0,
          customerOutbox: 0,
        };
      },
      smoke: async () => {
        order.push("smoke");
        return { result: "PASS" as const };
      },
    });

    expect(order).toEqual([
      "baseline",
      "migrate",
      "signals-before",
      "institution-1",
      "opportunity-1",
      "source-1",
      "institution-2",
      "opportunity-2",
      "source-2",
      "signals-after",
      "smoke",
    ]);
    expect(isSecondPassIdempotent(result.secondPass)).toBe(true);
    expect(result.productSignalsUnchanged).toBe(true);
  });

  it("detects relationship drift on a non-idempotent second pass", () => {
    expect(
      isSecondPassIdempotent({
        institution: { created: 0, linked: 1, skipped: 0 },
        opportunity: { created: 0, linked: 0, skipped: 0 },
        sourceBindings: {
          institution: { inserted: 0, skipped: 0 },
          opportunity: { inserted: 0, skipped: 0 },
          notImported: 0,
        },
      }),
    ).toBe(false);
  });

  it("contains no live provider, worker claim, analytics, or cache client imports", async () => {
    const source = await readFile(
      join(
        process.cwd(),
        "src/modules/production-preflight/rehearsal.server.ts",
      ),
      "utf8",
    );
    for (const forbidden of [
      "resend-email-sender",
      "modules/worker",
      "claimOutbox",
      "ga4-server",
      "revalidation-client",
      "admin/http",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
