import { readFileSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

import { assertBrandIcons } from "@/scripts/deploy/assert-brand-icons.mjs";
import { assertHeaderAuthAbsence } from "@/scripts/deploy/assert-header-auth-absence.mjs";
import { hasDeploymentEnvironmentMismatch } from "@/src/config/deployment-environment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  try {
    if (hasDeploymentEnvironmentMismatch())
      throw new Error("Environment mismatch");
    const read = (name: string) =>
      readFileSync(path.join(/* turbopackIgnore: true */ process.cwd(), name));
    assertBrandIcons(read);
    for (const [name, file] of [
      ["shared site header", "app/_components/site-header.tsx"],
      ["commute header", "public/commute/index.html"],
    ]) {
      assertHeaderAuthAbsence(name, read(file).toString("utf8"));
    }
    return NextResponse.json(
      { status: "ok", service: "preppy-web" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { status: "unavailable", service: "preppy-web" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
