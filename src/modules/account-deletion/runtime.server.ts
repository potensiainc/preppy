import "server-only";
import { getRuntimeDatabase } from "@/src/infrastructure/db/runtime.server";
import { getAuthConfig } from "@/src/modules/auth/config.server";
import { createDeletionHandlers, deletionJson } from "./http.server";
import {
  accountDeletionStatus,
  requestAccountDeletion,
  eraseRequestedLocalAccount,
} from "./repository.server";
import { deletionKey } from "./crypto.server";
import { isAccountDeletionSchemaReady } from "./readiness.server";
export function isAccountDeletionEnabled() {
  return (
    process.env.ACCOUNT_DELETION_ENABLED === "true" &&
    process.env.ACCOUNT_DELETION_READINESS === "verified"
  );
}
// The flag says the owner wants the feature; the schema check proves the
// database can actually run it.
export async function isAccountDeletionAvailable(): Promise<boolean> {
  if (!isAccountDeletionEnabled()) return false;
  try {
    return await isAccountDeletionSchemaReady(getRuntimeDatabase().executor);
  } catch {
    return false;
  }
}

export async function deletionRoute(request: Request, method: "GET" | "POST") {
  if (!(await isAccountDeletionAvailable()))
    return deletionJson({ code: "DELETION_UNAVAILABLE" }, 503);
  try {
    const secret = process.env.ACCOUNT_DELETION_KEY ?? "";
    deletionKey(secret);
    const receiptSecret = process.env.ACCOUNT_DELETION_RECEIPT_SECRET ?? "";
    if (receiptSecret.length < 32) throw new Error("RECEIPT_CONFIGURATION");
    const auth = getAuthConfig();
    const db = getRuntimeDatabase();
    return await createDeletionHandlers({
      enabled: true,
      appBaseUrl: auth.APP_BASE_URL,
      sessionSecret: auth.USER_SESSION_SECRET,
      receiptSecret,
      production: process.env.NODE_ENV === "production",
      request: (userId) => requestAccountDeletion(db, userId, secret),
      status: (id) => accountDeletionStatus(db, id),
    })[method](request);
  } catch {
    return deletionJson({ code: "DELETION_UNAVAILABLE" }, 503);
  }
}

export async function pendingCancellationRoute(request: Request) {
  if (!(await isAccountDeletionAvailable()))
    return deletionJson({ code: "DELETION_UNAVAILABLE" }, 503);
  try {
    const secret = process.env.ACCOUNT_DELETION_KEY ?? "";
    deletionKey(secret);
    const receiptSecret = process.env.ACCOUNT_DELETION_RECEIPT_SECRET ?? "";
    if (receiptSecret.length < 32) throw new Error("RECEIPT_CONFIGURATION");
    const auth = getAuthConfig();
    const db = getRuntimeDatabase();
    return await createDeletionHandlers({
      enabled: true,
      requireRecentAuthentication: false,
      appBaseUrl: auth.APP_BASE_URL,
      sessionSecret: auth.USER_SESSION_SECRET,
      receiptSecret,
      production: process.env.NODE_ENV === "production",
      request: async (userId) => {
        const result = await requestAccountDeletion(
          db,
          userId,
          secret,
          "CANCEL",
        );
        try {
          await eraseRequestedLocalAccount(db, result.receiptId);
        } catch {
          /* Durable job remains pending and worker retries. Never claim erased here. */
        }
        return result;
      },
      status: (id) => accountDeletionStatus(db, id),
    }).POST(request);
  } catch {
    return deletionJson({ code: "DELETION_UNAVAILABLE" }, 503);
  }
}
