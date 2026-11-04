import { renderPublishedArticleCard } from "@/src/modules/public/article-social-image.server";
import { isSocialImageFormat } from "@/src/modules/public/article-social-image";

export const dynamic = "force-dynamic";

// /articles/<slug>/card.png?format=portrait (1080x1350) | square (1080x1080)
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const requested = new URL(request.url).searchParams.get("format");
  return renderPublishedArticleCard(
    slug,
    isSocialImageFormat(requested) ? requested : "portrait",
  );
}