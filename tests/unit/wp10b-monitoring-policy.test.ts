import { describe, expect, it } from "vitest";

import {
  compareFactTruth,
  createBindingKey,
  deriveMonitoringSchedule,
  deriveOpportunitySignal,
} from "@/src/modules/monitoring/policy";

const now = new Date("2026-08-23T00:00:00.000Z");

describe("WP-10B monitoring policy", () => {
  it("makes an unobserved open Opportunity source immediately due on the daily cadence", () => {
    expect(
      deriveMonitoringSchedule({
        now,
        lastCheckedAt: null,
        institutionDormant: false,
        monitorEnabled: true,
        manualOnly: false,
        currentBusinessState: "OPEN",
        upcomingAt: null,
        customIntervalMinutes: null,
      }),
    ).toEqual({
      priority: "P0_ACTIVE",
      intervalMinutes: 1_440,
      nextDueAt: null,
      dueState: "DUE",
    });
  });

  it("keeps dormant sources manual even when their last check is old", () => {
    expect(
      deriveMonitoringSchedule({
        now,
        lastCheckedAt: new Date("2026-01-01T00:00:00.000Z"),
        institutionDormant: true,
        monitorEnabled: true,
        manualOnly: false,
        currentBusinessState: null,
        upcomingAt: null,
        customIntervalMinutes: 60,
      }),
    ).toEqual({
      priority: "P3_PASSIVE",
      intervalMinutes: null,
      nextDueAt: null,
      dueState: "MANUAL",
    });
  });

  it("uses the deterministic upcoming cadence unless a custom interval overrides it", () => {
    expect(
      deriveMonitoringSchedule({
        now,
        lastCheckedAt: new Date("2026-08-22T00:00:00.000Z"),
        institutionDormant: false,
        monitorEnabled: true,
        manualOnly: false,
        currentBusinessState: "UPCOMING",
        upcomingAt: new Date("2026-09-01T00:00:00.000Z"),
        customIntervalMinutes: 1_800,
      }),
    ).toEqual({
      priority: "P1_UPCOMING",
      intervalMinutes: 1_800,
      nextDueAt: new Date("2026-08-23T06:00:00.000Z"),
      dueState: "UPCOMING",
    });
  });

  it("classifies a deadline change as a notifiable canonical signal", () => {
    const current = {
      businessState: "OPEN" as const,
      title: "2027 Admissions",
      summary: "Apply now.",
      targetAudience: null,
      eventStartAt: null,
      eventEndAt: null,
      applicationOpenAt: new Date("2026-08-01T00:00:00.000Z"),
      applicationCloseAt: new Date("2026-09-01T00:00:00.000Z"),
      actionUrl: "https://school.example/apply",
      locationText: null,
      validFrom: null,
      validUntil: null,
    };

    expect(
      deriveOpportunitySignal(current, {
        ...current,
        applicationCloseAt: new Date("2026-09-08T00:00:00.000Z"),
      }),
    ).toEqual({
      changeType: "DEADLINE_CHANGED",
      materiality: "NOTIFIABLE",
      changedFields: ["applicationCloseAt"],
    });
  });

  it("keeps wording-only truth changes non-notifiable", () => {
    const current = {
      businessState: "UPCOMING" as const,
      title: "Open House",
      summary: "Meet our teachers.",
      targetAudience: null,
      eventStartAt: new Date("2026-10-01T01:00:00.000Z"),
      eventEndAt: null,
      applicationOpenAt: null,
      applicationCloseAt: null,
      actionUrl: null,
      locationText: "Main hall",
      validFrom: null,
      validUntil: null,
    };

    expect(
      deriveOpportunitySignal(current, {
        ...current,
        summary: "Meet our teachers!",
      }),
    ).toEqual({
      changeType: "MATERIAL_INFO_CHANGED",
      materiality: "NON_NOTIFIABLE",
      changedFields: ["summary"],
    });
  });

  it("treats object-key order as irrelevant for Institution Fact truth", () => {
    expect(
      compareFactTruth(
        {
          valueJson: { currency: "KRW", fee: 100 },
          displayText: "KRW 100",
          validFrom: null,
          validUntil: null,
        },
        {
          valueJson: { fee: 100, currency: "KRW" },
          displayText: "KRW 100",
          validFrom: null,
          validUntil: null,
        },
      ),
    ).toBe(false);
  });

  it("builds the canonical composite binding identity without persistence", () => {
    expect(
      createBindingKey({
        targetType: "INSTITUTION",
        targetId: "00000000-0000-4000-8000-000000000001",
        sourceId: "00000000-0000-4000-8000-000000000002",
        role: "OFFICIAL_MAIN",
      }),
    ).toBe(
      "INSTITUTION:00000000-0000-4000-8000-000000000001:00000000-0000-4000-8000-000000000002:OFFICIAL_MAIN",
    );
  });
});
