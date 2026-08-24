import "server-only";

import { notFound } from "next/navigation";

import { NotFoundError } from "@/src/application/errors";
import {
  getRuntimeDatabase,
  type DatabaseExecutor,
} from "@/src/infrastructure/db/runtime.server";

export function getAdminExecutor(): DatabaseExecutor {
  return getRuntimeDatabase().executor;
}

export async function loadAdminPage<T>(loader: () => Promise<T>): Promise<T> {
  try {
    return await loader();
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}
