import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { SignupCancellationControl } from "@/app/(public)/onboarding/signup-cancellation-control";
import { describe, expect, it, vi } from "vitest";
import { requestSignupCancellation } from "@/app/(public)/onboarding/signup-cancellation";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe("signup cancellation response handling", () => {
  it.each([
    [202, "PENDING"],
    [200, "COMPLETED"],
  ])("accepts verified receipt response %s %s", async (status, state) => {
    const fetcher = vi.fn(async () =>
      Response.json({ status: state }, { status: Number(status) }),
    );
    expect(await requestSignupCancellation(fetcher)).toBe(true);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/auth/onboarding/cancel",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ confirm: true }),
      }),
    );
  });
  it.each([
    [503, { status: "PENDING" }],
    [202, {}],
    [200, { status: "UNKNOWN" }],
  ])("does not claim cancellation for %s", async (status, body) => {
    expect(
      await requestSignupCancellation(async () =>
        Response.json(body, { status: Number(status) }),
      ),
    ).toBe(false);
  });
  it("does not claim completion after an ambiguous connection failure", async () => {
    expect(
      await requestSignupCancellation(async () => {
        throw new Error("lost response");
      }),
    ).toBe(false);
  });
});

describe("signup cancellation availability", () => {
  it("offers a contact path without an unusable button when disabled", () => {
    const $ = load(
      renderToStaticMarkup(
        createElement(SignupCancellationControl, { enabled: false }),
      ),
    );
    expect($("button")).toHaveLength(0);
    expect($("a[href='mailto:potensiainc@gmail.com']")).toHaveLength(1);
  });
  it("offers an independent non-submit control without required consent fields", () => {
    const $ = load(
      renderToStaticMarkup(
        createElement(SignupCancellationControl, { enabled: true }),
      ),
    );
    expect($("button[type=button]")).toHaveLength(1);
    expect($("input[required]")).toHaveLength(0);
    expect($("form")).toHaveLength(0);
  });
});
