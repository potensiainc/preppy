import { z } from "zod";

import type { InstitutionFactType } from "@/src/db/schema";

export const internationalSchoolFactTypeValues = [
  "TUITION",
  "TARGET_AGE_GRADE",
  "CURRICULUM",
  "ELIGIBILITY",
  "TRANSPORT",
  "MEALS",
  "ADMISSION_PROCESS",
  "OPERATING_INFO",
] as const satisfies readonly InstitutionFactType[];

export type InternationalSchoolFactType =
  (typeof internationalSchoolFactTypeValues)[number];

const nonEmptyText = z.string().trim().min(1);
const nullableText = nonEmptyText.nullable();
const academicYearLabel = nonEmptyText;

const currencySchema = z.enum(["KRW", "USD", "EUR", "CNY", "JPY"]);
const billingUnitSchema = z.enum([
  "MONTHLY",
  "QUARTERLY",
  "SEMESTER",
  "ANNUAL",
  "ONE_TIME",
]);

const moneyComponentSchema = z
  .object({
    currency: currencySchema,
    amount: z.number().nonnegative(),
    billingUnit: billingUnitSchema,
    required: z.boolean().nullable(),
  })
  .strict();

const tuitionSchema = z
  .object({
    academicYearLabel,
    gradeBands: z
      .array(
        z
          .object({
            label: nonEmptyText,
            tuitionComponents: z.array(moneyComponentSchema).min(1),
            notes: z.array(nonEmptyText),
          })
          .strict(),
      )
      .min(1),
    extraFees: z.array(
      z
        .object({
          feeType: z.enum([
            "APPLICATION",
            "ADMISSION",
            "CAPITAL",
            "TRANSPORT",
            "MEAL",
            "OTHER",
          ]),
          label: nonEmptyText,
          components: z.array(moneyComponentSchema).min(1),
          refundable: z.boolean().nullable(),
          note: nullableText,
        })
        .strict(),
    ),
    paymentOptions: z.array(nonEmptyText),
    refundTerms: nullableText,
    changeNote: nullableText,
  })
  .strict();

const gradeBandSchema = z
  .object({
    label: nonEmptyText,
    minAge: z.number().int().nonnegative().nullable(),
    maxAge: z.number().int().nonnegative().nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.minAge !== null &&
      value.maxAge !== null &&
      value.minAge > value.maxAge
    ) {
      context.addIssue({
        code: "custom",
        message: "최소 연령은 최대 연령보다 클 수 없습니다.",
        path: ["minAge"],
      });
    }
  });

const targetAgeGradeSchema = z
  .object({
    academicYearLabel,
    ageBasis: z.enum([
      "KOREAN_AGE",
      "INTERNATIONAL_AGE",
      "INSTITUTION_DEFINED",
    ]),
    minAge: z.number().int().nonnegative().nullable(),
    maxAge: z.number().int().nonnegative().nullable(),
    gradeBands: z.array(gradeBandSchema).min(1),
    notes: z.array(nonEmptyText),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.minAge !== null &&
      value.maxAge !== null &&
      value.minAge > value.maxAge
    ) {
      context.addIssue({
        code: "custom",
        message: "최소 연령은 최대 연령보다 클 수 없습니다.",
        path: ["minAge"],
      });
    }
  });

const curriculumSchema = z
  .object({
    academicYearLabel,
    frameworks: z.array(nonEmptyText),
    programmes: z.array(nonEmptyText),
    instructionalLanguages: z.array(nonEmptyText).min(1),
    notes: z.array(nonEmptyText),
  })
  .strict();

const eligibilitySchema = z
  .object({
    academicYearLabel,
    legalConditions: z.array(nonEmptyText).min(1),
    exceptions: z.array(nonEmptyText),
    notes: z.array(nonEmptyText),
  })
  .strict();

const transportSchema = z
  .object({
    academicYearLabel,
    isAvailable: z.boolean().nullable(),
    serviceAreas: z.array(nonEmptyText),
    directionOptions: z.array(z.enum(["ROUND_TRIP", "ONE_WAY"])),
    feeComponents: z.array(moneyComponentSchema),
    seatGuaranteed: z.boolean().nullable(),
    publicRouteDetailLevel: z.literal("AREA_ONLY"),
    notes: z.array(nonEmptyText),
  })
  .strict();

const mealsSchema = z
  .object({
    academicYearLabel,
    isProvided: z.boolean().nullable(),
    serviceModel: nullableText,
    menuOptions: z.array(nonEmptyText),
    accommodations: z.array(nonEmptyText),
    feeComponents: z.array(moneyComponentSchema),
    notes: z.array(nonEmptyText),
  })
  .strict();

const admissionProcessSchema = z
  .object({
    academicYearLabel,
    intakeModel: z.enum(["ROLLING", "FIXED", "UNKNOWN"]),
    applicationWindows: z.array(
      z
        .object({
          opensOn: nonEmptyText.nullable(),
          closesOn: nonEmptyText.nullable(),
          note: nullableText,
        })
        .strict(),
    ),
    requiredDocuments: z.array(nonEmptyText),
    assessments: z.array(nonEmptyText),
    englishRequirements: z.array(nonEmptyText),
    capacityNote: nullableText,
    waitlistNote: nullableText,
    decisionNote: nullableText,
    registrationDeadlineNote: nullableText,
    nonRegistrationOutcome: nullableText,
    notes: z.array(nonEmptyText),
  })
  .strict();

const operatingInfoSchema = z
  .object({
    academicYearLabel,
    grades: z.array(nonEmptyText).min(1),
    instructionalLanguages: z.array(nonEmptyText).min(1),
    accreditations: z.array(nonEmptyText),
    schoolCalendarNote: nullableText,
    campusNote: nullableText,
    notes: z.array(nonEmptyText),
  })
  .strict();

type InternationalSchoolFactPayloads = {
  TUITION: z.infer<typeof tuitionSchema>;
  TARGET_AGE_GRADE: z.infer<typeof targetAgeGradeSchema>;
  CURRICULUM: z.infer<typeof curriculumSchema>;
  ELIGIBILITY: z.infer<typeof eligibilitySchema>;
  TRANSPORT: z.infer<typeof transportSchema>;
  MEALS: z.infer<typeof mealsSchema>;
  ADMISSION_PROCESS: z.infer<typeof admissionProcessSchema>;
  OPERATING_INFO: z.infer<typeof operatingInfoSchema>;
};

export type InternationalSchoolFactValue = {
  [FactType in InternationalSchoolFactType]: {
    factType: FactType;
  } & InternationalSchoolFactPayloads[FactType];
}[InternationalSchoolFactType];

const schemas: {
  [FactType in InternationalSchoolFactType]: z.ZodType<
    InternationalSchoolFactPayloads[FactType]
  >;
} = {
  TUITION: tuitionSchema,
  TARGET_AGE_GRADE: targetAgeGradeSchema,
  CURRICULUM: curriculumSchema,
  ELIGIBILITY: eligibilitySchema,
  TRANSPORT: transportSchema,
  MEALS: mealsSchema,
  ADMISSION_PROCESS: admissionProcessSchema,
  OPERATING_INFO: operatingInfoSchema,
};

export function parseInternationalSchoolFactValue(
  factType: InternationalSchoolFactType,
  value: unknown,
): InternationalSchoolFactValue {
  const parsed = schemas[factType].parse(value);
  return { factType, ...parsed } as InternationalSchoolFactValue;
}
