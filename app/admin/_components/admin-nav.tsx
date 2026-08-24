import Link from "next/link";

const adminSections = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/monitoring", label: "Monitoring" },
  { href: "/admin/institutions", label: "Institutions" },
  { href: "/admin/opportunities", label: "Opportunities" },
  { href: "/admin/sources", label: "Sources" },
  { href: "/admin/articles", label: "Articles" },
  { href: "/admin/notifications", label: "Notifications" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/operations", label: "Operations" },
] as const;

export function AdminNav({ label }: { label: string }) {
  return (
    <nav aria-label={label}>
      <ul className="admin-nav__list">
        {adminSections.map((section) => (
          <li key={section.href}>
            <Link href={section.href}>{section.label}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
