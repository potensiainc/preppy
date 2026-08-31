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
        kicker="편집 / 미리보기"
        title={data.title}
        description="저장된 아티클 본문을 미리 보여줘요. 안전하지 않은 HTML 요소는 저장 시 제거돼요."
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
