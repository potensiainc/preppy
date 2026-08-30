import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { parseHttpCollectorPolicy } from "@/src/modules/http-collector/contracts";
import { crawlOfficialMainRoot } from "@/src/modules/http-collector/crawler.server";
import { createNodeHttpTransport } from "@/src/modules/http-collector/http-transport.server";
import { createRobotsPolicy } from "@/src/modules/http-collector/robots.server";
import {
  startHttpCollectorFixture,
  type HttpCollectorFixture,
} from "@/tests/support/http-collector-fixture";

describe("bounded same-domain collector crawl", () => {
  let fixture: HttpCollectorFixture;

  beforeAll(async () => {
    fixture = await startHttpCollectorFixture((request, response) => {
      const path = request.url ?? "/";
      if (path === "/robots.txt") {
        response
          .writeHead(200, { "content-type": "text/plain" })
          .end(
            "User-agent: *\nDisallow: /blocked\nDisallow: /blocked-dest\nAllow: /\n",
          );
        return;
      }
      if (path === "/redirect-www") {
        response
          .writeHead(302, {
            location: `http://www.school.fixture.test:${fixture.port}/blocked-dest`,
          })
          .end();
        return;
      }
      if (path === "/redirect-www-allowed") {
        response
          .writeHead(302, {
            location: `http://www.school.fixture.test:${fixture.port}/allowed-dest`,
          })
          .end("redirect evidence");
        return;
      }
      if (path === "/root") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" })
          .end(`
          <h1>학교 안내</h1>
          <a href="/a#one">First A</a>
          <a href="/a#two">Duplicate A</a>
          <a href="/admissions">입학안내</a>
          <a href="/blocked">Blocked</a>
          <a href="/login">Login</a>
          <a href="/logout">Logout</a>
          <a href="#section">Fragment</a>
          <a href="mailto:office@school.test">Email</a>
          <a href="http://external.fixture.test:${fixture.port}/outside">Outside</a>
        `);
        return;
      }
      if (path === "/a") {
        response
          .writeHead(200, { "content-type": "text/html" })
          .end('<p>A page</p><a href="/depth2">Curriculum</a>');
        return;
      }
      if (path === "/admissions") {
        response
          .writeHead(200, { "content-type": "text/html" })
          .end('<p>Admissions page</p><a href="/depth2">Next</a>');
        return;
      }
      if (path === "/depth2") {
        response
          .writeHead(200, { "content-type": "text/html" })
          .end('<p>Depth two</p><a href="/depth3">Too deep</a>');
        return;
      }
      response
        .writeHead(200, { "content-type": "text/html" })
        .end("<p>Other</p>");
    });
  });

  afterAll(async () => {
    await fixture.close();
  });

  function dependencies(policyOverrides: Record<string, number> = {}) {
    const policy = parseHttpCollectorPolicy({
      minimumHostDelayMs: 0,
      ...policyOverrides,
    });
    const transport = createNodeHttpTransport({
      resolver: async () => [{ address: "127.0.0.1", family: 4 }],
      assertAddressSafe: () => undefined,
      now: () => new Date("2026-08-28T01:02:03.000Z"),
    });
    return {
      policy,
      transport,
      robots: createRobotsPolicy({ transport, policy }),
      now: () => new Date("2026-08-28T01:02:03.000Z"),
      sleep: async () => undefined,
    };
  }

  it("persists one root-ready hash result while crawling candidate pages ephemerally", async () => {
    const result = await crawlOfficialMainRoot(
      {
        sourceId: "00000000-0000-4000-8000-000000000001",
        institutionId: "00000000-0000-4000-8000-000000000002",
        requestedUrl: `http://school.fixture.test:${fixture.port}/root`,
      },
      dependencies(),
    );
    expect(result.root).toMatchObject({
      kind: "SUCCESS",
      response: {
        httpStatus: 200,
        finalUrl: `http://school.fixture.test:${fixture.port}/root`,
      },
      contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      textHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      normalizedText: expect.stringContaining("학교 안내"),
    });
    expect(result.pagesFetched).toBeGreaterThan(1);
    expect(
      result.candidates.some((candidate) =>
        candidate.normalizedUrl.endsWith("/depth2"),
      ),
    ).toBe(true);
    expect(result).not.toHaveProperty("candidateSnapshots");
    expect(result).not.toHaveProperty("candidateObservations");
  });

  it("optionally exposes fetched pages in memory without changing the crawl result contract", async () => {
    const pages: Array<{
      depth: number;
      finalUrl: string;
      normalizedText: string | null;
    }> = [];
    const result = await crawlOfficialMainRoot(
      {
        sourceId: "00000000-0000-4000-8000-000000000001",
        institutionId: "00000000-0000-4000-8000-000000000002",
        requestedUrl: `http://school.fixture.test:${fixture.port}/root`,
      },
      {
        ...dependencies(),
        onFetchedPage: (page) => {
          pages.push({
            depth: page.depth,
            finalUrl: page.response.finalUrl,
            normalizedText: page.normalizedText,
          });
        },
      },
    );

    expect(pages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          depth: 0,
          finalUrl: expect.stringMatching(/\/root$/),
          normalizedText: expect.stringContaining("학교 안내"),
        }),
        expect.objectContaining({
          depth: 1,
          finalUrl: expect.stringMatching(/\/admissions$/),
          normalizedText: expect.stringContaining("Admissions page"),
        }),
      ]),
    );
    expect(result).not.toHaveProperty("pages");
  });

  it("deduplicates fragments and rejects external, login, fragment-only, unsupported, and robots-blocked links", async () => {
    const before = fixture.requests.length;
    const result = await crawlOfficialMainRoot(
      {
        sourceId: "00000000-0000-4000-8000-000000000001",
        institutionId: "00000000-0000-4000-8000-000000000002",
        requestedUrl: `http://school.fixture.test:${fixture.port}/root`,
      },
      dependencies(),
    );
    const reasons = result.candidates.map(
      (candidate) => candidate.reasonSelectedOrRejected,
    );
    expect(reasons).toEqual(
      expect.arrayContaining([
        "DUPLICATE_URL",
        "EXTERNAL_DOMAIN",
        "LOGIN_LOGOUT_EXCLUDED",
        "FRAGMENT_ONLY",
        "UNSUPPORTED_SCHEME",
        "ROBOTS_BLOCKED",
      ]),
    );
    const requests = fixture.requests
      .slice(before)
      .map((request) => request.url);
    expect(requests).not.toContain("/blocked");
    expect(requests).not.toContain("/login");
    expect(requests).not.toContain("/outside");
    const aCandidates = result.candidates.filter((candidate) =>
      candidate.normalizedUrl.endsWith("/a"),
    );
    expect(aCandidates).toHaveLength(2);
    expect(
      aCandidates.map((candidate) => candidate.reasonSelectedOrRejected),
    ).toEqual(["FETCHED", "DUPLICATE_URL"]);
  });

  it("stops scheduling at the page budget and records the bounded outcome", async () => {
    const result = await crawlOfficialMainRoot(
      {
        sourceId: "00000000-0000-4000-8000-000000000001",
        institutionId: "00000000-0000-4000-8000-000000000002",
        requestedUrl: `http://school.fixture.test:${fixture.port}/root`,
      },
      dependencies({ maxPagesPerInstitution: 2 }),
    );
    expect(result.pagesScheduled).toBe(2);
    expect(result.budgetOutcomes).toContain("PAGE_BUDGET_EXCEEDED");
    expect(
      result.candidates.some(
        (candidate) =>
          candidate.reasonSelectedOrRejected === "PAGE_BUDGET_EXCEEDED",
      ),
    ).toBe(true);
  });

  it("optionally prioritizes high-value candidates within the page budget", async () => {
    const result = await crawlOfficialMainRoot(
      {
        sourceId: "00000000-0000-4000-8000-000000000001",
        institutionId: "00000000-0000-4000-8000-000000000002",
        requestedUrl: `http://school.fixture.test:${fixture.port}/root`,
      },
      {
        ...dependencies({ maxPagesPerInstitution: 2 }),
        candidatePriority: (candidate) =>
          candidate.classificationHint === "ADMISSIONS" ? 100 : 0,
      },
    );

    expect(
      result.candidates.find((candidate) =>
        candidate.normalizedUrl.endsWith("/admissions"),
      )?.reasonSelectedOrRejected,
    ).toBe("FETCHED");
    expect(
      result.candidates.find((candidate) =>
        candidate.normalizedUrl.endsWith("/a"),
      )?.reasonSelectedOrRejected,
    ).toBe("PAGE_BUDGET_EXCEEDED");
  });

  it("does not fetch beyond max depth and records depth-limit candidates", async () => {
    const result = await crawlOfficialMainRoot(
      {
        sourceId: "00000000-0000-4000-8000-000000000001",
        institutionId: "00000000-0000-4000-8000-000000000002",
        requestedUrl: `http://school.fixture.test:${fixture.port}/root`,
      },
      dependencies({ maxDepth: 1 }),
    );
    expect(result.budgetOutcomes).toContain("DEPTH_LIMIT_REACHED");
    expect(
      result.candidates.some(
        (candidate) =>
          candidate.discoveryDepth === 2 &&
          candidate.reasonSelectedOrRejected === "DEPTH_LIMIT_REACHED",
      ),
    ).toBe(true);
  });

  it("enforces total decoded-byte and per-page link budgets", async () => {
    const linkLimited = await crawlOfficialMainRoot(
      {
        sourceId: "00000000-0000-4000-8000-000000000001",
        institutionId: "00000000-0000-4000-8000-000000000002",
        requestedUrl: `http://school.fixture.test:${fixture.port}/root`,
      },
      dependencies({ maxLinksPerPage: 2 }),
    );
    expect(linkLimited.budgetOutcomes).toContain("LINK_LIMIT_REACHED");
    expect(
      linkLimited.candidates.filter((candidate) =>
        candidate.sourcePageUrl.endsWith("/root"),
      ),
    ).toHaveLength(2);

    const rootBytes = Buffer.byteLength(`
          <h1>학교 안내</h1>
          <a href="/a#one">First A</a>
          <a href="/a#two">Duplicate A</a>
          <a href="/admissions">입학안내</a>
          <a href="/blocked">Blocked</a>
          <a href="/login">Login</a>
          <a href="/logout">Logout</a>
          <a href="#section">Fragment</a>
          <a href="mailto:office@school.test">Email</a>
          <a href="http://external.fixture.test:${fixture.port}/outside">Outside</a>
        `);
    const byteLimited = await crawlOfficialMainRoot(
      {
        sourceId: "00000000-0000-4000-8000-000000000001",
        institutionId: "00000000-0000-4000-8000-000000000002",
        requestedUrl: `http://school.fixture.test:${fixture.port}/root`,
      },
      dependencies({
        maxResponseBytesPerPage: rootBytes + 5,
        maxTotalBytesPerRun: rootBytes + 5,
      }),
    );
    expect(byteLimited.budgetOutcomes).toContain("BYTE_BUDGET_EXCEEDED");
    expect(
      byteLimited.candidates.some(
        (candidate) =>
          candidate.reasonSelectedOrRejected === "BYTE_BUDGET_EXCEEDED",
      ),
    ).toBe(true);
  });

  it("checks the actual redirect origin robots policy before fetching its body", async () => {
    const before = fixture.requests.length;
    const result = await crawlOfficialMainRoot(
      {
        sourceId: "00000000-0000-4000-8000-000000000001",
        institutionId: "00000000-0000-4000-8000-000000000002",
        requestedUrl: `http://school.fixture.test:${fixture.port}/redirect-www`,
      },
      dependencies(),
    );
    expect(result.root).toMatchObject({
      kind: "FAILURE",
      code: "ROBOTS_BLOCKED",
    });
    const requests = fixture.requests.slice(before);
    expect(
      requests.some(
        (request) =>
          request.host.startsWith("www.school.") &&
          request.url === "/robots.txt",
      ),
    ).toBe(true);
    expect(requests.some((request) => request.url === "/blocked-dest")).toBe(
      false,
    );
  });

  it("retains bounded ordered robots evidence for every effective root origin", async () => {
    const result = await crawlOfficialMainRoot(
      {
        sourceId: "00000000-0000-4000-8000-000000000001",
        institutionId: "00000000-0000-4000-8000-000000000002",
        requestedUrl: `http://school.fixture.test:${fixture.port}/redirect-www-allowed`,
      },
      dependencies(),
    );
    expect(result.root).toMatchObject({ kind: "SUCCESS" });
    expect(result.root.robotsDecisions).toEqual([
      expect.objectContaining({
        origin: `http://school.fixture.test:${fixture.port}`,
        decision: "ALLOW",
      }),
      expect.objectContaining({
        origin: `http://www.school.fixture.test:${fixture.port}`,
        decision: "ALLOW",
      }),
    ]);
    expect(result.root.robotsDecisions).toHaveLength(2);
  });
});
