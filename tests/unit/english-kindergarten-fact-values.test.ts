import { describe, expect, it } from "vitest";

import { parseEnglishKindergartenFactValue } from "@/src/modules/english-kindergarten/fact-values";

describe("English-kindergarten fact values", () => {
  it("keeps tuition year, cadence, extras, and uncertainty together", () => {
    expect(
      parseEnglishKindergartenFactValue("TUITION", {
        academicYearLabel: "2026학년도",
        validityNote: null,
        billingCadence: "MONTHLY",
        currency: "KRW",
        amountMin: 1_850_000,
        amountMax: 1_850_000,
        programFees: [],
        extraCosts: [{ label: "교재비", amount: null, cadence: null }],
        includedItems: [],
        refundTerms: null,
        changeNote: "반에 따라 달라질 수 있어요.",
      }),
    ).toMatchObject({
      factType: "TUITION",
      billingCadence: "MONTHLY",
      amountMin: 1_850_000,
    });
  });

  it("rejects a bare tuition amount without its basis", () => {
    expect(() =>
      parseEnglishKindergartenFactValue("TUITION", { amountMin: 1_850_000 }),
    ).toThrow();
  });

  it("rejects negative KRW amounts", () => {
    expect(() =>
      parseEnglishKindergartenFactValue("TUITION", {
        academicYearLabel: "2026학년도",
        validityNote: null,
        billingCadence: "MONTHLY",
        currency: "KRW",
        amountMin: -1,
        amountMax: 1_850_000,
        programFees: [],
        extraCosts: [],
        includedItems: [],
        refundTerms: null,
        changeNote: null,
      }),
    ).toThrow();
  });

  it("rejects an age range whose minimum exceeds its maximum", () => {
    expect(() =>
      parseEnglishKindergartenFactValue("TARGET_AGE_GRADE", {
        academicYearLabel: "2026학년도",
        ageBasis: "INTERNATIONAL_AGE",
        minAge: 7,
        maxAge: 5,
        classes: [],
        midyearAdmission: null,
      }),
    ).toThrow();
  });

  it.each([
    [
      "CURRICULUM",
      {
        instructionalLanguages: [{ language: "영어", percentage: null }],
        components: ["읽기", "말하기"],
        specialActivities: [],
        dailySchedule: null,
        classVariations: null,
        separatePrograms: [],
      },
    ],
    [
      "TRANSPORT",
      {
        isAvailable: true,
        serviceAreas: ["서초구"],
        routes: [],
        restrictions: null,
        inquiryRequired: true,
      },
    ],
    [
      "MEALS",
      {
        mealProvided: true,
        snackProvided: true,
        serviceMethod: "CATERED",
        includedInTuition: null,
        extraCost: null,
        currency: null,
        menuUrl: null,
        allergyPolicy: null,
      },
    ],
    [
      "ADMISSION_PROCESS",
      {
        academicYearLabel: "2026학년도",
        steps: ["상담", "레벨 테스트"],
        requiredDocuments: [],
        eligibilityNote: null,
        applicationNote: null,
      },
    ],
    [
      "OPERATING_INFO",
      {
        operatingHours: { start: "09:00", end: "15:00" },
        operatingDays: ["월", "화", "수", "목", "금"],
        classDurationMinutes: null,
        contactNote: null,
        programNote: null,
      },
    ],
  ] as const)("parses a strict %s value", (factType, value) => {
    expect(parseEnglishKindergartenFactValue(factType, value)).toMatchObject({
      factType,
    });
  });

  it("rejects fields outside the selected fact contract", () => {
    expect(() =>
      parseEnglishKindergartenFactValue("TRANSPORT", {
        isAvailable: false,
        serviceAreas: [],
        routes: [],
        restrictions: null,
        inquiryRequired: false,
        rating: 5,
      }),
    ).toThrow();
  });
});
