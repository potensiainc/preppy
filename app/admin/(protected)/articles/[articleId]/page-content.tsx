import { notFound } from "next/navigation";

import { AdminArticleEditor } from "@/app/admin/_components/article-editor";
import {
  AdminPageHeader,
  AdminStateChip,
} from "@/app/admin/_components/read-ui";
import { getAdminExecutor } from "@/app/admin/_lib/admin-page.server";
import { articleStatusLabel } from "@/app/admin/_lib/article-labels";
import { getAdminLogoutConfig } from "@/src/modules/admin/auth/config.server";
import type {
  AdminArticleDetailDTO,
  AdminPageDTO,
  ArticleRelationOptionDTO,
} from "@/src/modules/admin/read-model/contracts";
import {
  getAdminArticleDetail,
  listAdminArticleInstitutionOptions,
  listAdminArticleOpportunityOptions,
} from "@/src/modules/admin/read-model/article-query.server";

const RELATION_OPTION_PAGE_SIZE = 50;
const RELATION_OPTION_MAX_PAGES = 40;

/** Relation pickers search locally, so load every option page (bounded). */
async function loadAllRelationOptions(
  load: (input: {
    page: number;
    pageSize: number;
  }) => Promise<AdminPageDTO<ArticleRelationOptionDTO>>,
): Promise<ArticleRelationOptionDTO[]> {
  const items: ArticleRelationOptionDTO[] = [];
  for (let page = 1; page <= RELATION_OPTION_MAX_PAGES; page += 1) {
    const result = await load({ page, pageSize: RELATION_OPTION_PAGE_SIZE });
    items.push(...result.items);
    if (!result.pagination.hasNext) break;
  }
  return items;
}

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
      <AdminStateChip>{articleStatusLabel(data.status)}</AdminStateChip>
      <p>
        <a
          href={`/admin/articles/${data.id}/preview`}
          target="_blank"
          rel="noopener"
        >
          저장된 내용 미리보기
        </a>
      </p>
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
    loadAllRelationOptions((input) =>
      listAdminArticleInstitutionOptions(executor, input),
    ),
    loadAllRelationOptions((input) =>
      listAdminArticleOpportunityOptions(executor, input),
    ),
  ]);
  if (!data) notFound();
  return (
    <AdminArticleDetailView
      data={data}
      institutionOptions={institutionOptions}
      opportunityOptions={opportunityOptions}
    />
  );
}
