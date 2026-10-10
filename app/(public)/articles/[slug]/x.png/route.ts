import { renderPublishedArticleSocialImage } from "@/src/modules/public/article-social-image.server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  return renderPublishedArticleSocialImage(slug, 600);
}
