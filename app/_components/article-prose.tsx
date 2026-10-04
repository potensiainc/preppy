import { prepareArticleReadingContent } from "@/src/modules/public/article-copy.server";

export function ArticleProse({
  sanitizedContentHtml,
}: Readonly<{ sanitizedContentHtml: string }>) {
  const { bodyHtml, collectedAt, checkedAt } =
    prepareArticleReadingContent(sanitizedContentHtml);
  return (
    <>
      <div
        className="article-prose"
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
      {collectedAt && checkedAt ? (
        <footer className="article-provenance" aria-label="자료 확인 시점">
          <dl>
            <div>
              <dt>자료 수집</dt>
              <dd>{collectedAt}</dd>
            </div>
            <div>
              <dt>내용 확인</dt>
              <dd>{checkedAt}</dd>
            </div>
          </dl>
        </footer>
      ) : null}
    </>
  );
}
