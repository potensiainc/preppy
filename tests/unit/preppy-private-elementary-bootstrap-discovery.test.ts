import { describe, expect, it, vi } from "vitest";

import {
  classifySchoolCollection,
  createPrivateElementaryCollectionRuntime,
  isOfficialBootstrapUrl,
  scoreBootstrapCandidate,
} from "@/src/modules/institution-detail-bootstrap/discovery.server";

describe("private elementary discovery policy", () => {
  it("does not deadlock when an HTTP page redirect needs HTTPS robots evaluation", async () => {
    const fetch = vi.fn(async (request) => {
      if (request.url.endsWith("/robots.txt")) {
        const entityBytes = Buffer.from("User-agent: *\nAllow: /");
        return {
          ok: true as const,
          response: {
            requestedUrl: request.url,
            finalUrl: request.url,
            redirectChain: [],
            httpStatus: 200,
            contentType: "text/plain",
            contentLengthHeader: String(entityBytes.length),
            actualResponseBytes: entityBytes.length,
            fetchedAt: new Date("2026-08-30T00:00:00.000Z"),
            elapsedMs: 1,
            etag: null,
            lastModified: null,
            entityBytes,
          },
        };
      }
      const redirectDecision = await request.beforeRedirect?.(
        "https://school.example/",
      );
      expect(redirectDecision?.allowed).toBe(true);
      const entityBytes = Buffer.from("<html>school</html>");
      return {
        ok: true as const,
        response: {
          requestedUrl: request.url,
          finalUrl: "https://school.example/",
          redirectChain: [],
          httpStatus: 200,
          contentType: "text/html",
          contentLengthHeader: String(entityBytes.length),
          actualResponseBytes: entityBytes.length,
          fetchedAt: new Date("2026-08-30T00:00:00.000Z"),
          elapsedMs: 1,
          etag: null,
          lastModified: null,
          entityBytes,
        },
      };
    });
    const runtime = createPrivateElementaryCollectionRuntime({
      baseTransport: { fetch },
      sleep: async () => undefined,
    });

    const result = await Promise.race([
      runtime.transport.fetch({
        url: "http://school.example/",
        maxResponseBytes: 1_000,
        requestTimeoutMs: 1_000,
        connectTimeoutMs: 1_000,
        maxRedirects: 1,
        beforeRedirect: async (url) => {
          const decision = await runtime.robots.evaluate(url);
          return {
            allowed: decision.decision === "ALLOW",
            code: decision.errorCode,
          };
        },
      }),
      new Promise<"DEADLOCK">((resolve) =>
        setTimeout(() => resolve("DEADLOCK"), 50),
      ),
    ]);

    expect(result).not.toBe("DEADLOCK");
  });

  it("scores admission and Institution Fact links above generic navigation", () => {
    const admission = scoreBootstrapCandidate({
      url: "https://school.example/notice/2027-admission.pdf",
      anchorText: "2027학년도 신입생 모집요강 PDF",
    });
    const fact = scoreBootstrapCandidate({
      url: "https://school.example/education/curriculum",
      anchorText: "교육과정과 특색교육",
    });
    const generic = scoreBootstrapCandidate({
      url: "https://school.example/gallery",
      anchorText: "학교 사진",
    });

    expect(admission.admissionScore).toBeGreaterThan(fact.admissionScore);
    expect(fact.factScore).toBeGreaterThan(generic.factScore);
    expect(admission.totalScore).toBeGreaterThan(generic.totalScore);
  });

  it("accepts only same official discovery domains", () => {
    expect(
      isOfficialBootstrapUrl(
        "https://school.example/main",
        "https://www.school.example/admissions",
      ),
    ).toBe(true);
    expect(
      isOfficialBootstrapUrl(
        "https://school.example/main",
        "https://blog.example.net/school-admissions",
      ),
    ).toBe(false);
  });

  it("distinguishes school failure from partial candidate warnings", () => {
    expect(
      classifySchoolCollection({
        rootSucceeded: false,
        usableOfficialPages: 0,
        candidateFetchFailures: 0,
      }),
    ).toEqual({ status: "SCHOOL_FETCH_FAILED", warning: false });
    expect(
      classifySchoolCollection({
        rootSucceeded: true,
        usableOfficialPages: 3,
        candidateFetchFailures: 2,
      }),
    ).toEqual({ status: "COLLECTED", warning: true });
    expect(
      classifySchoolCollection({
        rootSucceeded: true,
        usableOfficialPages: 1,
        candidateFetchFailures: 0,
      }),
    ).toEqual({ status: "COLLECTED", warning: false });
  });
});
