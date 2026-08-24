import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { BoundedCacheReplayRegistry } from "@/src/modules/cache/replay.server";
import {
  createCacheRevalidationSignature,
  readAuthenticatedCacheRevalidationRequest,
} from "@/src/modules/cache/revalidation-handler.server";

const secret = "cache-secret-with-at-least-32-bytes!";
const eventId = randomUUID();
const now = new Date("2026-08-25T10:00:00.000Z");
const payload = {
  version: 1,
  articleId: randomUUID(),
  reason: "ARTICLE_PUBLISHED",
  currentCanonicalPath: "/articles/forged",
  relatedInstitutionIds: [],
  relatedOpportunityIds: [],
};

function signedRequest(
  body: string,
  timestamp = String(now.getTime() / 1000),
  signature?: string,
  id: string = eventId,
) {
  const value =
    signature ??
    createCacheRevalidationSignature({
      secret,
      timestamp,
      eventId: id,
      rawBody: new TextEncoder().encode(body),
    });
  return new Request("https://preppy.example/api/internal/cache/revalidate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-preppy-revalidation-timestamp": timestamp,
      "x-preppy-revalidation-event-id": id,
      "x-preppy-revalidation-signature": value,
    },
    body,
  });
}

function signedBytesRequest(bytes: Uint8Array) {
  const timestamp = String(now.getTime() / 1000);
  const signature = createCacheRevalidationSignature({
    secret,
    timestamp,
    eventId,
    rawBody: bytes,
  });
  return new Request("https://preppy.example/api/internal/cache/revalidate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-preppy-revalidation-timestamp": timestamp,
      "x-preppy-revalidation-event-id": eventId,
      "x-preppy-revalidation-signature": signature,
    },
    body: bytes as BodyInit,
  });
}

describe("WP-13 cache HMAC and replay security", () => {
  it("signs exact raw bytes and accepts both ±300 second boundaries", async () => {
    const body = JSON.stringify(payload);
    for (const offset of [-300, 300]) {
      const timestamp = String(now.getTime() / 1000 + offset);
      await expect(
        readAuthenticatedCacheRevalidationRequest(
          signedRequest(body, timestamp),
          { secret, maxClockSkewSeconds: 300 },
          now,
          new BoundedCacheReplayRegistry(),
        ),
      ).resolves.toMatchObject({
        eventId,
        payload: { articleId: payload.articleId },
      });
    }
    await expect(
      readAuthenticatedCacheRevalidationRequest(
        signedRequest(`${body} `),
        { secret, maxClockSkewSeconds: 300 },
        now,
        new BoundedCacheReplayRegistry(),
      ),
    ).resolves.toMatchObject({ eventId });
    await expect(
      readAuthenticatedCacheRevalidationRequest(
        signedRequest(
          `${body} `,
          undefined,
          createCacheRevalidationSignature({
            secret,
            timestamp: String(now.getTime() / 1000),
            eventId,
            rawBody: new TextEncoder().encode(body),
          }),
        ),
        { secret, maxClockSkewSeconds: 300 },
        now,
        new BoundedCacheReplayRegistry(),
      ),
    ).rejects.toThrow();
  });

  it("rejects stale/malformed headers, duplicate JSON, invalid media/UTF-8, and oversized bodies", async () => {
    const body = JSON.stringify(payload);
    const wrongMedia = signedRequest(body);
    wrongMedia.headers.set("content-type", "text/plain");
    const duplicateSignature = signedRequest(body);
    duplicateSignature.headers.append(
      "x-preppy-revalidation-signature",
      duplicateSignature.headers.get("x-preppy-revalidation-signature")!,
    );
    const candidates = [
      signedRequest(body, String(now.getTime() / 1000 + 301)),
      signedRequest(body, "not-time"),
      signedRequest(body, undefined, "v1=" + "A".repeat(64)),
      signedRequest(body, undefined, undefined, "not-uuid"),
      signedRequest('{"version":1,"version":1}'),
      wrongMedia,
      signedBytesRequest(new Uint8Array([0x7b, 0xff, 0x7d])),
      duplicateSignature,
      signedRequest(
        JSON.stringify({ ...payload, padding: "x".repeat(16 * 1024) }),
      ),
    ];
    for (const request of candidates)
      await expect(
        readAuthenticatedCacheRevalidationRequest(
          request,
          { secret, maxClockSkewSeconds: 300 },
          now,
          new BoundedCacheReplayRegistry(),
        ),
      ).rejects.toThrow();
  });

  it("rejects replay but accepts a retry with fresh timestamp/signature and enforces capacity", async () => {
    const registry = new BoundedCacheReplayRegistry(2);
    const body = JSON.stringify(payload);
    await readAuthenticatedCacheRevalidationRequest(
      signedRequest(body),
      { secret, maxClockSkewSeconds: 300 },
      now,
      registry,
    );
    await expect(
      readAuthenticatedCacheRevalidationRequest(
        signedRequest(body),
        { secret, maxClockSkewSeconds: 300 },
        now,
        registry,
      ),
    ).rejects.toThrow();
    const freshNow = new Date(now.getTime() + 1_000);
    await expect(
      readAuthenticatedCacheRevalidationRequest(
        signedRequest(body, String(freshNow.getTime() / 1000)),
        { secret, maxClockSkewSeconds: 300 },
        freshNow,
        registry,
      ),
    ).resolves.toBeDefined();
    expect(
      registry.consume({
        key: "third",
        now,
        expiresAt: new Date(now.getTime() + 10_000),
      }),
    ).toBe("CAPACITY_EXCEEDED");
  });
});
