import {
  ogImageResponse,
  renderLogo,
} from "@/src/modules/public/og-image.server";

export const dynamic = "force-dynamic";

let cached: Buffer | null = null;

export async function GET(): Promise<Response> {
  cached ??= await renderLogo();
  return ogImageResponse(cached, "image/png");
}
