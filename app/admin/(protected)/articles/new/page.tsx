import { AdminPageHeader } from "@/app/admin/_components/read-ui";
import { AdminNewArticleEditor } from "@/app/admin/_components/article-editor";

export default function NewAdminArticlePage() {
  return (
    <div className="admin-page admin-detail-page">
      <AdminPageHeader
        kicker="편집 / 새 아티클"
        title="새 아티클"
        description="관리자 전용 화면에서 아티클 초안을 만들 수 있어요."
      />
      <AdminNewArticleEditor />
    </div>
  );
}
