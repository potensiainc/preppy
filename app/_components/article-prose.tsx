export function ArticleProse({
  sanitizedContentHtml,
  articleSlug,
}: Readonly<{ sanitizedContentHtml: string; articleSlug?: string }>) {
  const html = articleSlug
    ? buildArticleReadingContent(sanitizedContentHtml, articleSlug).html
    : sanitizedContentHtml;
  return (
    <div
      className="article-prose"
      dangerouslySetInnerHTML={{
        __html: publicArticleProse(html),
      }}
    />
  );
}
import { publicArticleProse } from "@/src/modules/public/article-copy.server";
import { buildArticleReadingContent } from "@/src/modules/public/article-reading.server";
