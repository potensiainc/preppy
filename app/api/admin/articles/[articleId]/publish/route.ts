import { handleAdminPublishArticleRequest } from "@/src/modules/admin/http/article-commands.server";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ articleId: string }> },
): Promise<Response> {
  return handleAdminPublishArticleRequest(request, await context.params);
}
