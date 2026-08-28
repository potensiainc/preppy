import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { parseHttpCollectorPolicy } from "@/src/modules/http-collector/contracts";
import { createNodeHttpTransport } from "@/src/modules/http-collector/http-transport.server";
import { assertSafeAddress } from "@/src/modules/http-collector/network-safety.server";
import { createRobotsPolicy } from "@/src/modules/http-collector/robots.server";
import {
  startHttpCollectorFixture,
  type HttpCollectorFixture,
} from "@/tests/support/http-collector-fixture";

describe("collector robots policy", () => {
  let fixture: HttpCollectorFixture;

  beforeAll(async () => {
    fixture = await startHttpCollectorFixture((request, response) => {
      const host = request.headers.host ?? "";
      const path = request.url ?? "";
      if (path === "/robots-redirect-private") {
        response
          .writeHead(302, {
            location: "http://private.fixture.test/robots.txt",
          })
          .end();
        return;
      }
      if (path !== "/robots.txt") {
        response.writeHead(200, { "content-type": "text/html" }).end("target");
        return;
      }
      if (host.startsWith("www.")) {
        response
          .writeHead(200, { "content-type": "text/plain" })
          .end("User-agent: *\nAllow: /\n");
        return;
      }
      const scenario = host.split(".", 1)[0]?.replace("status", "");
      if (scenario === "404" || scenario === "410") {
        response.writeHead(Number(scenario)).end();
        return;
      }
      if (scenario === "401" || scenario === "403" || scenario === "500") {
        response.writeHead(Number(scenario)).end();
        return;
      }
      if (host.startsWith("slow.")) {
        setTimeout(
          () => response.writeHead(200).end("User-agent: *\nAllow: /"),
          150,
        );
        return;
      }
      response
        .writeHead(200, { "content-type": "text/plain" })
        .end(
          "User-agent: PREPPY-Static-Collector\nDisallow: /private\nAllow: /\n",
        );
    });
  });

  afterAll(async () => {
    await fixture.close();
  });

  function policy(timeoutMs = 1_000) {
    const transport = createNodeHttpTransport({
      resolver: async () => [{ address: "127.0.0.1", family: 4 }],
      assertAddressSafe: () => undefined,
    });
    return createRobotsPolicy({
      transport,
      policy: parseHttpCollectorPolicy({
        requestTimeoutMs: timeoutMs,
        connectTimeoutMs: Math.min(timeoutMs, 500),
        minimumHostDelayMs: 0,
      }),
    });
  }

  function runBudget(maximumBytes: number) {
    let consumedBytes = 0;
    return {
      maximumBytes,
      get consumedBytes() {
        return consumedBytes;
      },
      get remainingBytes() {
        return Math.max(0, maximumBytes - consumedBytes);
      },
      get exhausted() {
        return consumedBytes >= maximumBytes;
      },
      get exceeded() {
        return consumedBytes > maximumBytes;
      },
      charge(decodedBytes: number) {
        consumedBytes += decodedBytes;
      },
    };
  }

  it("charges decoded robots bytes to the shared run budget", async () => {
    const ledger = runBudget(1_024);
    const transport = createNodeHttpTransport({
      resolver: async () => [{ address: "127.0.0.1", family: 4 }],
      assertAddressSafe: () => undefined,
    });
    const robots = createRobotsPolicy({
      transport,
      policy: parseHttpCollectorPolicy({ minimumHostDelayMs: 0 }),
      runBudget: ledger,
    });
    const origin = `http://budget.fixture.test:${fixture.port}`;
    await expect(robots.evaluate(`${origin}/public`)).resolves.toMatchObject({
      decision: "ALLOW",
    });
    expect(ledger.consumedBytes).toBe(
      Buffer.byteLength(
        "User-agent: PREPPY-Static-Collector\nDisallow: /private\nAllow: /\n",
      ),
    );
  });

  it("parses allow/disallow rules and caches by exact effective origin", async () => {
    const robots = policy();
    const schoolOrigin = `http://school.fixture.test:${fixture.port}`;
    const wwwOrigin = `http://www.school.fixture.test:${fixture.port}`;

    await expect(
      robots.evaluate(`${schoolOrigin}/public`),
    ).resolves.toMatchObject({
      decision: "ALLOW",
      origin: schoolOrigin,
      robotsHttpStatus: 200,
    });
    await expect(
      robots.evaluate(`${schoolOrigin}/private/form`),
    ).resolves.toMatchObject({
      decision: "ROBOTS_BLOCKED",
      errorCode: "ROBOTS_BLOCKED",
    });
    await expect(
      robots.evaluate(`${wwwOrigin}/private/form`),
    ).resolves.toMatchObject({
      decision: "ALLOW",
      origin: wwwOrigin,
    });

    const robotsRequests = fixture.requests.filter(
      (request) => request.url === "/robots.txt",
    );
    expect(
      robotsRequests.filter((request) => request.host.startsWith("school.")),
    ).toHaveLength(1);
    expect(
      robotsRequests.filter((request) => request.host.startsWith("www.")),
    ).toHaveLength(1);
  });

  it.each([404, 410])(
    "treats robots %s as unavailable-but-allow",
    async (status) => {
      const origin = `http://status${status}.fixture.test:${fixture.port}`;
      const decision = await policy().evaluate(`${origin}/target`);
      expect(decision).toMatchObject({
        decision: "ALLOW",
        reason: "ROBOTS_UNAVAILABLE_ALLOW",
        robotsHttpStatus: status,
      });
    },
  );

  it.each([401, 403, 500])(
    "blocks for review when robots returns %s",
    async (status) => {
      const origin = `http://status${status}.fixture.test:${fixture.port}`;
      await expect(
        policy().evaluate(`${origin}/target`),
      ).resolves.toMatchObject({
        decision: "ROBOTS_UNAVAILABLE_REVIEW_REQUIRED",
        errorCode: "ROBOTS_UNAVAILABLE_REVIEW_REQUIRED",
        robotsHttpStatus: status,
      });
    },
  );

  it("blocks for review when robots times out", async () => {
    const origin = `http://slow.fixture.test:${fixture.port}`;
    await expect(
      policy(30).evaluate(`${origin}/target`),
    ).resolves.toMatchObject({
      decision: "ROBOTS_UNAVAILABLE_REVIEW_REQUIRED",
      errorCode: "ROBOTS_UNAVAILABLE_REVIEW_REQUIRED",
      transportErrorCode: "READ_TIMEOUT",
    });
  });

  it("applies SSRF validation to a robots redirect destination", async () => {
    const transport = createNodeHttpTransport({
      resolver: async (hostname) => [
        hostname === "private.fixture.test"
          ? { address: "10.0.0.8", family: 4 }
          : { address: "127.0.0.1", family: 4 },
      ],
      assertAddressSafe: (address) => {
        if (address === "127.0.0.1") return;
        assertSafeAddress(address);
      },
    });
    const robots = createRobotsPolicy({
      transport,
      policy: parseHttpCollectorPolicy({ minimumHostDelayMs: 0 }),
      robotsPath: "/robots-redirect-private",
    });
    await expect(
      robots.evaluate(`http://school.fixture.test:${fixture.port}/target`),
    ).resolves.toMatchObject({
      decision: "ROBOTS_UNAVAILABLE_REVIEW_REQUIRED",
      transportErrorCode: "SSRF_BLOCKED",
    });
    expect(
      fixture.requests.some((request) => request.host.startsWith("private.")),
    ).toBe(false);
  });
});
