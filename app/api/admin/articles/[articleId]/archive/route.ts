import { handleAdminArchiveArticleRequest } from "@/src/modules/admin/http/article-commands.server";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ articleId: string }> },
): Promise<Response> {
  return handleAdminArchiveArticleRequest(request, await context.params);
}
