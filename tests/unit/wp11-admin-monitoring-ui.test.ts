import { createElement } from "react";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  institutionSourceBindingRoleValues,
  opportunitySourceBindingRoleValues,
} from "@/src/db/schema";

const repositoryRoot = resolve(import.meta.dirname, "../..");

type MonitoringInputModule = Readonly<{
  parseMonitoringAdminQueueInput: (value: unknown) => unknown;
  parseMonitoringAdminDetailInput: (value: unknown) => unknown;
}>;

async function importMonitoringInput(): Promise<MonitoringInputModule | null> {
  try {
    return (await vi.importActual(
      "@/src/modules/admin/read-model/monitoring-query.server",
    )) as MonitoringInputModule;
  } catch {
    return null;
  }
}

async function importMonitoringUi() {
  try {
    return await Promise.all([
      vi.importActual<typeof import("@/app/admin/(protected)/monitoring/page")>(
        "@/app/admin/(protected)/monitoring/page",
      ),
      vi.importActual<
        typeof import("@/app/admin/_components/monitoring-detail")
      >("@/app/admin/_components/monitoring-detail"),
    ] as const);
  } catch {
    return null;
  }
}

const queueRow = {
  bindingId:
    "OPPORTUNITY:a9fe13f7-ad24-4f47-aeca-18b170179450:e77be50a-f834-4be6-8cc6-1da7a1a7c2c0:PRIMARY_NOTICE",
  targetType: "OPPORTUNITY" as const,
  targetId: "a9fe13f7-ad24-4f47-aeca-18b170179450",
  detailHref:
    "/admin/monitoring/OPPORTUNITY/a9fe13f7-ad24-4f47-aeca-18b170179450/e77be50a-f834-4be6-8cc6-1da7a1a7c2c0/PRIMARY_NOTICE",
  institution: {
    id: "cc24e723-2eaa-4ce3-91a2-3646aaf1ef89",
    displayName: "Seoul Academy",
    category: "INTERNATIONAL_SCHOOL",
  },
  opportunity: {
    id: "a9fe13f7-ad24-4f47-aeca-18b170179450",
    slug: "seoul-applications",
    kind: "APPLICATION",
    truthMode: "NATIVE" as const,
  },
  source: {
    id: "e77be50a-f834-4be6-8cc6-1da7a1a7c2c0",
    sourceName: "Official admissions",
    canonicalUrl: "https://official.example.test/admissions",
    safeUrl: "https://official.example.test/admissions",
    lifecycleStatus: "ACTIVE",
    sourceType: "OFFICIAL_ADMISSION_PAGE",
    authorityLevel: "PRIMARY",
  },
  role: "PRIMARY_NOTICE",
  isPrimary: true,
  priority: "P0_ACTIVE" as const,
  dueState: "OVERDUE" as const,
  dueReason: "P0_ACTIVE_CADENCE",
  lastCheckedAt: "2026-08-20T00:00:00.000Z",
  nextDueAt: "2026-08-20T01:00:00.000Z",
  currentTruthSummary: {
    kind: "OPPORTUNITY" as const,
    businessState: "OPEN",
    title: "2027 Applications",
    relevantAt: "2026-08-01T00:00:00.000Z",
  },
};

function cursorForBindingId(bindingId: string): string {
  return Buffer.from(
    JSON.stringify({
      v: 1,
      dueState: "DUE",
      priority: "P2_WATCH",
      nextDueAt: null,
      bindingId,
    }),
    "utf8",
  ).toString("base64url");
}

const nativeDetail = {
  kind: "OPPORTUNITY_NATIVE" as const,
  expectedCurrentVersionId: "ae02365c-9318-4afa-8fc0-d2a61fea3d08",
  binding: {
    targetType: "OPPORTUNITY" as const,
    targetId: queueRow.targetId,
    sourceId: queueRow.source.id,
    role: queueRow.role,
    isPrimary: true,
  },
  schedule: {
    priority: queueRow.priority,
    dueState: queueRow.dueState,
    dueReason: queueRow.dueReason,
    lastCheckedAt: queueRow.lastCheckedAt,
    nextDueAt: queueRow.nextDueAt,
  },
  institution: queueRow.institution,
  source: queueRow.source,
  latestObservation: {
    id: "42",
    observedAt: queueRow.lastCheckedAt,
    outcome: "CHANGED",
    httpStatus: 200,
    errorCode: null,
  },
  opportunity: {
    ...queueRow.opportunity,
    publicationState: "PUBLISHED",
  },
  currentTruth: {
    versionId: "ae02365c-9318-4afa-8fc0-d2a61fea3d08",
    versionNumber: 2,
    businessState: "OPEN",
    title: "2027 Applications",
    summary: "Applications are open.",
    targetAudience: "Families",
    eventStartAt: null,
    eventEndAt: null,
    applicationOpenAt: "2026-08-01T00:00:00.000Z",
    applicationCloseAt: "2026-09-01T00:00:00.000Z",
    actionUrl: "https://official.example.test/apply",
    locationText: null,
    validFrom: null,
    validUntil: null,
    verifiedAt: "2026-08-20T00:00:00.000Z",
  },
};

describe("WP-11 Admin Monitoring inputs", () => {
  it("keeps Task 7 and 8 production read projections on explicit select lists", async () => {
    // Mutation caught: a bounded projection reintroduces select * and silently widens its data surface when a CTE/table gains a column.
    const projectionPaths = [
      "src/modules/admin/read-model/article-query.server.ts",
      "src/modules/admin/read-model/dashboard-query.server.ts",
      "src/modules/admin/read-model/institution-query.server.ts",
      "src/modules/admin/read-model/notification-query.server.ts",
      "src/modules/admin/read-model/opportunity-query.server.ts",
      "src/modules/admin/read-model/source-query.server.ts",
      "src/modules/admin/read-model/user-query.server.ts",
      "src/modules/admin/read-model/monitoring-query.server.ts",
      "src/modules/admin/read-model/monitoring-detail-query.server.ts",
      "src/modules/monitoring/queue-query.server.ts",
      "src/modules/monitoring/repository.server.ts",
    ] as const;

    for (const path of projectionPaths) {
      const source = await readFile(resolve(repositoryRoot, path), "utf8");
      expect(source, path).not.toMatch(/\bselect\s+\*/i);
    }
  });

  it("maps singleton/repeated URL values to the exact strict queue filter shape", async () => {
    // Mutation caught: URL fields pass through as scalars, unknown fields survive, or role/target combinations are not validated.
    const input = await importMonitoringInput();
    expect(input).not.toBeNull();
    if (!input) return;

    expect(
      input.parseMonitoringAdminQueueInput({
        dueState: ["OVERDUE", "DUE"],
        priority: "P0_ACTIVE",
        targetType: "OPPORTUNITY",
        role: ["PRIMARY_NOTICE", "SUPPORTING"],
        sourceLifecycle: "ACTIVE",
        pageSize: "25",
      }),
    ).toEqual({
      dueState: ["OVERDUE", "DUE"],
      priority: ["P0_ACTIVE"],
      targetType: ["OPPORTUNITY"],
      role: ["PRIMARY_NOTICE", "SUPPORTING"],
      sourceLifecycle: ["ACTIVE"],
      pageSize: 25,
      cursor: null,
    });
    const unknownCursor = Buffer.from(
      JSON.stringify({ v: 1, unknown: true }),
      "utf8",
    ).toString("base64url");
    const malformedPayloadCursor = Buffer.from("not-json", "utf8").toString(
      "base64url",
    );
    for (const invalid of [
      { unexpected: "field" },
      { dueState: "LATE" },
      { dueState: ["DUE", "DUE", "DUE", "DUE", "DUE"] },
      { pageSize: "51" },
      { cursor: "x".repeat(513) },
      { cursor: "not_base64url!" },
      { cursor: unknownCursor },
      { cursor: malformedPayloadCursor },
    ]) {
      expect(() => input.parseMonitoringAdminQueueInput(invalid)).toThrowError(
        expect.objectContaining({ code: "VALIDATION_ERROR", status: 400 }),
      );
    }
    expect(
      input.parseMonitoringAdminDetailInput({
        targetType: "OPPORTUNITY",
        targetId: queueRow.targetId,
        sourceId: queueRow.source.id,
        role: "PRIMARY_NOTICE",
      }),
    ).toMatchObject({ targetType: "OPPORTUNITY", role: "PRIMARY_NOTICE" });
    expect(() =>
      input.parseMonitoringAdminDetailInput({
        targetType: "INSTITUTION",
        targetId: queueRow.targetId,
        sourceId: queueRow.source.id,
        role: "PRIMARY_NOTICE",
      }),
    ).toThrow();
  });

  it("accepts only exact target-specific canonical binding keys in queue cursors", async () => {
    // Mutation caught: an impossible cross-domain/unknown role or a case/delimiter variant becomes a trusted comparator seek key.
    const input = await importMonitoringInput();
    expect(input).not.toBeNull();
    if (!input) return;

    const targetId = queueRow.targetId;
    const sourceId = queueRow.source.id;
    for (const role of institutionSourceBindingRoleValues) {
      const cursor = cursorForBindingId(
        `INSTITUTION:${targetId}:${sourceId}:${role}`,
      );
      expect(input.parseMonitoringAdminQueueInput({ cursor })).toMatchObject({
        cursor,
      });
    }
    for (const role of opportunitySourceBindingRoleValues) {
      const cursor = cursorForBindingId(
        `OPPORTUNITY:${targetId}:${sourceId}:${role}`,
      );
      expect(input.parseMonitoringAdminQueueInput({ cursor })).toMatchObject({
        cursor,
      });
    }

    const invalidBindingIds = [
      `INSTITUTION:${targetId}:${sourceId}:PRIMARY_NOTICE`,
      `OPPORTUNITY:${targetId}:${sourceId}:TUITION`,
      `INSTITUTION:${targetId}:${sourceId}:FAKE_ROLE`,
      `INSTITUTION:${targetId}:${sourceId}:OTHER:SUPPORTING`,
      `INSTITUTION:${targetId.toUpperCase()}:${sourceId}:OTHER`,
      `institution:${targetId}:${sourceId}:OTHER`,
      `INSTITUTION%3A${targetId}%3A${sourceId}%3AOTHER`,
    ] as const;
    for (const bindingId of invalidBindingIds) {
      expect(() =>
        input.parseMonitoringAdminQueueInput({
          cursor: cursorForBindingId(bindingId),
        }),
      ).toThrowError(
        expect.objectContaining({ code: "VALIDATION_ERROR", status: 400 }),
      );
    }

    const validBindingId = `INSTITUTION:${targetId}:${sourceId}:OTHER`;
    const nonCanonicalJsonCursor = Buffer.from(
      JSON.stringify({
        bindingId: validBindingId,
        nextDueAt: null,
        priority: "P2_WATCH",
        dueState: "DUE",
        v: 1,
      }),
      "utf8",
    ).toString("base64url");
    expect(() =>
      input.parseMonitoringAdminQueueInput({ cursor: nonCanonicalJsonCursor }),
    ).toThrowError(
      expect.objectContaining({ code: "VALIDATION_ERROR", status: 400 }),
    );
  });
});

describe("WP-11 Admin Monitoring UI", () => {
  it("renders canonical order, text states, safe links, and a bounded filter surface", async () => {
    // Mutation caught: the list reorders rows in the component, hides state behind color alone, leaks bindingId into routing, or gains unsupported filters.
    const ui = await importMonitoringUi();
    expect(ui).not.toBeNull();
    if (!ui) return;
    const [page] = ui;
    const markup = renderToStaticMarkup(
      createElement(page.AdminMonitoringView, {
        data: {
          items: [queueRow],
          pageSize: 25,
          hasNext: true,
          nextCursor: "eyJ2IjoxfQ",
        },
        query: { dueState: ["OVERDUE"], pageSize: 25, cursor: null },
      }),
    );

    expect(markup).toContain("모니터링 대기열");
    expect(markup).toContain("OVERDUE");
    expect(markup).toContain("P0 ACTIVE");
    expect(markup).toContain(`href="${queueRow.detailHref}"`);
    expect(markup).not.toContain(`href="${queueRow.bindingId}"`);
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noopener noreferrer"');
    for (const label of [
      "점검 기한 상태",
      "우선순위",
      "대상 유형",
      "연결 역할",
      "출처 상태 관리",
    ]) {
      expect(markup).toContain(label);
    }
    expect(markup).not.toContain("truthMode filter");
    expect(markup).toContain("다음 대기열 페이지");
    expect(markup).toContain("dueState=OVERDUE");
    expect(markup).toContain("cursor=eyJ2IjoxfQ");
  });

  it("renders server-owned No Change plus candidate-only actions with explicit confirmations and two non-inferred Source move modes", async () => {
    // Mutation caught: No Change stays a fake review affordance, a form accepts server-owned decisions, Source modes collapse into one inferred control, or destructive confirmations disappear.
    const ui = await importMonitoringUi();
    expect(ui).not.toBeNull();
    if (!ui) return;
    const [, detail] = ui;
    const markup = renderToStaticMarkup(
      createElement(detail.MonitoringDetail, { detail: nativeDetail }),
    );

    expect(markup).toContain("현재 기준 정보");
    expect(markup).toContain("최근 수집 결과");
    expect(markup).toContain("CHANGED");
    expect(markup).toContain("변경 없음");
    expect(markup).toContain("변경 없음 기록");
    expect(markup).toMatch(
      /<textarea(?=[^>]*name="note")(?=[^>]*maxLength="500")[^>]*>/,
    );
    expect(markup).toContain("변경 내용 등록");
    expect(markup).toMatch(/<option value="OPEN" selected="">OPEN<\/option>/);
    expect(markup).toContain('name="targetAudience"');
    expect(markup).toContain('value="Families"');
    expect(markup).toContain("출처 확인 실패");
    expect(markup).toContain("출처 연결");
    expect(markup).toContain("출처 연결 해제");
    expect(markup).toContain("URL 수정");
    expect(markup).toContain("출처 교체");
    expect(markup).toContain("같은 공식 출처");
    expect(markup).toContain("기존 근거 자료는 이전 출처에 그대로 남아요");
    expect(markup).toContain('value="CREATE"');
    expect(markup).toContain('value="REUSE"');
    for (const confirmationName of [
      "provenanceContinuityConfirmed",
      "replacementConfirmed",
      "unbindConfirmed",
    ]) {
      expect(markup).toMatch(
        new RegExp(
          `<input(?=[^>]*name="${confirmationName}")(?=[^>]*required)[^>]*>`,
        ),
      );
    }
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('tabindex="-1"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain("aria-describedby=");
    expect(markup).toContain('class="admin-monitoring-actions"');
    for (const forbidden of [
      "truthMode",
      "changeType",
      "adminUserId",
      "outbox",
      "snapshot",
      "raw evidence",
    ]) {
      expect(markup).not.toContain(`name="${forbidden}"`);
    }
  });

  it("renders safe invalid-filter guidance without an empty operational table", async () => {
    // Mutation caught: malformed query input becomes a blank queue or exposes validation internals instead of a safe recovery path.
    const ui = await importMonitoringUi();
    expect(ui).not.toBeNull();
    if (!ui) return;
    const [page] = ui;
    const markup = renderToStaticMarkup(
      createElement(page.AdminMonitoringView, {
        data: {
          items: [],
          pageSize: 25,
          hasNext: false,
          nextCursor: null,
        },
        query: { pageSize: 25, cursor: null },
        invalidFilter: true,
      }),
    );
    expect(markup).toContain("필터를 적용하지 못했어요");
    expect(markup).toContain('href="/admin/monitoring"');
    expect(markup).not.toContain("VALIDATION_ERROR");
    expect(markup).not.toContain("<table");
  });

  it("renders Legacy-backed candidate fields without pretending they are Native truth", async () => {
    // Mutation caught: the Legacy form posts Native business-state fields instead of the legacy event/knowledge candidate contract.
    const ui = await importMonitoringUi();
    expect(ui).not.toBeNull();
    if (!ui) return;
    const [, detail] = ui;
    const legacyDetail = {
      ...nativeDetail,
      kind: "OPPORTUNITY_LEGACY" as const,
      opportunity: {
        ...nativeDetail.opportunity,
        truthMode: "LEGACY_BACKED" as const,
      },
      currentTruth: {
        versionId: nativeDetail.currentTruth.versionId,
        versionNumber: 4,
        verificationStatus: "VERIFIED",
        knowledgeState: "KNOWN",
        eventStatus: "ACTIVE",
        displayTitle: "2027 Legacy Applications",
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
        actionUrl: null,
        verifiedAt: "2026-08-20T00:00:00.000Z",
      },
    };
    const markup = renderToStaticMarkup(
      createElement(detail.MonitoringDetail, { detail: legacyDetail }),
    );
    expect(markup).toContain('name="knowledgeState"');
    expect(markup).toContain('name="eventStatus"');
    expect(markup).toContain('name="displayTitle"');
    expect(markup).toContain('name="registrationCloseDate"');
    expect(markup).toMatch(
      /<input(?=[^>]*name="registrationOpenDate")(?=[^>]*value="2026-08-01")[^>]*>/,
    );
    expect(markup).toMatch(
      /<input(?=[^>]*name="registrationCloseDate")(?=[^>]*value="2026-08-31")[^>]*>/,
    );
    expect(markup).toMatch(/<option value="KNOWN" selected="">KNOWN<\/option>/);
    expect(markup).toMatch(
      /<option value="ACTIVE" selected="">ACTIVE<\/option>/,
    );
    expect(markup).toContain('name="eventStartTime"');
    expect(markup).toContain('value="09:00:00"');
    expect(markup).not.toContain('name="businessState"');
  });

  it("does not expose a materiality override for an initial Native candidate", async () => {
    // Mutation caught: the UI offers a command option that the canonical initial-create contract must reject.
    const ui = await importMonitoringUi();
    expect(ui).not.toBeNull();
    if (!ui) return;
    const [, detail] = ui;
    const markup = renderToStaticMarkup(
      createElement(detail.MonitoringDetail, {
        detail: {
          ...nativeDetail,
          expectedCurrentVersionId: null,
          currentTruth: null,
        },
      }),
    );
    expect(markup).not.toContain('name="materialityPair"');
    expect(markup).not.toContain("Materiality override");
  });
});
