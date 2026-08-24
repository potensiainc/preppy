import { AdminPageHeader } from "@/app/admin/_components/read-ui";
import { AdminNewArticleEditor } from "@/app/admin/_components/article-editor";

export default function NewAdminArticlePage() {
  return (
    <div className="admin-page admin-detail-page">
      <AdminPageHeader
        kicker="Editorial / New"
        title="New Article"
        description="Create a bounded Article draft in this protected Admin surface."
      />
      <AdminNewArticleEditor />
    </div>
  );
}
