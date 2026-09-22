import Link from "next/link";

import {
  AdminDataTable,
  AdminEmptyState,
  AdminPageHeader,
  AdminPagination,
  AdminStateChip,
  formatAdminArticleCategory,
  formatAdminArticleStatus,
  formatAdminArticleType,
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
        description="제목이나 주소 이름으로 찾고, 공개 상태와 연결 정보를 바로 확인할 수 있어요."
      />
      <div className="admin-catalog-actions">
        <Link className="admin-button" href="/admin/articles/new">
          새 아티클
        </Link>
      </div>
      <form className="admin-article-filters" method="get">
        <div className="admin-article-filter-grid">
          <label>
            제목 또는 주소 이름
            <input
              type="search"
              name="query"
              defaultValue={query.query ?? ""}
              placeholder="예: KIS 판교"
            />
          </label>
          <label>
            상태
            <select name="status" defaultValue={query.status ?? ""}>
              <option value="">전체 상태</option>
              <option value="DRAFT">초안</option>
              <option value="PUBLISHED">공개 중</option>
              <option value="UNPUBLISHED">발행 취소</option>
              <option value="ARCHIVED">보관</option>
            </select>
          </label>
          <label>
            유형
            <select name="type" defaultValue={query.type ?? ""}>
              <option value="">전체 유형</option>
              <option value="GUIDE">가이드</option>
              <option value="UPDATE">업데이트</option>
              <option value="ROUNDUP">모아보기</option>
            </select>
          </label>
          <label>
            분류
            <select name="category" defaultValue={query.category ?? ""}>
              <option value="">전체 분류</option>
              <option value="ADMISSIONS_GENERAL">입학 일반</option>
              <option value="ENGLISH_KINDERGARTEN">영어유치원</option>
              <option value="PRIVATE_ELEMENTARY">사립초등학교</option>
              <option value="INTERNATIONAL_SCHOOL">국제학교</option>
            </select>
          </label>
        </div>
        <div className="admin-filter-actions">
          <button className="admin-button" type="submit">
            검색
          </button>
          <Link href="/admin/articles">조건 초기화</Link>
        </div>
      </form>
      <section aria-labelledby="article-catalog-heading">
        <div className="admin-section-heading">
          <h2 id="article-catalog-heading">아티클 목록</h2>
          <AdminStateChip>{data.pagination.total} 건</AdminStateChip>
        </div>
        {data.items.length === 0 ? (
          <AdminEmptyState>조건에 맞는 아티클이 없어요.</AdminEmptyState>
        ) : (
          <AdminDataTable caption="아티클 목록">
            <thead>
              <tr>
                <th scope="col">아티클</th>
                <th scope="col">유형</th>
                <th scope="col">분류</th>
                <th scope="col">상태</th>
                <th scope="col">최근 발행</th>
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
                  <td>{formatAdminArticleType(item.type)}</td>
                  <td>{formatAdminArticleCategory(item.category)}</td>
                  <td>
                    <AdminStateChip>
                      {formatAdminArticleStatus(item.status)}
                    </AdminStateChip>
                  </td>
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
