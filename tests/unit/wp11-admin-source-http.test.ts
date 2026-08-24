import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { AdminCommandContext } from "@/src/application/context";
import {
  buildSourceBindingBody,
  buildSourceUnavailableBody,
} from "@/app/admin/_components/monitoring-actions";
import {
  buildSourceReplacementBody,
  buildUrlCorrectionBody,
} from "@/app/admin/_components/source-move-actions";
import {
  handleAdminBindInstitutionSourceRequest,
  handleAdminBindOpportunitySourceRequest,
  handleAdminMarkSourceUnavailableRequest,
  handleAdminMoveSourceRequest,
  handleAdminUnbindInstitutionSourceRequest,
  handleAdminUnbindOpportunitySourceRequest,
  type AdminSourceCommandRequestDependencies,
} from "@/src/modules/admin/http/source-commands.server";

const appBaseUrl = "https://preppy.example";
const adminUserId = "550e8400-e29b-41d4-a716-446655440000";
const sourceId = "550e8400-e29b-41d4-a716-446655440001";
const replacementSourceId = "550e8400-e29b-41d4-a716-446655440002";
const institutionId = "550e8400-e29b-41d4-a716-446655440003";
const opportunityId = "550e8400-e29b-41d4-a716-446655440004";
const correlationId = "550e8400-e29b-41d4-a716-446655440005";
const occurredAt = new Date("2026-08-24T10:11:12.000Z");
const repositoryRoot = resolve(import.meta.dirname, "../..");

function request(body: unknown, method = "POST"): Request {
  return new Request(`${appBaseUrl}/api/admin/source-command`, {
    method,
    headers: { "content-type": "application/json", origin: appBaseUrl },
    body: JSON.stringify(body),
  });
}

function dependencies(
  overrides: Partial<AdminSourceCommandRequestDependencies> = {},
): AdminSourceCommandRequestDependencies {
  return {
    requireCurrentAdmin: vi.fn(async () => ({
      adminUserId,
      displayName: "WP-11 Operator",
    })),
    getAppBaseUrl: vi.fn(() => appBaseUrl),
    createContext: vi.fn(
      ({ adminUserId: id, reason }): AdminCommandContext => ({
        adminUserId: id,
        reason,
        occurredAt,
        correlationId,
      }),
    ),
    createErrorCorrelationId: vi.fn(() => randomUUID()),
    ...overrides,
  };
}

describe("WP-11 Admin Source unavailable HTTP adapter", () => {
  it("maps each exact outcome to a server-owned reason and delegates once", async () => {
    const cases = [
      ["NOT_FOUND", "SOURCE_NOT_FOUND"],
      ["ACCESS_ERROR", "SOURCE_ACCESS_ERROR"],
      ["PARSE_ERROR", "SOURCE_PARSE_ERROR"],
      ["TIMEOUT", "SOURCE_TIMEOUT"],
    ] as const;

    for (const [outcome, reason] of cases) {
      const markSourceUnavailable = vi.fn(async () => ({
        sourceId,
        observationId: "42",
        checkedAt: occurredAt.toISOString(),
        lifecycleStatus: "PAUSED",
      }));
      const body = {
        outcome,
        httpStatus: 503,
        finalUrl: "https://official.example.test/unavailable",
        durationMs: 1_234,
        errorCode: "UPSTREAM_FAILURE",
        errorMessage: "Bounded operator-safe diagnostic",
        pauseSource: true,
      };
      const response = await handleAdminMarkSourceUnavailableRequest(
        request(body),
        { sourceId },
        dependencies({ markSourceUnavailable }),
      );
      expect(response.status).toBe(200);
      expect(markSourceUnavailable).toHaveBeenCalledTimes(1);
      expect(markSourceUnavailable).toHaveBeenCalledWith(
        { adminUserId, reason, occurredAt, correlationId },
        { sourceId, ...body },
      );
    }
  });

  it("rejects unsupported outcomes, path duplication, free-form policy, and unbounded observation fields", async () => {
    const invalid = [
      { outcome: "OTHER_ERROR", pauseSource: false },
      { outcome: "TIMEOUT", sourceId },
      { outcome: "TIMEOUT", reason: "CLIENT_REASON" },
      { outcome: "TIMEOUT", adminUserId },
      { outcome: "TIMEOUT", truthMode: "NATIVE" },
      { outcome: "TIMEOUT", errorCode: "free form" },
      { outcome: "TIMEOUT", errorMessage: "x".repeat(501) },
      { outcome: "TIMEOUT", durationMs: 86_400_001 },
      { outcome: "TIMEOUT", httpStatus: 99 },
      {
        outcome: "TIMEOUT",
        finalUrl: "https://official.example.test/page#access_token=secret",
      },
      { outcome: "TIMEOUT", finalUrl: " https://official.example.test" },
      {
        outcome: "TIMEOUT",
        finalUrl: "https://user:secret@official.example.test/page",
      },
      { outcome: "TIMEOUT", finalUrl: "ftp://official.example.test/page" },
      {
        outcome: "TIMEOUT",
        finalUrl: "HTTPS://official.example.test/page",
      },
      {
        outcome: "TIMEOUT",
        finalUrl: "https:\\official.example.test\\page",
      },
      { outcome: "TIMEOUT", pauseSource: false, unknown: true },
    ];
    for (const body of invalid) {
      const markSourceUnavailable = vi.fn();
      const response = await handleAdminMarkSourceUnavailableRequest(
        request(body),
        { sourceId },
        dependencies({ markSourceUnavailable }),
      );
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(markSourceUnavailable).not.toHaveBeenCalled();
    }
  });
});

describe("WP-11 explicit Source move HTTP adapter", () => {
  it("delegates the two explicit modes once with their distinct fixed reasons", async () => {
    const cases = [
      {
        body: {
          moveMode: "URL_CORRECTION" as const,
          newUrl: "https://official.example.test/admissions/",
          provenanceContinuityConfirmed: true as const,
        },
        reason: "SOURCE_URL_CORRECTION_CONFIRMED",
      },
      {
        body: {
          moveMode: "SOURCE_REPLACEMENT" as const,
          replacement: {
            kind: "CREATE" as const,
            canonicalUrl: "https://new.example.test/admissions/",
            sourceName: "New official admissions",
          },
        },
        reason: "SOURCE_REPLACEMENT_CONFIRMED",
      },
      {
        body: {
          moveMode: "SOURCE_REPLACEMENT" as const,
          replacement: {
            kind: "REUSE" as const,
            replacementSourceId,
          },
        },
        reason: "SOURCE_REPLACEMENT_CONFIRMED",
      },
    ];
    for (const item of cases) {
      const markSourceMoved = vi.fn(async () => ({
        moveMode: item.body.moveMode,
        oldSourceId: sourceId,
        newSourceId:
          item.body.moveMode === "URL_CORRECTION"
            ? sourceId
            : replacementSourceId,
        canonicalUrl: "https://official.example.test/admissions/",
        transferredInstitutionBindings: 0,
        transferredOpportunityBindings: 0,
      }));
      const response = await handleAdminMoveSourceRequest(
        request(item.body),
        { sourceId },
        dependencies({ markSourceMoved }),
      );
      expect(response.status).toBe(200);
      expect(markSourceMoved).toHaveBeenCalledTimes(1);
      expect(markSourceMoved).toHaveBeenCalledWith(
        {
          adminUserId,
          reason: item.reason,
          occurredAt,
          correlationId,
        },
        { sourceId, ...item.body },
      );
    }
  });

  it("rejects automatic, mixed, missing, false, duplicate-ID, noncanonical URL, and unknown move shapes", async () => {
    const invalid = [
      {},
      { moveMode: "AUTOMATIC", newUrl: "https://official.example.test/" },
      {
        moveMode: "URL_CORRECTION",
        newUrl: "https://official.example.test/",
      },
      {
        moveMode: "URL_CORRECTION",
        newUrl: "https://official.example.test/",
        provenanceContinuityConfirmed: false,
      },
      {
        moveMode: "URL_CORRECTION",
        newUrl: "https://official.example.test/#fragment",
        provenanceContinuityConfirmed: true,
        replacement: { kind: "REUSE", replacementSourceId },
      },
      {
        moveMode: "SOURCE_REPLACEMENT",
        replacement: { kind: "REUSE", replacementSourceId },
        newUrl: "https://official.example.test/",
      },
      {
        moveMode: "SOURCE_REPLACEMENT",
        replacement: {
          kind: "CREATE",
          canonicalUrl: "HTTPS://new.example.test/source",
          sourceName: "New",
        },
      },
      {
        moveMode: "SOURCE_REPLACEMENT",
        replacement: { kind: "REUSE", replacementSourceId, sourceName: "x" },
      },
      {
        moveMode: "SOURCE_REPLACEMENT",
        replacement: { kind: "CREATE", sourceName: "Missing URL" },
      },
      {
        moveMode: "SOURCE_REPLACEMENT",
        replacement: {
          kind: "CREATE",
          canonicalUrl: "https://new.example.test/",
          sourceName: "x".repeat(201),
        },
      },
      {
        moveMode: "SOURCE_REPLACEMENT",
        replacement: { kind: "REUSE", replacementSourceId },
        sourceId,
      },
      {
        moveMode: "SOURCE_REPLACEMENT",
        replacement: { kind: "REUSE", replacementSourceId },
        automatic: true,
      },
    ];
    for (const body of invalid) {
      const markSourceMoved = vi.fn();
      const response = await handleAdminMoveSourceRequest(
        request(body),
        { sourceId },
        dependencies({ markSourceMoved }),
      );
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(markSourceMoved).not.toHaveBeenCalled();
    }
  });
});

describe("WP-11 canonical binding HTTP adapters", () => {
  it("takes the target from path, accepts only target-specific role/body, and delegates once", async () => {
    const bindInstitutionSource = vi.fn(async () => ({
      targetType: "INSTITUTION" as const,
      targetId: institutionId,
      sourceId,
      role: "ADMISSIONS",
      state: "ACTIVE" as const,
    }));
    const bindOpportunitySource = vi.fn(async () => ({
      targetType: "OPPORTUNITY" as const,
      targetId: opportunityId,
      sourceId,
      role: "PRIMARY_NOTICE",
      state: "ACTIVE" as const,
    }));
    const institutionBody = {
      sourceId,
      role: "ADMISSIONS" as const,
      isPrimary: true,
    };
    const opportunityBody = {
      sourceId,
      role: "PRIMARY_NOTICE" as const,
      isPrimary: false,
    };
    const institutionResponse = await handleAdminBindInstitutionSourceRequest(
      request(institutionBody),
      { institutionId },
      dependencies({ bindInstitutionSource }),
    );
    const opportunityResponse = await handleAdminBindOpportunitySourceRequest(
      request(opportunityBody),
      { opportunityId },
      dependencies({ bindOpportunitySource }),
    );
    expect(institutionResponse.status).toBe(200);
    expect(opportunityResponse.status).toBe(200);
    expect(bindInstitutionSource).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "SOURCE_BINDING_UPDATED" }),
      { institutionId, ...institutionBody },
    );
    expect(bindOpportunitySource).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "SOURCE_BINDING_UPDATED" }),
      { opportunityId, ...opportunityBody },
    );
  });

  it("unbinds only the exact path-owned tuple with an empty strict body", async () => {
    const unbindInstitutionSource = vi.fn(async () => ({
      targetType: "INSTITUTION" as const,
      targetId: institutionId,
      sourceId,
      role: "TUITION",
      state: "INACTIVE" as const,
    }));
    const unbindOpportunitySource = vi.fn(async () => ({
      targetType: "OPPORTUNITY" as const,
      targetId: opportunityId,
      sourceId,
      role: "SUPPORTING",
      state: "INACTIVE" as const,
    }));
    const institutionPath = {
      institutionId,
      sourceId,
      role: "TUITION",
    };
    const opportunityPath = {
      opportunityId,
      sourceId,
      role: "SUPPORTING",
    };
    const institutionResponse = await handleAdminUnbindInstitutionSourceRequest(
      request({}, "DELETE"),
      institutionPath,
      dependencies({ unbindInstitutionSource }),
    );
    const opportunityResponse = await handleAdminUnbindOpportunitySourceRequest(
      request({}, "DELETE"),
      opportunityPath,
      dependencies({ unbindOpportunitySource }),
    );
    expect(institutionResponse.status).toBe(200);
    expect(opportunityResponse.status).toBe(200);
    expect(unbindInstitutionSource).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "SOURCE_BINDING_UPDATED" }),
      institutionPath,
    );
    expect(unbindOpportunitySource).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "SOURCE_BINDING_UPDATED" }),
      opportunityPath,
    );
  });

  it("rejects cross-target roles, duplicate target IDs, role mismatch, unbind body IDs, and unknown fields", async () => {
    const invalidBinds = [
      {
        handler: handleAdminBindInstitutionSourceRequest,
        path: { institutionId },
        body: { sourceId, role: "PRIMARY_NOTICE", isPrimary: false },
      },
      {
        handler: handleAdminBindInstitutionSourceRequest,
        path: { institutionId },
        body: { sourceId, role: "OTHER", isPrimary: false, institutionId },
      },
      {
        handler: handleAdminBindOpportunitySourceRequest,
        path: { opportunityId },
        body: { sourceId, role: "TUITION", isPrimary: false },
      },
      {
        handler: handleAdminBindOpportunitySourceRequest,
        path: { opportunityId },
        body: { sourceId, role: "OTHER", isPrimary: false, reason: "x" },
      },
    ] as const;
    for (const item of invalidBinds) {
      const command = vi.fn();
      const response = await item.handler(
        request(item.body),
        item.path,
        dependencies({
          bindInstitutionSource: command,
          bindOpportunitySource: command,
        }),
      );
      expect(response.status).toBe(400);
      expect(command).not.toHaveBeenCalled();
    }

    const unbindInstitutionSource = vi.fn();
    const duplicate = await handleAdminUnbindInstitutionSourceRequest(
      request({ sourceId }, "DELETE"),
      { institutionId, sourceId, role: "OTHER" },
      dependencies({ unbindInstitutionSource }),
    );
    expect(duplicate.status).toBe(400);
    expect(unbindInstitutionSource).not.toHaveBeenCalled();
  });

  it("keeps all six Route Handlers as thin default-composition delegates", async () => {
    const routes = [
      [
        "app/api/admin/sources/[sourceId]/unavailable/route.ts",
        "handleAdminMarkSourceUnavailableRequest",
      ],
      [
        "app/api/admin/sources/[sourceId]/moved/route.ts",
        "handleAdminMoveSourceRequest",
      ],
      [
        "app/api/admin/institutions/[institutionId]/source-bindings/route.ts",
        "handleAdminBindInstitutionSourceRequest",
      ],
      [
        "app/api/admin/institutions/[institutionId]/source-bindings/[sourceId]/[role]/route.ts",
        "handleAdminUnbindInstitutionSourceRequest",
      ],
      [
        "app/api/admin/opportunities/[opportunityId]/source-bindings/route.ts",
        "handleAdminBindOpportunitySourceRequest",
      ],
      [
        "app/api/admin/opportunities/[opportunityId]/source-bindings/[sourceId]/[role]/route.ts",
        "handleAdminUnbindOpportunitySourceRequest",
      ],
    ] as const;
    for (const [path, handler] of routes) {
      const source = await readFile(resolve(repositoryRoot, path), "utf8");
      expect(source).toContain('export const dynamic = "force-dynamic"');
      expect(source).toContain(handler);
      expect(source).not.toMatch(/from\s+["']@\/src\/db\/schema/);
      expect(source).not.toMatch(/\b(update|insert)\s+\w/i);
      expect(source).not.toContain("runtime.client");
    }
  });
});

describe("WP-11 Source command UI candidate builders", () => {
  it("builds only allowlisted unavailable and binding inputs after explicit confirmation", () => {
    const unavailable = new FormData();
    unavailable.set("outcome", "ACCESS_ERROR");
    unavailable.set("httpStatus", "403");
    unavailable.set("finalUrl", "https://official.example.test/denied");
    unavailable.set("durationMs", "812");
    unavailable.set("errorCode", "ACCESS_DENIED");
    unavailable.set("errorMessage", "Official page denied access");
    unavailable.set("pauseSource", "true");
    unavailable.set("truthMode", "CLIENT_MUST_NOT_SEND");
    expect(buildSourceUnavailableBody(unavailable)).toEqual({
      outcome: "ACCESS_ERROR",
      httpStatus: 403,
      finalUrl: "https://official.example.test/denied",
      durationMs: 812,
      errorCode: "ACCESS_DENIED",
      errorMessage: "Official page denied access",
      pauseSource: true,
    });

    const binding = new FormData();
    binding.set("sourceId", sourceId);
    binding.set("role", "ADMISSIONS");
    binding.set("isPrimary", "true");
    expect(() => buildSourceBindingBody(binding)).toThrow();
    binding.set("bindConfirmed", "true");
    binding.set("adminUserId", adminUserId);
    expect(buildSourceBindingBody(binding)).toEqual({
      sourceId,
      role: "ADMISSIONS",
      isPrimary: true,
    });
  });

  it("uses distinct explicit builders and never infers move mode from URL values", () => {
    const correction = new FormData();
    correction.set("newUrl", "https://official.example.test/corrected");
    expect(() => buildUrlCorrectionBody(correction)).toThrow();
    correction.set("provenanceContinuityConfirmed", "true");
    correction.set("replacementSourceId", replacementSourceId);
    expect(buildUrlCorrectionBody(correction)).toEqual({
      moveMode: "URL_CORRECTION",
      newUrl: "https://official.example.test/corrected",
      provenanceContinuityConfirmed: true,
    });

    const replacement = new FormData();
    replacement.set("replacementConfirmed", "true");
    replacement.set("replacementSourceId", replacementSourceId);
    replacement.set("newUrl", "https://official.example.test/corrected");
    expect(buildSourceReplacementBody("REUSE", replacement)).toEqual({
      moveMode: "SOURCE_REPLACEMENT",
      replacement: { kind: "REUSE", replacementSourceId },
    });

    const create = new FormData();
    create.set("replacementConfirmed", "true");
    create.set("canonicalUrl", "https://new.example.test/official");
    create.set("sourceName", " New official Source ");
    expect(buildSourceReplacementBody("CREATE", create)).toEqual({
      moveMode: "SOURCE_REPLACEMENT",
      replacement: {
        kind: "CREATE",
        canonicalUrl: "https://new.example.test/official",
        sourceName: "New official Source",
      },
    });
  });
});
