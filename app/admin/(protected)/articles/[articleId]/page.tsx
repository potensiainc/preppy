import { notFound } from "next/navigation";

import { AdminArticleEditor } from "@/app/admin/_components/article-editor";
import {
  AdminPageHeader,
  AdminStateChip,
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
        kicker="Editorial / Article"
        title={data.title}
        description={`Canonical slug: ${data.slug}`}
      />
      <AdminStateChip>{data.status}</AdminStateChip>
      <p>
        <a href={`/admin/articles/${data.id}/preview`}>Preview</a>
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
