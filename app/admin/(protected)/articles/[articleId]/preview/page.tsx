import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ArticleProse } from "@/app/_components/article-prose";
import { AdminPageHeader } from "@/app/admin/_components/read-ui";
import { getAdminExecutor } from "@/app/admin/_lib/admin-page.server";
import { getAdminLogoutConfig } from "@/src/modules/admin/auth/config.server";
import { getAdminArticleDetail } from "@/src/modules/admin/read-model/article-query.server";
import type { AdminArticleDetailDTO } from "@/src/modules/admin/read-model/contracts";

export const revalidate = 0;
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export function AdminArticlePreviewView({
  data,
}: Readonly<{ data: AdminArticleDetailDTO }>) {
  return (
    <article className="admin-page admin-article-preview">
      <AdminPageHeader
        kicker="Editorial / Preview"
        title={data.title}
        description="Preview of the persisted sanitized Article body."
      />
      <ArticleProse sanitizedContentHtml={data.sanitizedContentHtml} />
    </article>
  );
}

export default async function AdminArticlePreviewPage({
  params,
}: {
  params: Promise<{ articleId: string }>;
}) {
  const { articleId } = await params;
  const data = await getAdminArticleDetail(
    getAdminExecutor(),
    articleId,
    getAdminLogoutConfig().APP_BASE_URL,
  );
  if (!data) notFound();
  return <AdminArticlePreviewView data={data} />;
}
