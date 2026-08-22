import { ConflictError, RetryableError } from "@/src/application/errors";

function databaseErrorCode(error: unknown): string | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }

  return undefined;
}

export function mapDatabaseError(error: unknown): unknown {
  switch (databaseErrorCode(error)) {
    case "23505":
      return new ConflictError();
    case "40001":
    case "40P01":
      return new RetryableError();
    default:
      return error;
  }
}
