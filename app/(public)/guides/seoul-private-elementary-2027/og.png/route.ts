import { renderSocialImage } from "@/src/modules/public/article-social-image";

import { PE_HUB_TITLE } from "../content";

export function GET() {
  return renderSocialImage({
    title: PE_HUB_TITLE,
    eyebrow: "서울 사립초 38개교 · 2027학년도",
  });
}
