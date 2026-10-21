import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("DB integration test contract", () => {
  it("runs integration suites one file at a time against the shared test DB", () => {
    const scripts = JSON.parse(read("package.json")).scripts as Record<
      string,
      string
    >;
    expect(scripts["test:db"]).toBe(
      "vitest run tests/integration --no-file-parallelism",
    );
  });

  it("checks every pull request with a real PostgreSQL integration job", () => {
    const workflow = read(".github/workflows/public-release-guard.yml");
    expect(workflow).toContain("  db-integration:");
    expect(workflow).toContain("image: postgres:16-alpine");
    expect(workflow).toContain(
      "TEST_DATABASE_URL: postgres://preppy:preppy@127.0.0.1:5432/preppy_test",
    );
    expect(workflow).toContain("- run: npm run test:db");
    expect(workflow).toMatch(/pull_request:\n\s+branches: \[main\]/);
  });
});
