import Link from "next/link";

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
        kicker="조회 / 아티클"
        title="아티클 목록"
        description="발행 상태와 연결 정보를 확인할 수 있어요. 본문 편집은 각 아티클의 편집 화면에서 진행해 주세요."
      />
      <p>
        <Link href="/admin/articles/new">새 아티클</Link>
      </p>
      <section aria-labelledby="article-catalog-heading">
        <div className="admin-section-heading">
          <h2 id="article-catalog-heading">발행 기록</h2>
          <AdminStateChip>{data.pagination.total} 건</AdminStateChip>
        </div>
        {data.items.length === 0 ? (
          <AdminEmptyState>조건에 맞는 아티클이 없어요.</AdminEmptyState>
        ) : (
          <AdminDataTable caption="아티클 발행 목록">
            <thead>
              <tr>
                <th scope="col">아티클</th>
                <th scope="col">유형</th>
                <th scope="col">분류</th>
                <th scope="col">상태</th>
                <th scope="col">발행</th>
                <th scope="col">연결</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <th scope="row">
                    <Link href={`/admin/articles/${item.id}`}>
                      {item.title}
                    </Link>
                    <span className="admin-record-id">{item.slug}</span>
                  </th>
                  <td>{formatAdminCode(item.type)}</td>
                  <td>{formatAdminCode(item.category)}</td>
                  <td>{formatAdminCode(item.status)}</td>
                  <td>{formatAdminDate(item.publishedAt)}</td>
                  <td>
                    {item.institutionRelationCount} 기관 ·{" "}
                    {item.opportunityRelationCount} 입학정보
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
