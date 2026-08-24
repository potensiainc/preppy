import { MonitoringDetail } from "@/app/admin/_components/monitoring-detail";
import {
  getAdminExecutor,
  loadAdminPage,
} from "@/app/admin/_lib/admin-page.server";
import { getAdminMonitoringDetail } from "@/src/modules/admin/read-model/monitoring-detail-query.server";
import { parseMonitoringAdminDetailInput } from "@/src/modules/admin/read-model/monitoring-query.server";

type MonitoringRouteParams = Readonly<{
  targetType: string;
  targetId: string;
  sourceId: string;
  role: string;
}>;

export default async function AdminMonitoringDetailPage({
  params,
}: {
  params: Promise<MonitoringRouteParams>;
}) {
  const input = parseMonitoringAdminDetailInput(await params);
  const detail = await loadAdminPage(() =>
    getAdminMonitoringDetail(getAdminExecutor(), input, { now: new Date() }),
  );
  return <MonitoringDetail detail={detail} />;
}
