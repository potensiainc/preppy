export const PRODUCTION_FIVE_SCHOOL_ACKNOWLEDGEMENT =
  "PREPPY-5-SCHOOL" as const;

export type ProductionFiveSchoolTarget = Readonly<{
  institutionId: string;
  slug: "kbes" | "myongji" | "younghoon" | "uchon" | "yale";
  institutionName: string;
  targetAcademicYearLabel: "2026학년도";
  admissionUrl: string;
  sourceName: string;
  sourceType: "OFFICIAL_ADMISSION_PAGE" | "OFFICIAL_SCHOOL_PAGE";
  institutionBindingRole: "ADMISSIONS";
  classificationHint: "ADMISSIONS";
}>;

export const PRODUCTION_FIVE_SCHOOL_TARGETS: readonly ProductionFiveSchoolTarget[] =
  Object.freeze([
    Object.freeze({
      institutionId: "abcb72f0-a6aa-53b1-9104-77d318660f8a",
      slug: "kbes",
      institutionName: "경복초등학교",
      targetAcademicYearLabel: "2026학년도",
      admissionUrl: "https://www.kbes.kr/bbs/content.php?co_id=1_3",
      sourceName: "경복초등학교 입학 안내",
      sourceType: "OFFICIAL_ADMISSION_PAGE",
      institutionBindingRole: "ADMISSIONS",
      classificationHint: "ADMISSIONS",
    }),
    Object.freeze({
      institutionId: "4b732452-6f4b-5f7e-9303-456667250a67",
      slug: "myongji",
      institutionName: "명지초등학교",
      targetAcademicYearLabel: "2026학년도",
      admissionUrl: "http://www.myongji.net/subpage.php?p=m24",
      sourceName: "명지초등학교 신입학 안내",
      sourceType: "OFFICIAL_ADMISSION_PAGE",
      institutionBindingRole: "ADMISSIONS",
      classificationHint: "ADMISSIONS",
    }),
    Object.freeze({
      institutionId: "626f9b01-1855-536f-b7cc-1608ab65eb9b",
      slug: "younghoon",
      institutionName: "영훈초등학교",
      targetAcademicYearLabel: "2026학년도",
      admissionUrl:
        "http://www.younghoon.es.kr/younghoon_e/admission/typical-syllabus.do",
      sourceName: "영훈초등학교 신입학 전형요강",
      sourceType: "OFFICIAL_ADMISSION_PAGE",
      institutionBindingRole: "ADMISSIONS",
      classificationHint: "ADMISSIONS",
    }),
    Object.freeze({
      institutionId: "37de5a08-cbb8-5dec-95d1-faca0a5d8009",
      slug: "uchon",
      institutionName: "우촌초등학교",
      targetAcademicYearLabel: "2026학년도",
      admissionUrl: "https://uchon.sen.es.kr",
      sourceName: "우촌초등학교 공식 홈페이지",
      sourceType: "OFFICIAL_SCHOOL_PAGE",
      institutionBindingRole: "ADMISSIONS",
      classificationHint: "ADMISSIONS",
    }),
    Object.freeze({
      institutionId: "af494821-037e-5730-a54e-809cb7253e41",
      slug: "yale",
      institutionName: "예일초등학교",
      targetAcademicYearLabel: "2026학년도",
      admissionUrl: "https://yale.sen.es.kr",
      sourceName: "예일초등학교 공식 홈페이지",
      sourceType: "OFFICIAL_SCHOOL_PAGE",
      institutionBindingRole: "ADMISSIONS",
      classificationHint: "ADMISSIONS",
    }),
  ] satisfies readonly ProductionFiveSchoolTarget[]);

export type ProductionFiveSchoolCliOptions =
  | Readonly<{ mode: "inspect" }>
  | Readonly<{
      mode: "prepare";
      slug: ProductionFiveSchoolTarget["slug"];
    }>
  | Readonly<{ mode: "review"; filePath: string }>;

export type ProductionRolloutErrorCode =
  | "INVOCATION_REJECTED"
  | "ENVIRONMENT_REJECTED"
  | "ALLOWLIST_REJECTED"
  | "MIGRATION_BLOCKED"
  | "STATE_BLOCKED"
  | "STATE_CONFLICT"
  | "REVIEW_REJECTED";

export class ProductionFiveSchoolRolloutError extends Error {
  constructor(
    readonly code: ProductionRolloutErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProductionFiveSchoolRolloutError";
  }
}

const INVOCATION_REJECTED =
  "Production five-school rollout invocation rejected";

export function parseProductionFiveSchoolCliArgs(
  arguments_: readonly string[],
): ProductionFiveSchoolCliOptions {
  let production = false;
  let acknowledged = false;
  let filePath: string | undefined;
  let slug: string | undefined;
  const modes: Array<"inspect" | "prepare" | "review"> = [];

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]!;
    if (argument === "--production") production = true;
    else if (
      argument ===
      `--acknowledge-production-write=${PRODUCTION_FIVE_SCHOOL_ACKNOWLEDGEMENT}`
    ) {
      acknowledged = true;
    } else if (argument === "--inspect") modes.push("inspect");
    else if (argument === "--prepare") modes.push("prepare");
    else if (argument === "--review") modes.push("review");
    else if (argument === "--slug") {
      const value = arguments_[index + 1];
      if (slug !== undefined || !value || value.startsWith("--")) {
        throw new ProductionFiveSchoolRolloutError(
          "INVOCATION_REJECTED",
          INVOCATION_REJECTED,
        );
      }
      slug = value;
      index += 1;
    } else if (argument.startsWith("--slug=")) {
      if (slug !== undefined || argument.length === "--slug=".length) {
        throw new ProductionFiveSchoolRolloutError(
          "INVOCATION_REJECTED",
          INVOCATION_REJECTED,
        );
      }
      slug = argument.slice("--slug=".length);
    } else if (argument === "--file") {
      const value = arguments_[index + 1];
      if (filePath !== undefined || !value || value.startsWith("--")) {
        throw new ProductionFiveSchoolRolloutError(
          "INVOCATION_REJECTED",
          INVOCATION_REJECTED,
        );
      }
      filePath = value;
      index += 1;
    } else if (argument.startsWith("--file=")) {
      if (filePath !== undefined || argument.length === "--file=".length) {
        throw new ProductionFiveSchoolRolloutError(
          "INVOCATION_REJECTED",
          INVOCATION_REJECTED,
        );
      }
      filePath = argument.slice("--file=".length);
    } else {
      throw new ProductionFiveSchoolRolloutError(
        "INVOCATION_REJECTED",
        INVOCATION_REJECTED,
      );
    }
  }

  if (
    !production ||
    !acknowledged ||
    modes.length !== 1 ||
    (modes[0] === "review"
      ? !filePath || slug !== undefined
      : filePath !== undefined) ||
    (modes[0] === "prepare" ? slug === undefined : slug !== undefined)
  ) {
    throw new ProductionFiveSchoolRolloutError(
      "INVOCATION_REJECTED",
      INVOCATION_REJECTED,
    );
  }
  const mode = modes[0]!;
  if (mode === "review") {
    return Object.freeze({ mode, filePath: filePath! });
  }
  if (mode === "prepare") {
    const target = PRODUCTION_FIVE_SCHOOL_TARGETS.find(
      (candidate) => candidate.slug === slug,
    );
    if (target === undefined) {
      throw new ProductionFiveSchoolRolloutError(
        "INVOCATION_REJECTED",
        INVOCATION_REJECTED,
      );
    }
    return Object.freeze({ mode, slug: target.slug });
  }
  return Object.freeze({ mode });
}

export function assertProductionFiveSchoolEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): void {
  if (environment.NODE_ENV !== "production") {
    throw new ProductionFiveSchoolRolloutError(
      "ENVIRONMENT_REJECTED",
      "Production five-school rollout requires a production runtime",
    );
  }
  const databaseUrl = environment.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new ProductionFiveSchoolRolloutError(
      "ENVIRONMENT_REJECTED",
      "Production five-school rollout requires DATABASE_URL",
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new ProductionFiveSchoolRolloutError(
      "ENVIRONMENT_REJECTED",
      "Production five-school rollout requires a valid PostgreSQL URL",
    );
  }
  if (!new Set(["postgres:", "postgresql:"]).has(parsed.protocol)) {
    throw new ProductionFiveSchoolRolloutError(
      "ENVIRONMENT_REJECTED",
      "Production five-school rollout requires PostgreSQL",
    );
  }
}

export function assertProductionReviewTarget(
  input: Readonly<{
    institutionId: string;
    actionUrl: string;
  }>,
): ProductionFiveSchoolTarget {
  const target = PRODUCTION_FIVE_SCHOOL_TARGETS.find(
    (candidate) => candidate.institutionId === input.institutionId,
  );
  if (target === undefined || target.admissionUrl !== input.actionUrl) {
    throw new ProductionFiveSchoolRolloutError(
      "ALLOWLIST_REJECTED",
      "Production review record is outside the five-school allowlist",
    );
  }
  return target;
}

export function toSafeProductionRolloutFailure(error: unknown): Readonly<{
  status: "FAILED";
  errorCode: ProductionRolloutErrorCode | "UNEXPECTED_FAILURE";
}> {
  return Object.freeze({
    status: "FAILED" as const,
    errorCode:
      error instanceof ProductionFiveSchoolRolloutError
        ? error.code
        : ("UNEXPECTED_FAILURE" as const),
  });
}
