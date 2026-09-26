import "server-only";
import { z } from "zod";
import { assertSameOriginForMutation } from "@/src/modules/auth/origin.server";
import {
  readUserSession,
  USER_SESSION_COOKIE_NAME,
} from "@/src/modules/auth/session.server";
import {
  openSecureCookie,
  sealSecureCookie,
} from "@/src/modules/auth/secure-cookie.server";
export type DeletionStatus = "PENDING" | "COMPLETED";
import { DELETION_RECEIPT_COOKIE } from "@/src/modules/account-deletion/receipt-cookie";
export { DELETION_RECEIPT_COOKIE } from "@/src/modules/account-deletion/receipt-cookie";
export function deletionJson(value: unknown, status = 200, extra?: Headers) {
  const headers = new Headers(extra);
  headers.set("cache-control", "private, no-store");
  headers.set("referrer-policy", "no-referrer");
  return Response.json(value, { status, headers });
}
function cookie(request: Request, name: string) {
  const entry = request.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${name}=`));
  return entry?.slice(name.length + 1) ?? null;
}
const receiptSchema = z.object({ receiptId: z.uuid() }).strict();
export function createDeletionHandlers(deps: {
  enabled: boolean;
  appBaseUrl: string;
  sessionSecret: string;
  receiptSecret: string;
  production?: boolean;
  requireRecentAuthentication?: boolean;
  now?: () => Date;
  request: (
    userId: string,
  ) => Promise<{ receiptId: string; status: DeletionStatus }>;
  status: (receiptId: string) => Promise<DeletionStatus | null>;
}) {
  const getReceipt = (request: Request, now: Date) =>
    receiptSchema.safeParse(
      openSecureCookie(cookie(request, DELETION_RECEIPT_COOKIE), {
        purpose: "deletion-receipt",
        secret: deps.receiptSecret,
        now,
      }),
    );
  return {
    GET: async (request: Request) => {
      if (!deps.enabled)
        return deletionJson({ code: "DELETION_UNAVAILABLE" }, 503);
      const receipt = getReceipt(request, deps.now?.() ?? new Date());
      if (!receipt.success)
        return deletionJson({ code: "UNAUTHENTICATED" }, 401);
      try {
        const status = await deps.status(receipt.data.receiptId);
        return status
          ? deletionJson({ status, receiptId: receipt.data.receiptId })
          : deletionJson({ code: "NOT_FOUND" }, 404);
      } catch {
        return deletionJson({ code: "STATUS_UNAVAILABLE" }, 503);
      }
    },
    POST: async (request: Request) => {
      if (!deps.enabled)
        return deletionJson({ code: "DELETION_UNAVAILABLE" }, 503);
      try {
        assertSameOriginForMutation(request, deps.appBaseUrl);
      } catch {
        return deletionJson({ code: "FORBIDDEN" }, 403);
      }
      const now = deps.now?.() ?? new Date();
      const session = readUserSession(
        cookie(request, USER_SESSION_COOKIE_NAME),
        { secret: deps.sessionSecret, now },
      );
      if (!session) {
        const receipt = getReceipt(request, now);
        if (receipt.success) {
          const status = await deps.status(receipt.data.receiptId);
          if (status)
            return deletionJson(
              { status, receiptId: receipt.data.receiptId },
              status === "COMPLETED" ? 200 : 202,
            );
        }
        return deletionJson({ code: "UNAUTHENTICATED" }, 401);
      }
      if (
        deps.requireRecentAuthentication !== false &&
        (session.oauthAuthenticatedAt === undefined ||
          now.getTime() / 1000 - session.oauthAuthenticatedAt > 600)
      )
        return deletionJson(
          {
            code: "REAUTH_REQUIRED",
            message:
              "계정 소유를 확인하려면 다시 로그인해 주세요. 로그인 후 탈퇴 여부를 다시 확인해요.",
          },
          409,
        );
      try {
        if (
          !z
            .object({ confirm: z.literal(true) })
            .strict()
            .safeParse(await request.json()).success
        )
          return deletionJson({ code: "INVALID_REQUEST" }, 400);
      } catch {
        return deletionJson({ code: "INVALID_REQUEST" }, 400);
      }
      try {
        const result = await deps.request(session.userId);
        const token = sealSecureCookie(
          { receiptId: result.receiptId },
          {
            purpose: "deletion-receipt",
            secret: deps.receiptSecret,
            ttlSeconds: 86400,
            now,
          },
        );
        const headers = new Headers();
        const secure = deps.production ? "; Secure" : "";
        headers.append(
          "set-cookie",
          `${DELETION_RECEIPT_COOKIE}=${token}; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax${secure}`,
        );
        headers.append(
          "set-cookie",
          `${USER_SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`,
        );
        return deletionJson(
          {
            ...result,
            message:
              "탈퇴 요청을 접수했어요. 계정 이용과 새 알림 발송을 중단했어요. 정보 삭제와 카카오 연결 해제를 처리하고 있어요.",
          },
          202,
          headers,
        );
      } catch {
        return deletionJson(
          {
            code: "DELETION_REQUEST_FAILED",
            message:
              "탈퇴 요청을 접수하지 못했어요. 잠시 후 다시 시도해 주세요.",
          },
          503,
        );
      }
    },
  };
}
