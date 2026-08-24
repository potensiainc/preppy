import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { runLogout } from "@/app/_components/auth-control";
import { runMyPreppyUnfollow } from "@/app/(public)/my-preppy/unfollow-control";

const institutionId = "550e8400-e29b-41d4-a716-446655440000";

describe("WP-09 private lifecycle transitions", () => {
  it("replaces private history entries for logout and 401 reauthentication", () => {
    const authSource = readFileSync(
      resolve(process.cwd(), "app/_components/auth-control.tsx"),
      "utf8",
    );
    const unfollowSource = readFileSync(
      resolve(process.cwd(), "app/(public)/my-preppy/unfollow-control.tsx"),
      "utf8",
    );

    expect(authSource).toContain("window.location.replace(");
    expect(authSource).not.toContain("window.location.assign(");
    expect(unfollowSource).toContain("window.location.replace(");
    expect(unfollowSource).not.toContain("window.location.assign(");
  });

  it("hard-navigates away from private DOM only after authoritative logout 204", async () => {
    const navigate = vi.fn();
    await runLogout(
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
      navigate,
    );
    expect(navigate).toHaveBeenCalledWith("/");

    const failedNavigate = vi.fn();
    await expect(
      runLogout(
        vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
        failedNavigate,
      ),
    ).rejects.toThrow();
    expect(failedNavigate).not.toHaveBeenCalled();
  });

  it.each([
    [401, "reauthenticate"],
    [403, "reauthorize"],
    [404, "refresh"],
  ] as const)(
    "classifies authoritative unfollow %s as %s",
    async (status, expected) => {
      const transitions = {
        committed: vi.fn(),
        reauthenticate: vi.fn(),
        reauthorize: vi.fn(),
        refresh: vi.fn(),
      };
      await expect(
        runMyPreppyUnfollow(
          institutionId,
          vi.fn().mockResolvedValue(new Response(null, { status })),
          transitions,
        ),
      ).resolves.toBe(expected);
      expect(transitions[expected]).toHaveBeenCalledTimes(1);
      for (const [name, callback] of Object.entries(transitions)) {
        if (name !== expected) expect(callback).not.toHaveBeenCalled();
      }
    },
  );

  it("keeps 503 retryable without navigating, refreshing, or claiming commit", async () => {
    const transitions = {
      committed: vi.fn(),
      reauthenticate: vi.fn(),
      reauthorize: vi.fn(),
      refresh: vi.fn(),
    };
    await expect(
      runMyPreppyUnfollow(
        institutionId,
        vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
        transitions,
      ),
    ).rejects.toThrow("retryable");
    for (const callback of Object.values(transitions)) {
      expect(callback).not.toHaveBeenCalled();
    }
  });
});
