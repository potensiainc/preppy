import "server-only";

import { ConflictError } from "@/src/application/errors";
import { mapDatabaseError } from "@/src/infrastructure/db/errors";

function databaseErrorCode(error: unknown): string | undefined {
  let current = error;
  const visited = new Set<unknown>();

  while (
    typeof current === "object" &&
    current !== null &&
    !visited.has(current)
  ) {
    visited.add(current);
    if (
      "code" in current &&
      typeof current.code === "string" &&
      current.code.length > 0
    ) {
      return current.code;
    }
    current = "cause" in current ? current.cause : undefined;
  }

  return undefined;
}

export function mapFollowDatabaseError(error: unknown): unknown {
  const code = databaseErrorCode(error);
  if (code?.startsWith("23")) return new ConflictError();
  return mapDatabaseError(error);
}
