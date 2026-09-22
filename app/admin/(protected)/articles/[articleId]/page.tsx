import { notFound } from "next/navigation";

import { AdminArticleEditor } from "@/app/admin/_components/article-editor";
import {
  AdminPageHeader,
  AdminStateChip,
  formatAdminArticleCategory,
  formatAdminArticleStatus,
  formatAdminArticleType,
  formatAdminDate,
} from "@/app/admin/_components/read-ui";
import { getAdminExecutor } from "@/app/admin/_lib/admin-page.server";
import { getAdminLogoutConfig } from "@/src/modules/admin/auth/config.server";
import type {
  AdminArticleDetailDTO,
  ArticleRelationOptionDTO,
} from "@/src/modules/admin/read-model/contracts";
import {
  getAdminArticleDetail,
  listAdminArticleInstitutionOptions,
  listAdminArticleOpportunityOptions,
} from "@/src/modules/admin/read-model/article-query.server";

export function AdminArticleDetailView({
  data,
  institutionOptions,
  opportunityOptions,
}: Readonly<{
  data: AdminArticleDetailDTO;
  institutionOptions: readonly ArticleRelationOptionDTO[];
  opportunityOptions: readonly ArticleRelationOptionDTO[];
}>) {
  return (
    <div className="admin-page admin-detail-page">
      <AdminPageHeader
        kicker="편집 / 아티클"
        title={data.title}
        description={`주소 이름(slug): ${data.slug}`}
      />
      <section className="admin-article-summary" aria-label="아티클 상태 요약">
        <dl>
          <div>
            <dt>상태</dt>
            <dd>
              <AdminStateChip>
                {formatAdminArticleStatus(data.status)}
              </AdminStateChip>
            </dd>
          </div>
          <div>
            <dt>유형과 분류</dt>
            <dd>
              {formatAdminArticleType(data.type)} ·{" "}
              {formatAdminArticleCategory(data.category)}
            </dd>
          </div>
          <div>
            <dt>마지막 저장</dt>
            <dd>{formatAdminDate(data.updatedAt)}</dd>
          </div>
          <div>
            <dt>연결 정보</dt>
            <dd>
              기관 {data.institutionRelationCount}곳 · 입학정보{" "}
              {data.opportunityRelationCount}건
            </dd>
          </div>
        </dl>
        <div className="admin-article-summary__links">
          <a href={`/admin/articles/${data.id}/preview`}>
            저장된 내용 미리보기
          </a>
          {data.status === "PUBLISHED" ? (
            <a
              href={`/articles/${data.slug}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              공개 페이지
            </a>
          ) : (
            <span>공개 페이지 없음</span>
          )}
        </div>
      </section>
      <AdminArticleEditor
        article={data}
        institutionOptions={institutionOptions}
        opportunityOptions={opportunityOptions}
      />
    </div>
  );
}

export default async function AdminArticleDetailPage({
  params,
}: {
  params: Promise<{ articleId: string }>;
}) {
  const { articleId } = await params;
  const executor = getAdminExecutor();
  const [data, institutionOptions, opportunityOptions] = await Promise.all([
    getAdminArticleDetail(
      executor,
      articleId,
      getAdminLogoutConfig().APP_BASE_URL,
    ),
    listAdminArticleInstitutionOptions(executor, { page: 1, pageSize: 50 }),
    listAdminArticleOpportunityOptions(executor, { page: 1, pageSize: 50 }),
  ]);
  if (!data) notFound();
  return (
    <AdminArticleDetailView
      data={data}
      institutionOptions={institutionOptions.items}
      opportunityOptions={opportunityOptions.items}
    />
  );
}
