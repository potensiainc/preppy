import { handleAdminCreateArticleRequest } from "@/src/modules/admin/http/article-commands.server";

export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return handleAdminCreateArticleRequest(request);
}
