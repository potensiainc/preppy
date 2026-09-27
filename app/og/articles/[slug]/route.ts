import { getPublicExecutor } from "@/app/_lib/public-page.server";
import { categoryLabel } from "@/app/_lib/presentation";
import { getArticleOgSource } from "@/src/modules/public/article-query.server";
import {
  composeFeaturedOgImage,
  fetchSourceImage,
  ogImageResponse,
  renderTextOgCard,
} from "@/src/modules/public/og-image.server";
import { getSeoAppBaseUrl } from "@/src/modules/public/seo";

export const dynamic = "force-dynamic";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const CACHE_LIMIT = 64;
const cache = new Map<
  string,
  { body: Buffer; type: "image/png" | "image/jpeg" }
>();

function remember(
  key: string,
  value: { body: Buffer; type: "image/png" | "image/jpeg" },
) {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await context.params;
  if (!SLUG.test(slug)) return new Response(null, { status: 404 });
  const article = await getArticleOgSource(getPublicExecutor(), slug);
  if (!article) return new Response(null, { status: 404 });

  const key = `${slug}:${article.updatedAt.getTime()}`;
  const cached = cache.get(key);
  if (cached) return ogImageResponse(cached.body, cached.type);

  if (article.featuredImageUrl) {
    const source = await fetchSourceImage(article.featuredImageUrl);
    if (source) {
      try {
        const body = await composeFeaturedOgImage(source);
        remember(key, { body, type: "image/jpeg" });
        return ogImageResponse(body, "image/jpeg");
      } catch {
        // Unsupported or corrupt source: fall back to the text card.
      }
    }
  }

  const body = await renderTextOgCard({
    eyebrow: `${categoryLabel(article.category)} · 입학 가이드`,
    title: article.title,
    footer: new URL(getSeoAppBaseUrl()).host,
  });
  remember(key, { body, type: "image/png" });
  return ogImageResponse(body, "image/png");
}
