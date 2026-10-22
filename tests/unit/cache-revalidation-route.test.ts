import { afterEach, describe, expect, it, vi } from "vitest";

const handler = vi.hoisted(() =>
  vi.fn(async () => Response.json({ data: { revalidated: true } })),
);

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock("@/src/modules/cache/revalidation-handler.server", () => ({
  handleCacheRevalidationRequest: handler,
}));

const { POST } = await import("@/app/api/internal/cache/revalidate/route");

function request() {
  return new Request("https://preppy.test/api/internal/cache/revalidate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
}

describe("cache revalidation receiver switch", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    handler.mockClear();
  });

  it("rejects before signature checks while cache revalidation is disabled", async () => {
    vi.stubEnv("CACHE_REVALIDATION_ENABLED", "false");
    const response = await POST(request());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: { code: "CACHE_REVALIDATION_DISABLED" },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("treats an invalid switch value as disabled", async () => {
    vi.stubEnv("CACHE_REVALIDATION_ENABLED", "yes");
    expect((await POST(request())).status).toBe(503);
    expect(handler).not.toHaveBeenCalled();
  });

  it("hands enabled requests to the authenticated handler", async () => {
    vi.stubEnv("CACHE_REVALIDATION_ENABLED", "true");
    expect((await POST(request())).status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
