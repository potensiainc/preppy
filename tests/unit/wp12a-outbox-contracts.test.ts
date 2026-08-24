import { describe, expect, it } from "vitest";

import {
  isSupportedOutboxEventType,
  parseOutboxPayload,
  supportedOutboxEventTypes,
} from "@/src/modules/outbox/events";
import {
  parseClaimOutboxBatchInput,
  parseOutboxTransitionInput,
} from "@/src/modules/outbox/transitions.server";

describe("WP-12A typed Outbox contracts", () => {
  it("keeps the worker event registry closed", () => {
    expect(supportedOutboxEventTypes).toEqual([
      "OPPORTUNITY_CHANGE_PUBLISHED",
      "DELIVERY_EMAIL_SEND",
    ]);
    expect(isSupportedOutboxEventType("OPPORTUNITY_CHANGE_PUBLISHED")).toBe(
      true,
    );
    expect(isSupportedOutboxEventType("DELIVERY_EMAIL_SEND")).toBe(true);
    expect(isSupportedOutboxEventType("DYNAMIC_IMPORT_ME")).toBe(false);
  });

  it("accepts only the exact safe payload for each event", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const opportunityId = "22222222-2222-4222-8222-222222222222";
    expect(
      parseOutboxPayload("OPPORTUNITY_CHANGE_PUBLISHED", {
        opportunityId,
        opportunityChangeId: id,
        policyVersion: "OPPORTUNITY_NOTIFICATION_V1",
        signalPublishedAt: "2026-08-24T00:00:00.000Z",
      }),
    ).toEqual({
      opportunityId,
      opportunityChangeId: id,
      policyVersion: "OPPORTUNITY_NOTIFICATION_V1",
      signalPublishedAt: "2026-08-24T00:00:00.000Z",
    });
    expect(
      parseOutboxPayload("DELIVERY_EMAIL_SEND", { deliveryId: id }),
    ).toEqual({ deliveryId: id });
    expect(
      parseOutboxPayload("DELIVERY_EMAIL_SEND", {
        deliveryId: id,
        email: "must-not-enter-outbox@example.test",
      }),
    ).toBeNull();
    expect(parseOutboxPayload("DYNAMIC_IMPORT_ME", {})).toBeNull();
  });

  it("bounds claim inputs and rejects secret-shaped or invalid worker IDs", () => {
    const now = new Date("2026-08-24T00:00:00.000Z");
    expect(
      parseClaimOutboxBatchInput({
        eventTypes: ["OPPORTUNITY_CHANGE_PUBLISHED"],
        limit: 10,
        workerId: "worker-a.1",
        now,
      }),
    ).toEqual({
      eventTypes: ["OPPORTUNITY_CHANGE_PUBLISHED"],
      limit: 10,
      workerId: "worker-a.1",
      now,
    });
    expect(
      parseClaimOutboxBatchInput({
        eventTypes: ["UNKNOWN"],
        limit: 1,
        workerId: "worker-a",
        now,
      }),
    ).toBeNull();
    expect(
      parseClaimOutboxBatchInput({
        eventTypes: ["DELIVERY_EMAIL_SEND"],
        limit: 101,
        workerId: "worker-a",
        now,
      }),
    ).toBeNull();
    expect(
      parseClaimOutboxBatchInput({
        eventTypes: ["DELIVERY_EMAIL_SEND"],
        limit: 1,
        workerId: "Bearer secret value",
        now,
      }),
    ).toBeNull();
  });

  it("accepts only bounded canonical transition inputs", () => {
    const eventId = "11111111-1111-4111-8111-111111111111";
    const now = new Date("2026-08-24T00:00:00.000Z");
    expect(
      parseOutboxTransitionInput({
        eventId,
        workerId: "worker-a",
        now,
        errorCode: "EMAIL_TEMPORARY_FAILURE",
      }),
    ).toEqual({
      eventId,
      workerId: "worker-a",
      now,
      errorCode: "EMAIL_TEMPORARY_FAILURE",
    });
    expect(
      parseOutboxTransitionInput({
        eventId,
        workerId: "worker-a",
        now,
        errorCode: "raw provider body: recipient@example.test",
      }),
    ).toBeNull();
  });
});
