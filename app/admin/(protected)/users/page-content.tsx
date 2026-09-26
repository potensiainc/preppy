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
  AdminPageDTO,
  AdminUserDTO,
} from "@/src/modules/admin/read-model/contracts";
import {
  parseUserAdminListInput,
  type UserAdminListInput,
} from "@/src/modules/admin/read-model/input";
import { listAdminUsers } from "@/src/modules/admin/read-model/user-query.server";

export function AdminUserListView({
  data,
  query = { page: 1, pageSize: 20 },
}: {
  data: AdminPageDTO<AdminUserDTO>;
  query?: UserAdminListInput;
}) {
  return (
    <div className="admin-page admin-catalog-page">
      <AdminPageHeader
        kicker="조회 / 회원"
        title="회원 지원 목록"
        description="회원 상태, 관심 목록, 이메일 발송 준비 상태를 확인해요. 로그인 제공자 정보와 가족 개인정보는 노출하지 않아요."
      />
      <section aria-labelledby="user-catalog-heading">
        <div className="admin-section-heading">
          <h2 id="user-catalog-heading">회원 지원 기록</h2>
          <AdminStateChip>{data.pagination.total} 건</AdminStateChip>
        </div>
        {data.items.length === 0 ? (
          <AdminEmptyState>조건에 맞는 회원이 없어요.</AdminEmptyState>
        ) : (
          <AdminDataTable caption="개인정보를 최소화한 회원 지원 목록">
            <thead>
              <tr>
                <th scope="col">회원 ID</th>
                <th scope="col">상태</th>
                <th scope="col">생성</th>
                <th scope="col">관심 목록</th>
                <th scope="col">이메일 발송 준비</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <th scope="row">{item.id}</th>
                  <td>{formatAdminCode(item.status)}</td>
                  <td>{formatAdminDate(item.createdAt)}</td>
                  <td>{item.followCount}</td>
                  <td>{formatAdminCode(item.emailReadiness)}</td>
                </tr>
              ))}
            </tbody>
          </AdminDataTable>
        )}
        <AdminPagination
          pagination={data.pagination}
          basePath="/admin/users"
          query={query}
        />
      </section>
    </div>
  );
}

type NextSearchParams = Record<string, string | string[] | undefined>;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<NextSearchParams>;
}) {
  const query = parseUserAdminListInput(await searchParams);
  const data = await listAdminUsers(getAdminExecutor(), query);
  return <AdminUserListView data={data} query={query} />;
}
