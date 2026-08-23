import { describe, expect, it } from "vitest";

import * as collectionRoute from "@/app/api/me/follows/route";
import * as itemRoute from "@/app/api/me/follows/[institutionId]/route";
import * as statusRoute from "@/app/api/me/follows/status/route";

describe("WP-09 exact Follow Route Handler surface", () => {
  it("registers only the documented methods at the exact route modules", () => {
    // Mutation caught: wiring the wrong HTTP verb/path or allowing private handlers to become static.
    expect(collectionRoute.dynamic).toBe("force-dynamic");
    expect(statusRoute.dynamic).toBe("force-dynamic");
    expect(itemRoute.dynamic).toBe("force-dynamic");
    expect(typeof collectionRoute.POST).toBe("function");
    expect(typeof statusRoute.GET).toBe("function");
    expect(typeof itemRoute.DELETE).toBe("function");
    expect("GET" in collectionRoute).toBe(false);
    expect("POST" in statusRoute).toBe(false);
    expect("POST" in itemRoute).toBe(false);
  });
});
