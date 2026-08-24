import type {
  ArticleBreadcrumbJsonLd,
  ArticleJsonLd,
} from "@/src/modules/public/seo";
import { serializeJsonLd } from "@/src/modules/public/seo";

export function JsonLd({
  value,
}: Readonly<{ value: ArticleJsonLd | ArticleBreadcrumbJsonLd }>) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(value) }}
    />
  );
}
