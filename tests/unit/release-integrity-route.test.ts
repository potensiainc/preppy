import { afterEach, describe, expect, it, vi } from "vitest";

const overrides = vi.hoisted(() => new Map<string, string>());

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    readFileSync: (file: Parameters<typeof actual.readFileSync>[0]) => {
      for (const [suffix, content] of overrides) {
        if (String(file).endsWith(suffix)) return Buffer.from(content);
      }
      return actual.readFileSync(file);
    },
  };
});

const { GET } = await import("@/app/api/release-integrity/route");

async function check(environment: Record<string, string | undefined>) {
  for (const [name, value] of Object.entries(environment)) {
    vi.stubEnv(name, value);
  }
  const response = GET();
  return { status: response.status, body: await response.json() };
}

describe("release integrity healthcheck", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    overrides.clear();
  });

  it("passes when the Railway and PREPPY environment names match", async () => {
    await expect(
      check({
        RAILWAY_ENVIRONMENT_NAME: "production",
        PREPPY_ENVIRONMENT: "production",
      }),
    ).resolves.toEqual({
      status: 200,
      body: { status: "ok", service: "preppy-web" },
    });
  });

  it("fails when PREPPY_ENVIRONMENT is missing on a Railway environment", async () => {
    await expect(
      check({
        RAILWAY_ENVIRONMENT_NAME: "production",
        PREPPY_ENVIRONMENT: undefined,
      }),
    ).resolves.toEqual({
      status: 503,
      body: { status: "unavailable", service: "preppy-web" },
    });
  });

  it("fails when PREPPY_ENVIRONMENT names a different environment", async () => {
    const result = await check({
      RAILWAY_ENVIRONMENT_NAME: "production",
      PREPPY_ENVIRONMENT: "staging",
    });
    expect(result.status).toBe(503);
  });

  it("fails when the public header exposes Kakao login", async () => {
    overrides.set(
      "app/_components/site-header.tsx",
      'export function SiteHeader() { return <a href="/auth/kakao/start">카카오 로그인</a>; }',
    );
    const result = await check({
      RAILWAY_ENVIRONMENT_NAME: "staging",
      PREPPY_ENVIRONMENT: "staging",
    });
    expect(result.status).toBe(503);
  });

  it("fails when an approved brand icon changes", async () => {
    overrides.set("app/icon.png", "not the approved icon");
    const result = await check({
      RAILWAY_ENVIRONMENT_NAME: "staging",
      PREPPY_ENVIRONMENT: "staging",
    });
    expect(result.status).toBe(503);
  });
});
