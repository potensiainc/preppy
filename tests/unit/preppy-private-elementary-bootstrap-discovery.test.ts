import { describe, expect, it, vi } from "vitest";

import {
  classifySchoolCollection,
  collectPrivateElementarySchool,
  createPrivateElementaryCollectionRuntime,
  isOfficialBootstrapUrl,
  scoreBootstrapCandidate,
} from "@/src/modules/institution-detail-bootstrap/discovery.server";
import type { PrivateElementaryBootstrapTarget } from "@/src/modules/institution-detail-bootstrap/contracts";
import type { StaticHttpResponse } from "@/src/modules/http-collector/http-transport.server";

const diagnosticTarget: PrivateElementaryBootstrapTarget = {
  institutionId: "00000000-0000-4000-8000-000000000001",
  slug: "school",
  institutionName: "테스트초등학교",
  category: "PRIVATE_ELEMENTARY",
  regionCode: "KR-11",
  address: "서울특별시 테스트구",
  gradeRange: "초등학교(1–6)",
  offersElementary: true,
  province: "서울특별시",
  cityDistrict: "테스트구",
  registryVerifiedAt: "2026-08-27",
  websiteUrl: "https://school.example/",
  registryName: "SCHOOLINFO",
  registryExternalId: "school-1",
  registryUrl: "https://www.schoolinfo.go.kr/record/1",
};

function diagnosticResponse(
  url: string,
  body: string,
  overrides: Partial<StaticHttpResponse> = {},
): StaticHttpResponse {
  const entityBytes = Buffer.from(body);
  return {
    requestedUrl: url,
    finalUrl: url,
    redirectChain: [],
    httpStatus: 200,
    contentType: "text/html; charset=UTF-8",
    contentLengthHeader: String(entityBytes.length),
    actualResponseBytes: entityBytes.length,
    fetchedAt: new Date("2026-08-30T00:00:00.000Z"),
    elapsedMs: 1,
    etag: null,
    lastModified: null,
    entityBytes,
    ...overrides,
  };
}

describe("private elementary discovery policy", () => {
  it.each([
    {
      code: "EMPTY_NORMALIZED_TEXT",
      body: '<script>location.href="/?ckattempt=1";</script>',
      overrides: {},
    },
    {
      code: "UNSUPPORTED_MIME",
      body: "school",
      overrides: { contentType: "application/json" },
    },
    {
      code: "HTTP_FAILURE",
      body: "unavailable",
      overrides: { httpStatus: 503 },
    },
    {
      code: "SAME_DOMAIN_FAILURE",
      body: "<p>school</p>",
      overrides: { finalUrl: "https://external.example/" },
    },
  ])(
    "reports $code without manufacturing admission evidence",
    async ({ code, body, overrides }) => {
      const runtime = createPrivateElementaryCollectionRuntime({
        sleep: async () => undefined,
        baseTransport: {
          fetch: async (input) => ({
            ok: true,
            response: input.url.endsWith("/robots.txt")
              ? diagnosticResponse(input.url, "User-agent: *\nAllow: /", {
                  contentType: "text/plain",
                })
              : diagnosticResponse(input.url, body, overrides),
          }),
        },
      });
      const result = await collectPrivateElementarySchool(
        { target: diagnosticTarget, work: "both" },
        { runtime },
      );
      expect(result.status).toBe("SCHOOL_FETCH_FAILED");
      expect(result.admission).toBeNull();
      expect(result.pages).toHaveLength(0);
      expect(
        [...result.errors, ...result.warnings].some(
          (message) => message.split(":", 1)[0] === code,
        ),
      ).toBe(true);
    },
  );

  it.each(["root", "candidate"])(
    "distinguishes a %s redirect policy refusal from an unsupported page",
    async (stage) => {
      const runtime = createPrivateElementaryCollectionRuntime({
        sleep: async () => undefined,
        baseTransport: {
          fetch: async (input) => {
            if (input.url.endsWith("/robots.txt"))
              return {
                ok: true,
                response: diagnosticResponse(
                  input.url,
                  "User-agent: *\nAllow: /",
                  { contentType: "text/plain" },
                ),
              };
            if (
              stage === "candidate" &&
              input.url === diagnosticTarget.websiteUrl
            )
              return {
                ok: true,
                response: diagnosticResponse(
                  input.url,
                  '<p>학교 소개</p><a href="/admission">입학 안내</a>',
                ),
              };
            return {
              ok: false,
              failure: {
                code: "REDIRECT_EXTERNAL_HOST",
                message: "Redirect not allowed",
                requestedUrl: input.url,
                finalUrl: input.url,
                redirectChain: [],
                httpStatus: 302,
                contentType: null,
                contentLengthHeader: "0",
                actualResponseBytes: 0,
                fetchedAt: new Date("2026-08-30T00:00:00.000Z"),
                elapsedMs: 1,
              },
            };
          },
        },
      });
      const result = await collectPrivateElementarySchool(
        { target: diagnosticTarget, work: "both" },
        { runtime },
      );
      const codes = [...result.errors, ...result.warnings].map(
        (message) => message.split(":", 1)[0],
      );
      expect(codes).toContain("REDIRECT_POLICY_FAILURE");
      expect(codes).toContain("REDIRECT_EXTERNAL_HOST");
      if (stage === "root") expect(result.admission).toBeNull();
      else {
        expect(result.status).toBe("COLLECTED");
        expect(result.pages).toHaveLength(1);
        expect(result.partialFetchWarning).toBe(true);
      }
    },
  );

  it.each([
    { code: "HTTP_FAILURE", body: "unavailable", httpStatus: 503 },
    {
      code: "EMPTY_NORMALIZED_TEXT",
      body: '<script>location.href="/?ckattempt=1";</script>',
      httpStatus: 200,
    },
  ])(
    "keeps valid root evidence but reports candidate $code as partial",
    async ({ code, body, httpStatus }) => {
      const runtime = createPrivateElementaryCollectionRuntime({
        sleep: async () => undefined,
        baseTransport: {
          fetch: async (input) => ({
            ok: true,
            response: input.url.endsWith("/robots.txt")
              ? diagnosticResponse(input.url, "User-agent: *\nAllow: /", {
                  contentType: "text/plain",
                })
              : input.url === diagnosticTarget.websiteUrl
                ? diagnosticResponse(
                    input.url,
                    '<p>학교 소개</p><a href="/admission">입학 안내</a>',
                  )
                : diagnosticResponse(input.url, body, { httpStatus }),
          }),
        },
      });
      const result = await collectPrivateElementarySchool(
        { target: diagnosticTarget, work: "both" },
        { runtime },
      );
      expect(result.status).toBe("COLLECTED");
      expect(result.pages).toHaveLength(1);
      expect(result.warnings).toContain(
        `${code}:https://school.example/admission`,
      );
      expect(result.partialFetchWarning).toBe(true);
      expect(result.warnings).toContain("PARTIAL_FETCH_WARNING");
    },
  );

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
