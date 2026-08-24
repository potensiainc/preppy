import {
  AdminDataTable,
  AdminEmptyState,
  AdminPageHeader,
  AdminPagination,
  AdminStateChip,
  formatAdminCode,
  formatAdminDate,
} from "@/app/admin/_components/read-ui";
import { getAdminExecutor } from "@/app/admin/_lib/admin-page.server";
import type {
  AdminArticleDTO,
  AdminPageDTO,
} from "@/src/modules/admin/read-model/contracts";
import {
  parseArticleAdminListInput,
  type ArticleAdminListInput,
} from "@/src/modules/admin/read-model/input";
import { listAdminArticles } from "@/src/modules/admin/read-model/article-query.server";

export function AdminArticleListView({
  data,
  query = { page: 1, pageSize: 20 },
}: {
  data: AdminPageDTO<AdminArticleDTO>;
  query?: ArticleAdminListInput;
}) {
  return (
    <div className="admin-page admin-catalog-page">
      <AdminPageHeader
        kicker="Inspection / Articles"
        title="Article ledger"
        description="Publication identity and relation coverage. Body content and editorial controls stay outside this operational surface."
      />
      <section aria-labelledby="article-catalog-heading">
        <div className="admin-section-heading">
          <h2 id="article-catalog-heading">Publication records</h2>
          <AdminStateChip>{data.pagination.total} records</AdminStateChip>
        </div>
        {data.items.length === 0 ? (
          <AdminEmptyState>No Articles match these filters.</AdminEmptyState>
        ) : (
          <AdminDataTable caption="Article publication registry">
            <thead>
              <tr>
                <th scope="col">Article</th>
                <th scope="col">Type</th>
                <th scope="col">Category</th>
                <th scope="col">Status</th>
                <th scope="col">Published</th>
                <th scope="col">Relations</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <th scope="row">
                    {item.title}
                    <span className="admin-record-id">{item.slug}</span>
                  </th>
                  <td>{formatAdminCode(item.type)}</td>
                  <td>{formatAdminCode(item.category)}</td>
                  <td>{formatAdminCode(item.status)}</td>
                  <td>{formatAdminDate(item.publishedAt)}</td>
                  <td>
                    {item.institutionRelationCount} institutions ·{" "}
                    {item.opportunityRelationCount} opportunities
                  </td>
                </tr>
              ))}
            </tbody>
          </AdminDataTable>
        )}
        <AdminPagination
          pagination={data.pagination}
          basePath="/admin/articles"
          query={query}
        />
      </section>
    </div>
  );
}

type NextSearchParams = Record<string, string | string[] | undefined>;

export default async function AdminArticlesPage({
  searchParams,
}: {
  searchParams: Promise<NextSearchParams>;
}) {
  const query = parseArticleAdminListInput(await searchParams);
  const data = await listAdminArticles(getAdminExecutor(), query);
  return <AdminArticleListView data={data} query={query} />;
}
