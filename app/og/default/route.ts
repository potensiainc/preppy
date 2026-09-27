import {
  ogImageResponse,
  renderTextOgCard,
} from "@/src/modules/public/og-image.server";
import { getSeoAppBaseUrl } from "@/src/modules/public/seo";

export const dynamic = "force-dynamic";

let cached: Buffer | null = null;

export async function GET(): Promise<Response> {
  cached ??= await renderTextOgCard({
    eyebrow: "영어유치원 · 사립초 · 국제학교",
    title: "입학정보, 아직도 일일이 찾아보고 계신가요?",
    footer: new URL(getSeoAppBaseUrl()).host,
  });
  return ogImageResponse(cached, "image/png");
}
