import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AdminShell } from "@/app/admin/_components/admin-shell";
import { UnauthenticatedError } from "@/src/application/errors";
import { requireCurrentAdmin } from "@/src/modules/admin/auth/current-admin.server";

export default async function ProtectedAdminLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  let admin;
  try {
    admin = await requireCurrentAdmin();
  } catch (error) {
    if (error instanceof UnauthenticatedError) redirect("/admin/login");
    throw error;
  }

  return <AdminShell adminName={admin.displayName}>{children}</AdminShell>;
}
