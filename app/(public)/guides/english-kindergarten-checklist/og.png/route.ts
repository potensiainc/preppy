import { renderArticleSocialImage } from "@/src/modules/public/article-social-image";

import { EK_CHECKLIST_TITLE } from "../content";

export function GET() {
  return renderArticleSocialImage(EK_CHECKLIST_TITLE, 630);
}
