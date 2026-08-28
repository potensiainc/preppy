import { describe, expect, it } from "vitest";

import { parseHttpCollectorPolicy } from "@/src/modules/http-collector/contracts";
import type {
  StaticHttpFetchInput,
  StaticHttpFetchResult,
  StaticHttpTransport,
} from "@/src/modules/http-collector/http-transport.server";
import { createPoliteHttpTransport } from "@/src/modules/http-collector/politeness.server";

function success(url: string): StaticHttpFetchResult {
  return {
    ok: true,
    response: {
      requestedUrl: url,
      finalUrl: url,
      redirectChain: [],
      httpStatus: 200,
      contentType: "text/html",
      contentLengthHeader: "0",
      actualResponseBytes: 0,
      fetchedAt: new Date("2026-08-28T00:00:00.000Z"),
      elapsedMs: 0,
      etag: null,
      lastModified: null,
      entityBytes: Buffer.alloc(0),
    },
  };
}

describe("collector politeness transport", () => {
  it("enforces per-host sequential work and the configured global concurrency", async () => {
    let activeGlobal = 0;
    let maxGlobal = 0;
    const activeByHost = new Map<string, number>();
    let maxPerHost = 0;
    const releases: Array<() => void> = [];
    const delegate: StaticHttpTransport = {
      async fetch(input: StaticHttpFetchInput) {
        const host = new URL(input.url).host;
        activeGlobal += 1;
        maxGlobal = Math.max(maxGlobal, activeGlobal);
        const activeHost = (activeByHost.get(host) ?? 0) + 1;
        activeByHost.set(host, activeHost);
        maxPerHost = Math.max(maxPerHost, activeHost);
        await new Promise<void>((resolve) => releases.push(resolve));
        activeGlobal -= 1;
        activeByHost.set(host, activeHost - 1);
        return success(input.url);
      },
    };
    const transport = createPoliteHttpTransport({
      delegate,
      policy: parseHttpCollectorPolicy({
        globalConcurrency: 2,
        minimumHostDelayMs: 0,
      }),
    });
    const inputs = [
      "https://a.example.test/1",
      "https://a.example.test/2",
      "https://b.example.test/1",
      "https://c.example.test/1",
    ].map((url) =>
      transport.fetch({
        url,
        maxResponseBytes: 10,
        requestTimeoutMs: 100,
        connectTimeoutMs: 50,
        maxRedirects: 1,
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    while (releases.length > 0) {
      releases.shift()!();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    await Promise.all(inputs);
    expect(maxGlobal).toBe(2);
    expect(maxPerHost).toBe(1);
  });

  it("waits the minimum interval between starts for the same effective host", async () => {
    let clock = 0;
    const starts: number[] = [];
    const delegate: StaticHttpTransport = {
      async fetch(input) {
        starts.push(clock);
        return success(input.url);
      },
    };
    const transport = createPoliteHttpTransport({
      delegate,
      policy: parseHttpCollectorPolicy({ minimumHostDelayMs: 500 }),
      clockMs: () => clock,
      sleep: async (milliseconds) => {
        clock += milliseconds;
      },
    });
    const input = {
      maxResponseBytes: 10,
      requestTimeoutMs: 100,
      connectTimeoutMs: 50,
      maxRedirects: 1,
    } as const;
    await transport.fetch({ ...input, url: "https://school.example.test/one" });
    await transport.fetch({ ...input, url: "https://school.example.test/two" });
    expect(starts).toEqual([0, 500]);
  });
});
