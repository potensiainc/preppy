import { describe, expect, it } from "vitest";

import {
  MIGRATION_OPPORTUNITY_BACKFILL_CONTEXT,
  mapLegacyEventTypeToOpportunityKind,
  opportunityIdForAdmissionEvent,
} from "@/src/infrastructure/db/opportunity-backfill.server";

describe("Opportunity backfill mapping", () => {
  it("derives a stable UUID independent from both the Event and Institution namespaces", () => {
    const eventId = "00000000-0000-4000-8000-000000000001";

    expect(opportunityIdForAdmissionEvent(eventId)).toBe(
      "530f6449-fe63-5270-ac9a-7567097b6508",
    );
    expect(opportunityIdForAdmissionEvent(eventId)).not.toBe(eventId);
    expect(opportunityIdForAdmissionEvent(eventId)).not.toBe(
      "bb935f67-4f6c-5f46-84a7-e70195b63502",
    );
    expect(opportunityIdForAdmissionEvent(eventId)).toBe(
      opportunityIdForAdmissionEvent(eventId),
    );
  });

  it.each([
    ["BRIEFING", "INFORMATION_SESSION"],
    ["OPEN_HOUSE", "OPEN_HOUSE"],
    ["APPLICATION", "APPLICATION"],
    ["DOCUMENT_SUBMISSION", "DOCUMENT_SUBMISSION"],
    ["ASSESSMENT", "ASSESSMENT"],
    ["INTERVIEW", "INTERVIEW"],
    ["LOTTERY", "LOTTERY"],
    ["RESULT_ANNOUNCEMENT", "RESULT_ANNOUNCEMENT"],
    ["REGISTRATION", "REGISTRATION"],
    ["ADDITIONAL_RECRUITMENT", "ADDITIONAL_RECRUITMENT"],
  ] as const)("maps legacy %s to canonical %s", (legacyType, expected) => {
    expect(mapLegacyEventTypeToOpportunityKind(legacyType)).toBe(expected);
  });

  it.each(["OTHER", "UNSUPPORTED_TYPE"])(
    "rejects unmappable legacy type %s",
    (legacyType) => {
      expect(() => mapLegacyEventTypeToOpportunityKind(legacyType)).toThrow(
        `UNMAPPABLE_EVENT_TYPE: ${legacyType}`,
      );
    },
  );

  it("exports a silent migration context", () => {
    expect(MIGRATION_OPPORTUNITY_BACKFILL_CONTEXT).toEqual({
      source: "MIGRATION",
      emitProductSignals: false,
    });
  });
});
