import { describe, it, expect } from "vitest";
import {
  requestDeletion,
  readDeletionStatus,
} from "@/src/modules/account-deletion/client";
const fetchReply = (body: unknown, status: number) => async () =>
  Response.json(body, { status });
describe("account deletion client states", () => {
  it("does not turn accepted work into completed deletion", async () => {
    expect(
      await requestDeletion(
        fetchReply({ status: "PENDING", receiptId: "r" }, 202),
      ),
    ).toEqual({ kind: "pending" });
  });
  it("only shows completed after authoritative status", async () => {
    expect(
      await readDeletionStatus(fetchReply({ status: "COMPLETED" }, 200)),
    ).toEqual({ kind: "completed" });
    expect(
      await readDeletionStatus(fetchReply({ status: "unknown" }, 200)),
    ).toEqual({ kind: "error" });
  });
  it("requires another explicit decision after reauthentication", async () => {
    expect(
      await requestDeletion(fetchReply({ code: "REAUTH_REQUIRED" }, 409)),
    ).toEqual({ kind: "reauth" });
  });
  it("does not claim a failed or malformed request was accepted", async () => {
    expect(await requestDeletion(fetchReply({ message: "ok" }, 503))).toEqual({
      kind: "error",
    });
    expect(
      await requestDeletion(fetchReply({ status: "COMPLETED" }, 202)),
    ).toEqual({ kind: "error" });
    expect(
      await requestDeletion(async () => {
        throw new Error("offline");
      }),
    ).toEqual({ kind: "error" });
  });
  it("leaves missing receipt distinct from unavailable status", async () => {
    expect(
      await readDeletionStatus(fetchReply({ code: "UNAUTHENTICATED" }, 401)),
    ).toEqual({ kind: "none" });
    expect(
      await readDeletionStatus(fetchReply({ code: "STATUS_UNAVAILABLE" }, 503)),
    ).toEqual({ kind: "error" });
  });
});
