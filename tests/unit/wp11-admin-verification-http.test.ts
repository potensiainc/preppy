import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { AdminCommandContext } from "@/src/application/context";
import {
  handleAdminVerifyOpportunityRequest,
  type AdminVerifyOpportunityRequestDependencies,
} from "@/src/modules/admin/http/verify-opportunity.server";
import {
  handleAdminVerifyInstitutionFactRequest,
  type AdminVerifyInstitutionFactRequestDependencies,
} from "@/src/modules/admin/http/verify-institution-fact.server";
import {
  buildOpportunityCandidateBody,
  parseExactActionUrlCandidate,
  parseExplicitOffsetDateTimeCandidate,
} from "@/app/admin/_components/monitoring-actions";

const appBaseUrl = "https://preppy.example";
const adminUserId = "550e8400-e29b-41d4-a716-446655440000";
const opportunityId = "550e8400-e29b-41d4-a716-446655440001";
const institutionId = "550e8400-e29b-41d4-a716-446655440002";
const sourceId = "550e8400-e29b-41d4-a716-446655440003";
const currentVersionId = "550e8400-e29b-41d4-a716-446655440004";
const correlationId = "550e8400-e29b-41d4-a716-446655440005";
const occurredAt = new Date("2026-08-24T10:11:12.000Z");
const repositoryRoot = resolve(import.meta.dirname, "../..");

function request(body: unknown): Request {
  return rawRequest(JSON.stringify(body));
}

function rawRequest(body: string): Request {
  return new Request(`${appBaseUrl}/api/admin/verify`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: appBaseUrl,
    },
    body,
  });
}

function pipelineDependencies() {
  return {
    requireCurrentAdmin: vi.fn(async () => ({
      adminUserId,
      displayName: "WP-11 Verifier",
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
  };
}

const nativeState = {
  businessState: "OPEN",
  title: "2027 Admissions",
  summary: "Applications are open.",
  targetAudience: "Families",
  eventStartAt: "2026-09-01T01:00:00.000Z",
  eventEndAt: "2026-09-01T03:00:00.000Z",
  applicationOpenAt: "2026-08-01T00:00:00.000Z",
  applicationCloseAt: "2026-08-31T23:59:59.000Z",
  actionUrl: "https://apply.example.test/native",
  locationText: "Main campus",
  validFrom: null,
  validUntil: null,
} as const;

const legacyState = {
  knowledgeState: "KNOWN",
  eventStatus: "ACTIVE",
  displayTitle: "2027 Application",
  eventStartDate: "2026-08-01",
  eventStartTime: "09:00:00",
  eventEndDate: "2026-08-31",
  eventEndTime: "18:00:00",
  registrationOpenDate: "2026-08-01",
  registrationOpenTime: "09:00:00",
  registrationCloseDate: "2026-08-31",
  registrationCloseTime: "18:00:00",
  timezone: "Asia/Seoul",
  venue: null,
  actionUrl: "https://apply.example.test/legacy",
  officialNotes: null,
} as const;

function opportunityBody(proposedState: unknown = nativeState) {
  return {
    expectedCurrentVersionId: currentVersionId,
    proposedState,
    sourceId,
    evidence: { observationId: "42", evidenceRole: "PRIMARY" },
  };
}

function opportunityResult() {
  return {
    opportunityId,
    truthMode: "NATIVE" as const,
    outcome: "NO_CHANGE" as const,
    previousVersionId: currentVersionId,
    currentVersionId,
    verifiedAt: occurredAt.toISOString(),
    evidenceId: null,
    changeType: null,
    materiality: null,
    opportunityChangeId: null,
    outboxEnqueued: false,
  };
}

function factBody() {
  return {
    expectedCurrentVersionId: currentVersionId,
    proposedState: {
      valueJson: { currency: "KRW", amount: 1_200_000 },
      displayText: "KRW 1,200,000",
      validFrom: null,
      validUntil: null,
    },
    sourceId,
    evidence: { snapshotId: randomUUID(), evidenceRole: "PRIMARY" },
  };
}

describe("WP-11 Admin Opportunity verification HTTP adapter", () => {
  it("delegates Native and Legacy candidates once to the same unified command with server-owned context", async () => {
    for (const proposedState of [nativeState, legacyState]) {
      const verifyOpportunity = vi.fn(async () => opportunityResult());
      const dependencies: AdminVerifyOpportunityRequestDependencies = {
        ...pipelineDependencies(),
        verifyOpportunity,
      };
      const response = await handleAdminVerifyOpportunityRequest(
        request(opportunityBody(proposedState)),
        { opportunityId },
        dependencies,
      );

      expect(response.status).toBe(200);
      expect(verifyOpportunity).toHaveBeenCalledTimes(1);
      expect(verifyOpportunity).toHaveBeenCalledWith(
        {
          adminUserId,
          reason: "ADMIN_VERIFY_OPPORTUNITY",
          occurredAt,
          correlationId,
        },
        { opportunityId, ...opportunityBody(proposedState) },
      );
    }
  });

  it("accepts only the two approved paired materiality overrides", async () => {
    const accepted = [
      ["NOTIFIABLE", "MATERIALITY_USER_IMPACT_CONFIRMED"],
      ["NON_NOTIFIABLE", "MATERIALITY_NON_USER_FACING_CONFIRMED"],
    ] as const;
    for (const [materialityOverride, overrideReason] of accepted) {
      const verifyOpportunity = vi.fn(async () => opportunityResult());
      const response = await handleAdminVerifyOpportunityRequest(
        request({
          ...opportunityBody(),
          materialityOverride,
          overrideReason,
        }),
        { opportunityId },
        { ...pipelineDependencies(), verifyOpportunity },
      );
      expect(response.status).toBe(200);
      expect(verifyOpportunity).toHaveBeenCalledTimes(1);
    }

    for (const override of [
      { materialityOverride: "NOTIFIABLE" },
      { overrideReason: "MATERIALITY_USER_IMPACT_CONFIRMED" },
      {
        materialityOverride: "NOTIFIABLE",
        overrideReason: "MATERIALITY_NON_USER_FACING_CONFIRMED",
      },
      {
        materialityOverride: "NON_NOTIFIABLE",
        overrideReason: "INITIAL_MATERIALITY_OVERRIDE",
      },
    ]) {
      const verifyOpportunity = vi.fn();
      const response = await handleAdminVerifyOpportunityRequest(
        request({ ...opportunityBody(), ...override }),
        { opportunityId },
        { ...pipelineDependencies(), verifyOpportunity },
      );
      expect(response.status).toBe(400);
      expect(verifyOpportunity).not.toHaveBeenCalled();
    }

    for (const [materialityOverride, overrideReason] of accepted) {
      const verifyOpportunity = vi.fn();
      const response = await handleAdminVerifyOpportunityRequest(
        request({
          ...opportunityBody(),
          expectedCurrentVersionId: null,
          materialityOverride,
          overrideReason,
        }),
        { opportunityId },
        { ...pipelineDependencies(), verifyOpportunity },
      );
      expect(response.status).toBe(400);
      expect(verifyOpportunity).not.toHaveBeenCalled();
    }
  });

  it("rejects path-owned IDs and every client-owned truth, actor, clock, change, reason, and Outbox field", async () => {
    const forbidden = [
      { opportunityId },
      { institutionId },
      { factType: "TUITION" },
      { truthMode: "NATIVE" },
      { proposedStateType: "NATIVE" },
      { changeType: "MAJOR" },
      { adminUserId },
      { actor: "ADMIN" },
      { occurredAt: occurredAt.toISOString() },
      { correlationId },
      { reason: "CLIENT_REASON" },
      { outboxPolicy: "SEND" },
      { emitCustomerOutbox: true },
      { unknown: true },
    ];
    for (const injected of forbidden) {
      const verifyOpportunity = vi.fn();
      const response = await handleAdminVerifyOpportunityRequest(
        request({ ...opportunityBody(), ...injected }),
        { opportunityId },
        { ...pipelineDependencies(), verifyOpportunity },
      );
      expect(response.status, JSON.stringify(injected)).toBe(400);
      expect(verifyOpportunity).not.toHaveBeenCalled();
    }
  });

  it("rejects incomplete, mixed, or unbounded candidates and invalid Evidence references", async () => {
    for (const body of [
      opportunityBody({ title: "incomplete" }),
      opportunityBody({ ...nativeState, displayTitle: "mixed" }),
      opportunityBody({ ...nativeState, title: "x".repeat(501) }),
      { ...opportunityBody(), evidence: { evidenceRole: "x".repeat(101) } },
      {
        ...opportunityBody(),
        evidence: { observationId: "0", evidenceRole: "PRIMARY" },
      },
      { ...opportunityBody(), expectedCurrentVersionId: "not-a-uuid" },
    ]) {
      const verifyOpportunity = vi.fn();
      const response = await handleAdminVerifyOpportunityRequest(
        request(body),
        { opportunityId },
        { ...pipelineDependencies(), verifyOpportunity },
      );
      expect(response.status).toBe(400);
      expect(verifyOpportunity).not.toHaveBeenCalled();
    }
  });

  it("rejects prototype-sensitive own keys recursively before context or command creation", async () => {
    const ordinary = JSON.stringify(opportunityBody());
    const maliciousBodies = [
      ordinary.replace("{", '{"__proto__":{"polluted":true},'),
      ordinary.replace(
        '"proposedState":{',
        '"proposedState":{"__proto__":{"polluted":true},',
      ),
      ordinary.replace(
        '"evidence":{',
        '"evidence":{"__proto__":{"polluted":true},',
      ),
      ordinary.replace(
        '"proposedState":{',
        '"proposedState":{"constructor":{"polluted":true},',
      ),
      ordinary.replace(
        '"evidence":{',
        '"evidence":{"prototype":{"polluted":true},',
      ),
    ];
    for (const rawBody of maliciousBodies) {
      const verifyOpportunity = vi.fn();
      const pipeline = pipelineDependencies();
      const response = await handleAdminVerifyOpportunityRequest(
        rawRequest(rawBody),
        { opportunityId },
        { ...pipeline, verifyOpportunity },
      );
      expect(response.status).toBe(400);
      expect(pipeline.createContext).not.toHaveBeenCalled();
      expect(verifyOpportunity).not.toHaveBeenCalled();
      expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    }
  });

  it("accepts only exact absolute HTTP(S) candidate action URLs with no surrounding whitespace", async () => {
    for (const proposedState of [
      { ...nativeState, actionUrl: "javascript:alert(1)" },
      { ...nativeState, actionUrl: "ftp://official.example.test/apply" },
      { ...legacyState, actionUrl: "mailto:admin@example.test" },
      { ...legacyState, actionUrl: " https://official.example.test/apply" },
      { ...nativeState, actionUrl: "https://" },
      { ...nativeState, actionUrl: "https://exa\nmple.test/apply" },
      { ...legacyState, actionUrl: "https://example.test/a\tb" },
      { ...nativeState, actionUrl: "https://example.test/a b" },
      { ...legacyState, actionUrl: "https:/official.example.test/apply" },
      { ...nativeState, actionUrl: "https:\\official.example.test\\apply" },
      {
        ...legacyState,
        actionUrl: "https://user:secret@official.example.test/apply",
      },
      { ...nativeState, actionUrl: "HTTPS://official.example.test/apply" },
      { ...legacyState, actionUrl: "https://Official.Example.test/apply" },
      {
        ...nativeState,
        actionUrl: "https://official.example.test:443/apply",
      },
      { ...legacyState, actionUrl: "https://official.example.test/a/../b" },
      { ...nativeState, actionUrl: "https://official.example.test/a\u00a0b" },
      { ...legacyState, actionUrl: "https://official.example.test/a\u0001b" },
    ]) {
      const verifyOpportunity = vi.fn();
      const response = await handleAdminVerifyOpportunityRequest(
        request(opportunityBody(proposedState)),
        { opportunityId },
        { ...pipelineDependencies(), verifyOpportunity },
      );
      expect(response.status, proposedState.actionUrl).toBe(400);
      expect(verifyOpportunity).not.toHaveBeenCalled();
    }

    for (const actionUrl of [
      "https://official.example.test",
      "https://official.example.test/",
      "https://official.example.test/apply?year=2027#form",
      "https://official.example.test/apply",
      "http://localhost:3000/apply",
    ]) {
      const verifyOpportunity = vi.fn(async () => opportunityResult());
      const response = await handleAdminVerifyOpportunityRequest(
        request(opportunityBody({ ...nativeState, actionUrl })),
        { opportunityId },
        { ...pipelineDependencies(), verifyOpportunity },
      );
      expect(response.status).toBe(200);
      expect(verifyOpportunity).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          proposedState: expect.objectContaining({ actionUrl }),
        }),
      );
    }
  });
});

describe("WP-11 Admin Institution Fact verification HTTP adapter", () => {
  it("takes institution and exact Fact type only from the path and delegates once", async () => {
    const verifyInstitutionFact = vi.fn(async () => ({
      institutionId,
      institutionFactId: randomUUID(),
      factType: "TUITION" as const,
      outcome: "CHANGED" as const,
      previousVersionId: currentVersionId,
      currentVersionId: randomUUID(),
      evidenceId: randomUUID(),
      verifiedAt: occurredAt.toISOString(),
    }));
    const dependencies: AdminVerifyInstitutionFactRequestDependencies = {
      ...pipelineDependencies(),
      verifyInstitutionFact,
    };
    const body = factBody();
    const response = await handleAdminVerifyInstitutionFactRequest(
      request(body),
      { institutionId, factType: "TUITION" },
      dependencies,
    );

    expect(response.status).toBe(200);
    expect(verifyInstitutionFact).toHaveBeenCalledTimes(1);
    expect(verifyInstitutionFact).toHaveBeenCalledWith(
      {
        adminUserId,
        reason: "ADMIN_VERIFY_INSTITUTION_FACT",
        occurredAt,
        correlationId,
      },
      { institutionId, factType: "TUITION", ...body },
    );
  });

  it("rejects invalid path Fact types, path-owned duplicates, policy fields, malformed values, and unknown fields", async () => {
    const cases = [
      { path: { institutionId, factType: "NOT_A_FACT" }, body: factBody() },
      {
        path: { institutionId, factType: "TUITION" },
        body: { ...factBody(), institutionId },
      },
      {
        path: { institutionId, factType: "TUITION" },
        body: { ...factBody(), factType: "TUITION" },
      },
      {
        path: { institutionId, factType: "TUITION" },
        body: { ...factBody(), truthMode: "NATIVE" },
      },
      {
        path: { institutionId, factType: "TUITION" },
        body: { ...factBody(), changeType: "MAJOR" },
      },
      {
        path: { institutionId, factType: "TUITION" },
        body: { ...factBody(), adminUserId },
      },
      {
        path: { institutionId, factType: "TUITION" },
        body: { ...factBody(), reason: "CLIENT_REASON" },
      },
      {
        path: { institutionId, factType: "TUITION" },
        body: { ...factBody(), outboxPolicy: "SEND" },
      },
      {
        path: { institutionId, factType: "TUITION" },
        body: { ...factBody(), materialityOverride: "NOTIFIABLE" },
      },
      {
        path: { institutionId, factType: "TUITION" },
        body: { ...factBody(), unknown: true },
      },
      {
        path: { institutionId, factType: "TUITION" },
        body: {
          ...factBody(),
          proposedState: {
            ...factBody().proposedState,
            validFrom: "2026-09-02T00:00:00.000Z",
            validUntil: "2026-09-01T00:00:00.000Z",
          },
        },
      },
    ];
    for (const item of cases) {
      const verifyInstitutionFact = vi.fn();
      const response = await handleAdminVerifyInstitutionFactRequest(
        request(item.body),
        item.path,
        { ...pipelineDependencies(), verifyInstitutionFact },
      );
      expect(response.status, JSON.stringify(item).slice(0, 120)).toBe(400);
      expect(verifyInstitutionFact).not.toHaveBeenCalled();
    }
  });

  it("rejects prototype-sensitive keys inside Fact value objects and arrays before delegation", async () => {
    const ordinary = JSON.stringify({
      ...factBody(),
      proposedState: {
        ...factBody().proposedState,
        valueJson: { rows: [{ currency: "KRW" }] },
      },
    });
    for (const key of ["__proto__", "constructor", "prototype"]) {
      const rawBody = ordinary.replace(
        '{"currency":"KRW"}',
        `{"${key}":{"polluted":true},"currency":"KRW"}`,
      );
      const verifyInstitutionFact = vi.fn();
      const pipeline = pipelineDependencies();
      const response = await handleAdminVerifyInstitutionFactRequest(
        rawRequest(rawBody),
        { institutionId, factType: "TUITION" },
        { ...pipeline, verifyInstitutionFact },
      );
      expect(response.status).toBe(400);
      expect(pipeline.createContext).not.toHaveBeenCalled();
      expect(verifyInstitutionFact).not.toHaveBeenCalled();
      expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    }
  });
});

describe("WP-11 verification candidate UI behavior", () => {
  it("preserves explicit-offset date-times and rejects ambiguous local/date-only/invalid values", () => {
    expect(parseExplicitOffsetDateTimeCandidate("2026-09-01T09:00:00Z")).toBe(
      "2026-09-01T09:00:00Z",
    );
    expect(parseExplicitOffsetDateTimeCandidate("2026-09-01T09:00Z")).toBe(
      "2026-09-01T09:00Z",
    );
    expect(
      parseExplicitOffsetDateTimeCandidate("2026-09-01T09:00:00+09:00"),
    ).toBe("2026-09-01T09:00:00+09:00");
    expect(parseExplicitOffsetDateTimeCandidate("")).toBeNull();
    for (const invalid of [
      "2026-09-01T09:00:00",
      "2026-09-01",
      "2026-02-30T09:00:00Z",
      " 2026-09-01T09:00:00Z",
      "2026-09-01T09:00:00Z ",
      "not-a-date",
    ]) {
      expect(() => parseExplicitOffsetDateTimeCandidate(invalid)).toThrow(
        "명시적 시간대",
      );
    }
  });

  it("preserves exact canonical Action URLs and rejects repaired or normalized input before fetch", () => {
    for (const valid of [
      "https://official.example.test",
      "https://official.example.test/",
      "https://official.example.test/apply?year=2027#form",
      "http://localhost:3000/apply",
    ]) {
      expect(parseExactActionUrlCandidate(valid)).toBe(valid);
    }
    expect(parseExactActionUrlCandidate("")).toBeNull();
    for (const invalid of [
      " https://official.example.test/apply",
      "https://official.example.test/apply ",
      "https://example.test/a b",
      "https://exa\nmple.test/apply",
      "https:/official.example.test/apply",
      "https:\\official.example.test\\apply",
      "HTTPS://official.example.test/apply",
      "https://Official.Example.test/apply",
      "https://official.example.test:443/apply",
      "https://user:secret@official.example.test/apply",
    ]) {
      expect(() => parseExactActionUrlCandidate(invalid)).toThrow(
        "정확한 HTTP(S)",
      );
    }

    const crafted = new FormData();
    for (const [key, value] of Object.entries({
      expectedCurrentVersionId: currentVersionId,
      sourceId,
      knowledgeState: "KNOWN",
      eventStatus: "ACTIVE",
      displayTitle: "Applications",
      timezone: "Asia/Seoul",
      actionUrl: " https://official.example.test/apply",
    })) {
      crafted.set(key, value);
    }
    const legacyDetail = {
      kind: "OPPORTUNITY_LEGACY" as const,
      expectedCurrentVersionId: currentVersionId,
    } as Parameters<typeof buildOpportunityCandidateBody>[0];
    expect(() => buildOpportunityCandidateBody(legacyDetail, crafted)).toThrow(
      "정확한 HTTP(S)",
    );
  });

  it("round-trips every safe projected Legacy field without exposing officialNotes", () => {
    const form = new FormData();
    const fields = {
      expectedCurrentVersionId: currentVersionId,
      sourceId,
      observationId: "42",
      knowledgeState: "KNOWN",
      eventStatus: "ACTIVE",
      displayTitle: "2027 Applications",
      eventStartDate: "2026-08-01",
      eventStartTime: "09:00:00",
      eventEndDate: "2026-08-31",
      eventEndTime: "18:00:00",
      registrationOpenDate: "2026-08-02",
      registrationOpenTime: "10:00:00",
      registrationCloseDate: "2026-08-30",
      registrationCloseTime: "17:00:00",
      timezone: "Asia/Seoul",
      venue: "Main campus",
      actionUrl: "https://official.example.test/apply",
      officialNotes: "",
    } as const;
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    const detail = {
      kind: "OPPORTUNITY_LEGACY" as const,
      expectedCurrentVersionId: currentVersionId,
    } as Parameters<typeof buildOpportunityCandidateBody>[0];

    expect(buildOpportunityCandidateBody(detail, form)).toEqual({
      expectedCurrentVersionId: currentVersionId,
      sourceId,
      evidence: { evidenceRole: "PRIMARY", observationId: "42" },
      proposedState: {
        knowledgeState: "KNOWN",
        eventStatus: "ACTIVE",
        displayTitle: "2027 Applications",
        eventStartDate: "2026-08-01",
        eventStartTime: "09:00:00",
        eventEndDate: "2026-08-31",
        eventEndTime: "18:00:00",
        registrationOpenDate: "2026-08-02",
        registrationOpenTime: "10:00:00",
        registrationCloseDate: "2026-08-30",
        registrationCloseTime: "17:00:00",
        timezone: "Asia/Seoul",
        venue: "Main campus",
        actionUrl: "https://official.example.test/apply",
        officialNotes: null,
      },
    });
  });
});

describe("WP-11 Admin verification route and UI contracts", () => {
  it("keeps both Route Handlers as thin default-composition delegates", async () => {
    const [opportunityRoute, factRoute] = await Promise.all([
      readFile(
        resolve(
          repositoryRoot,
          "app/api/admin/opportunities/[opportunityId]/verify/route.ts",
        ),
        "utf8",
      ),
      readFile(
        resolve(
          repositoryRoot,
          "app/api/admin/institutions/[institutionId]/facts/[factType]/verify/route.ts",
        ),
        "utf8",
      ),
    ]);
    expect(opportunityRoute).toContain("handleAdminVerifyOpportunityRequest");
    expect(opportunityRoute).toContain("await context.params");
    expect(factRoute).toContain("handleAdminVerifyInstitutionFactRequest");
    expect(factRoute).toContain("await context.params");
    for (const route of [opportunityRoute, factRoute]) {
      expect(route).not.toMatch(
        /getRuntimeDatabase|insert\s|update\s|delete\s/i,
      );
    }
  });

  it("posts candidate-only forms, announces success, and reloads after success or 409 without automatic resubmission", async () => {
    const source = await readFile(
      resolve(repositoryRoot, "app/admin/_components/monitoring-actions.tsx"),
      "utf8",
    );
    expect(source).toContain("/api/admin/opportunities/");
    expect(source).toContain("/api/admin/institutions/");
    expect(source).toContain("Verification committed:");
    expect(source).toContain(
      "다른 운영자가 먼저 변경했을 수 있습니다. 최신 데이터를 다시 확인한 뒤 변경 여부를 판단해주세요.",
    );
    expect(source).toContain("window.location.reload()");
    expect(source.match(/fetch\(/g)).toHaveLength(2);
    expect(source.indexOf("const candidate = buildBody")).toBeLessThan(
      source.indexOf("const response = await fetch"),
    );
    expect(source).not.toMatch(/auto.?merge|last.?write.?wins|auto.?resubmit/i);
    for (const clientOwned of [
      "truthMode",
      "changeType",
      "adminUserId",
      "occurredAt",
      "correlationId",
      "outboxPolicy",
    ]) {
      expect(source).not.toContain(`name=\"${clientOwned}\"`);
    }
  });
});
