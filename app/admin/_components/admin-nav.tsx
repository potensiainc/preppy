import Link from "next/link";

const adminSections = [
  { href: "/admin", label: "대시보드" },
  { href: "/admin/monitoring", label: "모니터링" },
  { href: "/admin/institutions", label: "기관" },
  { href: "/admin/opportunities", label: "입학정보" },
  { href: "/admin/sources", label: "출처" },
  { href: "/admin/articles", label: "아티클" },
  { href: "/admin/notifications", label: "알림" },
  { href: "/admin/users", label: "회원" },
  { href: "/admin/operations", label: "운영" },
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
