import type { AdminCommandContext } from "@/src/application/context";
import type { AdminPrincipal } from "@/src/modules/admin/auth/repository.server";

export type AdminCommandExecutionInput<TPath, TBody> = Readonly<{
  principal: AdminPrincipal;
  path: TPath;
  body: TBody;
  context: AdminCommandContext;
}>;

export type AdminCommandSuccessEnvelope<TResult> = Readonly<{
  data: TResult;
  correlationId: string;
}>;

export type AdminCommandErrorEnvelope = Readonly<{
  error: {
    code: string;
    message: string;
    correlationId: string;
    details?: unknown;
  };
}>;
