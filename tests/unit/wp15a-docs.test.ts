import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("WP-15A operations documentation", () => {
  it("locks the read-only production and dedicated rehearsal contracts", async () => {
    const document = await readFile(
      join(process.cwd(), "docs/15A_PRODUCTION_PREFLIGHT.md"),
      "utf8",
    );
    for (const phrase of [
      "PRODUCTION_DATABASE_URL",
      "transaction_read_only=on",
      "default_transaction_read_only=on",
      "REPEATABLE READ READ ONLY",
      "REHEARSAL_DATABASE_URL",
      "assertDedicatedRehearsalDatabaseUrl",
      "0000",
      "0010",
      "Institution → Opportunity → Source Bindings",
      "second pass",
      "Product signals = 0",
      "CREDENTIALS_UNAVAILABLE",
      "READY_FOR_WP16A",
      "never READY_FOR_PRODUCTION_CUTOVER",
      "Fake Email",
      "Noop/Test Analytics",
      "No production backup",
    ]) {
      expect(document).toContain(phrase);
    }
  });

  it("defines WP-16A handoff without authorizing cutover", async () => {
    const document = await readFile(
      join(process.cwd(), "docs/15A_PRODUCTION_PREFLIGHT.md"),
      "utf8",
    );
    for (const phrase of [
      "backup scope",
      "restore drill",
      "RPO/RTO",
      "observability",
      "kill switches",
      "worker topology",
      "secret isolation",
      "distributed OAuth replay",
      "distributed rate limits",
      "distributed cache replay",
      "Resend live smoke",
      "GA4/GSC production config",
    ]) {
      expect(document).toContain(phrase);
    }
    expect(document).toContain("Production migration: NOT APPROVED");
    expect(document).toContain("Production cutover: NOT APPROVED");
  });
});
