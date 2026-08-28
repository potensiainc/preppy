import { brotliCompressSync, deflateSync, gzipSync } from "node:zlib";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, relative } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createNodeHttpTransport } from "@/src/modules/http-collector/http-transport.server";
import {
  assertSafeAddress,
  type DnsResolver,
} from "@/src/modules/http-collector/network-safety.server";
import {
  startHttpCollectorFixture,
  startHttpsCollectorFixture,
  type HttpCollectorFixture,
} from "@/tests/support/http-collector-fixture";
import {
  createEphemeralTlsMaterial,
  type EphemeralTlsMaterial,
} from "@/tests/support/ephemeral-tls-material";

const fixtureResolver: DnsResolver = async () => [
  { address: "127.0.0.1", family: 4 },
];

describe("ephemeral HTTPS fixture material", () => {
  it("stores TLS material under the OS temp directory and removes it on cleanup", async () => {
    const material = await createEphemeralTlsMaterial();
    const paths = [
      material.caCertificatePath,
      material.caPrivateKeyPath,
      material.certificatePath,
      material.privateKeyPath,
    ];

    try {
      expect(relative(tmpdir(), material.directory)).not.toMatch(
        /^(?:\.\.(?:[\\/]|$)|[\\/])/,
      );
      expect(paths.every(existsSync)).toBe(true);
      expect(paths.every((path) => dirname(path) === material.directory)).toBe(
        true,
      );
    } finally {
      await material.cleanup();
    }

    expect(existsSync(material.directory)).toBe(false);
  });
});

describe("pinned static HTTP transport", () => {
  let fixture!: HttpCollectorFixture;
  let httpsFixture!: HttpCollectorFixture;
  let tlsMaterial!: EphemeralTlsMaterial;

  beforeAll(async () => {
    try {
      fixture = await startHttpCollectorFixture((request, response) => {
        const path = request.url ?? "/";
        const base = `http://school.fixture.test:${fixture.port}`;
        if (path === "/redirect") {
          response.writeHead(302, { location: "/ok" }).end();
          return;
        }
        if (path === "/redirect-body") {
          response.writeHead(302, { location: "/ok" }).end("redirect-body");
          return;
        }
        if (path === "/external") {
          response
            .writeHead(302, {
              location: `http://external.fixture.test:${fixture.port}/never`,
            })
            .end();
          return;
        }
        if (path === "/redirect-private") {
          response
            .writeHead(302, {
              location: `http://private.fixture.test:${fixture.port}/never`,
            })
            .end();
          return;
        }
        if (path === "/loop-a") {
          response.writeHead(302, { location: `${base}/loop-b` }).end();
          return;
        }
        if (path === "/loop-b") {
          response.writeHead(302, { location: `${base}/loop-a` }).end();
          return;
        }
        if (path === "/slow") {
          setTimeout(() => response.writeHead(200).end("late"), 150);
          return;
        }
        if (path === "/slow-after-chunk") {
          response.writeHead(200, { "content-type": "text/html" });
          response.write("partial");
          setTimeout(() => response.end("late"), 150);
          return;
        }
        if (path === "/too-large") {
          response
            .writeHead(200, {
              "content-type": "text/html",
              "content-length": "20",
            })
            .end("01234567890123456789");
          return;
        }
        if (path === "/stream-too-large") {
          response.writeHead(200, { "content-type": "text/html" });
          response.write("01234567890123456789012345678901");
          response.end();
          return;
        }
        if (path === "/gzip-bomb") {
          const encoded = gzipSync(Buffer.alloc(4_096, "a"), { level: 9 });
          response.writeHead(200, {
            "content-type": "text/html",
            "content-encoding": "gzip",
          });
          response.write(encoded);
          response.end();
          return;
        }
        if (path === "/corrupt-gzip") {
          const encoded = gzipSync(Buffer.alloc(4_096, "b"), { level: 1 });
          response.writeHead(200, {
            "content-type": "text/html",
            "content-encoding": "gzip",
          });
          response.end(encoded.subarray(0, encoded.length - 4));
          return;
        }
        if (path === "/gzip" || path === "/br" || path === "/deflate") {
          const entity = Buffer.from("<p>decoded entity</p>");
          const encoded =
            path === "/gzip"
              ? gzipSync(entity)
              : path === "/br"
                ? brotliCompressSync(entity)
                : deflateSync(entity);
          response
            .writeHead(200, {
              "content-type": "text/html; charset=utf-8",
              "content-encoding": path.slice(1),
              "content-length": String(encoded.length),
              etag: '"fixture-etag"',
              "last-modified": "Wed, 21 Oct 2015 07:28:00 GMT",
            })
            .end(encoded);
          return;
        }
        if (path === "/status/404") {
          response
            .writeHead(404, { "content-type": "text/html" })
            .end("missing");
          return;
        }
        if (path === "/status/500") {
          response
            .writeHead(500, { "content-type": "text/plain" })
            .end("failure");
          return;
        }
        if (path === "/pdf") {
          response
            .writeHead(200, { "content-type": "application/pdf" })
            .end("%PDF");
          return;
        }
        response
          .writeHead(200, { "content-type": "text/html; charset=utf-8" })
          .end("<html><body>fixture root</body></html>");
      });
      tlsMaterial = await createEphemeralTlsMaterial();
      httpsFixture = await startHttpsCollectorFixture(
        (_request, response) => {
          response
            .writeHead(200, { "content-type": "text/html; charset=utf-8" })
            .end("<p>secure fixture</p>");
        },
        { key: tlsMaterial.privateKey, cert: tlsMaterial.certificate },
      );
    } catch (error) {
      await Promise.allSettled([
        fixture?.close() ?? Promise.resolve(),
        httpsFixture?.close() ?? Promise.resolve(),
      ]);
      await tlsMaterial?.cleanup();
      throw error;
    }
  });

  afterAll(async () => {
    try {
      await Promise.all([
        fixture?.close() ?? Promise.resolve(),
        httpsFixture?.close() ?? Promise.resolve(),
      ]);
    } finally {
      await tlsMaterial?.cleanup();
    }
  });

  function transport() {
    return createNodeHttpTransport({
      resolver: fixtureResolver,
      assertAddressSafe: () => undefined,
      now: () => new Date("2026-08-28T00:00:00.000Z"),
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

  it("pins the vetted fixture address while preserving the original HTTP Host", async () => {
    const result = await transport().fetch({
      url: `http://school.fixture.test:${fixture.port}/ok`,
      maxResponseBytes: 1024,
      requestTimeoutMs: 1_000,
      connectTimeoutMs: 500,
      maxRedirects: 5,
    });
    expect(result).toMatchObject({
      ok: true,
      response: {
        requestedUrl: `http://school.fixture.test:${fixture.port}/ok`,
        finalUrl: `http://school.fixture.test:${fixture.port}/ok`,
        redirectChain: [],
        httpStatus: 200,
        contentType: "text/html; charset=utf-8",
        actualResponseBytes: 38,
        fetchedAt: new Date("2026-08-28T00:00:00.000Z"),
      },
    });
    expect(result.ok && result.response.entityBytes.toString()).toBe(
      "<html><body>fixture root</body></html>",
    );
    expect(fixture.requests.at(-1)).toEqual({
      method: "GET",
      url: "/ok",
      host: `school.fixture.test:${fixture.port}`,
    });
  });

  it("pins HTTPS to the vetted IP while preserving Host, SNI, and certificate hostname verification", async () => {
    const secure = createNodeHttpTransport({
      resolver: fixtureResolver,
      assertAddressSafe: () => undefined,
      tlsCa: tlsMaterial.caCertificate,
    });
    const accepted = await secure.fetch({
      url: `https://school.fixture.test:${httpsFixture.port}/secure`,
      maxResponseBytes: 1024,
      requestTimeoutMs: 1_000,
      connectTimeoutMs: 500,
      maxRedirects: 1,
    });
    expect(accepted).toMatchObject({
      ok: true,
      response: {
        finalUrl: `https://school.fixture.test:${httpsFixture.port}/secure`,
      },
    });
    expect(httpsFixture.requests.at(-1)).toEqual({
      method: "GET",
      url: "/secure",
      host: `school.fixture.test:${httpsFixture.port}`,
    });
    expect(httpsFixture.tlsServerNames).toContain("school.fixture.test");

    const rejected = await secure.fetch({
      url: `https://other.fixture.test:${httpsFixture.port}/secure`,
      maxResponseBytes: 1024,
      requestTimeoutMs: 1_000,
      connectTimeoutMs: 500,
      maxRedirects: 1,
    });
    expect(rejected).toMatchObject({
      ok: false,
      failure: { code: "TLS_ERROR" },
    });
    expect(httpsFixture.tlsServerNames).toContain("other.fixture.test");
  });

  it("records a same-domain redirect chain and fetches the destination", async () => {
    const result = await transport().fetch({
      url: `http://school.fixture.test:${fixture.port}/redirect`,
      maxResponseBytes: 1024,
      requestTimeoutMs: 1_000,
      connectTimeoutMs: 500,
      maxRedirects: 5,
    });
    expect(result).toMatchObject({
      ok: true,
      response: {
        finalUrl: `http://school.fixture.test:${fixture.port}/ok`,
        redirectChain: [
          {
            status: 302,
            url: `http://school.fixture.test:${fixture.port}/redirect`,
            location: "/ok",
            nextUrl: `http://school.fixture.test:${fixture.port}/ok`,
          },
        ],
      },
    });
  });

  it("charges decoded intermediate redirect bodies to the shared run budget", async () => {
    const ledger = runBudget(1_024);
    const result = await transport().fetch({
      url: `http://school.fixture.test:${fixture.port}/redirect-body`,
      maxResponseBytes: 1_024,
      requestTimeoutMs: 1_000,
      connectTimeoutMs: 500,
      maxRedirects: 5,
      runBudget: ledger,
    });
    expect(result).toMatchObject({ ok: true });
    expect(ledger.consumedBytes).toBe(
      Buffer.byteLength("redirect-body") +
        Buffer.byteLength("<html><body>fixture root</body></html>"),
    );
  });

  it("does not request an external redirect destination", async () => {
    const before = fixture.requests.length;
    const result = await transport().fetch({
      url: `http://school.fixture.test:${fixture.port}/external`,
      maxResponseBytes: 1024,
      requestTimeoutMs: 1_000,
      connectTimeoutMs: 500,
      maxRedirects: 5,
    });
    expect(result).toMatchObject({
      ok: false,
      failure: {
        code: "REDIRECT_EXTERNAL_HOST",
        redirectChain: [expect.any(Object)],
      },
    });
    expect(
      fixture.requests.slice(before).map((request) => request.url),
    ).toEqual(["/external"]);
  });

  it("revalidates and blocks a redirect destination that resolves private", async () => {
    const before = fixture.requests.length;
    const privateAware = createNodeHttpTransport({
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
    const result = await privateAware.fetch({
      url: `http://school.fixture.test:${fixture.port}/redirect-private`,
      maxResponseBytes: 1024,
      requestTimeoutMs: 1_000,
      connectTimeoutMs: 500,
      maxRedirects: 5,
    });
    expect(result).toMatchObject({
      ok: false,
      failure: { code: "SSRF_BLOCKED" },
    });
    expect(
      fixture.requests.slice(before).map((request) => request.url),
    ).toEqual(["/redirect-private"]);
  });

  it("bounds DNS resolution inside the request timeout", async () => {
    const hanging = createNodeHttpTransport({
      resolver: async () => new Promise(() => undefined),
    });
    const result = await Promise.race([
      hanging.fetch({
        url: "https://dns-timeout.example.test/",
        maxResponseBytes: 1024,
        requestTimeoutMs: 30,
        connectTimeoutMs: 20,
        maxRedirects: 5,
      }),
      new Promise<"HUNG">((resolve) => setTimeout(() => resolve("HUNG"), 200)),
    ]);
    expect(result).not.toBe("HUNG");
    expect(result).toMatchObject({
      ok: false,
      failure: { code: "DNS_ERROR", message: "DNS resolution timed out" },
    });
  });

  it("bounds redirect loops", async () => {
    const result = await transport().fetch({
      url: `http://school.fixture.test:${fixture.port}/loop-a`,
      maxResponseBytes: 1024,
      requestTimeoutMs: 1_000,
      connectTimeoutMs: 500,
      maxRedirects: 2,
    });
    expect(result).toMatchObject({
      ok: false,
      failure: { code: "TOO_MANY_REDIRECTS" },
    });
    expect(!result.ok && result.failure.redirectChain).toHaveLength(3);
  });

  it.each(["gzip", "br", "deflate"])(
    "hashes and stores decoded %s entity bytes rather than transfer bytes",
    async (encoding) => {
      const result = await transport().fetch({
        url: `http://school.fixture.test:${fixture.port}/${encoding}`,
        maxResponseBytes: 1024,
        requestTimeoutMs: 1_000,
        connectTimeoutMs: 500,
        maxRedirects: 5,
      });
      expect(result).toMatchObject({
        ok: true,
        response: {
          contentType: "text/html; charset=utf-8",
          actualResponseBytes: 21,
          etag: '"fixture-etag"',
          lastModified: "Wed, 21 Oct 2015 07:28:00 GMT",
        },
      });
      expect(result.ok && result.response.entityBytes.toString()).toBe(
        "<p>decoded entity</p>",
      );
    },
  );

  it("rejects a response declared larger than the entity budget", async () => {
    await expect(
      transport().fetch({
        url: `http://school.fixture.test:${fixture.port}/too-large`,
        maxResponseBytes: 10,
        requestTimeoutMs: 1_000,
        connectTimeoutMs: 500,
        maxRedirects: 5,
      }),
    ).resolves.toMatchObject({
      ok: false,
      failure: { code: "RESPONSE_TOO_LARGE" },
    });
  });

  it("charges partial decoded bytes when a chunked response exceeds the page limit", async () => {
    const ledger = runBudget(1_024);
    const result = await transport().fetch({
      url: `http://school.fixture.test:${fixture.port}/stream-too-large`,
      maxResponseBytes: 10,
      requestTimeoutMs: 1_000,
      connectTimeoutMs: 500,
      maxRedirects: 1,
      runBudget: ledger,
    });
    expect(result).toMatchObject({
      ok: false,
      failure: {
        code: "RESPONSE_TOO_LARGE",
        actualResponseBytes: 32,
      },
    });
    expect(ledger.consumedBytes).toBe(32);
  });

  it("bounds a chunked compressed decompression bomb and charges decoded work", async () => {
    const ledger = runBudget(10_000);
    const result = await transport().fetch({
      url: `http://school.fixture.test:${fixture.port}/gzip-bomb`,
      maxResponseBytes: 1_024,
      requestTimeoutMs: 1_000,
      connectTimeoutMs: 500,
      maxRedirects: 1,
      runBudget: ledger,
    });
    expect(result).toMatchObject({
      ok: false,
      failure: { code: "RESPONSE_TOO_LARGE" },
    });
    expect(!result.ok && result.failure.actualResponseBytes).toBeGreaterThan(
      1_024,
    );
    expect(ledger.consumedBytes).toBe(
      !result.ok ? result.failure.actualResponseBytes : -1,
    );
  });

  it("aborts deterministically when decoded work exceeds the shared run budget", async () => {
    const ledger = runBudget(10);
    const result = await transport().fetch({
      url: `http://school.fixture.test:${fixture.port}/ok`,
      maxResponseBytes: 1_024,
      requestTimeoutMs: 1_000,
      connectTimeoutMs: 500,
      maxRedirects: 1,
      runBudget: ledger,
    });
    expect(result).toMatchObject({
      ok: false,
      failure: { code: "BYTE_BUDGET_EXCEEDED" },
    });
    expect(ledger.consumedBytes).toBe(38);
    expect(ledger.exceeded).toBe(true);
  });

  it("returns a bounded read timeout", async () => {
    await expect(
      transport().fetch({
        url: `http://school.fixture.test:${fixture.port}/slow`,
        maxResponseBytes: 1024,
        requestTimeoutMs: 30,
        connectTimeoutMs: 20,
        maxRedirects: 5,
      }),
    ).resolves.toMatchObject({
      ok: false,
      failure: { code: "READ_TIMEOUT", message: "HTTP response timed out" },
    });
  });

  it("charges decoded bytes received before a read timeout", async () => {
    const ledger = runBudget(1_024);
    const result = await transport().fetch({
      url: `http://school.fixture.test:${fixture.port}/slow-after-chunk`,
      maxResponseBytes: 1_024,
      requestTimeoutMs: 30,
      connectTimeoutMs: 20,
      maxRedirects: 1,
      runBudget: ledger,
    });
    expect(result).toMatchObject({
      ok: false,
      failure: { code: "READ_TIMEOUT" },
    });
    expect(ledger.consumedBytes).toBe(Buffer.byteLength("partial"));
  });

  it("charges decoded bytes emitted before a compressed body-read error", async () => {
    const ledger = runBudget(10_000);
    const result = await transport().fetch({
      url: `http://school.fixture.test:${fixture.port}/corrupt-gzip`,
      maxResponseBytes: 8_192,
      requestTimeoutMs: 1_000,
      connectTimeoutMs: 500,
      maxRedirects: 1,
      runBudget: ledger,
    });
    expect(result).toMatchObject({
      ok: false,
      failure: { code: "BODY_READ_ERROR" },
    });
    expect(ledger.consumedBytes).toBeGreaterThan(0);
    expect(ledger.consumedBytes).toBe(
      !result.ok ? result.failure.actualResponseBytes : -1,
    );
  });

  it("charges decoded failure response bodies", async () => {
    const ledger = runBudget(1_024);
    const result = await transport().fetch({
      url: `http://school.fixture.test:${fixture.port}/status/404`,
      maxResponseBytes: 1_024,
      requestTimeoutMs: 1_000,
      connectTimeoutMs: 500,
      maxRedirects: 1,
      runBudget: ledger,
    });
    expect(result).toMatchObject({
      ok: true,
      response: { httpStatus: 404, actualResponseBytes: 7 },
    });
    expect(ledger.consumedBytes).toBe(7);
  });

  it.each([
    ["status/404", 404, "text/html"],
    ["status/500", 500, "text/plain"],
    ["pdf", 200, "application/pdf"],
  ])(
    "returns bounded response evidence for %s",
    async (path, status, contentType) => {
      const result = await transport().fetch({
        url: `http://school.fixture.test:${fixture.port}/${path}`,
        maxResponseBytes: 1024,
        requestTimeoutMs: 1_000,
        connectTimeoutMs: 500,
        maxRedirects: 5,
      });
      expect(result).toMatchObject({
        ok: true,
        response: { httpStatus: status, contentType },
      });
    },
  );
});
