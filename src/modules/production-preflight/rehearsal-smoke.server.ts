import "server-only";

import { asc, eq } from "drizzle-orm";

import { getOperationalKpiSnapshot } from "@/src/analytics/kpi-query.server";
import { articles, institutions, opportunities, users } from "@/src/db/schema";
import type { RuntimeDatabaseResources } from "@/src/infrastructure/db/runtime.server";
import { getAdminDashboard } from "@/src/modules/admin/read-model/dashboard-query.server";
import { listAdminMonitoringQueue } from "@/src/modules/admin/read-model/monitoring-query.server";
import { listAdminOutbox } from "@/src/modules/admin/read-model/operations-query.server";
import { createUserSessionCookie } from "@/src/modules/auth/session.server";
import { loadMyPreppy } from "@/src/modules/my-preppy/query.server";
import { getArticleBySlug } from "@/src/modules/public/article-query.server";
import { getHomePage } from "@/src/modules/public/home-query.server";
import {
  getInstitutionBySlug,
  listInstitutions,
} from "@/src/modules/public/institution-query.server";
import { getOpportunityBySlug } from "@/src/modules/public/opportunity-query.server";
import { listPublicSitemapEntries } from "@/src/modules/public/sitemap-query.server";

export type RehearsalSmokeResult = {
  result: "PASS";
  home: "PASS";
  institutionList: "PASS";
  institutionDetail: "PASS" | "NO_FIXTURE";
  opportunityDetail: "PASS" | "NO_FIXTURE";
  articleDetail: "PASS" | "NO_FIXTURE";
  myPreppy: "PASS" | "NO_FIXTURE";
  adminDashboard: "PASS";
  adminMonitoring: "PASS";
  adminOperations: "PASS";
  kpi: "PASS";
  sitemap: "PASS";
};

export async function runRehearsalSmoke(
  runtime: RuntimeDatabaseResources,
  options: { now: Date; appBaseUrl: string },
): Promise<RehearsalSmokeResult> {
  const executor = runtime.executor;
  await getHomePage(executor);
  await listInstitutions(executor, { page: 1, pageSize: 1 });
  await getAdminDashboard(executor, { now: options.now });
  await listAdminMonitoringQueue(
    { pageSize: 1 },
    { executor, now: options.now },
  );
  await listAdminOutbox(executor, { pageSize: 1 });
  await getOperationalKpiSnapshot(executor, options.now);
  await listPublicSitemapEntries(executor, options.appBaseUrl);

  const [institution] = await executor.drizzle
    .select({ slug: institutions.slug })
    .from(institutions)
    .where(eq(institutions.publicationState, "PUBLISHED"))
    .orderBy(asc(institutions.slug))
    .limit(1);
  if (institution) await getInstitutionBySlug(executor, institution.slug);

  const [opportunity] = await executor.drizzle
    .select({ slug: opportunities.slug })
    .from(opportunities)
    .where(eq(opportunities.publicationState, "PUBLISHED"))
    .orderBy(asc(opportunities.slug))
    .limit(1);
  if (opportunity) await getOpportunityBySlug(executor, opportunity.slug);

  const [article] = await executor.drizzle
    .select({ slug: articles.slug })
    .from(articles)
    .where(eq(articles.status, "PUBLISHED"))
    .orderBy(asc(articles.slug))
    .limit(1);
  if (article) await getArticleBySlug(executor, article.slug);

  const [user] = await executor.drizzle
    .select({ id: users.id })
    .from(users)
    .where(eq(users.status, "ACTIVE"))
    .orderBy(asc(users.id))
    .limit(1);
  if (user) {
    const sessionSecret = "wp15a-rehearsal-only-session-secret-32-bytes";
    const session = createUserSessionCookie(user.id, {
      secret: sessionSecret,
      now: options.now,
    });
    await loadMyPreppy(session.value, {
      sessionSecret,
      transactionManager: runtime.transactionManager,
      now: options.now,
    });
  }

  return {
    result: "PASS",
    home: "PASS",
    institutionList: "PASS",
    institutionDetail: institution ? "PASS" : "NO_FIXTURE",
    opportunityDetail: opportunity ? "PASS" : "NO_FIXTURE",
    articleDetail: article ? "PASS" : "NO_FIXTURE",
    myPreppy: user ? "PASS" : "NO_FIXTURE",
    adminDashboard: "PASS",
    adminMonitoring: "PASS",
    adminOperations: "PASS",
    kpi: "PASS",
    sitemap: "PASS",
  };
}
