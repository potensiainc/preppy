import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { OperationalSnapshot } from "@/src/modules/production-safety/operational-snapshot.server";

describe("WP-16A Admin Operations observability", () => {
  it("renders the read-only operational snapshot without controls or deep public health changes", async () => {
    const page = await vi.importActual<
      typeof import("@/app/admin/(protected)/operations/health/page")
    >("@/app/admin/(protected)/operations/health/page");
    const operational: OperationalSnapshot = {
      checkedAt: "2026-08-25T00:00:00.000Z",
      consistency: "POINT_IN_TIME_PER_QUERY",
      database: "AVAILABLE",
      migration: { status: "MATCH", latest: "0010_colorful_randall_flagg" },
      outbox: {
        pending: 4,
        failed: 2,
        deadLetter: 1,
        staleProcessing: 3,
        oldestStaleProcessingAgeSeconds: 901,
        workerLagSeconds: 120,
      },
      notification: { failedDeliveries: 2, resultUnknown: 1 },
      providerEvents: { failed: 1, orphan: 1 },
      monitoring: { due: 5, overdue: 2, sourceUnavailable: 1 },
      cacheRevalidation: { failed: 1, deadLetter: 1, staleProcessing: 1 },
      analytics: {
        telemetry: "NOT_PERSISTED",
        transportFailureCount: null,
        readinessImpact: "BEST_EFFORT",
      },
      alerts: [
        { code: "DELIVERY_RESULT_UNKNOWN", severity: "CRITICAL", count: 1 },
      ],
    };
    const markup = renderToStaticMarkup(
      createElement(page.AdminOperationsHealthView, {
        health: {
          status: "ATTENTION",
          checkedAt: operational.checkedAt,
          database: { status: "AVAILABLE" },
          outbox: {
            status: "AVAILABLE",
            pending: 4,
            processing: 3,
            failed: 2,
            deadLetter: 1,
          },
          dataQuality: {
            status: "AVAILABLE",
            warningCount: 0,
            affectedRecordCount: 0,
            unavailableCheckCount: 0,
          },
        },
        dataQuality: {
          status: "AVAILABLE",
          checkedAt: operational.checkedAt,
          warnings: [],
        },
        operational,
      }),
    );
    for (const label of [
      "워커 지연",
      "장시간 처리 중",
      "RESULT UNKNOWN",
      "점검 기한 초과",
      "발송 업체 이벤트 실패",
      "캐시 실패",
    ]) {
      expect(markup).toContain(label);
    }
    expect(markup).not.toMatch(/<button|<form|action=|method=/i);

    const publicHealth = await import("@/app/api/health/route");
    expect(await (await publicHealth.GET()).json()).toEqual({
      status: "ok",
      service: "admissionradar",
    });
  });
});
