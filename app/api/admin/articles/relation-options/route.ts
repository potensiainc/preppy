import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";

import { UnauthenticatedError } from "@/src/application/errors";
import { getRuntimeDatabase } from "@/src/infrastructure/db/runtime.server";
import { requireCurrentAdmin } from "@/src/modules/admin/auth/current-admin.server";
import { ADMIN_SESSION_COOKIE_NAME } from "@/src/modules/admin/auth/session.server";
import {
  listAdminArticleInstitutionOptions,
  listAdminArticleOpportunityOptions,
} from "@/src/modules/admin/read-model/article-query.server";
import {
  createAdminErrorResponse,
  privateNoStoreJson,
} from "@/src/modules/admin/http/error-response.server";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const correlationId = randomUUID();
  try {
    const cookieStore = await cookies();
    if (!cookieStore.get(ADMIN_SESSION_COOKIE_NAME)) {
      throw new UnauthenticatedError();
    }
    await requireCurrentAdmin({ cookieStore });
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind");
    const rawQuery = url.searchParams.get("query")?.trim() ?? "";
    if (kind !== "institution" && kind !== "opportunity") {
      return privateNoStoreJson(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "검색할 연결 정보 종류를 확인해 주세요.",
            correlationId,
          },
        },
        400,
      );
    }
    const input = {
      ...(rawQuery === "" ? {} : { query: rawQuery }),
      page: 1,
      pageSize: 20,
    };
    const executor = getRuntimeDatabase().executor;
    const data =
      kind === "institution"
        ? await listAdminArticleInstitutionOptions(executor, input)
        : await listAdminArticleOpportunityOptions(executor, input);
    return privateNoStoreJson({ data }, 200);
  } catch (error) {
    return createAdminErrorResponse(error, correlationId);
  }
}
