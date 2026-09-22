import { z } from "zod";

import type { InstitutionFactType } from "@/src/db/schema";

type ReusedEnglishKindergartenFactType = Extract<
  InstitutionFactType,
  | "TUITION"
  | "TARGET_AGE_GRADE"
  | "CURRICULUM"
  | "TRANSPORT"
  | "ADMISSION_PROCESS"
  | "OPERATING_INFO"
>;

export type EnglishKindergartenFactType =
  ReusedEnglishKindergartenFactType | "MEALS";

export const englishKindergartenFactTypeValues = [
  "TUITION",
  "TARGET_AGE_GRADE",
  "CURRICULUM",
  "TRANSPORT",
  "MEALS",
  "ADMISSION_PROCESS",
  "OPERATING_INFO",
] as const satisfies readonly EnglishKindergartenFactType[];

const nonEmptyText = z.string().trim().min(1);
const nullableText = nonEmptyText.nullable();
const krwAmount = z.number().int().nonnegative();
const nullableKrwAmount = krwAmount.nullable();
const billingCadenceSchema = z.enum([
  "MONTHLY",
  "QUARTERLY",
  "SEMESTER",
  "ANNUAL",
  "ONE_TIME",
]);

const programFeeSchema = z
  .object({
    label: nonEmptyText,
    cadence: billingCadenceSchema.nullable(),
    amountMin: nullableKrwAmount,
    amountMax: nullableKrwAmount,
    note: nullableText,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.amountMin !== null &&
      value.amountMax !== null &&
      value.amountMin > value.amountMax
    ) {
      context.addIssue({
        code: "custom",
        message: "프로그램 원비 최솟값은 최댓값보다 클 수 없습니다.",
        path: ["amountMin"],
      });
    }
  });

const tuitionSchema = z
  .object({
    academicYearLabel: nullableText,
    validityNote: nullableText,
    billingCadence: billingCadenceSchema.nullable(),
    currency: z.literal("KRW"),
    amountMin: nullableKrwAmount,
    amountMax: nullableKrwAmount,
    programFees: z.array(programFeeSchema),
    extraCosts: z.array(
      z
        .object({
          label: nonEmptyText,
          amount: nullableKrwAmount,
          cadence: billingCadenceSchema.nullable(),
        })
        .strict(),
    ),
    includedItems: z.array(nonEmptyText),
    refundTerms: nullableText,
    changeNote: nullableText,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.academicYearLabel === null && value.validityNote === null) {
      context.addIssue({
        code: "custom",
        message: "원비에는 적용 학년도나 적용 기간 안내가 필요합니다.",
        path: ["academicYearLabel"],
      });
    }

    if (
      value.amountMin !== null &&
      value.amountMax !== null &&
      value.amountMin > value.amountMax
    ) {
      context.addIssue({
        code: "custom",
        message: "원비 최솟값은 최댓값보다 클 수 없습니다.",
        path: ["amountMin"],
      });
    }
  });

const ageRangeSchema = z
  .object({
    name: nonEmptyText,
    minAge: z.number().int().nonnegative(),
    maxAge: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.minAge > value.maxAge) {
      context.addIssue({
        code: "custom",
        message: "반의 최소 연령은 최대 연령보다 클 수 없습니다.",
        path: ["minAge"],
      });
    }
  });

const targetAgeGradeSchema = z
  .object({
    academicYearLabel: nullableText,
    ageBasis: z.enum([
      "KOREAN_AGE",
      "INTERNATIONAL_AGE",
      "INSTITUTION_DEFINED",
    ]),
    minAge: z.number().int().nonnegative(),
    maxAge: z.number().int().nonnegative(),
    classes: z.array(ageRangeSchema),
    midyearAdmission: z
      .object({
        available: z.boolean().nullable(),
        conditions: nullableText,
      })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.minAge > value.maxAge) {
      context.addIssue({
        code: "custom",
        message: "최소 연령은 최대 연령보다 클 수 없습니다.",
        path: ["minAge"],
      });
    }
  });

const curriculumSchema = z
  .object({
    instructionalLanguages: z.array(
      z
        .object({
          language: nonEmptyText,
          percentage: z.number().min(0).max(100).nullable(),
        })
        .strict(),
    ),
    components: z.array(nonEmptyText),
    specialActivities: z.array(nonEmptyText),
    dailySchedule: nullableText,
    classVariations: nullableText,
    separatePrograms: z.array(nonEmptyText),
  })
  .strict();

const transportSchema = z
  .object({
    isAvailable: z.boolean(),
    serviceAreas: z.array(nonEmptyText),
    routes: z.array(
      z
        .object({
          name: nonEmptyText,
          areas: z.array(nonEmptyText),
          direction: z.enum(["PICKUP", "DROPOFF", "BOTH"]).nullable(),
          fee: nullableKrwAmount,
          currency: z.literal("KRW").nullable(),
          note: nullableText,
        })
        .strict(),
    ),
    restrictions: nullableText,
    inquiryRequired: z.boolean(),
  })
  .strict();

const mealsSchema = z
  .object({
    mealProvided: z.boolean().nullable(),
    snackProvided: z.boolean().nullable(),
    serviceMethod: z.enum(["ON_SITE", "CATERED", "PACKED", "OTHER"]).nullable(),
    includedInTuition: z.boolean().nullable(),
    extraCost: nullableKrwAmount,
    currency: z.literal("KRW").nullable(),
    menuUrl: z.url().nullable(),
    allergyPolicy: nullableText,
  })
  .strict();

const admissionProcessSchema = z
  .object({
    academicYearLabel: nullableText,
    steps: z.array(nonEmptyText),
    requiredDocuments: z.array(nonEmptyText),
    eligibilityNote: nullableText,
    applicationNote: nullableText,
  })
  .strict();

const timeSchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u, "시간은 HH:mm 형식이어야 합니다.");

const operatingInfoSchema = z
  .object({
    operatingHours: z
      .object({ start: timeSchema, end: timeSchema })
      .strict()
      .nullable(),
    operatingDays: z.array(nonEmptyText),
    classDurationMinutes: z.number().int().positive().nullable(),
    contactNote: nullableText,
    programNote: nullableText,
  })
  .strict();

type EnglishKindergartenFactPayloads = {
  TUITION: z.infer<typeof tuitionSchema>;
  TARGET_AGE_GRADE: z.infer<typeof targetAgeGradeSchema>;
  CURRICULUM: z.infer<typeof curriculumSchema>;
  TRANSPORT: z.infer<typeof transportSchema>;
  MEALS: z.infer<typeof mealsSchema>;
  ADMISSION_PROCESS: z.infer<typeof admissionProcessSchema>;
  OPERATING_INFO: z.infer<typeof operatingInfoSchema>;
};

export type EnglishKindergartenFactValue = {
  [FactType in EnglishKindergartenFactType]: {
    factType: FactType;
  } & EnglishKindergartenFactPayloads[FactType];
}[EnglishKindergartenFactType];

const schemas: {
  [FactType in EnglishKindergartenFactType]: z.ZodType<
    EnglishKindergartenFactPayloads[FactType]
  >;
} = {
  TUITION: tuitionSchema,
  TARGET_AGE_GRADE: targetAgeGradeSchema,
  CURRICULUM: curriculumSchema,
  TRANSPORT: transportSchema,
  MEALS: mealsSchema,
  ADMISSION_PROCESS: admissionProcessSchema,
  OPERATING_INFO: operatingInfoSchema,
};

export function parseEnglishKindergartenFactValue(
  factType: EnglishKindergartenFactType,
  value: unknown,
): EnglishKindergartenFactValue {
  const parsed = schemas[factType].parse(value);
  return { factType, ...parsed } as EnglishKindergartenFactValue;
}
