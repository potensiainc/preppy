import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import {
  DEFAULT_HTTP_COLLECTOR_POLICY,
  type HttpCollectorPolicy,
} from "@/src/modules/http-collector/contracts";
import { collectExplicitSources } from "@/src/modules/http-collector/service.server";

describe("HTTP collector service policy boundary", () => {
  it.each([
    ["maxDepth", 3],
    ["maxPagesPerInstitution", 31],
    ["maxResponseBytesPerPage", 2 * 1024 * 1024 + 1],
    ["maxTotalBytesPerRun", 20 * 1024 * 1024 + 1],
    ["requestTimeoutMs", 30_001],
    ["maxRedirects", 6],
    ["globalConcurrency", 5],
  ] as const)(
    "rejects a runtime %s upper-bound bypass before database or network actions",
    async (key, value) => {
      let databaseActions = 0;
      let networkActions = 0;
      const query = {
        from: () => query,
        innerJoin: () => query,
        leftJoin: () => query,
        where: async () => [],
      };
      const policy = {
        ...DEFAULT_HTTP_COLLECTOR_POLICY,
        [key]: value,
      } as HttpCollectorPolicy;

      await expect(
        collectExplicitSources(
          {
            sourceIds: ["11111111-1111-4111-8111-111111111111"],
            mode: "dry-run",
            policy,
          },
          {
            executor: {
              scope: "runtime",
              drizzle: {
                select: () => {
                  databaseActions += 1;
                  return query;
                },
              },
            } as never,
            transactionManager: {
              run: async () => {
                databaseActions += 1;
                throw new Error("unexpected transaction");
              },
            } as never,
            baseTransport: {
              fetch: async () => {
                networkActions += 1;
                throw new Error("unexpected network request");
              },
            },
          },
        ),
      ).rejects.toBeInstanceOf(ZodError);
      expect(databaseActions).toBe(0);
      expect(networkActions).toBe(0);
    },
  );
});
