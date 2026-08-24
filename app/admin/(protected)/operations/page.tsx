import Link from "next/link";

import {
  AdminPageHeader,
  AdminStateChip,
} from "@/app/admin/_components/read-ui";
import { getAdminExecutor } from "@/app/admin/_lib/admin-page.server";
import type { AdminHealthDTO } from "@/src/modules/admin/read-model/contracts";
import { getAdminHealth } from "@/src/modules/admin/read-model/health-query.server";

const operationsLinks = [
  {
    href: "/admin/operations/outbox",
    label: "Outbox ledger",
    description: "Event state, attempts, and safe failure codes.",
  },
  {
    href: "/admin/operations/deliveries",
    label: "Delivery aggregates",
    description: "Channel state and bounded attempt summaries.",
  },
  {
    href: "/admin/operations/audit",
    label: "Audit trail",
    description: "Operator actions with a closed metadata summary.",
  },
  {
    href: "/admin/operations/health",
    label: "Health & data quality",
    description: "Database, queue pressure, and integrity warnings.",
  },
] as const;

export function AdminOperationsView({ health }: { health: AdminHealthDTO }) {
  return (
    <div className="admin-page admin-operations-page">
      <AdminPageHeader
        kicker="Inspection / Operations"
        title="Operations control room"
        description="Inspect canonical operational state and use only server-approved, event-aware commands. Ambiguous provider results require explicit reconciliation."
      />
      <section aria-labelledby="operations-status-heading">
        <div className="admin-section-heading">
          <h2 id="operations-status-heading">Current posture</h2>
          <AdminStateChip>{health.status}</AdminStateChip>
        </div>
        <div className="admin-metric-grid">
          <article>
            <p>Database</p>
            <strong>{health.database.status}</strong>
          </article>
          <article>
            <p>Pending events</p>
            <strong>{health.outbox.pending ?? "Unavailable"}</strong>
          </article>
          <article>
            <p>Dead-letter events</p>
            <strong>{health.outbox.deadLetter ?? "Unavailable"}</strong>
          </article>
          <article>
            <p>Integrity warnings</p>
            <strong>
              {health.dataQuality.unavailableCheckCount > 0
                ? "Unavailable"
                : health.dataQuality.warningCount}
            </strong>
          </article>
        </div>
      </section>
      <section aria-labelledby="operations-ledgers-heading">
        <div className="admin-section-heading">
          <h2 id="operations-ledgers-heading">Inspection ledgers</h2>
          <AdminStateChip>Command guarded</AdminStateChip>
        </div>
        <div className="admin-action-grid">
          {operationsLinks.map((item) => (
            <article className="admin-action-card" key={item.href}>
              <h3>{item.label}</h3>
              <p>{item.description}</p>
              <Link href={item.href}>Inspect ledger</Link>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export default async function AdminOperationsPage() {
  const now = new Date();
  const health = await getAdminHealth(getAdminExecutor(), { now });
  return <AdminOperationsView health={health} />;
}
