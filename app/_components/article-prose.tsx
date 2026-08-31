export function ArticleProse({
  sanitizedContentHtml,
}: Readonly<{ sanitizedContentHtml: string }>) {
  return (
    <div
      className="article-prose"
      dangerouslySetInnerHTML={{
        __html: publicArticleProse(sanitizedContentHtml),
      }}
    />
  );
}
import { publicArticleProse } from "@/src/modules/public/article-copy.server";
