import type { ZodError } from "zod";

const ERROR_DEFINITIONS = {
  VALIDATION_ERROR: {
    status: 400,
    message: "Request validation failed.",
  },
  UNAUTHENTICATED: {
    status: 401,
    message: "Authentication is required.",
  },
  FORBIDDEN: {
    status: 403,
    message: "You do not have permission to perform this action.",
  },
  NOT_FOUND: {
    status: 404,
    message: "The requested resource was not found.",
  },
  CONFLICT: {
    status: 409,
    message: "The requested state conflicts with existing data.",
  },
  CONSENT_POLICY_UPDATED: {
    status: 409,
    message: "The consent policy version has changed.",
  },
  NOT_ELIGIBLE: {
    status: 403,
    message: "This action is not currently allowed.",
  },
  RETRYABLE: {
    status: 503,
    message: "The operation is temporarily unavailable.",
  },
  EXTERNAL_PROVIDER_ERROR: {
    status: 502,
    message: "An external provider request failed.",
  },
} as const;

type ApplicationErrorCode = keyof typeof ERROR_DEFINITIONS;

type ValidationIssue = {
  path: string;
  type: string;
  message: "Invalid value.";
};

type ValidationErrorDetails = {
  issues: ValidationIssue[];
};

type ErrorDetails = ValidationErrorDetails;

const SAFE_PATH_SEGMENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SAFE_ISSUE_TYPE = /^[a-z_]{1,64}$/;

function sanitizePathSegment(segment: PropertyKey): string {
  if (typeof segment === "number" && Number.isSafeInteger(segment)) {
    return String(segment);
  }

  if (
    typeof segment === "string" &&
    segment.length <= 64 &&
    SAFE_PATH_SEGMENT.test(segment)
  ) {
    return segment;
  }

  return "[redacted]";
}

function sanitizeSerializedPath(path: unknown): string {
  if (typeof path !== "string" || path.length === 0) {
    return "[redacted]";
  }

  return path
    .split(".")
    .map((segment) => {
      if (/^\d+$/.test(segment)) {
        const index = Number(segment);
        return Number.isSafeInteger(index) ? segment : "[redacted]";
      }

      return sanitizePathSegment(segment);
    })
    .join(".");
}

function sanitizeValidationDetails(
  details: unknown,
): ValidationErrorDetails | undefined {
  if (
    typeof details !== "object" ||
    details === null ||
    !("issues" in details) ||
    !Array.isArray(details.issues)
  ) {
    return undefined;
  }

  const issues = details.issues.slice(0, 50).map((issue): ValidationIssue => {
    const candidate =
      typeof issue === "object" && issue !== null
        ? (issue as Record<string, unknown>)
        : {};
    const type =
      typeof candidate.type === "string" && SAFE_ISSUE_TYPE.test(candidate.type)
        ? candidate.type
        : "invalid_value";

    return {
      path: sanitizeSerializedPath(candidate.path),
      type,
      message: "Invalid value.",
    };
  });

  return { issues };
}

export class ApplicationError extends Error {
  readonly code: ApplicationErrorCode;
  readonly status: number;
  readonly details?: ErrorDetails;

  protected constructor(code: ApplicationErrorCode, details?: ErrorDetails) {
    const definition = ERROR_DEFINITIONS[code];
    super(definition.message);
    this.name = new.target.name;
    this.code = code;
    this.status = definition.status;
    this.details = details;
  }
}

export class ValidationError extends ApplicationError {
  private constructor(details?: ValidationErrorDetails) {
    super("VALIDATION_ERROR", details);
  }

  static invalidRequest(): ValidationError {
    return new ValidationError();
  }

  static fromZodError(error: ZodError): ValidationError {
    return new ValidationError({
      issues: error.issues.map((issue) => ({
        path: issue.path.map(sanitizePathSegment).join("."),
        type: issue.code,
        message: "Invalid value.",
      })),
    });
  }
}

export class UnauthenticatedError extends ApplicationError {
  constructor() {
    super("UNAUTHENTICATED");
  }
}

export class ForbiddenError extends ApplicationError {
  constructor() {
    super("FORBIDDEN");
  }
}

export class NotFoundError extends ApplicationError {
  constructor() {
    super("NOT_FOUND");
  }
}

export class ConflictError extends ApplicationError {
  constructor() {
    super("CONFLICT");
  }
}

export class ConsentPolicyUpdatedError extends ApplicationError {
  constructor() {
    super("CONSENT_POLICY_UPDATED");
  }
}

export class NotEligibleError extends ApplicationError {
  constructor() {
    super("NOT_ELIGIBLE");
  }
}

export class RetryableError extends ApplicationError {
  constructor() {
    super("RETRYABLE");
  }
}

export class ExternalProviderError extends ApplicationError {
  constructor() {
    super("EXTERNAL_PROVIDER_ERROR");
  }
}

type HttpErrorBody = {
  error: {
    code: string;
    message: string;
    correlationId: string;
    details?: ErrorDetails;
  };
};

export type HttpErrorMapping = {
  status: number;
  body: HttpErrorBody;
};

export function mapApplicationErrorToHttp(
  error: unknown,
  correlationId: string,
): HttpErrorMapping {
  if (error instanceof ApplicationError) {
    const definition = ERROR_DEFINITIONS[error.code];
    const details =
      error instanceof ValidationError
        ? sanitizeValidationDetails(error.details)
        : undefined;

    return {
      status: definition.status,
      body: {
        error: {
          code: error.code,
          message: definition.message,
          correlationId,
          ...(details === undefined ? {} : { details }),
        },
      },
    };
  }

  return {
    status: 500,
    body: {
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
        correlationId,
      },
    },
  };
}
