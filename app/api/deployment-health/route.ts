import { NextResponse } from "next/server";

import { hasDeploymentEnvironmentMismatch } from "@/src/config/deployment-environment";

export function GET(): NextResponse {
  if (hasDeploymentEnvironmentMismatch()) {
    return NextResponse.json(
      { status: "misconfigured", service: "preppy" },
      { status: 503 },
    );
  }
  return NextResponse.json({ status: "ok", service: "preppy" });
}
