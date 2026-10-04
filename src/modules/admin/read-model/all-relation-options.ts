import type { AdminPageDTO, ArticleRelationOptionDTO } from "./contracts";

// The editor saves the complete selection, so every institution must be reachable.
export async function loadAllRelationOptions(
  loadPage: (input: {
    page: number;
    pageSize: number;
  }) => Promise<AdminPageDTO<ArticleRelationOptionDTO>>,
): Promise<readonly ArticleRelationOptionDTO[]> {
  const pageSize = 50;
  const first = await loadPage({ page: 1, pageSize });
  const options = new Map(first.items.map((item) => [item.id, item]));
  const pageCount = Math.ceil(first.pagination.total / pageSize);
  for (let page = 2; page <= pageCount; page += 1) {
    const result = await loadPage({ page, pageSize });
    for (const item of result.items) options.set(item.id, item);
  }
  return [...options.values()];
}
