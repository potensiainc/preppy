import { describe, expect, it } from "vitest";

import {
  mapArtifactStatusToCoverage,
  type ArtifactEvidenceStatus,
} from "@/src/modules/international-school/artifact-status";
import {
  parseInternationalSchoolFactValue,
  type InternationalSchoolFactType,
} from "@/src/modules/international-school/fact-values";

describe("international-school artifact status mapping", () => {
  it.each<[ArtifactEvidenceStatus, string | null]>([
    ["VERIFIED", "CONFIRMED"],
    ["VERIFIED_WITH_WARNING", "NEEDS_REVIEW"],
    ["VERIFIED_WITH_DATE_LIMIT", "NEEDS_REVIEW"],
    ["NEEDS_REVIEW", "NEEDS_REVIEW"],
    ["NOT_FOUND_IN_CHECKED_OFFICIAL_SOURCES", "CHECKED_NOT_FOUND"],
    ["ACCESS_FAILED", "ACCESS_FAILED"],
    ["LEAD_ONLY", null],
    ["LOGIN_REQUIRED", null],
    ["ROBOTS_BLOCKED", null],
    ["NO_PUBLIC_RESULT", null],
  ])("maps %s without collapsing evidence meaning", (status, expected) => {
    expect(mapArtifactStatusToCoverage(status)).toBe(expected);
  });
});

describe("international-school fact values", () => {
  it("preserves multi-currency tuition components without conversion", () => {
    const parsed = parseInternationalSchoolFactValue("TUITION", {
      academicYearLabel: "2026–27",
      gradeBands: [
        {
          label: "K–5",
          tuitionComponents: [
            {
              currency: "KRW",
              amount: 24_000_000,
              billingUnit: "ANNUAL",
              required: true,
            },
            {
              currency: "USD",
              amount: 8_000,
              billingUnit: "ANNUAL",
              required: true,
            },
          ],
          notes: ["두 통화는 학교 안내에 각각 표시돼요."],
        },
      ],
      extraFees: [
        {
          feeType: "APPLICATION",
          label: "Application fee",
          components: [
            {
              currency: "EUR",
              amount: 100,
              billingUnit: "ONE_TIME",
              required: true,
            },
            {
              currency: "CNY",
              amount: 200,
              billingUnit: "ONE_TIME",
              required: false,
            },
            {
              currency: "JPY",
              amount: 300,
              billingUnit: "ONE_TIME",
              required: null,
            },
          ],
          refundable: false,
          note: null,
        },
      ],
      paymentOptions: ["연 1회", "학기별"],
      refundTerms: "학교 공식 환불 규정을 확인해 주세요.",
      changeNote: null,
    });

    expect(parsed).toEqual({
      factType: "TUITION",
      academicYearLabel: "2026–27",
      gradeBands: [
        {
          label: "K–5",
          tuitionComponents: [
            {
              currency: "KRW",
              amount: 24_000_000,
              billingUnit: "ANNUAL",
              required: true,
            },
            {
              currency: "USD",
              amount: 8_000,
              billingUnit: "ANNUAL",
              required: true,
            },
          ],
          notes: ["두 통화는 학교 안내에 각각 표시돼요."],
        },
      ],
      extraFees: [
        {
          feeType: "APPLICATION",
          label: "Application fee",
          components: [
            {
              currency: "EUR",
              amount: 100,
              billingUnit: "ONE_TIME",
              required: true,
            },
            {
              currency: "CNY",
              amount: 200,
              billingUnit: "ONE_TIME",
              required: false,
            },
            {
              currency: "JPY",
              amount: 300,
              billingUnit: "ONE_TIME",
              required: null,
            },
          ],
          refundable: false,
          note: null,
        },
      ],
      paymentOptions: ["연 1회", "학기별"],
      refundTerms: "학교 공식 환불 규정을 확인해 주세요.",
      changeNote: null,
    });
    expect(parsed).not.toHaveProperty("convertedTotalKrw");
  });

  it.each([
    ["negative amount", { amount: -1 }],
    ["unsupported currency", { currency: "GBP" }],
    ["blank academic year", { academicYearLabel: "  " }],
  ])("rejects invalid tuition: %s", (_name, replacement) => {
    const value = {
      academicYearLabel: "2026–27",
      gradeBands: [
        {
          label: "K",
          tuitionComponents: [
            {
              currency: "KRW",
              amount: 1,
              billingUnit: "ANNUAL",
              required: true,
              ...replacement,
            },
          ],
          notes: [],
        },
      ],
      extraFees: [],
      paymentOptions: [],
      refundTerms: null,
      changeNote: null,
      ...("academicYearLabel" in replacement ? replacement : {}),
    };

    expect(() => parseInternationalSchoolFactValue("TUITION", value)).toThrow();
  });

  it.each<[InternationalSchoolFactType, Record<string, unknown>]>([
    [
      "TARGET_AGE_GRADE",
      {
        academicYearLabel: "2026–27",
        ageBasis: "INTERNATIONAL_AGE",
        minAge: 5,
        maxAge: 18,
        gradeBands: [{ label: "K–12", minAge: 5, maxAge: 18 }],
        notes: [],
      },
    ],
    [
      "CURRICULUM",
      {
        academicYearLabel: "2026–27",
        frameworks: ["IB"],
        programmes: ["PYP", "MYP", "DP"],
        instructionalLanguages: ["English"],
        notes: [],
      },
    ],
    [
      "ELIGIBILITY",
      {
        academicYearLabel: "2026–27",
        legalConditions: ["부모 중 한 명이 외국 국적이에요."],
        exceptions: [],
        notes: [],
      },
    ],
    [
      "TRANSPORT",
      {
        academicYearLabel: "2026–27",
        isAvailable: true,
        serviceAreas: ["서울"],
        directionOptions: ["ROUND_TRIP"],
        feeComponents: [],
        seatGuaranteed: null,
        publicRouteDetailLevel: "AREA_ONLY",
        notes: [],
      },
    ],
    [
      "MEALS",
      {
        academicYearLabel: "2026–27",
        isProvided: true,
        serviceModel: "학교 급식",
        menuOptions: [],
        accommodations: ["알레르기는 학교와 개별 확인이 필요해요."],
        feeComponents: [],
        notes: [],
      },
    ],
    [
      "ADMISSION_PROCESS",
      {
        academicYearLabel: "2026–27",
        intakeModel: "FIXED",
        applicationWindows: [],
        requiredDocuments: [],
        assessments: [],
        englishRequirements: [],
        capacityNote: null,
        waitlistNote: null,
        decisionNote: null,
        registrationDeadlineNote: null,
        nonRegistrationOutcome: null,
        notes: [],
      },
    ],
    [
      "OPERATING_INFO",
      {
        academicYearLabel: "2026–27",
        grades: ["K–12"],
        instructionalLanguages: ["English"],
        accreditations: [],
        schoolCalendarNote: null,
        campusNote: null,
        notes: [],
      },
    ],
  ])("parses a strict %s payload", (factType, value) => {
    expect(parseInternationalSchoolFactValue(factType, value)).toMatchObject({
      factType,
      ...value,
    });
    expect(() =>
      parseInternationalSchoolFactValue(factType, {
        ...value,
        unknownField: true,
      }),
    ).toThrow();
  });

  it("keeps eligibility separate from admission process", () => {
    expect(() =>
      parseInternationalSchoolFactValue("ELIGIBILITY", {
        academicYearLabel: "2026–27",
        intakeModel: "ROLLING",
        applicationWindows: [],
        requiredDocuments: [],
        assessments: [],
        englishRequirements: [],
        capacityNote: null,
        waitlistNote: null,
        decisionNote: null,
        registrationDeadlineNote: null,
        nonRegistrationOutcome: null,
        notes: [],
      }),
    ).toThrow();
  });
});
