export function ArticleProse({
  sanitizedContentHtml,
}: Readonly<{ sanitizedContentHtml: string }>) {
  return (
    <div
      className="article-prose"
      dangerouslySetInnerHTML={{ __html: sanitizedContentHtml }}
    />
  );
}
