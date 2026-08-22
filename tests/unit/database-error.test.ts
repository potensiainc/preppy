import { describe, expect, it } from "vitest";

import { ConflictError, RetryableError } from "@/src/application/errors";
import { mapDatabaseError } from "@/src/infrastructure/db/errors";

describe("mapDatabaseError", () => {
  it("maps a unique violation to a safe typed conflict", () => {
    const raw = {
      code: "23505",
      message: "duplicate email secret@example.com",
      constraint_name: "users_email_key",
    };

    const mapped = mapDatabaseError(raw);

    expect(mapped).toBeInstanceOf(ConflictError);
    expect(mapped).toMatchObject({
      code: "CONFLICT",
      status: 409,
      message: "The requested state conflicts with existing data.",
    });
    expect(JSON.stringify(mapped)).not.toContain("secret@example.com");
    expect(JSON.stringify(mapped)).not.toContain("users_email_key");
  });

  it.each(["40001", "40P01"])(
    "maps transient transaction failure %s to a safe retryable error",
    (code) => {
      const mapped = mapDatabaseError({ code, message: "raw SQL details" });

      expect(mapped).toBeInstanceOf(RetryableError);
      expect(mapped).toMatchObject({ code: "RETRYABLE", status: 503 });
      expect(JSON.stringify(mapped)).not.toContain("raw SQL details");
    },
  );

  it("leaves an unknown error opaque for the HTTP mapper", () => {
    const raw = new Error("unknown database failure");
    expect(mapDatabaseError(raw)).toBe(raw);
  });
});
