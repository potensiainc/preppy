import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

function dbLessBuildEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "production",
    APP_BASE_URL: "https://build-remediation.example",
    WORKER_ENABLED: "false",
    EMAIL_SEND_ENABLED: "false",
    ANALYTICS_ENABLED: "false",
    CACHE_REVALIDATION_ENABLED: "false",
  };
  delete environment.DATABASE_URL;
  delete environment.TEST_DATABASE_URL;
  delete environment.PRODUCTION_DATABASE_URL;
  delete environment.DATABASE_MAX_CONNECTIONS;
  return environment;
}

describe("WP-15B DB-less production build", () => {
  it("builds without any runtime, test, or production database URL", () => {
    const nextEnvironmentPath = resolve("next-env.d.ts");
    const originalNextEnvironment = readFileSync(nextEnvironmentPath);
    const windowsNpmCli = resolve(
      dirname(process.execPath),
      "node_modules/npm/bin/npm-cli.js",
    );
    let result: ReturnType<typeof spawnSync>;
    try {
      result = spawnSync(
        process.platform === "win32" ? process.execPath : "npm",
        process.platform === "win32"
          ? [windowsNpmCli, "run", "build"]
          : ["run", "build"],
        {
          cwd: resolve("."),
          env: dbLessBuildEnvironment(),
          encoding: "utf8",
          timeout: 120_000,
          windowsHide: true,
        },
      );
    } finally {
      writeFileSync(nextEnvironmentPath, originalNextEnvironment);
    }
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;

    expect(result.error, output).toBeUndefined();
    expect(result.signal, output).toBeNull();
    expect(result.status, output).toBe(0);
    expect(output).toContain("ƒ /sitemap.xml");
  }, 130_000);
});
