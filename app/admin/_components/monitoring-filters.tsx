import Link from "next/link";

import type { MonitoringAdminQueueInput } from "@/src/modules/admin/read-model/monitoring-query.server";

const FILTERS = [
  {
    name: "dueState",
    label: "점검 기한 상태",
    values: ["OVERDUE", "DUE", "UPCOMING", "MANUAL"],
  },
  {
    name: "priority",
    label: "우선순위",
    values: ["P0_ACTIVE", "P1_UPCOMING", "P2_WATCH", "P3_PASSIVE"],
  },
  {
    name: "targetType",
    label: "대상 유형",
    values: ["INSTITUTION", "OPPORTUNITY"],
  },
  {
    name: "role",
    label: "연결 역할",
    values: [
      "OFFICIAL_MAIN",
      "ADMISSIONS",
      "TUITION",
      "CURRICULUM",
      "APPLICATION",
      "PRIMARY_NOTICE",
      "DETAILS",
      "SUPPORTING",
      "OTHER",
    ],
  },
  {
    name: "sourceLifecycle",
    label: "출처 상태 관리",
    values: ["DISCOVERED", "ACTIVE", "PAUSED", "RETIRED"],
  },
] as const;

function selected(
  input: MonitoringAdminQueueInput,
  name: (typeof FILTERS)[number]["name"],
  value: string,
): boolean {
  const values = input[name] as readonly string[] | undefined;
  return values?.includes(value) ?? false;
}

export function MonitoringFilters({
  query,
}: {
  query: MonitoringAdminQueueInput;
}) {
  return (
    <form className="admin-monitoring-filters" method="get">
      <input type="hidden" name="pageSize" value={query.pageSize} />
      <div className="admin-filter-grid">
        {FILTERS.map((filter) => {
          const descriptionId = `monitoring-${filter.name}-description`;
          return (
            <label key={filter.name} htmlFor={`monitoring-${filter.name}`}>
              <span>{filter.label}</span>
              <select
                id={`monitoring-${filter.name}`}
                name={filter.name}
                multiple
                aria-describedby={descriptionId}
                defaultValue={filter.values.filter((value) =>
                  selected(query, filter.name, value),
                )}
              >
                {filter.values.map((value) => (
                  <option key={value} value={value}>
                    {value.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
              <small id={descriptionId}>
                필요한 항목을 선택해 주세요. 선택하지 않으면 전체를 조회해요.
              </small>
            </label>
          );
        })}
      </div>
      <div className="admin-filter-actions">
        <button className="admin-button" type="submit">
          필터 적용
        </button>
        <Link href="/admin/monitoring">필터 초기화</Link>
      </div>
    </form>
  );
}
