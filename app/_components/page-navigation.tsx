import Link from "next/link";

const categories = [
  ["", "전체"],
  ["INTERNATIONAL_SCHOOL", "국제학교"],
  ["PRIVATE_ELEMENTARY", "사립초등학교"],
  ["ENGLISH_KINDERGARTEN", "영어유치원"],
] as const;

export function CategoryNavigation({ selected = "" }: { selected?: string }) {
  return (
    <nav className="category-navigation" aria-label="학교·기관 유형">
      {categories.map(([value, label]) => (
        <Link
          key={value}
          href={value ? `/institutions?category=${value}` : "/institutions"}
          aria-current={selected === value ? "page" : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function PageNavigation({
  items,
}: {
  items: { id: string; label: string }[];
}) {
  return (
    <nav className="page-navigation" aria-label="이 페이지 바로가기">
      {items.map(({ id, label }) => (
        <a key={id} href={`#${id}`}>
          {label}
        </a>
      ))}
    </nav>
  );
}
